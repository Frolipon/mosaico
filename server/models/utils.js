// normalize string to have a better ordering
function normalizeString(string) {
  return string.trim().toLowerCase()
}

module.exports = {
  normalizeString,
}
