const createError           = require('http-errors')

const {
  Creations,
  Users,
  addStrictCompanyFilter,
}                         = require('./models')

function get(req, res, next) {
  const filter = addStrictCompanyFilter(req.user, { _id: req.params.creationId,} )

  Creations
  .findOne( filter, '_wireframe name' )
  .populate('_wireframe', '_company')
  .then( onCreation )
  .catch( next )

  function onCreation(creation) {
    creation = creation
    Users
    .find({
      _company:       creation._wireframe._company,
      isDeactivated:  { $ne: true },
    }, 'name email')
    .then( users => onUsers(creation, users) )
    .catch( next )
  }

  function onUsers(creation, users) {
    res.render('creation-transfer', {
      data: { creation, users },
    })
  }
}

function post(req, res, next) {
  const { userId }      = req.body
  const { creationId }  = req.params
  const userQuery       = Users.findById(userId, 'name _company')
  const creationQuery   = Creations.findById(creationId, 'name')

  Promise
  .all([userQuery, creationQuery])
  .then( onQueries )
  .catch( next )

  function onQueries( [ user, creation ] ) {
    if (!user || !creation) return next( createError(404) )
    creation._user    = user._id
    creation.author   = user.name
    creation._company = user._company

    creation
    .save()
    .then( creation => res.redirect('/') )
    .catch( next )
  }
}

module.exports = {
  get,
  post,
}
