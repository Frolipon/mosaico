'use strict'

var ko            = require('knockout')
var url           = require('url')
var slugFilename  = require('../../../shared/slug-filename.js')

// https://github.com/voidlabs/mosaico/wiki/Mosaico-Plugins

//////
// VIEW-MODEL PLUGINS
//////

var serverStorage = require('./badsender-server-storage')
var editTitle     = require('./badsender-edit-title')
var textEditor    = require('./badsender-text-editor')
var gallery       = require('./badsender-gallery')
var removeImage   = require('./badsender-remove-gallery-image')
// widgets
// https://github.com/voidlabs/mosaico/wiki/Mosaico-Plugins#widget-plugins
var widgetBgimage = require('./badsender-widget-bgimage')

function setEditorIcon(viewModel) {
  viewModel.logoPath  = '/media/editor-icon.png'
  viewModel.logoUrl   = '/'
  viewModel.logoAlt   = 'Badsender'
}

function extendViewModel(opts, customExtensions) {
  customExtensions.push( serverStorage )
  customExtensions.push( setEditorIcon )
  customExtensions.push( editTitle )
  customExtensions.push( gallery(opts) )
  customExtensions.push( removeImage )
  // widget should be differenciating of VM extentions by
  // template-loader.js#pluginsCall
  customExtensions.push( widgetBgimage(opts) )
}

//////
// KNOCKOUT EXTEND
//////

function templateUrlConverter(opts) {
  var assets = opts.metadata.assets || {}
  return function badsenderTemplateUrlConverter(url) {
    if (!url) return null
    // handle: [unsubscribe_link] or mailto:[mail]
    if (/\]$/.test(url)) return null
    // handle absolute url: http
    if (/^http/.test(url)) return null
    // handle ESP tags: in URL <%
    if (/<%/.test(url)) return null
    // handle other urls: img/social_def/twitter_ok.png
    var urlRegexp       = /([^\/]*)$/
    var extentionRegexp = /\.[0-9a-z]+$/
    // as it is done, all files are flatten in asset folder (uploads or S3)
    url = urlRegexp.exec(url)[1]
    // handle every other case:
    //   *|UNSUB|*
    //   #pouic
    if (!extentionRegexp.test(url)) return null
    // console.log('badsenderTemplateUrlConverter', url)
    // All images at uploaded are renamed with md5
    //    block thumbnails are based on html block ID
    //    => we need to maintain a dictionary of name -> md5 name
    //    here come the assets block
    // we still keep the slug part for backward compatibility reason with old image name conventions
    url = slugFilename( url )
    url = assets[ url ] ? opts.imgProcessorBackend + assets[ url ] : null
    return url
  }
}

// knockout is a global object.
// So we can extend it easily

// this equivalent to the original app.js#applyBindingOptions
function extendKnockout(opts) {

  //----- TINYMCE

  // Change tinyMCE full editor options
  if (opts.lang === 'fr') {
    textEditor.language_url = '/tinymce-langs/fr_FR.js'
    textEditor.language     = 'fr_FR'
    tinymce.util.I18n.add('fr_FR', {
      'Cancel': 'Annuler',
      'in pixel': 'en pixel',
      'Enter a font-size': 'Entrez une taille de police',
      'Letter spacing': 'Interlettrage',
      'Font size': 'Taille de police',
      'Font size: ': 'Taille : ',
      'minimum size: 8px': 'taille minimum : 8px',
      'no decimals': 'pas de décimales',
    } )
  }
  //- https://www.tinymce.com/docs/configure/url-handling/#convert_urls
  textEditor = $.extend( {convert_urls: false}, textEditor, opts.tinymce )
  ko.bindingHandlers.wysiwyg.fullOptions = textEditor

  // mirror options to the small version of tinymce
  ko.bindingHandlers.wysiwyg.standardOptions = {
    convert_urls: false,
    external_plugins: {
      paste: textEditor.external_plugins.paste,
    },
    theme_url:  textEditor.theme_url,
    skin_url:   textEditor.skin_url,
  }

  //----- URLS HANDLING

  // This is not used by knockout per se.
  // Store this function in KO global object so it can be accessed by template-loader.js#templateLoader
  // badsenderTemplateUrlConverter is used:
  //  - for preview images on left bar
  //  - for static links in templates
  ko.bindingHandlers.wysiwygSrc.templateUrlConverter = templateUrlConverter(opts)

  // options have been set in the editor template
  var imgProcessorBackend = url.parse( opts.imgProcessorBackend )

  // send the non-resized image url
  ko.bindingHandlers.fileupload.remoteFilePreprocessor = function (file) {
    console.info('REMOTE FILE PREPROCESSOR')
    console.log(file)
    var fileUrl = url.format({
      protocol: imgProcessorBackend.protocol,
      host:     imgProcessorBackend.host,
      pathname: imgProcessorBackend.pathname,
    });
    file.url = url.resolve(fileUrl, url.parse(file.url).pathname)
    return file
  }

  // push "convertedUrl" method to the wysiwygSrc binding
  ko.bindingHandlers.wysiwygSrc.convertedUrl = function(src, method, width, height) {
    var imageName = url.parse(src).pathname
    if (!imageName) console.warn('no pathname for image', src)
    console.info('CONVERTED URL', imageName, method, width, height)
    imageName     = imageName.replace('/img/', '')
    var path      = opts.basePath + '/' + method
    path          = path + '/' + width + 'x' + height + '/' + imageName
    return path
  }

  ko.bindingHandlers.wysiwygSrc.placeholderUrl = function(width, height, text) {
    // console.info('PLACEHOLDER URL', width, height, text)
    return opts.basePath + '/placeholder/' + width + 'x' + height + '.png'
  }
}

module.exports = {
  extendViewModel:  extendViewModel,
  extendKnockout:   extendKnockout,
}
