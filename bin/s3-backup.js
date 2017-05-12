'use strict'

// This script will download all the images present on a specific bucket in a local folder
// require awscli to be installed
// `brew install awscli` on a mac
// credentials should be specified in the .badsenderc following s3Configs parameters specified in .badsenderrc-example

const { spawn }     = require( 'child_process' )
const which         = require( 'which' )
const readline      = require( 'readline' )
const inquirer      = require( 'inquirer' )
const c             = require( 'chalk' )
const path          = require( 'path' )
const moment        = require( 'moment' )

const config        = require( '../server/config' )

const { s3Configs } = config
const aws           = which.sync( 'aws' )
const now           = moment().format( 'YYYY-MM-DD_HH:mm' )
let sourceName, s3From, tmpFolder

let selectSrc      = inquirer.prompt([
  {
    type:     'list',
    name:     'source',
    message:  `Choose a ${c.green('source')} S3 to backup`,
    choices:  Object.keys( s3Configs ),
  },
])

Promise
.all([selectSrc, config.setup])
.then( ([promptConf, conf]) => {
  sourceName        = promptConf.source
  s3From            = s3Configs[ sourceName ]
  tmpFolder         = conf.images.tmpDir
  const destFolder  = path.join( tmpFolder, `s3-${sourceName}-${now}` )
  const cmd         = `s3 sync s3://${s3From.bucketName} ${ destFolder }`
  console.log( cmd )
  // use `spawn` instead of `exec` to avoid => stdout maxBuffer exceeded
  // http://stackoverflow.com/questions/23429499/stdout-buffer-issue-using-node-child-process#answer-26995407
  const child       = spawn( aws, cmd.split(' '), {
    env: {
      AWS_ACCESS_KEY_ID:      s3From.accessKeyId,
      AWS_SECRET_ACCESS_KEY:  s3From.secretAccessKey,
      AWS_DEFAULT_REGION:     s3From.region,
    },
  })
  // child.stdout return a buffer
  // use readline to have a nice input
  // http://stackoverflow.com/questions/20270973/nodejs-spawn-stdout-string-format
  readline.createInterface({
    input     : child.stdout,
    terminal  : false
  }).on('line',  console.log )

  child.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  })
  child.on('close', function (code) {
    console.log( `child process exited with code ${ code }` )
    process.exit( code )
  })
})
.catch( console.log )
