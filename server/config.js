'use strict';

const os          = require('os')
const path        = require('path')
const rc          = require('rc')
const _           = require('lodash')
const { inspect } = require('util')
const { mkdirp }  = require('fs-extra')

// default config is made for an easy use on local dev
var config  = rc('badsender', {
  debug:          false,
  forcessl:       false,
  host:           'localhost:3000',
  database:       'mongodb://localhost/badsender',
  emailTransport: {
    host:         'localhost',
    port:         1025,
  },
  emailOptions: {
    from:               'Badsender local test <info@badsender-local-test.name>',
    // last space is needed
    testSubjectPrefix:  '[badsender email builder] ',
  },
  storage: {
    type:         'local',
  },
  images: {
    uploadDir:    'uploads',
    tmpDir:       'tmp',
    cache:        false,
  },
  admin: {
    id:           '576b90a441ceadc005124896',
    username:     'badsender-admin',
    password:     'admin',
  },
  // this is really optional.
  // It's just to be able to backup/restore DB with scripts
  dbConfigs: {
    local: {
      host:   'localhost:27017',
      folder: 'badsender',
    },
  },
})

config.NODE_ENV       = config.NODE_ENV || process.env.NODE_ENV || 'development'
config.PORT           = process.env.PORT || 3000

config.isDev      = config.NODE_ENV === 'development'
config.isProd     = config.NODE_ENV === 'production'
config.isPreProd  = !config.isDev && !config.isProd
config.isAws      = config.storage.type === 'aws'

// if ( config.isDev ) console.log( inspect(config) )
// http://stackoverflow.com/questions/12416738/how-to-use-herokus-ephemeral-filesystem
config.setup    = new Promise( (resolve, reject) => {
  var tmpPath     = path.join(__dirname, '/../', config.images.tmpDir)
  var uploadPath  = path.join(__dirname, '/../', config.images.uploadDir)
  var tmpDir      = mkdirp(tmpPath)
  var uploadDir   = config.isAws ? Promise.resolve(null) : mkdirp(uploadPath)

  Promise
  .all([tmpDir, uploadDir])
  .then( folders => {
    config.images.tmpDir    = tmpPath
    config.images.uploadDir = uploadPath
    resolve(config)
  })
  .catch( err => {
    console.log('folder exception')
    console.log('attempt with os.tmpdir()')
    console.log(err)
    var tmpPath     = path.join(os.tmpdir(), config.images.tmpDir)
    var uploadPath  = path.join(os.tmpdir(), config.images.uploadDir)
    var tmpDir      = mkdirp(tmpPath)
    var uploadDir   = config.isAws ? Promise.resolve(null) : mkdirp(uploadPath)

    Promise
    .all([tmpDir, uploadDir])
    .then( folders => {
      console.log('all done with os.tmpdir()')
      config.images.tmpDir    = tmpPath
      config.images.uploadDir = uploadPath
      resolve(config)
    })
    .catch( err => {
      reject(err)
      throw err
    })
  })
})

module.exports  = config
