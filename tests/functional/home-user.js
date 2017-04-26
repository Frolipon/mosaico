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
  setupDB().then( runTest ).catch( onError )

  function runTest() {
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
  setupDB().then( runTest ).catch( onError )

  function runTest() {
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
  setupDB().then( runTest ).catch( onError )

  function runTest() {
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

test('filter', t => { 
  const nightmare           = createWindow( false )
  const waitTime            = 20
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)
  const data                = { 
    userName:     `OTTO Van Der Toto`,
    userId:       `57d930f9db23313831bc1713`,
    templateName: [ `versafix-1`, `versafix-2`],
    templateId:   [ `579625a447df3e1a1531c056`, `57c282facbd36db78623b021` ],
  }
  const selector            = {
    toggleFilter: `.js-toggle-filter`,
    submitFilter: `.js-filter button[type=submit]`,
    clearFilter:  `a#tt-clear-filter`,
  }

  t.plan( 6 )
  setupDB().then( runTest ).catch( onError )

  function runTest() {
    nightmare
    .use( connectUser() )
    .select( `select.js-pagination`, `/?page=1&limit=50` )
    .wait( waitTime )
    .click( selector.toggleFilter )
    .wait( waitTime )
    .select( `#author-field`, data.userId )
    .click( selector.submitFilter )
    .wait( waitTime )
    .evaluate( getCreationCountAndAuthor, data )
    .then( result => {
      t.equal( result.names.length, 1, `author filter – only one author is left` )
      t.equal( result.names[0], data.userName, `author filter – it's the right one` )
      t.equal( result.summary, data.userName, `author filter – summary is the right one` )
      return nightmare
      .click( selector.clearFilter )
      .wait( waitTime )
      .click( selector.toggleFilter )
      .evaluate( setTemplatesFilter, data )
    })
    .then( result => {
      return nightmare
      .wait( waitTime )
      .click( selector.submitFilter )
      .wait( waitTime )
      .evaluate( getTemplateCountAndAuthor, data )
    })
    .then( onEnd( result => {
      t.equal( result.names.length, data.templateId.length, `templates filter – only selected templates are left` )
      t.equal( result.names.join(''), data.templateName.join(''), `templates filter – it's the right ones` )
      t.equal( result.summary, data.templateName.join(', '), `templates filter – summary is the right one` )
    }) )
    .catch( onError )
  }

  function getCreationCountAndAuthor( data ) {
    const creations = document.querySelectorAll( `tbody tr td:nth-child(4)` )
    const names     = [...creations].map( e => e.textContent )
    // Set only store unic values
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set
    const uniqNames     = Array.from( new Set( names ) )
    const authorSummary = document.querySelector( `.bs-table-header__summary dd` )

    return { names: uniqNames, summary: authorSummary ? authorSummary.textContent : false }
  }

  function setTemplatesFilter( data ) {
    // Has to do this in order to have a multiple selection…
    const select = document.querySelector( `#wireframe-field` )
    if (!select) return {}
    for (let id of data.templateId) {
      let option = select.querySelector( `option[value="${id}"]` )
      if (option) option.selected = true
    }
    const changeEvent = new Event('change')
    select.dispatchEvent( new Event('change') )
    return {}
  }

  function getTemplateCountAndAuthor( data ) {
    const templates = document.querySelectorAll( `tbody tr td:nth-child(3)` )
    const names     = [...templates].map( e => e.textContent )
    const uniqNames = [...new Set( names )].sort()
    const summary   = document.querySelector( `.bs-table-header__summary dd` )
    return { names: uniqNames, summary: summary ? summary.textContent : false }
  }


})
