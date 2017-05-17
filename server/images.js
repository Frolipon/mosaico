'use strict';

const fs              = require('fs')
const url             = require('url')
const path            = require('path')
const gm              = require('gm').subClass({imageMagick: true})
const sharp           = require('sharp')
const createError     = require('http-errors')
const util            = require('util')
const stream          = require('stream')
const probe           = require('probe-image-size')
const Gifsicle        = require('gifsicle-stream')
const { duration }    = require('moment')
const {
  green,
  red,
  bgGreen, }          =  require('chalk')

const config          = require('./config')
const {
  streamImage,
  writeStream,
  list,
  parseMultipart, }   = require('./filemanager')
const { Cacheimages } = require('./models')

console.log('[IMAGES] config.images.cache', config.images.cache)

//////
// OLD IMAGE HANDLING
//////

// Check logs on march
// if no more `[IMAGE] old url for path` => remove
function handleOldImageUrl(req, res, next) {
  if (!req.query.src)     return next( createError(404) )
  if (!req.query.method)  return next( createError(404) )
  let imageName = /([^/]*)$/.exec( req.query.src )
  if (!imageName[1])      return next( createError(404) )
  imageName       = imageName[1]
  const method    = req.query.method
  const sizes     = req.query.params ? req.query.params.split(',') : [0, 0]
  const width     = sizes[0]
  const height    = sizes[1]
  console.warn(`[IMAGE] old url for path ${req.originalUrl}`)
  return res.redirect(308, `/${method}/${width}x${height}/${imageName}`)
}

//////
// IMAGE UTILS
//////

let cacheControl  = config.isDev ? duration( 30, 'minutes') : duration( 1, 'years')
cacheControl      = cacheControl.asSeconds()

// TODO better handling of Cache-Control
// => what happend when somebody reupload an image with the same name?
// https://devcenter.heroku.com/articles/increasing-application-performance-with-http-cache-headers#http-cache-headers
function addCacheControl(res) {
  if (!config.images.cache) return
  res.set('Cache-Control', `public, max-age=${ cacheControl }`)
}

function getTargetDimensions(sizes) {
  sizes = sizes.split('x')
  sizes = sizes.map( s => s === 'null' ? null : ~~s )
  return sizes
}

function needResize(value, width, height) {
  if (!value) return true
  const sameWidth   = value.width === width
  const sameHeight  = value.height === height
  if (sameWidth && sameHeight)  return false
  if (!width && sameHeight)     return false
  if (!height && sameWidth )    return false
  return true
}

const handleFileStreamError = next => err => {
  console.log( red('read stream error') )
  // Local => ENOENT || S3 => NoSuchKey
  const isNotFound = err.code === 'ENOENT' || err.code === 'NoSuchKey'
  if (isNotFound) return next( createError(404) )
  next(err)
}

const onWriteResizeEnd = datas => () => {
  const { path, name, imageName, } = datas

  // save in DB for cataloging
  new Cacheimages({
    path,
    name,
    imageName,
  })
  .save()
  .then( ci => console.log( green('cache image infos saved in DB', path )) )
  .catch( e => {
    console.log( red(`[IMAGE] can't save cache image infos in DB`), path )
    console.log( util.inspect( e ) )
  })

}

// transform /cover/100x100/filename.jpg => cover_100x100_filename.jpg
const getResizedImageName = path => {
  return path.replace( /^\// , '' ).replace( /\//g , '_' )
}

const onWriteResizeError = path => e => {
  console.log(`[IMAGE] can't upload resize/placeholder result`, path)
  console.log( util.inspect( e ) )
}

// sharp's pipeline are different from usual streams
function handleSharpStream(req, res, next, pipeline) {
  const { path }      = req
  const { imageName } = req.params

  // prepare sending to response
  pipeline.clone().pipe( res )

  // prepare sending to cache
  if (config.images.cache) {
    const name          = getResizedImageName( req.path )

    writeStream( pipeline.clone(), name )
    .then( onWriteResizeEnd({ path, name, imageName, }) )
    .catch( onWriteResizeError(path) )
  }
  // flow readstream into the pipeline!
  // this has to be done after of course :D
  streamImage( imageName ).pipe( pipeline )
}

// unlike sharp, no .clone() method
// do it in a “standard” way
const handleGifStream = (req, res, next, gifProcessor) => {
  const { path }      = req
  const { imageName } = req.params

  const resizedStream     = streamImage( imageName ).pipe( gifProcessor )
  const streamForResponse = resizedStream.pipe( new stream.PassThrough() )

  streamForResponse.pipe( res )

  if (!config.images.cache) return

  const streamForSave     = resizedStream.pipe( new stream.PassThrough() )
  const name              = getResizedImageName( path )

  writeStream( streamForSave, name )
  .then( onWriteResizeEnd({path, name, imageName}) )
  .catch( onWriteResizeError(path) )

}

const bareStreamToResponse = (req, res, next) => imageName => {
  const imageStream = streamImage( imageName )
  imageStream.on('error', handleFileStreamError(next) )
  // We have to end stream manually on res stream error (can happen if user close connection before end)
  // If not done, we will have a memory leaks
  // https://groups.google.com/d/msg/nodejs/wtmIzV0lh8o/cz3wqBtDc-MJ
  // https://groups.google.com/forum/#!topic/nodejs/A8wbaaPmmBQ
  imageStream.once('readable', e => {
    addCacheControl( res )
    imageStream
    .pipe( res )
    // response doens't have a 'close' event but a finish one
    // this shouldn't be usefull because at this point stream would be entirely consumed and released
    .on('finish', imageStream.destroy.bind(imageStream) )
    // this is mandatory
    .on('error', imageStream.destroy.bind(imageStream) )
  })
}

//////
// IMAGE CHECKS
//////

// TODO gif can be optimized by using image-min
// https://www.npmjs.com/package/image-min

// Sharp can print harmless warn messages:
// =>   vips warning: VipsJpeg: error reading resolution
// https://github.com/lovell/sharp/issues/657

function checkImageCache(req, res, next) {
  if (!config.images.cache) return next()

  const { path } = req
  Cacheimages
  .findOne( { path } )
  .lean()
  .then( onCacheimage )
  .catch( e => {
    console.log('[CHECKSIZES] error in image cache check')
    console.log( util.inspect(e) )
    next()
  } )

  function onCacheimage( cacheInformations ) {
    if (cacheInformations === null) return next()
    console.log( bgGreen.black(path), 'already in cache' )
    bareStreamToResponse(req, res, next)( cacheInformations.name )
  }

}

function checkSizes(req, res, next) {
  const [ width, height ] = getTargetDimensions( req.params.sizes )
  const { imageName }     = req.params
  // console.log('[CHECKSIZES]', imageName, { width, height } )
  const imgStream         = streamImage( imageName )

  probe( imgStream )
  .then( imageDatas => {
    // abort connection;
    // https://github.com/nodeca/probe-image-size/blob/master/README.md#example
    imgStream.destroy()
    if ( !needResize( imageDatas, width, height ) ) {
      return bareStreamToResponse( req, res, next )( imageName )
    }

    req.imageDatas  = imageDatas
    res.set('Content-Type', imageDatas.mime )

    next()
  })
  .catch( handleFileStreamError( next ) )
}

function read(req, res, next) {
  const { imageName }   = req.params
  bareStreamToResponse(req, res, next)( imageName )
}

//////
// IMAGE GENERATION
//////

function resize(req, res, next) {
  const { imageDatas }    = req
  const { path }          = req
  const { imageName }     = req.params
  const [ width, height ] = getTargetDimensions( req.params.sizes )

  addCacheControl( res )

  // Sharp can't handle animated gif
  if ( imageDatas.type !== 'gif' ) {
    const pipeline = sharp().resize( width, height )
    return handleSharpStream(req, res, next, pipeline)
  }

  const resizeFit     = ['--resize-fit']
  resizeFit.push( `${ width ? width : '_' }x${ height ? height : '_' }` )
  const gifProcessor  = new Gifsicle([...resizeFit, '--resize-colors', '64'])

  return handleGifStream(req, res, next, gifProcessor)
}

function cover(req, res, next) {
  const { imageDatas }    = req
  const { imageName }     = req.params
  const [ width, height ] = getTargetDimensions( req.params.sizes )

  addCacheControl( res )

  // Sharp can't handle animated gif
  if ( imageDatas.type !== 'gif' ) {
    const pipeline = sharp().resize( width, height )
    return handleSharpStream(req, res, next, pipeline)
  }

  // there is no build-in cover method with gifsicle
  // http://www.lcdf.org/gifsicle/man.html
  const originalWidth       = imageDatas.width
  const originalHeight      = imageDatas.height
  const widthRatio          = originalWidth / width
  const heightRatio         = originalHeight / height
  let newWidth              = originalWidth
  let newHeight             = originalHeight
  const crop                = [ '--crop' ]

  // Trim the image to have the same ratio as the target
  // This operation is done before everything else by gifsicle
  if ( widthRatio < heightRatio ) {
    newHeight   = (originalHeight / heightRatio) * widthRatio
    newHeight   = Math.round( newHeight )
    // diff is for centering the crop
    const diff  = Math.round( (originalHeight - newHeight) / 2 )
    crop.push( `0,${ diff }+0x${ diff * -1 }` )
  } else {
    newWidth    = (originalWidth / widthRatio) * heightRatio
    newWidth    = Math.round( newWidth )
    const diff  = Math.round( (originalWidth - newWidth) / 2 )
    crop.push( `${ diff },0+${ diff * -1 }x0` )
  }

  // Scale to the same size as the target
  const scale         = [ '--scale', `${ height / newHeight }` ]

  // Resize to be sure that the sizes are equals
  // as we have done some rounding before, there may be some slighty differences in sizes
  // --resize will no preserve aspect-ratio…
  // …but it should be unoticable as we are mostly speaking of 1 or 2 pixels
  const resize        = [ '--resize', `${ width }x${ height }`, '--resize-colors', '64' ]

  const gifProcessor  = new Gifsicle([...crop, ...scale, ...resize])

  return handleGifStream(req, res, next, gifProcessor)
}

function placeholder(req, res, next) {
  var sizes               = /(\d+)x(\d+)\.png/.exec(req.params.placeholderSize)
  var width               = ~~sizes[1]
  var height              = ~~sizes[2]
  const streamPlaceholder = streamToResponseAndCacheImage( req, res, next )
  var out                 = gm(width, height, '#707070')
  res.set('Content-Type', 'image/png')
  var x = 0, y = 0
  var size = 40
  // stripes
  while (y < height) {
    out = out
    .fill('#808080')
    .drawPolygon([x, y], [x + size, y], [x + size*2, y + size], [x + size*2, y + size*2])
    .drawPolygon([x, y + size], [x + size, y + size*2], [x, y + size*2])
    x = x + size * 2
    if (x > width) { x = 0; y = y + size*2 }
  }
  // text
  out = out.fill('#B0B0B0').fontSize(20).drawText(0, 0, `${width} x ${height}`, 'center')
  streamPlaceholder( null, out.stream('png'), null)
}

//////
// OTHER THINGS
//////

function listImages( req, res, next ) {
  list( req.params.mongoId )
  .then( files => res.json({ files }) )
  .catch( next )
}

function upload( req, res, next ) {
  parseMultipart( req, {
    prefix:     req.params.mongoId,
    formatter:  'editor',
  } )
  .then( onParse )
  .catch( next )

  function onParse( datas4fileupload ) {
    res.send( JSON.stringify(datas4fileupload) )
  }
}

module.exports = {
  handleOldImageUrl,
  cover,
  resize,
  placeholder,
  checkImageCache,
  checkSizes,
  read,
  listImages,
  upload,
}
