/* Core: state, persistence, routing, helpers, modal, toast */
(function () {
  const KEY = 'kalinaw-demo-v1';
  const { addDays, TODAY } = R.util;
  R.views = {};
  R.act = {};

  // ---------- state ----------
  R.load = function () {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.day === TODAY) { R.S = s; return; }
    } catch (e) { /* fall through */ }
    R.S = R.makeData(); R.S.day = TODAY; R.save();
  };
  R.save = () => { try { localStorage.setItem(KEY, JSON.stringify(R.S)); } catch (e) {} };
  R.reset = () => { localStorage.removeItem(KEY); R.load(); R.render(); R.toast('Sample data reset'); };

  // ---------- helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  R.esc = esc;
  R.money = n => 'A$' + Math.round(n).toLocaleString('en-AU');
  R.fmt = s => new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  R.fmtShort = s => new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  R.guest = id => R.S.guests.find(g => g.id === id) || { name: 'Unknown guest' };
  R.res = id => R.S.reservations.find(r => r.id === id);
  R.room = no => R.S.rooms.find(r => r.no === no);
  R.type = id => R.S.roomTypes.find(t => t.id === id);
  R.staff = id => R.S.staff.find(s => s.id === id) || { name: 'Unassigned' };
  R.dep = r => addDays(r.arrive, r.nights);
  R.total = r => r.folio.reduce((s, x) => s + x.amount, 0);
  R.balance = r => R.total(r) - r.paid;
  R.initials = n => n.split(' ').map(x => x[0]).join('').slice(0, 2);
  R.nextId = p => p + (++R.S.seq);
  R.live = () => R.S.reservations.filter(r => r.status !== 'cancelled');
  R.inhouseIn = no => R.S.reservations.find(r => r.room === no && r.status === 'inhouse');

  const overlaps = (a1, n1, a2, n2) => a1 < addDays(a2, n2) && a2 < addDays(a1, n1);
  R.roomFree = function (no, arrive, nights, exceptId) {
    const room = R.room(no);
    if (room.hk === 'ooo' && overlaps(arrive, nights, TODAY, 3)) return false;
    return !R.S.reservations.some(r => r.id !== exceptId && r.room === no && r.status !== 'cancelled' && r.status !== 'checkedout' && overlaps(arrive, nights, r.arrive, r.nights))
      && !R.S.reservations.some(r => r.id !== exceptId && r.room === no && r.status === 'checkedout' && R.dep(r) > arrive && r.arrive < addDays(arrive, nights));
  };
  R.freeRooms = (type, arrive, nights, exceptId) => R.S.rooms.filter(r => r.type === type && R.roomFree(r.no, arrive, nights, exceptId));
  // free rooms of a type minus unassigned bookings of that type that overlap
  R.typeAvail = function (type, arrive, nights) {
    const unassigned = R.S.reservations.filter(r => r.type === type && !r.room && r.status === 'booked' && overlaps(arrive, nights, r.arrive, r.nights)).length;
    return Math.max(0, R.freeRooms(type, arrive, nights).length - unassigned);
  };
  R.occupancyOn = function (day) {
    const sold = R.live().filter(r => r.arrive <= day && day < R.dep(r)).length;
    return { sold, pct: Math.round(sold / R.S.rooms.length * 100) };
  };
  R.chip = function (status) {
    const m = {
      booked: ['teal', 'Booked'], inhouse: ['ink', 'In house'], checkedout: ['', 'Checked out'], cancelled: ['red', 'Cancelled'],
      clean: ['green', 'Clean'], inspected: ['teal', 'Ready'], dirty: ['amber', 'Needs cleaning'], ooo: ['red', 'Out of order'],
      new: ['red', 'New'], open: ['amber', 'Open'], in_progress: ['teal', 'In progress'], waiting: ['amber', 'Waiting on parts'], done: ['green', 'Done'],
      urgent: ['red', 'Urgent'], high: ['amber', 'High'], medium: ['', 'Medium'], low: ['', 'Low'], confirmed: ['green', 'Confirmed']
    }[status] || ['', status];
    return `<span class="chip ${m[0]}">${m[1]}</span>`;
  };

  // ---------- navigation ----------
  const NAV = [
    { grp: null, items: [['overview', '✦', 'Start here']] },
    { grp: 'Daily operations', items: [['today', '☀', 'Today'], ['frontdesk', '🛎', 'Front desk'], ['reservations', '📖', 'Reservations'], ['calendar', '▦', 'Room calendar'], ['map', '🗺', 'Property map'], ['housekeeping', '🧺', 'Housekeeping'], ['requests', '💬', 'Guest requests']] },
    { grp: 'Guest services', items: [['activities', '🌊', 'Activities & spa'], ['dining', '🍽', 'Restaurant & bar'], ['guests', '👤', 'Guests']] },
    { grp: 'Back office', items: [['maintenance', '🔧', 'Maintenance'], ['staff', '🗓', 'Staff roster'], ['reports', '📈', 'Reports'], ['channels', '🔗', 'Booking channels'], ['setup', '⚙', 'Rooms & rates']] },
    { grp: 'Guest side', items: [['guestapp', '📱', 'Guest phone app']] }
  ];
  const ROLES = {
    manager: null,
    frontdesk: ['overview', 'today', 'frontdesk', 'reservations', 'calendar', 'map', 'requests', 'activities', 'guests', 'guestapp'],
    housekeeping: ['overview', 'housekeeping', 'map', 'requests', 'maintenance'],
    fnb: ['overview', 'dining', 'activities', 'requests'],
    guest: ['guestapp']
  };
  R.role = 'manager';
  R.params = {};

  function badge(id) {
    if (id === 'requests') return R.S.requests.filter(q => q.status === 'new').length;
    if (id === 'frontdesk') return R.live().filter(r => r.status === 'booked' && r.arrive === TODAY).length;
    if (id === 'maintenance') return R.S.tickets.filter(t => t.status !== 'done' && t.priority === 'urgent').length;
    return 0;
  }
  function renderNav(cur) {
    const allow = ROLES[R.role];
    let h = '';
    NAV.forEach(g => {
      const items = g.items.filter(i => !allow || allow.includes(i[0]));
      if (!items.length) return;
      if (g.grp) h += `<div class="grp">${g.grp}</div>`;
      items.forEach(([id, ico, label]) => {
        const b = badge(id);
        h += `<a href="#${id}" class="${id === cur ? 'on' : ''}" ${id === cur ? 'aria-current="page"' : ''}><span class="ico" aria-hidden="true">${ico}</span>${label}${b ? `<span class="count">${b}</span>` : ''}</a>`;
      });
    });
    document.getElementById('nav').innerHTML = h;
  }

  R.go = function (view, params) { R.params = params || {}; if (location.hash === '#' + view) R.render(); else location.hash = view; };
  R.current = function () {
    let v = location.hash.slice(1) || 'overview';
    const allow = ROLES[R.role];
    if (!R.views[v] || (allow && !allow.includes(v))) v = allow ? allow[0] : 'overview';
    return v;
  };
  R.render = function () {
    const id = R.current(), v = R.views[id];
    renderNav(id);
    document.getElementById('pageTitle').textContent = v.title;
    document.getElementById('pageHint').textContent = v.hint || '';
    const how = document.getElementById('howPanel');
    how.innerHTML = v.how ? `<h3>How ${esc(v.title.toLowerCase())} works</h3><ol>${v.how.map(s => `<li>${s}</li>`).join('')}</ol>` : '';
    document.getElementById('howBtn').style.display = v.how ? '' : 'none';
    const el = document.getElementById('view');
    el.innerHTML = v.render(el) || '';
    if (v.mount) v.mount(el);
    document.getElementById('side').classList.remove('open');
  };
  R.rerender = () => { R.save(); R.render(); };

  // ---------- modal + toast ----------
  R.modal = function (title, html, mount) {
    document.getElementById('modalTitle').textContent = title;
    const body = document.getElementById('modalBody');
    body.innerHTML = html;
    document.getElementById('modalBack').hidden = false;
    if (mount) mount(body);
    const f = body.querySelector('input,select,textarea,button');
    if (f) f.focus();
  };
  R.closeModal = () => { document.getElementById('modalBack').hidden = true; };
  R.toast = function (msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  };

  // ---------- events ----------
  function delegate(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = R.act[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
  }

  R.start = function () {
    R.load();
    document.getElementById('todayLabel').textContent = R.fmt(TODAY);
    document.addEventListener('click', delegate);
    document.addEventListener('change', e => {
      const el = e.target.closest('[data-change]');
      if (el && R.act[el.dataset.change]) R.act[el.dataset.change](el.dataset, el, e);
    });
    window.addEventListener('hashchange', R.render);
    document.getElementById('roleSelect').addEventListener('change', e => { R.role = e.target.value; location.hash = ''; R.render(); R.toast('Now viewing as: ' + e.target.selectedOptions[0].text); });
    document.getElementById('resetDemo').addEventListener('click', () => { if (confirm('Reset all sample data back to the start?')) R.reset(); });
    document.getElementById('howBtn').addEventListener('click', e => {
      const p = document.getElementById('howPanel'); p.hidden = !p.hidden; e.target.setAttribute('aria-expanded', String(!p.hidden));
    });
    document.getElementById('modalClose').addEventListener('click', R.closeModal);
    document.getElementById('modalBack').addEventListener('click', e => { if (e.target.id === 'modalBack') R.closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') R.closeModal(); });
    document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('side').classList.toggle('open'));
    R.render();
  };
})();
