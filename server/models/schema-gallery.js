'use strict'

const { Schema }    = require('mongoose')
const { ObjectId }  = Schema.Types
const { Types }     = require('mongoose')

const { normalizeString } = require('./utils')
const { CompanyModel }    = require('./names')

// This table is used to add a visible information on the images

const GallerySchema = Schema({
  creationOrWireframeId: {
    type:       ObjectId,
    unique:     true,
    required:   true,
  },
  files: {
    type:       [],
  },
}, { timestamps: false })

// http://stackoverflow.com/questions/18324843/easiest-way-to-copy-clone-a-mongoose-document-instance#answer-25845569
GallerySchema.methods.duplicate = function duplicate( newCreationId ) {
  const oldId         = this._id.toString()
  const newId         = Types.ObjectId()
  const oldCreationId = this.creationOrWireframeId.toString()

  this._id                    = newId
  this.isNew                  = true
  this.creationOrWireframeId  = newCreationId

  // update the files names & path
  this.files                  = this.files.map( file => {
    Object.keys( file ).forEach( key => {
      file[ key ] = file[ key ].replace( oldCreationId, newCreationId )
    })
    return file
  })

  this.markModified( 'files' )

  return this
}

module.exports = GallerySchema
