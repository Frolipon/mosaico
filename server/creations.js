'use strict'

const _           = require('lodash')
const qs          = require('qs')
const chalk       = require('chalk')
const util        = require('util')
const createError = require('http-errors')
const moment      = require('moment')
const { Types }   = require('mongoose')

const config        = require('./config')
const filemanager   = require('./filemanager')
const {
  Wireframes,
  Creations,
  Users,
  addCompanyFilter,
  addStrictCompanyFilter,
}                         = require('./models')
const cleanTagName        = require('../shared/clean-tag-name')
const { normalizeString } = require('./models/utils')

const translations  = {
  en: JSON.stringify(_.assign(
    {},
    require('../res/lang/mosaico-en.json'),
    require('../res/lang/badsender-en')
  )),
  fr: JSON.stringify(_.assign(
    {},
    require('../res/lang/mosaico-fr.json'),
    require('../res/lang/badsender-fr')
  )),
}

//////
// HOME LISTING
//////

const perpage = 10

function customerList(req, res, next) {
  const { query, user } = req
  const isAdmin         = user.isAdmin
  // admin doesn't have a company
  const _company        = isAdmin ? { $exists: false } : req.user._company

  //----- PAGINATION

  // Pagination could be done better
  // http://stackoverflow.com/questions/5539955/how-to-paginate-with-mongoose-in-node-js/23640287#23640287
  // https://scalegrid.io/blog/fast-paging-with-mongodb/
  const pagination  = {
    page:   query.page ? ~~query.page - 1 : 0,
    limit:  query.limit ? ~~query.limit : perpage,
  }
  pagination.start  = pagination.page * pagination.limit

  //----- SORTING

  const sorting     = {
    sort: query.sort  ? query.sort  : 'updatedAt',
    dir:  query.dir   ? query.dir   : 'desc',
  }
  // beware that sorting on populated keys won't work
  const sort = { [sorting.sort]: sorting.dir === 'desc' ? -1 : 1}

  //----- FILTERING

  // CLEANING QUERY

  // remove empty fields
  let filterQuery = _.pick( query, ['name', '_user', '_wireframe', 'createdAt', 'updatedAt', 'tags'] )
  ;['createdAt', 'updatedAt'].forEach( key => {
    if (!query[key]) return
    filterQuery[ key ]  = _.omitBy( filterQuery[ key ], value => value === '' )
  })
  filterQuery           = _.omitBy( filterQuery, value => {
    const isEmptyString = value === ''
    const isEmptyObject = _.isPlainObject(value) && Object.keys(value) < 1
    return isEmptyString || isEmptyObject
  } )

  const filterKeys    = Object.keys( filterQuery )

  // normalize array
  let arrayKeys = ['_user', '_wireframe', 'tags']
  arrayKeys     = _.intersection( arrayKeys, filterKeys )
  for (let key of arrayKeys) {
    filterQuery[ key ] = _.concat( [], filterQuery[ key ] )
  }

  // CONSTRUCT MONGODB FILTER

  const filter  = { _company }
  // text search can be improved
  // http://stackoverflow.com/questions/23233223/how-can-i-find-all-documents-where-a-field-contains-a-particular-string
  if (filterQuery.name) filter.name = new RegExp(filterQuery.name)
  // SELECT
  for (let keys of arrayKeys ) { filter[keys] = { $in: filterQuery[keys] } }
  // DATES
  // for…of breaks on return, use forEach
  const datesFilterKeys = _.intersection( ['createdAt', 'updatedAt'], filterKeys )
  datesFilterKeys.forEach( key => {
    const rangeKeys = _.intersection( ['$lte', '$gte'], Object.keys( filterQuery[key] ) )
    rangeKeys.forEach( range => {
      // force UTC time for better comparison purpose
      const date = moment(`${filterQuery[key][range]} +0000`, 'YYYY-MM-DD Z')
      if (!date.isValid()) return
      // day begin at 00h00… go to the next ^^
      if (range === '$lte') date.add(1, 'days')
      filter[key]         = filter[key] || {}
      filter[key][range]  = date.toDate()
    })
  })

  //----- CREATE DB QUERIES

  // don't use lean, we need virtuals
  const creationsPaginate  = Creations
  .find( filter )
  .sort( sort )
  .skip( pagination.page * pagination.limit )
  .limit( pagination.limit )

  const creationsTotal = Creations
  .find( filter )
  .lean()

  // Extract used tags from creations
  // http://stackoverflow.com/questions/14617379/mongoose-mongodb-count-elements-in-array
  const tagsList = Creations
  .aggregate( [
    { $match: {
       _company,
      tags:     { $exists: true },
    } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', } },
    { $sort:  { _id: 1 } }
  ])

  // tagsList.then(tags => console.log( tags.map( t => t._id ) ))

  // gather informations for select boxes
  const usersRequest      = isAdmin ? Promise.resolve(false)
  : Users.find( { _company: user._company }, '_id name').lean()

  const wireframesRequest = isAdmin ? Wireframes.find({}, '_id name').lean()
  : Wireframes.find( { _company: user._company }, '_id name').lean()


  //----- GATHER ALL INFOS

  Promise
  .all( [
    creationsPaginate,
    creationsTotal,
    usersRequest,
    wireframesRequest,
    tagsList
  ] )
  .then( ([paginated, filtered, users, wireframes, tags]) => {

    // PAGINATION STATUS

    const total         = filtered.length
    const isFirst       = pagination.start === 0
    const isLast        = pagination.page >= Math.trunc(total / perpage)
    pagination.total    = total
    pagination.current  = `${pagination.start + 1}-${pagination.start + paginated.length}`
    pagination.prev     = isFirst ? false : pagination.page
    pagination.next     = isLast  ? false : pagination.page + 2

    // SUMMARY STATUS

    // “translate” ids: need users & wireframes in order to compute
    let idToName = ['_user', '_wireframe']
    idToName     = _.intersection( idToName, filterKeys )
    for (let key of idToName) {
      const dataList = key === '_user' ? users : wireframes
      filterQuery[ key ] = filterQuery[ key ].map( id => {
        return _.find( dataList, value => `${value._id}` === id ).name
      } )
    }

    // format for view
    const i18nKeys = {
      name:       'filter.summary.contain',
      _user:      'filter.summary.author',
      _wireframe: 'filter.summary.template',
      createdAt:  'filter.summary.createdat',
      updatedAt:  'filter.summary.updatedat',
      tags:       'filter.summary.tags',
    }
    const summary   = []
    _.forIn( filterQuery, (value, key) => {
      let i18nKey = i18nKeys[ key ]
      if ( _.isString(value) ) return summary.push( { message: i18nKey, value} )
      if ( _.isArray(value) ) {
        return summary.push( { message: i18nKey, value: value.join(', ')} )
      }
      // dates…
      summary.push( { message: i18nKey } )
      if (value.$gte) {
        summary.push( {
          message: 'filter.summary.after',
          value:    value.$gte
        } )
      }
      if (value.$gte && value.$lte ) {
        summary.push( {
          message: 'filter.summary.and',
        } )
      }
      if (value.$lte) {
        summary.push( {
          message: 'filter.summary.before',
          value:    value.$lte
        } )
      }
    })

    // FINALLY RENDER \o/
    res.render('customer-home', {
      data: {
        creations:  paginated,
        tagsList:   tags.map( t => t._id ),
        pagination,
        filterQuery,
        users,
        wireframes,
        summary,
      }
    })
  })
  .catch(next)
}

//////
// EDITOR
//////

function show(req, res, next) {
  var data = {
    translations: translations[ res.getLocale() ],
  }
  Creations
  .findOne( addCompanyFilter(req.user, { _id: req.params.creationId}) )
  .populate( '_wireframe', '_id assets' )
  .then( creation => {
    if (!creation) return next( createError(404) )
    res.render('editor', { data: _.assign( {}, data, creation.mosaico) })
  })
  .catch(next)
}

//////
// NEW CREATION
//////

function create(req, res, next) {
  const filter = addCompanyFilter(req.user, { _id: req.query.wireframeId})

  Wireframes
  .findOne( filter, '_id _company name')
  .lean()
  .then(onWireframe)
  .catch(next)

  function onWireframe(wireframe) {
    if (!wireframe) return next(createError(404))
    const initParameters = {
      // Always give a default name: needed for ordering & filtering
      // use res.__ because (not req) it's where i18n is always up to date (index.js#192)
      name:       res.__('home.saved.noname'),
      _wireframe: wireframe._id,
      wireframe:  wireframe.name,
    }
    // admin doesn't have valid user id & company
    if (!req.user.isAdmin) {
      initParameters._user    = req.user.id
      initParameters.author   = req.user.name
      initParameters._company = req.user._company
    }
    new Creations(initParameters)
    .save()
    .then( creation =>  res.redirect('/editor/' + creation._id) )
    .catch(next)
  }
}

//////
// BULK ACTIONS
//////

function getRedirectUrl(req) {
  const query       = qs.stringify( _.omit(req.query, ['_method']) )
  const redirectUrl = query ? `/?${query}` : '/'
  return redirectUrl
}

function updateLabels(req, res, next) {
  const { body }    = req
  let { creations } = body
  const tagRegex    = /^tag-/
  const redirectUrl = getRedirectUrl(req)
  if (!_.isArray( creations ) || !creations.length ) return res.redirect( redirectUrl )

  // Entries will be supported natively without flag in node 7+
  // use lodash for not bumping node version
  // http://node.green/#features
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries
  let tags = _.entries( body )
  .filter( element => tagRegex.test( element[0] ) )
  .map( tag => {
    tag[0] = tag[0].replace(tagRegex, '')
    return tag
  } )

  Creations
  .find( addStrictCompanyFilter(req.user, {
    _id: {
      $in: creations.map(Types.ObjectId),
    },
  }) )
  .then(onCreations)
  .catch(next)

  function onCreations(docs) {
    Promise
    .all( docs.map( updateTags ) )
    .then( onSave )
    .catch( next )
  }

  function updateTags(doc) {
    tags.forEach( tagAction => {
      const [tag, action] = tagAction
      if (action === 'unchange') return
      if (action === 'add')    doc.tags = _.union( doc.tags, [ tag ] )
      if (action === 'remove') doc.tags = _.without( doc.tags, tag )
    })
    doc.tags = doc.tags.sort().map( cleanTagName )
    return doc.save()
  }

  function onSave(docs) {
    res.redirect( redirectUrl )
  }
}

function bulkRemove(req, res, next) {
  const { creations } = req.body
  if (!_.isArray( creations ) || !creations.length ) return res.redirect( redirectUrl )
  const redirectUrl   = getRedirectUrl(req)
  const filter        = addStrictCompanyFilter(req.user, {
    _id: {
      $in: creations.map(Types.ObjectId),
    },
  })
  Creations
  .find( filter )
  .then( onCreations )
  .catch( next )

  function onCreations(creations) {
    Promise
    .all( creations.map( creation => creation.remove()) )
    .then( _ => res.redirect(redirectUrl) )
    .catch( next )
  }
}

//////
// OTHERS ACTIONS
//////


// TODO merge update & rename
function update(req, res, next) {
  if (!req.xhr) return next(createError(501)) // Not Implemented

  Creations
  .findOne( addCompanyFilter(req.user, { _id: req.params.creationId}) )
  .then( handleCreation )
  .catch( next )

  function handleCreation(creation) {
    if (!creation) return next( createError(404) )
    creation.data = req.body.data || creation.data
    // use res.__ because (not req) it's where i18n is always up to date (index.js#192)
    creation.name = normalizeString( req.body.name ) || res.__('home.saved.noname')
    // http://mongoosejs.com/docs/schematypes.html#mixed
    creation.markModified('data')

    return creation
    .save()
    .then( creation => res.json( creation.mosaico ) )
    .catch(next)
  }
}

function remove(req, res, next) {
  const creationId  = req.params.creationId
  Creations
  .findByIdAndRemove(creationId)
  .then( c => res.redirect('/') )
  .catch(next)
}

// should upload image on a specific client bucket
// -> can't handle live resize
function upload( req, res, next ) {
  console.log( chalk.green('UPLOAD') )
  filemanager
  .parseMultipart( req, {
    prefix:     req.params.mongoId,
    formatter:  'editor',
  } )
  .then( onParse )
  .catch( next )

  function onParse( datas4fileupload ) {
    res.send( JSON.stringify(datas4fileupload) )
  }
}

function listImages(req, res, next) {
  filemanager
  .list( req.params.mongoId )
  .then( files => res.json({ files }) )
  .catch( next )
}

function duplicate(req, res, next) {

  Creations
  .findOne( addCompanyFilter(req.user, { _id: req.params.creationId}) )
  .then( onCreation )
  .catch( next )

  function onCreation(creation) {
    if (!creation) return next(createError(404))
    creation
    .duplicate( req.user )
    .then( onDuplicate )
    .catch( next )
  }

  function onDuplicate(newCreation) {
    filemanager
    .copyImages( req.params.creationId, newCreation._id )
    .then( _ => res.redirect('/') )
  }
}

module.exports = {
  customerList,
  show,
  update,
  remove,
  updateLabels,
  bulkRemove,
  create,
  upload,
  listImages,
  duplicate,
}
