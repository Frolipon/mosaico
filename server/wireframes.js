'use strict'

var _                       = require('lodash')
var chalk                   = require('chalk')

var config                  = require('./config')
var filemanager             = require('./filemanager')
var DB                      = require('./database')
var slugFilename            = require('../shared/slug-filename.js')
var Wireframes              = DB.Wireframes
var Companies               = DB.Companies
var Creations               = DB.Creations
var handleValidatorsErrors  = DB.handleValidatorsErrors

function list(req, res, next) {
  Wireframes
  .find({})
  .populate('_user')
  .populate('_company')
  .then(function (wireframes) {
    res.render('wireframe-list', {
      data: { wireframes: wireframes, }
    })
  })
  .catch(next)
}

function show(req, res, next) {
  var companyId = req.params.companyId
  var wireId    = req.params.wireId

  if (!wireId) {
    return Companies
    .findById(companyId)
    .then( (company) => {
      res.render('wireframe-new-edit', { data: { company: company, }} )
    })
    .catch(next)
  }

  Wireframes
  .findById(req.params.wireId)
  .populate('_user')
  .populate('_company')
  .then( (wireframe) => {
    res.render('wireframe-new-edit', { data: { wireframe: wireframe, }} )
  })
  .catch(next)
}

function getMarkup(req, res, next) {
  var hasCompany = req.user._company != null

  Wireframes
  .findById(req.params.wireId)
  .then(onWireframe)
  .catch(next)

  function onWireframe(wireframe) {
    // TODO – remove hasCompany when refactor is done
    var isAuthorized = req.user.isAdmin || ( hasCompany ?
      wireframe._company.toString() === req.user._company.toString()
      : wireframe._user.toString() === req.user.id )

    if (!isAuthorized) {
      return res.sendStatus(401)
    }
    if (!wireframe.markup) {
      res.status(404)
      return next()
    }
    if (req.xhr) return res.send(wireframe.markup)
    // let download content
    res.setHeader('Content-disposition', 'attachment; filename=' + wireframe.name + '.html')
    res.setHeader('Content-type', 'text/html')
    res.write(wireframe.markup)
    return res.end()
  }
}

function update(req, res, next) {
  var wireId    = req.params.wireId

  filemanager
  .parseMultipart(req, {
    prefix:     wireId,
    formatter: 'wireframes',
  })
  .then(onParse)
  .catch(next)

  function onParse(body) {
    // as of now ./parseMultipart#wireframes formatter return both files & fields
    // could simply return fields
    body = body.fields
    console.log('files success')
    var dbRequest = wireId ?
      Wireframes.findById(wireId)
      : Promise.resolve(new Wireframes())

    dbRequest
    .then(function (wireframe) {
      // custom update function
      wireframe         = _.assignIn(wireframe, _.omit(body, ['images']))
      // merge images array
      // could be done in `images setter`
      // but won't be able to remove files…
      wireframe.images  = _.isArray(wireframe.images)
        ? wireframe.images.concat(body.images)
        : body.images
      wireframe.images = _.compact( _.uniq(wireframe.images) ).sort()
      // form image name may differ from uploaded image name
      // make it coherent
      wireframe.images = wireframe.images.map( img => slugFilename(img) )
      return wireframe.save()
    })
    .then(function (wireframe) {
      console.log('wireframe success', wireId ? 'updated' : 'created')
      req.flash('success', wireId ? 'updated' : 'created')
      return res.redirect(wireframe.url.show)
    })
    .catch(err => handleValidatorsErrors(err, req, res, next))
  }
}

function remove(req, res, next) {
  var wireframeId = req.params.wireId
  console.log('REMOVE WIREFRAME', wireframeId)
  Creations
  .find({_wireframe: wireframeId})
  .then(function (creations) {
    console.log(creations.length, 'to remove')
    creations = creations.map(function (creation) {
      creation.remove()
    })
    return Promise.all(creations)
  })
  .then(function (deletedCreations) {
    return Wireframes.findByIdAndRemove(wireframeId)
  })
  .then(function (deletedWireframe) {
    res.redirect(req.query.redirect)
  })
  .catch(next)
}

module.exports = {
  list:       list,
  show:       show,
  update:     update,
  remove:     remove,
  getMarkup:  getMarkup,
}
