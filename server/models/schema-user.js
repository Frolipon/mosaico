'use strict'

const { assign }    = require('lodash')
const fs            = require('fs')
const path          = require('path')
const { Schema }    = require('mongoose')
const { ObjectId }  = Schema.Types
const tmpl          = require('blueimp-tmpl')
const bcrypt        = require('bcryptjs')
const validator     = require('validator')
const randtoken     = require('rand-token')

const config              = require('../config')
const { normalizeString } = require('./utils')
const mail                = require('../mail')
const { CompanyModel }    = require('./names')

//////
// USER
//////

const UserSchema    = Schema({
  name: {
    type:     String,
    set:      normalizeString,
  },
  email: {
    type:     String,
    required: [true, 'Email address is required'],
    // http://mongoosejs.com/docs/api.html#schematype_SchemaType-unique
    // from mongoose doc:
    // violating the constraint returns an E11000 error from MongoDB when saving, not a Mongoose validation error.
    unique:   true,
    validate: [{
      validator: email => validator.isEmail(email),
      message:  '{VALUE} is not a valid email address',
    }],
    set:      normalizeString,
  },
  _company: {
    type:       ObjectId,
    ref:        CompanyModel,
    required:   [true, 'Company is required'],
  },
  password:   {
    type:     String,
    set:      encodePassword,
  },
  lang: {
    type:     String,
    default: 'en',
  },
  token: {
    type:     String,
  },
}, { timestamps: true })

function encodePassword(password) {
  if (typeof password === 'undefined') return void(0)
  return bcrypt.hashSync(password, 10)
}

UserSchema.virtual('status').get(function () {
  if (this.password)  return 'confirmed'
  if (this.token)     return 'password mail sent'
  return 'to be initialized'
})

UserSchema.virtual('fullname').get(function () {
  return this.name ? `${this.name} (${this.email})` : this.email
})

UserSchema.virtual('safename').get(function () {
  return this.name ? this.name : '—'
})

UserSchema.virtual('isReseted').get(function () {
  if (this.password)  return false
  if (this.token)     return true
  return false
})

// for better session handling
UserSchema.virtual('isAdmin').get(function () {
  return false
})

UserSchema.virtual('url').get(function () {
  let companyId   = this._company && this._company._id ? this._company._id : this._company
  return {
    show:     `/users/${this._id}`,
    delete:   `/users/${this._id}/delete`,
    company:  `/companies/${companyId}`,
  }
})

UserSchema.methods.resetPassword = function resetPassword(lang, type) {
  var user      = this
  user.password = void(0)
  user.token    = randtoken.generate(30)
  lang          = lang ? lang : 'en'

  return new Promise(function (resolve, reject) {
    user
    .save()
    .then(onSave)
    .catch(reject)

    function onSave(updatedUser) {
      return mail
      .send({
        to:       updatedUser.email,
        subject:  'badsender – password reset',
        text:     `here is the link to enter your new password http://${config.host}/password/${user.token}`,
        html:     tmpReset(getTemplateData('reset-password', lang, {
          type: type,
          url:  `http://${config.host}/password/${user.token}?lang=${lang}`,
        })),
      })
      .then( _ =>  resolve(updatedUser) )
      .catch(reject)
    }
  })
}

UserSchema.methods.setPassword = function setPassword(password, lang) {
  var user      = this
  user.token    = void(0)
  user.password = password
  lang          = lang ? lang : 'en'

  return new Promise(function (resolve, reject) {
    user
    .save()
    .then(onSave)
    .catch(reject)

    function onSave(updatedUser) {
      return mail
      .send({
        to:       updatedUser.email,
        subject:  'badsender – password reset',
        text:     `your password has been succesfully been reseted. connect at http://${config.host}/login`,
        html:     tmpReset(getTemplateData('reset-success', lang, {
          type: 'admin',
          url:  `http://${config.host}/login?lang=${lang}`,
        })),
      })
      .then( _ => resolve(updatedUser) )
      .catch(reject)
    }
  })
}

UserSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compareSync(password, this.password)
}

//////
// DEFINING mailing templates
//////

tmpl.load = function (id) {
  var filename = path.join(__dirname, `/../mailings/${id}.html`)
  return fs.readFileSync(filename, 'utf8')
}

// put in cache
var tmpReset = tmpl('reset-password')

function getTemplateData(templateName, lang, additionalDatas) {
  var i18n = {
    common: {
      fr: {
        contact: `Contacter Badsender : `,
        or: `ou`,
        // social: `Badsender sur les réseaux sociaux :`,
        social: `Badsender sur les r&eacute;seaux sociaux :`,
      },
      en: {
        contact: `contact Badsender: `,
        or: `or`,
        social: `Badsender on social networks:`,
      }
    },
    'reset-password': {
      fr: {
        title: `Bienvenue sur l'email builder de Badsender`,
        desc: `Cliquez sur le bouton ci-dessous pour initialiser votre mot de passe, ou copiez l'url suivante dans votre navigateur:`,
        reset: `INITIALISER MON MOT DE PASSE`,

      },
      en: {
        title: `Welcome to the Badsender's email builder`,
        desc: `Click the button below to reset your password, or copy the following URL into your browser:`,
        reset: `RESET MY PASSWORD`,
      }
    },
    'reset-success': {
      fr: {
        title: `Votre mot de passe a bien été réinitialisé`,
        desc: `Cliquez sur le bouton ci-dessous pour vous connecter, ou copiez l'url suivante dans votre navigateur:`,
        reset: `SE CONNECTER`,

      },
      en: {
        title: `Your password has been succesfully setted`,
        desc: `Click the button below to login, or copy the following URL into your browser:`,
        reset: `LOGIN`,
      }
    }
  }

  const traductions = assign({}, i18n.common[lang],  i18n[templateName][lang])
  return assign({}, {t: traductions}, additionalDatas)
}

//////
// EXPORTS
//////

module.exports = UserSchema
