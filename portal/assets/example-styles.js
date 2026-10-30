/*
 * P12 — persistent attribute "Example" display (trial styles).
 *
 * Stock Scalar shows a schema property's example(s) only in a hover/focus popup
 * (`.property-example` > label button + `.property-example-value-list` popup of
 * `button.property-example-value`, copy-on-click). This file re-skins that SAME
 * DOM with CSS so the value stays visible in the attribute row; the original
 * buttons (copy-on-click, keyboard focus) are untouched.
 *
 * Opt-in only: nothing happens (no <style>, no listeners, no DOM change) unless
 * the page is opened with ?exstyle=<inline|nextline|pill|block>. The choice is
 * kept in sessionStorage because Scalar rewrites the URL while navigating;
 * ?exstyle=default clears it. A small switcher is shown while a style is active.
 *
 * Depends on Scalar class names: property-heading, property-example,
 * property-example-value-list, property-example-value. See SCALAR_PATCHES.md P12.
 */
(function () {
  // A = value after the type, wraps to its own line when the row is full; B = value always on the field's own row.
  var STYLES = ['inline', 'nextline', 'pill', 'block', 'row', 'rowright', 'chip'];
  var KEY = 'ehealth-exstyle';
  var style = null;
  try {
    var q = new URLSearchParams(location.search).get('exstyle');
    if (q === 'default' || q === 'off') sessionStorage.removeItem(KEY);
    else if (q && STYLES.indexOf(q) >= 0) sessionStorage.setItem(KEY, q);
    var s = sessionStorage.getItem(KEY);
    if (s && STYLES.indexOf(s) >= 0) style = s;
  } catch (e) {
    var m = /[?&]exstyle=([a-z]+)/.exec(location.search);
    if (m && STYLES.indexOf(m[1]) >= 0) style = m[1];
  }
  if (!style) return;

  // Selector pieces; S(name) scopes a rule to one style (same specificity as the shared rules, later wins).
  var P = 'html[data-exstyle]';
  var S = function (n) { return 'html[data-exstyle=' + n + ']'; };
  var H0 = ' .property-heading > .property-example';
  var V0 = H0 + ' .property-example-value-list';
  var B0 = V0 + ' > .property-example-value';
  var L0 = H0 + ' > button:first-child';
  var H = P + H0, V = P + V0, B = P + B0, L = P + L0;
  var css = [
    // ---- shared: neutralise the popup, keep the buttons -------------------
    H + '{position:static;min-width:0;max-width:100%;margin-right:0}',
    H + ':hover::before{display:none}',
    V + '{display:flex;position:static;transform:none;box-shadow:none;border:0;background:transparent;padding:0;min-width:0;max-width:100%;overflow:visible;z-index:auto;gap:4px}',
    B + '{flex:0 0 auto;width:auto;min-width:0;max-width:100%;padding:0;background:transparent;border:0;border-radius:0;text-align:left;cursor:copy;color:var(--scalar-color-2)}',
    B + ' > span{min-width:0}',
    B + '{position:relative}',
    // copy icon overlays the end of the value on hover/focus instead of reserving blank space after it
    B + ' > svg{position:absolute;right:2px;top:50%;margin-top:-7px;box-sizing:content-box;padding:2px;width:11px;height:11px;border-radius:3px;background:var(--scalar-background-1);opacity:0;pointer-events:none;transition:opacity .12s}',
    S('chip') + B0 + ' > svg{background:var(--scalar-background-2)}',
    B + ':hover > svg,' + B + ':focus-visible > svg{opacity:1}',
    B + ':focus-visible{outline:2px solid var(--scalar-color-accent,currentColor);outline-offset:1px}',
    L + '{display:none}', // the "Example" label is dropped in every style; the value list is always shown

    // ---- A: inline — muted "e.g. value" after the type --------------------
    S('inline') + H0 + '{display:inline-flex;flex-direction:row;align-items:baseline;gap:4px;overflow:hidden}',
    S('inline') + V0 + '{flex-direction:row;flex-wrap:wrap;row-gap:2px}',
    S('inline') + B0 + '{max-width:42ch;font-size:var(--scalar-mini);gap:3px}',
    S('inline') + B0 + ' > span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    S('inline') + V0 + ' > .property-example-value:not(:only-child){max-width:22ch}',

    // ---- B: nextline — chip on its own line, 2-line clamp -----------------
    S('nextline') + H0 + '{flex:0 0 100%;display:flex;flex-direction:row;align-items:flex-start;gap:6px;margin-top:2px}',
    S('nextline') + V0 + '{flex-direction:row;flex-wrap:wrap;align-items:flex-start}',
    S('nextline') + B0 + '{background:var(--scalar-background-2);border:var(--scalar-border-width) solid var(--scalar-border-color);border-radius:var(--scalar-radius);padding:2px 6px;font-size:var(--scalar-mini);white-space:normal}',
    S('nextline') + B0 + ':hover{background:var(--scalar-background-3,var(--scalar-background-2))}',
    S('nextline') + B0 + ' > span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:normal;overflow-wrap:anywhere;text-overflow:clip}',

    // ---- C: pill — compact bordered pill after the type -------------------
    S('pill') + H0 + '{display:inline-flex;flex-direction:row;align-items:center;gap:4px;overflow:hidden}',
    S('pill') + V0 + '{flex-direction:row;flex-wrap:wrap;row-gap:2px}',
    S('pill') + B0 + '{max-width:28ch;font-size:var(--scalar-micro);gap:4px;padding:0 8px;border:var(--scalar-border-width) solid var(--scalar-border-color);border-radius:999px;line-height:1.7}',
    S('pill') + B0 + ':hover{background:var(--scalar-background-2)}',
    S('pill') + B0 + ' > span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    S('pill') + V0 + ' > .property-example-value:not(:only-child){max-width:16ch}',

    // ---- D: block — full value on its own line, accent rail ---------------
    S('block') + H0 + '{flex:0 0 100%;display:flex;flex-direction:column;gap:2px;margin-top:3px;padding-left:8px;border-left:2px solid var(--scalar-color-accent,var(--scalar-border-color))}',
    S('block') + V0 + '{flex-direction:column;gap:2px}',
    S('block') + B0 + '{font-size:var(--scalar-mini);align-items:flex-start;gap:6px;white-space:normal}',
    S('block') + B0 + ' > span{display:block;white-space:pre-wrap;overflow-wrap:anywhere;text-overflow:clip;overflow:auto;max-height:7.5em}',
    

    // ---- B: value stays on the field's OWN row (takes the room left, ellipsis, never wraps below) ----
    S('row') + H0 + ',' + S('chip') + H0 + ',' + S('rowright') + H0 + '{flex:1 1 8ch;display:flex;flex-direction:row;min-width:0;overflow:hidden;align-items:baseline}',
    S('row') + V0 + ',' + S('chip') + V0 + ',' + S('rowright') + V0 + '{flex:1 1 auto;flex-direction:row;flex-wrap:nowrap;min-width:0}',
    S('row') + B0 + ',' + S('chip') + B0 + ',' + S('rowright') + B0 + '{font-size:var(--scalar-mini);gap:3px;max-width:100%}',
    S('row') + B0 + ' > span,' + S('chip') + B0 + ' > span,' + S('rowright') + B0 + ' > span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    S('row') + V0 + ' > .property-example-value:not(:only-child),' + S('chip') + V0 + ' > .property-example-value:not(:only-child),' + S('rowright') + V0 + ' > .property-example-value:not(:only-child){flex:0 1 auto;max-width:24ch}',
    // C: exactly the stock popup value chip (same background / border / radius / mono font), on the field's own row, no rail
    S('chip') + B0 + '{background:var(--scalar-background-2);border:var(--scalar-border-width) solid var(--scalar-border-color);border-radius:var(--scalar-radius);padding:2px 6px}',
    S('rowright') + H0 + '{justify-content:flex-end;margin-left:auto}',
    S('rowright') + V0 + '{justify-content:flex-end}',
    S('rowright') + B0 + '{justify-content:flex-end;text-align:right}',

    // ---- switcher ---------------------------------------------------------
    '#ehealth-exstyle-switch{position:fixed;right:12px;bottom:12px;z-index:100000;display:flex;gap:2px;padding:3px;font:12px var(--scalar-font,system-ui);background:var(--scalar-background-1,#fff);color:var(--scalar-color-1,#222);border:1px solid var(--scalar-border-color,#ccc);border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.2)}',
    '#ehealth-exstyle-switch span{padding:3px 6px;color:var(--scalar-color-3,#777)}',
    '#ehealth-exstyle-switch button{font:inherit;color:inherit;background:none;border:0;border-radius:5px;padding:3px 8px;cursor:pointer}',
    '#ehealth-exstyle-switch button:hover{background:var(--scalar-background-2,#eee)}',
    '#ehealth-exstyle-switch button[aria-pressed=true]{background:var(--scalar-color-accent,#06c);color:#fff}'
  ].join('\n');

  var el = document.createElement('style');
  el.id = 'ehealth-example-styles';
  el.textContent = css;
  document.head.appendChild(el);

  function apply(s) {
    var root = document.documentElement;
    if (s) root.setAttribute('data-exstyle', s);
    else root.removeAttribute('data-exstyle');
    try {
      if (s) sessionStorage.setItem(KEY, s);
      else sessionStorage.removeItem(KEY);
    } catch (e) {}
    var u = new URL(location.href);
    if (s) u.searchParams.set('exstyle', s);
    else u.searchParams.set('exstyle', 'default');
    history.replaceState(history.state, '', u.toString());
    var bs = document.querySelectorAll('#ehealth-exstyle-switch button');
    for (var i = 0; i < bs.length; i++)
      bs[i].setAttribute('aria-pressed', String((bs[i].dataset.s || '') === (s || '')));
  }

  apply(style);

  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div');
    bar.id = 'ehealth-exstyle-switch';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Example display style');
    var lab = document.createElement('span');
    lab.textContent = 'Example style';
    bar.appendChild(lab);
    ['default'].concat(STYLES).forEach(function (s, i) {
      if (s === 'inline' || s === 'row' || s === 'chip') {
        var g = document.createElement('span');
        g.textContent = s === 'inline' ? '| A:' : s === 'row' ? '| B:' : '| C:';
        bar.appendChild(g);
      }
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.dataset.s = s === 'default' ? '' : s;
      b.setAttribute('aria-pressed', String(s === (style || 'default')));
      b.addEventListener('click', function () { apply(b.dataset.s || null); });
      bar.appendChild(b);
    });
    document.body.appendChild(bar);
  });

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
