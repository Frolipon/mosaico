const test            = require('tape')
const {
  createWindow,
  connectUser,
  connectAdmin,
  setupDB,
  getTeardownHandlers,
}                     = require('../_utils')

test('admin – deactivate a user', t => {
  const nightmare           = createWindow(false)
  const { onEnd, onError }  = getTeardownHandlers(t, nightmare)
  const data                = { _id: '576ba0049f9d3c2c13362d7c' }

  t.plan(4)
  setupDB().then(start).catch( onError )

  function start() {
    nightmare
    .use( connectAdmin() )
    .goto(`http://localhost:3000/users/${data._id}`)
    .evaluate( () => {
      const iconEl  = document.querySelector('.mdl-list li:nth-child(5) i')
      const icon    = iconEl ? iconEl.textContent : 'no icon to display on user card'
      return { icon }
    })
    .then( checkUserIsActive )
    .then( checkUserIsDeactivated )
    .then( checkDeactivatedIsntInCompanyListing )
    .then( onEnd( result => {
      t.equal(result.errorMessage, 'no user', `user can't connect anymore`)
    } ) )
    .catch( onError )
  }

  function checkUserIsActive(result) {
    t.equal(result.icon, 'check', 'use is active to begin with')
    return nightmare
    .click(`a[href="/users"]`)
    .wait()
    .click(`a[href="/users/${data._id}?_method=DELETE"]`)
    .wait()
    .evaluate( _id => {
      const userLinkEl  = document.querySelector(`a[href="/users/${_id}`)
      const line        = userLinkEl.parentNode.parentNode
      const status      = line.querySelector(`td:nth-child(5)`).textContent
      const userEmail   = userLinkEl.textContent
      const companyLink = line.querySelector(`a[href^="/companies"]`).href
      return { status, companyLink, userEmail }
    }, data._id)
  }

  function checkUserIsDeactivated(result) {
    t.equal( result.status, 'deactivated', 'user link deactivated in user listing')
    // need this to try to reconnect
    data.userEmail = result.userEmail
    return nightmare
    .goto( result.companyLink )
    .click(`a[href="#user-panel"]`)
    .evaluate( _id => {
      return {
        userLinkEl: document.querySelector(`#user-panel a[href="/users/${_id}`),
      }
    }, data._id)
  }

  function checkDeactivatedIsntInCompanyListing(result) {
    t.equal( result.userLinkEl, null, 'no user link in company page')
    return nightmare
    .click(`a[href="/logout"]`)
    .goto('http://localhost:3000')
    .insert( '#email-field', data.userEmail )
    .insert( '#password-field', 'pp')
    .click( 'form[action*="/login"] [type=submit]' )
    .wait( 666 )
    // beware of not setting arguments:
    // if argument's length & no additional param => done callback
    .evaluate( () => {
      const errorEl = document.querySelector('.message.error p')
      return { errorMessage: errorEl ? errorEl.textContent : false }
    })
  }

})
