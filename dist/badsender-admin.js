(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function() {

  // nb. This is for IE10 and lower _only_.
  var supportCustomEvent = window.CustomEvent;
  if (!supportCustomEvent || typeof supportCustomEvent == 'object') {
    supportCustomEvent = function CustomEvent(event, x) {
      x = x || {};
      var ev = document.createEvent('CustomEvent');
      ev.initCustomEvent(event, !!x.bubbles, !!x.cancelable, x.detail || null);
      return ev;
    };
    supportCustomEvent.prototype = window.Event.prototype;
  }

  /**
   * @param {Element} el to check for stacking context
   * @return {boolean} whether this el or its parents creates a stacking context
   */
  function createsStackingContext(el) {
    while (el && el !== document.body) {
      var s = window.getComputedStyle(el);
      var invalid = function(k, ok) {
        return !(s[k] === undefined || s[k] === ok);
      }
      if (s.opacity < 1 ||
          invalid('zIndex', 'auto') ||
          invalid('transform', 'none') ||
          invalid('mixBlendMode', 'normal') ||
          invalid('filter', 'none') ||
          invalid('perspective', 'none') ||
          s['isolation'] === 'isolate' ||
          s.position === 'fixed' ||
          s.webkitOverflowScrolling === 'touch') {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  /**
   * Finds the nearest <dialog> from the passed element.
   *
   * @param {Element} el to search from
   * @return {HTMLDialogElement} dialog found
   */
  function findNearestDialog(el) {
    while (el) {
      if (el.localName === 'dialog') {
        return /** @type {HTMLDialogElement} */ (el);
      }
      el = el.parentElement;
    }
    return null;
  }

  /**
   * Blur the specified element, as long as it's not the HTML body element.
   * This works around an IE9/10 bug - blurring the body causes Windows to
   * blur the whole application.
   *
   * @param {Element} el to blur
   */
  function safeBlur(el) {
    if (el && el.blur && el != document.body) {
      el.blur();
    }
  }

  /**
   * @param {!NodeList} nodeList to search
   * @param {Node} node to find
   * @return {boolean} whether node is inside nodeList
   */
  function inNodeList(nodeList, node) {
    for (var i = 0; i < nodeList.length; ++i) {
      if (nodeList[i] == node) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {!HTMLDialogElement} dialog to upgrade
   * @constructor
   */
  function dialogPolyfillInfo(dialog) {
    this.dialog_ = dialog;
    this.replacedStyleTop_ = false;
    this.openAsModal_ = false;

    // Set a11y role. Browsers that support dialog implicitly know this already.
    if (!dialog.hasAttribute('role')) {
      dialog.setAttribute('role', 'dialog');
    }

    dialog.show = this.show.bind(this);
    dialog.showModal = this.showModal.bind(this);
    dialog.close = this.close.bind(this);

    if (!('returnValue' in dialog)) {
      dialog.returnValue = '';
    }

    if ('MutationObserver' in window) {
      var mo = new MutationObserver(this.maybeHideModal.bind(this));
      mo.observe(dialog, {attributes: true, attributeFilter: ['open']});
    } else {
      // IE10 and below support. Note that DOMNodeRemoved etc fire _before_ removal. They also
      // seem to fire even if the element was removed as part of a parent removal. Use the removed
      // events to force downgrade (useful if removed/immediately added).
      var removed = false;
      var cb = function() {
        removed ? this.downgradeModal() : this.maybeHideModal();
        removed = false;
      }.bind(this);
      var timeout;
      var delayModel = function(ev) {
        var cand = 'DOMNodeRemoved';
        removed |= (ev.type.substr(0, cand.length) === cand);
        window.clearTimeout(timeout);
        timeout = window.setTimeout(cb, 0);
      };
      ['DOMAttrModified', 'DOMNodeRemoved', 'DOMNodeRemovedFromDocument'].forEach(function(name) {
        dialog.addEventListener(name, delayModel);
      });
    }
    // Note that the DOM is observed inside DialogManager while any dialog
    // is being displayed as a modal, to catch modal removal from the DOM.

    Object.defineProperty(dialog, 'open', {
      set: this.setOpen.bind(this),
      get: dialog.hasAttribute.bind(dialog, 'open')
    });

    this.backdrop_ = document.createElement('div');
    this.backdrop_.className = 'backdrop';
    this.backdrop_.addEventListener('click', this.backdropClick_.bind(this));
  }

  dialogPolyfillInfo.prototype = {

    get dialog() {
      return this.dialog_;
    },

    /**
     * Maybe remove this dialog from the modal top layer. This is called when
     * a modal dialog may no longer be tenable, e.g., when the dialog is no
     * longer open or is no longer part of the DOM.
     */
    maybeHideModal: function() {
      if (this.dialog_.hasAttribute('open') && document.body.contains(this.dialog_)) { return; }
      this.downgradeModal();
    },

    /**
     * Remove this dialog from the modal top layer, leaving it as a non-modal.
     */
    downgradeModal: function() {
      if (!this.openAsModal_) { return; }
      this.openAsModal_ = false;
      this.dialog_.style.zIndex = '';

      // This won't match the native <dialog> exactly because if the user set top on a centered
      // polyfill dialog, that top gets thrown away when the dialog is closed. Not sure it's
      // possible to polyfill this perfectly.
      if (this.replacedStyleTop_) {
        this.dialog_.style.top = '';
        this.replacedStyleTop_ = false;
      }

      // Clear the backdrop and remove from the manager.
      this.backdrop_.parentNode && this.backdrop_.parentNode.removeChild(this.backdrop_);
      dialogPolyfill.dm.removeDialog(this);
    },

    /**
     * @param {boolean} value whether to open or close this dialog
     */
    setOpen: function(value) {
      if (value) {
        this.dialog_.hasAttribute('open') || this.dialog_.setAttribute('open', '');
      } else {
        this.dialog_.removeAttribute('open');
        this.maybeHideModal();  // nb. redundant with MutationObserver
      }
    },

    /**
     * Handles clicks on the fake .backdrop element, redirecting them as if
     * they were on the dialog itself.
     *
     * @param {!Event} e to redirect
     */
    backdropClick_: function(e) {
      if (!this.dialog_.hasAttribute('tabindex')) {
        // Clicking on the backdrop should move the implicit cursor, even if dialog cannot be
        // focused. Create a fake thing to focus on. If the backdrop was _before_ the dialog, this
        // would not be needed - clicks would move the implicit cursor there.
        var fake = document.createElement('div');
        this.dialog_.insertBefore(fake, this.dialog_.firstChild);
        fake.tabIndex = -1;
        fake.focus();
        this.dialog_.removeChild(fake);
      } else {
        this.dialog_.focus();
      }

      var redirectedEvent = document.createEvent('MouseEvents');
      redirectedEvent.initMouseEvent(e.type, e.bubbles, e.cancelable, window,
          e.detail, e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey,
          e.altKey, e.shiftKey, e.metaKey, e.button, e.relatedTarget);
      this.dialog_.dispatchEvent(redirectedEvent);
      e.stopPropagation();
    },

    /**
     * Focuses on the first focusable element within the dialog. This will always blur the current
     * focus, even if nothing within the dialog is found.
     */
    focus_: function() {
      // Find element with `autofocus` attribute, or fall back to the first form/tabindex control.
      var target = this.dialog_.querySelector('[autofocus]:not([disabled])');
      if (!target && this.dialog_.tabIndex >= 0) {
        target = this.dialog_;
      }
      if (!target) {
        // Note that this is 'any focusable area'. This list is probably not exhaustive, but the
        // alternative involves stepping through and trying to focus everything.
        var opts = ['button', 'input', 'keygen', 'select', 'textarea'];
        var query = opts.map(function(el) {
          return el + ':not([disabled])';
        });
        // TODO(samthor): tabindex values that are not numeric are not focusable.
        query.push('[tabindex]:not([disabled]):not([tabindex=""])');  // tabindex != "", not disabled
        target = this.dialog_.querySelector(query.join(', '));
      }
      safeBlur(document.activeElement);
      target && target.focus();
    },

    /**
     * Sets the zIndex for the backdrop and dialog.
     *
     * @param {number} dialogZ
     * @param {number} backdropZ
     */
    updateZIndex: function(dialogZ, backdropZ) {
      if (dialogZ < backdropZ) {
        throw new Error('dialogZ should never be < backdropZ');
      }
      this.dialog_.style.zIndex = dialogZ;
      this.backdrop_.style.zIndex = backdropZ;
    },

    /**
     * Shows the dialog. If the dialog is already open, this does nothing.
     */
    show: function() {
      if (!this.dialog_.open) {
        this.setOpen(true);
        this.focus_();
      }
    },

    /**
     * Show this dialog modally.
     */
    showModal: function() {
      if (this.dialog_.hasAttribute('open')) {
        throw new Error('Failed to execute \'showModal\' on dialog: The element is already open, and therefore cannot be opened modally.');
      }
      if (!document.body.contains(this.dialog_)) {
        throw new Error('Failed to execute \'showModal\' on dialog: The element is not in a Document.');
      }
      if (!dialogPolyfill.dm.pushDialog(this)) {
        throw new Error('Failed to execute \'showModal\' on dialog: There are too many open modal dialogs.');
      }

      if (createsStackingContext(this.dialog_.parentElement)) {
        console.warn('A dialog is being shown inside a stacking context. ' +
            'This may cause it to be unusable. For more information, see this link: ' +
            'https://github.com/GoogleChrome/dialog-polyfill/#stacking-context');
      }

      this.setOpen(true);
      this.openAsModal_ = true;

      // Optionally center vertically, relative to the current viewport.
      if (dialogPolyfill.needsCentering(this.dialog_)) {
        dialogPolyfill.reposition(this.dialog_);
        this.replacedStyleTop_ = true;
      } else {
        this.replacedStyleTop_ = false;
      }

      // Insert backdrop.
      this.dialog_.parentNode.insertBefore(this.backdrop_, this.dialog_.nextSibling);

      // Focus on whatever inside the dialog.
      this.focus_();
    },

    /**
     * Closes this HTMLDialogElement. This is optional vs clearing the open
     * attribute, however this fires a 'close' event.
     *
     * @param {string=} opt_returnValue to use as the returnValue
     */
    close: function(opt_returnValue) {
      if (!this.dialog_.hasAttribute('open')) {
        throw new Error('Failed to execute \'close\' on dialog: The element does not have an \'open\' attribute, and therefore cannot be closed.');
      }
      this.setOpen(false);

      // Leave returnValue untouched in case it was set directly on the element
      if (opt_returnValue !== undefined) {
        this.dialog_.returnValue = opt_returnValue;
      }

      // Triggering "close" event for any attached listeners on the <dialog>.
      var closeEvent = new supportCustomEvent('close', {
        bubbles: false,
        cancelable: false
      });
      this.dialog_.dispatchEvent(closeEvent);
    }

  };

  var dialogPolyfill = {};

  dialogPolyfill.reposition = function(element) {
    var scrollTop = document.body.scrollTop || document.documentElement.scrollTop;
    var topValue = scrollTop + (window.innerHeight - element.offsetHeight) / 2;
    element.style.top = Math.max(scrollTop, topValue) + 'px';
  };

  dialogPolyfill.isInlinePositionSetByStylesheet = function(element) {
    for (var i = 0; i < document.styleSheets.length; ++i) {
      var styleSheet = document.styleSheets[i];
      var cssRules = null;
      // Some browsers throw on cssRules.
      try {
        cssRules = styleSheet.cssRules;
      } catch (e) {}
      if (!cssRules) { continue; }
      for (var j = 0; j < cssRules.length; ++j) {
        var rule = cssRules[j];
        var selectedNodes = null;
        // Ignore errors on invalid selector texts.
        try {
          selectedNodes = document.querySelectorAll(rule.selectorText);
        } catch(e) {}
        if (!selectedNodes || !inNodeList(selectedNodes, element)) {
          continue;
        }
        var cssTop = rule.style.getPropertyValue('top');
        var cssBottom = rule.style.getPropertyValue('bottom');
        if ((cssTop && cssTop != 'auto') || (cssBottom && cssBottom != 'auto')) {
          return true;
        }
      }
    }
    return false;
  };

  dialogPolyfill.needsCentering = function(dialog) {
    var computedStyle = window.getComputedStyle(dialog);
    if (computedStyle.position != 'absolute') {
      return false;
    }

    // We must determine whether the top/bottom specified value is non-auto.  In
    // WebKit/Blink, checking computedStyle.top == 'auto' is sufficient, but
    // Firefox returns the used value. So we do this crazy thing instead: check
    // the inline style and then go through CSS rules.
    if ((dialog.style.top != 'auto' && dialog.style.top != '') ||
        (dialog.style.bottom != 'auto' && dialog.style.bottom != ''))
      return false;
    return !dialogPolyfill.isInlinePositionSetByStylesheet(dialog);
  };

  /**
   * @param {!Element} element to force upgrade
   */
  dialogPolyfill.forceRegisterDialog = function(element) {
    if (element.showModal) {
      console.warn('This browser already supports <dialog>, the polyfill ' +
          'may not work correctly', element);
    }
    if (element.localName !== 'dialog') {
      throw new Error('Failed to register dialog: The element is not a dialog.');
    }
    new dialogPolyfillInfo(/** @type {!HTMLDialogElement} */ (element));
  };

  /**
   * @param {!Element} element to upgrade, if necessary
   */
  dialogPolyfill.registerDialog = function(element) {
    if (!element.showModal) {
      dialogPolyfill.forceRegisterDialog(element);
    }
  };

  /**
   * @constructor
   */
  dialogPolyfill.DialogManager = function() {
    /** @type {!Array<!dialogPolyfillInfo>} */
    this.pendingDialogStack = [];

    var checkDOM = this.checkDOM_.bind(this);

    // The overlay is used to simulate how a modal dialog blocks the document.
    // The blocking dialog is positioned on top of the overlay, and the rest of
    // the dialogs on the pending dialog stack are positioned below it. In the
    // actual implementation, the modal dialog stacking is controlled by the
    // top layer, where z-index has no effect.
    this.overlay = document.createElement('div');
    this.overlay.className = '_dialog_overlay';
    this.overlay.addEventListener('click', function(e) {
      this.forwardTab_ = undefined;
      e.stopPropagation();
      checkDOM([]);  // sanity-check DOM
    }.bind(this));

    this.handleKey_ = this.handleKey_.bind(this);
    this.handleFocus_ = this.handleFocus_.bind(this);

    this.zIndexLow_ = 100000;
    this.zIndexHigh_ = 100000 + 150;

    this.forwardTab_ = undefined;

    if ('MutationObserver' in window) {
      this.mo_ = new MutationObserver(function(records) {
        var removed = [];
        records.forEach(function(rec) {
          for (var i = 0, c; c = rec.removedNodes[i]; ++i) {
            if (!(c instanceof Element)) {
              continue;
            } else if (c.localName === 'dialog') {
              removed.push(c);
            } else {
              var q = c.querySelector('dialog');
              q && removed.push(q);
            }
          }
        });
        removed.length && checkDOM(removed);
      });
    }
  };

  /**
   * Called on the first modal dialog being shown. Adds the overlay and related
   * handlers.
   */
  dialogPolyfill.DialogManager.prototype.blockDocument = function() {
    document.documentElement.addEventListener('focus', this.handleFocus_, true);
    document.addEventListener('keydown', this.handleKey_);
    this.mo_ && this.mo_.observe(document, {childList: true, subtree: true});
  };

  /**
   * Called on the first modal dialog being removed, i.e., when no more modal
   * dialogs are visible.
   */
  dialogPolyfill.DialogManager.prototype.unblockDocument = function() {
    document.documentElement.removeEventListener('focus', this.handleFocus_, true);
    document.removeEventListener('keydown', this.handleKey_);
    this.mo_ && this.mo_.disconnect();
  };

  /**
   * Updates the stacking of all known dialogs.
   */
  dialogPolyfill.DialogManager.prototype.updateStacking = function() {
    var zIndex = this.zIndexHigh_;

    for (var i = 0, dpi; dpi = this.pendingDialogStack[i]; ++i) {
      dpi.updateZIndex(--zIndex, --zIndex);
      if (i === 0) {
        this.overlay.style.zIndex = --zIndex;
      }
    }

    // Make the overlay a sibling of the dialog itself.
    var last = this.pendingDialogStack[0];
    if (last) {
      var p = last.dialog.parentNode || document.body;
      p.appendChild(this.overlay);
    } else if (this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  };

  /**
   * @param {Element} candidate to check if contained or is the top-most modal dialog
   * @return {boolean} whether candidate is contained in top dialog
   */
  dialogPolyfill.DialogManager.prototype.containedByTopDialog_ = function(candidate) {
    while (candidate = findNearestDialog(candidate)) {
      for (var i = 0, dpi; dpi = this.pendingDialogStack[i]; ++i) {
        if (dpi.dialog === candidate) {
          return i === 0;  // only valid if top-most
        }
      }
      candidate = candidate.parentElement;
    }
    return false;
  };

  dialogPolyfill.DialogManager.prototype.handleFocus_ = function(event) {
    if (this.containedByTopDialog_(event.target)) { return; }

    event.preventDefault();
    event.stopPropagation();
    safeBlur(/** @type {Element} */ (event.target));

    if (this.forwardTab_ === undefined) { return; }  // move focus only from a tab key

    var dpi = this.pendingDialogStack[0];
    var dialog = dpi.dialog;
    var position = dialog.compareDocumentPosition(event.target);
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      if (this.forwardTab_) {  // forward
        dpi.focus_();
      } else {  // backwards
        document.documentElement.focus();
      }
    } else {
      // TODO: Focus after the dialog, is ignored.
    }

    return false;
  };

  dialogPolyfill.DialogManager.prototype.handleKey_ = function(event) {
    this.forwardTab_ = undefined;
    if (event.keyCode === 27) {
      event.preventDefault();
      event.stopPropagation();
      var cancelEvent = new supportCustomEvent('cancel', {
        bubbles: false,
        cancelable: true
      });
      var dpi = this.pendingDialogStack[0];
      if (dpi && dpi.dialog.dispatchEvent(cancelEvent)) {
        dpi.dialog.close();
      }
    } else if (event.keyCode === 9) {
      this.forwardTab_ = !event.shiftKey;
    }
  };

  /**
   * Finds and downgrades any known modal dialogs that are no longer displayed. Dialogs that are
   * removed and immediately readded don't stay modal, they become normal.
   *
   * @param {!Array<!HTMLDialogElement>} removed that have definitely been removed
   */
  dialogPolyfill.DialogManager.prototype.checkDOM_ = function(removed) {
    // This operates on a clone because it may cause it to change. Each change also calls
    // updateStacking, which only actually needs to happen once. But who removes many modal dialogs
    // at a time?!
    var clone = this.pendingDialogStack.slice();
    clone.forEach(function(dpi) {
      if (removed.indexOf(dpi.dialog) !== -1) {
        dpi.downgradeModal();
      } else {
        dpi.maybeHideModal();
      }
    });
  };

  /**
   * @param {!dialogPolyfillInfo} dpi
   * @return {boolean} whether the dialog was allowed
   */
  dialogPolyfill.DialogManager.prototype.pushDialog = function(dpi) {
    var allowed = (this.zIndexHigh_ - this.zIndexLow_) / 2 - 1;
    if (this.pendingDialogStack.length >= allowed) {
      return false;
    }
    if (this.pendingDialogStack.unshift(dpi) === 1) {
      this.blockDocument();
    }
    this.updateStacking();
    return true;
  };

  /**
   * @param {!dialogPolyfillInfo} dpi
   */
  dialogPolyfill.DialogManager.prototype.removeDialog = function(dpi) {
    var index = this.pendingDialogStack.indexOf(dpi);
    if (index == -1) { return; }

    this.pendingDialogStack.splice(index, 1);
    if (this.pendingDialogStack.length === 0) {
      this.unblockDocument();
    }
    this.updateStacking();
  };

  dialogPolyfill.dm = new dialogPolyfill.DialogManager();

  /**
   * Global form 'dialog' method handler. Closes a dialog correctly on submit
   * and possibly sets its return value.
   */
  document.addEventListener('submit', function(ev) {
    var target = ev.target;
    if (!target || !target.hasAttribute('method')) { return; }
    if (target.getAttribute('method').toLowerCase() !== 'dialog') { return; }
    ev.preventDefault();

    var dialog = findNearestDialog(/** @type {Element} */ (ev.target));
    if (!dialog) { return; }

    // FIXME: The original event doesn't contain the element used to submit the
    // form (if any). Look in some possible places.
    var returnValue;
    var cands = [document.activeElement, ev.explicitOriginalTarget];
    var els = ['BUTTON', 'INPUT'];
    cands.some(function(cand) {
      if (cand && cand.form == ev.target && els.indexOf(cand.nodeName.toUpperCase()) != -1) {
        returnValue = cand.value;
        return true;
      }
    });
    dialog.close(returnValue);
  }, true);

  dialogPolyfill['forceRegisterDialog'] = dialogPolyfill.forceRegisterDialog;
  dialogPolyfill['registerDialog'] = dialogPolyfill.registerDialog;

  if (typeof define === 'function' && 'amd' in define) {
    // AMD support
    define(function() { return dialogPolyfill; });
  } else if (typeof module === 'object' && typeof module['exports'] === 'object') {
    // CommonJS support
    module['exports'] = dialogPolyfill;
  } else {
    // all others
    window['dialogPolyfill'] = dialogPolyfill;
  }
})();

},{}],2:[function(require,module,exports){
'use strict';

var _dialogPolyfill = require('dialog-polyfill');

var _dialogPolyfill2 = _interopRequireDefault(_dialogPolyfill);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

//////
// DIALOG
//////

//- dialog handling
//- window.confirm is raising warnings in chrome…
var dialog = document.querySelector('.js-dialog-confirm');
if (!dialog.showModal) {
  _dialogPolyfill2.default.registerDialog(dialog);
}
var title = dialog.querySelector('.js-dialog-title');
var description = dialog.querySelector('.js-dialog-description');
var confirmLink = dialog.querySelector('.js-dialog-confirm');
var cancelBtn = dialog.querySelector('.js-dialog-cancel');
cancelBtn.addEventListener('click', function (_) {
  return dialog.close();
});
dialog.addEventListener('cancel', function (_) {
  return resetDialog();
});
dialog.addEventListener('close', function (_) {
  return resetDialog();
});
function resetDialog() {
  title.textContent = '';
  description.textContent = '';
  confirmLink.setAttribute('href', '#');
  //- clone to remove all event listeners
  var confirmLinkClone = confirmLink.cloneNode(true);
  confirmLink.parentNode.replaceChild(confirmLinkClone, confirmLink);
  confirmLink = confirmLinkClone;
}
function openDialog(datas) {
  title.textContent = datas.title;
  description.textContent = datas.description;
  dialog.showModal();
}

//////
// WIREFRAMES
//////

//----- delete

var deleteButtons = document.querySelectorAll('.js-delete-wireframe');
addListeners(deleteButtons, 'click', askWireframeDeletion);
function askWireframeDeletion(e) {
  e.preventDefault();
  var link = e.currentTarget;
  var wireframeName = link.dataset.name;
  confirmLink.setAttribute('href', link.getAttribute('href'));
  openDialog({
    title: 'Delete template',
    description: 'are you sure you want to delete ' + wireframeName + '?'
  });
}

//----- handle notifications

var notification = document.querySelector('#notification');
if (notification) {
  window.setTimeout(function () {
    notification.classList.remove('mdl-snackbar--active');
  }, 2700);
}

//////
// USERS
//////

//----- RESET

var resetUsers = document.querySelectorAll('form.js-reset-user');
addListeners(resetUsers, 'submit', askUserReset);
function askUserReset(e) {
  e.preventDefault();
  var form = e.currentTarget;
  var userName = form.dataset.name;
  confirmLink.addEventListener('click', function (e) {
    e.preventDefault();
    form.submit();
  });
  openDialog({
    title: 'Reset',
    description: 'are you sure you want to reset ' + userName + ' password?'
  });
}

//----- ACTIVATE

var activateUsers = document.querySelectorAll('.js-user-activate');
addListeners(activateUsers, 'click', askUserActivation);
function askUserActivation(e) {
  e.preventDefault();
  var link = e.currentTarget;
  var userName = link.dataset.name;
  confirmLink.setAttribute('href', link.getAttribute('href'));
  openDialog({
    title: 'Activate',
    description: 'are you sure you want to activate ' + userName + '?'
  });
}

//----- DEACTIVATE

var deactivateUsers = document.querySelectorAll('.js-user-deactivate');
addListeners(deactivateUsers, 'click', askUserDeactivation);
function askUserDeactivation(e) {
  e.preventDefault();
  var link = e.currentTarget;
  var userName = link.dataset.name;
  confirmLink.setAttribute('href', link.getAttribute('href'));
  openDialog({
    title: 'Deactivate',
    description: 'are you sure you want to deactivate ' + userName + '?'
  });
}

//////
// UTILS
//////

function addListeners(elems, eventName, callback) {
  if (!elems.length) return;[].concat(_toConsumableArray(elems)).forEach(function (elem) {
    return elem.addEventListener(eventName, callback);
  });
}

function getParent(elem, selector) {
  var parent = false;
  for (; elem && elem !== document; elem = elem.parentNode) {
    if (elem.matches(selector)) {
      parent = elem;
      break;
    }
  }
  return parent;
}

},{"dialog-polyfill":1}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZGlhbG9nLXBvbHlmaWxsL2RpYWxvZy1wb2x5ZmlsbC5qcyIsInNyYy9qcy1hZG1pbi1iYWNrZW5kL2JhZHNlbmRlci1hZG1pbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7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LCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIoZnVuY3Rpb24oKSB7XG5cbiAgLy8gbmIuIFRoaXMgaXMgZm9yIElFMTAgYW5kIGxvd2VyIF9vbmx5Xy5cbiAgdmFyIHN1cHBvcnRDdXN0b21FdmVudCA9IHdpbmRvdy5DdXN0b21FdmVudDtcbiAgaWYgKCFzdXBwb3J0Q3VzdG9tRXZlbnQgfHwgdHlwZW9mIHN1cHBvcnRDdXN0b21FdmVudCA9PSAnb2JqZWN0Jykge1xuICAgIHN1cHBvcnRDdXN0b21FdmVudCA9IGZ1bmN0aW9uIEN1c3RvbUV2ZW50KGV2ZW50LCB4KSB7XG4gICAgICB4ID0geCB8fCB7fTtcbiAgICAgIHZhciBldiA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdDdXN0b21FdmVudCcpO1xuICAgICAgZXYuaW5pdEN1c3RvbUV2ZW50KGV2ZW50LCAhIXguYnViYmxlcywgISF4LmNhbmNlbGFibGUsIHguZGV0YWlsIHx8IG51bGwpO1xuICAgICAgcmV0dXJuIGV2O1xuICAgIH07XG4gICAgc3VwcG9ydEN1c3RvbUV2ZW50LnByb3RvdHlwZSA9IHdpbmRvdy5FdmVudC5wcm90b3R5cGU7XG4gIH1cblxuICAvKipcbiAgICogQHBhcmFtIHtFbGVtZW50fSBlbCB0byBjaGVjayBmb3Igc3RhY2tpbmcgY29udGV4dFxuICAgKiBAcmV0dXJuIHtib29sZWFufSB3aGV0aGVyIHRoaXMgZWwgb3IgaXRzIHBhcmVudHMgY3JlYXRlcyBhIHN0YWNraW5nIGNvbnRleHRcbiAgICovXG4gIGZ1bmN0aW9uIGNyZWF0ZXNTdGFja2luZ0NvbnRleHQoZWwpIHtcbiAgICB3aGlsZSAoZWwgJiYgZWwgIT09IGRvY3VtZW50LmJvZHkpIHtcbiAgICAgIHZhciBzID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZWwpO1xuICAgICAgdmFyIGludmFsaWQgPSBmdW5jdGlvbihrLCBvaykge1xuICAgICAgICByZXR1cm4gIShzW2tdID09PSB1bmRlZmluZWQgfHwgc1trXSA9PT0gb2spO1xuICAgICAgfVxuICAgICAgaWYgKHMub3BhY2l0eSA8IDEgfHxcbiAgICAgICAgICBpbnZhbGlkKCd6SW5kZXgnLCAnYXV0bycpIHx8XG4gICAgICAgICAgaW52YWxpZCgndHJhbnNmb3JtJywgJ25vbmUnKSB8fFxuICAgICAgICAgIGludmFsaWQoJ21peEJsZW5kTW9kZScsICdub3JtYWwnKSB8fFxuICAgICAgICAgIGludmFsaWQoJ2ZpbHRlcicsICdub25lJykgfHxcbiAgICAgICAgICBpbnZhbGlkKCdwZXJzcGVjdGl2ZScsICdub25lJykgfHxcbiAgICAgICAgICBzWydpc29sYXRpb24nXSA9PT0gJ2lzb2xhdGUnIHx8XG4gICAgICAgICAgcy5wb3NpdGlvbiA9PT0gJ2ZpeGVkJyB8fFxuICAgICAgICAgIHMud2Via2l0T3ZlcmZsb3dTY3JvbGxpbmcgPT09ICd0b3VjaCcpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgICBlbCA9IGVsLnBhcmVudEVsZW1lbnQ7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBGaW5kcyB0aGUgbmVhcmVzdCA8ZGlhbG9nPiBmcm9tIHRoZSBwYXNzZWQgZWxlbWVudC5cbiAgICpcbiAgICogQHBhcmFtIHtFbGVtZW50fSBlbCB0byBzZWFyY2ggZnJvbVxuICAgKiBAcmV0dXJuIHtIVE1MRGlhbG9nRWxlbWVudH0gZGlhbG9nIGZvdW5kXG4gICAqL1xuICBmdW5jdGlvbiBmaW5kTmVhcmVzdERpYWxvZyhlbCkge1xuICAgIHdoaWxlIChlbCkge1xuICAgICAgaWYgKGVsLmxvY2FsTmFtZSA9PT0gJ2RpYWxvZycpIHtcbiAgICAgICAgcmV0dXJuIC8qKiBAdHlwZSB7SFRNTERpYWxvZ0VsZW1lbnR9ICovIChlbCk7XG4gICAgICB9XG4gICAgICBlbCA9IGVsLnBhcmVudEVsZW1lbnQ7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLyoqXG4gICAqIEJsdXIgdGhlIHNwZWNpZmllZCBlbGVtZW50LCBhcyBsb25nIGFzIGl0J3Mgbm90IHRoZSBIVE1MIGJvZHkgZWxlbWVudC5cbiAgICogVGhpcyB3b3JrcyBhcm91bmQgYW4gSUU5LzEwIGJ1ZyAtIGJsdXJyaW5nIHRoZSBib2R5IGNhdXNlcyBXaW5kb3dzIHRvXG4gICAqIGJsdXIgdGhlIHdob2xlIGFwcGxpY2F0aW9uLlxuICAgKlxuICAgKiBAcGFyYW0ge0VsZW1lbnR9IGVsIHRvIGJsdXJcbiAgICovXG4gIGZ1bmN0aW9uIHNhZmVCbHVyKGVsKSB7XG4gICAgaWYgKGVsICYmIGVsLmJsdXIgJiYgZWwgIT0gZG9jdW1lbnQuYm9keSkge1xuICAgICAgZWwuYmx1cigpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAcGFyYW0geyFOb2RlTGlzdH0gbm9kZUxpc3QgdG8gc2VhcmNoXG4gICAqIEBwYXJhbSB7Tm9kZX0gbm9kZSB0byBmaW5kXG4gICAqIEByZXR1cm4ge2Jvb2xlYW59IHdoZXRoZXIgbm9kZSBpcyBpbnNpZGUgbm9kZUxpc3RcbiAgICovXG4gIGZ1bmN0aW9uIGluTm9kZUxpc3Qobm9kZUxpc3QsIG5vZGUpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5vZGVMaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICBpZiAobm9kZUxpc3RbaV0gPT0gbm9kZSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLyoqXG4gICAqIEBwYXJhbSB7IUhUTUxEaWFsb2dFbGVtZW50fSBkaWFsb2cgdG8gdXBncmFkZVxuICAgKiBAY29uc3RydWN0b3JcbiAgICovXG4gIGZ1bmN0aW9uIGRpYWxvZ1BvbHlmaWxsSW5mbyhkaWFsb2cpIHtcbiAgICB0aGlzLmRpYWxvZ18gPSBkaWFsb2c7XG4gICAgdGhpcy5yZXBsYWNlZFN0eWxlVG9wXyA9IGZhbHNlO1xuICAgIHRoaXMub3BlbkFzTW9kYWxfID0gZmFsc2U7XG5cbiAgICAvLyBTZXQgYTExeSByb2xlLiBCcm93c2VycyB0aGF0IHN1cHBvcnQgZGlhbG9nIGltcGxpY2l0bHkga25vdyB0aGlzIGFscmVhZHkuXG4gICAgaWYgKCFkaWFsb2cuaGFzQXR0cmlidXRlKCdyb2xlJykpIHtcbiAgICAgIGRpYWxvZy5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZGlhbG9nJyk7XG4gICAgfVxuXG4gICAgZGlhbG9nLnNob3cgPSB0aGlzLnNob3cuYmluZCh0aGlzKTtcbiAgICBkaWFsb2cuc2hvd01vZGFsID0gdGhpcy5zaG93TW9kYWwuYmluZCh0aGlzKTtcbiAgICBkaWFsb2cuY2xvc2UgPSB0aGlzLmNsb3NlLmJpbmQodGhpcyk7XG5cbiAgICBpZiAoISgncmV0dXJuVmFsdWUnIGluIGRpYWxvZykpIHtcbiAgICAgIGRpYWxvZy5yZXR1cm5WYWx1ZSA9ICcnO1xuICAgIH1cblxuICAgIGlmICgnTXV0YXRpb25PYnNlcnZlcicgaW4gd2luZG93KSB7XG4gICAgICB2YXIgbW8gPSBuZXcgTXV0YXRpb25PYnNlcnZlcih0aGlzLm1heWJlSGlkZU1vZGFsLmJpbmQodGhpcykpO1xuICAgICAgbW8ub2JzZXJ2ZShkaWFsb2csIHthdHRyaWJ1dGVzOiB0cnVlLCBhdHRyaWJ1dGVGaWx0ZXI6IFsnb3BlbiddfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIElFMTAgYW5kIGJlbG93IHN1cHBvcnQuIE5vdGUgdGhhdCBET01Ob2RlUmVtb3ZlZCBldGMgZmlyZSBfYmVmb3JlXyByZW1vdmFsLiBUaGV5IGFsc29cbiAgICAgIC8vIHNlZW0gdG8gZmlyZSBldmVuIGlmIHRoZSBlbGVtZW50IHdhcyByZW1vdmVkIGFzIHBhcnQgb2YgYSBwYXJlbnQgcmVtb3ZhbC4gVXNlIHRoZSByZW1vdmVkXG4gICAgICAvLyBldmVudHMgdG8gZm9yY2UgZG93bmdyYWRlICh1c2VmdWwgaWYgcmVtb3ZlZC9pbW1lZGlhdGVseSBhZGRlZCkuXG4gICAgICB2YXIgcmVtb3ZlZCA9IGZhbHNlO1xuICAgICAgdmFyIGNiID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJlbW92ZWQgPyB0aGlzLmRvd25ncmFkZU1vZGFsKCkgOiB0aGlzLm1heWJlSGlkZU1vZGFsKCk7XG4gICAgICAgIHJlbW92ZWQgPSBmYWxzZTtcbiAgICAgIH0uYmluZCh0aGlzKTtcbiAgICAgIHZhciB0aW1lb3V0O1xuICAgICAgdmFyIGRlbGF5TW9kZWwgPSBmdW5jdGlvbihldikge1xuICAgICAgICB2YXIgY2FuZCA9ICdET01Ob2RlUmVtb3ZlZCc7XG4gICAgICAgIHJlbW92ZWQgfD0gKGV2LnR5cGUuc3Vic3RyKDAsIGNhbmQubGVuZ3RoKSA9PT0gY2FuZCk7XG4gICAgICAgIHdpbmRvdy5jbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIHRpbWVvdXQgPSB3aW5kb3cuc2V0VGltZW91dChjYiwgMCk7XG4gICAgICB9O1xuICAgICAgWydET01BdHRyTW9kaWZpZWQnLCAnRE9NTm9kZVJlbW92ZWQnLCAnRE9NTm9kZVJlbW92ZWRGcm9tRG9jdW1lbnQnXS5mb3JFYWNoKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgZGlhbG9nLmFkZEV2ZW50TGlzdGVuZXIobmFtZSwgZGVsYXlNb2RlbCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgLy8gTm90ZSB0aGF0IHRoZSBET00gaXMgb2JzZXJ2ZWQgaW5zaWRlIERpYWxvZ01hbmFnZXIgd2hpbGUgYW55IGRpYWxvZ1xuICAgIC8vIGlzIGJlaW5nIGRpc3BsYXllZCBhcyBhIG1vZGFsLCB0byBjYXRjaCBtb2RhbCByZW1vdmFsIGZyb20gdGhlIERPTS5cblxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShkaWFsb2csICdvcGVuJywge1xuICAgICAgc2V0OiB0aGlzLnNldE9wZW4uYmluZCh0aGlzKSxcbiAgICAgIGdldDogZGlhbG9nLmhhc0F0dHJpYnV0ZS5iaW5kKGRpYWxvZywgJ29wZW4nKVxuICAgIH0pO1xuXG4gICAgdGhpcy5iYWNrZHJvcF8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB0aGlzLmJhY2tkcm9wXy5jbGFzc05hbWUgPSAnYmFja2Ryb3AnO1xuICAgIHRoaXMuYmFja2Ryb3BfLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgdGhpcy5iYWNrZHJvcENsaWNrXy5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGRpYWxvZ1BvbHlmaWxsSW5mby5wcm90b3R5cGUgPSB7XG5cbiAgICBnZXQgZGlhbG9nKCkge1xuICAgICAgcmV0dXJuIHRoaXMuZGlhbG9nXztcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogTWF5YmUgcmVtb3ZlIHRoaXMgZGlhbG9nIGZyb20gdGhlIG1vZGFsIHRvcCBsYXllci4gVGhpcyBpcyBjYWxsZWQgd2hlblxuICAgICAqIGEgbW9kYWwgZGlhbG9nIG1heSBubyBsb25nZXIgYmUgdGVuYWJsZSwgZS5nLiwgd2hlbiB0aGUgZGlhbG9nIGlzIG5vXG4gICAgICogbG9uZ2VyIG9wZW4gb3IgaXMgbm8gbG9uZ2VyIHBhcnQgb2YgdGhlIERPTS5cbiAgICAgKi9cbiAgICBtYXliZUhpZGVNb2RhbDogZnVuY3Rpb24oKSB7XG4gICAgICBpZiAodGhpcy5kaWFsb2dfLmhhc0F0dHJpYnV0ZSgnb3BlbicpICYmIGRvY3VtZW50LmJvZHkuY29udGFpbnModGhpcy5kaWFsb2dfKSkgeyByZXR1cm47IH1cbiAgICAgIHRoaXMuZG93bmdyYWRlTW9kYWwoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlIHRoaXMgZGlhbG9nIGZyb20gdGhlIG1vZGFsIHRvcCBsYXllciwgbGVhdmluZyBpdCBhcyBhIG5vbi1tb2RhbC5cbiAgICAgKi9cbiAgICBkb3duZ3JhZGVNb2RhbDogZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoIXRoaXMub3BlbkFzTW9kYWxfKSB7IHJldHVybjsgfVxuICAgICAgdGhpcy5vcGVuQXNNb2RhbF8gPSBmYWxzZTtcbiAgICAgIHRoaXMuZGlhbG9nXy5zdHlsZS56SW5kZXggPSAnJztcblxuICAgICAgLy8gVGhpcyB3b24ndCBtYXRjaCB0aGUgbmF0aXZlIDxkaWFsb2c+IGV4YWN0bHkgYmVjYXVzZSBpZiB0aGUgdXNlciBzZXQgdG9wIG9uIGEgY2VudGVyZWRcbiAgICAgIC8vIHBvbHlmaWxsIGRpYWxvZywgdGhhdCB0b3AgZ2V0cyB0aHJvd24gYXdheSB3aGVuIHRoZSBkaWFsb2cgaXMgY2xvc2VkLiBOb3Qgc3VyZSBpdCdzXG4gICAgICAvLyBwb3NzaWJsZSB0byBwb2x5ZmlsbCB0aGlzIHBlcmZlY3RseS5cbiAgICAgIGlmICh0aGlzLnJlcGxhY2VkU3R5bGVUb3BfKSB7XG4gICAgICAgIHRoaXMuZGlhbG9nXy5zdHlsZS50b3AgPSAnJztcbiAgICAgICAgdGhpcy5yZXBsYWNlZFN0eWxlVG9wXyA9IGZhbHNlO1xuICAgICAgfVxuXG4gICAgICAvLyBDbGVhciB0aGUgYmFja2Ryb3AgYW5kIHJlbW92ZSBmcm9tIHRoZSBtYW5hZ2VyLlxuICAgICAgdGhpcy5iYWNrZHJvcF8ucGFyZW50Tm9kZSAmJiB0aGlzLmJhY2tkcm9wXy5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMuYmFja2Ryb3BfKTtcbiAgICAgIGRpYWxvZ1BvbHlmaWxsLmRtLnJlbW92ZURpYWxvZyh0aGlzKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQHBhcmFtIHtib29sZWFufSB2YWx1ZSB3aGV0aGVyIHRvIG9wZW4gb3IgY2xvc2UgdGhpcyBkaWFsb2dcbiAgICAgKi9cbiAgICBzZXRPcGVuOiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuZGlhbG9nXy5oYXNBdHRyaWJ1dGUoJ29wZW4nKSB8fCB0aGlzLmRpYWxvZ18uc2V0QXR0cmlidXRlKCdvcGVuJywgJycpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5kaWFsb2dfLnJlbW92ZUF0dHJpYnV0ZSgnb3BlbicpO1xuICAgICAgICB0aGlzLm1heWJlSGlkZU1vZGFsKCk7ICAvLyBuYi4gcmVkdW5kYW50IHdpdGggTXV0YXRpb25PYnNlcnZlclxuICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBIYW5kbGVzIGNsaWNrcyBvbiB0aGUgZmFrZSAuYmFja2Ryb3AgZWxlbWVudCwgcmVkaXJlY3RpbmcgdGhlbSBhcyBpZlxuICAgICAqIHRoZXkgd2VyZSBvbiB0aGUgZGlhbG9nIGl0c2VsZi5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7IUV2ZW50fSBlIHRvIHJlZGlyZWN0XG4gICAgICovXG4gICAgYmFja2Ryb3BDbGlja186IGZ1bmN0aW9uKGUpIHtcbiAgICAgIGlmICghdGhpcy5kaWFsb2dfLmhhc0F0dHJpYnV0ZSgndGFiaW5kZXgnKSkge1xuICAgICAgICAvLyBDbGlja2luZyBvbiB0aGUgYmFja2Ryb3Agc2hvdWxkIG1vdmUgdGhlIGltcGxpY2l0IGN1cnNvciwgZXZlbiBpZiBkaWFsb2cgY2Fubm90IGJlXG4gICAgICAgIC8vIGZvY3VzZWQuIENyZWF0ZSBhIGZha2UgdGhpbmcgdG8gZm9jdXMgb24uIElmIHRoZSBiYWNrZHJvcCB3YXMgX2JlZm9yZV8gdGhlIGRpYWxvZywgdGhpc1xuICAgICAgICAvLyB3b3VsZCBub3QgYmUgbmVlZGVkIC0gY2xpY2tzIHdvdWxkIG1vdmUgdGhlIGltcGxpY2l0IGN1cnNvciB0aGVyZS5cbiAgICAgICAgdmFyIGZha2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgdGhpcy5kaWFsb2dfLmluc2VydEJlZm9yZShmYWtlLCB0aGlzLmRpYWxvZ18uZmlyc3RDaGlsZCk7XG4gICAgICAgIGZha2UudGFiSW5kZXggPSAtMTtcbiAgICAgICAgZmFrZS5mb2N1cygpO1xuICAgICAgICB0aGlzLmRpYWxvZ18ucmVtb3ZlQ2hpbGQoZmFrZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmRpYWxvZ18uZm9jdXMoKTtcbiAgICAgIH1cblxuICAgICAgdmFyIHJlZGlyZWN0ZWRFdmVudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdNb3VzZUV2ZW50cycpO1xuICAgICAgcmVkaXJlY3RlZEV2ZW50LmluaXRNb3VzZUV2ZW50KGUudHlwZSwgZS5idWJibGVzLCBlLmNhbmNlbGFibGUsIHdpbmRvdyxcbiAgICAgICAgICBlLmRldGFpbCwgZS5zY3JlZW5YLCBlLnNjcmVlblksIGUuY2xpZW50WCwgZS5jbGllbnRZLCBlLmN0cmxLZXksXG4gICAgICAgICAgZS5hbHRLZXksIGUuc2hpZnRLZXksIGUubWV0YUtleSwgZS5idXR0b24sIGUucmVsYXRlZFRhcmdldCk7XG4gICAgICB0aGlzLmRpYWxvZ18uZGlzcGF0Y2hFdmVudChyZWRpcmVjdGVkRXZlbnQpO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogRm9jdXNlcyBvbiB0aGUgZmlyc3QgZm9jdXNhYmxlIGVsZW1lbnQgd2l0aGluIHRoZSBkaWFsb2cuIFRoaXMgd2lsbCBhbHdheXMgYmx1ciB0aGUgY3VycmVudFxuICAgICAqIGZvY3VzLCBldmVuIGlmIG5vdGhpbmcgd2l0aGluIHRoZSBkaWFsb2cgaXMgZm91bmQuXG4gICAgICovXG4gICAgZm9jdXNfOiBmdW5jdGlvbigpIHtcbiAgICAgIC8vIEZpbmQgZWxlbWVudCB3aXRoIGBhdXRvZm9jdXNgIGF0dHJpYnV0ZSwgb3IgZmFsbCBiYWNrIHRvIHRoZSBmaXJzdCBmb3JtL3RhYmluZGV4IGNvbnRyb2wuXG4gICAgICB2YXIgdGFyZ2V0ID0gdGhpcy5kaWFsb2dfLnF1ZXJ5U2VsZWN0b3IoJ1thdXRvZm9jdXNdOm5vdChbZGlzYWJsZWRdKScpO1xuICAgICAgaWYgKCF0YXJnZXQgJiYgdGhpcy5kaWFsb2dfLnRhYkluZGV4ID49IDApIHtcbiAgICAgICAgdGFyZ2V0ID0gdGhpcy5kaWFsb2dfO1xuICAgICAgfVxuICAgICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgICAgLy8gTm90ZSB0aGF0IHRoaXMgaXMgJ2FueSBmb2N1c2FibGUgYXJlYScuIFRoaXMgbGlzdCBpcyBwcm9iYWJseSBub3QgZXhoYXVzdGl2ZSwgYnV0IHRoZVxuICAgICAgICAvLyBhbHRlcm5hdGl2ZSBpbnZvbHZlcyBzdGVwcGluZyB0aHJvdWdoIGFuZCB0cnlpbmcgdG8gZm9jdXMgZXZlcnl0aGluZy5cbiAgICAgICAgdmFyIG9wdHMgPSBbJ2J1dHRvbicsICdpbnB1dCcsICdrZXlnZW4nLCAnc2VsZWN0JywgJ3RleHRhcmVhJ107XG4gICAgICAgIHZhciBxdWVyeSA9IG9wdHMubWFwKGZ1bmN0aW9uKGVsKSB7XG4gICAgICAgICAgcmV0dXJuIGVsICsgJzpub3QoW2Rpc2FibGVkXSknO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gVE9ETyhzYW10aG9yKTogdGFiaW5kZXggdmFsdWVzIHRoYXQgYXJlIG5vdCBudW1lcmljIGFyZSBub3QgZm9jdXNhYmxlLlxuICAgICAgICBxdWVyeS5wdXNoKCdbdGFiaW5kZXhdOm5vdChbZGlzYWJsZWRdKTpub3QoW3RhYmluZGV4PVwiXCJdKScpOyAgLy8gdGFiaW5kZXggIT0gXCJcIiwgbm90IGRpc2FibGVkXG4gICAgICAgIHRhcmdldCA9IHRoaXMuZGlhbG9nXy5xdWVyeVNlbGVjdG9yKHF1ZXJ5LmpvaW4oJywgJykpO1xuICAgICAgfVxuICAgICAgc2FmZUJsdXIoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCk7XG4gICAgICB0YXJnZXQgJiYgdGFyZ2V0LmZvY3VzKCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHpJbmRleCBmb3IgdGhlIGJhY2tkcm9wIGFuZCBkaWFsb2cuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gZGlhbG9nWlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBiYWNrZHJvcFpcbiAgICAgKi9cbiAgICB1cGRhdGVaSW5kZXg6IGZ1bmN0aW9uKGRpYWxvZ1osIGJhY2tkcm9wWikge1xuICAgICAgaWYgKGRpYWxvZ1ogPCBiYWNrZHJvcFopIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdkaWFsb2daIHNob3VsZCBuZXZlciBiZSA8IGJhY2tkcm9wWicpO1xuICAgICAgfVxuICAgICAgdGhpcy5kaWFsb2dfLnN0eWxlLnpJbmRleCA9IGRpYWxvZ1o7XG4gICAgICB0aGlzLmJhY2tkcm9wXy5zdHlsZS56SW5kZXggPSBiYWNrZHJvcFo7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFNob3dzIHRoZSBkaWFsb2cuIElmIHRoZSBkaWFsb2cgaXMgYWxyZWFkeSBvcGVuLCB0aGlzIGRvZXMgbm90aGluZy5cbiAgICAgKi9cbiAgICBzaG93OiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICghdGhpcy5kaWFsb2dfLm9wZW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcGVuKHRydWUpO1xuICAgICAgICB0aGlzLmZvY3VzXygpO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTaG93IHRoaXMgZGlhbG9nIG1vZGFsbHkuXG4gICAgICovXG4gICAgc2hvd01vZGFsOiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICh0aGlzLmRpYWxvZ18uaGFzQXR0cmlidXRlKCdvcGVuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZXhlY3V0ZSBcXCdzaG93TW9kYWxcXCcgb24gZGlhbG9nOiBUaGUgZWxlbWVudCBpcyBhbHJlYWR5IG9wZW4sIGFuZCB0aGVyZWZvcmUgY2Fubm90IGJlIG9wZW5lZCBtb2RhbGx5LicpO1xuICAgICAgfVxuICAgICAgaWYgKCFkb2N1bWVudC5ib2R5LmNvbnRhaW5zKHRoaXMuZGlhbG9nXykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZXhlY3V0ZSBcXCdzaG93TW9kYWxcXCcgb24gZGlhbG9nOiBUaGUgZWxlbWVudCBpcyBub3QgaW4gYSBEb2N1bWVudC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICghZGlhbG9nUG9seWZpbGwuZG0ucHVzaERpYWxvZyh0aGlzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBleGVjdXRlIFxcJ3Nob3dNb2RhbFxcJyBvbiBkaWFsb2c6IFRoZXJlIGFyZSB0b28gbWFueSBvcGVuIG1vZGFsIGRpYWxvZ3MuJyk7XG4gICAgICB9XG5cbiAgICAgIGlmIChjcmVhdGVzU3RhY2tpbmdDb250ZXh0KHRoaXMuZGlhbG9nXy5wYXJlbnRFbGVtZW50KSkge1xuICAgICAgICBjb25zb2xlLndhcm4oJ0EgZGlhbG9nIGlzIGJlaW5nIHNob3duIGluc2lkZSBhIHN0YWNraW5nIGNvbnRleHQuICcgK1xuICAgICAgICAgICAgJ1RoaXMgbWF5IGNhdXNlIGl0IHRvIGJlIHVudXNhYmxlLiBGb3IgbW9yZSBpbmZvcm1hdGlvbiwgc2VlIHRoaXMgbGluazogJyArXG4gICAgICAgICAgICAnaHR0cHM6Ly9naXRodWIuY29tL0dvb2dsZUNocm9tZS9kaWFsb2ctcG9seWZpbGwvI3N0YWNraW5nLWNvbnRleHQnKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5zZXRPcGVuKHRydWUpO1xuICAgICAgdGhpcy5vcGVuQXNNb2RhbF8gPSB0cnVlO1xuXG4gICAgICAvLyBPcHRpb25hbGx5IGNlbnRlciB2ZXJ0aWNhbGx5LCByZWxhdGl2ZSB0byB0aGUgY3VycmVudCB2aWV3cG9ydC5cbiAgICAgIGlmIChkaWFsb2dQb2x5ZmlsbC5uZWVkc0NlbnRlcmluZyh0aGlzLmRpYWxvZ18pKSB7XG4gICAgICAgIGRpYWxvZ1BvbHlmaWxsLnJlcG9zaXRpb24odGhpcy5kaWFsb2dfKTtcbiAgICAgICAgdGhpcy5yZXBsYWNlZFN0eWxlVG9wXyA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlcGxhY2VkU3R5bGVUb3BfID0gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIEluc2VydCBiYWNrZHJvcC5cbiAgICAgIHRoaXMuZGlhbG9nXy5wYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLmJhY2tkcm9wXywgdGhpcy5kaWFsb2dfLm5leHRTaWJsaW5nKTtcblxuICAgICAgLy8gRm9jdXMgb24gd2hhdGV2ZXIgaW5zaWRlIHRoZSBkaWFsb2cuXG4gICAgICB0aGlzLmZvY3VzXygpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDbG9zZXMgdGhpcyBIVE1MRGlhbG9nRWxlbWVudC4gVGhpcyBpcyBvcHRpb25hbCB2cyBjbGVhcmluZyB0aGUgb3BlblxuICAgICAqIGF0dHJpYnV0ZSwgaG93ZXZlciB0aGlzIGZpcmVzIGEgJ2Nsb3NlJyBldmVudC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nPX0gb3B0X3JldHVyblZhbHVlIHRvIHVzZSBhcyB0aGUgcmV0dXJuVmFsdWVcbiAgICAgKi9cbiAgICBjbG9zZTogZnVuY3Rpb24ob3B0X3JldHVyblZhbHVlKSB7XG4gICAgICBpZiAoIXRoaXMuZGlhbG9nXy5oYXNBdHRyaWJ1dGUoJ29wZW4nKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBleGVjdXRlIFxcJ2Nsb3NlXFwnIG9uIGRpYWxvZzogVGhlIGVsZW1lbnQgZG9lcyBub3QgaGF2ZSBhbiBcXCdvcGVuXFwnIGF0dHJpYnV0ZSwgYW5kIHRoZXJlZm9yZSBjYW5ub3QgYmUgY2xvc2VkLicpO1xuICAgICAgfVxuICAgICAgdGhpcy5zZXRPcGVuKGZhbHNlKTtcblxuICAgICAgLy8gTGVhdmUgcmV0dXJuVmFsdWUgdW50b3VjaGVkIGluIGNhc2UgaXQgd2FzIHNldCBkaXJlY3RseSBvbiB0aGUgZWxlbWVudFxuICAgICAgaWYgKG9wdF9yZXR1cm5WYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHRoaXMuZGlhbG9nXy5yZXR1cm5WYWx1ZSA9IG9wdF9yZXR1cm5WYWx1ZTtcbiAgICAgIH1cblxuICAgICAgLy8gVHJpZ2dlcmluZyBcImNsb3NlXCIgZXZlbnQgZm9yIGFueSBhdHRhY2hlZCBsaXN0ZW5lcnMgb24gdGhlIDxkaWFsb2c+LlxuICAgICAgdmFyIGNsb3NlRXZlbnQgPSBuZXcgc3VwcG9ydEN1c3RvbUV2ZW50KCdjbG9zZScsIHtcbiAgICAgICAgYnViYmxlczogZmFsc2UsXG4gICAgICAgIGNhbmNlbGFibGU6IGZhbHNlXG4gICAgICB9KTtcbiAgICAgIHRoaXMuZGlhbG9nXy5kaXNwYXRjaEV2ZW50KGNsb3NlRXZlbnQpO1xuICAgIH1cblxuICB9O1xuXG4gIHZhciBkaWFsb2dQb2x5ZmlsbCA9IHt9O1xuXG4gIGRpYWxvZ1BvbHlmaWxsLnJlcG9zaXRpb24gPSBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgdmFyIHNjcm9sbFRvcCA9IGRvY3VtZW50LmJvZHkuc2Nyb2xsVG9wIHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxUb3A7XG4gICAgdmFyIHRvcFZhbHVlID0gc2Nyb2xsVG9wICsgKHdpbmRvdy5pbm5lckhlaWdodCAtIGVsZW1lbnQub2Zmc2V0SGVpZ2h0KSAvIDI7XG4gICAgZWxlbWVudC5zdHlsZS50b3AgPSBNYXRoLm1heChzY3JvbGxUb3AsIHRvcFZhbHVlKSArICdweCc7XG4gIH07XG5cbiAgZGlhbG9nUG9seWZpbGwuaXNJbmxpbmVQb3NpdGlvblNldEJ5U3R5bGVzaGVldCA9IGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRvY3VtZW50LnN0eWxlU2hlZXRzLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgc3R5bGVTaGVldCA9IGRvY3VtZW50LnN0eWxlU2hlZXRzW2ldO1xuICAgICAgdmFyIGNzc1J1bGVzID0gbnVsbDtcbiAgICAgIC8vIFNvbWUgYnJvd3NlcnMgdGhyb3cgb24gY3NzUnVsZXMuXG4gICAgICB0cnkge1xuICAgICAgICBjc3NSdWxlcyA9IHN0eWxlU2hlZXQuY3NzUnVsZXM7XG4gICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgaWYgKCFjc3NSdWxlcykgeyBjb250aW51ZTsgfVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBjc3NSdWxlcy5sZW5ndGg7ICsraikge1xuICAgICAgICB2YXIgcnVsZSA9IGNzc1J1bGVzW2pdO1xuICAgICAgICB2YXIgc2VsZWN0ZWROb2RlcyA9IG51bGw7XG4gICAgICAgIC8vIElnbm9yZSBlcnJvcnMgb24gaW52YWxpZCBzZWxlY3RvciB0ZXh0cy5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBzZWxlY3RlZE5vZGVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbChydWxlLnNlbGVjdG9yVGV4dCk7XG4gICAgICAgIH0gY2F0Y2goZSkge31cbiAgICAgICAgaWYgKCFzZWxlY3RlZE5vZGVzIHx8ICFpbk5vZGVMaXN0KHNlbGVjdGVkTm9kZXMsIGVsZW1lbnQpKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGNzc1RvcCA9IHJ1bGUuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgndG9wJyk7XG4gICAgICAgIHZhciBjc3NCb3R0b20gPSBydWxlLnN0eWxlLmdldFByb3BlcnR5VmFsdWUoJ2JvdHRvbScpO1xuICAgICAgICBpZiAoKGNzc1RvcCAmJiBjc3NUb3AgIT0gJ2F1dG8nKSB8fCAoY3NzQm90dG9tICYmIGNzc0JvdHRvbSAhPSAnYXV0bycpKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuXG4gIGRpYWxvZ1BvbHlmaWxsLm5lZWRzQ2VudGVyaW5nID0gZnVuY3Rpb24oZGlhbG9nKSB7XG4gICAgdmFyIGNvbXB1dGVkU3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShkaWFsb2cpO1xuICAgIGlmIChjb21wdXRlZFN0eWxlLnBvc2l0aW9uICE9ICdhYnNvbHV0ZScpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBXZSBtdXN0IGRldGVybWluZSB3aGV0aGVyIHRoZSB0b3AvYm90dG9tIHNwZWNpZmllZCB2YWx1ZSBpcyBub24tYXV0by4gIEluXG4gICAgLy8gV2ViS2l0L0JsaW5rLCBjaGVja2luZyBjb21wdXRlZFN0eWxlLnRvcCA9PSAnYXV0bycgaXMgc3VmZmljaWVudCwgYnV0XG4gICAgLy8gRmlyZWZveCByZXR1cm5zIHRoZSB1c2VkIHZhbHVlLiBTbyB3ZSBkbyB0aGlzIGNyYXp5IHRoaW5nIGluc3RlYWQ6IGNoZWNrXG4gICAgLy8gdGhlIGlubGluZSBzdHlsZSBhbmQgdGhlbiBnbyB0aHJvdWdoIENTUyBydWxlcy5cbiAgICBpZiAoKGRpYWxvZy5zdHlsZS50b3AgIT0gJ2F1dG8nICYmIGRpYWxvZy5zdHlsZS50b3AgIT0gJycpIHx8XG4gICAgICAgIChkaWFsb2cuc3R5bGUuYm90dG9tICE9ICdhdXRvJyAmJiBkaWFsb2cuc3R5bGUuYm90dG9tICE9ICcnKSlcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gIWRpYWxvZ1BvbHlmaWxsLmlzSW5saW5lUG9zaXRpb25TZXRCeVN0eWxlc2hlZXQoZGlhbG9nKTtcbiAgfTtcblxuICAvKipcbiAgICogQHBhcmFtIHshRWxlbWVudH0gZWxlbWVudCB0byBmb3JjZSB1cGdyYWRlXG4gICAqL1xuICBkaWFsb2dQb2x5ZmlsbC5mb3JjZVJlZ2lzdGVyRGlhbG9nID0gZnVuY3Rpb24oZWxlbWVudCkge1xuICAgIGlmIChlbGVtZW50LnNob3dNb2RhbCkge1xuICAgICAgY29uc29sZS53YXJuKCdUaGlzIGJyb3dzZXIgYWxyZWFkeSBzdXBwb3J0cyA8ZGlhbG9nPiwgdGhlIHBvbHlmaWxsICcgK1xuICAgICAgICAgICdtYXkgbm90IHdvcmsgY29ycmVjdGx5JywgZWxlbWVudCk7XG4gICAgfVxuICAgIGlmIChlbGVtZW50LmxvY2FsTmFtZSAhPT0gJ2RpYWxvZycpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIHJlZ2lzdGVyIGRpYWxvZzogVGhlIGVsZW1lbnQgaXMgbm90IGEgZGlhbG9nLicpO1xuICAgIH1cbiAgICBuZXcgZGlhbG9nUG9seWZpbGxJbmZvKC8qKiBAdHlwZSB7IUhUTUxEaWFsb2dFbGVtZW50fSAqLyAoZWxlbWVudCkpO1xuICB9O1xuXG4gIC8qKlxuICAgKiBAcGFyYW0geyFFbGVtZW50fSBlbGVtZW50IHRvIHVwZ3JhZGUsIGlmIG5lY2Vzc2FyeVxuICAgKi9cbiAgZGlhbG9nUG9seWZpbGwucmVnaXN0ZXJEaWFsb2cgPSBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgaWYgKCFlbGVtZW50LnNob3dNb2RhbCkge1xuICAgICAgZGlhbG9nUG9seWZpbGwuZm9yY2VSZWdpc3RlckRpYWxvZyhlbGVtZW50KTtcbiAgICB9XG4gIH07XG5cbiAgLyoqXG4gICAqIEBjb25zdHJ1Y3RvclxuICAgKi9cbiAgZGlhbG9nUG9seWZpbGwuRGlhbG9nTWFuYWdlciA9IGZ1bmN0aW9uKCkge1xuICAgIC8qKiBAdHlwZSB7IUFycmF5PCFkaWFsb2dQb2x5ZmlsbEluZm8+fSAqL1xuICAgIHRoaXMucGVuZGluZ0RpYWxvZ1N0YWNrID0gW107XG5cbiAgICB2YXIgY2hlY2tET00gPSB0aGlzLmNoZWNrRE9NXy5iaW5kKHRoaXMpO1xuXG4gICAgLy8gVGhlIG92ZXJsYXkgaXMgdXNlZCB0byBzaW11bGF0ZSBob3cgYSBtb2RhbCBkaWFsb2cgYmxvY2tzIHRoZSBkb2N1bWVudC5cbiAgICAvLyBUaGUgYmxvY2tpbmcgZGlhbG9nIGlzIHBvc2l0aW9uZWQgb24gdG9wIG9mIHRoZSBvdmVybGF5LCBhbmQgdGhlIHJlc3Qgb2ZcbiAgICAvLyB0aGUgZGlhbG9ncyBvbiB0aGUgcGVuZGluZyBkaWFsb2cgc3RhY2sgYXJlIHBvc2l0aW9uZWQgYmVsb3cgaXQuIEluIHRoZVxuICAgIC8vIGFjdHVhbCBpbXBsZW1lbnRhdGlvbiwgdGhlIG1vZGFsIGRpYWxvZyBzdGFja2luZyBpcyBjb250cm9sbGVkIGJ5IHRoZVxuICAgIC8vIHRvcCBsYXllciwgd2hlcmUgei1pbmRleCBoYXMgbm8gZWZmZWN0LlxuICAgIHRoaXMub3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIHRoaXMub3ZlcmxheS5jbGFzc05hbWUgPSAnX2RpYWxvZ19vdmVybGF5JztcbiAgICB0aGlzLm92ZXJsYXkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBmdW5jdGlvbihlKSB7XG4gICAgICB0aGlzLmZvcndhcmRUYWJfID0gdW5kZWZpbmVkO1xuICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgIGNoZWNrRE9NKFtdKTsgIC8vIHNhbml0eS1jaGVjayBET01cbiAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgdGhpcy5oYW5kbGVLZXlfID0gdGhpcy5oYW5kbGVLZXlfLmJpbmQodGhpcyk7XG4gICAgdGhpcy5oYW5kbGVGb2N1c18gPSB0aGlzLmhhbmRsZUZvY3VzXy5iaW5kKHRoaXMpO1xuXG4gICAgdGhpcy56SW5kZXhMb3dfID0gMTAwMDAwO1xuICAgIHRoaXMuekluZGV4SGlnaF8gPSAxMDAwMDAgKyAxNTA7XG5cbiAgICB0aGlzLmZvcndhcmRUYWJfID0gdW5kZWZpbmVkO1xuXG4gICAgaWYgKCdNdXRhdGlvbk9ic2VydmVyJyBpbiB3aW5kb3cpIHtcbiAgICAgIHRoaXMubW9fID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoZnVuY3Rpb24ocmVjb3Jkcykge1xuICAgICAgICB2YXIgcmVtb3ZlZCA9IFtdO1xuICAgICAgICByZWNvcmRzLmZvckVhY2goZnVuY3Rpb24ocmVjKSB7XG4gICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGM7IGMgPSByZWMucmVtb3ZlZE5vZGVzW2ldOyArK2kpIHtcbiAgICAgICAgICAgIGlmICghKGMgaW5zdGFuY2VvZiBFbGVtZW50KSkge1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYy5sb2NhbE5hbWUgPT09ICdkaWFsb2cnKSB7XG4gICAgICAgICAgICAgIHJlbW92ZWQucHVzaChjKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHZhciBxID0gYy5xdWVyeVNlbGVjdG9yKCdkaWFsb2cnKTtcbiAgICAgICAgICAgICAgcSAmJiByZW1vdmVkLnB1c2gocSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmVtb3ZlZC5sZW5ndGggJiYgY2hlY2tET00ocmVtb3ZlZCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG5cbiAgLyoqXG4gICAqIENhbGxlZCBvbiB0aGUgZmlyc3QgbW9kYWwgZGlhbG9nIGJlaW5nIHNob3duLiBBZGRzIHRoZSBvdmVybGF5IGFuZCByZWxhdGVkXG4gICAqIGhhbmRsZXJzLlxuICAgKi9cbiAgZGlhbG9nUG9seWZpbGwuRGlhbG9nTWFuYWdlci5wcm90b3R5cGUuYmxvY2tEb2N1bWVudCA9IGZ1bmN0aW9uKCkge1xuICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdmb2N1cycsIHRoaXMuaGFuZGxlRm9jdXNfLCB0cnVlKTtcbiAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgdGhpcy5oYW5kbGVLZXlfKTtcbiAgICB0aGlzLm1vXyAmJiB0aGlzLm1vXy5vYnNlcnZlKGRvY3VtZW50LCB7Y2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlfSk7XG4gIH07XG5cbiAgLyoqXG4gICAqIENhbGxlZCBvbiB0aGUgZmlyc3QgbW9kYWwgZGlhbG9nIGJlaW5nIHJlbW92ZWQsIGkuZS4sIHdoZW4gbm8gbW9yZSBtb2RhbFxuICAgKiBkaWFsb2dzIGFyZSB2aXNpYmxlLlxuICAgKi9cbiAgZGlhbG9nUG9seWZpbGwuRGlhbG9nTWFuYWdlci5wcm90b3R5cGUudW5ibG9ja0RvY3VtZW50ID0gZnVuY3Rpb24oKSB7XG4gICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2ZvY3VzJywgdGhpcy5oYW5kbGVGb2N1c18sIHRydWUpO1xuICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCB0aGlzLmhhbmRsZUtleV8pO1xuICAgIHRoaXMubW9fICYmIHRoaXMubW9fLmRpc2Nvbm5lY3QoKTtcbiAgfTtcblxuICAvKipcbiAgICogVXBkYXRlcyB0aGUgc3RhY2tpbmcgb2YgYWxsIGtub3duIGRpYWxvZ3MuXG4gICAqL1xuICBkaWFsb2dQb2x5ZmlsbC5EaWFsb2dNYW5hZ2VyLnByb3RvdHlwZS51cGRhdGVTdGFja2luZyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciB6SW5kZXggPSB0aGlzLnpJbmRleEhpZ2hfO1xuXG4gICAgZm9yICh2YXIgaSA9IDAsIGRwaTsgZHBpID0gdGhpcy5wZW5kaW5nRGlhbG9nU3RhY2tbaV07ICsraSkge1xuICAgICAgZHBpLnVwZGF0ZVpJbmRleCgtLXpJbmRleCwgLS16SW5kZXgpO1xuICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgdGhpcy5vdmVybGF5LnN0eWxlLnpJbmRleCA9IC0tekluZGV4O1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIE1ha2UgdGhlIG92ZXJsYXkgYSBzaWJsaW5nIG9mIHRoZSBkaWFsb2cgaXRzZWxmLlxuICAgIHZhciBsYXN0ID0gdGhpcy5wZW5kaW5nRGlhbG9nU3RhY2tbMF07XG4gICAgaWYgKGxhc3QpIHtcbiAgICAgIHZhciBwID0gbGFzdC5kaWFsb2cucGFyZW50Tm9kZSB8fCBkb2N1bWVudC5ib2R5O1xuICAgICAgcC5hcHBlbmRDaGlsZCh0aGlzLm92ZXJsYXkpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5vdmVybGF5LnBhcmVudE5vZGUpIHtcbiAgICAgIHRoaXMub3ZlcmxheS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMub3ZlcmxheSk7XG4gICAgfVxuICB9O1xuXG4gIC8qKlxuICAgKiBAcGFyYW0ge0VsZW1lbnR9IGNhbmRpZGF0ZSB0byBjaGVjayBpZiBjb250YWluZWQgb3IgaXMgdGhlIHRvcC1tb3N0IG1vZGFsIGRpYWxvZ1xuICAgKiBAcmV0dXJuIHtib29sZWFufSB3aGV0aGVyIGNhbmRpZGF0ZSBpcyBjb250YWluZWQgaW4gdG9wIGRpYWxvZ1xuICAgKi9cbiAgZGlhbG9nUG9seWZpbGwuRGlhbG9nTWFuYWdlci5wcm90b3R5cGUuY29udGFpbmVkQnlUb3BEaWFsb2dfID0gZnVuY3Rpb24oY2FuZGlkYXRlKSB7XG4gICAgd2hpbGUgKGNhbmRpZGF0ZSA9IGZpbmROZWFyZXN0RGlhbG9nKGNhbmRpZGF0ZSkpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBkcGk7IGRwaSA9IHRoaXMucGVuZGluZ0RpYWxvZ1N0YWNrW2ldOyArK2kpIHtcbiAgICAgICAgaWYgKGRwaS5kaWFsb2cgPT09IGNhbmRpZGF0ZSkge1xuICAgICAgICAgIHJldHVybiBpID09PSAwOyAgLy8gb25seSB2YWxpZCBpZiB0b3AtbW9zdFxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjYW5kaWRhdGUgPSBjYW5kaWRhdGUucGFyZW50RWxlbWVudDtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuXG4gIGRpYWxvZ1BvbHlmaWxsLkRpYWxvZ01hbmFnZXIucHJvdG90eXBlLmhhbmRsZUZvY3VzXyA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgaWYgKHRoaXMuY29udGFpbmVkQnlUb3BEaWFsb2dfKGV2ZW50LnRhcmdldCkpIHsgcmV0dXJuOyB9XG5cbiAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgIHNhZmVCbHVyKC8qKiBAdHlwZSB7RWxlbWVudH0gKi8gKGV2ZW50LnRhcmdldCkpO1xuXG4gICAgaWYgKHRoaXMuZm9yd2FyZFRhYl8gPT09IHVuZGVmaW5lZCkgeyByZXR1cm47IH0gIC8vIG1vdmUgZm9jdXMgb25seSBmcm9tIGEgdGFiIGtleVxuXG4gICAgdmFyIGRwaSA9IHRoaXMucGVuZGluZ0RpYWxvZ1N0YWNrWzBdO1xuICAgIHZhciBkaWFsb2cgPSBkcGkuZGlhbG9nO1xuICAgIHZhciBwb3NpdGlvbiA9IGRpYWxvZy5jb21wYXJlRG9jdW1lbnRQb3NpdGlvbihldmVudC50YXJnZXQpO1xuICAgIGlmIChwb3NpdGlvbiAmIE5vZGUuRE9DVU1FTlRfUE9TSVRJT05fUFJFQ0VESU5HKSB7XG4gICAgICBpZiAodGhpcy5mb3J3YXJkVGFiXykgeyAgLy8gZm9yd2FyZFxuICAgICAgICBkcGkuZm9jdXNfKCk7XG4gICAgICB9IGVsc2UgeyAgLy8gYmFja3dhcmRzXG4gICAgICAgIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5mb2N1cygpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBUT0RPOiBGb2N1cyBhZnRlciB0aGUgZGlhbG9nLCBpcyBpZ25vcmVkLlxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcblxuICBkaWFsb2dQb2x5ZmlsbC5EaWFsb2dNYW5hZ2VyLnByb3RvdHlwZS5oYW5kbGVLZXlfID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICB0aGlzLmZvcndhcmRUYWJfID0gdW5kZWZpbmVkO1xuICAgIGlmIChldmVudC5rZXlDb2RlID09PSAyNykge1xuICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgdmFyIGNhbmNlbEV2ZW50ID0gbmV3IHN1cHBvcnRDdXN0b21FdmVudCgnY2FuY2VsJywge1xuICAgICAgICBidWJibGVzOiBmYWxzZSxcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZVxuICAgICAgfSk7XG4gICAgICB2YXIgZHBpID0gdGhpcy5wZW5kaW5nRGlhbG9nU3RhY2tbMF07XG4gICAgICBpZiAoZHBpICYmIGRwaS5kaWFsb2cuZGlzcGF0Y2hFdmVudChjYW5jZWxFdmVudCkpIHtcbiAgICAgICAgZHBpLmRpYWxvZy5jbG9zZSgpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA9PT0gOSkge1xuICAgICAgdGhpcy5mb3J3YXJkVGFiXyA9ICFldmVudC5zaGlmdEtleTtcbiAgICB9XG4gIH07XG5cbiAgLyoqXG4gICAqIEZpbmRzIGFuZCBkb3duZ3JhZGVzIGFueSBrbm93biBtb2RhbCBkaWFsb2dzIHRoYXQgYXJlIG5vIGxvbmdlciBkaXNwbGF5ZWQuIERpYWxvZ3MgdGhhdCBhcmVcbiAgICogcmVtb3ZlZCBhbmQgaW1tZWRpYXRlbHkgcmVhZGRlZCBkb24ndCBzdGF5IG1vZGFsLCB0aGV5IGJlY29tZSBub3JtYWwuXG4gICAqXG4gICAqIEBwYXJhbSB7IUFycmF5PCFIVE1MRGlhbG9nRWxlbWVudD59IHJlbW92ZWQgdGhhdCBoYXZlIGRlZmluaXRlbHkgYmVlbiByZW1vdmVkXG4gICAqL1xuICBkaWFsb2dQb2x5ZmlsbC5EaWFsb2dNYW5hZ2VyLnByb3RvdHlwZS5jaGVja0RPTV8gPSBmdW5jdGlvbihyZW1vdmVkKSB7XG4gICAgLy8gVGhpcyBvcGVyYXRlcyBvbiBhIGNsb25lIGJlY2F1c2UgaXQgbWF5IGNhdXNlIGl0IHRvIGNoYW5nZS4gRWFjaCBjaGFuZ2UgYWxzbyBjYWxsc1xuICAgIC8vIHVwZGF0ZVN0YWNraW5nLCB3aGljaCBvbmx5IGFjdHVhbGx5IG5lZWRzIHRvIGhhcHBlbiBvbmNlLiBCdXQgd2hvIHJlbW92ZXMgbWFueSBtb2RhbCBkaWFsb2dzXG4gICAgLy8gYXQgYSB0aW1lPyFcbiAgICB2YXIgY2xvbmUgPSB0aGlzLnBlbmRpbmdEaWFsb2dTdGFjay5zbGljZSgpO1xuICAgIGNsb25lLmZvckVhY2goZnVuY3Rpb24oZHBpKSB7XG4gICAgICBpZiAocmVtb3ZlZC5pbmRleE9mKGRwaS5kaWFsb2cpICE9PSAtMSkge1xuICAgICAgICBkcGkuZG93bmdyYWRlTW9kYWwoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRwaS5tYXliZUhpZGVNb2RhbCgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuXG4gIC8qKlxuICAgKiBAcGFyYW0geyFkaWFsb2dQb2x5ZmlsbEluZm99IGRwaVxuICAgKiBAcmV0dXJuIHtib29sZWFufSB3aGV0aGVyIHRoZSBkaWFsb2cgd2FzIGFsbG93ZWRcbiAgICovXG4gIGRpYWxvZ1BvbHlmaWxsLkRpYWxvZ01hbmFnZXIucHJvdG90eXBlLnB1c2hEaWFsb2cgPSBmdW5jdGlvbihkcGkpIHtcbiAgICB2YXIgYWxsb3dlZCA9ICh0aGlzLnpJbmRleEhpZ2hfIC0gdGhpcy56SW5kZXhMb3dfKSAvIDIgLSAxO1xuICAgIGlmICh0aGlzLnBlbmRpbmdEaWFsb2dTdGFjay5sZW5ndGggPj0gYWxsb3dlZCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAodGhpcy5wZW5kaW5nRGlhbG9nU3RhY2sudW5zaGlmdChkcGkpID09PSAxKSB7XG4gICAgICB0aGlzLmJsb2NrRG9jdW1lbnQoKTtcbiAgICB9XG4gICAgdGhpcy51cGRhdGVTdGFja2luZygpO1xuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIC8qKlxuICAgKiBAcGFyYW0geyFkaWFsb2dQb2x5ZmlsbEluZm99IGRwaVxuICAgKi9cbiAgZGlhbG9nUG9seWZpbGwuRGlhbG9nTWFuYWdlci5wcm90b3R5cGUucmVtb3ZlRGlhbG9nID0gZnVuY3Rpb24oZHBpKSB7XG4gICAgdmFyIGluZGV4ID0gdGhpcy5wZW5kaW5nRGlhbG9nU3RhY2suaW5kZXhPZihkcGkpO1xuICAgIGlmIChpbmRleCA9PSAtMSkgeyByZXR1cm47IH1cblxuICAgIHRoaXMucGVuZGluZ0RpYWxvZ1N0YWNrLnNwbGljZShpbmRleCwgMSk7XG4gICAgaWYgKHRoaXMucGVuZGluZ0RpYWxvZ1N0YWNrLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhpcy51bmJsb2NrRG9jdW1lbnQoKTtcbiAgICB9XG4gICAgdGhpcy51cGRhdGVTdGFja2luZygpO1xuICB9O1xuXG4gIGRpYWxvZ1BvbHlmaWxsLmRtID0gbmV3IGRpYWxvZ1BvbHlmaWxsLkRpYWxvZ01hbmFnZXIoKTtcblxuICAvKipcbiAgICogR2xvYmFsIGZvcm0gJ2RpYWxvZycgbWV0aG9kIGhhbmRsZXIuIENsb3NlcyBhIGRpYWxvZyBjb3JyZWN0bHkgb24gc3VibWl0XG4gICAqIGFuZCBwb3NzaWJseSBzZXRzIGl0cyByZXR1cm4gdmFsdWUuXG4gICAqL1xuICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdzdWJtaXQnLCBmdW5jdGlvbihldikge1xuICAgIHZhciB0YXJnZXQgPSBldi50YXJnZXQ7XG4gICAgaWYgKCF0YXJnZXQgfHwgIXRhcmdldC5oYXNBdHRyaWJ1dGUoJ21ldGhvZCcpKSB7IHJldHVybjsgfVxuICAgIGlmICh0YXJnZXQuZ2V0QXR0cmlidXRlKCdtZXRob2QnKS50b0xvd2VyQ2FzZSgpICE9PSAnZGlhbG9nJykgeyByZXR1cm47IH1cbiAgICBldi5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgdmFyIGRpYWxvZyA9IGZpbmROZWFyZXN0RGlhbG9nKC8qKiBAdHlwZSB7RWxlbWVudH0gKi8gKGV2LnRhcmdldCkpO1xuICAgIGlmICghZGlhbG9nKSB7IHJldHVybjsgfVxuXG4gICAgLy8gRklYTUU6IFRoZSBvcmlnaW5hbCBldmVudCBkb2Vzbid0IGNvbnRhaW4gdGhlIGVsZW1lbnQgdXNlZCB0byBzdWJtaXQgdGhlXG4gICAgLy8gZm9ybSAoaWYgYW55KS4gTG9vayBpbiBzb21lIHBvc3NpYmxlIHBsYWNlcy5cbiAgICB2YXIgcmV0dXJuVmFsdWU7XG4gICAgdmFyIGNhbmRzID0gW2RvY3VtZW50LmFjdGl2ZUVsZW1lbnQsIGV2LmV4cGxpY2l0T3JpZ2luYWxUYXJnZXRdO1xuICAgIHZhciBlbHMgPSBbJ0JVVFRPTicsICdJTlBVVCddO1xuICAgIGNhbmRzLnNvbWUoZnVuY3Rpb24oY2FuZCkge1xuICAgICAgaWYgKGNhbmQgJiYgY2FuZC5mb3JtID09IGV2LnRhcmdldCAmJiBlbHMuaW5kZXhPZihjYW5kLm5vZGVOYW1lLnRvVXBwZXJDYXNlKCkpICE9IC0xKSB7XG4gICAgICAgIHJldHVyblZhbHVlID0gY2FuZC52YWx1ZTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGlhbG9nLmNsb3NlKHJldHVyblZhbHVlKTtcbiAgfSwgdHJ1ZSk7XG5cbiAgZGlhbG9nUG9seWZpbGxbJ2ZvcmNlUmVnaXN0ZXJEaWFsb2cnXSA9IGRpYWxvZ1BvbHlmaWxsLmZvcmNlUmVnaXN0ZXJEaWFsb2c7XG4gIGRpYWxvZ1BvbHlmaWxsWydyZWdpc3RlckRpYWxvZyddID0gZGlhbG9nUG9seWZpbGwucmVnaXN0ZXJEaWFsb2c7XG5cbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgJ2FtZCcgaW4gZGVmaW5lKSB7XG4gICAgLy8gQU1EIHN1cHBvcnRcbiAgICBkZWZpbmUoZnVuY3Rpb24oKSB7IHJldHVybiBkaWFsb2dQb2x5ZmlsbDsgfSk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIG1vZHVsZVsnZXhwb3J0cyddID09PSAnb2JqZWN0Jykge1xuICAgIC8vIENvbW1vbkpTIHN1cHBvcnRcbiAgICBtb2R1bGVbJ2V4cG9ydHMnXSA9IGRpYWxvZ1BvbHlmaWxsO1xuICB9IGVsc2Uge1xuICAgIC8vIGFsbCBvdGhlcnNcbiAgICB3aW5kb3dbJ2RpYWxvZ1BvbHlmaWxsJ10gPSBkaWFsb2dQb2x5ZmlsbDtcbiAgfVxufSkoKTtcbiIsImltcG9ydCBkaWFsb2dQb2x5ZmlsbCBmcm9tICdkaWFsb2ctcG9seWZpbGwnXG5cbi8vLy8vL1xuLy8gRElBTE9HXG4vLy8vLy9cblxuLy8tIGRpYWxvZyBoYW5kbGluZ1xuLy8tIHdpbmRvdy5jb25maXJtIGlzIHJhaXNpbmcgd2FybmluZ3MgaW4gY2hyb21l4oCmXG5jb25zdCBkaWFsb2cgICAgICA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5qcy1kaWFsb2ctY29uZmlybScpXG5pZiAoIWRpYWxvZy5zaG93TW9kYWwpIHtcbiAgZGlhbG9nUG9seWZpbGwucmVnaXN0ZXJEaWFsb2coZGlhbG9nKVxufVxuY29uc3QgdGl0bGUgICAgICAgPSBkaWFsb2cucXVlcnlTZWxlY3RvcignLmpzLWRpYWxvZy10aXRsZScpXG5jb25zdCBkZXNjcmlwdGlvbiA9IGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuanMtZGlhbG9nLWRlc2NyaXB0aW9uJylcbmxldCBjb25maXJtTGluayAgID0gZGlhbG9nLnF1ZXJ5U2VsZWN0b3IoJy5qcy1kaWFsb2ctY29uZmlybScpXG5jb25zdCBjYW5jZWxCdG4gICA9IGRpYWxvZy5xdWVyeVNlbGVjdG9yKCcuanMtZGlhbG9nLWNhbmNlbCcpXG5jYW5jZWxCdG4uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBfID0+IGRpYWxvZy5jbG9zZSgpIClcbmRpYWxvZy5hZGRFdmVudExpc3RlbmVyKCdjYW5jZWwnLCBfID0+IHJlc2V0RGlhbG9nKCkgKVxuZGlhbG9nLmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgIF8gPT4gcmVzZXREaWFsb2coKSApXG5mdW5jdGlvbiByZXNldERpYWxvZygpIHtcbiAgdGl0bGUudGV4dENvbnRlbnQgICAgICAgPSAnJ1xuICBkZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9ICcnXG4gIGNvbmZpcm1MaW5rLnNldEF0dHJpYnV0ZSgnaHJlZicsICcjJylcbiAgLy8tIGNsb25lIHRvIHJlbW92ZSBhbGwgZXZlbnQgbGlzdGVuZXJzXG4gIGNvbnN0IGNvbmZpcm1MaW5rQ2xvbmUgID0gY29uZmlybUxpbmsuY2xvbmVOb2RlKHRydWUpXG4gIGNvbmZpcm1MaW5rLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKGNvbmZpcm1MaW5rQ2xvbmUsIGNvbmZpcm1MaW5rKVxuICBjb25maXJtTGluayAgICAgICAgICAgICA9IGNvbmZpcm1MaW5rQ2xvbmVcbn1cbmZ1bmN0aW9uIG9wZW5EaWFsb2coIGRhdGFzICkge1xuICB0aXRsZS50ZXh0Q29udGVudCAgICAgICA9IGRhdGFzLnRpdGxlXG4gIGRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gZGF0YXMuZGVzY3JpcHRpb25cbiAgZGlhbG9nLnNob3dNb2RhbCgpXG59XG5cbi8vLy8vL1xuLy8gV0lSRUZSQU1FU1xuLy8vLy8vXG5cbi8vLS0tLS0gZGVsZXRlXG5cbmNvbnN0IGRlbGV0ZUJ1dHRvbnMgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuanMtZGVsZXRlLXdpcmVmcmFtZScpXG5hZGRMaXN0ZW5lcnMoZGVsZXRlQnV0dG9ucywgJ2NsaWNrJywgYXNrV2lyZWZyYW1lRGVsZXRpb24pXG5mdW5jdGlvbiBhc2tXaXJlZnJhbWVEZWxldGlvbihlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKVxuICBjb25zdCBsaW5rICAgICAgICAgICAgICAgID0gZS5jdXJyZW50VGFyZ2V0XG4gIGNvbnN0IHdpcmVmcmFtZU5hbWUgICAgICAgPSBsaW5rLmRhdGFzZXQubmFtZVxuICBjb25maXJtTGluay5zZXRBdHRyaWJ1dGUoICdocmVmJywgbGluay5nZXRBdHRyaWJ1dGUoJ2hyZWYnKSApXG4gIG9wZW5EaWFsb2coIHtcbiAgICB0aXRsZTogICAgICAgICdEZWxldGUgdGVtcGxhdGUnLFxuICAgIGRlc2NyaXB0aW9uOiAgYGFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgJHt3aXJlZnJhbWVOYW1lfT9gLFxuICB9IClcbn1cblxuLy8tLS0tLSBoYW5kbGUgbm90aWZpY2F0aW9uc1xuXG5jb25zdCBub3RpZmljYXRpb24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjbm90aWZpY2F0aW9uJylcbmlmIChub3RpZmljYXRpb24pIHtcbiAgd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgIG5vdGlmaWNhdGlvbi5jbGFzc0xpc3QucmVtb3ZlKCdtZGwtc25hY2tiYXItLWFjdGl2ZScpXG4gIH0sIDI3MDApXG59XG5cbi8vLy8vL1xuLy8gVVNFUlNcbi8vLy8vL1xuXG4vLy0tLS0tIFJFU0VUXG5cbmNvbnN0IHJlc2V0VXNlcnMgID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnZm9ybS5qcy1yZXNldC11c2VyJylcbmFkZExpc3RlbmVycyhyZXNldFVzZXJzLCAnc3VibWl0JywgYXNrVXNlclJlc2V0KVxuZnVuY3Rpb24gYXNrVXNlclJlc2V0KGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gIGNvbnN0IGZvcm0gICAgICA9IGUuY3VycmVudFRhcmdldFxuICBjb25zdCB1c2VyTmFtZSAgPSBmb3JtLmRhdGFzZXQubmFtZVxuICBjb25maXJtTGluay5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uIChlKSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gICAgZm9ybS5zdWJtaXQoKVxuICB9KVxuICBvcGVuRGlhbG9nKCB7XG4gICAgdGl0bGU6ICAgICAgICAnUmVzZXQnLFxuICAgIGRlc2NyaXB0aW9uOiAgYGFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byByZXNldCAke3VzZXJOYW1lfSBwYXNzd29yZD9gLFxuICB9IClcbn1cblxuLy8tLS0tLSBBQ1RJVkFURVxuXG5jb25zdCBhY3RpdmF0ZVVzZXJzICA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5qcy11c2VyLWFjdGl2YXRlJylcbmFkZExpc3RlbmVycyhhY3RpdmF0ZVVzZXJzLCAnY2xpY2snLCBhc2tVc2VyQWN0aXZhdGlvbilcbmZ1bmN0aW9uIGFza1VzZXJBY3RpdmF0aW9uKGUpIHtcbiAgZS5wcmV2ZW50RGVmYXVsdCgpXG4gIGNvbnN0IGxpbmsgICAgICA9IGUuY3VycmVudFRhcmdldCAgXG4gIGNvbnN0IHVzZXJOYW1lICA9IGxpbmsuZGF0YXNldC5uYW1lXG4gIGNvbmZpcm1MaW5rLnNldEF0dHJpYnV0ZSggJ2hyZWYnLCBsaW5rLmdldEF0dHJpYnV0ZSgnaHJlZicpIClcbiAgb3BlbkRpYWxvZygge1xuICAgIHRpdGxlOiAgICAgICAgJ0FjdGl2YXRlJyxcbiAgICBkZXNjcmlwdGlvbjogIGBhcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gYWN0aXZhdGUgJHt1c2VyTmFtZX0/YCxcbiAgfSApXG59XG5cbi8vLS0tLS0gREVBQ1RJVkFURVxuXG5jb25zdCBkZWFjdGl2YXRlVXNlcnMgID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmpzLXVzZXItZGVhY3RpdmF0ZScpXG5hZGRMaXN0ZW5lcnMoZGVhY3RpdmF0ZVVzZXJzLCAnY2xpY2snLCBhc2tVc2VyRGVhY3RpdmF0aW9uKVxuZnVuY3Rpb24gYXNrVXNlckRlYWN0aXZhdGlvbihlKSB7XG4gIGUucHJldmVudERlZmF1bHQoKVxuICBjb25zdCBsaW5rICAgICAgPSBlLmN1cnJlbnRUYXJnZXRcbiAgY29uc3QgdXNlck5hbWUgID0gbGluay5kYXRhc2V0Lm5hbWUgIFxuICBjb25maXJtTGluay5zZXRBdHRyaWJ1dGUoICdocmVmJywgbGluay5nZXRBdHRyaWJ1dGUoJ2hyZWYnKSApXG4gIG9wZW5EaWFsb2coIHtcbiAgICB0aXRsZTogICAgICAgICdEZWFjdGl2YXRlJyxcbiAgICBkZXNjcmlwdGlvbjogIGBhcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVhY3RpdmF0ZSAke3VzZXJOYW1lfT9gLFxuICB9IClcbn1cblxuLy8vLy8vXG4vLyBVVElMU1xuLy8vLy8vXG5cbmZ1bmN0aW9uIGFkZExpc3RlbmVycyggZWxlbXMsIGV2ZW50TmFtZSwgY2FsbGJhY2sgKSB7XG4gIGlmICghZWxlbXMubGVuZ3RoKSByZXR1cm5cbiAgO1suLi5lbGVtc10uZm9yRWFjaCggZWxlbSA9PiBlbGVtLmFkZEV2ZW50TGlzdGVuZXIoIGV2ZW50TmFtZSwgY2FsbGJhY2spIClcbn1cblxuZnVuY3Rpb24gZ2V0UGFyZW50KCBlbGVtLCBzZWxlY3RvciApIHtcbiAgdmFyIHBhcmVudCA9IGZhbHNlXG4gIGZvciAoIDsgZWxlbSAmJiBlbGVtICE9PSBkb2N1bWVudDsgZWxlbSA9IGVsZW0ucGFyZW50Tm9kZSApIHtcbiAgICBpZiAoIGVsZW0ubWF0Y2hlcyggc2VsZWN0b3IgKSApIHtcbiAgICAgIHBhcmVudCA9IGVsZW1cbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiBwYXJlbnRcbn0iXX0=
