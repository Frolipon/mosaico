'use strict'

// This script will synchronize all the images present on a local folder in a specific bucket
// require awscli to be installed
// `brew install awscli` on a mac
// credentials should be specified in the .badsenderc following s3Configs parameters specified in .badsenderrc-example

const { spawn }     = require( 'child_process' )
const which         = require( 'which' )
const readline      = require( 'readline' )
const inquirer      = require( 'inquirer' )
const c             = require( 'chalk' )
const path          = require( 'path' )
const fs            = require( 'fs' )

const config        = require( '../server/config' )

const { s3Configs } = config
const aws           = which.sync( 'aws' )
const tmpFolder     = config.images.tmpDir
const backups       = fs.readdirSync(tmpFolder).filter( name => /^s3-/.test(name) )
let s3Config, srcFolder

let selectSrc      = inquirer.prompt([
  {
    type:     'list',
    name:     'source',
    message:  `Choose a ${c.green('source folder')}`,
    choices:  backups,
  },
  {
    type:     'list',
    name:     'destination',
    message:  `Choose a ${c.green('destination S3')}`,
    choices:  Object.keys( s3Configs ),
  },
])

selectSrc
.then( ({source, destination}) => {
  s3Config        = s3Configs[ destination ]
  srcFolder       = path.join( __dirname, '../', tmpFolder, source )

  return inquirer.prompt({
    type:     'confirm',
    default:  false,
    name:     'confirmation',
    message:  `you are going to copy:
    ${ c.green(source) } => ${ c.magenta(destination) }`,
  })
})
.then( ({confirmation}) => {
  if (confirmation === false) {
    console.log('operation aborted')
    return process.exit(0)
  }

  const cmd       = `s3 sync ${ srcFolder } s3://${ s3Config.bucketName }`
  console.log( cmd )
  // process.exit( 0 )

  const child       = spawn( aws, cmd.split(' '), {
    env: {
      AWS_ACCESS_KEY_ID:      s3Config.accessKeyId,
      AWS_SECRET_ACCESS_KEY:  s3Config.secretAccessKey,
      AWS_DEFAULT_REGION:     s3Config.region,
    },
  })

  readline.createInterface({
    input     : child.stdout,
    terminal  : false
  }).on('line',  console.log )

  child.stderr.on('data', function (data) {
    console.log('stderr: ' + data)
  })
  child.on('close', function (code) {
    console.log( `child process exited with code ${ code }` )
    process.exit( code )
  })
})
.catch( console.log )
