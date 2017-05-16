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
const readFile    = denodeify( fs.readFile )
const readDir     = denodeify( fs.readdir )

const config        = require('./config')
const slugFilename  = require('../shared/slug-filename.js')
var streamImage
var writeFromPath
var writeStream
var listImages
var copyImages

//////
// AWS
//////

function formatFilenameForFront(filename) {
  return {
    name:         filename,
    url:          '/img/' + filename,
    deleteUrl:    '/img/' + filename,
    thumbnailUrl: `/cover/150x150/${filename}`,
  }
}

if (config.isAws) {
  AWS.config.update( config.storage.aws )
  var s3    = new AWS.S3()

  // http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-examples.html#Amazon_Simple_Storage_Service__Amazon_S3_
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getObject-property
  streamImage = function streamImage(imageName) {
    const awsRequest = s3.getObject({
      Bucket: config.storage.aws.bucketName,
      Key:    imageName,
    })
    const awsStream   = awsRequest.createReadStream()
    // break if no bind…
    // mirror fs stream method name
    awsStream.destroy = awsRequest.abort.bind( awsRequest )
    return awsStream
  }
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload-property
  writeFromPath = function writeFromPath(file) {
    var source  = fs.createReadStream( file.path )
    return s3
    .upload({
      Bucket: config.storage.aws.bucketName,
      Key:    file.name,
      Body:   source,
    }, function(err, data) {
      console.log(err, data)
    })
  }
  writeStream = function writeStream(source, name) {
    return new Promise( (resolve, reject) => {
      s3
      .upload({
        Bucket: config.storage.aws.bucketName,
        Key:    name,
        Body:   source,
      }, (err, data) => {
        // console.log(err, data)
        // if (err) return reject( err )
        // resolve( data )
      })
      .on('httpUploadProgress', progress => {
        console.log('httpUploadProgress', progress.loaded, progress.total)
        if (progress.loaded >= progress.total) resolve()
      })
      .on('error', reject)
    })
  }
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjectsV2-property
  listImages = function (prefix) {
    return new Promise(function (resolve, reject) {
      s3.listObjectsV2({
        Bucket: config.storage.aws.bucketName,
        Prefix: prefix,
      }, function (err, data) {
        if (err) return reject(err)
        data = data.Contents
        resolve(data.map( file => formatFilenameForFront(file.Key)) )
      })
    })
  }

  // copy always resolve
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#copyObject-property
  copyImages = function (oldPrefix, newPrefix) {
    return new Promise(function (resolve) {

      listImages(oldPrefix)
      .then(onImages)
      .catch(resolve)

      function onImages(files) {
        files = files.map(copyAndAlwaysResolve)
        Promise
        .all(files)
        .then(resolve)
      }

      function copyAndAlwaysResolve(file) {
        return new Promise( function (done) {
          var src = config.storage.aws.bucketName + '/' + file.name
          s3.copyObject({
            Bucket:     config.storage.aws.bucketName,
            CopySource: src,
            Key:        file.name.replace(oldPrefix, newPrefix),
          }, function (err, data) {
            if (err) console.log(err)
            done()
          })
        })
      }

    })
  }

//////
// LOCAL
//////

} else {
  // https://docs.nodejitsu.com/articles/advanced/streams/how-to-use-fs-create-read-stream/
  streamImage = function streamImage(imageName) {
    var imagePath = path.join( config.images.uploadDir, imageName )
    return fs.createReadStream( imagePath )
  }
  writeFromPath = function writeFromPath(file) {
    var filePath  = path.join( config.images.uploadDir, file.name )
    var source    = fs.createReadStream( file.path )
    var dest      = fs.createWriteStream( filePath )
    return source.pipe(dest)
  }
  writeStream = function writeStream(source, name) {
    console.log('WRITESTREAM', name)
    var filePath  = path.join( config.images.uploadDir, name )
    var dest      = fs.createWriteStream( filePath )
    return new Promise( (resolve, reject) => {
      source
      .pipe(dest)
      .on('error', reject)
      .on('close', resolve)
    })
  }
  listImages = function (prefix) {
    return new Promise( (resolve, reject) => {
      readDir(config.images.uploadDir)
      .then(onFiles)
      .catch(reject)

      const prefixRegexp = new RegExp(`^${prefix}`)

      function onFiles(files) {
        files = files
        .filter( file => prefixRegexp.test(file) )
        .map(formatFilenameForFront)
        resolve(files)
      }
    })
  }

  // copy always resolve
  copyImages = function (oldPrefix, newPrefix) {
    return new Promise(function (resolve) {

      listImages(oldPrefix)
      .then(onImages)
      .catch(resolve)

      function onImages(files) {
        files = files.map(copyAndAlwaysResolve)
        Promise
        .all(files)
        .then(resolve)

      }

      function copyAndAlwaysResolve(file) {
        return new Promise( function (done) {
          var srcPath = path.join(config.images.uploadDir, file.name)
          var dstPath = srcPath.replace(oldPrefix, newPrefix)
          fs.copy(srcPath, dstPath, function (err) {
            if (err) console.log(err)
            done()
          })
        })
      }

    })
  }
}


//////
// UPLOAD
//////

const formatters = {
  editor:     handleEditorUpload,
  wireframes: handleWireframesUploads,
}

// multipart/form-data
function parseMultipart(req, options) {
  return new Promise(function (resolve, reject) {
    // parse a file upload
    const form      = new formidable.IncomingForm()
    const uploads   = []
    form.multiples  = true
    form.hash       = 'md5'
    form.uploadDir  = config.images.tmpDir
    form.parse(req, onEnd)
    form.on('file', onFile)

    function onEnd(err, fields, files) {
      if (err) return reject(err)
      console.log(chalk.green('form.parse', uploads.length))
      // wait all TMP files to be moved in the good location (s3 or local)
      Promise
      .all( uploads )
      .then( () => formatters[ options.formatter ](fields, files, resolve) )
      .catch(reject)
    }

    function onFile(name, file) {
      // remove empty files
      if (file.size === 0) return
      // markup will be saved in DB
      if (name === 'markup') return
      // put all other files in the right place (S3 \\ local)
      console.log('on file', chalk.green(name) )
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
  })
}

//----- WIREFRAME FILEUPLOAD

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

//----- EDITOR FILEUPLOAD

// Datas for jquery file upload
// name: 'sketchbook-342.jpg',
// size: 412526,
// type: 'image/jpeg',
// modified: undefined,
// deleteType: 'DELETE',
// options: [Object],
// key: 'upload_851cd88617b1963ee471e6537697d24c',
// versions: [Object],
// proccessed: true,
// width: 1149,
// height: 1080,
// fields: {},
// url: 'http://localhost:3000/uploads/sketchbook-342.jpg',
// deleteUrl: 'http://localhost:3000/uploads/sketchbook-342.jpg',
// thumbnailUrl: 'http://localhost:3000/uploads/thumbnail/sketchbook-342.jpg'
function handleEditorUpload(fields, files, resolve) {
  console.log('HANDLE JQUERY FILE UPLOAD')
  var file  = files['files[]']
  file      = _.assign({}, file, {
    url:          `/img/${file.name}`,
    deleteUrl:    `/img/${file.name}`,
    thumbnailUrl: `/cover/150x150/${file.name}`,
  })
  resolve({ files: [file] , })
}

//////
// EXPOSE
//////

function write(file) {
  console.log('write', config.isAws ? 'S3' : 'local', chalk.green(file.name))
  var uploadStream = writeFromPath(file)
  return new Promise(function(resolve, reject) {
    uploadStream.on('close', resolve)
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3/ManagedUpload.html
    uploadStream.on('httpUploadProgress', function (progress) {
      if (progress.loaded >= progress.total) resolve()
    })
    uploadStream.on('error', reject)
  })
}

module.exports = {
  streamImage,
  write,
  list: listImages,
  parseMultipart,
  copyImages,
  writeStream,
}
