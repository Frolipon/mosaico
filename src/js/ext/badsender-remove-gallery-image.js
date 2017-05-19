'use strict'

var console = require('console')
var $       = require('jquery')
var ko      = require('knockout')

function removeGalleryImage( opts ) {

  var galleryUrl = opts.fileuploadConfig.url

  return function (viewModel) {

    viewModel.removeImage = function (data, type, event) {
      var deleteUrl = data.deleteUrl
      // var
      console.log('removeImage', data, type)

      $.ajax({
        url:    deleteUrl,
        method: 'DELETE',
        // type is an alias for method.
        // Use type because method is not supported jQuery prior to 1.9.0.
        // actual bower version is 1.12.4 :(
        type:   'DELETE',
        success: function (res) {
          viewModel.notifier.success(viewModel.t('gallery-remove-image-success'))
          var gallery  = viewModel[ type + 'Gallery' ]
          var status   = viewModel[ type + 'GalleryStatus' ]
          status( res.files.length )
          gallery( res.files.reverse() )
          // console.log(res)
        },
        error: function (err) {
          console.log(err)
          viewModel.notifier.error(viewModel.t('gallery-remove-image-fail'))
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
