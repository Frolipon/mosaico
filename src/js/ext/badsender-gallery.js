'use strict'

var console = require('console')
var $       = require('jquery')
var ko      = require('knockout')

function galleryLoader( opts ) {

  var galleryUrl = opts.fileuploadConfig.url

  return function (viewModel) {

    viewModel.mailingGallery        = ko.observableArray([]).extend({ paging: 16 })
    viewModel.templateGallery       = ko.observableArray([]).extend({ paging: 16 })
    viewModel.mailingGalleryStatus  = ko.observable(false)
    viewModel.templateGalleryStatus = ko.observable(false)

    function loadGallery( type ) {
      var url      = galleryUrl[ type ]
      var gallery  = viewModel[ type + 'Gallery' ]
      var status   = viewModel[ type + 'GalleryStatus' ]
      return function() {
        status('loading')
        // retrieve the full list of remote files
        $.getJSON(url, function ( data ) {
          for (var i = 0; i < data.files.length; i++) data.files[i] = viewModel.remoteFileProcessor(data.files[i])
          status( data.files.length )
          gallery( data.files.reverse() )
        }).fail(function() {
          status( false )
          viewModel.notifier.error(viewModel.t('Unexpected error listing files'))
        });
      }
    }

    function loadImage( type ) {
      var gallery  = viewModel[ type + 'Gallery' ]
      var status   = viewModel[ type + 'GalleryStatus' ]
      return function ( img ) {
        gallery.unshift( img )
        status( gallery().length )
      }
    }

    viewModel.loadMailingGallery    = loadGallery( 'mailing' )
    viewModel.loadTemplateGallery   = loadGallery( 'template' )
    viewModel.loadMailingImage      = loadImage( 'mailing' )
    viewModel.loadTemplateImage     = loadImage( 'template' )

    var galleryOpen = viewModel.showGallery.subscribe( function( newValue ) {
      if (newValue === true && viewModel.mailingGalleryStatus() === false) { 
        viewModel.loadMailingGallery()
        galleryOpen.dispose()
      }
    } )

    var tabChange   = viewModel.selectedImageTab.subscribe( function(newValue) {
      if (newValue === 1 && viewModel.templateGalleryStatus() === false) {
        viewModel.loadTemplateGallery()
        tabChange.dispose()
      }
    }, viewModel, 'change')

  }

}

module.exports = galleryLoader