'use strict'

// normalize string to have a better ordering
function normalizeString(string) {
  string = `${string}`
  return string.trim().toLowerCase()
}

module.exports = {
  normalizeString,
}
