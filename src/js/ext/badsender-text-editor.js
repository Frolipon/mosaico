'use strict'

//////
// DEFINE TINYMCE CUSTOM PLUGINS
//////

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

//////
// CONFIGURATION
//////

var tinymceConfigFull = {
  toolbar1: 'bold italic forecolor backcolor hr fontsizeselect styleselect letterspacingselect removeformat | link unlink | pastetext code',
  //- font-size select
  //- https://www.tinymce.com/docs/configure/content-formatting/#fontsize_formats
  fontsize_formats: '8px 10px 12px 14px 18px 24px 36px',
  //- add colorpicker
  //- https://www.tinymce.com/docs/plugins/colorpicker/
  plugins: ["link hr paste lists textcolor colorpicker code spacing"],
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
