import $        from 'jquery'
import entries  from 'lodash.topairs'

import logger from './_logger'
import pubsub from './_pubsub'
import cleanTagName from './../../shared/clean-tag-name'
import tmpl   from './../../server/views/_tag-item.pug'

const DEBUG           = false
const log             = logger('tags', DEBUG)
const $ui             = {}
let isOpen            = false
const countainerClass = '.js-tags'

function init() {
  log('init')
  $ui.container   = $( countainerClass )
  if (!$ui.container.length) return log.warn('abort init')
  bindUi()
  bindEvents()
}

function bindUi() {
  $ui.html        = $('html')
  $ui.tagsList    = $ui.container.find('input')
  $ui.modal       = $('.js-dialog-add-tag')
  $ui.mdlTagInput = $ui.modal.find('.mdl-js-textfield')
  $ui.newTagInput = $ui.modal.find('input')
  $ui.tagsWrapper = $ui.container.find('.js-tags-list')
}

function bindEvents() {
  $('.js-open-tags-panel').on('click', openTagPanel)
  $('.js-close-tags-panel').on('click', closeTagPanel)
  $ui.tagsWrapper.on('click', '.js-check-tag', toggleTag)
  $('.js-open-tag-dialog').on('click', showModal)
  $('.js-hide-tag-dialog').on('click', hideModal)
  $('.js-add-tag').on('click', addTag)

  pubsub('table:selection').subscribe(updateTagList)
  pubsub('key:escape').subscribe(closeTagPanel)
}

// Copy the same behaviour as GMAIL
// -> tag panel represent the current selection computed tags
function updateTagList(e) {
  log('updateTagList', e)
  let tagList           = {}
  const { $checkboxes } = e
  const lineCount       = $checkboxes.length
  if (isOpen) closeTagPanel()

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

  // by default everything is unchecked
  $ui.tagsList.filter('[value=remove]').prop('checked', true)

  entries( tagList )
  .forEach(  tagLine => {
    const [tag, count]  = tagLine
    const tagCheckboxes = $ui.tagsList.filter(`[name="tag-${tag}"]`)
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

function openTagPanel(e) {
  log('open tag panel')
  e.preventDefault()
  isOpen = true
  $ui.container.addClass('is-visible')
  $ui.html.on('click.tag', handleGlobalCick)
}

function closeTagPanel() {
  log('close tag panel')
  isOpen = false
  $ui.container.removeClass('is-visible')
  $ui.html.off('click.tag')
}

function handleGlobalCick(e) {
  const $target     = $( e.target )
  const fromTagsUi  = [
    $target.is(countainerClass),
    $target.parents(countainerClass).length > 0,
    $target.is('dialog'),
    $target.parents('dialog').length > 0
  ].filter( value => value)
  if ( e.isDefaultPrevented() || fromTagsUi.length ) return
  log('close from global click')
  e.preventDefault()
  closeTagPanel()
}

//////
// TAG CREATION
//////

function showModal() {
  log('show modal')
  // update MDL
  const wrapper = $ui.mdlTagInput[0]
  componentHandler.downgradeElements(wrapper)
  $ui.newTagInput.val('')
  wrapper.classList.remove('is-invalid')
  componentHandler.upgradeElement(wrapper)
  // show modal
  $ui.modal[0].showModal()
}

function addTag() {
  log('add tag')
  const newTag = cleanTagName( $ui.newTagInput.val() )
  if (!newTag) return hideModal()
  if ($(`[name="tag-${newTag}"]`).length) return hideModal()
  const $line   = $( tmpl({ tag: newTag }) )
  $line.find('input:checked').prop('checked', false)
  $line.find('input:last-of-type').prop('checked', true)
  $ui.tagsWrapper.append( $line )
  hideModal()
  setTimeout( _ => { bindUi() }, 0)
}

function hideModal() {
  log('close modal')
  $ui.modal[0].close()
}

init()
