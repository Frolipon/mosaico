import $        from 'jquery'
import entries  from 'lodash.topairs'

import logger from './_logger'
import pubsub from './_pubsub'

const DEBUG     = init
const log       = logger('tags', DEBUG)

const $ui       = {}
let tags        = []

function init() {
  log('init')
  $ui.container   = $('.js-tags')
  if (!$ui.container.length) return log.warn('abort init')
  bindUi()
  bindEvents()
}

function bindUi() {
  $ui.tagsList    = $ui.container.find('input')
}

function bindEvents() {
  pubsub('table:selection').subscribe(updateTagList)
  // $ui.selectionContainer.on('change' , updateTagList)
  $('.js-open-tags-panel').on('click', openTagPanel)
  $('.js-close-tags-panel').on('click', closeTagPanel)
  $('.js-chech-tag').on('click', toggleTag)
  pubsub('key:escape').subscribe(closeTagPanel)
}

// Copy the same behaviour as GMAIL
// -> tag panel represent the current selection computed tags
function updateTagList(e) {
  log('updateTagList', e)
  let tagList           = {}
  const { $checkboxes } = e
  const lineCount       = $checkboxes.length

  $checkboxes
  .each( (i, el) => {
    el
    .getAttribute('data-tags')
    .split(',')
    .forEach( tag => {
      if (!tag) return
      if (!tagList[tag]) return tagList[tag] = 1
      tagList[tag] = tagList[tag] + 1
    } )
  } )

  // by default anything is unchecked
  $ui.tagsList.filter('[value=remove]').prop('checked', true)

  entries( tagList )
  .forEach(  tagLine => {
    const [tag, count]  = tagLine
    const tagCheckboxes = $ui.tagsList.filter(`[name=tag-${tag}]`)
    // mixed tags
    if (count < lineCount) {
      return tagCheckboxes.filter('[value=unchange]').prop('checked', true)
    }
    // every selection share the same tag
    tagCheckboxes.filter('[value=add]').prop('checked', true)
  })

}

function toggleTag(e) {
  log('toggle tag')
  const $inputs   = $(e.currentTarget).find('input')
  const $checked  = $inputs.filter(':checked')
  const isChecked = $checked.attr('value') === 'add'
  $inputs.eq( isChecked ? 0 : 2 ).prop('checked', true)
}

function openTagPanel() {
  log('open')
  $ui.container.addClass('is-visible')
}

function closeTagPanel() {
  log('close')
  $ui.container.removeClass('is-visible')
}

init()
