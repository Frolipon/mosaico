'use strict'

const { Schema }    = require('mongoose')

const { normalizeString } = require('./utils')

const CompanySchema = Schema({
  name: {
    type:     String,
    required: [true, 'A name is required'],
    // http://mongoosejs.com/docs/api.html#schematype_SchemaType-unique
    // from mongoose doc:
    // violating the constraint returns an E11000 error from MongoDB when saving, not a Mongoose validation error.
    unique:   true,
    set:      normalizeString,
  },
  downloadMailingWithoutEnclosingFolder: {
    type:     Boolean,
    default:  false,
  },
}, { timestamps: true })

CompanySchema.virtual('url').get(function () {
  return {
    show:         `/companies/${this._id}`,
    delete:       `/companies/${this._id}/delete`,
    newUser:      `/companies/${this._id}/new-user`,
    newWireframe: `/companies/${this._id}/new-wireframe`,
  }
})

module.exports = CompanySchema
