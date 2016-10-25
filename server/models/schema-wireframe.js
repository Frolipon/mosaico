'use strict'

const { Schema }    = require('mongoose')
const { ObjectId }  = Schema.Types

const { normalizeString } = require('./utils')
const { CompanyModel }    = require('./names')


const WireframeSchema = Schema({
  name: {
    type:       String,
    unique:     true,
    required:   [true, 'name is required'],
    set:        normalizeString,
  },
  description: {
    type: String
  },
  _company: {
    type:       ObjectId,
    ref:        CompanyModel,
    required:   [true, 'company is required'],
  },
  markup: {
    type:       String,
  },
  images: {
    type:       [],
  },
}, { timestamps: true })

WireframeSchema.virtual('imgPath').get(function () {
  return `/img/${this._id}-`
})

WireframeSchema.virtual('hasMarkup').get(function () {
  return this.markup != null
})

WireframeSchema.virtual('url').get(function () {
  let userId      = this._user && this._user._id ? this._user._id : this._user
  let userUrl     = this._user ? `/users/${userId}` : '/users'
  let companyId   = this._company && this._company._id ? this._company._id : this._company
  let companyUrl  = this._company ? `/companies/${companyId}` : '/companies'
  // read should be `/companies/${this._company}/wireframs/${this._id}`
  return {
    read:      `/users/${this._user}/wireframe/${this._id}`,
    show:      `/wireframes/${this._id}`,
    backTo:    this._company ? companyUrl : userUrl,
    user:      userUrl,
    company:   companyUrl,
    delete:    `/wireframes/${this._id}/delete`,
    markup:    `/wireframes/${this._id}/markup`,
    imgCover:  `/img/${this._id}-_full.png`,
  }
})

module.exports = WireframeSchema
