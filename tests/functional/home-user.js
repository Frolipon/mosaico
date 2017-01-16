const test            = require('tape')
const {
  createWindow,
  connectUser,
  setupDB,
  teardownDB,
  teardownAndError,
  getTeardownHandlers
}                     = require('../_utils')

test('duplicate', t => {
  const nightmare           = createWindow(false)
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)

  t.plan(1)
  setupDB().then( start ).catch( onError )

  function start() {
    nightmare
    .use( connectUser() )
    .click('.js-tbody-selection tr:first-child td:last-child a')
    .wait('.customer-home')
    .evaluate( () => {
      const originalName  = document.querySelector('.js-tbody-selection tr:nth-child(2) > td:nth-child(2) > a').textContent
      const copyName      = document.querySelector('.js-tbody-selection tr:nth-child(1) > td:nth-child(2) > a').textContent
      return { originalName, copyName }
    })
    .end()
    .then( onEnd( result => {
      const { originalName,  copyName } = result
      t.equal(copyName, `${originalName} copy`, 'same name + copy suffix')
    } ) )
    .catch( onError )
  }

})

test('rename from home', t => {
  const nightmare           = createWindow(false)
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)
  const renameTestCreationTitle = 'new name'

  t.plan(1)
  setupDB().then( start ).catch( onError )

  function start() {
    nightmare
    .use( connectUser() )
    .click('.js-tbody-selection tr:nth-child(2) .js-rename')
    .insert('#rename-field', false)
    .insert('#rename-field', 'new name')
    .click('.js-dialog-rename .js-post')
    .wait(300)
    .evaluate( () => {
      const name  = document.querySelector('.js-tbody-selection tr:nth-child(2) > td:nth-child(2) > a').textContent
      return { name }
    })
    .then( onEnd( result => {
      t.equal(result.name, renameTestCreationTitle)
    } ) )
    .catch( onError )
  }

})

