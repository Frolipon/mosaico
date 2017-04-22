'use strict'

const passport      = require('passport')
const LocalStrategy = require('passport-local').Strategy
const session       = require('express-session')
const flash         = require('express-flash')
const MongoStore    = require('connect-mongo')(session)
const createError   = require('http-errors')

const config        = require('./config')
const { connection,
  Users }           = require('./models')

var adminUser = {
  isAdmin:  true,
  id:       config.admin.id,
  email:    config.emailOptions.from,
  name:     'admin',
}

passport.use(new LocalStrategy(
  function(username, password, done) {
    // admin
    if (username === config.admin.username) {
      if (password === config.admin.password) {
        return done(null , adminUser)
      }
      return done(null, false, { message: 'password.error.incorrect' })
    }
    // user
    Users
    .findOne({
      email:          username,
      isDeactivated:  { $ne: true },
      token:          { $exists: false },
    })
    .then(function (user) {
      if (!user) return done(null, false, {message: 'password.error.nouser'})
      var isPasswordValid = user.comparePassword(password)
      if (!isPasswordValid) return done(null, false, { message: 'password.error.incorrect' })
      return done(null, user)
    })
    .catch(function (err) {
      return done(null, false, err)
    })
  }
))

passport.serializeUser( (user, done) => {
  done(null, user.id)
})

passport.deserializeUser( (id, done) => {
  if (id === config.admin.id) return done(null, adminUser)
  Users
  .findOne({
    _id:            id,
    isDeactivated:  { $ne: true },
    token:          { $exists: false },
  })
  .then( user  => done(null, user) )
  .catch( err => done(null, false, err) )
})

function init(app) {
  app.use(session({
    secret:             'keyboard cat',
    resave:             false,
    saveUninitialized:  false,
    store:              new MongoStore({ mongooseConnection: connection }),
  }))
  app.use( flash() )
  app.use( passport.initialize() )
  app.use( passport.session() )
}

function guard(role) {
  if (!role) role = 'user'
  var isAdminRoute = role === 'admin'
  return function guardRoute(req, res, next) {
    var user = req.user
    // connected user shouldn't acces those pages
    if (role === 'no-session') {
      if (user) return user.isAdmin ? res.redirect('/admin') : res.redirect('/')
    } else {
      // non connected user shouldn't acces those pages
      if (!user) {
        return isAdminRoute ? res.redirect('/admin/login') : res.redirect('/login')
      }
      // non admin user shouldn't acces those pages
      if (isAdminRoute && !user.isAdmin) return next(createError(401))
    }
    next()
  }
}

function logout(req, res, next) {
  var isAdmin = req.user.isAdmin
  req.logout()
  res.redirect(isAdmin ? '/admin' : '/')
}

module.exports = {
  init:         init,
  session:      session,
  passport:     passport,
  // without bind, passport is failing
  authenticate: passport.authenticate.bind(passport),
  guard:        guard,
  logout:       logout,
}
