const test            = require('tape')

const { connectUser } = require('../_utils')

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
