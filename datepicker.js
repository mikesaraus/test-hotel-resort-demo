/* Date picker for the whole mockup (staff app and booking page).
   Every <input type="date"> becomes a button that opens a calendar. The real input stays in the page, hidden,
   so code that reads or sets .value / .min / .max keeps working unchanged.
   Two date inputs inside an element with [data-dp-range] become one check-in / check-out picker.
   An input with data-dp-info="name" shows DP.info.name(isoDate) -> { text, full, tone, note } under each day. */
(function () {
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const add = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const monthStart = s => s.slice(0, 8) + '01';
  const addMonths = (s, n) => { const d = parse(monthStart(s)); d.setMonth(d.getMonth() + n); return iso(d); };
  const valid = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const nightsOf = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const spanText = (c, a, b) => { const n = nightsOf(a, b) + (c.days ? 1 : 0), u = c.days ? 'day' : 'night'; return `${n} ${u}${n === 1 ? '' : 's'}`; };
  const today = () => (window.R && R.S && R.S.bd) || iso(new Date()); // the PMS business date when there is one
  const fmt = (s, o) => parse(s).toLocaleDateString('en-PH', o);
  const short = s => fmt(s, { weekday: 'short', day: 'numeric', month: 'short', ...(s.slice(0, 4) !== today().slice(0, 4) ? { year: 'numeric' } : {}) });
  const long = s => fmt(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const monthName = s => fmt(s, { month: 'long', year: 'numeric' });
  const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WEEK_L = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const svg = d => `<svg class="dp-i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICO = {
    cal: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    prev: svg('<path d="M15 6l-6 6 6 6"/>'), next: svg('<path d="M9 6l6 6-6 6"/>'), x: svg('<path d="M6 6l12 12M18 6L6 18"/>')
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const DP = window.DP = { info: {}, enhance, close: () => close(false) };

  // ---------- turning inputs into pickers ----------
  function enhance(root) { (root || document).querySelectorAll('input[type="date"]').forEach(setup); }
  function setup(input) {
    if (input._dp) return;
    const box = input.closest('[data-dp-range]');
    if (box) {
      const pair = [...box.querySelectorAll('input[type="date"]')];
      if (pair.length === 2) { if (pair[0] === input) setupRange(pair[0], pair[1], box); return; }
    }
    const c = { range: false, inputs: [input], label: labelOf(input) };
    const t = document.createElement('button');
    t.type = 'button'; t.className = 'dp-trigger'; t.dataset.for = input.id || '';
    t.setAttribute('aria-haspopup', 'dialog'); t.setAttribute('aria-expanded', 'false');
    c.triggers = [t];
    input.after(t);
    adopt(input, c, () => paintSingle(c));
    t.addEventListener('click', () => toggle(c, 0));
  }
  function setupRange(a, b, box) {
    // data-dp-range="days": an inclusive span (a season from the 1st to the 3rd is 3 days, and can start and end on one day);
    // otherwise a stay, counted in nights, where the second date must be after the first
    const c = { range: true, days: box.dataset.dpRange === 'days', inputs: [a, b], label: labelOf(a) };
    const wrap = document.createElement('div');
    wrap.className = 'dp-range';
    wrap.innerHTML = [0, 1].map(i => `<button type="button" class="dp-half" data-i="${i}" data-for="${esc(c.inputs[i].id)}" aria-haspopup="dialog" aria-expanded="false"><small>${esc(labelOf(c.inputs[i]))}${i ? '<span class="dp-nights" aria-hidden="true"></span>' : ''}</small><b></b></button>`).join('');
    c.wrap = wrap; c.triggers = [...wrap.querySelectorAll('.dp-half')];
    b.after(wrap);
    const paint = () => paintRange(c);
    adopt(a, c, paint); adopt(b, c, paint);
    c.triggers.forEach((t, i) => t.addEventListener('click', () => toggle(c, i)));
  }
  // hide the real input but keep it the source of truth
  function adopt(input, c, paint) {
    const hadFocus = document.activeElement === input;
    input._dp = c;
    input.type = 'text';             // stops the browser's own picker; the value (YYYY-MM-DD) is kept
    input.hidden = true; input.tabIndex = -1;
    Object.defineProperty(input, 'value', { configurable: true, get() { return nativeValue.get.call(this); }, set(v) { nativeValue.set.call(this, v); paint(); } });
    input.addEventListener('input', paint); input.addEventListener('change', paint);
    input.addEventListener('click', () => open(c, c.inputs.indexOf(input))); // a click on its <label>
    new MutationObserver(paint).observe(input, { attributes: true, attributeFilter: ['min', 'max', 'disabled', 'aria-invalid', 'aria-describedby'] });
    paint();
    if (hadFocus) c.triggers[c.inputs.indexOf(input)] && c.triggers[c.inputs.indexOf(input)].focus();
  }
  function labelOf(input) {
    if (input.dataset.dpLabel) return input.dataset.dpLabel;
    if (input.getAttribute('aria-label')) return input.getAttribute('aria-label');
    const l = input.labels && input.labels[0];
    const text = l ? [...l.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && !n.matches('input,select,textarea,button,.dp-range,.err,.hint'))).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim() : '';
    return text || 'Date';
  }
  // what the button says, plus the input's error state so screen readers and focus land on the button
  function mirror(input, t) {
    ['aria-invalid', 'aria-describedby'].forEach(a => { const v = input.getAttribute(a); if (v) { t.setAttribute(a, v); input.removeAttribute(a); } });
    t.disabled = input.disabled;
  }
  function paintSingle(c) {
    const input = c.inputs[0], t = c.triggers[0], v = input.value;
    mirror(input, t);
    t.innerHTML = `${ICO.cal}<span class="dp-val ${valid(v) ? '' : 'dp-empty'}">${valid(v) ? esc(short(v)) : 'Pick a date'}</span>`;
    t.setAttribute('aria-label', `${c.label}: ${valid(v) ? long(v) : 'no date picked'}. Change date`);
  }
  function paintRange(c) {
    const [a, b] = c.inputs.map(i => i.value), n = valid(a) && valid(b) && b >= a ? nightsOf(a, b) + (c.days ? 1 : 0) : 0, unit = c.days ? 'day' : 'night';
    c.inputs.forEach((input, i) => {
      const t = c.triggers[i], v = input.value;
      mirror(input, t);
      t.querySelector('b').textContent = valid(v) ? short(v) : 'Add date';
      t.setAttribute('aria-label', `${labelOf(input)}: ${valid(v) ? long(v) : 'no date picked'}${i && n > 0 ? `, ${n} ${unit}${n === 1 ? '' : 's'}` : ''}. Change dates`);
    });
    c.wrap.querySelector('.dp-nights').textContent = n > 0 ? `${n} ${unit}${n === 1 ? '' : 's'}` : '';
    c.wrap.classList.toggle('dp-err', c.triggers.some(t => t.getAttribute('aria-invalid') === 'true'));
  }

  // ---------- the calendar ----------
  let P = null; // the open picker: { c, i (which input), el, back, view, month, focus, a, b, hover }
  const wide = () => window.innerWidth >= 600;
  function toggle(c, i) { if (P && P.c === c && P.i === i) close(true); else open(c, i); }
  function open(c, i) {
    if (P) close(false);
    if (c.inputs[i].disabled) return;
    const [a, b] = c.inputs.map(x => valid(x.value) ? x.value : '');
    const cur = (c.range ? (i ? b || a : a) : a) || clamp(c, today());
    P = { c, i, view: 'days', month: monthStart(cur), focus: cur, a, b, hover: '' };
    P.el = document.createElement('div');
    P.el.className = 'dp-pop' + (c.range ? ' dp-is-range' : '') + (info(c) ? ' dp-has-info' : '');
    P.el.setAttribute('role', 'dialog'); P.el.setAttribute('aria-modal', 'true');
    if (!wide()) { P.back = document.createElement('div'); P.back.className = 'dp-back'; document.body.appendChild(P.back); P.el.classList.add('dp-sheet'); }
    document.body.appendChild(P.el);
    c.triggers.forEach((t, k) => { t.setAttribute('aria-expanded', String(k === i)); t.classList.toggle('dp-on', k === i); });
    P.el.addEventListener('click', onClick);
    P.el.addEventListener('keydown', onKey);
    P.el.addEventListener('mouseover', onHover);
    draw(true);
    place(true);
  }
  function close(refocus) {
    if (!P) return;
    const { c, i } = P;
    P.el.remove(); if (P.back) P.back.remove();
    P = null;
    c.triggers.forEach(t => { t.setAttribute('aria-expanded', 'false'); t.classList.remove('dp-on'); });
    if (refocus) focusTrigger(c, i);
  }
  // after a pick the page may have re-rendered; find the new button for the same input
  function focusTrigger(c, i) {
    const id = c.inputs[i].id;
    const t = c.triggers[i].isConnected ? c.triggers[i] : id && document.querySelector(`[data-for="${CSS.escape(id)}"]`);
    if (t) t.focus();
  }
  const info = c => { const n = c.inputs[0].dataset.dpInfo; return n && DP.info[n]; };
  const minOf = c => { const m = c.inputs[0].getAttribute('min'); return valid(m) ? m : ''; };
  const maxOf = c => { const m = c.inputs[c.inputs.length - 1].getAttribute('max'); return valid(m) ? m : ''; };
  const clamp = (c, d) => { const lo = minOf(c), hi = maxOf(c); return lo && d < lo ? lo : hi && d > hi ? hi : d; };
  // can this day be clicked right now?
  function allowed(d, inf) {
    const c = P.c, lo = minOf(c), hi = maxOf(c);
    if (lo && d < lo || hi && d > hi) return false;
    if (c.range && P.i === 1 && P.a && (d > P.a || (c.days && d === P.a))) return true;  // a check-out day only needs the nights before it
    return !(inf && inf.full);
  }

  function draw(first) {
    const c = P.c, title = c.range ? (P.i ? `Choose ${labelOf(c.inputs[1]).toLowerCase()} date` : `Choose ${labelOf(c.inputs[0]).toLowerCase()} date`) : `Choose ${c.label.toLowerCase()}`;
    P.el.setAttribute('aria-label', title);
    const months = P.view === 'days' ? (c.range && wide() && window.innerWidth >= 760 ? 2 : 1) : 0;
    const lo = minOf(c), hi = maxOf(c);
    const canPrev = P.view === 'days' ? !lo || addMonths(P.month, -1) >= monthStart(lo) : !lo || +P.month.slice(0, 4) > +lo.slice(0, 4);
    const canNext = P.view === 'days' ? !hi || addMonths(P.month, months) <= hi : !hi || +P.month.slice(0, 4) < +hi.slice(0, 4);
    const head = `<div class="dp-head">
      <button type="button" class="dp-nav" data-dp="prev" aria-label="${P.view === 'days' ? 'Previous month' : 'Previous year'}" ${canPrev ? '' : 'disabled'}>${ICO.prev}</button>
      <div class="dp-titles" aria-live="polite">${P.view === 'days' ? Array.from({ length: months }, (_, k) => `<button type="button" class="dp-title" data-dp="months" aria-label="${monthName(addMonths(P.month, k))}, choose another month">${monthName(addMonths(P.month, k))}</button>`).join('') : `<span class="dp-title">${P.month.slice(0, 4)}</span>`}</div>
      <button type="button" class="dp-nav" data-dp="next" aria-label="${P.view === 'days' ? 'Next month' : 'Next year'}" ${canNext ? '' : 'disabled'}>${ICO.next}</button>
      ${wide() ? '' : `<button type="button" class="dp-nav dp-x" data-dp="close" aria-label="Close">${ICO.x}</button>`}</div>`;
    const status = c.range ? `<p class="dp-status">${P.i === 0 ? `Pick your <b>${esc(labelOf(c.inputs[0]).toLowerCase())}</b> date` : P.a ? `<b>${esc(short(P.a))}</b> to <b>${P.b && (P.b > P.a || (c.days && P.b === P.a)) ? esc(short(P.b)) : '…'}</b>${P.b && (P.b > P.a || (c.days && P.b === P.a)) ? ` · ${spanText(c, P.a, P.b)}` : `. Now pick your <b>${esc(labelOf(c.inputs[1]).toLowerCase())}</b> date`}` : ''}</p>` : '';
    const body = P.view === 'days' ? `<div class="dp-months">${Array.from({ length: months }, (_, k) => grid(addMonths(P.month, k))).join('')}</div>` : monthsGrid();
    const inf = info(c);
    const foot = P.view === 'days' ? `<div class="dp-foot">${quick().map(([l, a, b]) => `<button type="button" class="dp-chip" data-dp="quick" data-a="${a}" data-b="${b || ''}">${esc(l)}</button>`).join('')}${inf && inf.legend ? `<p class="dp-legend">${inf.legend()}</p>` : ''}</div>` : '';
    P.el.innerHTML = head + status + body + foot;
    if (P.view === 'days') focusDay();
  }
  function grid(m) {
    const c = P.c, inf = info(c), first = parse(m).getDay(), len = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(), t = today();
    const a = P.a, b = c.range ? P.b : '';
    const end = c.range && P.i === 1 && P.a && !(P.b > P.a) && P.hover > P.a ? P.hover : b;
    let cells = Array.from({ length: first }, () => '<td></td>');
    for (let day = 1; day <= len; day++) {
      const d = m.slice(0, 8) + pad(day), x = inf ? inf(d) || {} : null, ok = allowed(d, x);
      const cls = ['dp-day', d === t && 'is-today', (d === a || (c.range && d === end)) && 'is-sel', c.range && d === a && end > a && 'is-start', c.range && d === end && end > a && 'is-end', c.range && a && end && d > a && d < end && 'in-range', !ok && 'is-off', x && x.full && 'is-full', x && x.tone && 'tone-' + x.tone].filter(Boolean).join(' ');
      const say = `${WEEK_L[parse(d).getDay()]} ${day} ${fmt(d, { month: 'long', year: 'numeric' })}${d === t ? ', today' : ''}${x && x.note ? ', ' + x.note : ''}${!ok ? ', not available' : ''}`;
      cells.push(`<td role="gridcell" ${d === a || d === end ? 'aria-selected="true"' : ''}><button type="button" class="${cls}" data-d="${d}" tabindex="-1" aria-label="${esc(say)}" ${ok ? '' : 'aria-disabled="true"'}><span>${day}</span>${x ? `<small>${esc(x.text || '')}</small>` : ''}</button></td>`);
    }
    while (cells.length % 7) cells.push('<td></td>');
    const rows = []; for (let k = 0; k < cells.length; k += 7) rows.push(`<tr>${cells.slice(k, k + 7).join('')}</tr>`);
    return `<table class="dp-grid" role="grid" aria-label="${monthName(m)}"><thead><tr>${WEEK.map((w, k) => `<th scope="col" abbr="${WEEK_L[k]}" class="${k === 0 || k === 6 ? 'dp-wkd' : ''}">${w.slice(0, 2)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  function monthsGrid() {
    const y = P.month.slice(0, 4), lo = minOf(P.c), hi = maxOf(P.c), cur = P.focus.slice(0, 7);
    return `<div class="dp-mgrid">${MONTHS.map((n, k) => { const m = `${y}-${pad(k + 1)}`, off = lo && m < lo.slice(0, 7) || hi && m > hi.slice(0, 7);
      return `<button type="button" class="dp-month ${m === cur ? 'is-sel' : ''} ${m === today().slice(0, 7) ? 'is-today' : ''}" data-dp="month" data-m="${m}-01" ${off ? 'disabled' : ''} aria-label="${fmt(m + '-01', { month: 'long', year: 'numeric' })}">${n}</button>`; }).join('')}</div>`;
  }
  // shortcuts under the calendar
  function quick() {
    const c = P.c, t = today(), out = [];
    const fits = (a, b) => allowed(a, info(c) ? info(c)(a) : null) && (!maxOf(c) || (b || a) <= maxOf(c));
    if (c.range && c.days) return out; // seasons: no stay shortcuts
    if (c.range) {
      const wd = parse(t).getDay();
      const fri = wd === 6 ? t : add(t, (5 - wd + 7) % 7);         // Saturday: this weekend starts today
      const sun = wd === 6 ? add(t, 1) : add(fri, 2);
      const nfri = add(wd === 6 ? add(t, -1) : fri, 7);
      [['Tonight', t, add(t, 1)], ['This weekend', fri, sun], ['Next weekend', nfri, add(nfri, 2)]].forEach(q => { if (fits(q[1], q[2])) out.push(q); });
    } else {
      [['Today', t], ['Tomorrow', add(t, 1)], ['In a week', add(t, 7)]].forEach(q => { if (fits(q[1])) out.push(q); });
    }
    return out;
  }
  function focusDay() {
    const btn = P.el.querySelector(`.dp-day[data-d="${P.focus}"]`) || P.el.querySelector('.dp-day:not(.is-off)') || P.el.querySelector('.dp-day');
    if (!btn) return;
    P.el.querySelectorAll('.dp-day[tabindex="0"]').forEach(x => { x.tabIndex = -1; });
    btn.tabIndex = 0; btn.focus({ preventScroll: true });
  }
  // move the focus by days, opening other months when needed
  function moveFocus(d) {
    const lo = minOf(P.c), hi = maxOf(P.c);
    if (lo && d < lo) d = lo; if (hi && d > hi) d = hi;
    P.focus = d;
    const months = P.el.querySelectorAll('.dp-grid').length;
    if (d < P.month) P.month = monthStart(d);
    else if (d >= addMonths(P.month, months)) P.month = addMonths(monthStart(d), 1 - months);
    if (!P.el.querySelector(`.dp-day[data-d="${d}"]`)) draw(); else focusDay();
  }
  function pick(d) {
    const c = P.c;
    if (!c.range) return commit([d]);
    if (P.i === 0 || !P.a || d < P.a || (d === P.a && !c.days)) {
      if (!allowed(d, info(c) ? info(c)(d) : null) && P.i === 1) return;
      P.a = d; P.i = 1; P.focus = add(d, 1); P.hover = '';
      if (P.b && P.b <= P.a) P.b = '';
      c.triggers.forEach((t, k) => { t.setAttribute('aria-expanded', String(k === 1)); t.classList.toggle('dp-on', k === 1); });
      draw(); return;
    }
    commit([P.a, d]);
  }
  // write the value(s) into the real inputs and tell the page, the same way typing into them would
  function commit(vals) {
    const c = P.c, idx = c.range ? 1 : 0;
    vals.forEach((v, k) => nativeValue.set.call(c.inputs[k], v));
    close(false);
    for (const input of c.inputs.slice(0, vals.length)) {
      if (!input.isConnected) continue;      // the page re-rendered after the first event
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (input.isConnected) input.dispatchEvent(new Event('change', { bubbles: true }));
      if (c.range) break;                    // one event carries both dates; the page reads the other input
    }
    if (c.range && c.inputs[1].isConnected) { c.inputs[1].dispatchEvent(new Event('input', { bubbles: true })); if (c.inputs[1].isConnected) c.inputs[1].dispatchEvent(new Event('change', { bubbles: true })); }
    c.inputs.forEach(i => { if (i.isConnected && i._dp) (c.range ? paintRange : paintSingle)(c); });
    focusTrigger(c, idx);
  }

  // ---------- events ----------
  function onClick(e) {
    const day = e.target.closest('.dp-day');
    if (day) { if (day.getAttribute('aria-disabled') !== 'true') pick(day.dataset.d); return; }
    const b = e.target.closest('[data-dp]'); if (!b || b.disabled) return;
    const a = b.dataset.dp;
    if (a === 'prev' || a === 'next') {
      const s = a === 'prev' ? -1 : 1;
      P.month = P.view === 'days' ? addMonths(P.month, s) : `${+P.month.slice(0, 4) + s}-${P.month.slice(5)}`;
      draw(); const keep = P.el.querySelector(`[data-dp="${a}"]`); if (keep && !keep.disabled) keep.focus(); else focusDay();
    } else if (a === 'months') { P.view = 'months'; draw(); (P.el.querySelector('.dp-month.is-sel:not(:disabled)') || P.el.querySelector('.dp-month:not(:disabled)')).focus(); }
    else if (a === 'month') { const m = b.dataset.m, last = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(); P.view = 'days'; P.month = m; P.focus = clamp(P.c, m.slice(0, 8) + pad(Math.min(+P.focus.slice(8), last))); draw(); }
    else if (a === 'quick') commit(b.dataset.b ? [b.dataset.a, b.dataset.b] : [b.dataset.a]);
    else if (a === 'close') close(true);
  }
  function onHover(e) {
    if (!P.c.range || P.i !== 1 || !P.a) return;
    const day = e.target.closest('.dp-day'); if (!day || day.dataset.d === P.hover) return;
    P.hover = day.dataset.d;
    const end = P.hover > P.a ? P.hover : '';
    P.el.querySelectorAll('.dp-day').forEach(x => { const d = x.dataset.d; x.classList.toggle('in-range', !!end && d > P.a && d < end); x.classList.toggle('is-end', !!end && d === end); x.classList.toggle('is-sel', d === P.a || d === end); x.classList.toggle('is-start', !!end && d === P.a); });
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (P.view === 'months') { P.view = 'days'; draw(); } else close(true); return; }
    if (e.key === 'Tab') { // focus stays inside the calendar
      const f = [...P.el.querySelectorAll('button:not(:disabled)')].filter(x => x.tabIndex !== -1 || x === document.activeElement);
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      return;
    }
    const day = e.target.closest('.dp-day'); if (!day) return;
    const d = day.dataset.d, wd = parse(d).getDay();
    const to = { ArrowLeft: add(d, -1), ArrowRight: add(d, 1), ArrowUp: add(d, -7), ArrowDown: add(d, 7), Home: add(d, -wd), End: add(d, 6 - wd),
      PageUp: e.shiftKey ? addMonthsKeepDay(d, -12) : addMonthsKeepDay(d, -1), PageDown: e.shiftKey ? addMonthsKeepDay(d, 12) : addMonthsKeepDay(d, 1) }[e.key];
    if (to) { e.preventDefault(); moveFocus(to); if (P.c.range) onHover({ target: P.el.querySelector(`.dp-day[data-d="${P.focus}"]`) }); }
  }
  function addMonthsKeepDay(d, n) { const m = addMonths(d, n), last = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate(); return m.slice(0, 8) + pad(Math.min(+d.slice(8), last)); }

  // ---------- placement: under the button on computers, a sheet from the bottom on phones ----------
  function place(first) {
    if (!P || P.el.classList.contains('dp-sheet')) return;
    const anchor = P.c.range ? P.c.wrap : P.c.triggers[0];
    if (!anchor.isConnected) return close(false);
    let r = anchor.getBoundingClientRect();
    const w = P.el.offsetWidth, h = P.el.offsetHeight, gap = 6;
    // on the page itself (not inside a dialog), scroll a little so the calendar fits below its button
    if (first && window.innerHeight - r.bottom < h + gap + 8 && !anchor.closest('.modal-back')) {
      const by = Math.min(h + gap + 8 - (window.innerHeight - r.bottom), r.top - 8, document.documentElement.scrollHeight - window.innerHeight - window.scrollY);
      if (by > 0) { window.scrollBy(0, by); r = anchor.getBoundingClientRect(); }
    }
    const below = window.innerHeight - r.bottom, top = below < h + gap && r.top > below ? r.top - h - gap : r.bottom + gap;
    P.el.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px'; // never off screen, even if it has to cover the button
    P.el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  }
  window.addEventListener('resize', () => { if (P && wide() === P.el.classList.contains('dp-sheet')) close(false); else place(); });
  document.addEventListener('scroll', e => { if (P && !P.el.contains(e.target)) place(); }, true);
  document.addEventListener('pointerdown', e => {
    if (!P) return;
    if (P.el.contains(e.target) || P.c.triggers.some(t => t.contains(e.target))) return;
    close(false);
  }, true);

  // enhance now and whenever a screen or dialog adds date inputs
  const start = () => {
    enhance(document);
    new MutationObserver(() => { enhance(document); if (P && !P.c.inputs[0].isConnected) close(false); }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
