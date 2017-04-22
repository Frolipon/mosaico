'use strict'

const qs              = require('qs')
const url             = require('url')
const path            = require('path')
const chalk           = require('chalk')
const express         = require('express')
const bodyParser      = require('body-parser')
const methodOverride  = require('method-override')
const compression     = require('compression')
const morgan          = require('morgan')
const favicon         = require('serve-favicon')
const cookieParser    = require('cookie-parser')
const i18n            = require('i18n')
const moment          = require('moment')
const util            = require('util')
const { merge, omit } = require('lodash')

module.exports = function () {

  var config        = require('./config')
  var session       = require('./session')
  require('./models').connectDB(config.database)

  //////
  // SERVER CONFIG
  //////

  var app = express()

  app.set('trust proxy', true)

  function forcessl(req, res, next) {
    if (req.header('x-forwarded-proto') === 'https') return next()
    res.redirect(301, `https://${config.host}${req.url}`)
  }

  if (config.forcessl) app.use(forcessl)

  app.use(bodyParser.json({
    limit: '5mb'
  }))
  app.use(bodyParser.urlencoded({
    limit: '5mb',
    extended: true,
  }))
  // enable other methods from request (PUT, DELETE…)
  app.use(methodOverride('_method', {methods: ['GET', 'POST']}))
  app.use(compression())
  app.use(favicon(path.join(__dirname, '../res/favicon.png')))
  app.use(cookieParser())

  //----- SESSION & I18N

  session.init(app)
  i18n.configure({
    locales:        ['fr', 'en',],
    defaultLocale:  'fr',
    extension:      '.js',
    cookie:         'badsender',
    objectNotation: true,
    directory:      path.join( __dirname, './locales'),
  })
  app.use(i18n.init)

  //----- TEMPLATES

  app.set('views', path.join(__dirname, './views'))
  app.set('view engine', 'pug')

  //----- STATIC

  // compiled assets
  app.use(express.static( path.join(__dirname, '../dist') ))
  // commited assets
  app.use(express.static( path.join(__dirname, '../res') ))
  // libs
  app.use('/lib/skins', express.static( path.join(__dirname,'../res/vendor/skins') ))
  app.use(express.static( path.join(__dirname, '../node_modules/material-design-lite') ))
  app.use(express.static( path.join(__dirname, '../node_modules/material-design-icons-iconfont/dist') ))

  //////
  // LOGGING
  //////

  function getIp(req) {
    if (req.ip) {
      var ip = /([\d\.]+)$/.exec(req.ip)
      if (!Array.isArray(ip)) return ''
      return ip[1]
    }
    return ''
  }

  function logRequest(tokens, req, res) {
    if (/\/img\//.test(req.path)) return
    var method  = chalk.blue(tokens.method(req, res))
    var ips     = getIp(req)
    ips         = ips ? chalk.grey(`- ${ips} -`) : ''
    var url     = chalk.grey(tokens.url(req, res))
    return `${method} ${ips} ${url}`
  }

  function logResponse(tokens, req, res) {
    var method      = chalk.blue(tokens.method(req, res))
    var ips         = getIp(req)
    ips             = ips ? chalk.grey(`- ${ips} -`) : ''
    var url         = chalk.grey(tokens.url(req, res))
    var status      = tokens.status(req, res)
    var statusColor = status >= 500
      ? 'red' : status >= 400
      ? 'yellow' : status >= 300
      ? 'cyan' : 'green';
    if (/\/img\//.test(req.path) && status < 400) return
    return `${method} ${ips} ${url} ${chalk[statusColor](status)}`
  }
  app.use(morgan(logRequest, {immediate: true}))
  app.use(morgan(logResponse))

  //////
  // ROUTING
  //////

  var download          = require('./download')
  var images            = require('./images')
  var render            = require('./render')
  var users             = require('./users')
  var companies         = require('./companies')
  var wireframes        = require('./wireframes')
  var creations         = require('./creations')
  var creationTransfer  = require('./creation-transfer')
  var filemanager       = require('./filemanager')
  var guard             = session.guard

  //----- EXPOSE DATAS TO VIEWS

  app.locals._config  = omit(config, ['_', 'configs', 'config'])

  app.locals.printJS  = function (data) {
    return JSON.stringify(data, null, '  ')
  }

  app.locals.formatDate = function formatDate(data) {
    var formatedDate = moment(data).format('DD/MM/YYYY HH:mm')
    return formatedDate === 'Invalid date' ? '' : formatedDate
  }

  function filterQuery(prefix, value) {
    if (value === '' || value === null || typeof value === 'undefined') return
    return value
  }

  app.locals.mergeQueries = function mergeQueries(route, _query, params = {}) {
    const parsedroute = url.parse(route)
    const initParams  = parsedroute.query ? qs.parse( parsedroute.query ) : {}
    route             = parsedroute.pathname
    params  = merge(initParams, _query, params)
    params  = qs.stringify(params, { filter: filterQuery })
    return Object.keys(params).length ? `${route}?${params}` : route
  }

  app.locals.getSorting = function getSorting(key, currentSorting) {
    const sorting = {
      sort: key,
      dir:  'desc',
    }
    if (key !== currentSorting.sort) return sorting
    if (currentSorting.dir === 'asc' ) return {
      sort: null,
      dir:  null,
    }
    sorting.dir = 'asc'
    return sorting
  }

  // those datas need to be refreshed on every request
  // and also not exposed to `app` but to `res` ^^
  app.use(function exposeDataToViews(req, res, next) {
    res.locals._query   = req.query
    res.locals._path    = req.path
    res.locals._user    = req.user ? req.user : {}
    if (config.isDev) {
      res.locals._debug = JSON.stringify({
        _user:    res.locals._user,
        messages: req.session && req.session.flash,
        _config:  app.locals._config,
        _query:   res.locals._query,
      }, null, '  ')
    }
    next()
  })

  //----- MORE I18N

  // take care of language query params
  // http://stackoverflow.com/questions/19539332/localization-nodejs-i18n
  app.use( (req, res, next) => {
    if (req.query.lang) {
      res.setLocale(req.query.lang)
      res.cookie('badsender', req.query.lang, { maxAge: 900000, httpOnly: true })
    }
    next()
  })

  //----- PARAMS CHECK

  // regexp for checking valid mongoDB Ids
  // http://expressjs.com/en/api.html#app.param
  // http://stackoverflow.com/questions/20988446/regex-for-mongodb-objectid#20988824
  app.param(['companyId', 'userId', 'wireId', 'creationId'], checkMongoId)
  function checkMongoId(req, res, next, mongoId) {
    if (/^[a-f\d]{24}$/i.test(mongoId)) return next()
    console.log('test mongoId INVALID', mongoId)
    next({status: 404})
  }

  app.param(['placeholderSize'], (req, res, next, placeholderSize) => {
    if ( /(\d+)x(\d+)\.png/.test(placeholderSize) ) return next()
    console.log('placeholder format INVALID', placeholderSize)
    next({status: 404})
  })

  //----- ADMIN

  // connection
  app.post('/admin/login', session.authenticate('local', {
    successRedirect: '/admin',
    failureRedirect: '/admin/login',
    failureFlash:     true,
    successFlash:     true,
  }))
  app.get('/admin/login',                         render.adminLogin)
  app.get('/admin',                               guard('admin'), companies.list)
  // companies
  app.all('/companies*',                          guard('admin'))
  app.get('/companies/:companyId/new-user',       users.show)
  app.get('/companies/:companyId/new-wireframe',  wireframes.show)
  app.get('/companies/:companyId?',               companies.show)
  app.post('/companies/:companyId?',              companies.update)
  // app.post('/users/:userId/delete',               companies.delete)
  // users' wireframes
  app.all('/users*',                              guard('admin'))
  app.get('/users/:userId/wireframe/:wireId?',    wireframes.show)
  // users
  app.get('/users/:userId/restore',               users.activate)
  app.delete('/users/:userId',                    users.deactivate)
  app.post('/users/reset',                        users.adminResetPassword)
  app.get('/users/:userId',                       users.show)
  app.post('/users/:userId?',                     users.update)
  app.get('/users',                               users.list)

  app.get('/wireframes/:wireId/delete',           guard('admin'), wireframes.remove)
  app.get('/wireframes/:wireId/markup',           guard('user'),  wireframes.getMarkup)
  app.get('/wireframes/:wireId',                  guard('admin'), wireframes.show)
  app.post('/wireframes/:wireId?',                guard('admin'), wireframes.update)
  app.get('/wireframes',                          guard('admin'), wireframes.list)

  app.all('/transfer/:creationId',                guard('admin'))
  app.get('/transfer/:creationId',                creationTransfer.get)
  app.post('/transfer/:creationId',               creationTransfer.post)

  //----- PUBLIC

  app.post('/login', session.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash:     true,
  }))
  app.get('/login',                         guard('no-session'), render.login)
  app.get('/forgot',                        guard('no-session'), render.forgot)
  app.post('/forgot',                       guard('no-session'), users.userResetPassword)
  app.get('/password/:token',               guard('no-session'), users.showSetPassword)
  app.post('/password/:token',              guard('no-session'), users.setPassword)

  app.get('/logout',                        guard('user'), session.logout)
  app.get('/img/:imageName',                images.read)
  app.get('/placeholder/:placeholderSize',  images.checkImageCache, images.placeholder)
  app.get('/resize/:sizes/:imageName',      images.checkImageCache, images.checkSizes, images.resize)
  app.get('/cover/:sizes/:imageName',       images.checkImageCache, images.checkSizes, images.cover)
  app.get('/img/',                          images.handleOldImageUrl)

  //----- USER

  app.all('/editor*',                       guard('user'))
  app.get('/editor/:creationId/upload',     creations.listImages)
  app.post('/editor/:creationId/upload',    creations.upload)
  app.get('/editor/:creationId',            creations.show)
  app.post('/editor/:creationId',           creations.update)
  app.get('/editor',                        creations.create)

  app.all('/creation*',                       guard('user'))
  // This should replace GET /editor
  // app.post('/creations',                  (req, res, next) => res.redirect('/'))
  app.get('/creations/:creationId/duplicate', creations.duplicate)
  app.post('/creations/:creationId/send',     download.send)
  app.post('/creations/:creationId/zip',      download.zip)
  app.delete('/creations',                    creations.bulkRemove)
  app.patch('/creations',                     creations.updateLabels)
  app.get('/creations',                       (req, res, next) => res.redirect('/') )

  app.get('/new-creation',                    guard('user'), wireframes.customerList)
  app.get('/',                                guard('user'), creations.customerList)

  //////
  // ERROR HANDLING
  //////

  // everyhting that go there without an error should be treated as a 404
  app.use(function (req, res, next) {
    if (req.xhr) return  res.status(404).send('not found')
    return res.render('error-404')
  })

  app.use(function (err, req, res, next) {
    var status = err.status || err.statusCode || (err.status = 500)
    console.log('error handling', status)
    if (status >= 500) {
      console.log(util.inspect(err, {showHidden: true}))
      console.trace(err)
    }

    // force status for morgan to catch up
    res.status(status)
    // different formating
    if (req.xhr) return res.send(err)
    if (status === 404) return res.render('error-404')
    if (!err.stacktrace) err.stacktrace = err.stack || new Error(err).stack
    return res.render('error-default', {err})
  })

  //////
  // LAUNCHING
  //////

  config.setup.then(function endSetup() {
    var server = app.listen(config.PORT, function endInit() {
      console.log(
        chalk.green('Server is listening on port'), chalk.cyan(server.address().port),
        chalk.green('on mode'), chalk.cyan(config.NODE_ENV)
      )
    })
  })
}
