'use strict'

const fs          = require( 'fs-extra' )
const AWS         = require( 'aws-sdk' )
const denodeify   = require( 'denodeify' )

const config      = require( './config')
const defer       = require( './helpers/create-promise' )
const formatName  = require( './helpers/format-filename-for-jqueryfileupload.js' )

if ( !config.isAws) return module.exports = {}

AWS.config.update( config.storage.aws )
const s3 = new AWS.S3()

// http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-examples.html#Amazon_Simple_Storage_Service__Amazon_S3_
// http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#getObject-property
function streamImage( imageName ) {
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
function writeStreamFromPath( file ) {
  var source  = fs.createReadStream( file.path )
  return s3
  .upload({
    Bucket: config.storage.aws.bucketName,
    Key:    file.name,
    Body:   source,
  }, function(err, data) {
    // console.log(err, data)
  })
}

function writeStreamFromStream( source, name ) {
  const deferred = defer()

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
    if (progress.loaded >= progress.total) deferred.resolve()
  })
  .on('error', deferred.reject)

  return deferred
}

// http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#listObjectsV2-property
// https://github.com/matthew-andrews/denodeify#advanced-usage
const listObjectsV2 = denodeify( s3.listObjectsV2.bind( s3 ), (err, data) => {
  if ( data && data.Contents ) {
    data = data.Contents.map( file => formatName(file.Key))
  }
  return [err, data]
})
function listImages( prefix ) {
  return listObjectsV2({
    Bucket: config.storage.aws.bucketName,
    Prefix: prefix,
  })
}

// http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#copyObject-property
const copyObject = denodeify( s3.copyObject.bind( s3 ) )
function copyImages(oldPrefix, newPrefix) {

  return listImages(oldPrefix)
  .then( files => {
    files = files.map( copy )
    return Promise.all( files )
  })

  function copy(file) {
    const src = config.storage.aws.bucketName + '/' + file.name
    return s3.copyObject({
      Bucket:     config.storage.aws.bucketName,
      CopySource: src,
      Key:        file.name.replace(oldPrefix, newPrefix),
    })
  }
}

module.exports = {
  streamImage,
  writeStreamFromPath,
  writeStreamFromStream,
  listImages,
  copyImages,
}
