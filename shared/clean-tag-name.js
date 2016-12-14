'use strict'

function cleanTagName(tag) {
  return tag.replace(/['",]/g, ' ').trim()
}

module.exports = cleanTagName
