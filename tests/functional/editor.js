const test            = require('tape')

const {
  connectUser,
  connectAdmin,
  setupDB,
  teardownDB,
  teardownAndError,
}                     = require('../_utils')
const rename          = {
  nameSelector:   `#toolbar > div.creation-name > p > span`,
  inputSelector:  `#toolbar > form > input[type="text"]`,
  submitSelector: `#toolbar > form > button[type="submit"]`,
}

function gotToEditor(nightmare) {
  return nightmare
  .click('.js-tbody-selection tr:nth-child(2) > td:nth-child(2) > a')
  .wait('#toolbar .creation-name')
}

function activateRename(nightmare) {
  return nightmare
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
  .wait('#toolbar > form > input[type="text"]')
  .insert('#toolbar > form > input[type="text"]', false)
}

function checkName(nightmare) {
  return nightmare
  .click( rename.submitSelector )
  .wait( rename.nameSelector )
  .evaluate( nameSelector => {
    const name  = document.querySelector( nameSelector ).textContent
    return { name }
  }, rename.nameSelector)
  .end()
}

test('rename from editor – can rename', t => {
  const renameTestCreationTitle = 'new creation name'
  t.plan(1)
  setupDB().then(test).catch(t.end)

  function test() {
    connectUser(false)
    .use( gotToEditor )
    .use( activateRename )
    .insert( rename.inputSelector, renameTestCreationTitle )
    .use( checkName )
    .then( result => {
      teardownDB(t, _ => {
        const { name  } = result
        t.equal(name, renameTestCreationTitle)
      })
    } )
    .catch( teardownAndError(t) )
  }
})

test('rename from editor – empty rename get default title', t => {
  t.plan(1)
  setupDB().then(test).catch(t.end)

  function test() {
    connectUser(false)
    .use( gotToEditor )
    .use( activateRename )
    .type( rename.inputSelector, 'p' )
    .type( rename.inputSelector, '\u0008' )
    .use( checkName )
    .then( result => {
      teardownDB(t, _ => {
        const { name  } = result
        t.equal(name, 'untitled')
      })
    } )
    .catch( teardownAndError(t) )
  }
})

test('rename from editor – name of 1 space behave like empty', t => {
  t.plan(1)
  setupDB().then(test).catch(t.end)

  function test() {
    connectUser(false)
    .use( gotToEditor )
    .use( activateRename )
    .type( rename.inputSelector, ' ' )
    .use( checkName )
    .then( result => {
      teardownDB(t, _ => {
        const { name  } = result
        t.equal(name, 'untitled')
      })
    } )
    .catch( teardownAndError(t) )
  }
})

test('rename from editor – admin can do it on a user creation', t => {
  const renameTestCreationTitle = 'new creation name'
  t.plan(1)
  setupDB().then(test).catch(t.end)

  function test() {
    connectAdmin(true)
    .goto( 'http://localhost:3000/editor/580c4d0ec3a29f4a1cd26083' )
    .wait('#toolbar .creation-name')
    .use( activateRename )
    .insert( rename.inputSelector, renameTestCreationTitle )
    .use( checkName )
    .then( result => {
      teardownDB(t, _ => {
        const { name  } = result
        t.equal(name, renameTestCreationTitle)
      })
    } )
    .catch( teardownAndError(t) )
  }
})
