'use strict'

const sharp           = require( 'sharp' )
const createError     = require( 'http-errors' )
const { inspect }     = require( 'util' )
const stream          = require( 'stream' )
const probe           = require( 'probe-image-size' )
const Gifsicle        = require( 'gifsicle-stream' )
const mime            = require( 'mime-types' )
const { duration }    = require( 'moment' )
const {
  green,
  red,
  bgGreen, }          = require( 'chalk' )

const config          = require('./config')
const {
  streamImage,
  writeStreamFromStream,
  list,
  parseMultipart, }   = require( './filemanager' )
const { Cacheimages, Galleries } = require( './models' )

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
    console.log( inspect( e ) )
  })

}

// transform /cover/100x100/filename.jpg => cover_100x100_filename.jpg
const getResizedImageName = path => {
  return path.replace( /^\// , '' ).replace( /\//g , '_' )
}

const onWriteResizeError = path => e => {
  console.log(`[IMAGE] can't upload resize/placeholder result`, path)
  console.log( inspect( e ) )
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

    writeStreamFromStream( pipeline.clone(), name )
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

  writeStreamFromStream( streamForSave, name )
  .then( onWriteResizeEnd({path, name, imageName}) )
  .catch( onWriteResizeError(path) )

}

const streamImageToResponse = (req, res, next, imageName) => {
  const imageStream = streamImage( imageName )
  const contentType = mime.lookup( imageName )
  imageStream.on('error', handleFileStreamError(next) )
  // We have to end stream manually on res stream error (can happen if user close connection before end)
  // If not done, we will have a memory leaks
  // https://groups.google.com/d/msg/nodejs/wtmIzV0lh8o/cz3wqBtDc-MJ
  // https://groups.google.com/forum/#!topic/nodejs/A8wbaaPmmBQ
  imageStream.once('readable', e => {
    addCacheControl( res )
    // try to guess content-type from filename
    // we should do a better thing like a fs-stat
    // http://stackoverflow.com/questions/13485933/createreadstream-send-file-http#answer-13486341
    // but we want the response to be as quick as possible
    if ( contentType ) res.set( 'Content-Type', contentType )

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
    console.log( inspect(e) )
    next()
  } )

  function onCacheimage( cacheInformations ) {
    if (cacheInformations === null) return next()
    // console.log( bgGreen.black(path), 'already in cache' )
    streamImageToResponse(req, res, next, cacheInformations.name)
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
      return streamImageToResponse( req, res, next, imageName )
    }

    req.imageDatas  = imageDatas
    res.set('Content-Type', imageDatas.mime )

    next()
  })
  .catch( handleFileStreamError( next ) )
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

  const resize        = ['--resize']
  resize.push( `${ width ? width : '_' }x${ height ? height : '_' }` )
  const gifProcessor  = new Gifsicle([...resize, '--resize-colors', '64'])

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
  const scale   = [ '--scale', `${ height / newHeight }` ]

  // Resize to be sure that the sizes are equals
  // as we have done some rounding before, there may be some slighty differences in sizes
  // --resize will no preserve aspect-ratio…
  // …but it should be unoticable as we are mostly speaking of 1 or 2 pixels
  const resize  = [ '--resize', `${ width }x${ height }`, '--resize-colors', '64' ]

  const gifProcessor = new Gifsicle([...crop, ...scale, ...resize])

  return handleGifStream(req, res, next, gifProcessor)
}

const stripeSize  = 55
const lightStripe = `#808080`
const darkStripe  = `#707070`
const textColor   = `#B0B0B0`
function generatePlaceholderSVG(width, height) {
  // centering text in SVG
  // http://stackoverflow.com/questions/5546346/how-to-place-and-center-text-in-an-svg-rectangle#answer-31522006
  return `<svg width="${ width }" height="${ height }">
    <defs>
    <pattern id="pattern" width="${ stripeSize }" height="1" patternUnits="userSpaceOnUse" patternTransform="rotate(-45 0 0)">
      <line stroke="${ lightStripe }" stroke-width="${ stripeSize }px" y2="10"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="${ width }" height="${ height }" fill="${ darkStripe }" />
  <rect x="0" y="0" width="${ width }" height="${ height }" fill="url(#pattern)" />
  <text x="50%" y="50%" alignment-baseline="middle" text-anchor="middle" fill="${ textColor }" font-family="Verdana" font-size="20">
    ${ width } x ${ height }
  </text>
</svg>`
}

function placeholder(req, res, next) {
  const { path }            = req
  const { placeholderSize } = req.params
  const sizes     = /(\d+)x(\d+)\.png/.exec( placeholderSize )
  const width     = ~~sizes[1]
  const height    = ~~sizes[2]
  const svgBuffer = new Buffer( generatePlaceholderSVG( width, height ) )
  const pipeline  = sharp( svgBuffer ).png()

  addCacheControl( res )
  res.set( 'Content-Type', 'image/png' )

  // don't use handleSharpStream()
  // we don't read a file but feed a buffer
  // prepare sending to response
  pipeline.clone().pipe( res )

  // prepare sending to cache
  if (!config.images.cache) return
  const name      = getResizedImageName( req.path )

  writeStreamFromStream( pipeline.clone(), name )
  .then( onWriteResizeEnd({ path, name, imageName: placeholderSize }) )
  .catch( onWriteResizeError(path) )
}

//////
// OTHER THINGS
//////

function read(req, res, next) {
  const { imageName }   = req.params
  streamImageToResponse(req, res, next, imageName)
}

//////
// EDITOR SPECIFIC
//////

function createGallery( mongoId ) {
  // create the gallery in DB
  return list( mongoId )
  .then( files => {
    return new Galleries({
      creationOrWireframeId: mongoId,
      files,
    })
    .save()
  })
}

// Those functions are accessible only from the editor
// wireframes assets (preview & template fixed assets)…
// …are handled separatly in wireframes.js#update

function listImages( req, res, next ) {
  if (!req.xhr) return next( createError(501) ) // Not Implemented

  const { mongoId } = req.params

  Galleries
  .findOne({
    creationOrWireframeId: mongoId,
  }, 'files' )
  .lean()
  .then( gallery => {
    if ( gallery ) return Promise.resolve( gallery )
    return createGallery( mongoId )
  })
  .then( gallery => {
    res.json( gallery )
  })
  .catch( next )
}

// upload & update gallery
function upload( req, res, next ) {
  if (!req.xhr) return next( createError(501) ) // Not Implemented
  const { mongoId }       = req.params
  const multipartOptions  = {
    prefix:     mongoId,
    formatter:  'editor',
  }

  Promise.all([
    parseMultipart( req,  multipartOptions),
    Galleries.findOne({ creationOrWireframeId: mongoId }),
  ])
  .then( ([uploads, gallery]) => {
    if ( gallery ) return Promise.all( [uploads, gallery] )
    // gallery could not be created at this point
    // without opening galleries panel in the editor no automatic DB gallery creation :(
    return Promise.all( [uploads, createGallery( mongoId ) ])
  })
  .then( ([uploads, gallery]) => {

    uploads.files.forEach( upload => {
      const imageName   = upload.name
      const { files }   = gallery
      const imageIndex  = files.findIndex( file =>  file.name === imageName )
      if ( imageIndex < 0 ) files.push( upload )
    })

    gallery.markModified( 'files' )

    return Promise.all([uploads, gallery.save()])

  })
  .then( ([uploads, gallery]) => {
    // send only the new uploads
    // front-application will iterate over them to update the gallery previews
    res.send( JSON.stringify(uploads) )
  })
  .catch( next )
}

// destroy an image is not a real deletion…
// …because those images can be still used inside creations:
//  - cache can be inactive
//  - if active: we are not sure that cropped images are cached
//  - even thougt every cropped images are cached
//    an image can be used at it's original size (no cropped image cache)
// so:
//  - we just flag this image in the gallery table as not visible
function destroy(req, res, next) {
  if (!req.xhr) return next( createError(501) ) // Not Implemented
  const { imageName }   = req.params
  let mongoId = /^([a-f\d]{24})-/.exec( imageName )
  if ( !mongoId ) return next( createError(422) ) // UnprocessableEntity
  mongoId     = mongoId[ 1 ]

  Galleries
  .findOne({
    creationOrWireframeId: mongoId,
  })
  .then( gallery => {
    // TODO handle non existing gallery
    // mongoID could be incorrect
    const { files }   = gallery
    const imageIndex  = files.findIndex( file =>  file.name === imageName )
    files.splice(imageIndex, 1)
    gallery.markModified( 'files' )
    return gallery.save()
  })
  .then( gallery => {
    res.send( {files: gallery.files} )
  })
  .catch( next )
}

module.exports = {
  handleOldImageUrl,
  cover,
  resize,
  placeholder,
  checkImageCache,
  checkSizes,
  read,
  destroy,
  listImages,
  upload,
}
