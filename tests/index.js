const test      = require('tape')
const Nightmare = require('nightmare')
// const exec      = require('child_process').exec
// const nightmare = Nightmare({ show: false })

function connectUser(show = false) {
  return Nightmare({ show })
  .goto('http://localhost:3000')
  .insert('#email-field', 'p@p.com')
  .insert('#password-field', 'p')
  .click('form[action*="/login"] [type=submit]')
  .wait('.customer-home')
}

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
  .then( result => t.pass('user has an error') )
  .catch( t.fail )

})

test('duplicate', t => {
  t.plan(1)

  connectUser(false)
  .wait('.customer-home')
  .click('.js-tbody-selection tr:first-child td:last-child a')
  .wait('.customer-home')
  .evaluate( () => {
    const originalName  = document.querySelector('.js-tbody-selection tr:nth-child(2) > td:nth-child(2) > a').text
    const copyName      = document.querySelector('.js-tbody-selection tr:nth-child(1) > td:nth-child(2) > a').text
    return { originalName, copyName }
  })
  .end()
  .then( result => {
    const { originalName,  copyName } = result
    t.equal(copyName, `${originalName} copy`, 'CLAPOU')
    t.end()
  } )
  .catch( t.end )
})
