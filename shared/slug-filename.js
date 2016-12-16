'use strict'

var getSlug = require('speakingurl')

// take care of slugging everything BUT the file extension
// keeping this file as minimal as possible -> used in front-end (editor)
var extReg  = /\.[0-9a-z]+$/

function slugFilename(name) {
  var fileName    = name
  // It seems that some files came here without extension O_O'
  // https://github.com/goodenough/mosaico/issues/71
  // Haven't been able to reproduce but secure it
  var isValidName = extReg.test(name)
  if (!isValidName) {
    console.log('[SLUGFILENAME] impossible to slug', name)
    return false
  }

  var ext         = extReg.exec(name)[0]
  fileName        = fileName.replace(ext, '')
  fileName        = getSlug(fileName) + ext
  return fileName
}

module.exports = slugFilename
