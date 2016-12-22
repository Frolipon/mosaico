import $ from 'jquery'

import logger from './_logger'
import pubsub from './_pubsub'

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

}

function bindEvents() {
  $ui.btn.on('click', removeCreations)
  pubsub('table:selection').subscribe(updateSelectedList)
}

function updateSelectedList(e) {
  $ui.checkboxes = e.$checkboxes

}

function removeCreations(e) {
  const creations = [...$ui.checkboxes].map( el => el.value )
  log('remove creations', creations)
  $.ajax({
    method: 'DELETE',
    url:    '/creations',
    data:   {
      creations,
    }
  })
}

init()
