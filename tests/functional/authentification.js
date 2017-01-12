const Nightmare       = require('nightmare')
const test            = require('tape')

const { connectUser } = require('../_utils')

test('connection success', t => {
  t.plan(1)

  connectUser()
  .end()
  .then( result => t.pass('user is connected') )
  .catch( t.fail )
})

test('connection fail', t => {
  t.plan(1)

  Nightmare({ show: false })
  .goto('http://localhost:3000')
  .insert('#email-field', 'p@p.com')
  .insert('#password-field', 'pp')
  .click('form[action*="/login"] [type=submit]')
  .exists('.is-invalid.is-dirty')
  .wait('dl.message.error')
  .end()
  .then( result => t.pass('user has an auth error') )
  .catch( t.fail )

})
