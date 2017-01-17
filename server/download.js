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
    const $images  = $('img')
    // will be used to download images
    const imgUrls  = _.uniq( $images.map( (i, el) => $(el).attr('src') ).get() )
    // console.log(imgUrls)
    // make a relative path
    // Don't use Cheerio because when exporting some mess are donne with ESP tags
    // let imgBases  = _.uniq(imgUrls.map(getImageUrlWithoutName))
    imgUrls.forEach( (imgUrl) => {
      let search  = new RegExp(`src="${imgUrl}`, 'g')
      html        = html.replace(search, `src="${imagesFolder}/${getImageName(imgUrl)}`)
    })

    archive.on('error', next)

    // on stream closed we can end the request
    archive.on('end', () => {
      console.log('Archive wrote %d bytes', archive.pointer())
      res.end()
    })

    // set the archive name
    res.attachment(`${name}.zip`)

    // this is the streaming magic
    archive.pipe(res)

    // Add html with relatives url
    archive.append(secureHtml(html), {
      name:   `${name}.html`,
      prefix: `${name}/`,
    })

    // Pipe all images BUT don't add errored images
    const imagesRequest = imgUrls.map( imageUrl => {
      const dfd = defer()
      let imageName   = getImageName(imageUrl)
      let imgRequest  = request(imageUrl)
      imgRequest.on('response', response => {
        if (response.statusCode !== 200) return
        archive.append( imgRequest, {
          name:   imageName,
          prefix: `${name}/${imagesFolder}/`
        })
        dfd.resolve()
      })
      imgRequest.on('error', imgError => {
        console.log('[ZIP] errro during downloading', imageUrl)
        console.log(imgError)
        // still resolve, just don't add this errored image to the archive
        dfd.resolve()
      })
      return dfd
    })

    // Wait for all images to be requested before closing archive
    Promise
    .all( imagesRequest )
    .then( () => archive.finalize() )
  }
}

// http://lea.verou.me/2016/12/resolve-promises-externally-with-this-one-weird-trick/
function defer() {
  var res, rej
  var promise = new Promise((resolve, reject) => {
    res = resolve
    rej = reject
  })
  promise.resolve = res
  promise.reject  = rej
  return promise
}

function getName(name) {
  name = name || 'email'
  return getSlug(name.replace(/\.[0-9a-z]+$/, ''))
}

function getImageName(imageUrl) {
  return url
  .parse(imageUrl)
  .pathname
  .replace(/\//g, ' ')
  .trim()
  .replace(/\s/g, '-')
}

function getImageUrlWithoutName(imageUrl) {
  return imageUrl.replace(getImageName(imageUrl), '')
}

module.exports = {
  send,
  zip,
}
