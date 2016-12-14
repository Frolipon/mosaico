import $ from 'jquery'

import logger from './_logger'
import pubsub from './_pubsub'

const DEBUG     = true
const log       = logger('creation selection', DEBUG)
const $ui       = {}
const lang      = $('html').attr('lang')
// TODO move messages in i18n
// _layout-customer.pug#60
const messages  = {
  en: {
    singular: 'item selected',
    plural:   'items selected',
  },
  fr: {
    singular: 'élément selectionné',
    plural:   'éléments selectionnés',
  }
}

function init() {
  log('init', lang)
  $ui.container = $('.js-line-selection')
  if (!$ui.container.length)  return log.warn('abort init')
  bindUi()
  bindEvents()
}

function bindUi() {
  $ui.actions           = $('.js-line-actions')
  $ui.selectAll         = $('.js-creation-selection-all')
  $ui.selectionCount    = $('.js-selection-count')
  $ui.tbody             = $ui.container.find('tbody')
  $ui.checkboxes        = $ui.tbody.find('input')
}

function bindEvents() {
  $ui.tbody.on('change' , toggle)
  $ui.selectAll.on('change', toggleAll)
}

function toggle(e) {
  log('toggle one')
  updateTable()
}

function updateTable() {
  const $checked        = $ui.checkboxes.filter(':checked')
  const creationsCount  = $checked.length
  const isPlural        = creationsCount < 2
  const message         = messages[lang][ isPlural ? 'singular' : 'plural' ]

  log('updateTable', creationsCount)
  $ui.selectionCount.text( `${creationsCount} ${message}`)
  $ui.actions[ creationsCount ? 'addClass' : 'removeClass']('is-visible')
  pubsub('table:selection').publish({
    count:            creationsCount,
    isNoSelection:    creationsCount === 0,
    isFullSelection:  creationsCount === $ui.checkboxes.length,
    $checkboxes:      $ui.checkboxes.filter(':checked'),
  })
}

function toggleAll() {
  log('toggle all')
  const state = $ui.selectAll.is(':checked')
  $ui.checkboxes.prop('checked', state)
  updateTable()
}

init()
