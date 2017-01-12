'use strict'

const { extend, pick }  = require('lodash')
const chalk             = require('chalk')
const nodemailer        = require('nodemailer')
const wellknown         = require('nodemailer-wellknown')
const createError       = require('http-errors')

const config            = require('./config')

let mailConfig  = config.emailTransport
if (mailConfig.service) {
  mailConfig    = extend({}, mailConfig, wellknown(mailConfig.service))
  delete mailConfig.service
}
console.log('try to initalize nodemailer with config:')
console.log(mailConfig)

var transporter = nodemailer.createTransport(config.emailTransport)

transporter
.verify()
.then(function () {
  console.log(chalk.green('[EMAIL] transport creation – SUCCESS'))
})
.catch(function (err) {
  console.log(chalk.red('[EMAIL] transport creation – ERROR'))
  console.trace(err)
})

function send(options) {
  var mailOptions = extend({}, options, pick( config.emailOptions, ['from'] ) )
  return new Promise(function (resolve, reject) {
    transporter
    .sendMail(mailOptions)
    .then(function (info) {
      console.log(chalk.green('email send to', info.accepted))
      resolve(info)
    })
    .catch(function (err) {
      console.log(chalk.red('email error'))
      const message = err.code === 'ECONNREFUSED' ?
      'smtp connection failed'
      : 'email error'
      reject(createError(500, message))
    })
  })
}

module.exports = {
  transporter:  transporter,
  send:         send,
}
