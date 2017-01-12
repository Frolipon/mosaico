const Nightmare = require('nightmare')

function connectUser(show = false) {
  return Nightmare({ show })
  .goto('http://localhost:3000')
  .insert('#email-field', 'p@p.com')
  .insert('#password-field', 'p')
  .click('form[action*="/login"] [type=submit]')
  .wait('.customer-home')
}

module.exports = {
  connectUser,
}
