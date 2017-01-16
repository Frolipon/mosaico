'use strict'

const { Schema, Types } = require('mongoose')
const { ObjectId }      = Schema.Types

const { normalizeString } = require('./utils')
const { UserModel, WireframeModel, CompanyModel } = require('./names')

const CreationSchema  = Schema({
  name: {
    type:     String,
    set:      normalizeString,
    required: true,
  },
  // _user can't be required: admin doesn't set a _user
  _user: {
    type:     ObjectId,
    ref:      UserModel,
  },
  // replicate user name for ordering purpose
  author: {
    type:     String,
    set:      normalizeString,
  },
  _wireframe: {
    type:     ObjectId,
    required: true,
    ref:      WireframeModel,
  },
  // replicate wireframe name for ordering purpose
  wireframe: {
    type:       String,
    set:        normalizeString,
  },
  // _company can't be required: admin doesn't have a _company
  _company: {
    type:     ObjectId,
    ref:      CompanyModel,
  },
  tags: {
    type:     [],
  },
  // http://mongoosejs.com/docs/schematypes.html#mixed
  data: { },

}, { timestamps: true })

CreationSchema.virtual('key').get(function () {
  return this._id
})

function wireframeLoadingUrl(wireframeId) {
  return `/wireframes/${wireframeId}/markup`
}

// path to load a template
CreationSchema.virtual('template').get(function () {
  return wireframeLoadingUrl(this._wireframe)
})

CreationSchema.virtual('created').get(function () {
  return this.createdAt.getTime()
})

CreationSchema.virtual('changed').get(function () {
  return this.updatedAt.getTime()
})

function creationUrls(creationId) {
  return {
    update:     `/editor/${creationId}`,
    duplicate:  `/creations/${creationId}/duplicate`,
    delete:     `/creations/${creationId}?_method=DELETE`,
    send:       `/creations/${creationId}/send`,
    zip:        `/creations/${creationId}/zip`,
  }
}

CreationSchema.virtual('url').get(function () {
  return creationUrls(this._id)
})

CreationSchema.virtual('mosaico').get(function () {
  var mosaicoEditorData = {
    meta: {
      id:           this._id,
      _wireframe:   this._wireframe,
      name:         this.name,
      template:     wireframeLoadingUrl(this._wireframe),
      url:          creationUrls(this._id),
    },
    data: this.data,
  }
  return mosaicoEditorData
})

// http://stackoverflow.com/questions/18324843/easiest-way-to-copy-clone-a-mongoose-document-instance#answer-25845569
CreationSchema.methods.duplicate = function duplicate(_user) {
  var oldId       = this._id.toString()
  var newId       = Types.ObjectId()
  this._id        = newId
  this.name       = `${this.name.trim()} copy`
  this.isNew      = true
  this.createdAt  = new Date()
  this.updatedAt  = new Date()
  // set new user
  if (_user.id) {
    this._user  = _user._id
    this.author = _user.name
  }
  // update all templates infos
  if (this.data) {
    var data    = JSON.stringify(this.data)
    var replace = new RegExp(oldId, 'gm')
    data        = data.replace(replace, newId.toString())
    this.data   = JSON.parse(data)
    this.markModified('data')
  }

  return this.save()
}

module.exports = CreationSchema
