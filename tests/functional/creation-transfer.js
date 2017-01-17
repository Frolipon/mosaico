const test            = require('tape')
const {
  createWindow,
  connectUser,
  connectAdmin,
  setupDB,
  getTeardownHandlers,
}                     = require('../_utils')

test('admin – transfer a creation', t => {
  const nightmare           = createWindow(false)
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)
  const data                = { _id: '580c4899e2c0b5462867f11c' }

  t.plan(2)
  setupDB().then(start).catch( onError )

  function start() {
    nightmare
    .use( connectAdmin() )
    .goto(`http://localhost:3000/`)
    .click(`a[href="/transfer/${data._id}"]`)
    .evaluate( () => {
      const userId = document.querySelector('select option:first-child').value
      return { userId }
    })
    .then( keepFirstUserReference )
    .then( transferedIsntInAdmin )
    .then( onEnd( transferdIsInUser ) )
    .catch( onError )
  }

  function keepFirstUserReference(result) {
    data.userId = result.userId
    return nightmare
    .click(`.mdl-card__actions button`)
    .exists(`a[href="/transfer/${data._id}"]`)
  }

  function transferedIsntInAdmin(result) {
    t.notOk(result, 'no more links to this creation in admin')
    return nightmare
    .goto(`http://localhost:3000/users/${data.userId}`)
    .exists(`a[href="/editor/${data._id}"]`)
  }

  function transferdIsInUser(result) {
    t.ok(result, `transfered creation is owned by the right user`)
  }

})

