'use strict'

const _                     = require('lodash')
const chalk                 = require('chalk')
const createError           = require('http-errors')
const Nightmare             = require('nightmare')

const config                = require('./config')
const filemanager           = require('./filemanager')
const slugFilename          = require('../shared/slug-filename.js')
const { handleValidatorsErrors,
  isFromCompany, Companies,
  Wireframes, Creations }   = require('./models')

function list(req, res, next) {
  Wireframes
  .find({})
  .populate('_user')
  .populate('_company')
  .then( (wireframes) => {
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
    prefix:     `wireframe-${wireId}`,
    formatter:  'wireframes',
  })
  .then(onParse)
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
      wireframe.assets  = _.assign( {}, wireframe.assets || {}, body.assets )

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

// used by nightmareJS to have an empty page
function nightmareBlankPage(req, res, next) {
  res.send('')
}

function generatePreviews(req, res, next) {
  const wireframeId     = req.params.wireId
  const blocksName      = []
  let nightmare

  Wireframes
  .findById( wireframeId )
  .then( generate )
  .catch( next )

  function generate( wireframe ) {
    if (!wireframe) return next( createError(404) )
    nightmare = Nightmare().viewport(680, 780)
    return nightmare
    .goto( `http://${config.host}/wireframes/nightmare` )
    // to avoid admin connection, just grab an empty page and fill it with the markup
    .evaluate( _markup => {
      document.write( _markup )
    }, wireframe.markup)
    .then( getWireframeSize )
    .then( resizeViewport )
    .then( gatherBlocks )
    .then( takeScreenshots )
    .then( () => {
      res.redirect( `/wireframes/${ wireframeId }` )
    })
  }

  function getWireframeSize() {
    return nightmare
    .evaluate( () => {
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
    })
  }

  // resize the viewport so it takes the whole template
  // needed for screenshots to be done correctly
  function resizeViewport( {width, height} ) {
    return nightmare
    .viewport(width, height)
    .evaluate( () => true )
  }

  function gatherBlocks() {
    return nightmare
    .evaluate( () => {
      // get position of every blocks
      const nodes   = [ ...document.querySelectorAll('[data-ko-container] [data-ko-block]') ]
      const blocks  = nodes.map( node => {
        const name  = `${node.getAttribute('data-ko-block')}.png`
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
      return { blocks }
    })
  }

  function takeScreenshots( {blocks} ) {
    blocks.forEach( ({name}) => blocksName.push( name ) )
    console.log( blocksName )
    const screens = blocks.map( ({name, clip}) => {
      return nightmare
      // need those scrolls to trigger a new render ¬_¬'
      .scrollTo(1, 1)
      .scrollTo(0, 0)
      // wait for `did-finish-load` event
      // https://github.com/segmentio/nightmare/issues/297#issuecomment-150601269
      .evaluate( () => false )
      .screenshot( `${ config.images.tmpDir }/${name}`, clip )
    })
    return Promise.all( screens )
  }

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
  list:         list,
  customerList: customerList,
  show:         show,
  update:       update,
  remove:       remove,
  getMarkup:    getMarkup,
  generatePreviews:     generatePreviews,
  nightmareBlankPage: nightmareBlankPage,
}
