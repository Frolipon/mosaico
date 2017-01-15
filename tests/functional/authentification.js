const Nightmare       = require('nightmare')
const test            = require('tape')

const {
  connectUser,
  setupDB,
  teardownDB,
  teardownAndError,
 }                    = require('../_utils')

test('connection success', t => {
  t.plan(1)
  setupDB().then(test).catch(t.end)

  function test() {
    connectUser()
    .end()
    .then( result => {
      teardownDB(t, _ => t.pass('user is connected'))
    } )
    .catch( teardownAndError(t) )
  }

})

test('connection fail', t => {
  t.plan(1)
  setupDB().then(test).catch(t.end)

  function test() {
    Nightmare({ show: false })
    .goto('http://localhost:3000')
    .insert('#email-field', 'p@p.com')
    .insert('#password-field', 'pp')
    .click('form[action*="/login"] [type=submit]')
    .exists('.is-invalid.is-dirty')
    .wait('dl.message.error')
    .end()
    .then( result => {
      teardownDB(t, _ => t.pass('user has an auth error'))
    } )
    .catch( teardownAndError(t) )
  }

})
