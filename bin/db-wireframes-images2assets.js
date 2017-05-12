'use strict'

// a simple script to change from an array of images,
// to a catalog of assets where
//    - key is the uploaded image name
//    - value is the name as uploaded on the S3 (or local)

const c             = require('chalk')
const util          = require('util')
const inquirer      = require('inquirer')

const { logErrorAndExit } = require('./_db-utils')
const { dbConfigs } = require('../server/config')
const { connectDB, connection, Wireframes} = require('../server/models')
const prefix        = c.blue('[UPDATE WIREFRAME ASSETS]')

const selectDb = inquirer.prompt([
  {
    type:     'list',
    name:     'destination',
    message:  `${prefix} Choose DB to update`,
    choices:  Object.keys(dbConfigs),
  },
])

connection.once('open', getWireframes)

function dbUrl(conf) {
  if (!conf.user) return `mongodb://${conf.host}/${conf.folder}`
  return `mongodb://${conf.user}:${conf.password}@${conf.host}/${conf.folder}`
}

selectDb
.then( promptConf => {
  const selectedDb = dbConfigs[promptConf.destination]
  connectDB( dbUrl(selectedDb) )
})
.catch(logErrorAndExit)

function getWireframes() {
  console.log(prefix, 'fetching wireframes…')
  Wireframes
  .find({}, 'name images assets')
  .then( handleWireframes )
  .catch( logErrorAndExit )
}

function handleWireframes(wireframes) {
  console.log(prefix, 'updating wireframes…')
  wireframes = wireframes.map( wireframe => {

    const hasNoImages = !wireframe.images || wireframe.images.length === 0
    const hasAssets   = wireframes.assets && Object.keys( wireframes.assets ).length !== 0
    if (hasNoImages && hasAssets ) return Promise.resolve()

    const assets = {}

    wireframe.assets = wireframe.assets || {}

    for (let imageName of wireframe.images) {
      // remove mongoDB Id
      let originalImageName = imageName.replace(/^[a-f\d]{24}-/i, '')
      assets[ originalImageName ] = imageName
    }
    console.log(assets)
    wireframe.assets = assets
    wireframe.images = void( 0 )

    return wireframe.save()
  })
  Promise
  .all(wireframes)
  .then( _ => {
    console.log(prefix, 'all done!')
    process.exit(0)
  } )
  .catch(logErrorAndExit)
}
