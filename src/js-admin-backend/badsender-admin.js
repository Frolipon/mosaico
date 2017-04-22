import dialogPolyfill from 'dialog-polyfill'

//////
// DIALOG
//////

//- dialog handling
//- window.confirm is raising warnings in chrome…
const dialog      = document.querySelector('.js-dialog-confirm')
if (!dialog.showModal) {
  dialogPolyfill.registerDialog(dialog)
}
const title       = dialog.querySelector('.js-dialog-title')
const description = dialog.querySelector('.js-dialog-description')
let confirmLink   = dialog.querySelector('.js-dialog-confirm')
const cancelBtn   = dialog.querySelector('.js-dialog-cancel')
cancelBtn.addEventListener('click', _ => dialog.close() )
dialog.addEventListener('cancel', _ => resetDialog() )
dialog.addEventListener('close',  _ => resetDialog() )
function resetDialog() {
  title.textContent       = ''
  description.textContent = ''
  confirmLink.setAttribute('href', '#')
  //- clone to remove all event listeners
  const confirmLinkClone  = confirmLink.cloneNode(true)
  confirmLink.parentNode.replaceChild(confirmLinkClone, confirmLink)
  confirmLink             = confirmLinkClone
}
function openDialog( datas ) {
  title.textContent       = datas.title
  description.textContent = datas.description
  dialog.showModal()
}

//////
// WIREFRAMES
//////

//----- delete

const deleteButtons = document.querySelectorAll('.js-delete-wireframe')
addListeners(deleteButtons, 'click', askWireframeDeletion)
function askWireframeDeletion(e) {
  e.preventDefault()
  const link                = e.currentTarget
  const wireframeName       = link.dataset.name
  confirmLink.setAttribute( 'href', link.getAttribute('href') )
  openDialog( {
    title:        'Delete template',
    description:  `are you sure you want to delete ${wireframeName}?`,
  } )
}

//----- handle notifications

const notification = document.querySelector('#notification')
if (notification) {
  window.setTimeout(function () {
    notification.classList.remove('mdl-snackbar--active')
  }, 2700)
}

//////
// USERS
//////

//----- RESET

const resetUsers  = document.querySelectorAll('form.js-reset-user')
addListeners(resetUsers, 'submit', askUserReset)
function askUserReset(e) {
  e.preventDefault()
  const form      = e.currentTarget
  const userName  = form.dataset.name
  confirmLink.addEventListener('click', function (e) {
    e.preventDefault()
    form.submit()
  })
  openDialog( {
    title:        'Reset',
    description:  `are you sure you want to reset ${userName} password?`,
  } )
}

//----- ACTIVATE

const activateUsers  = document.querySelectorAll('.js-user-activate')
addListeners(activateUsers, 'click', askUserActivation)
function askUserActivation(e) {
  e.preventDefault()
  const link      = e.currentTarget  
  const userName  = link.dataset.name
  confirmLink.setAttribute( 'href', link.getAttribute('href') )
  openDialog( {
    title:        'Activate',
    description:  `are you sure you want to activate ${userName}?`,
  } )
}

//----- DEACTIVATE

const deactivateUsers  = document.querySelectorAll('.js-user-deactivate')
addListeners(deactivateUsers, 'click', askUserDeactivation)
function askUserDeactivation(e) {
  e.preventDefault()
  const link      = e.currentTarget
  const userName  = link.dataset.name  
  confirmLink.setAttribute( 'href', link.getAttribute('href') )
  openDialog( {
    title:        'Deactivate',
    description:  `are you sure you want to deactivate ${userName}?`,
  } )
}

//////
// UTILS
//////

function addListeners( elems, eventName, callback ) {
  if (!elems.length) return
  ;[...elems].forEach( elem => elem.addEventListener( eventName, callback) )
}

function getParent( elem, selector ) {
  var parent = false
  for ( ; elem && elem !== document; elem = elem.parentNode ) {
    if ( elem.matches( selector ) ) {
      parent = elem
      break
    }
  }
  return parent
}