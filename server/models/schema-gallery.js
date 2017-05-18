'use strict'

const { Schema }    = require('mongoose')
const { ObjectId }  = Schema.Types

const { normalizeString } = require('./utils')
const { CompanyModel }    = require('./names')

// This table is used to add a visible information on the images

const GallerySchema = Schema({
  creationOrWireframeId: {
    type:       ObjectId,
    unique:     true,
    required:   true,
    // set:        normalizeString,
  },
  files: {
    type:       [],
    // unique:     true,
    // required:   true,
    // set:        normalizeString,
  },
}, { timestamps: false })

module.exports = GallerySchema
