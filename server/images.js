'use strict';

const fs          = require('fs')
const url         = require('url')
const path        = require('path')
const gm          = require('gm').subClass({imageMagick: true})
const createError = require('http-errors')
const util        = require('util')
const stream      = require('stream')
const probe       = require('probe-image-size')
const { green, red, bgGreen,
}                 =  require('chalk')

const config          = require('./config')
const {
  streamImage,
  writeStream, }      = require('./filemanager')
const { Cacheimages } = require('./models')

//////
// OLD IMAGE HANDLING
//////

// Check logs on february
// if no more `[IMAGE] old url for path` => remove

function getResized(req, res, next) {
  if (!req.query.src)     return next( createError(404) )
  if (!req.query.method)  return next( createError(404) )
  let imageName = /([^/]*)$/.exec( req.query.src )
  if (!imageName[1])      return next( createError(404) )
  imageName       = imageName[1]
  const method    = req.query.method
  const sizes     = req.query.params ? req.query.params.split(',') : [0, 0];
  const width     = sizes[0]
  const height    = sizes[1]
  console.warn(`[IMAGE] old url for path ${req.originalUrl}`)
  return res.redirect(308, `/${method}/${width}x${height}/${imageName}`)
}

//////
// IMAGE UTILS
//////

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

function handleFileStreamError(next) {
  return function (err) {
    // Local => ENOENT || S3 => NoSuchKey
    const isNotFound = err.code === 'ENOENT' || err.code === 'NoSuchKey'
    if (isNotFound) return next( createError(404) )
    next(err)
    console.log('resize error')
  }
}

// used to stream an resize/placeholder result
function streamToResponseAndCacheImage(req, res, next) {

  return function streamToResponse(err, stdout, stderr) {
    if (err) return next(err)
    // clone stream
    // https://github.com/nodejs/readable-stream/issues/202
    const streamToResponse  = stdout.pipe( new stream.PassThrough() )
    // const streamToS3        = stdout.pipe( new stream.PassThrough() )
    // stream asset to response
    streamToResponse.pipe(res)
    if (!config.images.cache) return

    // save asset for further use
    const { path }  = req
    const name      = path.replace(/^\//, '').replace(/\//g, '_')
    writeStream( streamToS3, name )
    .then( onWriteEnd)
    .catch( onWriteError )

    function onWriteEnd() {
      new Cacheimages({
        path,
        name,
      })
      .save()
      .then( ci => console.log( green('cache image infos saved in DB', path )) )
      .catch( e => {
        console.log( red(`[IMAGE] can't save cache image infos in DB`), path )
        console.log( util.inspect( e ) )
      })
    }

    function onWriteError( e ) {
      console.log(`[IMAGE] can't upload resize/placeholder result`, path)
      console.log( util.inspect( e ) )
    }
  }

}

//////
// IMAGE HANDLING
//////

// TODO gif can be optimized by using image-min
// https://www.npmjs.com/package/image-min

function checkImageCache(req, res, next) {
  if (!config.images.cache) return next()

  const { path } = req
  Cacheimages
  .findOne( { path } )
  .lean()
  .then( onCacheimage )
  .catch( e => {
    console.log('[IMAGE] error in image cache check')
    console.log( util.inspect(e) )
    next()
  } )

  function onCacheimage( cacheInformations ) {
    if (cacheInformations === null) return next()
    // TODO should be using the same code as filemanager#read
    console.log( bgGreen.black(path), 'already in cache' )
    var imageStream = streamImage( cacheInformations.name )
    imageStream.on('error', err => {
      console.log( red('read stream error') )
      // Local => ENOENT || S3 => NoSuchKey
      const isNotFound = err.code === 'ENOENT' || err.code === 'NoSuchKey'
      if (isNotFound) return next( createError(404) )
      next( err )
    })
    imageStream.once('readable', e => imageStream.pipe(res) )
  }

}

function checkSizes(req, res, next) {
  const [ width, height ] = getTargetDimensions( req.params.sizes )
  const { imageName }     = req.params
  console.log('[CHECKSIZES]', imageName, { width, height } )
  const imgStream         = streamImage( imageName )

  probe( imgStream )
  .then( imageDatas => {
    console.log(`[CHECKSIZES] success`)
    // TODO abort connection;
    // terminate input, depends on stream type,
    // this example is for fs streams only.
    // imgStream.destroy()
    if ( !needResize( imageDatas, width, height ) ) {
      console.log(`[CHECKSIZES] don't need resize`)
      return streamImage( imageName ).pipe( res )
    }

    req.imageDatas = imageDatas
    res.set('Content-Type', imageDatas.mime )

    // Cache-Control:public, max-age=31536000

    // console.log( imageDatas )
    // console.log( 'needResize:', needResize(imageDatas, width, height) )
    console.log(`[CHECKSIZES] continue to resize`)

    next()
  })
  .catch( handleFileStreamError( next ) )
}

function read(req, res, next) {
  const { imageName }     = req.params
  var imageStream = streamImage( imageName )
  imageStream.on('error', err => {
    console.log( red('read stream error') )
    // Local => ENOENT || S3 => NoSuchKey
    const isNotFound = err.code === 'ENOENT' || err.code === 'NoSuchKey'
    if (isNotFound) return next( createError(404) )
    next( err )
  })
  imageStream.once('readable', e => imageStream.pipe(res) )
}

function resize(req, res, next) {
  const { imageDatas }    = req
  const { imageName }     = req.params
  const [ width, height ] = getTargetDimensions( req.params.sizes )
  const img               = gm( streamImage( imageName ) ).autoOrient()

  console.log('[RESIZE]', imageName)
  if ( imageDatas.type === 'gif' ) img.coalesce()
  img
  .resize( width, height )
  .stream( streamToResponseAndCacheImage(req, res, next) )

}

function cover(req, res, next) {
  const { imageDatas }    = req
  const { imageName }     = req.params
  const [ width, height ] = getTargetDimensions( req.params.sizes )
  const img               = gm( streamImage( imageName ) ).autoOrient()

  console.log('[COVER]', imageName)
  if ( imageDatas.type === 'gif' ) img.coalesce()
  img
  .resize( width, height + '^' )
  .gravity( 'Center')
  .extent( width, height + '>' )
  .stream( streamToResponseAndCacheImage(req, res, next) )

}

function placeholder(req, res, next) {
  var sizes               = /(\d+)x(\d+)\.png/.exec(req.params.imageName)
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

module.exports = {
  getResized,
  cover,
  resize,
  placeholder,
  checkImageCache,
  checkSizes,
  read,
}
