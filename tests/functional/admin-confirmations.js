const test            = require('tape')
const {
  createWindow,
  connectUser,
  connectAdmin,
  setupDB,
  getTeardownHandlers,
}                     = require('../_utils')

test('admin – check all confirmation popup in admin', t => {
  const nightmare           = createWindow(false)
  const waitTime            = 10
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)
  const data                = { 
    userId:     '580eba860bf6fc79a8c6a429',
    companyId:  '57c91dd2d8744e36669342bc',
  }

  t.plan(9)
  setupDB().then( start ).catch( onError )

  function start() {
    console.log('START')

    nightmare
    .use( connectAdmin() )
    .wait( waitTime )
    .goto(`http://localhost:3000/users`)
    // check user listing deactivate
    .click('tr:first-child td:last-child a')
    .wait( `dialog[open]` )
    .evaluate( getDialogTitle )
    .then( result => {
      t.equal( result.title, 'Deactivate', 'user listing - deactivation dialog')
      return nightmare
      .click('button.js-dialog-cancel')
      .wait( waitTime )
      // check user listing reset 
      .click('tr:first-child form button')
      .wait( `dialog[open]` )
      .evaluate( getDialogTitle )
    } )
    .then( result => {
      t.equal( result.title, 'Reset', 'user listing - reset dialog')
      return nightmare
      .click('button.js-dialog-cancel')
      .wait( waitTime )
      // check user card deactivate
      .click( `a.js-user-deactivate` )
      .wait( `dialog[open]` )
      .evaluate( getDialogTitle )
    } )
    .then( result => {
      t.equal( result.title, 'Deactivate', 'user card - deactivation dialog')
      return nightmare
      .click('button.js-dialog-cancel')
      .wait( waitTime )
      .click(`tr:first-child td:first-child a`)
      .wait( waitTime )
      // check user card reset
      .click( `form[action="/users/reset"] button`) 
      .wait( `dialog[open]` )
      .evaluate( getDialogTitle )
    } )
    
    .then( result => {
      t.equal( result.title, 'Reset', 'user card - reset dialog')
      return nightmare
      .click('button.js-dialog-cancel')
      .wait( waitTime )
      .goto(`http://localhost:3000/wireframes`)
      .wait( waitTime )
      // check wireframe listing delete
      .click('tr:first-child td:last-child a')
      .wait( `dialog[open]` )
      .evaluate( getDialogTitle )
    } )
    .then( result => {
      t.equal( result.title, 'Delete template', 'wireframe listing - deletion dialog')
      return nightmare
      .click('button.js-dialog-cancel')
      .wait( waitTime )
      .click( `tr:first-child td:first-child a`)
      .wait( waitTime )
      // check wireframe card delete
      .click( `a.js-delete-wireframe` )
      .wait( `dialog[open]` )
      .evaluate( getDialogTitle )
    } )
    .then( result => {
      t.equal( result.title, 'Delete template', 'wireframe card - deletion dialog')
      return nightmare
      .click( `.mdl-list li:first-child a` )
      .wait( waitTime )
      .click( `#wireframe-panel tr:first-child a.js-delete-wireframe` )
      .wait( `dialog[open]` )
      .evaluate( getDialogTitle )
    } )
    .then( result => {
      t.equal( result.title, 'Delete template', 'Company card - wireframe deletion dialog')
      return nightmare
      .click( `button.js-dialog-cancel` )
      .wait( waitTime )
      .click( `a[href="#user-panel"]` )
      .wait( waitTime )
      .click( `#user-panel tr:first-child td:last-child a` )
      .wait( `dialog[open]` )
      .evaluate( getDialogTitle )
    })
    .then( result => {
      t.equal( result.title, 'Deactivate', 'Company card - user deactivation dialog')
      return nightmare
      .click( `button.js-dialog-cancel` )
      .wait( waitTime )
      .click( `#user-panel tr:first-child button` )
      .wait( `dialog[open]` )
      .evaluate( getDialogTitle )
    })
    .then( onEnd( result => { 
      t.equal( result.title, 'Reset', 'Company card - user reset dialog')
    } ))
    .catch( onError )
  }

  function getDialogTitle() {
    const dialogTitle = document.querySelector('.js-dialog-title')
    return {
      title: dialogTitle ? dialogTitle.textContent : false
    }
  }
  
})
