const Nightmare = require('nightmare')
const exec      = require('child_process').exec
const path      = require('path')
const c         = require('chalk')
const args      = require('yargs').argv

// http://lea.verou.me/2016/12/resolve-promises-externally-with-this-one-weird-trick/
function defer() {
  var res, rej
  var promise = new Promise((resolve, reject) => {
    res = resolve
    rej = reject
  })
  promise.resolve = res
  promise.reject  = rej
  return promise
}

////////
// SHARED FUNCTIONNAL THINGS
////////

function connectUser(show = false) {
  return Nightmare({ show })
  .goto('http://localhost:3000')
  .insert('#email-field', 'p@p.com')
  .insert('#password-field', 'p')
  .click('form[action*="/login"] [type=submit]')
  .wait('.customer-home')
}

function connectAdmin(show = false) {
  return Nightmare({ show })
  .goto('http://localhost:3000/admin')
  .insert('#password-field', 'toto')
  .click('form[action*="/login"] [type=submit]')
  .wait('.mdl-layout-title')
}

////////
// DB
////////

const config        = require('../server/config')
const tmpFolder     = config.images.tmpDir
const dumpFolder    = `${tmpFolder}/local-db-before-test-snapshot`
const u             = require('../bin/_db-utils')
const dbLocal       = config.dbConfigs.local
const testDatas     = path.join(__dirname, './test-datas')

//----- SETUP

function setupDB() {
  const dfd = defer()
  const dumpCmd = `mongodump ${u.setDbParams(dbLocal)} -o ${tmpFolder}`
  exec(`rm -rf ${dumpFolder}`, (error, stdout, stderr) => {
    var dbDump  = exec(dumpCmd, dumpdone)
  })

  function dumpdone(error, stdout, stderr) {
    if (error !== null) return dfd.reject(error)
    exec(`mv ${tmpFolder}/badsender ${dumpFolder}`, _ => {
      var copyCmd = `mongorestore --drop ${u.setDbParams(dbLocal)} ${testDatas}`
      var dbCopy = exec(copyCmd, onTestDatas)
    })
  }

  function onTestDatas(error, stdout, stderr) {
    if (error !== null) return dfd.reject(error)
    dfd.resolve()
  }

  return dfd

}

//----- TEARDOWN

function teardownDB(t, cb) {
  var copyCmd = `mongorestore --drop ${u.setDbParams(dbLocal)} ${dumpFolder}`
  var dbCopy = exec(copyCmd, function onRestore(error, stdout, stderr) {
    if (error !== null) return t.end(error)
    cb ? cb() : t.end()
  })
}

function teardownAndError(t) {
  return function(testError) {
    teardownDB(t)
    .then( _ => t.end(testError) )
    .catch( t.end )
  }
}

////////
// EXPORTS
////////

module.exports = {
  connectUser,
  connectAdmin,
  setupDB,
  teardownDB,
  teardownAndError,
}
