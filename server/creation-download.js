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
const asyncHandler  = require('express-async-handler')

const defer         = require('./helpers/create-promise')
const mail          = require('./mail')
const config        = require('./config')
const {
  Creations,
  isFromCompany,
} = require('./models')

//----- UTILS

function isHttpUrl( uri ) {
  return /^http/.test( uri )
}

function secureHtml(html) {
  // replace all tabs by spaces so `he` don't replace them by `&#x9;`
  // `he` is an HTML entity encoder/decoder
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

const IMAGES_FOLDER = 'images'
// for doc see:
// https://github.com/archiverjs/node-archiver/blob/master/examples/express.js

async function zip(req, res, next) {
  const { user, body }  = req
  const { creationId }  = req.params
  const creation = await Creations
    .findById( creationId )
    .populate( `_company` )

  if (!creation) return next(createError(404))
  if (!isFromCompany(user, creation._company)) return next(createError(401))
  // admin doesn't have a company
  const { downloadMailingWithoutEnclosingFolder } = user.isAdmin ? config.admin
    : creation._company

  const archive = archiver( 'zip' )
  const name    = getName( creation.name )
  // prefix is `zip-stream` file prefix => our enclosing folder ^_^
  // !WARNING default mac unzip will always put it in an folder if more than 1 file
  // => test with The Unarchiver
  const prefix  = downloadMailingWithoutEnclosingFolder ? `` : `${name}/`
  let { html }  = body
  const $       = cheerio.load( html )

  console.log('download zip', name)

  // keep a track of every images for latter download
  // be careful to avoid data uri
  // relatives path are not handled:
  //  - the mailing should work also by email test
  //  - SO no need to handle them
  const $images     = $( 'img' )
  const imgUrls     = _.uniq( $images.map( (i, el) => $(el).attr('src') ).get().filter( isHttpUrl ) )
  const $background = $( '[background]' )
  const bgUrls      = _.uniq( $background.map( (i, el) => $(el).attr('background') ).get().filter( isHttpUrl ) )
  const $style      = $( '[style]' )
  const styleUrls   = []
  $style
  .filter( (i, el) => /url\(/.test($(el).attr('style')) )
  .each( (i, el) => {
    const urlReg    = /url\('?([^)']*)/
    const style     = $(el).attr('style')
    const result    = urlReg.exec( style )
    if ( result && result[1] && isHttpUrl( result[1] ) && !styleUrls.includes(result[1]) ) {
      styleUrls.push(result[1])
    }
  })
  const allImages   = _.uniq( [...imgUrls, ...bgUrls, ...styleUrls] )

  // change path to match downloaded images
  // Don't use Cheerio because:
  // - when exporting it's messing with ESP tags
  // - Cheerio won't handle IE comments
  allImages.forEach( imgUrl => {
    const escImgUrl   = _.escapeRegExp( imgUrl )
    const relativeUrl = `${ IMAGES_FOLDER }/${ getImageName(imgUrl) }`
    const search      = new RegExp( escImgUrl, 'g' )
    html              = html.replace( search, relativeUrl )
  })

  archive.on('error', next )

  // on stream closed we can end the request
  archive.on('end', () => {
    console.log( `Archive wrote ${archive.pointer()} bytes` )
    res.end()
  })

  // set the archive name
  res.attachment( `${name}.zip` )

  // this is the streaming magic
  archive.pipe( res )

  // Add html with relatives url
  archive.append( secureHtml(html), {
    prefix,
    name:   `${name}.html`,
  })

  // Pipe all images BUT don't add errored images
  const imagesRequest = allImages.map( imageUrl => {
    const dfd         = defer()
    const imageName   = getImageName(imageUrl)
    const imgRequest  = request(imageUrl)
    imgRequest.on('response', response => {
      // only happen images with a code of 200
      if (response.statusCode === 200) {
        archive.append( imgRequest, {
          prefix: `${prefix}${IMAGES_FOLDER}/`,
          name:   imageName,
        })
      }
      dfd.resolve()
    })
    imgRequest.on('error', imgError => {
      console.log('[ZIP] error during downloading', imageUrl)
      console.log(imgError)
      // still resolve, just don't add this errored image to the archive
      dfd.resolve()
    })
    return dfd
  })

  // Wait for all images to be requested before closing archive
  await Promise.all( imagesRequest )

  archive.finalize()

}

function getName(name) {
  name = name || 'email'
  return getSlug(name.replace(/\.[0-9a-z]+$/, ''))
}

function getImageName(imageUrl) {
  return url
  .parse( imageUrl )
  .pathname
  .replace(/\//g, ' ')
  .trim()
  .replace(/\s/g, '-')
}

module.exports = {
  send,
  zip:  asyncHandler( zip ),
}
