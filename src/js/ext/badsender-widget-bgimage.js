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
const parameters    = Object.freeze({
  size: `100x100`,
})

const isValidSize   = size => /(\d+)x(\d+)/.test( size.trim() )

function widget( $, ko, kojqui ) {
  return {
    widget: 'bgimage',
    parameters,
    html,
  }
}

function html( propAccessor, onfocusbinding, { size } ) {
  console.log('HTML')
  console.log( {propAccessor, size } )
  size = isValidSize( size ) ? size : parameters.size

  return `
    <input size="7" type="text" value="nothing" id="${propAccessor}" data-bind="value: ${propAccessor}, ${onfocusbinding}" />
    <button data-bind="click: $root.openDialogGallery.bind($element, '${propAccessor}', '${size}');">pick an image</button>
  `
}

function viewModel( vm ) {
  vm.showDialogGallery  = ko.observable( false )
  vm.currentBgimage     = ko.observable( false )
  vm.currentBgsize      = ko.observable( false )
  vm.setBgImage         = ( imageName, img, event ) => {
    // vm.currentBgimage()( `url("/cover/${ vm.currentBgsize() }/${ imageName }")` )
    vm.currentBgimage()( `/cover/${ vm.currentBgsize() }/${ imageName }` )
    vm.closeDialogGallery()
  }
  vm.openDialogGallery = ( propAccessor, size, blockProperties, event ) => {
    // console.log( blockProperties[ propAccessor ]() )
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

module.exports = {
  widget,
  viewModel,
}
