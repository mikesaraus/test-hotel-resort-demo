/* Front desk: the till (day tour, cottages, rentals), check-in / check-out lists, shift & cash.
   This is the first screen front desk staff see. */
(function () {
  const { TODAY } = R.util;
  const esc = R.esc;
  const now = () => new Date().toTimeString().slice(0, 5);
  const cat = () => R.S.dayuse;
  const METHODS = [['cash', 'Cash'], ['gcash', 'GCash'], ['maya', 'Maya'], ['card', 'Card'], ['room', 'Charge to room']];
  const methodName = m => (METHODS.find(x => x[0] === m) || [m, m])[1];
  const PAX = [['adult', 'Adult', 'over 12'], ['child', 'Child', '3 to 12'], ['senior', 'Senior / PWD', 'ID needed, 20% off'], ['toddler', 'Below 3', 'free']];

  const nowSession = () => new Date().getHours() >= 17 ? 'night' : 'day';
  const blank = () => ({ session: nowSession(), pax: { adult: 0, child: 0, senior: 0, toddler: 0 }, cottages: [], items: [], method: 'cash', tendered: '', ref: '', seniorId: '', roomRes: '', name: '' });
  let T = blank();
  let fdTab = 'sell', fdQ = '', extraCat = 'Rentals';

  const calc = () => R.calcTicket(T, cat());
  const isEmpty = () => !calc().lines.length;
  const saleOf = id => R.S.sales.find(s => s.id === id);
  const shiftSales = () => R.S.sales.filter(s => s.shift === R.S.shift.id);

  function problem(c) {
    if (!c.lines.length) return 'Add guests or items to start a sale';
    if (T.cottages.length && !c.heads) return 'Add the number of guests for the cottage';
    if (T.pax.senior && !T.seniorId.trim()) return 'Enter the senior / PWD ID number';
    if (T.method === 'cash' && c.total > 0 && !(+T.tendered >= c.total)) return 'Cash received is less than the total';
    if ((T.method === 'gcash' || T.method === 'maya') && c.total > 0 && T.ref.trim().length < 4) return `Enter the ${methodName(T.method)} reference number`;
    if (T.method === 'room' && !T.roomRes) return 'Choose the room to charge';
    return '';
  }

  // ---------- actions ----------
  R.act.fdTab = d => { fdTab = d.tab; R.render(); };
  R.act.fdSession = d => { T.session = d.s; R.render(); };
  R.act.fdPax = d => { T.pax[d.k] = Math.max(0, T.pax[d.k] + +d.n); R.render(); };
  R.act.fdExtraCat = d => { extraCat = d.c; R.render(); };
  R.act.fdItem = d => {
    const l = T.items.find(x => x.id === d.id);
    if (l) l.qty += +d.n; else if (+d.n > 0) T.items.push({ id: d.id, qty: 1 });
    T.items = T.items.filter(x => x.qty > 0); R.render();
  };
  R.act.fdCottage = d => {
    const used = R.S.cottageUse[d.id];
    if (used) return openCottage(d.id);
    T.cottages = T.cottages.includes(d.id) ? T.cottages.filter(x => x !== d.id) : T.cottages.concat(d.id);
    R.render();
  };
  R.act.fdMethod = d => { T.method = d.m; R.render(); };
  R.act.fdTender = d => { T.tendered = d.v === 'exact' ? String(calc().total) : d.v; R.render(); };
  R.act.fdClear = () => { T = blank(); R.render(); };
  R.act.fdComplete = () => {
    const c = calc(), why = problem(c);
    if (why) return R.toast(why);
    const room = T.method === 'room' ? R.res(T.roomRes) : null;
    const sale = {
      id: R.nextId('SL'), or: room ? '' : 'OR-' + String(++R.S.orSeq).padStart(6, '0'), date: TODAY, at: now(),
      shift: R.S.shift.id, cashier: R.S.shift.cashier, session: T.session, pax: { ...T.pax }, cottages: T.cottages.slice(),
      items: T.items.map(x => ({ ...x })), name: T.name.trim(), calc: c, method: T.method,
      tendered: T.method === 'cash' ? +T.tendered : c.total, change: T.method === 'cash' ? Math.round((+T.tendered - c.total) * 100) / 100 : 0,
      ref: T.ref.trim(), seniorId: T.seniorId.trim(), resId: room ? room.id : ''
    };
    if (room) room.folio.push({ date: TODAY, desc: `Front desk: ${c.lines.map(l => l.qty + '× ' + l.name).join(', ')}`, dept: 'Day tour & cottages', amount: c.total });
    R.S.sales.unshift(sale);
    sale.cottages.forEach(id => { R.S.cottageUse[id] = sale.id; });
    T = blank(); R.rerender();
    R.toast(room ? `${R.peso(c.total)} charged to room ${room.room}` : `Sale ${sale.or} complete${sale.change > 0 ? ' · change ' + R.peso(sale.change) : ''}`);
    if (!room) receipt(sale.id);
  };
  R.act.fdReceipt = d => receipt(d.id);
  R.act.fdRelease = d => {
    delete R.S.cottageUse[d.id]; R.closeModal(); R.rerender();
    R.toast(`${cat().cottages.find(x => x.id === d.id).name} is free again`);
  };
  R.act.fdReprint = () => R.toast('Sent to the receipt printer');
  R.act.fdXRead = () => R.toast('X-reading sent to the receipt printer');
  R.act.fdCloseShift = () => {
    if (!confirm('Close this shift? Make sure the cash is counted first.')) return;
    const old = R.S.shift, next = old.cashier === 'S3' ? 'S4' : 'S3';
    R.S.shiftsClosed.push({ ...old, closed: now() });
    R.S.shift = { id: R.nextId('SH'), cashier: next, opened: now(), float: 2000 };
    fdTab = 'sell'; R.rerender();
    R.toast(`Shift closed. ${R.staff(next).name} is now on the till with a ₱2,000 float.`);
  };

  function openCottage(id) {
    const c = cat().cottages.find(x => x.id === id), s = saleOf(R.S.cottageUse[id]);
    R.modal(c.name, `<dl class="kv">
      <dt>Rented to</dt><dd>${esc(s.name || 'Walk-in group')} · ${s.calc.heads} guests</dd>
      <dt>Since</dt><dd>${s.at} (${s.session === 'day' ? 'day tour' : 'night swim'})</dd>
      <dt>Receipt</dt><dd>${s.or ? `<a href="#" data-act="fdReceipt" data-id="${s.id}">${s.or}</a>` : 'Charged to room'}</dd>
      <dt>Size</dt><dd>${c.kind}, up to ${c.cap} people · ${R.money(c.price)}</dd></dl>
      <p class="small muted" style="margin-top:10px">Free the cottage when the group leaves so the next group can rent it.</p>
      <div class="foot"><button class="btn ghost" data-act="newTicket" data-room="${esc(c.name)}">Report a problem</button><button class="btn" data-act="fdRelease" data-id="${id}">Group has left, free cottage</button></div>`);
  }

  function receipt(id) {
    const s = saleOf(id), c = s.calc;
    const row = (a, b, cls) => `<div class="rc-row ${cls || ''}"><span>${a}</span><span class="num">${b}</span></div>`;
    R.modal('Receipt ' + s.or, `<div class="receipt">
      <div class="rc-head"><strong>CAMSAIR</strong><span class="brand-rule" aria-hidden="true"><i></i>RESORT<i></i></span>
      <small>Brgy. San Pedro, Initao, Misamis Oriental<br>VAT Reg. TIN 000-000-000-00000 (sample)</small></div>
      ${row('Official receipt', s.or)}${row(R.fmt(s.date) + ' · ' + s.at, s.session === 'day' ? 'Day tour' : 'Night swim')}
      ${row('Cashier', esc(R.staff(s.cashier).name))}${s.name ? row('Guest', esc(s.name)) : ''}
      <hr>${c.lines.map(l => row(`${l.qty} × ${esc(l.name)}<br><small>@ ${R.peso(l.price)}</small>`, R.peso(l.amount))).join('')}
      <hr>${row('Gross amount', R.peso(c.gross))}
      ${c.scDisc ? row(`Less VAT, senior / PWD share`, '− ' + R.peso(c.vatRemoved)) + row(`Less 20% senior / PWD discount`, '− ' + R.peso(c.scDisc)) + row('Senior / PWD ID', esc(s.seniorId)) : ''}
      ${row('<b>Amount due</b>', '<b>' + R.peso(c.total) + '</b>', 'rc-total')}
      ${row('VATable sales', R.peso(c.vatable))}${row('VAT (12%)', R.peso(c.vat))}${row('VAT-exempt sales', R.peso(c.vatExempt))}
      <hr>${row(methodName(s.method), R.peso(s.tendered))}${s.method === 'cash' ? row('Change', R.peso(s.change)) : ''}${s.ref ? row('Reference no.', esc(s.ref)) : ''}
      ${c.heads ? `<p class="rc-band">Give ${c.heads} wristband${c.heads > 1 ? 's' : ''}: <b>${s.session === 'day' ? 'yellow (day tour)' : 'blue (night swim)'}</b></p>` : ''}
      <p class="rc-foot">Thank you for visiting Camsair Resort!</p></div>
      <div class="foot"><button class="btn ghost" data-act="fdReprint">Print receipt</button><button class="btn" onclick="R.closeModal()">Done</button></div>`);
  }

  // ---------- render: the till ----------
  function sell() {
    const D = cat(), c = calc(), why = problem(c);
    const used = R.S.cottageUse;
    const todays = R.S.sales.filter(s => s.date === TODAY);
    const heads = todays.reduce((s, x) => s + x.calc.heads, 0);
    const free = D.cottages.filter(x => !used[x.id]).length;
    const arrivals = R.live().filter(r => r.status === 'booked' && r.arrive <= TODAY).length;
    const departures = R.live().filter(r => r.status === 'inhouse' && R.dep(r) <= TODAY).length;
    const cashIn = R.S.shift.float + shiftSales().filter(s => s.method === 'cash').reduce((a, s) => a + s.calc.total, 0);
    const ent = D.entrance[T.session];
    const capPicked = T.cottages.reduce((s, id) => s + D.cottages.find(x => x.id === id).cap, 0);
    const over = T.cottages.length && c.heads > capPicked;

    const strip = `<div class="pulse pulse5">
      <div><b>${heads}</b><span>Day guests today</span></div>
      <div><b>${free} of ${D.cottages.length}</b><span>Cottages free</span></div>
      <div><b>${arrivals}</b><span><a href="#" data-act="fdTab" data-tab="arrivals">Check-ins waiting</a></span></div>
      <div><b>${departures}</b><span><a href="#" data-act="fdTab" data-tab="departures">Check-outs due</a></span></div>
      <div><b>${R.money(cashIn)}</b><span><a href="#" data-act="fdTab" data-tab="shift">Cash in drawer</a></span></div></div>`;

    const session = `<div class="seg" role="group" aria-label="Session">${[['day', 'Day tour', D.hours.day], ['night', 'Night swim', D.hours.night]].map(([k, l, h]) => `<button class="${T.session === k ? 'on' : ''}" aria-pressed="${T.session === k}" data-act="fdSession" data-s="${k}"><b>${l}</b><small>${h}</small></button>`).join('')}</div>`;

    const pax = `<div class="pax">${PAX.map(([k, l, sub]) => {
      const price = k === 'toddler' ? 0 : k === 'child' ? ent.child : ent.adult;
      return `<div class="pax-card ${T.pax[k] ? 'has' : ''}"><div><b>${l}</b><small>${sub} · ${price ? R.money(price) : 'Free'}</small></div>
        <div class="stepper"><button data-act="fdPax" data-k="${k}" data-n="-1" aria-label="One less ${l}" ${T.pax[k] ? '' : 'disabled'}>−</button><output aria-live="polite">${T.pax[k]}</output><button data-act="fdPax" data-k="${k}" data-n="1" aria-label="One more ${l}">+</button></div></div>`;
    }).join('')}</div>`;

    const cottages = `<div class="cot-row">${D.cottages.map(x => {
      const s = used[x.id] && saleOf(used[x.id]), picked = T.cottages.includes(x.id);
      const state = s ? 'taken' : picked ? 'picked' : 'free';
      const label = s ? `${s.calc.heads} pax · since ${s.at}` : picked ? 'On this sale' : `Free · ${x.cap} pax`;
      return `<button class="cot ${state} ${x.kind === 'Pavilion' ? 'wide' : ''}" data-act="fdCottage" data-id="${x.id}" aria-pressed="${picked}" aria-label="${esc(x.name)}, ${label}">
        <span class="roof" aria-hidden="true"></span><b>${esc(x.name.replace('Family cottage', 'Family'))}</b><small>${label}</small><em>${R.money(x.price)}</em></button>`;
    }).join('')}</div>`;

    const extraCats = [...new Set(D.extras.map(x => x.cat))];
    const extras = `<div class="tabs tabs-sm">${extraCats.map(k => `<button class="${extraCat === k ? 'on' : ''}" data-act="fdExtraCat" data-c="${k}">${k}</button>`).join('')}</div>
      <div class="menu-grid">${D.extras.filter(x => x.cat === extraCat).map(x => { const q = (T.items.find(i => i.id === x.id) || {}).qty; return `<button class="menu-item ${q ? 'has' : ''}" data-act="fdItem" data-id="${x.id}" data-n="1"><b>${esc(x.name)}</b><span class="muted">${R.money(x.price)}</span>${q ? `<span class="qty">${q}</span>` : ''}</button>`; }).join('')}
      <button class="menu-item ghosty" data-act="newBooking" data-ch="Walk-in"><b>Overnight room</b><span class="muted">Walk-in booking</span></button></div>`;

    const lines = c.lines.length ? c.lines.map(l => `<div class="ticket-line"><span>${l.qty} × ${esc(l.name)}</span><b class="num">${R.peso(l.amount)}</b></div>`).join('')
      : '<p class="empty">Tap guests, a cottage or a rental to start</p>';
    const ih = R.S.reservations.filter(r => r.status === 'inhouse').sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }));
    const tot = c.total;
    const quick = [...new Set([Math.ceil(tot / 100) * 100, Math.ceil(tot / 500) * 500, Math.ceil(tot / 1000) * 1000])].filter(v => v > tot).slice(0, 3);
    const payBox = {
      cash: `<label class="field">Cash received<input id="fdTendered" type="number" inputmode="decimal" min="0" value="${esc(T.tendered)}" placeholder="0.00"></label>
        <div class="row" style="margin-top:6px"><button class="btn sm ghost" data-act="fdTender" data-v="exact">Exact</button>${quick.map(v => `<button class="btn sm ghost" data-act="fdTender" data-v="${v}">${R.money(v)}</button>`).join('')}</div>
        <div class="ticket-line change"><span>Change</span><b class="num" id="fdChange">${T.tendered !== '' && +T.tendered >= tot ? R.peso(+T.tendered - tot) : '—'}</b></div>`,
      gcash: `<label class="field">GCash reference no.<input id="fdRef" value="${esc(T.ref)}" placeholder="13-digit reference on the guest's phone"></label>`,
      maya: `<label class="field">Maya reference no.<input id="fdRef" value="${esc(T.ref)}" placeholder="Reference on the guest's phone"></label>`,
      card: '<p class="small muted">Tap or insert the card on the terminal, then complete the sale.</p>',
      room: `<label class="field">Room<select id="fdRoom"><option value="">Choose a room…</option>${ih.map(r => `<option value="${r.id}" ${T.roomRes === r.id ? 'selected' : ''}>Room ${r.room}, ${esc(R.guest(r.guestId).name)}</option>`).join('')}</select></label><p class="small muted" style="margin-top:6px">Goes on the room bill. The guest pays at check-out.</p>`
    }[T.method];

    const ticket = `<div class="panel ticket">
      <div class="ph"><h2>Current sale</h2><div class="sp"><button class="btn sm ghost" data-act="fdClear" ${isEmpty() ? 'disabled' : ''}>Clear</button></div></div>
      <label class="field" style="margin-bottom:8px">Group or guest name (optional)<input id="fdName" value="${esc(T.name)}" placeholder="e.g. Santos family"></label>
      ${lines}
      ${c.discount ? `<div class="ticket-line disc"><span>Senior / PWD discount and VAT exemption</span><b class="num">− ${R.peso(c.discount)}</b></div>` : ''}
      <div class="ticket-line total"><b>Total</b><b class="num">${R.peso(tot)}</b></div>
      ${T.pax.senior ? `<label class="field" style="margin-top:10px">Senior / PWD ID number${T.pax.senior > 1 ? 's' : ''}<input id="fdSenior" value="${esc(T.seniorId)}" placeholder="OSCA or PWD ID"></label>` : ''}
      ${over ? `<p class="small warn-text">${c.heads} guests, but the cottage${T.cottages.length > 1 ? 's hold' : ' holds'} ${capPicked}. Add another cottage or check with the supervisor.</p>` : ''}
      <div class="methods" role="group" aria-label="Payment method">${METHODS.map(([k, l]) => `<button class="${T.method === k ? 'on' : ''}" aria-pressed="${T.method === k}" data-act="fdMethod" data-m="${k}">${l}</button>`).join('')}</div>
      <div class="paybox">${payBox}</div>
      <button class="btn big" data-act="fdComplete" id="fdGo" ${why ? 'aria-disabled="true"' : ''}>${T.method === 'room' ? 'Charge ' + R.peso(tot) + ' to room' : 'Complete sale · ' + R.peso(tot)}</button>
      <p class="small muted" id="fdWhy" style="margin-top:6px;min-height:1.5em">${isEmpty() ? '' : esc(why)}</p>
    </div>`;

    const recent = `<div class="panel"><div class="ph"><h2>Sales today</h2><div class="sp small muted">${todays.length} sales · ${R.peso(todays.reduce((s, x) => s + x.calc.total, 0))}</div></div>
      <table><thead><tr><th>Time</th><th>Receipt</th><th>Guest</th><th>Cottage</th><th>Paid by</th><th class="right">Total</th></tr></thead><tbody>
      ${todays.map(s => `<tr class="click" data-act="${s.or ? 'fdReceipt' : 'openRes'}" data-id="${s.or ? s.id : s.resId}"><td class="num">${s.at}</td><td>${s.or || '<span class="chip">Room bill</span>'}</td><td>${esc(s.name || 'Walk-in')}<div class="small muted">${s.calc.heads} pax</div></td><td class="small">${s.cottages.map(id => esc(D.cottages.find(x => x.id === id).name)).join(', ') || '—'}</td><td>${methodName(s.method)}</td><td class="right num"><b>${R.peso(s.calc.total)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No sales yet today</td></tr>'}
      </tbody></table></div>`;

    return `${strip}<div class="grid g-till"><div class="stack">
        <div class="panel"><div class="ph"><h2>Guests</h2><div class="sp">${session}</div></div>${pax}</div>
        <div class="panel"><div class="ph"><h2>Cottages</h2><div class="sp small muted">Tap a free cottage to add it. Tap a rented one to see who has it.</div></div>${cottages}</div>
        <div class="panel"><h2>Rentals and fees</h2>${extras}</div>
      </div>${ticket}</div>
      <div style="margin-top:16px">${recent}</div>`;
  }

  // ---------- render: shift & cash ----------
  function shift() {
    const L = shiftSales(), sh = R.S.shift;
    const by = {}; L.forEach(s => { by[s.method] = (by[s.method] || 0) + s.calc.total; });
    const sum = k => L.reduce((a, s) => a + s.calc[k], 0);
    const cashExp = sh.float + (by.cash || 0);
    return `<div class="grid g2"><div class="panel"><h2>This shift</h2><dl class="kv">
        <dt>Cashier</dt><dd>${esc(R.staff(sh.cashier).name)}</dd><dt>Opened</dt><dd>${R.fmt(TODAY)}, ${sh.opened}</dd>
        <dt>Opening float</dt><dd>${R.peso(sh.float)}</dd><dt>Sales</dt><dd>${L.length} (${L.filter(s => s.or).length} receipts)</dd>
        <dt>Gross</dt><dd>${R.peso(sum('gross'))}</dd><dt>Senior / PWD</dt><dd>− ${R.peso(sum('discount'))}</dd>
        <dt>Net sales</dt><dd><b>${R.peso(sum('total'))}</b></dd><dt>VAT (12%)</dt><dd>${R.peso(sum('vat'))}</dd>
        <dt>Guests through the gate</dt><dd>${L.reduce((a, s) => a + s.calc.heads, 0)}</dd></dl></div>
      <div class="panel"><h2>Payments and cash count</h2>
        ${METHODS.map(([k, l]) => `<div class="ticket-line"><span>${l}</span><b class="num">${R.peso(by[k] || 0)}</b></div>`).join('')}
        <div class="ticket-line total"><b>Cash expected in drawer</b><b class="num">${R.peso(cashExp)}</b></div>
        <label class="field" style="margin-top:12px">Cash counted<input id="fdCount" type="number" min="0" placeholder="Count the drawer and enter the amount"></label>
        <p class="small" id="fdOver" style="margin-top:6px;min-height:1.5em"></p>
        <div class="row" style="margin-top:8px"><button class="btn ghost" data-act="fdXRead">Print X-reading</button><button class="btn" data-act="fdCloseShift">Close shift (Z-reading)</button></div>
        <p class="small muted" style="margin-top:10px">${R.S.shiftsClosed.length ? 'Closed today: ' + R.S.shiftsClosed.map(s => `${esc(R.staff(s.cashier).name)} ${s.opened}–${s.closed}`).join(', ') : 'No other shifts closed today.'}</p></div></div>`;
  }

  // ---------- render: reservations lists ----------
  function lists() {
    const L = R.live();
    const sets = { arrivals: L.filter(r => r.status === 'booked' && r.arrive <= TODAY), inhouse: L.filter(r => r.status === 'inhouse'), departures: L.filter(r => r.status === 'inhouse' && R.dep(r) <= TODAY) };
    const q = fdQ.toLowerCase();
    const rows = sets[fdTab].filter(r => !q || R.guest(r.guestId).name.toLowerCase().includes(q) || (r.room || '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    const act = r => {
      if (fdTab === 'arrivals') { const [ok, why] = R.canCheckIn(r); return ok ? `<button class="btn sm" data-act="checkIn" data-id="${r.id}">Check in</button>` : `<span class="small muted">${esc(why)}</span>`; }
      if (fdTab === 'departures') return `<button class="btn sm" data-act="checkOut" data-id="${r.id}">Check out · ${R.money(R.balance(r))}</button>`;
      return `<span class="num small">Balance ${R.money(R.balance(r))}</span>`;
    };
    return `<div class="panel"><div class="ph"><input class="search" id="fdSearch" placeholder="Search name, room or booking no." value="${esc(fdQ)}"><div class="sp"><button class="btn" data-act="newBooking" data-ch="Walk-in">Walk-in booking</button></div></div>
      <table><thead><tr><th>Guest</th><th>Room</th><th>Stay</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows.map(r => R.resRow(r, act(r))).join('') || '<tr><td colspan="5" class="empty">Nobody here right now</td></tr>'}</tbody></table></div>`;
  }

  R.views.frontdesk = {
    title: 'Front desk',
    hint: 'Sell day tours, cottages and rentals, check overnight guests in and out, and close the shift.',
    how: [
      'Pick the session first. Day tour and night swim have different entrance prices.',
      'Tap + for each guest, then tap a free cottage. The cottage board shows what is rented right now, so the same kubo is never sold twice.',
      'Senior citizens and PWDs: the discount and VAT exemption are worked out for you. Their ID number is required and printed on the receipt.',
      'Pay by cash (change is calculated), GCash or Maya (reference number required), card, or charge it to an overnight guest\'s room.',
      'The receipt tells you how many wristbands to hand out. At the end of the shift, count the drawer under "Shift & cash".'
    ],
    render() {
      const L = R.live();
      const n = { arrivals: L.filter(r => r.status === 'booked' && r.arrive <= TODAY).length, inhouse: L.filter(r => r.status === 'inhouse').length, departures: L.filter(r => r.status === 'inhouse' && R.dep(r) <= TODAY).length };
      const tabs = [['sell', 'Sell'], ['arrivals', `Check-ins (${n.arrivals})`], ['inhouse', `In house (${n.inhouse})`], ['departures', `Check-outs (${n.departures})`], ['shift', 'Shift & cash']];
      return `<div class="tabs fd-tabs">${tabs.map(([k, l]) => `<button class="${fdTab === k ? 'on' : ''}" data-act="fdTab" data-tab="${k}">${l}</button>`).join('')}
        <span class="sp small muted">On the till: <b>${esc(R.staff(R.S.shift.cashier).name)}</b> since ${R.S.shift.opened}</span></div>
        ${fdTab === 'sell' ? sell() : fdTab === 'shift' ? shift() : lists()}`;
    },
    mount(el) {
      const $ = s => el.querySelector(s);
      const keep = (id, fn) => { const i = $(id); if (!i) return; i.addEventListener('input', () => { fn(i.value); refresh(); }); };
      // update the pay button without re-rendering (keeps focus while typing)
      const refresh = () => {
        const c = calc(), why = problem(c), go = $('#fdGo'), w = $('#fdWhy'), ch = $('#fdChange');
        if (go) why ? go.setAttribute('aria-disabled', 'true') : go.removeAttribute('aria-disabled');
        if (w) w.textContent = isEmpty() ? '' : why;
        if (ch) ch.textContent = T.tendered !== '' && +T.tendered >= c.total ? R.peso(+T.tendered - c.total) : '—';
      };
      keep('#fdTendered', v => { T.tendered = v; });
      keep('#fdRef', v => { T.ref = v; });
      keep('#fdSenior', v => { T.seniorId = v; });
      keep('#fdName', v => { T.name = v; });
      const rm = $('#fdRoom'); if (rm) rm.addEventListener('change', () => { T.roomRes = rm.value; refresh(); });
      const s = $('#fdSearch');
      if (s) s.addEventListener('input', () => { fdQ = s.value; const p = s.selectionStart; R.render(); const n = document.getElementById('fdSearch'); n.focus(); n.setSelectionRange(p, p); });
      const cnt = $('#fdCount');
      if (cnt) cnt.addEventListener('input', () => {
        const exp = R.S.shift.float + shiftSales().filter(x => x.method === 'cash').reduce((a, x) => a + x.calc.total, 0);
        const d = Math.round((+cnt.value - exp) * 100) / 100, o = $('#fdOver');
        o.textContent = cnt.value === '' ? '' : d === 0 ? 'Drawer balances.' : d > 0 ? `Over by ${R.peso(d)}.` : `Short by ${R.peso(-d)}. Recount, then tell the supervisor.`;
        o.className = 'small ' + (cnt.value === '' || d === 0 ? '' : 'warn-text');
      });
    }
  };
})();
