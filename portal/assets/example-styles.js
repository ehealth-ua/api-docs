/*
 * P12 — persistent attribute "Example" display.
 *
 * Stock Scalar shows a schema property's example only in a hover/focus popup
 * (`.property-example` > label button + `.property-example-value-list` popup of
 * `button.property-example-value`, copy-on-click). This file re-skins that SAME
 * DOM with CSS so a plain field's example stays visible in its row as a pill:
 *
 *   id  string  required  [ 90a9e15b-b71b-4caf-8f2e-ff247e8a5600 ]
 *
 * - The original value button is kept: click = copy, Tab-focusable, a copy icon
 *   overlays the end of the pill on hover / keyboard focus.
 * - The pill shows the whole value when the row has room; otherwise it ellipsizes
 *   at the row end (full text in the native tooltip). The "Example" label is hidden.
 * - Examples whose value is an object/array (big JSON such as `encounter`) are NOT
 *   restyled: they keep the stock popup. Marked by a one-line MutationObserver that
 *   sets [data-p12-big] on `.property-example` whose value starts with { or [.
 * - Colours are Scalar variables only (--scalar-background-2 / border / color-1 /
 *   radius), i.e. exactly the stock popup chip, light and dark.
 *
 * Depends on Scalar's class names (property-heading, property-example,
 * property-example-value-list, property-example-value) — see SCALAR_PATCHES.md P12.
 */
(function () {
  var H = '.property-heading > .property-example:not([data-p12-big])';
  var V = H + ' .property-example-value-list';
  var B = V + ' > .property-example-value';
  var css = [
    H + '{position:static;min-width:0;max-width:100%;margin-right:0;display:inline-flex;flex-direction:row;align-items:center;gap:4px;overflow:hidden}',
    H + ':hover::before{display:none}',
    H + ' > button:first-child{display:none}', // the "Example" label
    V + '{display:flex;flex-direction:row;flex-wrap:wrap;row-gap:2px;position:static;transform:none;box-shadow:none;border:0;background:transparent;padding:0;min-width:0;max-width:100%;overflow:visible;z-index:auto;gap:4px}',
    B + '{position:relative;flex:0 0 auto;width:auto;min-width:0;max-width:100%;background:var(--scalar-background-2);border:var(--scalar-border-width) solid var(--scalar-border-color);border-radius:999px;padding:0 8px;gap:4px;line-height:1.7;font-size:var(--scalar-micro);text-align:left;cursor:copy;color:var(--scalar-color-1)}',
    B + ' > span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    V + ' > .property-example-value:not(:only-child){max-width:16ch}', // several examples: each is shortened
    // copy icon overlays the end of the pill on hover/focus instead of reserving blank space after the text
    B + ' > svg{position:absolute;right:2px;top:50%;margin-top:-7px;box-sizing:content-box;padding:2px;width:11px;height:11px;border-radius:3px;background:inherit;opacity:0;pointer-events:none;transition:opacity .12s}',
    B + ':hover > svg,' + B + ':focus-visible > svg{opacity:1}',
    B + ':focus-visible{outline:2px solid var(--scalar-color-accent,currentColor);outline-offset:1px}'
  ].join('\n');

  var el = document.createElement('style');
  el.id = 'ehealth-example-styles';
  el.textContent = css;
  document.head.appendChild(el);

  // Mark object/array-valued examples so the CSS leaves their stock popup alone.
  function markOne(e) {
    if (e.hasAttribute('data-p12-chk')) return;
    var v = e.querySelector('.property-example-value > span');
    if (!v) return; // popup list not rendered yet: look again on the next mutation
    e.setAttribute('data-p12-chk', '');
    if (/^\s*[\[{]/.test(v.textContent)) e.setAttribute('data-p12-big', '');
  }
  function mark(root) {
    if (!root.querySelectorAll) return;
    var up = root.closest && root.closest('.property-example');
    if (up) markOne(up);
    if (root.matches && root.matches('.property-example')) markOne(root);
    var list = root.querySelectorAll('.property-example:not([data-p12-chk])');
    for (var i = 0; i < list.length; i++) markOne(list[i]);
  }
  if (window.MutationObserver) {
    // synchronous (microtask) so a big example never paints as a pill first
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) if (added[j].nodeType === 1) mark(added[j]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Truncated values: expose the full text as a native tooltip (lazy, on first hover/focus).
  function tip(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var b = t.closest('.property-example-value');
    if (b && !b.title && b.firstElementChild) b.title = b.firstElementChild.textContent;
  }
  document.addEventListener('mouseover', tip);
  document.addEventListener('focusin', tip);
})();
