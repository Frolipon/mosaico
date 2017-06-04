!function e(t,o,i){function n(r,l){if(!o[r]){if(!t[r]){var s="function"==typeof require&&require;if(!l&&s)return s(r,!0);if(a)return a(r,!0);var d=new Error("Cannot find module '"+r+"'");throw d.code="MODULE_NOT_FOUND",d}var c=o[r]={exports:{}};t[r][0].call(c.exports,function(e){var o=t[r][1][e];return n(o?o:e)},c,c.exports,e,t,o,i)}return o[r].exports}for(var a="function"==typeof require&&require,r=0;r<i.length;r++)n(i[r]);return n}({1:[function(e,t,o){!function(){function e(e){for(;e&&e!==document.body;){var t=window.getComputedStyle(e),o=function(e,o){return!(void 0===t[e]||t[e]===o)};if(t.opacity<1||o("zIndex","auto")||o("transform","none")||o("mixBlendMode","normal")||o("filter","none")||o("perspective","none")||"isolate"===t.isolation||"fixed"===t.position||"touch"===t.webkitOverflowScrolling)return!0;e=e.parentElement}return!1}function o(e){for(;e;){if("dialog"===e.localName)return e;e=e.parentElement}return null}function i(e){e&&e.blur&&e!=document.body&&e.blur()}function n(e,t){for(var o=0;o<e.length;++o)if(e[o]==t)return!0;return!1}function a(e){if(this.dialog_=e,this.replacedStyleTop_=!1,this.openAsModal_=!1,e.hasAttribute("role")||e.setAttribute("role","dialog"),e.show=this.show.bind(this),e.showModal=this.showModal.bind(this),e.close=this.close.bind(this),"returnValue"in e||(e.returnValue=""),"MutationObserver"in window){new MutationObserver(this.maybeHideModal.bind(this)).observe(e,{attributes:!0,attributeFilter:["open"]})}else{var t,o=!1,i=function(){o?this.downgradeModal():this.maybeHideModal(),o=!1}.bind(this),n=function(e){var n="DOMNodeRemoved";o|=e.type.substr(0,n.length)===n,window.clearTimeout(t),t=window.setTimeout(i,0)};["DOMAttrModified","DOMNodeRemoved","DOMNodeRemovedFromDocument"].forEach(function(t){e.addEventListener(t,n)})}Object.defineProperty(e,"open",{set:this.setOpen.bind(this),get:e.hasAttribute.bind(e,"open")}),this.backdrop_=document.createElement("div"),this.backdrop_.className="backdrop",this.backdrop_.addEventListener("click",this.backdropClick_.bind(this))}var r=window.CustomEvent;r&&"object"!=typeof r||(r=function(e,t){t=t||{};var o=document.createEvent("CustomEvent");return o.initCustomEvent(e,!!t.bubbles,!!t.cancelable,t.detail||null),o},r.prototype=window.Event.prototype),a.prototype={get dialog(){return this.dialog_},maybeHideModal:function(){this.dialog_.hasAttribute("open")&&document.body.contains(this.dialog_)||this.downgradeModal()},downgradeModal:function(){this.openAsModal_&&(this.openAsModal_=!1,this.dialog_.style.zIndex="",this.replacedStyleTop_&&(this.dialog_.style.top="",this.replacedStyleTop_=!1),this.backdrop_.parentNode&&this.backdrop_.parentNode.removeChild(this.backdrop_),l.dm.removeDialog(this))},setOpen:function(e){e?this.dialog_.hasAttribute("open")||this.dialog_.setAttribute("open",""):(this.dialog_.removeAttribute("open"),this.maybeHideModal())},backdropClick_:function(e){if(this.dialog_.hasAttribute("tabindex"))this.dialog_.focus();else{var t=document.createElement("div");this.dialog_.insertBefore(t,this.dialog_.firstChild),t.tabIndex=-1,t.focus(),this.dialog_.removeChild(t)}var o=document.createEvent("MouseEvents");o.initMouseEvent(e.type,e.bubbles,e.cancelable,window,e.detail,e.screenX,e.screenY,e.clientX,e.clientY,e.ctrlKey,e.altKey,e.shiftKey,e.metaKey,e.button,e.relatedTarget),this.dialog_.dispatchEvent(o),e.stopPropagation()},focus_:function(){var e=this.dialog_.querySelector("[autofocus]:not([disabled])");if(!e&&this.dialog_.tabIndex>=0&&(e=this.dialog_),!e){var t=["button","input","keygen","select","textarea"],o=t.map(function(e){return e+":not([disabled])"});o.push('[tabindex]:not([disabled]):not([tabindex=""])'),e=this.dialog_.querySelector(o.join(", "))}i(document.activeElement),e&&e.focus()},updateZIndex:function(e,t){if(e<t)throw new Error("dialogZ should never be < backdropZ");this.dialog_.style.zIndex=e,this.backdrop_.style.zIndex=t},show:function(){this.dialog_.open||(this.setOpen(!0),this.focus_())},showModal:function(){if(this.dialog_.hasAttribute("open"))throw new Error("Failed to execute 'showModal' on dialog: The element is already open, and therefore cannot be opened modally.");if(!document.body.contains(this.dialog_))throw new Error("Failed to execute 'showModal' on dialog: The element is not in a Document.");if(!l.dm.pushDialog(this))throw new Error("Failed to execute 'showModal' on dialog: There are too many open modal dialogs.");e(this.dialog_.parentElement)&&console.warn("A dialog is being shown inside a stacking context. This may cause it to be unusable. For more information, see this link: https://github.com/GoogleChrome/dialog-polyfill/#stacking-context"),this.setOpen(!0),this.openAsModal_=!0,l.needsCentering(this.dialog_)?(l.reposition(this.dialog_),this.replacedStyleTop_=!0):this.replacedStyleTop_=!1,this.dialog_.parentNode.insertBefore(this.backdrop_,this.dialog_.nextSibling),this.focus_()},close:function(e){if(!this.dialog_.hasAttribute("open"))throw new Error("Failed to execute 'close' on dialog: The element does not have an 'open' attribute, and therefore cannot be closed.");this.setOpen(!1),void 0!==e&&(this.dialog_.returnValue=e);var t=new r("close",{bubbles:!1,cancelable:!1});this.dialog_.dispatchEvent(t)}};var l={};l.reposition=function(e){var t=document.body.scrollTop||document.documentElement.scrollTop,o=t+(window.innerHeight-e.offsetHeight)/2;e.style.top=Math.max(t,o)+"px"},l.isInlinePositionSetByStylesheet=function(e){for(var t=0;t<document.styleSheets.length;++t){var o=document.styleSheets[t],i=null;try{i=o.cssRules}catch(e){}if(i)for(var a=0;a<i.length;++a){var r=i[a],l=null;try{l=document.querySelectorAll(r.selectorText)}catch(e){}if(l&&n(l,e)){var s=r.style.getPropertyValue("top"),d=r.style.getPropertyValue("bottom");if(s&&"auto"!=s||d&&"auto"!=d)return!0}}}return!1},l.needsCentering=function(e){return!("absolute"!=window.getComputedStyle(e).position||"auto"!=e.style.top&&""!=e.style.top||"auto"!=e.style.bottom&&""!=e.style.bottom||l.isInlinePositionSetByStylesheet(e))},l.forceRegisterDialog=function(e){if(e.showModal&&console.warn("This browser already supports <dialog>, the polyfill may not work correctly",e),"dialog"!==e.localName)throw new Error("Failed to register dialog: The element is not a dialog.");new a(e)},l.registerDialog=function(e){e.showModal||l.forceRegisterDialog(e)},l.DialogManager=function(){this.pendingDialogStack=[];var e=this.checkDOM_.bind(this);this.overlay=document.createElement("div"),this.overlay.className="_dialog_overlay",this.overlay.addEventListener("click",function(t){this.forwardTab_=void 0,t.stopPropagation(),e([])}.bind(this)),this.handleKey_=this.handleKey_.bind(this),this.handleFocus_=this.handleFocus_.bind(this),this.zIndexLow_=1e5,this.zIndexHigh_=100150,this.forwardTab_=void 0,"MutationObserver"in window&&(this.mo_=new MutationObserver(function(t){var o=[];t.forEach(function(e){for(var t,i=0;t=e.removedNodes[i];++i)if(t instanceof Element)if("dialog"===t.localName)o.push(t);else{var n=t.querySelector("dialog");n&&o.push(n)}}),o.length&&e(o)}))},l.DialogManager.prototype.blockDocument=function(){document.documentElement.addEventListener("focus",this.handleFocus_,!0),document.addEventListener("keydown",this.handleKey_),this.mo_&&this.mo_.observe(document,{childList:!0,subtree:!0})},l.DialogManager.prototype.unblockDocument=function(){document.documentElement.removeEventListener("focus",this.handleFocus_,!0),document.removeEventListener("keydown",this.handleKey_),this.mo_&&this.mo_.disconnect()},l.DialogManager.prototype.updateStacking=function(){for(var e,t=this.zIndexHigh_,o=0;e=this.pendingDialogStack[o];++o)e.updateZIndex(--t,--t),0===o&&(this.overlay.style.zIndex=--t);var i=this.pendingDialogStack[0];if(i){(i.dialog.parentNode||document.body).appendChild(this.overlay)}else this.overlay.parentNode&&this.overlay.parentNode.removeChild(this.overlay)},l.DialogManager.prototype.containedByTopDialog_=function(e){for(;e=o(e);){for(var t,i=0;t=this.pendingDialogStack[i];++i)if(t.dialog===e)return 0===i;e=e.parentElement}return!1},l.DialogManager.prototype.handleFocus_=function(e){if(!this.containedByTopDialog_(e.target)&&(e.preventDefault(),e.stopPropagation(),i(e.target),void 0!==this.forwardTab_)){var t=this.pendingDialogStack[0];return t.dialog.compareDocumentPosition(e.target)&Node.DOCUMENT_POSITION_PRECEDING&&(this.forwardTab_?t.focus_():document.documentElement.focus()),!1}},l.DialogManager.prototype.handleKey_=function(e){if(this.forwardTab_=void 0,27===e.keyCode){e.preventDefault(),e.stopPropagation();var t=new r("cancel",{bubbles:!1,cancelable:!0}),o=this.pendingDialogStack[0];o&&o.dialog.dispatchEvent(t)&&o.dialog.close()}else 9===e.keyCode&&(this.forwardTab_=!e.shiftKey)},l.DialogManager.prototype.checkDOM_=function(e){this.pendingDialogStack.slice().forEach(function(t){e.indexOf(t.dialog)!==-1?t.downgradeModal():t.maybeHideModal()})},l.DialogManager.prototype.pushDialog=function(e){var t=(this.zIndexHigh_-this.zIndexLow_)/2-1;return!(this.pendingDialogStack.length>=t)&&(1===this.pendingDialogStack.unshift(e)&&this.blockDocument(),this.updateStacking(),!0)},l.DialogManager.prototype.removeDialog=function(e){var t=this.pendingDialogStack.indexOf(e);t!=-1&&(this.pendingDialogStack.splice(t,1),0===this.pendingDialogStack.length&&this.unblockDocument(),this.updateStacking())},l.dm=new l.DialogManager,document.addEventListener("submit",function(e){var t=e.target;if(t&&t.hasAttribute("method")&&"dialog"===t.getAttribute("method").toLowerCase()){e.preventDefault();var i=o(e.target);if(i){var n,a=["BUTTON","INPUT"];[document.activeElement,e.explicitOriginalTarget].some(function(t){if(t&&t.form==e.target&&a.indexOf(t.nodeName.toUpperCase())!=-1)return n=t.value,!0}),i.close(n)}}},!0),l.forceRegisterDialog=l.forceRegisterDialog,l.registerDialog=l.registerDialog,"function"==typeof define&&"amd"in define?define(function(){return l}):"object"==typeof t&&"object"==typeof t.exports?t.exports=l:window.dialogPolyfill=l}()},{}],2:[function(e,t,o){"use strict";function i(e){if(Array.isArray(e)){for(var t=0,o=Array(e.length);t<e.length;t++)o[t]=e[t];return o}return Array.from(e)}function n(){g.textContent="",p.textContent="",m.setAttribute("href","#");var e=m.cloneNode(!0);m.parentNode.replaceChild(e,m),m=e}function a(e){g.textContent=e.title,p.textContent=e.description,f.showModal()}function r(e){e.preventDefault();var t=e.currentTarget,o=t.dataset.name;m.setAttribute("href",t.getAttribute("href")),a({title:"Delete template",description:"are you sure you want to delete "+o+"?"})}function l(e){e.preventDefault();var t=e.currentTarget,o=t.dataset.name;m.addEventListener("click",function(e){e.preventDefault(),t.submit()}),a({title:"Reset",description:"are you sure you want to reset "+o+" password?"})}function s(e){e.preventDefault();var t=e.currentTarget,o=t.dataset.name;m.setAttribute("href",t.getAttribute("href")),a({title:"Activate",description:"are you sure you want to activate "+o+"?"})}function d(e){e.preventDefault();var t=e.currentTarget,o=t.dataset.name;m.setAttribute("href",t.getAttribute("href")),a({title:"Deactivate",description:"are you sure you want to deactivate "+o+"?"})}function c(e,t,o){e.length&&[].concat(i(e)).forEach(function(e){return e.addEventListener(t,o)})}var u=e("dialog-polyfill"),h=function(e){return e&&e.__esModule?e:{default:e}}(u),f=document.querySelector(".js-dialog-confirm");f.showModal||h.default.registerDialog(f);var g=f.querySelector(".js-dialog-title"),p=f.querySelector(".js-dialog-description"),m=f.querySelector(".js-dialog-confirm");f.querySelector(".js-dialog-cancel").addEventListener("click",function(e){return f.close()}),f.addEventListener("cancel",function(e){return n()}),f.addEventListener("close",function(e){return n()}),c(document.querySelectorAll(".js-delete-wireframe"),"click",r);var v=document.querySelector("#notification");v&&window.setTimeout(function(){v.classList.remove("mdl-snackbar--active")},2700),c(document.querySelectorAll("form.js-reset-user"),"submit",l),c(document.querySelectorAll(".js-user-activate"),"click",s),c(document.querySelectorAll(".js-user-deactivate"),"click",d)},{"dialog-polyfill":1}]},{},[2]);