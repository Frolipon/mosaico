'use strict'

const ko          = require( 'knockout' )
const console     = require( 'console' )

// we need to declare which paramaters are supported
// so in @supports -ko-blockdefs we can write:
// bgimage {
//   label: Background Image;
//   widget: bgimage;
//   size: 200x100;
// }

// other “native” widgets are defined in converter/editor.js

const parameters    = Object.freeze({
  size: `100x100`,
})

const isValidSize   = size => /(\d+)x(\d+)/.test( size.trim() )


function html( propAccessor, onfocusbinding, { size } ) {
  size = isValidSize( size ) ? size : parameters.size

  return `
    <input size="7" type="hidden" value="nothing" id="${propAccessor}" data-bind="value: ${propAccessor}, ${onfocusbinding}" />
    <button data-bind="text: $root.t('widget-bgimage-button'), click: $root.openDialogGallery.bind($element, '${propAccessor}', '${size}');">pick an image</button>
  `
}

module.exports = opts => {

  const { basePath } = opts

  function widget( $, ko, kojqui ) {
    return {
      widget: 'bgimage',
      parameters,
      html,
    }
  }

  function viewModel( vm ) {
    vm.showDialogGallery  = ko.observable( false )
    vm.currentBgimage     = ko.observable( false )
    vm.currentBgsize      = ko.observable( false )
    vm.setBgImage         = ( imageName, img, event ) => {
      // images have to be on an absolute path
      // => ZIP download needs it that way
      vm.currentBgimage()( `${ basePath }/cover/${ vm.currentBgsize() }/${ imageName }` )
      vm.closeDialogGallery()
    }
    vm.openDialogGallery = ( propAccessor, size, blockProperties, event ) => {
      // to set the right property, store the concerned setter
      vm.currentBgimage( blockProperties[ propAccessor ].bind( blockProperties ) )
      vm.currentBgsize( size )
      vm.showDialogGallery( true )
    }
    vm.closeDialogGallery = () => {
      vm.currentBgsize( false )
      vm.currentBgimage( false )
      vm.showDialogGallery( false )
    }

    const dialogGalleryOpen = vm.showDialogGallery.subscribe( newValue => {
      if (newValue === true && vm.mailingGalleryStatus() === false) {
        vm.loadMailingGallery()
        dialogGalleryOpen.dispose()
      }
    })
  }

  return {
    widget,
    viewModel,
  }
}
