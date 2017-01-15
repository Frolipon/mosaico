const test            = require('tape')

const {
  connectUser,
  setupDB,
  teardownDB,
  teardownAndError,
}                     = require('../_utils')

test('duplicate', t => {
  t.plan(1)
  setupDB().then(test).catch(t.end)

  function test() {
    connectUser(false)
    .click('.js-tbody-selection tr:first-child td:last-child a')
    .wait('.customer-home')
    .evaluate( () => {
      const originalName  = document.querySelector('.js-tbody-selection tr:nth-child(2) > td:nth-child(2) > a').textContent
      const copyName      = document.querySelector('.js-tbody-selection tr:nth-child(1) > td:nth-child(2) > a').textContent
      return { originalName, copyName }
    })
    .end()
    .then( result => {
      teardownDB(t, _ => {
        const { originalName,  copyName } = result
        t.equal(copyName, `${originalName} copy`, 'CLAPOU')
      })
    } )
    .catch( teardownAndError(t) )

  }

})

test('rename from home', t => {
  const renameTestCreationTitle = 'new name'
  t.plan(1)
  setupDB().then(test).catch(t.end)

  function test() {
    connectUser(false)
    .click('.js-tbody-selection tr:nth-child(2) .js-rename')
    .insert('#rename-field', false)
    .insert('#rename-field', 'new name')
    .click('.js-dialog-rename .js-post')
    .wait(300)
    .evaluate( () => {
      const name  = document.querySelector('.js-tbody-selection tr:nth-child(2) > td:nth-child(2) > a').textContent
      return { name }
    })
    .end()
    .then( result => {
      teardownDB(t, _ => {
        const { name  } = result
        t.equal(name, renameTestCreationTitle)
      })
    } )
    .catch( teardownAndError(t) )
  }

})

