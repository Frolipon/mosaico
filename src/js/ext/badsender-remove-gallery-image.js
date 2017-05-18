'use strict'

var console = require('console')
var $       = require('jquery')
var ko      = require('knockout')

function removeGalleryImage( opts ) {

  var galleryUrl = opts.fileuploadConfig.url

  return function (viewModel) {

    viewModel.removeImage = function (data, event) {
      console.log('removeImage', data.deleteUrl)

      $.ajax({
        method: 'DELETE',
        // type is n alias for method.
        // Use type because method is not supported jQuery prior to 1.9.0.
        // actual bower version is 1.12.4 :(
        type:   'DELETE',
        url:    data.deleteUrl,
        success: function (res) {
          console.log(res)
        },
        error: function (err) {
          console.log(err)
          // viewModel.notifier.error(viewModel.t('edit-title-ajax-fail'))
        },
        complete: function () {
          // originalValue = ''
          // viewModel.titleMode('show')
        },
      })
    }


  }

}

module.exports = removeGalleryImage
