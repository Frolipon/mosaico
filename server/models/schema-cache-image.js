const { Schema }    = require('mongoose')
const { ObjectId }  = Schema.Types

const { normalizeString } = require('./utils')
const { CompanyModel }    = require('./names')

const CacheimageSchema = Schema({
  path: {
    type:       String,
    // unique:     true,
    required:   true,
    set:        normalizeString,
  },
  name: {
    type:       String,
    // unique:     true,
    required:   true,
    set:        normalizeString,
  },
}, { timestamps: false })

module.exports = CacheimageSchema
