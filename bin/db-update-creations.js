'use strict'

// a simple script to copy on creations:
//    - _user.name => author
//    - _wireframe.name => wireframe

const c             = require('chalk')
const util          = require('util')
const inquirer      = require('inquirer')
const { logErrorAndExit } = require('./_db-utils')
const { dbConfigs } = require('../server/config')
const { connectDB, connection, Creations} = require('../server/models')

const selectDb = inquirer.prompt([
  {
    type:     'list',
    name:     'destination',
    message:  `Choose DB to update`,
    choices:  Object.keys(dbConfigs),
  },
])

connection.once('open', getCreations)

function dbUrl(conf) {
  if (!conf.user) return `mongodb://${conf.host}/${conf.folder}`
  return `mongodb://${conf.user}:${conf.password}@${conf.host}/${conf.folder}`
}

selectDb
.then( (promptConf) => {
  const selectedDb = dbConfigs[promptConf.destination]
  console.log(selectedDb)
  connectDB(dbUrl(selectedDb))
})
.catch(logErrorAndExit)

function getCreations() {
  Creations
  .find({}, 'name _user _wireframe')
  .populate('_user', 'name lang')
  .populate('_wireframe', 'name')
  .then(showCreations)
  .catch(logErrorAndExit)
}

function showCreations(creations) {
  creations = creations.map( creation => {
    // admin creations don't have _user
    if (creation._user) {
      creation.author   = creation._user.name
    }

    if (!creation.name) {
      let lang = creation._user ? creation._user.lang : 'en'
      creation.name = lang === 'en' ? 'untitled' : 'sans titre'
    }

    creation.name = creation.name.trim().toLowerCase()
    creation.wireframe  = creation._wireframe.name
    return creation.save()
  })
  Promise
  .all(creations)
  .then( _ => process.exit(1) )
  .catch(logErrorAndExit)
}
