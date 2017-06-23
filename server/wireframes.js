'use strict'

const _                     = require('lodash')
const chalk                 = require('chalk')
const createError           = require('http-errors')

const config                = require('./config')
const filemanager           = require('./filemanager')
const slugFilename          = require('../shared/slug-filename.js')
const { handleValidatorsErrors,
  isFromCompany, Companies,
  Wireframes, Creations }   = require('./models')

function list(req, res, next) {
  Wireframes
  .find({})
  .populate('_user')
  .populate('_company')
  .then( (wireframes) => {
    res.render('wireframe-list', {
      data: { wireframes: wireframes, }
    })
  })
  .catch(next)
}

function customerList(req, res, next) {
  const isAdmin           = req.user.isAdmin
  const filter            = isAdmin ? {} : { _company: req.user._company }
  const getWireframes     = Wireframes.find( filter )
  // Admin as a customer should see which template is coming from which company
  if (isAdmin) getWireframes.populate('_company')

  getWireframes
  .sort({ name: 1 })
  .then( (wireframes) => {
    // can't sort populated fields
    // http://stackoverflow.com/questions/19428471/node-mongoose-3-6-sort-query-with-populated-field/19450541#19450541
    if (isAdmin) {
      wireframes = wireframes.sort( (a, b) => {
        let nameA = a._company.name.toLowerCase()
        let nameB = b._company.name.toLowerCase()
        if (nameA < nameB) return -1
        if (nameA > nameB) return 1
        return 0;
      })
    }
    res.render('customer-wireframe', {
      data: {
        wireframes: wireframes,
      }
    })
  })
  .catch(next)
}

function show(req, res, next) {
  const companyId = req.params.companyId
  const wireId    = req.params.wireId

  // CREATE
  if (!wireId) {
    return Companies
    .findById( companyId )
    .then( company => {
      res.render('wireframe-new-edit', { data: { company, }} )
    })
    .catch(next)
  }

  // UPDATE
  Wireframes
  .findById( req.params.wireId )
  .populate('_user')
  .populate('_company')
  .then( wireframe => {
    if (!wireframe) return next( createError(404) )
    res.render('wireframe-new-edit', { data: { wireframe, }} )
  })
  .catch(next)
}

function getMarkup(req, res, next) {
  Wireframes
  .findById(req.params.wireId)
  .then(onWireframe)
  .catch(next)

  function onWireframe(wireframe) {
    if (!isFromCompany(req.user, wireframe._company)) return next(createError(401))
    if (!wireframe.markup) return next(createError(404))
    if (req.xhr) return res.send(wireframe.markup)
    // let download content
    res.setHeader('Content-disposition', `attachment; filename=${wireframe.name}.html`)
    res.setHeader('Content-type', 'text/html')
    res.write(wireframe.markup)
    return res.end()
  }
}

function update(req, res, next) {
  const { wireId } = req.params

  filemanager
  .parseMultipart(req, {
    // add a `wireframe` prefix to differ from user uploaded template assets
    prefix:     `wireframe-${wireId}`,
    formatter:  'wireframes',
  })
  .then(onParse)
  .catch(next)

  function onParse( body ) {
    console.log('files success')
    var dbRequest = wireId ?
      Wireframes.findById( wireId )
      : Promise.resolve( new Wireframes() )

    dbRequest
    .then( wireframe => {
      const nameChange  = body.name !== wireframe.name
      // custom update function
      wireframe         = _.assignIn(wireframe, _.omit(body, ['images', 'assets']))
      wireframe.assets  = _.assign( {}, wireframe.assets || {}, body.assets )

      // copy wireframe name in creation
      if (wireId && nameChange) {
        Creations
        .find( { _wireframe: wireId } )
        .then( creations => {
          creations.forEach( creation => {
            creation.wireframe = body.name
            creation.save().catch( console.log )
          })
        })
        .catch( console.log )
      }
      // return
      return wireframe.save()
    })
    .then( wireframe => {
      console.log('wireframe success', wireId ? 'updated' : 'created')
      req.flash('success', wireId ? 'updated' : 'created')
      return res.redirect(wireframe.url.show)
    })
    .catch( err => handleValidatorsErrors(err, req, res, next) )
  }
}

function remove(req, res, next) {
  var wireframeId = req.params.wireId
  console.log('REMOVE WIREFRAME', wireframeId)
  Creations
  .find({_wireframe: wireframeId})
  .then( (creations) => {
    console.log(creations.length, 'to remove')
    creations = creations.map( creation => creation.remove() )
    return Promise.all(creations)
  })
  .then( (deletedCreations) =>  Wireframes.findByIdAndRemove(wireframeId) )
  .then( (deletedWireframe) => res.redirect(req.query.redirect) )
  .catch(next)
}

module.exports = {
  list:         list,
  customerList: customerList,
  show:         show,
  update:       update,
  remove:       remove,
  getMarkup:    getMarkup,
}
