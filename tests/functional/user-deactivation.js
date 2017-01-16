const test            = require('tape')
const {
  connectUser,
  connectAdmin,
  setupDB,
  teardownDB,
  teardownAndError,
}                     = require('../_utils')

test('admin – deactivate a user', t => {
  const _id         = '576ba0049f9d3c2c13362d7c'
  const nightmare   = connectAdmin(false)
  const handleError = teardownAndError(t, nightmare)

  t.plan(3)
  setupDB().then(start).catch( handleError )

  function start() {
    nightmare
    .goto(`http://localhost:3000/users/${_id}`)
    .evaluate( () => {
      const icon = document.querySelector('.mdl-list li:nth-child(4) i').textContent
      return { icon }
    })
    .then( checkUserIsActive )
    .then( checkUserIsDeactivated )
    .then( checkDeactivatedIsntInCompanyListing )
    .catch( handleError )
  }

  function checkUserIsActive(data) {
    t.equal(data.icon, 'check', 'use is active to begin with')
    return nightmare
    .click(`a[title="users"]`)
    .wait()
    .click(`a[href="/users/${_id}?_method=DELETE"]`)
    .wait()
    .evaluate( _id => {
      const userLinkEl  = document.querySelector(`a[href="/users/${_id}`)
      const line        = userLinkEl.parentNode.parentNode
      const status      = line.querySelector(`td:nth-child(5)`).textContent
      const companyLink = line.querySelector(`a[href^="/companies"]`).href
      return Promise.resolve({ status, companyLink })
    }, _id)
  }

  function checkUserIsDeactivated(data) {
    t.equal( data.status, 'deactivated', 'user link deactivated in user listing')
    return nightmare
    .goto( data.companyLink )
    .click(`a[href="#user-panel"]`)
    .evaluate( _id => {
      return {
        userLinkEl: document.querySelector(`#user-panel a[href="/users/${_id}`),
      }
    }, _id)
  }

  function checkDeactivatedIsntInCompanyListing(data) {
    t.equal( data.userLinkEl, null, 'no user link in company page')
    teardownDB(t, _ => {
      nightmare.end().then( __ => { console.log('end')} )
    })
  }

  // try to connect with a deactivated user

})
