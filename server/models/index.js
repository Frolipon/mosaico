'use strict'

const util      = require('util')
const chalk     = require('chalk')
const mongoose  = require('mongoose')

const config        = require('../config')
mongoose.Promise    = global.Promise // Use native promises
const connection    = mongoose.connect(config.database)

mongoose.connection.on('error', console.error.bind(console, chalk.red('[DB] connection error:')))
mongoose.connection.once('open', e =>  {
  console.log(chalk.green('[DB] connection OK'))
})


const UserSchema        = require('./schema-user')
const WireframeSchema   = require('./schema-wireframe')
const CreationSchema    = require('./schema-creation')
const CompanySchema     = require('./schema-company')
const { UserModel, WireframeModel, CreationModel, CompanyModel } = require('./names')

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
// EXPORTS
//////

const Users       = mongoose.model(UserModel, UserSchema)
const Wireframes  = mongoose.model(WireframeModel, WireframeSchema)
const Creations   = mongoose.model(CreationModel, CreationSchema)
const Companies   = mongoose.model(CompanyModel, CompanySchema)

module.exports    = {
  connection:       mongoose.connection,
  formatErrors:     formatErrors,
  // Compiled schema
  Users,
  Wireframes,
  Creations,
  Companies,
}
