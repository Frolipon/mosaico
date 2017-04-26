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

  t.plan( 1 )
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

test('batch deletion', t => {
  const nightmare           = createWindow( false )
  const waitTime            = 20
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)
  const data                = { }

  t.plan( 3 )
  setupDB().then( start ).catch( onError )

  function start() {
    nightmare
    .use( connectUser() )
    .select( `select.js-pagination`, `/?page=1&limit=50` )
    .wait( waitTime )
    .evaluate( getCreationCount, data )
    .then( result => {
      data.inititalCreationCount = result.creationCount
      return nightmare
      .check( `tbody tr:nth-child(1) input` )
      .check( `tbody tr:nth-child(2) input` )
      .wait( waitTime )
      .evaluate( getHeaderSelectionCount, data )
    })
    .then( result => {
      t.equal( result.headerSelectionCount, 2, 'batch deletion - selection is counted correctly on the header')
      return nightmare
      .click( `button.js-delete-creations` )
      .wait( waitTime )
      .evaluate( getDialogSelectionCount, data )
    })
    .then( result => {
      t.equal( result.dialogSelectionCount, 2, 'batch deletion - selection is counted correctly on the dialog')
      return nightmare
      .click( `button.js-delete-confirm` )
      .wait( waitTime )
      .evaluate( getCreationCount, data )
    })
    .then( onEnd( result => {
      t.equal( result.creationCount, data.inititalCreationCount - 2, 'batch deletion - creations have been deleted')

    }) )
    .catch( onError )
  }

  function getCreationCount( data ) {
    return { creationCount: document.querySelectorAll( `tbody tr` ).length }
  }
  function getHeaderSelectionCount( data ) {
    const title   = document.querySelector(`.js-selection-count`)
    const text    = title ? title.textContent : ''
    const number  = /^(\d+)/.exec( text )
    const founded = number ? ~~number[1] : false
    return { headerSelectionCount: founded }
  }
  function getDialogSelectionCount( data ) {
    return { dialogSelectionCount: document.querySelectorAll( `.js-delete-selection-list li` ).length }
  }

})

