'use strict'

if (!/^8\./.test(process.versions.node)) {
  throw new Error('wrong node version. Should run on nodejs 8. See package.json#engines')
}

// https://devcenter.heroku.com/articles/node-concurrency
var throng  = require('throng')

var WORKERS = process.env.WEB_CONCURRENCY || 1
var start   = require('./index')

throng({
  start:    start,
  workers:  WORKERS,
  lifetime: Infinity,
})
