'use strict'

//////
// DEFINE TINYMCE CUSTOM PLUGINS
//////

//----- LETTER SPACING

// convert a fibonacci suite to em
var defaults = [0, 1, 2, 3, 5, 8, 13]
.map(function (e) { return Math.round((e * 0.1) * 100) / 100 })
.map(function (i) { return i + '=' + i + 'em' })
.join(' ')

tinymce.PluginManager.add('spacing', addLetterSpacing)

function addLetterSpacing(editor, url) {
  editor.addButton('letterspacingselect', function () {
    var formats   = editor.settings.spacing_formats || defaults
    var items     = formats.split(' ').map( function (item) {
      var text  = item
      var value = item
      // Allow text=value font sizes.
      var values = item.split('=')
      if (values.length > 1) {
        text = values[0]
        value = values[1]
      }
      return {text: text, value: value,}
    })

    function setLetterSpacing(e) {
      if (!e.control.settings.value) return
      tinymce.activeEditor.formatter.register('letter-spacing', {
        inline : 'span',
        styles : { 'letter-spacing' : e.control.settings.value },
      })
      tinymce.activeEditor.formatter.apply('letter-spacing')
    }

    return {
      type:       'listbox',
      text:       'Letter spacing',
      tooltip:    'Letter spacing',
      values:     items,
      fixedWidth: true,
      onclick:    setLetterSpacing,
    }

  })
}

//----- FREE FONT SIZE

// Util function copied from Tiny MCE
function each(o, cb, s) {
  var n, l;

  if (!o) {
    return 0;
  }

  s = s || o;

  if (o.length !== undefined) {
    // Indexed arrays, needed for Safari
    for (n = 0, l = o.length; n < l; n++) {
      if (cb.call(s, o[n], n, o) === false) {
        return 0;
      }
    }
  } else {
    // Hashtables
    for (n in o) {
      if (o.hasOwnProperty(n)) {
        if (cb.call(s, o[n], n, o) === false) {
          return 0;
        }
      }
    }
  }

  return 1;
}

// inspired by tinymce.js#44265
tinymce.PluginManager.add('fontsizedialog', fontsizedialog);

function fontsizedialog(editor, url) {
  var fontSizeMin     = 8
  var selectionFs     = false
  var dialogHelpText  = [
    'minimum size: 8px',
    'no decimals',
  ]
  .map( function (t) { return '• ' + t} )
  .join( '<br>' );

  editor.addButton('fontsizedialogbutton', {
    text:         'Font size',
    tooltip:      'Font size',
    icon:         false,
    onPostRender: afterBtnInit,
    onclick:      openFsDialog,
  });

  function afterBtnInit() {
    var formatName  = 'fontsize';
    var self        = this;
    var $btnText    = self.$el.find('.mce-txt');

    editor.on('nodeChange', function (e) {
      each(e.parents, getFontSize);
      if (!selectionFs) {
        selectionFs = document.defaultView.getComputedStyle(e.parents[0], null)
        .getPropertyValue('font-size')
      }
    });

    function getFontSize(node) {
      if (node.style && node.style.fontSize) {
        $btnText.text('Font size: ' + node.style.fontSize)
        selectionFs = node.style.fontSize
        return false
      }
      selectionFs = false
      $btnText.text('Font size')
    }
  }

  function openFsDialog(btnEvent) {
    var initValue = selectionFs ? /^(\d+)/.exec(selectionFs) : null
    initValue     = Array.isArray(initValue) ? initValue[0] : ''

    editor.windowManager.open({
      title: 'Enter a font-size',
      body: [
        {
          type:       'label',
          multiline:  true,
          text:       '',
          // multiline “hack” from:
          // http://www.devsumo.com/technotes/2014/07/tinymce-4-multi-line-labels-in-popup-dialogs/
          onPostRender: function () {
            this.getEl().innerHTML = dialogHelpText;
          },
        },
        {
          type:     'textbox',
          name:     'bsdialogfontsize',
          label:    'in pixel',
          autofocus: true,
          value:     initValue,
          onPostRender: function () {
            this.$el.attr({
              type:   'number',
              min:    fontSizeMin,
              step:   1,
            })
          },
        }
      ],
      onsubmit: function (e) {
        var newFontSize = ~~e.data.bsdialogfontsize
        if (newFontSize >= fontSizeMin) {
          editor.execCommand('FontSize', false, newFontSize + 'px')
        } else {
          // tinyMCE notifications are very small…
          // no need to put them for now
          // editor.notificationManager.open({
          //   text: 'Invalid font size',
          //   type: 'error',
          // })
        }
      },
    })
  }

}

//////
// CONFIGURATION
//////

var tinymceConfigFull = {
  toolbar1: 'bold italic forecolor backcolor hr | fontsizedialogbutton styleselect letterspacingselect removeformat | link unlink | pastetext code',
  //- add colorpicker & custom plugins
  //- https://www.tinymce.com/docs/plugins/colorpicker/
  plugins: ["link hr paste lists textcolor colorpicker code spacing fontsizedialog"],
  //- https://www.tinymce.com/docs/configure/content-formatting/#style_formats
  style_formats: [
    {title: 'Inline', items: [
      {title: 'Bold'         , icon: "bold"         , inline: 'strong'},
      {title: 'Italic'       , icon: "italic"       , inline: 'em'},
      {title: 'Underline'    , icon: "underline"    , inline: 'span', styles: {'text-decoration' : 'underline'}},
      {title: 'Strikethrough', icon: "strikethrough", inline: 'span', styles: {'text-decoration' : 'line-through'}},
      {title: 'Superscript'  , icon: "superscript"  , inline: 'sup'},
      {title: 'Subscript'    , icon: "subscript"    , inline: 'sub'},
      {title: 'Code'         , icon: "code"         , inline: 'code'},
    ]},
    {title: 'Alignment', items: [
      {title: 'Left'   , icon: "alignleft"   , block: 'div', styles: {'text-align' : 'left'}},
      {title: 'Center' , icon: "aligncenter" , block: 'div', styles: {'text-align' : 'center'}},
      {title: 'Right'  , icon: "alignright"  , block: 'div', styles: {'text-align' : 'right'}},
      {title: 'Justify', icon: "alignjustify", block: 'div', styles: {'text-align' : 'justify'}},
    ]},
  ],
}

module.exports = tinymceConfigFull
