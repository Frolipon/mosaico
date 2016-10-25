'use strict'

import dialogPolyfill from 'dialog-polyfill'
import Pikaday        from 'pikaday'

import $              from 'jquery'
import select2        from 'select2'

var dialogRename    = $('.js-dialog-rename')[0]
var dialogDelete    = $('.js-dialog-delete')[0]
var notif           = $('#notification')[0]
// https://github.com/GoogleChrome/dialog-polyfill
if (!dialogRename.showModal) {
  dialogPolyfill.registerDialog(dialogRename)
  dialogPolyfill.registerDialog(dialogDelete)
}

//////
// RENAME CREATION
//////

var route   = false
var $name   = false
var $input  = $('#name-field')

$('.js-rename').on('click', function (e) {
  e.preventDefault()
  var $target = $(e.currentTarget)
  route       = $target.data('href')
  $name       = $target.parents('tr').find('.js-name')
  $input.val($name.text())
  // don't seem to work…
  setTimeout(function () {
    componentHandler.upgradeElement($input.parent()[0])
  }, 10)
  dialogRename.showModal()
})

$('.js-post').on('click', function () {
  var name = $('#name-field').val()
  $.ajax({
    method: 'PUT',
    url:    route,
    data:   {
      name: name,
    }
  })
  .then(function (creation) {
    $name.text(creation.name)
    notif.MaterialSnackbar.showSnackbar({
      message: window.badesenderI18n.snackbarRenameMessage,
    })
    closeRenameDialog()
  })
  .catch(function () {
    notif.MaterialSnackbar.showSnackbar({
      message: 'error',
    })
  })
})

$('.js-close-rename-dialog').on('click', closeRenameDialog)

function closeRenameDialog() {
  $name = false
  route = false
  dialogRename.close()
}

//////
// DELETE CREATION
//////

var deleteRoute = false
var $deleteRow  = false

$('.js-delete').on('click', function (e) {
  e.preventDefault()
  var $target = $(e.currentTarget)
  deleteRoute = $target.attr('href')
  $deleteRow  = $target.parents('tr')
  dialogDelete.showModal()
})

$('.js-close-delete-dialog').on('click', closeDeleteDialog)
$('.js-delete-confirm').on('click', removeCreation)

function removeCreation(e) {
  console.log('removeCreation', deleteRoute, $deleteRow)
  if (!deleteRoute || !$deleteRow ) return
  console.log('delete', deleteRoute, $deleteRow)
  $.ajax({
    method: 'GET',
    url:    deleteRoute,
  })
  .then(function () {
    $deleteRow.remove()
    notif.MaterialSnackbar.showSnackbar({
      message: window.badesenderI18n.snackbarDeleteMessage,
    })
    closeDeleteDialog()
  })
  .catch(function () {
    notif.MaterialSnackbar.showSnackbar({
      message: window.badesenderI18n.snackbarError,
    })
  })
}

function closeDeleteDialog() {
  deleteRoute = false
  $deleteRow  = false
  dialogDelete.close()
}

//////
// SELECT2
//////

$('select[multiple').select2({
  //minimumResultsForSearch: 0,
  width: '100%',
  language:  {
    inputTooLong: function (args) {
      var overChars = args.input.length - args.maximum;
      var message = `Supprimez ${overChars} caractère`;
      if (overChars !== 1) message += 's';
      return message;
    },
    inputTooShort: function (args) {
      var remainingChars = args.minimum - args.input.length;
      var message = `Saisissez ${remainingChars} caractère`;
      if (remainingChars !== 1) message += 's';
      return message;
    },
    loadingMore: function () {
      return 'Chargement de résultats supplémentaires…';
    },
    maximumSelected: function (args) {
      var message = `Vous pouvez seulement sélectionner ${args.maximum} élément`;
      if (args.maximum !== 1) message += 's';
      return message;
    },
    noResults: function () {
      return 'Aucun résultat trouvé';
    },
    searching: function () {
      return 'Recherche en cours…';
    }
  },
})

//////
// DATEPICKER
//////


// https://www.npmjs.com/package/pikaday

const i18n = {
  previousMonth : 'Mois précédent',
  nextMonth     : 'Mois suivant',
  months        : ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  weekdays      : ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
  weekdaysShort : ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
};

const pickers = []

$('input[type="date"]').each( (index, el) => {
  var $input    = $(el)
  var $wrapper  = $input.parent().addClass('js-calendar')
  // Pikaday doesn't work well with a type date
  $input.attr('type', 'text')


    // .after($(iconCalendar).clone());

  var picker  = new Pikaday({
    field: el,
    i18n: i18n,
    firstDay: 1,
    onSelect: function(date) {
      $input.val(picker.toString('YYYY-MM-DD'));
      // for floating label to catch up
      $input.trigger('keyup');
    }
  });
  pickers.push(picker)
});


// function toggleCalendar(e) {
//   var $calendar = $(e.currentTarget).parents('.js-calendar').find('input');
//   var index     = $ui.calendar.index($calendar);
//   if (index < 0) return log.warn('no calendar found!');
//   var picker    = pickers[index];
//   picker[ picker.isVisible() ? 'hide' : 'show']();
// }
