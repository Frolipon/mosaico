'use strict'

const chalk                 = require('chalk')
const createError           = require('http-errors')
const { merge }             = require('lodash')

const config                = require('./config')
const { handleValidatorsErrors,
  Companies, Users,
  Wireframes, Creations }   = require('./models')

function list(req, res, next) {
  Users
  .find({})
  .populate('_company')
  .sort({ isDeactivated: 1, createdAt: -1  })
  .then(function onUsers(users) {
    return res.render('user-list', {
      data: { users: users, }
    })
  })
  .catch(next)
}

function show(req, res, next) {
  // company is for member creation…
  var companyId     = req.params.companyId
  // …userId when it's created :)
  var userId        = req.params.userId

  // CREATE
  if (companyId) {
    Companies
    .findById(companyId)
    .then( (company) => {
      res.render('user-new-edit', { data: {
        company: company,
      }})
    })
    .catch(next)
    return
  }

  const getUser       = Users.findById(userId).populate('_company')
  const getCreations  = Creations.find( { _user: userId } ).populate('_wireframe')

  // UPDATE
  Promise
  .all([getUser, getCreations])
  .then( (dbResponse) => {
    const user      = dbResponse[0]
    const creations = dbResponse[1]
    if (!user) return next(createError(404))
    res.render('user-new-edit', { data: {
      user:       user,
      creations:  creations,
    }})
  })
  .catch(next)
}

function update(req, res, next) {
  const { body }    = req
  const { userId }  = req.params
  const dbRequest   = userId ?
    Users.findById(userId)
    : Promise.resolve(new Users(body))

  dbRequest
  .then(handleUser)
  .catch(next)

  function handleUser(user) {
    const nameChange  = body.name !== user.name
    user              = merge(user, body)
    user
    .save()
    .then( user => res.redirect( user.url.show ) )
    .catch( err => handleValidatorsErrors(err, req, res, next) )

    // copy user name attribute in creation author
    if (userId && nameChange) {
      Creations
      .find({_user: userId})
      .then( creations => {
        creations.forEach( creation => {
          creation.author = body.name
          creation.save().catch(console.log)
        })
      })
      .catch(console.log)
    }
  }
}

function deactivate(req, res, next) {
  const { userId } = req.params

  Users
  .findById( userId )
  .then( handleUser )
  .catch( next )

  function handleUser(user) {
    user
    .deactivate()
    .then( user => res.redirect('/admin') )
    .catch( next )
  }
}

function adminResetPassword(req, res, next) {
  const { id } = req.body

  Users
  .findById(id)
  .then(handleUser)
  .catch(next)

  function handleUser(user) {
    if (!user) return next(createError(404))
    user
    .resetPassword(user.lang, 'admin')
    .then(user => {
      // reset from elsewhere
      if (req.body.redirect) return res.redirect(req.body.redirect)
      // reset from company page
      res.redirect(user.url.company)
    })
    .catch(next)
  }
}

function userResetPassword(req, res, next) {
  Users
  .findOne({
    email: req.body.username
  })
  .then(onUser)
  .catch(next)

  function onUser(user) {
    if (!user) {
      req.flash('error', 'invalid email')
      return res.redirect('/forgot')
    }
    user
    .resetPassword(req.getLocale(), 'user')
    .then( user => {
      req.flash('success', 'password has been reseted. You should receive an email soon')
      res.redirect('/forgot')
    })
    .catch(next)
  }
}

function setPassword(req, res, next) {
  Users
  .findOne({
    token: req.params.token,
    email: req.body.username,
  })
  .then( user => {
    if (!user) {
      req.flash('error', {message: 'no token or bad email address'})
      res.redirect(req.path)
      return Promise.resolve(false)
    }
    return user.setPassword(req.body.password, req.getLocale())
  })
  .then( user => {
    if (!user) return
    res.redirect('/login')
  })
  .catch(next)
}

module.exports = {
  list:               list,
  show:               show,
  update:             update,
  deactivate,
  adminResetPassword: adminResetPassword,
  userResetPassword:  userResetPassword,
  setPassword:        setPassword,
}
