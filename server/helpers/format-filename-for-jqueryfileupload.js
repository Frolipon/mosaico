'use strict'

const thumbnailSize = `111x111`

module.exports = filename => {
  return {
    name:         filename,
    url:          `/img/${ filename }`,
    deleteUrl:    `/img/${ filename }`,
    thumbnailUrl: `/cover/${ thumbnailSize }/${filename}`,
  }
}
