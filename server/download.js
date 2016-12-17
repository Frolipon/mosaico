'use strict'

const _             = require('lodash')
const url           = require('url')
const path          = require('path')
const htmlEntities  = require('he')
const getSlug       = require('speakingurl')
const packer        = require('zip-stream')
const cheerio       = require('cheerio')
const archiver      = require('archiver')
const request       = require('request')
const createError   = require('http-errors')

const mail          = require('./mail')
const config        = require('./config')
const { Creations, isFromCompany, } = require('./models')

//----- UTILS

function secureHtml(html) {
  // replace all tabs by spaces so `he` don't replace them by `&#x9;`
  html      = html.replace(/\t/g, ' ')
  html      = htmlEntities.encode(html, {
    useNamedReferences: true,
    allowUnsafeSymbols: true,
  })
  return html
}

//////
// MAIL
//////

function send(req, res, next) {
  if (!req.xhr) return next(createError(501)) // Not Implemented
  const { user, body }  = req
  const { creationId }  = req.params

  Creations
  .findById(creationId)
  .then(onCreation)
  .catch(next)

  function onCreation(creation) {
    if (!creation) return next(createError(404))
    if (!isFromCompany(user, creation._company)) return next(createError(401))
    const html = secureHtml(req.body.html)
    mail
    .send({
      to:       body.rcpt,
      replyTo:  user.email,
      subject:  config.emailOptions.testSubjectPrefix + creation.name,
      html:     html,
    })
    .then( info => {
      console.log('Message sent: ', info.response)
      res.send(`OK: ${info.response}` )
    })
    .catch(next)
  }
}

//////
// DOWNLOAD
//////

const imagesFolder = 'images'
// for doc see:
// https://github.com/archiverjs/node-archiver/blob/master/examples/express.js

function zip(req, res, next) {
  const { user, body }  = req
  const { creationId }  = req.params

  Creations
  .findById(creationId)
  .then(onCreation)
  .catch(next)

  function onCreation(creation) {
    if (!creation) return next(createError(404))
    if (!isFromCompany(user, creation._company)) return next(createError(401))

    const archive = archiver('zip')
    let { html }  = body
    let $         = cheerio.load(html)
    let name      = getName(creation.name)

    console.log('download zip', name)

    // We only take care of images in the HTML
    // No <style> CSS parsing for now. May be implemented later
    let $images   = $('img')
    // will be used to download images
    let imgUrls   = $images.map( (i, el) => $(el).attr('src')).get()
    // make a relative path
    // Don't use Cheerio because when exporting some mess are donne with ESP tags
    let imgBases  = _.uniq(imgUrls.map(getImageUrlWithoutName))
    imgBases.forEach( (imgBase) => {
      let search  = new RegExp(`src="${imgBase}`, 'g')
      html        = html.replace(search, `src="${imagesFolder}/`)
    })

    archive.on('error', next)

    // on stream closed we can end the request
    archive.on('end', () => {
      console.log('Archive wrote %d bytes', archive.pointer())
      res.end()
    })

    //set the archive name
    res.attachment(`${name}.zip`)

    //this is the streaming magic
    archive.pipe(res)

    // Add html with relatives url
    archive.append(secureHtml(html), {
      name:   `${name}.html`,
      prefix: `${name}/`,
    })

    // Pipe all images
    imgUrls.forEach( (imageUrl, index) => {
      let imageName = getImageName(imageUrl)
      archive.append(request(imageUrl), {
        name:   imageName,
        prefix: `${name}/${imagesFolder}/`
      })
    })

    archive.finalize()

  }
}

function getName(name) {
  name = name || 'email'
  return getSlug(name.replace(/\.[0-9a-z]+$/, ''))
}

function getImageName(imageUrl) {
  return path.basename( url.parse(imageUrl).pathname )
}

function getImageUrlWithoutName(imageUrl) {
  return imageUrl.replace(getImageName(imageUrl), '')
}

module.exports = {
  send,
  zip,
}
