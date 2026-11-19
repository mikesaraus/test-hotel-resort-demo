/* Core: state, business date, roles & permissions, routing, helpers, dialogs, search, audit log */
(function () {
  const KEY = 'camsair-pms-mockup-v4';
  const { addDays, daysBetween, realToday } = R.util;
  R.views = {};
  R.act = {};

  // ---------- state ----------
  // Data is kept across days. The business date only moves when the night audit is run.
  R.load = function () {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 4) { R.S = R.migrate(s); return; } } catch (e) { /* fall through */ }
    R.S = R.migrate(R.makeData()); R.save();
  };
  // bring older saved data up to date (map layout, task history, modules)
  R.migrate = function (S) {
    if (!S.zones.some(z => z.kind)) {
      const span = { main: 3, family: 3, pool: 3, villa: 2, barkada: 1 };
      S.zones.forEach(z => { z.kind = 'building'; z.span = span[z.id] || 3; });
      S.zones.splice(S.zones.findIndex(z => z.id === 'family') + 1, 0, { id: 'Z-pool', name: 'Swimming pool', kind: 'feature', style: 'pool', span: 6 });
    }
    if (S.modules.roster === undefined) S.modules.roster = false;
    if (S.rules.guestEntranceFree === undefined) S.rules.guestEntranceFree = true;
    if (S.sources && !S.sources.some(x => x.name === 'Website')) S.sources.splice(0, 0, { name: 'Website', commission: 0 });
    // older seasons: "MM-DD to MM-DD, weeknights" → the new format (Holy Week now follows Easter)
    S.seasons.forEach(s => {
      if (s.when) return;
      s.when = /holy week/i.test(s.name) ? { type: 'easter', from: -3, to: 0 } : { type: 'yearly', from: s.from, to: s.to };
      s.days = s.weekdays ? [0, 1, 2, 3, 4] : null; s.scope = /holy week|christmas/i.test(s.name) ? 'both' : 'rooms'; s.time = null; s.active = true;
      delete s.from; delete s.to; delete s.weekdays; delete s.note;
    });
    if (!S.vouchers) S.vouchers = [
      { code: 'CAMSAIR10', label: '10% off cottage', kind: 'pct', value: 10, active: true, uses: 0 },
      { code: 'REPEAT500', label: '₱500 off cottage (repeat guest)', kind: 'amt', value: 500, active: true, uses: 0 },
      { code: 'FREEKUBO', label: 'Free kubo (promo)', kind: 'pct', value: 100, active: false, uses: 0 }];
    S.tasks.forEach(t => { if (!t.history) t.history = []; if (!t.since) t.since = t.created; });
    const wait = S.tasks.find(t => t.id === 'T301');
    if (wait && wait.status === 'waiting' && !wait.expected) Object.assign(wait, { expected: R.util.addDays(S.bd, -1), waitNote: 'Compressor part ordered from CDO supplier', since: R.util.addDays(S.bd, -2) });
    return S;
  };
  R.save = () => { try { localStorage.setItem(KEY, JSON.stringify(R.S)); } catch (e) { /* storage full or blocked */ } };
  // reload so half-finished sales and filters on screen are cleared too
  R.reset = () => { localStorage.removeItem(KEY); location.hash = ''; location.reload(); };
  R.bd = () => R.S.bd;

  // ---------- helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  R.esc = esc;
  R.money = n => (n < 0 ? '−₱' : '₱') + Math.abs(Math.round(n)).toLocaleString('en-PH');
  R.peso = n => (n < 0 ? '−₱' : '₱') + Math.abs(+n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  R.fmt = s => new Date(s + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' });
  R.fmtShort = s => new Date(s + 'T12:00:00').toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
  R.now = () => new Date().toTimeString().slice(0, 5);
  R.icon = (name, cls) => `<svg class="i ${cls || ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  R.guest = id => R.S.guests.find(g => g.id === id) || { name: 'Unknown guest', tag: '' };
  R.res = id => R.S.reservations.find(r => r.id === id);
  R.room = no => R.S.rooms.find(r => r.no === no);
  R.type = id => R.S.roomTypes.find(t => t.id === id);
  R.staff = id => R.S.staff.find(s => s.id === id) || { name: id === 'web' ? 'Booking website' : id === 'guest' ? 'Guest app' : 'Unassigned' };
  R.dep = r => addDays(r.arrive, r.nights);
  R.stayValue = r => r.rates.reduce((a, b) => a + b, 0);
  R.avgRate = r => r.rates.length ? R.stayValue(r) / r.rates.length : 0;
  R.lines = r => r.folio.filter(f => !f.void);
  R.total = r => R.lines(r).reduce((s, x) => s + x.amount, 0);
  R.paid = r => r.payments.reduce((s, p) => s + p.amount, 0);
  R.balance = r => Math.round((R.total(r) - R.paid(r)) * 100) / 100;
  // what the guest will owe by check-out if nothing else is added
  R.expectedBalance = r => {
    const posted = R.lines(r).filter(f => f.kind === 'night').length;
    return R.balance(r) + r.rates.slice(posted).reduce((a, b) => a + b, 0);
  };
  R.initials = n => n.split(' ').map(x => x[0]).join('').slice(0, 2);
  R.nextId = p => p + (++R.S.seq);
  R.nextOR = () => 'OR-' + String(++R.S.orSeq).padStart(6, '0');
  R.live = () => R.S.reservations.filter(r => r.status === 'booked' || r.status === 'inhouse' || r.status === 'checkedout');
  R.inhouse = () => R.S.reservations.filter(r => r.status === 'inhouse').sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }));
  R.inhouseIn = no => R.S.reservations.find(r => r.room === no && r.status === 'inhouse');
  R.group = id => R.S.groups.find(g => g.id === id);
  R.findGuest = id => R.S.guests.find(g => g.id === id);
  R.venue = id => R.S.dayuse.cottages.find(c => c.id === id);
  R.vPaid = v => v.payments.reduce((s, p) => s + p.amount, 0);
  R.saleAmount = s => s.amount != null ? s.amount : s.calc.total;
  R.shiftOf = (sid, date) => (R.S.roster[sid] || {})[date] || 'Off';
  // copy text: clipboard API, with a fallback for pages opened from a file
  R.copy = function (text) {
    const fallback = () => { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } t.remove(); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).catch(fallback); else fallback();
    R.toast('Copied. Paste it into Messenger or SMS.');
  };
  R.sourceFee = name => (R.S.sources.find(s => s.name === name) || { commission: 0 }).commission;

  const overlaps = (a1, n1, a2, n2) => a1 < addDays(a2, n2) && a2 < addDays(a1, n1);
  R.overlaps = overlaps;
  R.oooOn = (room, arrive, nights) => room.ooo && overlaps(arrive, nights, room.ooo.since < R.bd() ? R.bd() : room.ooo.since, Math.max(1, daysBetween(room.ooo.since < R.bd() ? R.bd() : room.ooo.since, room.ooo.until)));
  R.roomFree = function (no, arrive, nights, exceptId) {
    const room = R.room(no);
    if (R.oooOn(room, arrive, nights)) return false;
    return !R.S.reservations.some(r => r.id !== exceptId && r.room === no && (r.status === 'booked' || r.status === 'inhouse') && overlaps(arrive, nights, r.arrive, r.nights));
  };
  R.freeRooms = (type, arrive, nights, exceptId) => R.S.rooms.filter(r => (!type || r.type === type) && R.roomFree(r.no, arrive, nights, exceptId));
  R.typeAvail = function (type, arrive, nights, exceptId) {
    const unassigned = R.S.reservations.filter(r => r.id !== exceptId && r.type === type && !r.room && r.status === 'booked' && overlaps(arrive, nights, r.arrive, r.nights)).length;
    return Math.max(0, R.freeRooms(type, arrive, nights, exceptId).length - unassigned);
  };
  R.occupancyOn = function (day) {
    const sold = R.live().filter(r => r.arrive <= day && day < R.dep(r)).length;
    return { sold, pct: Math.round(sold / R.S.rooms.length * 100) };
  };

  // Room status is two separate things: is someone in it (occupancy) and is it clean (housekeeping).
  R.roomState = function (room) {
    const occ = !!R.inhouseIn(room.no);
    if (room.ooo) return { code: 'OOO', label: 'Out of order', cls: 'ooo', occ };
    const hk = room.hk === 'dirty' ? 'Dirty' : room.hk === 'inspected' ? 'Inspected' : 'Clean';
    return { code: (occ ? 'O' : 'V') + (room.hk === 'dirty' ? 'D' : room.hk === 'inspected' ? 'I' : 'C'), label: (occ ? 'Occupied' : 'Vacant') + ', ' + hk.toLowerCase(), cls: room.hk, occ, hk };
  };

  const CHIPS = {
    booked: ['teal', 'Booked'], inhouse: ['ink', 'In house'], checkedout: ['', 'Checked out'], cancelled: ['red', 'Cancelled'], noshow: ['red', 'No-show'],
    clean: ['green', 'Clean'], inspected: ['teal', 'Inspected'], dirty: ['amber', 'Dirty'], ooo: ['red', 'Out of order'],
    new: ['red', 'New'], in_progress: ['teal', 'In progress'], waiting: ['amber', 'Waiting on parts'], done: ['green', 'Done'],
    urgent: ['red', 'Urgent'], high: ['amber', 'High'], medium: ['', 'Medium'], low: ['', 'Low'], confirmed: ['green', 'Confirmed']
  };
  R.chipLabel = s => (CHIPS[s] || ['', s])[1];
  R.chip = s => { const m = CHIPS[s] || ['', s]; return `<span class="chip ${m[0]}">${m[1]}</span>`; };

  // ---------- audit log: every money and status change, with who did it ----------
  R.log = function (action, detail, ref, by) {
    R.S.audit.unshift({ date: R.bd(), at: R.now(), user: by || R.S.user, action, detail, ref: ref || '' });
    if (R.S.audit.length > 600) R.S.audit.length = 600;
  };

  // ---------- roles & permissions ----------
  const ALL = ['desk', 'reservations', 'guests', 'calendar', 'events', 'till', 'cashier', 'rooms', 'tasks', 'fnb', 'activities', 'guestapp', 'audit', 'reports', 'roster', 'settings'];
  const FO = ['book', 'checkin', 'pay', 'move', 'cancel', 'till', 'task', 'shift', 'activity'];
  R.ROLES = {
    owner: { name: 'Owner', screens: ALL, perms: '*', does: 'Everything, including users, modules and the audit log' },
    manager: { name: 'General manager', screens: ALL, perms: [...FO, 'void', 'refund', 'rate', 'fnb', 'hk', 'inspect', 'ooo', 'audit', 'settings', 'reports', 'roster'], does: 'All operations, rates and seasons, approves voids, refunds and rate changes' },
    supervisor: { name: 'Front office supervisor', screens: ALL.filter(x => x !== 'settings'), perms: [...FO, 'void', 'refund', 'rate', 'fnb', 'hk', 'inspect', 'ooo', 'audit', 'reports', 'roster'], does: 'Front desk, plus the front office roster, approving voids, refunds, rate changes and the night audit' },
    frontdesk: { name: 'Front desk cashier', screens: ['desk', 'reservations', 'guests', 'calendar', 'events', 'till', 'cashier', 'rooms', 'tasks', 'activities', 'guestapp'], perms: FO, does: 'Bookings, check-in and check-out, payments, day tour till, own shift' },
    nightaudit: { name: 'Night auditor', screens: ['audit', 'desk', 'reservations', 'guests', 'calendar', 'cashier', 'rooms', 'tasks', 'reports'], perms: ['book', 'checkin', 'pay', 'shift', 'task', 'audit', 'reports'], does: 'Closes the business day, no-shows, end-of-day reports' },
    hkhead: { name: 'Head housekeeper', screens: ['rooms', 'tasks', 'roster'], perms: ['hk', 'inspect', 'ooo', 'task', 'roster'], does: 'Room status, assigns attendants, inspects rooms, housekeeping roster' },
    housekeeping: { name: 'Room attendant', screens: ['rooms', 'tasks'], perms: ['hk', 'task'], does: 'Own room list, marks rooms cleaned' },
    maintenance: { name: 'Maintenance', screens: ['tasks', 'rooms'], perms: ['task', 'ooo'], does: 'Repairs, takes rooms out of order and back' },
    fnb: { name: 'Restaurant & bar', screens: ['fnb', 'tasks'], perms: ['fnb', 'task'], does: 'Restaurant and bar sales, charges to in-house rooms' },
    activities: { name: 'Pool & activities', screens: ['activities', 'tasks'], perms: ['activity', 'task'], does: 'Activity and spa bookings' },
    accountant: { name: 'Accountant (view only)', screens: ['reports', 'cashier', 'reservations', 'guests', 'events'], perms: ['reports'], does: 'Reports, receipts, VAT and unpaid balances. Cannot change anything' }
  };
  R.PERMS = {
    book: 'Make and change bookings', checkin: 'Check in and out', pay: 'Take payments and post charges', move: 'Move rooms', cancel: 'Cancel bookings',
    void: 'Void a charge', refund: 'Give a refund', rate: 'Change a room rate', till: 'Sell entrance, cottages and rentals', fnb: 'Ring up restaurant and bar sales',
    hk: 'Mark rooms cleaned', inspect: 'Inspect rooms', ooo: 'Take rooms out of order', task: 'Handle tasks', shift: 'Open and close cashier shifts',
    activity: 'Book activities', audit: 'Run the night audit', reports: 'See reports', settings: 'Change rates, seasons and house rules', roster: 'Change the staff roster', admin: 'Manage users and modules'
  };
  R.user = () => R.staff(R.S.user);
  R.roleKey = () => R.user().roleKey;
  R.roleOf = s => R.ROLES[s.roleKey];
  R.canAs = (s, p) => { const r = R.ROLES[s.roleKey]; return r.perms === '*' || r.perms.includes(p); };
  R.can = p => R.canAs(R.user(), p);
  R.screens = () => R.ROLES[R.roleKey()].screens.filter(v => !(v in R.S.modules) || R.S.modules[v]);

  // A risky action: always asks why. If the signed-in user isn't allowed, a supervisor approves with their PIN.
  R.authorize = function (o, done) {
    const allowed = R.can(o.perm);
    const approvers = R.S.staff.filter(s => s.active && R.canAs(s, o.perm));
    R.modal(o.title, `${o.body || ''}
      ${o.reason !== false ? `<label class="field" style="margin-top:12px">Reason (required, kept in the audit log)<textarea id="azReason" rows="2" placeholder="${esc(o.placeholder || 'Why is this needed?')}"></textarea></label>` : ''}
      ${allowed ? '' : `<div class="note warn" style="margin-top:12px">${R.icon('lock')}<div><b>Needs approval.</b> ${esc(R.ROLES[R.roleKey()].name)} can't ${esc(R.PERMS[o.perm].toLowerCase())}. A supervisor enters their PIN here.</div></div>
        <div class="form" style="margin-top:10px"><label class="field">Approved by<select id="azWho">${approvers.map(s => `<option value="${s.id}">${esc(s.name)}, ${esc(s.title)}</option>`).join('')}</select></label>
        <label class="field">PIN<input id="azPin" type="password" inputmode="numeric" autocomplete="off" placeholder="Mockup PIN is 1234"></label></div>`}
      <p class="small warn-text" id="azErr" style="min-height:1.4em;margin-top:6px"></p>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Back</button><button class="btn ${o.danger ? 'warn' : ''}" id="azGo">${esc(o.ok || 'Confirm')}</button></div>`, b => {
      if (o.mount) o.mount(b);
      b.querySelector('#azGo').onclick = () => {
        const err = m => { b.querySelector('#azErr').textContent = m; };
        const reason = o.reason !== false ? b.querySelector('#azReason').value.trim() : '';
        if (o.reason !== false && reason.length < 3) return err('Write a short reason first.');
        if (o.check) { const m = o.check(b); if (m) return err(m); }
        let by = R.S.user;
        if (!allowed) {
          by = b.querySelector('#azWho').value;
          if (b.querySelector('#azPin').value !== R.staff(by).pin) return err('Wrong PIN.');
        }
        R.closeModal();
        done({ reason, by, body: b });
      };
    });
  };

  // ---------- navigation ----------
  const NAV = [
    { grp: 'Rooms', items: [['desk', 'desk', 'Front desk'], ['reservations', 'book', 'Reservations'], ['calendar', 'calendar', 'Room calendar'], ['guests', 'users', 'Guests']] },
    { grp: 'Day tour', items: [['till', 'ticket', 'Day pass'], ['events', 'flag', 'Cottage reservations']] },
    { grp: 'Cash & closing', items: [['cashier', 'cash', 'Cashier'], ['audit', 'moon', 'Night audit']] },
    { grp: 'Housekeeping', items: [['rooms', 'bed', 'Room status'], ['tasks', 'check', 'Tasks']] },
    { grp: 'Outlets', items: [['fnb', 'cup', 'Restaurant & bar'], ['activities', 'sun', 'Activities & spa'], ['guestapp', 'phone', 'Guest app']] },
    { grp: 'Management', items: [['reports', 'chart', 'Reports'], ['roster', 'clock', 'Staff roster'], ['settings', 'gear', 'Settings']] }
  ];
  R.param = '';
  function badge(id) {
    const bd = R.bd();
    if (id === 'tasks') { const k = R.roleKey(); return R.S.tasks.filter(t => (t.status === 'new' || (t.status !== 'done' && R.taskFlag(t) && R.taskFlag(t)[0] === 'red')) && (k === 'maintenance' ? t.dept === 'Maintenance' : k === 'hkhead' || k === 'housekeeping' ? t.dept === 'Housekeeping' : true)).length; }
    if (id === 'desk') return R.S.reservations.filter(r => r.status === 'booked' && r.arrive <= bd).length;
    if (id === 'audit') return bd < realToday() ? '!' : 0;
    if (id === 'events') return R.S.venueBookings.filter(v => v.date === bd && v.status === 'booked').length;
    return 0;
  }
  function renderNav(cur) {
    const allow = R.screens();
    let h = '';
    NAV.forEach(g => {
      const items = g.items.filter(i => allow.includes(i[0]));
      if (!items.length) return;
      h += `<div class="grp">${g.grp}</div>`;
      items.forEach(([id, ico, label]) => {
        const b = badge(id), on = id === cur || ((cur === 'booking' || cur === 'group') && id === 'reservations') || (cur === 'guest' && id === 'guests');
        h += `<a href="#${id}" class="${on ? 'on' : ''}" ${on ? 'aria-current="page"' : ''}>${R.icon(ico)}${label}${b ? `<span class="count">${b}</span>` : ''}</a>`;
      });
    });
    document.getElementById('nav').innerHTML = h;
  }

  R.go = function (view, param) { const h = view + (param ? '/' + param : ''); if (location.hash === '#' + h) R.render(); else location.hash = h; };
  R.current = function () {
    const allow = R.screens();
    const [v, p] = location.hash.slice(1).split('/');
    R.param = p ? decodeURIComponent(p) : '';
    const detail = { booking: [R.res, 'reservations', 'desk'], group: [R.group, 'reservations', 'desk'], guest: [R.findGuest, 'guests', 'guests'] }[v];
    if (detail && detail[0](R.param) && (allow.includes(detail[1]) || allow.includes(detail[2]))) return v;
    return R.views[v] && allow.includes(v) ? v : allow[0];
  };
  // after a redraw, put keyboard focus back on the same control (same action and data)
  const focusKey = () => {
    const a = document.activeElement;
    if (!a || !a.closest || !a.closest('#view')) return null;
    if (a.id) return ['#' + CSS.escape(a.id)];
    if (!a.dataset.act) return null;
    const attrs = Object.keys(a.dataset).map(k => `[data-${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${CSS.escape(a.dataset[k])}"]`).join('');
    return [attrs, a.dataset.id ? `[data-id="${CSS.escape(a.dataset.id)}"]` : null];
  };
  R.render = function () {
    const keep = focusKey();
    const id = R.current(), v = R.views[id];
    renderNav(id);
    const u = R.user();
    const ub = document.getElementById('userBtn');
    ub.innerHTML = `<span class="avatar" aria-hidden="true">${R.initials(u.name)}</span><span class="who"><b>${esc(u.name)}</b><small>${esc(R.ROLES[u.roleKey].name)}</small></span><span class="chev" aria-hidden="true">${R.icon('chev')}</span>`;
    ub.title = 'Signed in as ' + u.name + '. Click to switch user';
    const late = R.bd() < realToday();
    const bz = document.getElementById('bizDate');
    bz.className = 'biz-date' + (late ? ' due' : '');
    bz.innerHTML = `<span class="top-ico" aria-hidden="true">${R.icon(late ? 'alert' : 'calendar')}</span><span><small>${late ? 'Night audit due' : 'Business date'}</small><b>${R.fmt(R.bd())}</b></span>`;
    bz.setAttribute('aria-label', `Business date ${R.fmt(R.bd())}${late ? ', night audit due' : ''}. Open night audit`);
    document.getElementById('pageTitle').textContent = typeof v.title === 'function' ? v.title() : v.title;
    document.getElementById('pageHint').textContent = v.hint || '';
    const el = document.getElementById('view');
    el.innerHTML = v.render(el) || '';
    if (v.mount) v.mount(el);
    if (keep && document.getElementById('modalBack').hidden) {
      const n = keep.map(k => k && el.querySelector(k)).find(Boolean);
      if (n) n.focus({ preventScroll: true });
    }
    document.getElementById('side').classList.remove('open');
  };
  R.rerender = () => { R.save(); R.render(); };

  // ---------- pieces shared by the booking forms (room booking, cottage reservation) ----------
  R.fx = {
    // one-tap choices: radios that look like chips. list = [[value, label, disabled?, extraClass?]]
    chips: (name, list, cur, legend) => `<fieldset class="nb-set"><legend>${legend}</legend><div class="nb-chips">${list.map(([v, l, off, cls]) => `<label class="nb-chip ${cls || ''}"><input type="radio" name="${name}" value="${esc(v)}" ${v === cur ? 'checked' : ''} ${off ? 'disabled' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>`,
    // a number with − and + buttons; the box can still be typed in
    count: (id, label, sub, v, min, max) => `<div class="nb-count"><label for="${id}"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</label><div class="nb-step">
      <button type="button" data-nbstep="-1" data-id="${id}" aria-label="One less ${label.toLowerCase()}" ${v <= min ? 'disabled' : ''}>−</button><input id="${id}" type="number" inputmode="numeric" value="${v}" min="${min}" max="${max}">
      <button type="button" data-nbstep="1" data-id="${id}" aria-label="One more ${label.toLowerCase()}" ${v >= max ? 'disabled' : ''}>+</button></div></div>`,
    // call from the form's click listener; returns true when it handled a − / + click
    step: (e, root) => { const s = e.target.closest('[data-nbstep]'); if (!s) return false; const i = root.querySelector('#' + s.dataset.id); i.value = Math.min(+i.max, Math.max(+i.min, (+i.value || 0) + +s.dataset.nbstep)); i.dispatchEvent(new Event('input', { bubbles: true })); return true; },
    stepState: root => root.querySelectorAll('[data-nbstep]').forEach(s => { const i = root.querySelector('#' + s.dataset.id); s.disabled = +s.dataset.nbstep < 0 ? +i.value <= +i.min : +i.value >= +i.max; }),
    radio: (root, name) => { const x = root.querySelector(`input[name="${name}"]:checked`); return x ? x.value : ''; },
    // errors next to the field
    clearErr: (root, id) => { const el = root.querySelector('#' + id), box = el && el.closest('.field'); if (!box) return; box.classList.remove('has-err'); el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); const m = box.querySelector(':scope > .err'); if (m) m.remove(); },
    setErr: (root, id, msg) => { const el = root.querySelector('#' + id), box = el.closest('.field'); R.fx.clearErr(root, id); box.classList.add('has-err'); el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', 'fxE-' + id); box.insertAdjacentHTML('beforeend', `<p class="err" id="fxE-${id}">${esc(msg)}</p>`); },
    // show every problem at once; the line by the buttons sums them up; focus goes to the first
    report: (root, errs, line) => {
      root.querySelectorAll('.field.has-err').forEach(f => { const i = f.querySelector('input,textarea,select'); if (i) R.fx.clearErr(root, i.id); });
      errs.forEach(([id, m]) => R.fx.setErr(root, id, m));
      line.textContent = errs.length ? (errs.length === 1 ? errs[0][1] : `Fix ${errs.length} things above. ${errs[0][1]}`) : '';
      if (errs.length) { const el = root.querySelector('#' + errs[0][0]), t = el.hidden && el.id && document.querySelector(`[data-for="${el.id}"]`); (t || el).focus(); }
      return !errs.length;
    },
    // deposit block shared by both booking forms: method, amount (50% filled in, can be more), reference unless cash, a payment note
    payBox: (p, methods) => `${R.fx.chips(p + 'Dep', [['', 'Not yet'], ...methods.map(m => [m, esc(m)])], '', 'Payment received')}
      <div class="fx-pay" id="${p}PayW" hidden><div class="form">
        <label class="field">Amount received (₱)<input id="${p}Amt" type="number" inputmode="numeric" min="0"></label>
        <label class="field" id="${p}RefW">Payment reference<input id="${p}Ref" spellcheck="false" placeholder="GCash or bank reference number"></label></div>
        <div class="fx-quick" id="${p}Quick"></div><p class="fx-hint" id="${p}AmtHint" aria-live="polite"></p>
        <label class="field">Payment note <span class="muted">(optional)</span><input id="${p}PayNote" placeholder="e.g. sent in 2 transfers, paid by Juan Dela Cruz"></label></div>`,
    // the behaviour behind payBox; root is the form (new for every dialog)
    pay: (root, p) => {
      const $ = s => root.querySelector(s);
      let touched = false;
      root.addEventListener('input', e => { if (e.target.id === p + 'Amt') touched = true; });
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-fxamt]'); if (!b) return;
        const i = $('#' + p + 'Amt'); i.value = b.dataset.v; touched = true; i.dispatchEvent(new Event('input', { bubbles: true }));
      });
      return {
        // need = the deposit asked for, total = the whole price, where = 'at check-in' / 'on the day'; returns the amount entered
        update(method, need, total, where) {
          $('#' + p + 'PayW').hidden = !method; $('#' + p + 'RefW').hidden = !method || method === 'Cash';
          const i = $('#' + p + 'Amt');
          if (!touched) i.value = method === 'Prepaid on booking site' ? total : need;
          const a = Math.round(+i.value || 0);
          $('#' + p + 'Quick').innerHTML = [[need, `${R.S.rules.deposit}% deposit, ${R.money(need)}`], [total, `Full amount, ${R.money(total)}`]].map(([v, l]) => `<button type="button" class="fx-q" data-fxamt data-v="${v}" aria-pressed="${a === v}">${l}</button>`).join('');
          $('#' + p + 'AmtHint').className = 'fx-hint' + (a > total ? ' bad' : '');
          $('#' + p + 'AmtHint').textContent = !method || !a ? '' : a > total ? `That's more than the total of ${R.money(total)}.` : a === total ? 'Paid in full.'
            : a < need ? `${R.money(need - a)} less than the ${R.S.rules.deposit}% deposit. ${R.money(total - a)} left to pay ${where}.`
            : a > need ? `${R.money(a - need)} more than the deposit. ${R.money(total - a)} left to pay ${where}.` : `${R.money(total - a)} left to pay ${where}.`;
          return method ? a : 0;
        },
        check(add, method, total) {
          if (!method) return;
          const a = +$('#' + p + 'Amt').value || 0;
          if (!(a > 0)) add(p + 'Amt', 'Enter the amount received.');
          else if (a > total) add(p + 'Amt', `That's more than the total of ${R.money(total)}. Check the amount.`);
          if (method !== 'Cash' && $('#' + p + 'Ref').value.trim().length < 4) add(p + 'Ref', 'Enter the payment reference number.');
        },
        note: () => $('#' + p + 'PayNote').value.trim(), ref: () => $('#' + p + 'Ref').value.trim()
      };
    },
    time12: t => { const [h, m] = t.split(':').map(Number); return `${(h + 11) % 12 + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : h === 12 && !m ? 'noon' : 'pm'}`; },
    plural: (n, w, ws) => `${n} ${n === 1 ? w : ws || w + 's'}`
  };

  // ---------- modal (focus stays inside, returns to where it was) + toast ----------
  let lastFocus = null, onClose = null;
  R.modal = function (title, html, mount, opts) {
    const back = document.getElementById('modalBack');
    if (back.hidden) lastFocus = document.activeElement;
    onClose = null;
    document.getElementById('modalTitle').textContent = title;
    // tall: the dialog fits the window, only the form scrolls, the header and the buttons stay put
    document.querySelector('#modalBack .modal').className = 'modal' + (opts && opts.wide ? ' wide' : '') + (opts && opts.tall ? ' tall' : '');
    // a fresh body each time, so listeners added by the last dialog don't run again in this one
    const old = document.getElementById('modalBody'), body = old.cloneNode(false);
    old.replaceWith(body);
    body.innerHTML = html;
    back.hidden = false;
    if (mount) mount(body);
    const f = body.querySelector('[autofocus]') || body.querySelector('input:not([type=checkbox]):not([type=radio]),select,textarea') || body.querySelector('button');
    if (f) f.focus();
  };
  R.closeModal = () => {
    const back = document.getElementById('modalBack');
    if (back.hidden) return;
    back.hidden = true;
    if (onClose) { const f = onClose; onClose = null; f(); }
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  };
  R.act.closeModal = () => R.closeModal();
  // a toast can carry an Undo button for quick mistakes (room marked clean by accident, etc.)
  R.toast = function (msg, kind, undo) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    const span = document.createElement('span'); span.textContent = msg; t.appendChild(span);
    if (undo) {
      const b = document.createElement('button'); b.className = 'toast-undo'; b.textContent = 'Undo';
      b.onclick = () => { t.remove(); undo(); R.rerender(); R.toast('Undone'); };
      t.appendChild(b);
    }
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), undo ? 7000 : 3600);
  };
  // plain yes / no question without a reason
  R.confirm = function (title, text, ok, done, danger) {
    R.modal(title, `<p>${text}</p><div class="foot"><button class="btn ghost" data-act="closeModal">Back</button><button class="btn ${danger ? 'warn' : ''}" id="cfGo">${esc(ok)}</button></div>`, b => {
      b.querySelector('#cfGo').onclick = () => { R.closeModal(); done(); };
    });
  };

  // ---------- global search (Ctrl+K or /) ----------
  R.act.search = () => R.openSearch();
  R.openSearch = function () {
    R.modal('Search', `<input class="search big-search" id="qsIn" placeholder="Guest name, booking no. (CR-2105) or room (204)" autocomplete="off" autofocus>
      <div id="qsOut" class="qs-out" role="listbox"></div><p class="small muted" style="margin-top:8px">Enter opens the first result. Esc closes.</p>`, b => {
      const inp = b.querySelector('#qsIn'), out = b.querySelector('#qsOut');
      const run = () => {
        const q = inp.value.trim().toLowerCase();
        if (!q) { out.innerHTML = ''; return; }
        const res = [];
        R.S.rooms.filter(r => r.no.toLowerCase() === q || r.no.toLowerCase().startsWith(q)).slice(0, 4).forEach(r => {
          const st = R.roomState(r), ih = R.inhouseIn(r.no);
          res.push([`openRoom" data-no="${r.no}`, 'bed', `Room ${r.no}`, `${R.type(r.type).name} · ${st.label}${ih ? ' · ' + R.guest(ih.guestId).name : ''}`]);
        });
        if (R.screens().includes('guests')) R.S.guests.filter(g => g.name.toLowerCase().includes(q) || g.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')).slice(0, 3)
          .forEach(g => res.push([`openGuest" data-id="${g.id}`, 'users', g.name, `Guest profile · ${g.phone}${g.tag ? ' · ' + g.tag : ''}`]));
        R.S.reservations.filter(r => r.id.toLowerCase().includes(q) || R.guest(r.guestId).name.toLowerCase().includes(q))
          .sort((a, b) => ['inhouse', 'booked', 'checkedout', 'noshow', 'cancelled'].indexOf(a.status) - ['inhouse', 'booked', 'checkedout', 'noshow', 'cancelled'].indexOf(b.status) || b.arrive.localeCompare(a.arrive))
          .slice(0, 8).forEach(r => res.push([`openRes" data-id="${r.id}`, 'book', `${R.guest(r.guestId).name} · ${r.id}`, `${R.chipLabel(r.status)} · ${R.fmtShort(r.arrive)} → ${R.fmtShort(R.dep(r))}${r.room ? ' · room ' + r.room : ''}`]));
        out.innerHTML = res.map(([act, ico, a, s]) => `<button class="qs-item" data-act="${act}">${R.icon(ico)}<span><b>${esc(a)}</b><small>${esc(s)}</small></span></button>`).join('') || '<p class="empty">Nothing found</p>';
      };
      inp.addEventListener('input', run);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = out.querySelector('.qs-item'); if (f) f.click(); } });
    });
  };
  R.act.openRes = d => { R.closeModal(); R.go('booking', d.id); };
  R.act.openGuest = d => { R.closeModal(); R.go('guest', d.id); };
  R.act.openGroup = d => { R.closeModal(); R.go('group', d.id); };

  // ---------- switch user (the mockup's stand-in for signing in) ----------
  R.act.switchUser = () => {
    R.modal('Sign in as', `<p class="small muted" style="margin-bottom:10px">In the real system each person signs in with their own account. Pick someone to see exactly what their role can see and do.</p>
      <div class="user-list">${R.S.staff.filter(s => s.active).map(s => `<button class="qs-item ${s.id === R.S.user ? 'on' : ''}" data-act="pickUser" data-id="${s.id}"><span class="avatar sm">${R.initials(s.name)}</span><span><b>${esc(s.name)}</b><small>${esc(s.title)} · role: ${esc(R.ROLES[s.roleKey].name)}</small></span></button>`).join('')}</div>`);
  };
  R.act.pickUser = d => {
    R.S.user = d.id; R.closeModal(); R.save(); location.hash = ''; R.render();
    R.toast(`Signed in as ${R.user().name} (${R.ROLES[R.roleKey()].name})`);
  };

  // ---------- demo guide (mockup only) ----------
  R.act.guide = () => R.modal('Demo guide', `<p class="muted" style="margin-bottom:10px">Things to try. Use "Sign in as" (top right) to switch between staff.</p>
    ${[['Guest', 'Open "Guest booking site" in the sidebar: book a room or a cottage, then see it appear at the front desk.'],
       ['Kristine (front desk)', 'Check in an arrival. The registration card asks for an ID. Try one whose room is dirty.'],
       ['Kristine', 'Check out a departure with a balance. Payment comes first, then the receipt.'],
       ['Kristine', 'Open a booking, Bill tab, and void a charge. Dennis (supervisor) has to approve with PIN 1234.'],
       ['Kristine', 'Day pass: sell a day tour with a senior and a kubo. Try 10 guests in one kubo (it holds 8): a note is needed. Then close the shift under Cashier.'],
       ['Kristine', 'Reservations → Availability & groups: copy a quote for Messenger, then make a group booking with one bill.'],
       ['Kristine', 'Day pass: the Pavilion is reserved for the Acenas reunion. Tap it, start their sale, and see the deposit taken off.'],
       ['Kristine', 'Guests → Possible duplicates: open one and merge it. Then message a guest from their booking.'],
       ['Kristine', 'A checked-in guest wants a kubo: open their booking, press Use a cottage. Their people get in free, the kubo goes on the room bill. Try voucher CAMSAIR10.'],
       ['Aira (room attendant)', 'Mark a room cleaned. Then sign in as Lorna (head housekeeper) to inspect it.'],
       ['Jun (night auditor)', 'Run the night audit: no-shows, room nights posted, business date moves to tomorrow.'],
       ['Rosalie (manager)', 'Room status → Property map → Edit map: click a room to renumber it, change its type or price; + adds a room. Front desk shows tonight\'s prices straight away.'],
       ['Rodel (maintenance)', 'Tasks: the aircon in 205 is waiting on parts and overdue. Change a status from the list, or open a task to add an update.'],
       ['Teresa (owner)', 'Settings → Modules: switch on Staff roster (off for now).'],
       ['Rosalie (manager)', 'Settings → Seasons: add a ready-made Philippine season (Holy Week follows Easter by itself), and see the 12-month price calendar.'],
       ['Joy (accountant)', 'View only: try to change anything.']].map(([w, t]) => `<div class="list-item"><span class="chip">${esc(w)}</span><div class="grow small">${esc(t)}</div></div>`).join('')}
    <p class="small muted" style="margin-top:10px">Mockup only: prices, rooms, staff and guests are sample data saved in this browser.</p>`);

  // ---------- events ----------
  function delegate(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = R.act[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
  }
  function trap(e) {
    const back = document.getElementById('modalBack');
    if (back.hidden || e.key !== 'Tab') return;
    const f = [...back.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }

  R.start = function () {
    R.load();
    document.addEventListener('click', delegate);
    document.addEventListener('change', e => {
      const el = e.target.closest('[data-change]');
      if (el && R.act[el.dataset.change]) R.act[el.dataset.change](el.dataset, el, e);
    });
    window.addEventListener('hashchange', R.render);
    window.addEventListener('storage', e => {
      if (e.key !== KEY || !e.newValue) return;
      const before = R.S.reservations.length + R.S.venueBookings.length;
      R.load(); R.render();
      const added = R.S.reservations.length + R.S.venueBookings.length - before;
      if (added > 0) R.toast(`${added} new booking${added > 1 ? 's' : ''} from the website`);
    });
    document.getElementById('resetDemo').addEventListener('click', () => R.confirm('Reset sample data?', 'All changes in this browser are lost and the demo starts over.', 'Reset', R.reset, true));
    document.getElementById('modalClose').addEventListener('click', R.closeModal);
    document.getElementById('modalBack').addEventListener('mousedown', e => { if (e.target.id === 'modalBack') R.closeModal(); });
    document.addEventListener('keydown', e => {
      trap(e);
      if (e.key === 'Escape') R.closeModal();
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); R.openSearch(); }
    });
    document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('side').classList.toggle('open'));
    R.render();
  };
})();
