'use strict'

const util  = require('util')
const chalk = require('chalk')

const config       = require('./config')
const { mongoose } = require('./models')

//----- MONGO DATABASE

mongoose.connection.once('open', e =>  {
  console.log(chalk.green(`[SERVICES] DB – connection ok`))
})

const dbConnection = mongoose.connect( config.database )

dbConnection
  .catch( dbConnectionError => {
    console.log( chalk.red(`[SERVICES] DB – can't connect`) )
    console.log( util.inspect(dbConnectionError, {colors: true}) )
  })

//----- GLOBAL CHECK

const areReady = Promise.all([
  config.setup,
  dbConnection,
])
.catch( serviceDependenciesError => {
  console.log( chalk.red(`[SERVICES] One or more service dependency is preventing the application from running properly`) )
  return false
})

module.exports = {
  areReady,
}
