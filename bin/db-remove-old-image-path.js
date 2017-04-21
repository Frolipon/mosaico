// a simple script to change from an array of images,
// to a catalog of assets where
//    - key is the uploaded image name
//    - value is the name as uploaded on the S3 (or local)

const c             = require('chalk')
const util          = require('util')
const inquirer      = require('inquirer')
const fs            = require('fs-extra')
const path          = require('path')

const { logErrorAndExit } = require('./_db-utils')
const { dbConfigs } = require('../server/config')
const { connectDB, connection, Creations} = require('../server/models')
const prefix        = c.blue('[UPDATE WIREFRAME ASSETS]')

const selectDb = inquirer.prompt([
  {
    type:     'list',
    name:     'destination',
    message:  `${prefix} Choose DB to update`,
    choices:  Object.keys(dbConfigs),
  },
])

connection.once('open', getCreations)

function dbUrl( conf ) {
  if (!conf.user) return `mongodb://${conf.host}/${conf.folder}`
  return `mongodb://${conf.user}:${conf.password}@${conf.host}/${conf.folder}`
}

selectDb
.then( promptConf => {
  const selectedDb = dbConfigs[promptConf.destination]
  connectDB( dbUrl(selectedDb) )
})
.catch(logErrorAndExit)

function getCreations() {
  console.log(prefix, 'fetching creations…')
  Creations
  .find({
    data: { "$exists": true },
  }, 'data name')
  .then( handleCreations )
  .catch( logErrorAndExit )
}

function handleCreations( creations ) {
  console.log( prefix, 'updating creations…' )
  const jsonPath    = path.join(__dirname, '../tmp/__creations.json')
  fs.removeSync( jsonPath )
  fs.writeJsonSync( jsonPath, creations)
  end()
  // wireframes = wireframes.map( wireframe => {

  //   const hasNoImages = !wireframe.images || wireframe.images.length === 0
  //   const hasAssets   = wireframes.assets && Object.keys( wireframes.assets ).length !== 0
  //   if (hasNoImages && hasAssets ) return Promise.resolve()

  //   const assets = {}

  //   wireframe.assets = wireframe.assets || {}

  //   for (let imageName of wireframe.images) {
  //     // remove mongoDB Id
  //     let originalImageName = imageName.replace(/^[a-f\d]{24}-/i, '')
  //     assets[ originalImageName ] = imageName
  //   }
  //   console.log(assets)
  //   wireframe.assets = assets
  //   wireframe.images = void( 0 )

  //   return wireframe.save()
  // })
  // Promise
  // .all(wireframes)
  // .then( _ => {
  //   console.log(prefix, 'all done!')
  //   process.exit(0)
  // } )
  // .catch(logErrorAndExit)
}

function end() {
  console.log(prefix, 'all done!')
  process.exit(0)
}
