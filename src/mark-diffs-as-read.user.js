// ==UserScript==
// @name           Phabricator: Mark Diffs as Read
// @version        0.4.2
// @description    Adds a "Mark as Read" toggle to diffs in Phabricator
// @match          https://secure.phabricator.com/*
// @match          https://phabricator.fb.com/*
// ==/UserScript==

function injectJS(callback) {
  var script = document.createElement('script');
  script.textContent = '(' + callback.toString() + ')(window);';
  document.body.appendChild(script);
}

function injectStyles(styles) {
  var style = document.createElement('style');
  style.innerHTML = styles;
  document.body.appendChild(style);
}

// Courtesy of BootstrapCDN.
// injectCSS('//netdna.bootstrapcdn.com/twitter-bootstrap/2.3.0/css/bootstrap-combined.min.css');
var spriteURL = '//netdna.bootstrapcdn.com/twitter-bootstrap/2.3.0/img/glyphicons-halflings.png';

injectStyles(
  '.glyph {' +
    'display: inline-block;' +
    'width: 14px;' +
    'height: 14px;' +
    '*margin-right: .3em;' +
    'line-height: 14px;' +
    'vertical-align: text-top;' +
    'background-image: url("' + spriteURL + '");' +
    'background-position: 14px 14px;' +
    'background-repeat: no-repeat;' +
    'margin-top: 1px;' +
  '}' +
  '.glyph.glyph-eye-close {' +
    'background-position: -120px -120px;' +
  '}' +
  '.glyph.glyph-eye-open {' +
    'background-position: -96px -120px;' +
  '}' +
  '.glyph.glyph-gray {' +
    'opacity: 0.5;' +
  '}'
);

injectStyles(
  '.hidden-row {' +
    'display: none;' +
  '}' +
  '.phui-object-item-icon-label .glyph.hide-icon {' +
    'border: 1px solid transparent;' +
    'cursor: pointer;' +
    'margin: -2px 0 0 4px;' +
    'vertical-align: text-top;' +
  '}' +
  '.hide-control {' +
    'color: #74777D;' +
    'line-height: 25px;' +
    'position: absolute;' +
    'right: 33px;' +
  '}' +
  '.hide-control input {' +
    'display: inline-block;' +
    'width: auto;' +
  '}' +
  '.show-hidden-rows .hidden-row {' +
    'display: block;' +
    'opacity: 0.5;' +
  '}' +
  '.show-hidden-rows .hide-icon {' +
    'visibility: visible;' +
  '}' +
  '.all-hidden-view {' +
    'border: 1px solid #c7ccd9;' +
    'border-bottom: 1px solid #a1a6b0;' +
    'background-color: #fff;' +
    'color: #6b748c;' +
    'margin: 4px 0 8px 0;' +
  '}' +
  '.all-hidden-view-body {' +
    'color: #6b748c;' +
    'padding: 12px;' +
  '}' +
  '.show-hidden-rows .all-hidden {' +
    'display: none;' +
  '}'
);

injectJS(function(global) {
  var uniqueIDCounter = 0;

  /* UTILITIES */
  function $(selector, start) {
    return (start || document).querySelector(selector);
  }

  function $$(selector, start) {
    return toArray((start || document).querySelectorAll(selector));
  }

  /* JX replacement helpers */
  // JX.$A replacement
  function toArray(arrayLike, index) {
    index = index || 0;
    return Array.prototype.slice(arrayLike, index);
  }

  function isObject(item) {
    return Object.prototype.toString.call(item) === '[object Object]';
  }

  // very basic sigil-like support
  function addSigil(node, sigil) {
    node.dataset[sigil] = true;
  }

  function hasSigil(node, sigil) {
    return !!node.dataset[sigil];
  }

  function removeSigil(node, sigil) {
    delete node.dataset[sigil];
  }

  // very basic meta data support
  function addMeta(node, meta, value) {
    node.dataset['meta_' + meta] = value;
  }

  function getMeta(node, meta) {
    return node.dataset['meta_' + meta];
  }

  function removeMeta(node, meta) {
    delete node.dataset['meta_' + meta];
  }

  function toggleClass(node, className, addRemove) {
    var classList = node.classList;
    classList.toggle(className, addRemove);
  }

  // JX.$N replacement (approximation)
  function createNode(tag, attributes, content) {
    if (!content && !isObject(attributes)) {
      content = attributes;
      attributes = null;
    }

    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(attr => {
      if (attr === 'sigil') {
        addSigil(node, attributes.sigil);
      } else if (attr === 'meta') {
        Object.key(attributes.meta).forEach(key => addMeta(node, key, attributes.meta[key]));
      } else {
        node.setAttribute(attr, attributes[attr]);
      }
    });

    if (!Array.isArray(content)) {
      content = [content];
    }

    content.forEach(el => {
      // if it is an HTML string, i.e. '<p>test</p>'
      if (
        typeof el === 'string' &&
        el.trim().startsWith('<') &&
        el.trim().endsWith('>')
      ) {
        node.insertAdjacentHTML('beforeend', el);
      }
      else if (typeof el === 'string') {
        node.insertAdjacentText('beforeend', el);
      }
      else if (el instanceof HTMLElement) {
        node.insertAdjacentElement('beforeend', el);
      }
    });

    return node;
  }

  function prependContent(node, content, reference) {
    reference = reference || node.firstChild;
    node.insertBefore(content, firstChild);
  }

  function replaceContent(node, replacement) {
    var parent = node.parentNode;
    var ref = node.nextSibling;
    parent.removeChild(node);
    if (ref) {
      prependContent(parent, replacement, ref);
    } else {
      parent.appendChild(replacement);
    }
  }


  function uniqueID(node) {
    if (!node.id) {
      node.id = 'uniqueID_' + ++uniqueIDCounter;
    }
    return node.id;
  }


  var ScriptStorage = global.ScriptStorage = {
    subscribe: function(key, callback) {
      var handleStorageChange = function(event) {
        if (event.key === key) {
          callback(event);
        }
      };
      window.addEventListener('storage', handleStorageChange, false);
      return {
        unsubscribe: function() {
          if (handleStorageChange) {
            window.removeEventListener('storage', handleStorageChange, false);
            handleStorageChange = null;
          }
        }
      };
    },
    get: function(key) {
      var item;
      try {
        item = JSON.parse(localStorage.getItem(key));
      } catch (e) {}
      return item && typeof item === 'object' ? item : {};
    },
    set: function(key, item) {
      localStorage.setItem(key, JSON.stringify(item));
    }
  };

  /* INIT */

  (function() {
    var submitControls = $(
      '.aphront-list-filter-view .aphront-list-filter-reveal'
    );
    if (submitControls) {
      var div = createNode('div', {className: 'hide-control'}, [
        createNode('label', {htmlFor: uniqueID(checkbox)}, 'Show Read Diffs '),
        createNode('input', {type: 'checkbox', sigil: 'toggle-hide'})
      ]);
      prependContent(submitControls, div);
    }
  })();

  function flushStorageToView() {
    var hiddenDiffs = ScriptStorage.get('hiddendiffs');

    /**
     * List View
     */
    $$('.phui-object-item-list-view').forEach(function(listView) {
      var rows = listView.getElementsByTagName('li');
      rows = toArray(rows);

      var hasRows = false;
      var isEmpty = true;

      rows.filter(function(row) {
        return row.parentNode === listView;
      }).forEach(function(row, index) {
        var diffIDNode = $$('.phui-object-item-objname', row)[0];
        //var timeNode = JX.DOM.scry(row, 'span', 'time-label')[0];
        var timeNode = findNodes(row, 'span', 'time-label')[0];

        if (!timeNode) {
          var labelNodes = $$('.phui-object-item-icon-label', row);
          if (labelNodes.length) {
            timeNode = labelNodes[labelNodes.length - 2];
            addSigil(timeNode, 'time-label');
          }
        }

        if (!timeNode || !diffIDNode) {
          return;
        }

        var cellID = diffIDNode.textContent;
        var timeString = timeNode.textContent;
        var isHidden =
          hiddenDiffs[cellID] && hiddenDiffs[cellID] === timeString;

        if (!isHidden) {
          isEmpty = false;
        }
        hasRows = true;

        var hideLinkNode = createNode('i', {
          className: 'hide-icon glyph glyph-gray ' + (
            isHidden ? 'glyph-eye-close' : 'glyph-eye-open'
          )
        });
        addSigil(hideLinkNode, 'hide-link');
        addMeta(hideLinkNode, 'isHidden', isHidden);
        addMeta(hideLinkNode, 'cellID', cellID);
        addMeta(hideLinkNode, 'time', timeString);

        var labelContainerNode = timeNode.parentNode;
        var prevLink = findNodes(labelContainerNode, 'i', 'hide-link')[0];
        if (prevLink) {
          replace(prevLink, hideLinkNode);
        } else {
          var hideLabelNode = createNode(
            'span',
            {className: 'phui-object-item-icon-label'},
            hideLinkNode
          );
          labelContainerNode.appendChild(hideLabelNode);
        }
        toggleClass(row, 'hidden-row', isHidden);
      });

      var emptyNode = $$('.all-hidden', listView)[0];
      if (isEmpty && hasRows) {
        if (!emptyNode) {
          // TODO: gillesruppert continue
          emptyNode = createNode('li', {
            className: 'all-hidden phabricatordefault-li'
          }, [
            createNode('div', {
                className: 'all-hidden-view phabricatordefault-div'
              },
              createNode('div', {
                className: 'all-hidden-view-body phabricatordefault-div'
              }, [
                'All revisions are marked as ',
                createNode('i', {
                  className: 'hide-icon glyph glyph-gray glyph-eye-close'
                }),
                ' read.'
              ])
            )
          ]);
        }
        listView.appendChild(emptyNode);
      } else {
        if (emptyNode) {
          emptyNode.remove();
        }
      }
    });

    /**
     * Diff View
     */
    $$('.phui-header-subheader').forEach(function(headerNode) {
      var diffIDNode = $$('.phabricator-last-crumb .phabricator-crumb-name')[0];
      var timeContainerNodes = $$('.phui-timeline-view .phui-timeline-extra');
      var timeContainerNode = timeContainerNodes[timeContainerNodes.length - 1];
      var timeNode = timeContainerNode.lastChild;

      if (!timeNode || !diffIDNode) {
        return;
      }

      var cellID = diffIDNode.textContent;
      var timeString = timeNode.textContent;
      var isHidden =
        hiddenDiffs[cellID] && hiddenDiffs[cellID] === timeString;

      var hideLinkNode =
        createNode('a', {
          className: 'mll policy-link phabricatordefault-a',
          sigil: 'hide-link',
          meta: {
            isHidden: isHidden,
            cellID: cellID,
            time: timeString
          }
        }, [
          createNode('i', {
            className:
              'msr hide-icon glyph glyph-gray ' + (
                isHidden ? 'glyph-eye-close' : 'glyph-eye-open'
              )
          }),
          isHidden ? 'Read' : 'Unread'
        ]);

      var prevLink = findNodes(headerNode, 'a', 'hide-link')[0];
      if (prevLink) {
        replace(prevLink, hideLinkNode);
      } else {
        headerNode.appendChild(hideLinkNode);
      }
    });
  }

  // TODO: gillesruppert implement this logic with DOM methods
  JX.Stratcom.listen('mousedown', 'hide-link', function(event) {
    var hideLink = event.getNodeData('hide-link');
    var cellID = hideLink.cellID;
    var updatedTime = hideLink.time;

    var hiddenDiffs = ScriptStorage.get('hiddendiffs');

    if (hiddenDiffs[cellID] && hiddenDiffs[cellID] === updatedTime) {
      delete hiddenDiffs[cellID];
    } else {
      hiddenDiffs[cellID] = updatedTime;
    }

    ScriptStorage.set('hiddendiffs', hiddenDiffs);
    flushStorageToView();

    event.prevent();
  });

  JX.Stratcom.listen('change', 'toggle-hide', function(event) {
    var checkbox = event.getNode('toggle-hide');
    JX.DOM.alterClass(document.body, 'show-hidden-rows', checkbox.checked);
  });

  if (window.JX && JX.Tooltip) {
    JX.Stratcom.listen(
      ['mouseover', 'mouseout', 'mousedown'],
      'hide-link',
      function(event) {
        if (event.getType() === 'mouseover') {
          var isHidden = event.getNodeData('hide-link').isHidden;
          JX.Tooltip.show(
            event.getNode('hide-link'),
            1000,
            'W',
             isHidden ? 'Mark as Unread' : 'Mark as Read'
          );
        } else {
          JX.Tooltip.hide();
        }
      }
    );
  }

  flushStorageToView();

  ScriptStorage.subscribe('hiddendiffs', flushStorageToView);
});
