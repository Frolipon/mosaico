'use strict'

const _            = require('lodash')
const chalk        = require('chalk')
const createError  = require('http-errors')
const Nightmare    = require('nightmare')
const fs           = require('fs-extra')
const crypto       = require('crypto')
const path         = require('path')
const sharp        = require('sharp')
const asyncHandler = require('express-async-handler')

const defer                 = require('./helpers/create-promise')
const config                = require('./config')
const services              = require('./services-initialization' )
const filemanager           = require('./filemanager')
const slugFilename          = require('../shared/slug-filename')
const { handleValidatorsErrors,
  isFromCompany, Companies,
  Wireframes, Creations }   = require('./models')

// those are 2 links for installing nightmarejs on heroku
// https://github.com/oscarmorrison/nightmare-heroku
// https://github.com/benschwarz/heroku-electron-buildpack
// We make sure that nightmare is connected as admin
const protocol       = `http${ config.forcessl ? 's' : '' }://`
const nightmareReady = defer()

services
.areReady
.then( async serviceStatus => {
  if ( !serviceStatus ) {
    return console.log(chalk.red(`[PREVIEWS] abort nightmare initialization`) )
    return false
  }
  const nightmareInstance = Nightmare()
    .viewport(680, 780)
    .goto( `${protocol}${config.host}/admin/login` )
    .insert( '#password-field', config.admin.password )
    .click( 'form[action*="/login"] [type=submit]' )

  await nightmareInstance.evaluate( () => false )
  console.log( chalk.green(`[PREVIEWS] Nightmare is running`) )
  // need a wrapper object or the Promise won't resolve —__—'
  nightmareReady.resolve({ nightmare: nightmareInstance })
})
.catch( nightmareError => {
  console.log( chalk.red(`[PREVIEWS] Nightmare can't connect to the server`) )
  console.log( nightmareError )
  nightmareReady.resolve( false )
})

function _getWireframeImagePrefix( wireframeId ) {
  return `wireframe-${ wireframeId }`
}

function list(req, res, next) {
  Wireframes
  .find({})
  .populate('_user')
  .populate('_company')
  .then( wireframes => {
    res.render('wireframe-list', {
      data: { wireframes: wireframes, }
    })
  })
  .catch(next)
}

function customerList(req, res, next) {
  const isAdmin           = req.user.isAdmin
  const filter            = isAdmin ? {} : { _company: req.user._company }
  const getWireframes     = Wireframes.find( filter )
  // Admin as a customer should see which template is coming from which company
  if (isAdmin) getWireframes.populate('_company')

  getWireframes
  .sort({ name: 1 })
  .then( (wireframes) => {
    // can't sort populated fields
    // http://stackoverflow.com/questions/19428471/node-mongoose-3-6-sort-query-with-populated-field/19450541#19450541
    if (isAdmin) {
      wireframes = wireframes.sort( (a, b) => {
        let nameA = a._company.name.toLowerCase()
        let nameB = b._company.name.toLowerCase()
        if (nameA < nameB) return -1
        if (nameA > nameB) return 1
        return 0;
      })
    }
    res.render('customer-wireframe', {
      data: {
        wireframes: wireframes,
      }
    })
  })
  .catch(next)
}

function show(req, res, next) {
  const companyId = req.params.companyId
  const wireId    = req.params.wireId

  // CREATE
  if (!wireId) {
    return Companies
    .findById( companyId )
    .then( company => {
      res.render('wireframe-new-edit', { data: { company, }} )
    })
    .catch(next)
  }

  // UPDATE
  Wireframes
  .findById( req.params.wireId )
  .populate('_user')
  .populate('_company')
  .then( wireframe => {
    if (!wireframe) return next( createError(404) )
    res.render('wireframe-new-edit', { data: { wireframe, }} )
  })
  .catch(next)
}

function getMarkup(req, res, next) {
  Wireframes
  .findById(req.params.wireId)
  .then(onWireframe)
  .catch(next)

  function onWireframe(wireframe) {
    if (!isFromCompany(req.user, wireframe._company)) return next(createError(401))
    if (!wireframe.markup) return next(createError(404))
    if (req.xhr) return res.send(wireframe.markup)
    // let download content
    res.setHeader('Content-disposition', `attachment; filename=${wireframe.name}.html`)
    res.setHeader('Content-type', 'text/html')
    res.write(wireframe.markup)
    return res.end()
  }
}

function update(req, res, next) {
  const { wireId } = req.params

  filemanager
  .parseMultipart(req, {
    // add a `wireframe` prefix to differ from user uploaded template assets
    prefix:     _getWireframeImagePrefix( wireId ),
    formatter:  'wireframes',
  })
  .then( onParse )
  .catch(next)

  function onParse( body ) {
    console.log('files success')
    var dbRequest = wireId ?
      Wireframes.findById( wireId )
      : Promise.resolve( new Wireframes() )

    dbRequest
    .then( wireframe => {
      const nameChange  = body.name !== wireframe.name
      // custom update function
      wireframe         = _.assignIn(wireframe, _.omit(body, ['images', 'assets']))
      // TODO check if there is any assets to update
      wireframe.assets  = _.assign( {}, wireframe.assets || {}, body.assets )
      wireframe.markModified( 'assets' )

      // copy wireframe name in creation
      if (wireId && nameChange) {
        Creations
        .find( { _wireframe: wireId } )
        .then( creations => {
          creations.forEach( creation => {
            creation.wireframe = body.name
            creation.save().catch( console.log )
          })
        })
        .catch( console.log )
      }
      // return
      return wireframe.save()
    })
    .then( wireframe => {
      console.log('wireframe success', wireId ? 'updated' : 'created')
      req.flash('success', wireId ? 'updated' : 'created')
      return res.redirect(wireframe.url.show)
    })
    .catch( err => handleValidatorsErrors(err, req, res, next) )
  }
}

// used by nightmareJS to have the right html
function nightmareMarkup(req, res, next) {
  const { wireId }    = req.params

  Wireframes
  .findById( wireId, 'markup' )
  .then( wireframe => {
    if (!wireframe) return next( createError(404) )
    if (!wireframe.markup) return next( createError(404) )
    return res.send( wireframe.markup )
  })
  .catch( next )
}

//
async function generatePreviews(req, res, next) {
  const { wireId } = req.params
  const start      = Date.now()
  const protocol   = `http${ config.forcessl ? 's' : '' }://`

  function getDuration() {
    return `${ (Date.now() - start) / 1000}s`
  }

  const wireframe = await Wireframes.findById( wireId )
  console.log(`[PREVIEWS] get wireframe – ${ getDuration() }`)
  if (!wireframe) return next( createError(404) )
  if (!wireframe.markup) return next( createError(404) )

  console.log(`[PREVIEWS] get wireframe markup – ${ getDuration() }`)
  const { nightmare } = await nightmareReady

  //----- RENDER THE MARKUP WITH NIGHTMARE

  await nightmare
    // wait for `did-finish-load` event
    // https://github.com/segmentio/nightmare/issues/297#issuecomment-150601269
    .goto( `${protocol}${config.host}/wireframes/${wireId}/nightmare` )
    .evaluate( () => false )

  //----- GET WIREFRAME SIZE

  console.log(`[PREVIEWS] get wireframe size – ${ getDuration() }`)

  const getWireframeSize = () => {
    // `preview` class is added to have more controls over previews
    // https://github.com/voidlabs/mosaico/issues/246#issuecomment-265979320
    document.body.classList.add( 'preview' )
    // this is to hide scrollars for screenshots (in case of)
    // https://github.com/segmentio/nightmare/issues/726#issuecomment-232851174
    const s = document.styleSheets[0]
    s.insertRule('::-webkit-scrollbar { display:none; }')
    return {
      width:  Math.round( document.body.scrollWidth ),
      height: Math.round( document.body.scrollHeight ),
    }
  }
  const { width, height } = await nightmare.evaluate( getWireframeSize )

  //----- RESIZE VIEWPORT
  // resize the viewport so it takes the whole template
  // needed for screenshots to be done correctly
  console.log(`[PREVIEWS] resize viewport – ${ getDuration() }`)
  await nightmare.viewport( width, height ).evaluate( () => false )

  //----- GATHER BLOCKS

  const gatherBlocks = () => {
    // get position of every blocks
    const blockSelector = `[data-ko-container] [data-ko-block]`
    const nodes         = [ ...document.querySelectorAll(blockSelector) ]
    const blocks        = nodes.map( node => {
      // use dataset to preserve case
      const name  = `${node.dataset.koBlock}.png`
      const rect  = node.getBoundingClientRect()
      return {
        name,
        // electron only support integers
        // https://github.com/electron/electron/blob/master/docs/api/structures/rectangle.md
        clip: {
          x:      Math.round( rect.left ),
          y:      Math.round( rect.top ),
          width:  Math.round( rect.width ),
          height: Math.round( rect.height ),
        }
      }
    })
    // add the global view
    blocks.push({
      name: '_full.png',
      clip: {
        x:      0,
        y:      0,
        width:  Math.round( document.body.scrollWidth ),
        height: Math.round( document.body.scrollHeight ),
      }
    })
    return blocks
  }
  const blocks = await nightmare.evaluate( gatherBlocks )

  //----- TAKE SCREENSHOTS

  console.log(`[PREVIEWS] take screenshots – ${ getDuration() }`)
  // this list will be used after to match an image buffer with a name
  const blocksName    = blocks.map( ({name}) => name  )
  const imagesBuffer  = await Promise.all(
    blocks.map( ({name, clip}) => {
      return nightmare
      .evaluate( () => false )
      .screenshot( clip )
      // TODO: is this line useful?
      .then( buffer => Promise.resolve( buffer ) )
    })
  )

  //----- SAVE SCREENSHOTS TO TMP

  console.log(`[PREVIEWS] save screenshots to tmp – ${ getDuration() }`)
  // this will be used to update `assets` field in DB
  const assets  = {}
  const files   = []
  await Promise.all(
    imagesBuffer.map( (imageBuffer, index) => {
      console.log(`[PREVIEWS] img ${blocksName[ index ]}`)
      // slug to be coherent with upload
      const originalName  = slugFilename( blocksName[ index ] )
      const hash          = crypto.createHash('md5').update( imageBuffer ).digest('hex')
      const name          = `${ _getWireframeImagePrefix(wireId) }-${ hash }.png`
      const filePath      = path.join( config.images.tmpDir, `/${name}` )
      files.push({
        path: filePath,
        name,
      })
      assets[ originalName ] = name
      return fs.writeFile( filePath, imageBuffer )
    })
  )

  //----- UPLOAD SCREENSHOTS

  console.log(`[PREVIEWS] upload screenshots – ${ getDuration() }`)
  await Promise.all(
    files.map( file => {
      console.log(`[PREVIEWS] upload ${file.name}`)
      // images are captured at 680 but displayed at half the size
      const pipeline = sharp().resize( 340, null )
      fs.createReadStream( file.path ).pipe( pipeline )
      return filemanager.writeStreamFromStream( pipeline, file.name )
    })
  )

  //----- UPDATE WIREFRAME ASSETS

  console.log(`[PREVIEWS] update wireframe assets in DB – ${ getDuration() }`)
  wireframe.assets  = Object.assign( {}, wireframe.assets || {},  assets )
  wireframe.markModified( 'assets' )
  await wireframe.save()

  //----- THE END

  res.redirect( `/wireframes/${ wireId }` )

}

function remove(req, res, next) {
  var wireframeId = req.params.wireId
  console.log('REMOVE WIREFRAME', wireframeId)
  Creations
  .find({_wireframe: wireframeId})
  .then( (creations) => {
    console.log(creations.length, 'to remove')
    creations = creations.map( creation => creation.remove() )
    return Promise.all(creations)
  })
  .then( (deletedCreations) =>  Wireframes.findByIdAndRemove(wireframeId) )
  .then( (deletedWireframe) => res.redirect(req.query.redirect) )
  .catch(next)
}

module.exports = {
  list:             list,
  customerList:     customerList,
  show:             show,
  update:           update,
  remove:           remove,
  getMarkup:        getMarkup,
  generatePreviews: asyncHandler( generatePreviews ),
  nightmareMarkup:  nightmareMarkup,
}
