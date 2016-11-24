'use strict';

const fs          = require('fs')
const url         = require('url')
const path        = require('path')
const gm          = require('gm').subClass({imageMagick: true})
const createError = require('http-errors')

const config      = require('./config')
const filemanager = require('./filemanager')
const streamImage = filemanager.streamImage

//////
// OLD IMAGE HANDLING: should be removed in november
//////

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
// NEW IMAGE HANDLING
//////

function getSizes(sizes) {
  const [width, height] = sizes.split('x')
  return { width, height }
}

function resize(req, res, next) {
  var imageName = req.params.imageName
  var sizes     = getSizes(req.params.sizes)
  var width     = sizes.width
  var height    = sizes.height
  // on resize imageName seems to be double urlencoded
  var ir        = gm(streamImage(imageName))
  ir.format({bufferStream: true}, onFormat)

  function streamToResponse (err, stdout, stderr) {
    if (err) return next(err)
    stdout.pipe(res)
  }

  function onFormat(err, format) {
    if (!err) res.set('Content-Type', 'image/'+format.toLowerCase());
    // Gif frames with differents size can be buggy to resize
    // http://stackoverflow.com/questions/12293832/problems-when-resizing-cinemagraphs-animated-gifs
    ir
    .autoOrient()
    .coalesce()
    .resize(width == 'null' ? null : width, height == 'null' ? null : height)
    .stream(streamToResponse)
  }
}

function cover(req, res, next) {
  var imageName = req.params.imageName
  var sizes     = req.params.sizes ? req.params.sizes.split('x') : [0, 0]
  var width     = sizes[0]
  var height    = sizes[1]

  var ic = gm(streamImage(imageName)).format({ bufferStream: true }, onFormat)

  function streamToResponse (err, stdout, stderr) {
    if (err) return next(err)
    stdout.pipe(res)
  }

  function onFormat(err, format) {
    if (!err) res.set('Content-Type', 'image/' + format.toLowerCase());
    ic.autoOrient()
    .coalesce()
    .resize(width, height + '^')
    .gravity('Center')
    .extent(width, height + '>')
    .stream(streamToResponse)
  }
}

function placeholder(req, res, next) {
  var sizes   = /(\d+)x(\d+)\.png/.exec(req.params.imageName)
  var width   = ~~sizes[1]
  var height  = ~~sizes[2]
  var out     = gm(width, height, '#707070')
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
  out = out.fill('#B0B0B0').fontSize(20).drawText(0, 0, width + ' x ' + height, 'center')
  return out.stream('png').pipe(res);
}

module.exports = {
  getResized:   getResized,
  cover:        cover,
  resize:       resize,
  placeholder:  placeholder,
}
