const test      = require('tape')
const Nightmare = require('nightmare')
const nightmare = Nightmare({ show: false })

test('timing test', t => {
    t.plan(2)

    t.equal(typeof Date.now, 'function')
    var start = Date.now()

    setTimeout(function () {
        t.equal(Date.now() - start, 100)
    }, 100)
})

test('yahoo test', t => {
  t.plan(1)

  nightmare
  .goto('http://yahoo.com')
  .type('form[action*="/search"] [name=p]', 'github nightmare')
  .click('form[action*="/search"] [type=submit]')
  .wait('#main')
  .evaluate(function () {
    return document.querySelector('#main .searchCenterMiddle li a').href
  })
  .end()
  .then(function (result) {
    console.log(result)
    t.pass()
  })
  .catch(function (error) {
    console.error('Search failed:', error);
    t.fail(error)
  });

})
