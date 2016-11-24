'use strict'

const { assign }    = require('lodash')
const chalk         = require('chalk')
const util          = require('util')
const createError   = require('http-errors')
const moment        = require('moment')

const config        = require('./config')
const filemanager   = require('./filemanager')
const { Wireframes, Creations, Users,
  isFromCompany, }  = require('./models')

const translations  = {
  en: JSON.stringify(assign(
    {},
    require('../res/lang/mosaico-en.json'),
    require('../res/lang/badsender-en')
  )),
  fr: JSON.stringify(assign(
    {},
    require('../res/lang/mosaico-fr.json'),
    require('../res/lang/badsender-fr')
  )),
}

const perpage = 10

function customerList(req, res, next) {
  const { query, user } = req
  const isAdmin = user.isAdmin

  // PAGINATION

  // Pagination could be done better
  // http://stackoverflow.com/questions/5539955/how-to-paginate-with-mongoose-in-node-js/23640287#23640287
  // https://scalegrid.io/blog/fast-paging-with-mongodb/
  const pagination  = {
    page:   query.page ? ~~query.page - 1 : 0,
    limit:  query.limit ? ~~query.limit : perpage,
  }
  pagination.start  = pagination.page * pagination.limit

  // SORTING

  const sorting     = {
    sort: query.sort  ? query.sort  : 'updatedAt',
    dir:  query.dir   ? query.dir   : 'desc',
  }
  // beware that sorting on populated keys won't work
  const sort = { [sorting.sort]: sorting.dir === 'desc' ? -1 : 1}

  // FILTERING

  // admin doesn't have a company
  const filter  = {
    _company: isAdmin ? { $exists: false } : req.user._company,
  }
  // text search can be improved
  // http://stackoverflow.com/questions/23233223/how-can-i-find-all-documents-where-a-field-contains-a-particular-string
  if (query.name) filter.name = new RegExp(query.name)
  // select
  for (let keys of ['_user', '_wireframe']) {
    if (query[keys]) filter[keys] = { $in: query[keys] }
  }
  // dates
  // for…of breaks on return, use forEach
  ;['createdAt', 'updatedAt'].forEach( key => {
    if (!query[key]) return
    ;['$lte', '$gte'].forEach( range => {
      if (!query[key][range]) return
      // force UTC time for better comparison purpose
      const date = moment(`${query[key][range]} +0000`, 'YYYY-MM-DD Z')
      if (!date.isValid()) return
      // day begin at 00h00… got the next ^^
      if (range === '$lte') date.add(1, 'days')
      filter[key] = filter[key] || {}
      filter[key][range] = date.toDate()
    })
  })

  // QUERY DB

  // don't use lean, we need virtuals
  const creationsPaginate  = Creations
  .find( filter )
  .sort( sort )
  .skip( pagination.page * pagination.limit )
  .limit( pagination.limit )

  const creationsTotal = Creations
  .find( filter )
  .lean()

  // gather informations for select boxes
  const usersRequest      = isAdmin ? Promise.resolve(false)
  : Users.find( { _company: user._company }, '_id name').lean()

  const wireframesRequest = isAdmin ? Wireframes.find({}, '_id name').lean()
  : Wireframes.find( { _company: user._company }, '_id name').lean()

  Promise.all([creationsPaginate, creationsTotal, usersRequest, wireframesRequest])
  .then( ([paginated, filtered, users, wireframes]) => {
    const total         = filtered.length
    const isFirst       = pagination.start === 0
    const isLast        = pagination.page >= Math.trunc(total / perpage)
    pagination.total    = total
    pagination.current  = `${pagination.start + 1}-${pagination.start + paginated.length}`
    pagination.prev     = isFirst ? false : pagination.page
    pagination.next     = isLast ? false : pagination.page + 2

    res.render('customer-home', {
      data: {
        pagination: pagination,
        creations:  paginated,
        users,
        wireframes,
      }
    })
  })
  .catch(next)
}

function show(req, res, next) {
  var data = {
    translations: translations[req.getLocale()],
  }
  Creations
  .findById(req.params.creationId)
  .then( (creation) => {
    if (!creation) return next(createError(404))
    if (!isFromCompany(req.user, creation._company)) return next(createError(401))
    res.render('editor', { data: assign({}, data, creation.mosaico) })
  })
  .catch(next)
}

function create(req, res, next) {
  const wireframeId = req.query.wireframeId

  Wireframes
  .findById(wireframeId, '_id _company name')
  .then(onWireframe)
  .catch(next)

  function onWireframe(wireframe) {
    if (!wireframe) return next(createError(404))
    if (!isFromCompany(req.user, wireframe._company)) return next(createError(401))
    const initParameters = {
      _wireframe: wireframe._id,
      wireframe: wireframe.name,
    }
    // admin doesn't have valid user id and company
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

function update(req, res, next) {
  if (!req.xhr) next(createError(501)) // Not Implemented
  const { creationId } = req.params

  Creations
  .findById(creationId)
  .then(handleCreation)
  .catch(next)

  function handleCreation(creation) {
    if (!creation) return next(createError(404))
    if (!isFromCompany(req.user, creation._company)) return next(createError(401))
    creation._wireframe = creation._wireframe
    creation.userId     = creation.userId
    creation.data       = req.body.data
    // http://mongoosejs.com/docs/schematypes.html#mixed
    creation.markModified('data')

    return creation
    .save()
    .then( (creation) => {
      const data2editor = creation.mosaico
      if (!creationId) data2editor.meta.redirect = `/editor/${creation._id}`
      res.json(data2editor)
    })
    .catch(next)
  }
}

function remove(req, res, next) {
  const creationId  = req.params.creationId
  Creations
  .findByIdAndRemove(creationId)
  .then( _ => res.redirect('/') )
  .catch(next)
}

function rename(req, res, next) {
  if (!req.xhr) next(createError(501)) // Not Implemented
  const { creationId }  = req.params

  Creations
  .findById(creationId)
  .then(handleCreation)
  .catch(next)

  function handleCreation(creation) {
    if (!creation) return next(createError(404))
    if (!isFromCompany(req.user, creation._company)) return next(createError(401))

    creation.name = req.body.name

    creation
    .save()
    .then( creation => res.json(creation)  )
    .catch(next)
  }
}

// should upload image on a specific client bucket
// -> can't handle live resize
function upload(req, res, next) {
  console.log(chalk.green('UPLOAD'))
  filemanager
  .parseMultipart(req, {
    prefix:     req.params.creationId,
    formatter:  'editor',
  })
  .then(onParse)
  .catch(next)

  function onParse(datas4fileupload) {
    res.send(JSON.stringify(datas4fileupload))
  }
}

function listImages(req, res, next) {
  filemanager
  .list(req.params.creationId)
  .then( (images) => {
    res.json({
      files: images,
    })
  })
  .catch(next)
}

function duplicate(req, res, next) {

  Creations
  .findById(req.params.creationId)
  .then(onCreation)
  .catch(next)

  function onCreation(creation) {
    if (!creation) return next(createError(404))
    if (!isFromCompany(req.user, creation._company)) return next(createError(401))
    creation
    .duplicate(req.user)
    .then(onDuplicate)
    .catch(next)
  }

  function onDuplicate(newCreation) {
    filemanager
    .copyImages(req.params.creationId, newCreation._id)
    .then( _ => res.redirect('/') )
  }
}

module.exports = {
  customerList: customerList,
  show:         show,
  update:       update,
  remove:       remove,
  rename:       rename,
  create:       create,
  upload:       upload,
  listImages:   listImages,
  duplicate:    duplicate,
}
