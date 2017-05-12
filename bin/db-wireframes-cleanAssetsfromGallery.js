'use strict'

// a simple script to change from an array of images,
// to a catalog of assets where
//    - key is the uploaded image name
//    - value is the name as uploaded on the S3 (or local)

const c             = require('chalk')
const { inspect }   = require('util')
const inquirer      = require('inquirer')
const AWS           = require('aws-sdk')
const { without }   = require('lodash')

const { logErrorAndExit } = require('./_db-utils')
const { dbConfigs, s3Configs } = require('../server/config')
const { connectDB, connection, Wireframes} = require('../server/models')
const prefix        = c.blue('[UPDATE WIREFRAME ASSETS]')
let s3
let s3Config
let Bucket

function defer() {
  var res, rej
  var promise = new Promise((resolve, reject) => {
    res = resolve
    rej = reject
  })
  promise.resolve = res
  promise.reject  = rej
  return promise
}

const selectDb = inquirer.prompt([
  {
    type:     'list',
    name:     'destination',
    message:  `${prefix} Choose DB to update`,
    choices:  without( Object.keys(dbConfigs), 'local' ),
  },
])

connection.once('open', getWireframes)

function dbUrl(conf) {
  if (!conf.user) return `mongodb://${conf.host}/${conf.folder}`
  return `mongodb://${conf.user}:${conf.password}@${conf.host}/${conf.folder}`
}

selectDb
.then( promptConf => {
  const selectedDb  = dbConfigs[promptConf.destination]
  s3Config          = s3Configs[ promptConf.destination ]
  Bucket            = s3Config.bucketName
  AWS.config.update( s3Config )
  s3 = new AWS.S3()
  connectDB( dbUrl(selectedDb) )

})
.catch( logErrorAndExit )

function getWireframes() {
  console.log(prefix, 'fetching wireframes…')
  Wireframes
  .find({
    assets: { $exists: true },
  }, 'name assets')
  .then( handleWireframes )
  .catch( logErrorAndExit )
}

// { Key: '586387fed56d7f000c64c40e-vimeo_bw_ok.png',
//  LastModified: 2016-12-28T09:38:26.000Z,
//  ETag: '"ea735415aa46f0374cb5a4969564aa02"',
//  Size: 1105,
//  StorageClass: 'STANDARD' },

function handleWireframes( wireframes ) {
  console.log(prefix, 'updating wireframes…')
  wireframes = wireframes.map( wireframe => {
    const hasNoAssets   = Object.keys( wireframe.assets ).length === 0
    if ( hasNoAssets ) {
      console.log( `No assets for wireframe ${wireframe.name}` )
      return Promise.resolve()
    }
    const dfd = defer()

    const s3ListParams = {
      Bucket,
      Prefix: `${wireframe._id}`,
    }
    s3.listObjectsV2(s3ListParams, onFileListing)

    function onFileListing(err, data) {
      console.log('s3 call done – wireframe.name')
      if (err) {
        console.log('error')
        console.log(err)
      }

      console.log( inspect(data.Contents, {colors: true, depth: 2 }) )

      Promise
      .all( data.Contents.map( copyImage ) )
      .then( deleteImages )
      .then( updateImagePath )
      .then( dfd.resolve )
      .catch( dfd.reject )
    }

    function copyImage( image ) {
      console.log(`s3 – moving images – ${image.Key? image.Key : image}`)
      const copyDfd = defer()
      s3.copyObject({
        Bucket,
        CopySource: `${Bucket}/${image.Key}`,
        Key:        `wireframe-${image.Key}`,
      }, ( err, data ) => {
        if (err && err.code === 'NoSuchKey') return copyDfd.resolve({})
        if (err) return copyDfd.reject(err)
        copyDfd.resolve( {Key: image.Key} )
      })
      return copyDfd
    }

    function deleteImages( images ) {
      console.log('s3 – cleaning bucket')
      images = images.filter( img => img.key != null )
      console.log( inspect(images, {colors: true, depth: 2 }) )
      const deleteDfd       = defer()
      if (images.length) {
        const s3DeleteParams  = {
          Bucket,
          Delete: {
            Objects: images
          }
        }
        s3.deleteObjects(s3DeleteParams, ( err, data ) => {
          if (err && err.code === 'NoSuchKey') return deleteDfd.resolve()
          if (err) return deleteDfd.reject( err )
          deleteDfd.resolve()
        })
      } else {
        setTimeout( deleteDfd.resolve, 1 )
      }

      return deleteDfd
    }

    function updateImagePath() {
      console.log('mongodb – updating wireframes')
      const newAssets = {}
      Object.keys( wireframe.assets ).forEach( key => {
        const value = wireframe.assets[ key ]
        newAssets[ key ] = `wireframe-${value}`
      })
      wireframe.assets = newAssets

      return wireframe.save()
    }

    return dfd

  })




  Promise
  .all( wireframes )
  .then( _ => {
    console.log(prefix, 'all done!')
    process.exit(0)
  } )
  .catch(logErrorAndExit)
}
