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

function createWindow(show = false) {
  return Nightmare({ show })
  .viewport(1280, 780)
}

function connectUser(email = 'p@p.com', password = 'p' ) {
  return nightmare => {
    return nightmare
    .goto('http://localhost:3000')
    .insert('#email-field', email)
    .insert('#password-field', password)
    .click('form[action*="/login"] [type=submit]')
    .wait(10)
    .wait('.customer-home')
  }
}

function connectAdmin() {
  return nightmare => {
    return nightmare
    .goto('http://localhost:3000/admin')
    .insert('#password-field', 'toto')
    .click('form[action*="/login"] [type=submit]')
    .wait(10)
    .wait('.js-admin-home')
  }
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

// while using tape t.plan,
// - calling the last test will end the current test
// - next test will be called
// - BUT we need to wait the DB to be restored
// - AND we need to wait NIGHTMARE to close
// https://github.com/segmentio/nightmare/issues/546

const copyCmd = `mongorestore --drop ${u.setDbParams(dbLocal)} ${dumpFolder}`
function teardownDBAndNightmare(t, nightmare) {
  return function (tapeFinalTest) {
    return function nightmarePromiseCallback(result) {
      nightmare.end().then( _ => exec(copyCmd, onDBRestore) )
      function onDBRestore(error, stdout, stderr) {
        if (error) return t.end( error )
        tapeFinalTest(result)
      }
    }
  }
}

function teardownAndError(t, nightmare) {
  return function(testError) {
    nightmare.end().then( _ => exec(copyCmd, onDBRestore) )
    function onDBRestore(error, stdout, stderr) {
      if (error) return t.end( error )
      t.end( testError )
    }
  }
}

function getTeardownHandlers(t, nightmare) {
  return {
    onEnd:    teardownDBAndNightmare(t, nightmare),
    onError:  teardownAndError(t, nightmare),
  }
}

////////
// EXPORTS
////////

module.exports = {
  createWindow,
  connectUser,
  connectAdmin,
  getTeardownHandlers,
  setupDB,
}
