'use strict'

const util      = require('util')
const chalk     = require('chalk')
const mongoose  = require('mongoose')

mongoose.Promise    = global.Promise // Use native promises

const UserSchema        = require('./schema-user')
const WireframeSchema   = require('./schema-wireframe')
const CreationSchema    = require('./schema-creation')
const CompanySchema     = require('./schema-company')
const CacheimageSchema  = require('./schema-cache-image')
const GallerySchema     = require('./schema-gallery')
const {
  UserModel,
  WireframeModel,
  CreationModel,
  CompanyModel,
  CacheimageModel,
  GalleryModel,
} = require('./names')

//////
// ERRORS HANDLING
//////

// normalize errors between mongoose & mongoDB
function handleValidationErrors(err) {
  console.log('handleValidationErrors')
  console.log(util.inspect(err))
  // mongoose errors
  if (err.name === 'ValidationError') {
    return Promise.resolve(err.errors)
  }
  // duplicated field
  if (err.name === 'MongoError' && err.code === 11000) {
    // mongo doens't provide field name out of the box
    // fix that based on the error message
    var fieldName = /index:\s([a-z]*)/.exec(err.message)[1]
    var errorMsg  = {}
    errorMsg[fieldName] = {
      message: `this ${fieldName} is already taken`,
    }
    return Promise.resolve(errorMsg)
  }
  return Promise.reject(err)
}

// take care of everything
function formatErrors(err, req, res, next) {
  handleValidationErrors(err)
  .then( (errorMessages) => {
    req.flash('error', errorMessages)
    res.redirect(req.path)
  })
  .catch(next)
}

//////
// HELPERS
//////

function isFromCompany(user, companyId) {
  if (!user) return false
  if (user.isAdmin) return true
  // creations from admin doesn't gave a companyId
  if (!companyId) return false
  return user._company.toString() === companyId.toString()
}

// users can access only same company content
// admin everything
function addCompanyFilter(user, filter) {
  if (user.isAdmin) return filter
  filter._company = user._company
  return filter
}

// Strict difference from above:
// Admin can't content with a company
function addStrictCompanyFilter(user, filter) {
  const _company  = user.isAdmin ? { $exists: false } : user._company
  filter._company = _company
  return filter
}

//////
// EXPORTS
//////

const Users       = mongoose.model( UserModel, UserSchema )
const Wireframes  = mongoose.model( WireframeModel, WireframeSchema )
const Creations   = mongoose.model( CreationModel, CreationSchema )
const Companies   = mongoose.model( CompanyModel, CompanySchema )
const Cacheimages = mongoose.model( CacheimageModel, CacheimageSchema )
const Galleries   = mongoose.model( GalleryModel, GallerySchema )

module.exports    = {
  mongoose,
  formatErrors,
  isFromCompany,
  addCompanyFilter,
  addStrictCompanyFilter,
  // Compiled schema
  Users,
  Wireframes,
  Creations,
  Companies,
  Cacheimages,
  Galleries,
}
