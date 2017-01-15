const test            = require('tape')

const {
  connectUser,
  setupDB,
  teardownDB,
  teardownAndError,
}                     = require('../_utils')

test('rename from editor', t => {
  const renameTestCreationTitle = 'larve'
  t.plan(1)
  setupDB().then(test).catch(t.end)

  function test() {
    connectUser(false)
    .click('.js-tbody-selection tr:nth-child(2) > td:nth-child(2) > a')
    .wait('#toolbar .creation-name')
    .evaluate( () => {
      const btn = document.querySelector('#toolbar > div.creation-name > p')
      const ev  = new MouseEvent('dblclick', {
        'view': window,
        'bubbles': true,
        'cancelable': true,
        'clientX': btn.getBoundingClientRect().left + 10,
        'clientY': btn.getBoundingClientRect().top + 10,
      })
      btn.dispatchEvent(ev)
      return true
    })
    // .click('#toolbar > div.creation-name > p')
    .wait('#toolbar > form > input[type="text"]')
    .insert('#toolbar > form > input[type="text"]', false)
    .insert('#toolbar > form > input[type="text"]', renameTestCreationTitle)
    .click('#toolbar > form > button[type="submit"]')
    .wait('#toolbar > div.creation-name > p')
    .evaluate( () => {
      const name  = document.querySelector('#toolbar > div.creation-name > p > span').textContent
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
