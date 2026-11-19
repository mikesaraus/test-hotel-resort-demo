/* Dropdowns for the whole mockup (staff app and booking page).
   Every <select> becomes a button that opens a list; lists longer than SEARCH_FROM get a search box.
   The real <select> stays in the page, hidden, so code that reads or sets .value, listens for input / change,
   or rebuilds the options keeps working unchanged. Add data-native to a <select> to leave it alone. */
(function () {
  const SEARCH_FROM = 9;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const chev = '<svg class="sel-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>';
  const tick = '<svg class="sel-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const proto = HTMLSelectElement.prototype, nativeValue = Object.getOwnPropertyDescriptor(proto, 'value'), nativeIndex = Object.getOwnPropertyDescriptor(proto, 'selectedIndex');
  let uid = 0;

  // ---------- turning selects into buttons ----------
  function enhance(root) { (root || document).querySelectorAll('select:not([multiple]):not([data-native])').forEach(setup); }
  function setup(sel) {
    if (sel._sel) return;
    const hadFocus = document.activeElement === sel;
    if (!sel.id) sel.id = 'sel-' + (++uid);
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'sel-trigger' + (sel.closest('.field, .bk-field') ? '' : ' sel-inline') + (sel.className ? ' ' + sel.className : '');
    t.dataset.for = sel.id;
    t.setAttribute('aria-haspopup', 'listbox'); t.setAttribute('aria-expanded', 'false');
    if (sel.getAttribute('style')) t.setAttribute('style', sel.getAttribute('style'));
    sel.after(t);
    const c = { sel, t };
    sel._sel = c;
    sel.hidden = true; sel.tabIndex = -1;
    const paint = () => paintTrigger(c);
    Object.defineProperty(sel, 'value', { configurable: true, get() { return nativeValue.get.call(this); }, set(v) { nativeValue.set.call(this, v); paint(); } });
    Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return nativeIndex.get.call(this); }, set(v) { nativeIndex.set.call(this, v); paint(); } });
    sel.addEventListener('input', paint); sel.addEventListener('change', paint);
    sel.addEventListener('click', () => open(c)); // a click on its <label>
    new MutationObserver(() => { paint(); if (P && P.c === c) draw(); }).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected', 'label', 'aria-invalid', 'aria-describedby'], characterData: true });
    t.addEventListener('click', () => (P && P.c === c ? close(true) : open(c)));
    t.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp'].includes(e.key) || (e.key.length === 1 && /\S/.test(e.key) && !e.metaKey && !e.ctrlKey)) { e.preventDefault(); open(c, e.key.length === 1 ? e.key : ''); } });
    paint();
    if (hadFocus) t.focus();
  }
  function labelOf(sel) {
    if (sel.getAttribute('aria-label')) return sel.getAttribute('aria-label');
    const l = sel.labels && sel.labels[0];
    const text = l ? [...l.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && !n.matches('select,button,input,.err,.hint'))).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim() : '';
    return text || 'Choose';
  }
  function paintTrigger({ sel, t }) {
    const o = sel.options[sel.selectedIndex];
    ['aria-invalid', 'aria-describedby'].forEach(a => { const v = sel.getAttribute(a); if (v) { t.setAttribute(a, v); sel.removeAttribute(a); } else if (a === 'aria-invalid' && !sel.closest('.has-err')) t.removeAttribute(a); });
    t.disabled = sel.disabled;
    t.innerHTML = `<span class="sel-val ${o ? '' : 'sel-empty'}">${o ? esc(o.textContent.trim()) : 'Choose…'}</span>${chev}`;
    t.setAttribute('aria-label', `${labelOf(sel)}: ${o ? o.textContent.trim() : 'nothing chosen'}`);
  }

  // ---------- the list ----------
  let P = null; // { c, el, back, q, active (option index), items }
  const wide = () => window.innerWidth >= 600;
  function open(c, typed) {
    if (P) close(false);
    if (c.sel.disabled) return;
    const n = c.sel.options.length, search = n >= SEARCH_FROM, id = 'selp-' + (++uid);
    P = { c, q: '', active: c.sel.selectedIndex, search, id };
    P.el = document.createElement('div');
    P.el.className = 'sel-pop' + (wide() ? '' : ' sel-sheet');
    P.el.setAttribute('role', 'dialog'); P.el.setAttribute('aria-label', labelOf(c.sel));
    P.el.innerHTML = `${wide() ? '' : `<div class="sel-head"><b>${esc(labelOf(c.sel))}</b><button type="button" class="sel-x" aria-label="Close">×</button></div>`}
      ${search ? `<div class="sel-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input type="search" role="combobox" aria-expanded="true" aria-controls="${id}-l" aria-autocomplete="list" placeholder="Search ${n} choices" autocomplete="off" spellcheck="false"></div>` : ''}
      <div class="sel-list" id="${id}-l" role="listbox" aria-label="${esc(labelOf(c.sel))}" ${search ? '' : 'tabindex="0"'}></div>`;
    if (!wide()) { P.back = document.createElement('div'); P.back.className = 'sel-back'; document.body.appendChild(P.back); }
    document.body.appendChild(P.el);
    c.t.setAttribute('aria-expanded', 'true'); c.t.classList.add('sel-on');
    P.el.addEventListener('pointerdown', e => { if (e.target.closest('.sel-opt')) e.preventDefault(); }); // keep focus in the search box
    P.el.addEventListener('click', onClick);
    P.el.addEventListener('keydown', onKey);
    P.el.addEventListener('mousemove', e => { const o = e.target.closest('.sel-opt'); if (o && +o.dataset.i !== P.active) { P.active = +o.dataset.i; mark(false); } });
    if (search) P.el.querySelector('input').addEventListener('input', e => { P.q = e.target.value; draw(); });
    draw();
    place();
    const focusEl = search ? P.el.querySelector('input') : P.el.querySelector('.sel-list');
    focusEl.focus({ preventScroll: true });
    if (typed) { if (search) { focusEl.value = typed; P.q = typed; draw(); } else typeAhead(typed); }
  }
  function close(refocus) {
    if (!P) return;
    const { c } = P;
    P.el.remove(); if (P.back) P.back.remove();
    P = null;
    c.t.setAttribute('aria-expanded', 'false'); c.t.classList.remove('sel-on');
    if (refocus) focusTrigger(c);
  }
  function focusTrigger(c) {
    const t = c.t.isConnected ? c.t : document.querySelector(`.sel-trigger[data-for="${CSS.escape(c.sel.id)}"]`);
    if (t) t.focus();
  }
  // the options shown for the search, with their group headings
  function draw() {
    const { sel } = P.c, q = norm(P.q.trim()), out = [], vis = [];
    let lastGroup = null;
    [...sel.options].forEach((o, i) => {
      const text = o.textContent.trim();
      if (q && !norm(text + ' ' + o.value).includes(q)) return;
      const g = o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null;
      if (g !== lastGroup && g) out.push(`<div class="sel-group" role="presentation">${esc(g)}</div>`);
      lastGroup = g;
      const off = o.disabled || (o.parentElement.tagName === 'OPTGROUP' && o.parentElement.disabled);
      vis.push(i);
      out.push(`<div class="sel-opt ${i === sel.selectedIndex ? 'is-sel' : ''}" role="option" id="${P.id}-o${i}" data-i="${i}" aria-selected="${i === sel.selectedIndex}" ${off ? 'aria-disabled="true"' : ''}>${tick}<span>${highlight(text, q)}</span></div>`);
    });
    P.vis = vis.filter(i => !sel.options[i].disabled);
    if (!P.vis.includes(P.active)) P.active = P.vis[0] ?? -1;
    const list = P.el.querySelector('.sel-list');
    list.innerHTML = out.join('') || `<p class="sel-none">Nothing matches “${esc(P.q.trim())}”.</p>`;
    const count = P.el.querySelector('.sel-search input');
    if (count) count.setAttribute('aria-label', `Search ${labelOf(sel).toLowerCase()}, ${vis.length} shown`);
    mark(true);
  }
  function highlight(text, q) {
    if (!q) return esc(text);
    const i = norm(text).indexOf(q);
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  function mark(scroll) {
    P.el.querySelectorAll('.sel-opt.is-active').forEach(x => x.classList.remove('is-active'));
    const a = P.el.querySelector(`.sel-opt[data-i="${P.active}"]`), owner = P.search ? P.el.querySelector('.sel-search input') : P.el.querySelector('.sel-list');
    if (a) { a.classList.add('is-active'); owner.setAttribute('aria-activedescendant', a.id); if (scroll) a.scrollIntoView({ block: 'nearest' }); } else owner.removeAttribute('aria-activedescendant');
  }
  function move(step) {
    if (!P.vis.length) return;
    const k = P.vis.indexOf(P.active);
    P.active = step === 'first' ? P.vis[0] : step === 'last' ? P.vis[P.vis.length - 1] : P.vis[Math.max(0, Math.min(P.vis.length - 1, (k < 0 ? -1 : k) + step))];
    mark(true);
  }
  let typed = '', typedAt = 0;
  function typeAhead(ch) {
    const now = Date.now(); typed = now - typedAt > 700 ? ch : typed + ch; typedAt = now;
    const opts = P.c.sel.options, start = P.vis.indexOf(P.active), order = P.vis.slice(start + (typed.length === 1 ? 1 : 0)).concat(P.vis.slice(0, start + (typed.length === 1 ? 1 : 0)));
    const hit = order.find(i => norm(opts[i].textContent.trim()).startsWith(norm(typed)));
    if (hit !== undefined) { P.active = hit; mark(true); }
  }
  // choose: set the real select and tell the page, the same way picking in a normal select would
  function pick(i) {
    const { c } = P, sel = c.sel;
    if (sel.options[i].disabled) return;
    const changed = i !== sel.selectedIndex;
    close(false);
    nativeIndex.set.call(sel, i);
    paintTrigger(c);
    if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); if (sel.isConnected) sel.dispatchEvent(new Event('change', { bubbles: true })); }
    focusTrigger(c);
  }

  // ---------- events ----------
  function onClick(e) {
    if (e.target.closest('.sel-x')) return close(true);
    const o = e.target.closest('.sel-opt');
    if (o && o.getAttribute('aria-disabled') !== 'true') pick(+o.dataset.i);
  }
  function onKey(e) {
    e.stopPropagation(); // Escape here closes the list, not the dialog behind it
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); return close(true); }
    if (k === 'Tab') { const c = P.c; close(false); focusTrigger(c); return; } // the browser then moves on from the button
    if (k === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (k === 'PageDown') { e.preventDefault(); move(8); }
    else if (k === 'PageUp') { e.preventDefault(); move(-8); }
    else if (k === 'Home' && !P.search) { e.preventDefault(); move('first'); }
    else if (k === 'End' && !P.search) { e.preventDefault(); move('last'); }
    else if (k === 'Enter' || (k === ' ' && !P.search)) { e.preventDefault(); if (P.active >= 0) pick(P.active); }
    else if (!P.search && k.length === 1 && /\S/.test(k) && !e.metaKey && !e.ctrlKey) typeAhead(k);
  }

  // ---------- placement: under the button on computers, a sheet from the bottom on phones ----------
  function place() {
    if (!P || !wide()) return;
    const t = P.c.t;
    if (!t.isConnected) return close(false);
    const r = t.getBoundingClientRect(), gap = 4;
    P.el.style.minWidth = Math.max(r.width, 200) + 'px';
    const h = P.el.offsetHeight, w = P.el.offsetWidth, below = window.innerHeight - r.bottom;
    const top = below < h + gap && r.top > below ? r.top - h - gap : r.bottom + gap;
    P.el.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px';
    P.el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  }
  window.addEventListener('resize', () => { if (P && wide() === P.el.classList.contains('sel-sheet')) close(false); else place(); });
  document.addEventListener('scroll', e => { if (P && !P.el.contains(e.target)) place(); }, true);
  document.addEventListener('pointerdown', e => { if (P && !P.el.contains(e.target) && !P.c.t.contains(e.target)) close(false); }, true);

  window.SEL = { enhance, close: () => close(false) };
  const start = () => {
    enhance(document);
    new MutationObserver(() => { enhance(document); if (P && !P.c.sel.isConnected) close(false); }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
