'use strict'

const ko      = require('knockout')
const console = require('console')

function widget( $, ko, kojqui ) {
  return {
    widget: 'bgimage',
    parameters: {
      param: true,
    },
    html,
  }
}

function html( propAccessor, onfocusbinding, parameters ) {
  // console.log(propAccessor, onfocusbinding, parameters)
  return `
    <input size="7" type="text" data-bind="value: ${propAccessor}, ${onfocusbinding}" />
    <button data-bind="click: $root.openDialogGallery">pick an image</button>
  `
}

function viewModel( vm ) {
  vm.showDialogGallery = ko.observable( false )
  vm.openDialogGallery = _ => {
    vm.showDialogGallery( true )
    console.log('showDialogGallery', vm.showDialogGallery() )
  }
}

module.exports = {
  widget,
  viewModel,
}
