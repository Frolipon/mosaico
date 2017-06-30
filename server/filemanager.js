'use strict'

const _           = require('lodash')
const fs          = require('fs-extra')
const url         = require('url')
const path        = require('path')
const mime        = require('mime-types')
const AWS         = require('aws-sdk')
const chalk       = require('chalk')
const formidable  = require('formidable')
const denodeify   = require('denodeify')
const createError = require('http-errors')
const util        = require('util')

const config        = require( './config')
const defer         = require( './helpers/create-promise' )
const formatName    = require( './helpers/format-filename-for-jqueryfileupload.js' )
const slugFilename  = require( '../shared/slug-filename.js' )

const { readFile }  = fs
// we want those methods to be as close as possible
const {
  streamImage,
  writeStreamFromPath,
  writeStreamFromStream,
  listImages,
  copyImages,
} = require( config.isAws ? './filemanager-s3' : './filemanager-local' )

//////
// UPLOAD
//////

function imageToFields(fields, file) {
  if (file.size === 0) return
  if (!file.name) return
  fields.assets                       = fields.assets || {}
  fields.assets[ file.originalName ]  = file.name
}

function handleWireframesUploads(fields, files, resolve) {
  // images
  // we want to store any images that have been uploaded on the current model
  if (files.images) {
    if (Array.isArray(files.images)) {
      files.images.forEach( file => imageToFields(fields, file) )
    } else {
      imageToFields(fields, files.images)
    }
  }

  // markup
  if (files.markup && files.markup.name) {
    // read content from file system
    // no worry about performance: only admin will do it
    readFile(files.markup.path)
    .then( text => {
      fields.markup = text
      resolve( fields )
    })
  } else {
    resolve( fields )
  }
}

function handleEditorUpload(fields, files, resolve) {
  console.log('HANDLE JQUERY FILE UPLOAD')
  var file  = files['files[]']
  file      = formatName( file.name )
  // knockout jquery-fileupload binding expect this format
  resolve({ files: [file] })
}

const formatters = {
  editor:     handleEditorUpload,
  wireframes: handleWireframesUploads,
}

// multipart/form-data
function parseMultipart(req, options) {
  const deferred = defer()

  // parse a file upload
  const form      = new formidable.IncomingForm()
  const uploads   = []
  form.multiples  = true
  form.hash       = 'md5'
  form.uploadDir  = config.images.tmpDir
  form.parse(req, onEnd)
  form.on('file', onFile)

  function onFile(name, file) {
    // remove empty files
    if (file.size === 0) return
    // markup will be saved in DB
    if (name === 'markup') return
    // put all other files in the right place (S3 \\ local)
    // slug every uploaded file name
    // user may put accent and/or spaces…
    let fileName      = slugFilename( file.name )
    // ensure that files are having the right extention
    // (files can be uploaded with extname missing…)
    fileName          = fileName.replace( path.extname( fileName ), '' )
    if (!fileName) return console.warn('unable to upload', file.name)
    const ext         = mime.extension( file.type )
    // name is only made of the file hash
    file.name         = `${ options.prefix }-${ file.hash }.${ ext }`
    // original name is needed for templates assets (preview/other images…)
    file.originalName = `${ fileName }.${ ext }`
    uploads.push( write(file) )
  }

  function onEnd(err, fields, files) {
    if (err) return deferred.reject( err )
    console.log(chalk.green('form.parse', uploads.length))
    // wait all TMP files to be moved in the good location (s3 or local)
    Promise
    .all( uploads )
    .then( () => formatters[ options.formatter ](fields, files, deferred.resolve) )
    .catch( deferred.reject )
  }

  return deferred
}


//////
// EXPOSE
//////

// function write(file) {
//   // console.log('write', config.isAws ? 'S3' : 'local', chalk.green(file.name))
//   const deferred      = defer()
//   const uploadStream  = writeStreamFromPath(file)

//   uploadStream.on('close', deferred.resolve)
//   // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3/ManagedUpload.html
//   uploadStream.on('httpUploadProgress', progress => {
//     if (progress.loaded >= progress.total) deferred.resolve()
//   })
//   uploadStream.on('error', deferred.reject)

//   return deferred
// }

module.exports = {
  streamImage,
  // write,
  list: listImages,
  parseMultipart,
  copyImages,
  writeStreamFromPath,
  writeStreamFromStream,
}
