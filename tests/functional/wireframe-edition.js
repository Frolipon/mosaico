const test            = require('tape')

const {
  createWindow,
  connectUser,
  connectAdmin,
  setupDB,
  getTeardownHandlers,
}                     = require('../_utils')

test('admin – delete a wireframe', t => {
  const nightmare           = createWindow(false)
  const waitTime            = 10
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)
  const data                = { 
    templateId: '5771fb054622d7a3d3f0d7a7',
    companyId:  '57c91dd2d8744e36669342bc',
  }

  t.plan(2)
  setupDB().then( start ).catch( onError )

  function start() {
    nightmare
    .use( connectAdmin() )
    .wait( waitTime )
    .goto(`http://localhost:3000/companies/${data.companyId}`)
    .wait( waitTime )
    .evaluate( findExistingWireframeLinks, data)
    .then( checkLinksAndDeleteWireframe )
    .then( onEnd(checkWireframeLinkAndEnd) )
    .catch( onError )
  }

  function findExistingWireframeLinks( data ) {
    const templateLink = document.querySelectorAll(`a[href="/wireframes/${data.templateId}"]`)
    return { hasTemplateLink : templateLink.length > 1 }
  }

  function checkLinksAndDeleteWireframe(result) {
    t.equal( result.hasTemplateLink, true, 'wireframe is present found and has creations')

    return nightmare
    .goto(`http://localhost:3000/wireframes/${data.templateId}`)
    .click( 'a.js-delete-wireframe' )
    .wait( waitTime )
    .click( `a.js-dialog-confirm` )
    .wait( waitTime )
    .wait( `a[href="#wireframe-panel"]` )
    .evaluate( findWireframeLink, data )
  }

  function findWireframeLink( data ) {
    const templateLink = document.querySelectorAll(`a[href="/wireframes/${data.templateId}"]`)
    return { hasntTemplateLink : templateLink.length === 0 }
  }

  function checkWireframeLinkAndEnd( result ) {
    t.equal( result.hasntTemplateLink, true, 'wireframe is nowhere to be found anymore')
  }

})
