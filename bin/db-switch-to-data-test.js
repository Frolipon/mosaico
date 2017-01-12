'use strict'

// a simple script to:
//  • save a local db snapshot
//  • set the test datas
//  • restore it later
// used for automated tests

const exec          = require('child_process').exec
const path          = require('path')
const c             = require('chalk')
const args          = require('yargs').argv

const config        = require('../server/config')
const u             = require('./_db-utils')
const dbLocal       = config.dbConfigs.local
const testDatas     = path.join(__dirname, '../tests/test-datas')
let tmpFolder, dumpFolder, dumpCmd

config
.setup
.then( conf => {
  tmpFolder   = conf.images.tmpDir
  dumpFolder  = `${tmpFolder}/local-db-before-test-snapshot`
  if (args.set) return backupLocalDatas()
  if (args.restore) return restoreSnapshot()
  return process.exit(0)
})

////////
// BEFORE TEST
////////

function backupLocalDatas() {
  console.log(c.green('set datas for the test'))
  console.log('  • backup current local datas')
  dumpCmd     = `mongodump ${u.setDbParams(dbLocal)} -o ${tmpFolder}`
  exec(`rm -rf ${dumpFolder}`, (error, stdout, stderr) => {
    var dbDump  = exec(dumpCmd, dumpdone)
  })
}

function dumpdone(error, stdout, stderr) {
  if (error !== null) return u.logErrorAndExit(error, 'error in backing up')
  exec(`mv ${tmpFolder}/badsender ${dumpFolder}`, _ => {
    console.log('  • backup done')
    setTestDatas()
  })
}

function setTestDatas() {
  console.log('  • restore test datas')
  var copyCmd = `mongorestore --drop ${u.setDbParams(dbLocal)} ${testDatas}`
  var dbCopy = exec(copyCmd, onTestDatas)
}

function onTestDatas(error, stdout, stderr) {
  if (error !== null) return u.logErrorAndExit(error, 'error in setting test datas')
  console.log(c.green('test datas setted !'))
  process.exit(0)
}

////////
// AFTER TEST
////////

function restoreSnapshot() {
  console.log(c.green('Restore datas after test'))
  var copyCmd = `mongorestore --drop ${u.setDbParams(dbLocal)} ${dumpFolder}`
  var dbCopy = exec(copyCmd, onRestore)
}

function onRestore(error, stdout, stderr) {
  if (error !== null) return u.logErrorAndExit(error, 'error in restoring')
  console.log(c.green('datas ar restored!'))
  process.exit(0)
}
