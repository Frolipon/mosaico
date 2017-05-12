'use strict'

var getSlug = require('speakingurl')

// take care of slugging everything BUT the file extension
// keeping this file as minimal as possible -> used in front-end (editor)
var extReg  = /\.[0-9a-zA-Z]+$/

function slugFilename(name) {
  // keep the fileName with uppercases
  // wireframes preview's images are camelCased
  var fileName      = name.trim()
  // It seems that some files came here without extension O_O'
  // https://github.com/goodenough/mosaico/issues/71
  // Haven't been able to reproduce but secure it
  var hasExtension  = extReg.test( fileName )
  if ( !hasExtension ) {
    console.log('[SLUGFILENAME] impossible to slug', name)
    return false
  }
  var ext           = extReg.exec(fileName)[0]
  fileName          = fileName.replace(ext, '')
  fileName          = getSlug( fileName.trim() ) + ext
  return fileName
}

module.exports = slugFilename
