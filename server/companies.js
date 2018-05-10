'use strict'

const chalk        = require('chalk')
const createError  = require('http-errors')
const asyncHandler = require('express-async-handler')

const config                = require('./config')
const { handleValidatorsErrors,
  Companies, Users,
  Wireframes, Creations }   = require('./models')

async function list(req, res, next) {
  const companies = await Companies
    .find({})
    .sort({ createdAt: -1 })

  res.render('company-list', {
    data: { companies }
  })
}

function show(req, res, next) {
  var companyId     = req.params.companyId
  if (!companyId) return res.render('company-new-edit')
  var getCompany    = Companies.findById(companyId)
  var getUsers      = Users.find({
    _company:       companyId,
    isDeactivated:  { $ne: true },
  }).sort({ createdAt: -1 })
  var getWireframes = Wireframes.find({_company: companyId}).sort({ createdAt: -1 })
  var getCreations  = Creations
  .find({_company: companyId, }, '_id name _user _wireframe createdAt updatedAt')
  .populate('_user', '_id name email')
  .populate('_wireframe', '_id name')
  .sort({ updatedAt: -1})

  Promise
  .all( [ getCompany, getUsers, getWireframes, getCreations ] )
  .then( dbResponse => {
    const [company, users, wireframes, creations] = dbResponse
    if (!company) return next(createError(404))
    res.render('company-new-edit', {data: {
      company:    company,
      users:      users,
      wireframes: wireframes,
      creations:  creations,
    }})
  })
  .catch(next)
}

async function update(req, res, next) {
  const { companyId } = req.params
  const dbRequest     = companyId ?
    Companies.findByIdAndUpdate(companyId, req.body, {runValidators: true})
    : new Companies(req.body).save()

  try {
    const company = await dbRequest
    res.redirect(`/companies/${company._id}`)
  } catch( dbError ) {
    handleValidatorsErrors(dbError, req, res, next)
  }
}

module.exports = {
  list:       asyncHandler( list ),
  show:       show,
  update:     asyncHandler( update ),
}
