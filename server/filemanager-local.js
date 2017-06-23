'use strict'

const fs          = require( 'fs-extra' )
const path        = require('path')

const config      = require( './config')
const defer       = require( './helpers/create-promise' )
const formatName  = require( './helpers/format-filename-for-jqueryfileupload.js' )

// https://docs.nodejitsu.com/articles/advanced/streams/how-to-use-fs-create-read-stream/
function streamImage(imageName) {
  var imagePath = path.join( config.images.uploadDir, imageName )
  return fs.createReadStream( imagePath )
}
function writeStreamFromPath(file) {
  var filePath  = path.join( config.images.uploadDir, file.name )
  var source    = fs.createReadStream( file.path )
  var dest      = fs.createWriteStream( filePath )
  return source.pipe( dest )
}
function writeStreamFromStream(source, name) {
  // console.log('writeStreamFromStream', name)
  var filePath  = path.join( config.images.uploadDir, name )
  var dest      = fs.createWriteStream( filePath )
  return new Promise( (resolve, reject) => {
    source
    .pipe(dest)
    .on('error', reject)
    .on('close', resolve)
  })
}

function listImages(prefix) {
  const prefixRegexp = new RegExp(`^${prefix}`)

  return fs.readdir( config.images.uploadDir )
  .then( files => {
    files = files
    .filter( file => prefixRegexp.test(file) )
    .map( formatName )
    return Promise.resolve( files )
  })
}

function copyImages( oldPrefix, newPrefix ) {
  return listImages(oldPrefix)
  .then( files => {
    files = files.map( copy )
    return Promise.all( files )
  })

  function copy( file ) {
    const srcPath = path.join( config.images.uploadDir, file.name )
    const dstPath = srcPath.replace( oldPrefix, newPrefix )
    return fs.copy( srcPath, dstPath )
  }
}

module.exports = {
  streamImage,
  writeStreamFromPath,
  writeStreamFromStream,
  listImages,
  copyImages,
}
