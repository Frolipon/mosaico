const test            = require('tape')
const {
  createWindow,
  connectUser,
  connectAdmin,
  setupDB,
  getTeardownHandlers,
 }                    = require('../_utils')

test('connection success', t => {
  const nightmare           = createWindow(false)
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)

  t.plan(1)
  setupDB().then( start ).catch( onError )

  function  start() {
    nightmare
    .use( connectUser() )
    .then( onEnd( result => t.pass('user is connected') ) )
    .catch( onError )
  }

})

test('connection fail', t => {
  const nightmare           = createWindow(false)
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)

  t.plan(1)
  setupDB().then( start ).catch( onError )

  function start() {
    nightmare
    .goto('http://localhost:3000')
    .insert('#email-field', 'p@p.com')
    .insert('#password-field', 'pp')
    .click('form[action*="/login"] [type=submit]')
    .exists('.is-invalid.is-dirty')
    .wait('dl.message.error')
    .evaluate( () => {
      const errorEl = document.querySelector('.message.error p')
      return { errorMessage: errorEl ? errorEl.textContent : false }
    } )
    .then( onEnd( result => {
      t.equal(result.errorMessage, 'Incorrect password.', 'user has an auth error')
    } ) )
    .catch( onError )
  }

})

test('admin connection – success', t => {
  const nightmare           = createWindow(false)
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)

  t.plan(1)
  setupDB().then( start ).catch( onError )

  function start() {
    nightmare
    .use( connectAdmin() )
    .url()
    .then( onEnd( url => t.equal('http://localhost:3000/admin', url) ) )
    .catch( onError )
  }

})
