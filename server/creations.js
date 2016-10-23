'use strict'

const _             = require('lodash')
const chalk         = require('chalk')
const util          = require('util')
const createError   = require('http-errors')

const config        = require('./config')
const DB            = require('./database')
const filemanager   = require('./filemanager')
const Wireframes    = DB.Wireframes
const Creations     = DB.Creations
const isFromCompany = DB.isFromCompany
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

const perpage = 10

//
// http://stackoverflow.com/questions/5539955/how-to-paginate-with-mongoose-in-node-js/23640287#23640287

function customerList(req, res, next) {
  const { query } = req
  console.log('Customer list')
  console.log(util.inspect(query))
  const isAdmin = req.user.isAdmin
  // admin doesn't have a company
  const filter  = { _company: isAdmin ? { $exists: false } : req.user._company }

  // PAGINATION
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
  const sort          = {}
  sort[sorting.sort]  = sorting.dir === 'desc' ? -1 : 1

  // FILTERING
  // console.log(util.inspect(pagination))
  // console.log(util.inspect(sorting))
  // console.log(util.inspect(sort))
  const creationsPaginate  = Creations
  .find( filter )
  .skip( pagination.page * pagination.limit )
  .limit( pagination.limit )
  .sort( sort )
  .populate('_wireframe')
  .populate('_user')

  const creationsTotal = Creations
  .find( filter )
  .lean()

  Promise.all([creationsPaginate, creationsTotal])
  .then( ([paginated, filtered]) => {
    const total         = filtered.length
    const isFirst       = pagination.start === 0
    const isLast        = pagination.page >= Math.trunc(total / perpage)
    pagination.total    = total
    pagination.current  = `${pagination.start + 1}-${pagination.start + perpage}`
    pagination.prev     = isFirst ? false : pagination.page
    pagination.next     = isLast ? false : pagination.page + 2
    console.log(util.inspect(pagination))
    res.render('customer-home', {
      data: {
        sorting:    sorting,
        pagination: pagination,
        creations:  paginated,
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
    res.render('editor', { data: _.assign({}, data, creation.mosaico) })
  })
  .catch(next)
}

function create(req, res, next) {
  const wireframeId = req.query.wireframeId

  Wireframes
  .findById(wireframeId)
  .then(onWireframe)
  .catch(next)

  function onWireframe(wireframe) {
    if (!wireframe) return next(createError(404))
    if (!isFromCompany(req.user, wireframe._company)) return next(createError(401))
    var initParameters = { _wireframe: wireframe._id, }
    // admin doesn't have valid user id
    if (!req.user.isAdmin) initParameters._user = req.user.id
    // Keep this: Admin will never have a company
    if (req.user._company) {
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
  const creationId  = req.params.creationId

  Creations
  .findById(creationId)
  .then(onCreation)
  .catch(next)

  function onCreation(creation) {
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
      var data2editor = creation.mosaico
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
  .then( function () { res.redirect('/')} )
  .catch(next)
}

function rename(req, res, next) {
  const creationId  = req.params.creationId
  Creations
  .findByIdAndUpdate(creationId, req.body)
  .then( creation => res.json(creation) )
  .catch(next)
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
    .duplicate()
    .then(onDuplicate)
    .catch(next)
  }

  function onDuplicate(newCreation) {
    filemanager
    .copyImages(req.params.creationId, newCreation._id)
    .then( () =>  { res.redirect('/') } )
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
