import $ from 'jquery'

import logger from './_logger'

const DEBUG     = true
const log       = logger('delete creation', DEBUG)
const $ui       = {}

function init() {
  log('init')
  $ui.btn = $('.js-delete-creations')
  if (!$ui.btn.length) return log.warn('abort init')
  bindUi()
  bindEvents()
}

function bindUi() {
  $ui.form    = $('.js-action-form')
  $ui.dialog  = $('.js-dialog-delete')
}

function bindEvents() {
  $ui.btn.on('click', toggleWarn)
  $('.js-close-delete-dialog').on('click', closeDialog)
  $('.js-delete-confirm').on('click', removeCreation)
}

function toggleWarn(e) {
  log('toggle warn')
  e.preventDefault()
  $ui.dialog[0].showModal()
}

function removeCreation() {
  log('remove creation')
  $ui
  .form
  .attr( 'action', $ui.btn.attr('formaction') )
  .submit()
}

function closeDialog() {
  log('close dialog')
  $ui.dialog[0].close()
}

init()
