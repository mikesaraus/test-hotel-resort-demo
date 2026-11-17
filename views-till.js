/* Tills: day tour (entrance, cottages, rentals) and restaurant & bar.
   Both share the payment box, the senior / PWD rules and the official receipt. */
(function () {
  const esc = R.esc;
  const bd = () => R.bd();
  const METHODS = [['cash', 'Cash'], ['gcash', 'GCash'], ['maya', 'Maya'], ['card', 'Card'], ['room', 'Charge to room']];
  R.methodName = m => (METHODS.find(x => x[0] === m) || [m, m])[1];
  const saleOf = id => R.S.sales.find(s => s.id === id);

  // ---------- shared payment box ----------
  const payProblem = (P, total) => {
    if (P.method === 'cash' && total > 0 && !(+P.tendered >= total)) return 'Cash received is less than the total';
    if ((P.method === 'gcash' || P.method === 'maya') && total > 0 && P.ref.trim().length < 4) return `Enter the ${R.methodName(P.method)} reference number`;
    if (P.method === 'room' && !P.roomRes) return 'Choose the room to charge';
    return '';
  };
  const payBox = (P, total, prefix) => {
    const quick = [...new Set([Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000])].filter(v => v > total).slice(0, 3);
    const box = {
      cash: `<label class="field">Cash received<input id="${prefix}Tend" type="number" inputmode="decimal" min="0" value="${esc(P.tendered)}" placeholder="0.00"></label>
        <div class="row" style="margin-top:6px"><button class="btn sm ghost" data-act="${prefix}Tender" data-v="exact">Exact</button>${quick.map(v => `<button class="btn sm ghost" data-act="${prefix}Tender" data-v="${v}">${R.money(v)}</button>`).join('')}</div>
        <div class="ticket-line change"><span>Change</span><b class="num" id="${prefix}Change">${P.tendered !== '' && +P.tendered >= total ? R.peso(+P.tendered - total) : '—'}</b></div>`,
      gcash: `<label class="field">GCash reference no.<input id="${prefix}Ref" value="${esc(P.ref)}" placeholder="13-digit reference on the guest's phone"></label>`,
      maya: `<label class="field">Maya reference no.<input id="${prefix}Ref" value="${esc(P.ref)}" placeholder="Reference on the guest's phone"></label>`,
      card: '<p class="small muted">Tap or insert the card on the terminal, then complete the sale.</p>',
      room: `<label class="field">Room<select id="${prefix}Room"><option value="">Choose a room…</option>${R.inhouse().map(r => `<option value="${r.id}" ${P.roomRes === r.id ? 'selected' : ''}>Room ${r.room}, ${esc(R.guest(r.guestId).name)}</option>`).join('')}</select></label><p class="small muted" style="margin-top:6px">Only rooms with a guest in house are listed. Paid at check-out.</p>`
    }[P.method];
    return `<div class="methods" role="group" aria-label="Payment method">${METHODS.map(([k, l]) => `<button class="${P.method === k ? 'on' : ''}" aria-pressed="${P.method === k}" data-act="${prefix}Method" data-m="${k}">${l}</button>`).join('')}</div><div class="paybox">${box}</div>`;
  };
  const bindPay = (el, P, prefix, refresh) => {
    const on = (id, fn) => { const i = el.querySelector('#' + prefix + id); if (i) i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', () => { fn(i.value); refresh(); }); };
    on('Tend', v => { P.tendered = v; }); on('Ref', v => { P.ref = v; }); on('Room', v => { P.roomRes = v; });
  };
  // record a till sale: an official receipt, or a charge on the room bill
  // amt = what is collected now (the total, less any deposit paid in advance)
  function recordSale(P, sale, c, folioDesc, dept, amt) {
    if (amt == null) amt = c.total;
    const room = P.method === 'room' ? R.res(P.roomRes) : null;
    Object.assign(sale, {
      id: R.nextId('SL'), or: room ? '' : R.nextOR(), date: bd(), at: R.now(), shift: R.S.shift.id, cashier: R.S.user, calc: c, method: P.method, amount: amt,
      tendered: P.method === 'cash' ? +P.tendered : amt, change: P.method === 'cash' ? Math.round((+P.tendered - amt) * 100) / 100 : 0,
      ref: P.ref.trim(), resId: room ? room.id : ''
    });
    if (room) { R.postCharge(room, folioDesc, dept, amt); R.log('Charge posted', `${folioDesc} · ${R.peso(amt)}`, room.id); }
    R.S.sales.unshift(sale);
    R.log('Sale', `${sale.or || 'Room charge'} · ${R.peso(amt)} · ${R.methodName(P.method)}`, sale.id);
    return room;
  }

  R.tile = (name, price, q, act, id) => `<div class="menu-cell"><button class="menu-item ${q ? 'has' : ''}" data-act="${act}" data-id="${id}" data-n="1" aria-label="Add ${esc(name)}, ${R.money(price)}${q ? '. ' + q + ' on this sale' : ''}"><b>${esc(name)}</b><span class="muted">${R.money(price)}</span></button>${q ? `<span class="qty" aria-hidden="true">${q}</span><button class="tile-minus" data-act="${act}" data-id="${id}" data-n="-1" aria-label="One less ${esc(name)}">−</button>` : ''}</div>`;

  R.act.fdReceipt = d => R.receipt(d.id);
  R.act.fdReprint = () => R.toast('Sent to the receipt printer');
  R.receipt = function (id) {
    const s = saleOf(id), c = s.calc;
    const row = (a, b, cls) => `<div class="rc-row ${cls || ''}"><span>${a}</span><span class="num">${b}</span></div>`;
    R.modal('Receipt ' + s.or, `<div class="receipt">
      <div class="rc-head"><strong>CAMSAIR</strong><span class="brand-rule" aria-hidden="true"><i></i>RESORT<i></i></span>
      <small>Brgy. San Pedro, Initao, Misamis Oriental${R.S.modules.bir ? '<br>VAT Reg. TIN 000-000-000-00000 (sample)' : ''}</small></div>
      ${row('Official receipt', s.or)}${row(R.fmt(s.date) + ' · ' + s.at, s.kind === 'fnb' ? esc(s.outlet) : s.session === 'day' ? 'Day tour' : 'Night swim')}
      ${row('Cashier', esc(R.staff(s.cashier).name))}${s.name ? row('Guest', esc(s.name)) : ''}
      <hr>${c.lines.map(l => row(`${l.qty} × ${esc(l.name)}<br><small>@ ${R.peso(l.price)}</small>`, R.peso(l.amount))).join('')}
      <hr>${row('Gross amount', R.peso(c.gross))}
      ${c.scDisc ? row('Less VAT, senior / PWD share', '− ' + R.peso(c.vatRemoved)) + row('Less 20% senior / PWD discount', '− ' + R.peso(c.scDisc)) + row('Senior / PWD ID', esc(s.seniorId)) : ''}
      ${row(s.prepaid ? 'Total' : '<b>Amount due</b>', (s.prepaid ? '' : '<b>') + R.peso(c.total) + (s.prepaid ? '' : '</b>'), s.prepaid ? '' : 'rc-total')}
      ${s.prepaid ? row('Less deposit paid (' + esc(s.depositOR) + ')', '− ' + R.peso(s.prepaid)) + row('<b>Amount due</b>', '<b>' + R.peso(R.saleAmount(s)) + '</b>', 'rc-total') : ''}
      ${row('VATable sales', R.peso(c.vatable))}${row('VAT (12%)', R.peso(c.vat))}${row('VAT-exempt sales', R.peso(c.vatExempt))}
      <hr>${row(R.methodName(s.method), R.peso(s.tendered))}${s.method === 'cash' ? row('Change', R.peso(s.change)) : ''}${s.ref ? row('Reference no.', esc(s.ref)) : ''}
      ${s.overNote ? `<p class="rc-band">Over capacity: ${esc(s.overNote)}</p>` : ''}
      ${s.kind === 'daytour' && c.heads ? `<p class="rc-band">Wristbands: ${[s.freeHeads ? `<b>${s.freeHeads} green</b> (overnight guests)` : '', c.heads - (s.freeHeads || 0) ? `<b>${c.heads - (s.freeHeads || 0)} ${s.session === 'day' ? 'yellow' : 'blue'}</b> (${s.session === 'day' ? 'day tour' : 'night swim'})` : ''].filter(Boolean).join(' and ')}</p>` : ''}
      <p class="rc-foot">Thank you for visiting Camsair Resort!</p></div>
      <div class="foot"><button class="btn ghost" data-act="fdReprint">${R.icon('print')}Print receipt</button><button class="btn" data-act="closeModal">Done</button></div>`);
  };

  // ======================= Day tour till =======================
  const cat = () => R.S.dayuse;
  const PAX = [['adult', 'Adult', 'over 12'], ['child', 'Child', '3 to 12'], ['senior', 'Senior / PWD', 'ID needed, 20% off'], ['toddler', 'Below 3', 'free']];
  const nowSession = () => new Date().getHours() >= 17 ? 'night' : 'day';
  const blank = () => ({ session: nowSession(), pax: { adult: 0, child: 0, senior: 0, toddler: 0 }, cottages: [], items: [], method: 'cash', tendered: '', ref: '', seniorId: '', roomRes: '', name: '', custom: [], prepaid: 0, vbId: '', overNote: '', inhouse: '', freeHeads: 0, voucher: null });
  // overnight guests using the day-tour area: their people on the booking get in free, the rest are visitors
  const guestMode = (r, pax) => {
    const onBooking = r.adults + r.children, free = R.S.rules.guestEntranceFree ? Math.min(onBooking, pax == null ? onBooking : pax) : 0;
    Object.assign(T, { inhouse: r.id, freeHeads: free, method: 'room', roomRes: r.id, name: `Room ${r.room} · ${R.guest(r.guestId).name}` });
    return { onBooking, free };
  };
  let T = blank(), extraCat = 'Rentals';
  const calc = () => R.calcTicket(T, cat());
  const due = c => Math.max(0, Math.round((c.total - (T.prepaid || 0)) * 100) / 100);
  // how many guests the chosen cottages hold; over that, the cashier must write why
  const capOf = c => { const cap = T.cottages.reduce((s, id) => s + R.venue(id).cap, 0); return { cap, over: T.cottages.length > 0 && c.heads > cap }; };
  // a cottage reserved in advance for this date and session
  R.venueToday = (id, session) => R.S.venueBookings.find(v => v.venue === id && v.date === bd() && v.session === session && v.status === 'booked');

  function problem(c) {
    if (!c.lines.length) return 'Add guests or items to start a sale';
    if (T.cottages.length && !c.heads) return 'Add the number of guests for the cottage';
    if (capOf(c).over && T.overNote.trim().length < 5) return `${c.heads} guests is more than the cottage holds (${capOf(c).cap}). Add a note to continue`;
    if (T.pax.senior && !T.seniorId.trim()) return 'Enter the senior / PWD ID number';
    return payProblem(T, due(c));
  }

  R.act.fdSession = d => { T.session = d.s; R.render(); };
  R.act.fdPax = d => { T.pax[d.k] = Math.max(0, T.pax[d.k] + +d.n); R.render(); };
  R.act.fdExtraCat = d => { extraCat = d.c; R.render(); };
  R.act.fdItem = d => {
    const l = T.items.find(x => x.id === d.id);
    if (l) l.qty += +d.n; else if (+d.n > 0) T.items.push({ id: d.id, qty: 1 });
    T.items = T.items.filter(x => x.qty > 0); R.render();
  };
  R.act.fdCottage = d => {
    if (R.S.cottageUse[d.id]) return openCottage(d.id);
    const vb = R.venueToday(d.id, T.session);
    if (vb && T.vbId !== vb.id) return openReserved(vb);
    T.cottages = T.cottages.includes(d.id) ? T.cottages.filter(x => x !== d.id) : T.cottages.concat(d.id);
    R.render();
  };
  R.act.fdUnCot = d => {
    T.cottages = T.cottages.filter(x => x !== d.id);
    const vb = T.vbId && R.S.venueBookings.find(v => v.id === T.vbId);
    if (vb && vb.venue === d.id) Object.assign(T, { vbId: '', prepaid: 0, custom: [] }); // no longer this group's arrival
    R.render();
  };
  R.act.fdCustom = d => { const l = T.custom[+d.i]; l.qty = Math.max(0, l.qty + +d.n); T.custom = T.custom.filter(x => x.qty > 0); R.render(); };
  R.act.fdMethod = d => { T.method = d.m; R.render(); };
  R.act.fdTender = d => { T.tendered = d.v === 'exact' ? String(due(calc())) : d.v; R.render(); };
  R.act.fdClear = () => { T = blank(); R.render(); };
  R.act.fdComplete = () => {
    if (!R.need('till')) return;
    const c = calc(), why = problem(c);
    if (why) return R.toast(why, 'warn');
    const sale = { kind: 'daytour', session: T.session, pax: { ...T.pax }, cottages: T.cottages.slice(), items: T.items.map(x => ({ ...x })), name: T.name.trim(), seniorId: T.seniorId.trim(), overNote: capOf(c).over ? T.overNote.trim() : '', freeHeads: T.freeHeads, inhouse: T.inhouse, voucher: T.voucher };
    if (T.voucher && T.voucher.code !== 'MANUAL') { const v = R.S.vouchers.find(x => x.code === T.voucher.code); if (v) v.uses++; }
    const vb = T.vbId && R.S.venueBookings.find(v => v.id === T.vbId);
    if (vb) Object.assign(sale, { prepaid: T.prepaid, vbId: vb.id, depositOR: vb.payments.map(p => p.or).join(', ') });
    const room = recordSale(T, sale, c, `Day tour: ${c.lines.map(l => l.qty + '× ' + l.name).join(', ')}`, 'Day tour & cottages', due(c));
    if (sale.overNote) R.log('Over cottage capacity', `${c.heads} guests in space for ${capOf(c).cap}: ${sale.overNote}`, sale.id);
    if (vb) { vb.status = 'arrived'; vb.saleId = sale.id; R.log('Group arrived', `${vb.name} · ${R.venue(vb.venue).name}`, vb.id); }
    sale.cottages.forEach(id => { R.S.cottageUse[id] = sale.id; });
    T = blank(); R.rerender();
    R.toast(room ? `${R.peso(R.saleAmount(sale))} charged to room ${room.room}` : `Sale ${sale.or} complete${sale.change > 0 ? ' · change ' + R.peso(sale.change) : ''}`);
    if (!room) R.receipt(sale.id);
  };
  R.act.fdRelease = d => {
    const was = R.S.cottageUse[d.id];
    delete R.S.cottageUse[d.id]; R.closeModal(); R.rerender();
    R.toast(`${cat().cottages.find(x => x.id === d.id).name} is free again`, '', () => { R.S.cottageUse[d.id] = was; });
  };
  function openReserved(v) {
    const c = R.venue(v.venue), paid = R.vPaid(v);
    R.modal(c.name + ': reserved', `<dl class="kv"><dt>Reserved for</dt><dd>${esc(v.name)} · ${v.pax} guests</dd><dt>Arriving</dt><dd>around ${v.eta}</dd><dt>Mobile</dt><dd>${esc(v.phone)}</dd>
      ${v.catering ? `<dt>Package</dt><dd>${esc(v.catering.name)} × ${v.pax} @ ${R.money(v.catering.price)}</dd>` : ''}${v.notes ? `<dt>Notes</dt><dd>${esc(v.notes)}</dd>` : ''}
      <dt>Quoted</dt><dd>${R.money(v.price)} (cottage${v.catering ? ' and package' : ''}, before entrance fees)</dd><dt>Deposit paid</dt><dd>${paid ? R.peso(paid) + ' · ' + v.payments.map(p => p.or).join(', ') : 'None'}</dd></dl>
      <p class="small muted" style="margin-top:10px">When the group arrives, start their sale here. The cottage${v.catering ? ', package' : ''} and entrance fees are added and the deposit is taken off.</p>
      <div class="foot"><button class="btn ghost" data-act="goView" data-v="events">Open reservation list</button><button class="btn" data-act="fdArrive" data-id="${v.id}">Group has arrived: start sale</button></div>`);
  }
  R.act.goView = d => { R.closeModal(); R.go(d.v); };
  R.act.useCottage = d => {
    if (!R.need('till')) return;
    const r = R.res(d.id);
    if (r.status !== 'inhouse') return R.toast('Check the guest in first. A future stay can reserve a cottage instead.', 'warn');
    T = blank(); guestMode(r); R.closeModal(); R.go('till');
    R.toast(`${T.freeHeads} guest${T.freeHeads === 1 ? '' : 's'} on the booking get in free. Pick the cottage, add any visitors.`);
  };
  R.act.fdInhouse = () => {
    const L = R.inhouse();
    R.modal('Overnight guest', `<p class="small muted" style="margin-bottom:10px">Guests staying at Camsair get in free${R.S.rules.guestEntranceFree ? '' : ' (switched off in Settings)'}. Cottages are at the regular price unless a voucher or discount is used. Everything goes on the room bill.</p>
      <label class="field">Room<select id="ihR">${L.map(r => `<option value="${r.id}">Room ${r.room} · ${esc(R.guest(r.guestId).name)} · ${r.adults + r.children} guests</option>`).join('')}</select></label>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="ihGo">Continue</button></div>`, b => {
      b.querySelector('#ihGo').onclick = () => R.act.useCottage({ id: b.querySelector('#ihR').value });
    });
  };
  R.act.fdInhouseOff = () => { Object.assign(T, { inhouse: '', freeHeads: 0, method: 'cash', roomRes: '', name: '' }); R.render(); };
  R.act.fdFree = d => { const r = R.res(T.inhouse); T.freeHeads = Math.max(0, Math.min(r.adults + r.children, T.freeHeads + +d.n)); R.render(); };
  R.act.fdVoucherOff = () => { T.voucher = null; R.render(); };
  R.act.fdVoucher = () => {
    if (!T.cottages.length) return R.toast('Add a cottage first. Vouchers and discounts apply to the cottage price.', 'warn');
    const V = R.S.vouchers.filter(v => v.active);
    R.modal('Voucher or discount', `<p class="small muted" style="margin-bottom:10px">Applies to the cottage price on this sale. Without one, everyone pays the regular price.</p>
      <div class="form"><label class="field full">Voucher code<input id="vcC" placeholder="e.g. CAMSAIR10" autocomplete="off" style="text-transform:uppercase"></label></div>
      <p class="small" id="vcMsg" style="min-height:1.4em;margin:6px 0"></p>
      <details class="small"><summary>No voucher: give a discount (needs a supervisor)</summary>
        <div class="form" style="margin-top:8px"><label class="field">Discount on the cottage (%)<input id="vcP" type="number" min="1" max="100" placeholder="e.g. 20"></label></div>
        <button class="btn sm ghost" id="vcD" style="margin-top:8px">Ask for approval</button></details>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="vcGo">Apply voucher</button></div>`, b => {
      const $ = x => b.querySelector(x);
      $('#vcGo').onclick = () => {
        const code = $('#vcC').value.trim().toUpperCase(), v = V.find(x => x.code === code);
        if (!v) { $('#vcMsg').textContent = R.S.vouchers.some(x => x.code === code) ? 'That voucher is switched off.' : 'No voucher with that code.'; $('#vcMsg').className = 'small warn-text'; return; }
        T.voucher = { code: v.code, label: v.label, kind: v.kind, value: v.value };
        R.closeModal(); R.render(); R.toast(`${v.label} applied`);
      };
      $('#vcD').onclick = () => {
        const p = Math.round(+$('#vcP').value);
        if (!(p > 0 && p <= 100)) { $('#vcMsg').textContent = 'Enter a discount from 1 to 100%.'; $('#vcMsg').className = 'small warn-text'; return; }
        R.authorize({ perm: 'rate', title: `Approve ${p}% off the cottage`, ok: 'Approve discount', placeholder: 'e.g. complaint about the room, loyal guest' }, a => {
          T.voucher = { code: 'MANUAL', label: `Discount ${p}% on cottage`, kind: 'pct', value: p, by: a.by, reason: a.reason };
          R.log('Discount approved', `${p}% on cottage · ${a.reason}`, '', a.by); R.save(); R.render(); R.toast('Discount applied');
        });
      };
    });
  };
  R.act.fdArrive = d => {
    if (!R.need('till')) return;
    const v = R.S.venueBookings.find(x => x.id === d.id);
    T = blank();
    Object.assign(T, { session: v.session, cottages: [v.venue], name: v.name, vbId: v.id, prepaid: R.vPaid(v), custom: v.catering ? [{ name: v.catering.name, qty: v.pax, price: v.catering.price }] : [], overNote: v.overNote || '' });
    const stay = v.resId && R.res(v.resId);
    if (stay && stay.status === 'inhouse') { const g = guestMode(stay, v.pax); T.pax.adult = Math.max(0, v.pax - g.free); T.name = v.name; }
    else T.pax.adult = v.pax;
    R.closeModal(); R.go('till');
    R.toast(stay && stay.status === 'inhouse' ? 'Overnight guests get in free. Adjust visitors, then charge to the room' : 'Set children, seniors and babies, then take the balance', '');
  };
  function openCottage(id) {
    const c = cat().cottages.find(x => x.id === id), s = saleOf(R.S.cottageUse[id]);
    R.modal(c.name, `<dl class="kv">
      <dt>Rented to</dt><dd>${esc(s.name || 'Walk-in group')} · ${s.calc.heads} guests</dd>
      <dt>Since</dt><dd>${s.at} (${s.session === 'day' ? 'day tour' : 'night swim'})</dd>
      <dt>Receipt</dt><dd>${s.or ? `<a href="#" data-act="fdReceipt" data-id="${s.id}">${s.or}</a>` : 'Charged to room'}</dd>
      <dt>Size</dt><dd>${c.kind}, up to ${c.cap} people · ${R.money(c.price)}</dd></dl>
      <p class="small muted" style="margin-top:10px">Free the cottage when the group leaves so the next group can rent it. The night audit frees all cottages.</p>
      <div class="foot"><button class="btn ghost" data-act="newTask" data-area="${esc(c.name)}">Report a problem</button><button class="btn" data-act="fdRelease" data-id="${id}">Group has left, free cottage</button></div>`);
  }

  R.views.till = {
    title: 'Day pass',
    hint: 'Day tour and night swim: entrance, cottages, rentals and fees. Groups with a cottage reservation and staying guests who want a cottage are handled here too.',
    render() {
      const D = cat(), c = calc(), why = problem(c), used = R.S.cottageUse;
      const todays = R.S.sales.filter(s => s.date === bd() && s.kind === 'daytour');
      const heads = todays.reduce((s, x) => s + x.calc.heads, 0);
      const free = D.cottages.filter(x => !used[x.id]).length;
      const ent = D.entrance[T.session];
      const { cap: capPicked, over } = capOf(c);

      const ih = T.inhouse && R.res(T.inhouse);
      const bar = `<div class="till-bar ${ih ? 'on' : ''}">${ih ? `${R.icon('bed')}<div class="grow"><b>Overnight guest: room ${ih.room}, ${esc(R.guest(ih.guestId).name)}</b><div class="small">${T.freeHeads} of ${ih.adults + ih.children} on the booking get in free ${R.S.rules.guestEntranceFree ? '' : '(off in Settings)'}<span class="mini-step" style="display:inline-flex;margin-left:8px"><button class="btn sm ghost" data-act="fdFree" data-n="-1" aria-label="One fewer overnight guest" ${T.freeHeads ? '' : 'disabled'}>−</button><button class="btn sm ghost" data-act="fdFree" data-n="1" aria-label="One more overnight guest" ${T.freeHeads < ih.adults + ih.children ? '' : 'disabled'}>+</button></span> · add visitors below · cottage at regular price</div></div><button class="btn sm ghost" data-act="fdInhouseOff">Not a room guest</button>`
        : `<span class="small muted grow">Day visitors pay here. Staying guests and walk-in room bookings start from the buttons.</span>${R.inhouse().length ? `<button class="btn sm ghost" data-act="fdInhouse">${R.icon('bed')}Overnight guest using a cottage</button>` : ''}${R.can('book') ? `<button class="btn sm ghost" data-act="newBooking" data-ch="Walk-in">${R.icon('plus')}Book an overnight room</button>` : ''}`}</div>`;
      const strip = `<div class="pulse pulse5">
        <div><b>${heads}</b><span>Day guests today</span></div>
        <div><b>${free} of ${D.cottages.length}</b><span>Cottages free</span></div>
        <div><b>${todays.length}</b><span>Sales today</span></div>
        <div><b>${R.money(todays.reduce((a, s) => a + s.calc.total, 0))}</b><span>Day tour takings today</span></div>
        <div><b>${esc(R.staff(R.S.shift.cashier).name.split(' ')[0])}</b><span><a href="#cashier">Cashier since ${R.S.shift.opened}</a></span></div></div>`;
      const session = `<div class="seg" role="group" aria-label="Session">${[['day', 'Day tour', D.hours.day], ['night', 'Night swim', D.hours.night]].map(([k, l, h]) => `<button class="${T.session === k ? 'on' : ''}" aria-pressed="${T.session === k}" data-act="fdSession" data-s="${k}"><b>${l}</b><small>${h}</small></button>`).join('')}</div>`;
      const pax = `<div class="pax">${PAX.map(([k, l, sub]) => {
        const price = k === 'toddler' ? 0 : k === 'child' ? ent.child : ent.adult;
        return `<div class="pax-card ${T.pax[k] ? 'has' : ''}"><div><b>${l}</b><small>${sub} · ${price ? R.money(price) : 'Free'}</small></div>
          <div class="stepper"><button data-act="fdPax" data-k="${k}" data-n="-1" aria-label="One less ${l}" ${T.pax[k] ? '' : 'disabled'}>−</button><output aria-live="polite">${T.pax[k]}</output><button data-act="fdPax" data-k="${k}" data-n="1" aria-label="One more ${l}">+</button></div></div>`;
      }).join('')}</div>`;
      const cottages = `<div class="cot-row">${D.cottages.map(x => {
        const s = used[x.id] && saleOf(used[x.id]), picked = T.cottages.includes(x.id), vb = !s && !picked && R.venueToday(x.id, T.session);
        const state = s ? 'taken' : picked ? 'picked' : vb ? 'reserved' : 'free';
        const label = s ? `${s.calc.heads} pax · since ${s.at}` : picked ? 'On this sale' : vb ? `Reserved · ${vb.eta}` : `Free · ${x.cap} pax`;
        return `<button class="cot ${state} ${x.kind === 'Pavilion' ? 'wide' : ''}" data-act="fdCottage" data-id="${x.id}" aria-pressed="${picked}" aria-label="${esc(x.name)}, ${label}">
          <span class="roof" aria-hidden="true"></span><b>${esc(x.name.replace('Family cottage', 'Family'))}</b><small>${label}</small><em>${R.money(x.price)}</em></button>`;
      }).join('')}</div>`;
      const extraCats = [...new Set(D.extras.map(x => x.cat))];
      const extras = `<div class="tabs tabs-sm">${extraCats.map(k => `<button class="${extraCat === k ? 'on' : ''}" data-act="fdExtraCat" data-c="${k}">${k}</button>`).join('')}</div>
        <div class="menu-grid">${D.extras.filter(x => x.cat === extraCat).map(x => { const q = (T.items.find(i => i.id === x.id) || {}).qty; return R.tile(x.name, x.price, q, 'fdItem', x.id); }).join('')}</div>`;
      const refs = [];
      if (T.freeHeads) refs.push(['fdFree', '', true]);
      ['adult', 'child', 'senior', 'toddler'].forEach(k => { if (T.pax[k]) refs.push(['fdPax', `data-k="${k}"`, true]); });
      T.cottages.forEach(id => refs.push(['fdUnCot', `data-id="${id}"`, false]));
      T.items.forEach(i => refs.push(['fdItem', `data-id="${i.id}"`, true]));
      (T.custom || []).forEach((_, i) => refs.push(['fdCustom', `data-i="${i}"`, true]));
      if (c.lines.some(l => l.voucher)) refs.push(['fdVoucherOff', '', false]);
      const ctl = (ref, name) => !ref ? '' : ref[2]
        ? `<button class="qbtn" data-act="${ref[0]}" ${ref[1]} data-n="-1" aria-label="One less: ${esc(name)}">−</button><button class="qbtn" data-act="${ref[0]}" ${ref[1]} data-n="1" aria-label="One more: ${esc(name)}">+</button>`
        : `<button class="qbtn" data-act="${ref[0]}" ${ref[1]} aria-label="Remove ${esc(name)}">✕</button>`;
      const lines = c.lines.length ? c.lines.map((l, i) => `<div class="ticket-line edit"><span>${l.qty} × ${esc(l.name)}</span><span class="line-ctl"><b class="num">${R.peso(l.amount)}</b>${ctl(refs.length === c.lines.length && refs[i], l.name)}</span></div>`).join('') : '<p class="empty">Tap guests, a cottage or a rental to start</p>';
      const tot = due(c);
      const ticket = `<div class="panel ticket">
        <div class="ph"><h2>Current sale</h2><div class="sp"><button class="btn sm ghost" data-act="fdVoucher" ${T.cottages.length && !T.voucher ? '' : 'disabled'}>Voucher</button><button class="btn sm ghost" data-act="fdClear" ${c.lines.length ? '' : 'disabled'}>Clear</button></div></div>
        <label class="field" style="margin-bottom:8px">Group or guest name (optional)<input id="fdName" value="${esc(T.name)}" placeholder="e.g. Santos family"></label>
        <div class="ticket-lines" aria-live="polite">
          ${over ? `<div class="over-note"><p class="small"><b>${c.heads} guests, but the cottage${T.cottages.length > 1 ? 's hold' : ' holds'} ${capPicked}.</b> Add another cottage, or write why it's OK.</p><label class="field">Note (required)<input id="fdOver" value="${esc(T.overNote)}" placeholder="e.g. 2 are babies, extra table added, OK'd by Dennis"></label></div>` : ''}
          ${lines}
          ${c.discount ? `<div class="ticket-line disc"><span>Senior / PWD discount and VAT exemption</span><b class="num">− ${R.peso(c.discount)}</b></div>` : ''}
          ${T.prepaid ? `<div class="ticket-line"><span>Total</span><b class="num">${R.peso(c.total)}</b></div><div class="ticket-line disc"><span>Less deposit paid in advance</span><b class="num">− ${R.peso(T.prepaid)}</b></div>` : ''}
        </div>
        <div class="ticket-line total"><b>${T.prepaid ? 'To pay now' : 'Total'}</b><b class="num">${R.peso(tot)}</b></div>
        <label class="field" style="margin-top:10px">Senior / PWD ID number${T.pax.senior > 1 ? 's' : ''}<input id="fdSenior" value="${esc(T.seniorId)}" ${T.pax.senior ? 'placeholder="OSCA or PWD ID"' : 'disabled placeholder="Only needed for senior / PWD guests"'}></label>
        ${payBox(T, tot, 'fd')}
        <button class="btn big" data-act="fdComplete" id="fdGo" ${why ? 'aria-disabled="true"' : ''}>${T.method === 'room' ? 'Charge ' + R.peso(tot) + ' to room' : 'Complete sale · ' + R.peso(tot)}</button>
        <p class="small muted" id="fdWhy" style="margin-top:6px;min-height:1.5em">${c.lines.length ? esc(why) : ''}</p>
      </div>`;
      const recent = `<div class="panel"><div class="ph"><h2>Day tour sales today</h2><div class="sp small muted">${todays.length} sales · ${R.peso(todays.reduce((s, x) => s + x.calc.total, 0))}</div></div>
        <div class="tbl"><table><thead><tr><th>Time</th><th>Receipt</th><th>Guest</th><th>Cottage</th><th>Paid by</th><th class="right">Total</th></tr></thead><tbody>
        ${todays.map(s => `<tr class="click" data-act="${s.or ? 'fdReceipt' : 'openRes'}" data-id="${s.or ? s.id : s.resId}"><td class="num">${s.at}</td><td>${s.or || '<span class="chip">Room bill</span>'}</td><td>${esc(s.name || 'Walk-in')}<div class="small muted">${s.calc.heads} pax</div></td><td class="small">${s.cottages.map(id => esc(D.cottages.find(x => x.id === id).name)).join(', ') || '—'}</td><td>${R.methodName(s.method)}</td><td class="right num"><b>${R.peso(s.calc.total)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No sales yet today</td></tr>'}
        </tbody></table></div></div>`;
      return `${strip}${bar}<div class="grid g-till"><div class="stack">
          <div class="panel"><div class="ph"><h2>${ih ? 'Visitors with them (pay entrance)' : 'Guests'}</h2><div class="sp">${session}</div></div>${pax}</div>
          <div class="panel"><div class="ph"><h2>Cottages</h2><div class="sp small muted">Tap a free cottage to add it. Tap a rented one to see who has it.</div></div>${cottages}</div>
          <div class="panel"><h2>Rentals and fees</h2>${extras}</div>
        </div>${ticket}</div>
        <div style="margin-top:16px">${recent}</div>`;
    },
    mount(el) {
      const refresh = () => {
        const c = calc(), why = problem(c), go = el.querySelector('#fdGo'), w = el.querySelector('#fdWhy'), ch = el.querySelector('#fdChange');
        if (go) why ? go.setAttribute('aria-disabled', 'true') : go.removeAttribute('aria-disabled');
        if (w) w.textContent = c.lines.length ? why : '';
        if (ch) ch.textContent = T.tendered !== '' && +T.tendered >= due(c) ? R.peso(+T.tendered - due(c)) : '—';
      };
      bindPay(el, T, 'fd', refresh);
      [['#fdSenior', v => { T.seniorId = v; }], ['#fdName', v => { T.name = v; }], ['#fdOver', v => { T.overNote = v; }]].forEach(([s, fn]) => { const i = el.querySelector(s); if (i) i.addEventListener('input', () => { fn(i.value); refresh(); }); });
    }
  };

  // ======================= Restaurant & bar =======================
  const pblank = () => ({ outlet: 'Camsair Restaurant', cat: 'Mains', lines: [], diners: 2, seniors: 0, seniorId: '', method: 'cash', tendered: '', ref: '', roomRes: '' });
  let PO = pblank();
  const posCalc = () => {
    const share = PO.diners > 0 ? Math.min(PO.seniors, PO.diners) / PO.diners : 0;
    return { heads: PO.diners, ...R.taxCalc(PO.lines.map(l => { const m = R.S.menu.find(x => x.id === l.id); return { name: m.name, qty: l.qty, price: m.price, share }; })) };
  };
  const posProblem = c => {
    if (!c.lines.length) return 'Tap menu items to start an order';
    if (PO.seniors > PO.diners) return 'More seniors than diners';
    if (PO.seniors && PO.seniorId.trim().length < 4) return 'Enter the senior / PWD ID number';
    return payProblem(PO, c.total);
  };
  R.act.posCat = d => { PO.cat = d.c; R.render(); };
  R.act.posOutlet = (d, el) => { PO.outlet = el.value; R.render(); };
  R.act.posAdd = d => { const l = PO.lines.find(x => x.id === d.id); if (l) l.qty++; else PO.lines.push({ id: d.id, qty: 1 }); R.render(); };
  R.act.posQty = d => { const l = PO.lines.find(x => x.id === d.id); if (l) l.qty += +d.n; else if (+d.n > 0) PO.lines.push({ id: d.id, qty: 1 }); PO.lines = PO.lines.filter(x => x.qty > 0); R.render(); };
  R.act.posPeople = d => { PO[d.k] = Math.max(d.k === 'diners' ? 1 : 0, PO[d.k] + +d.n); R.render(); };
  R.act.posMethod = d => { PO.method = d.m; R.render(); };
  R.act.posTender = d => { PO.tendered = d.v === 'exact' ? String(posCalc().total) : d.v; R.render(); };
  R.act.posPay = () => {
    if (!R.need('fnb')) return;
    const c = posCalc(), why = posProblem(c);
    if (why) return R.toast(why, 'warn');
    const sale = { kind: 'fnb', outlet: PO.outlet, diners: PO.diners, seniors: PO.seniors, seniorId: PO.seniorId.trim(), name: '' };
    const room = recordSale(PO, sale, c, `${PO.outlet}: ${c.lines.map(l => l.qty + '× ' + l.name).join(', ')}`, 'Food & beverage');
    PO = Object.assign(pblank(), { outlet: PO.outlet }); R.rerender();
    R.toast(room ? `${R.peso(c.total)} charged to room ${room.room}` : `Sale ${sale.or} complete${sale.change > 0 ? ' · change ' + R.peso(sale.change) : ''}`);
    if (!room) R.receipt(sale.id);
  };
  R.views.fnb = {
    title: 'Restaurant & bar',
    hint: 'A simple till for the restaurant, poolside bar and room service.',
    render() {
      const cats = [...new Set(R.S.menu.map(m => m.cat))], c = posCalc(), why = posProblem(c);
      const todays = R.S.sales.filter(s => s.date === bd() && s.kind === 'fnb');
      const step = (k, l, min) => `<div class="mini-step"><span>${l}</span><button class="btn sm ghost" data-act="posPeople" data-k="${k}" data-n="-1" aria-label="One less" ${PO[k] <= min ? 'disabled' : ''}>−</button><b>${PO[k]}</b><button class="btn sm ghost" data-act="posPeople" data-k="${k}" data-n="1" aria-label="One more">+</button></div>`;
      return `<div class="grid g-till"><div class="stack"><div class="panel">
        <div class="row" style="margin-bottom:10px"><select class="search" data-change="posOutlet" aria-label="Outlet">${R.S.outlets.map(o => `<option ${o === PO.outlet ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="tabs">${cats.map(x => `<button class="${x === PO.cat ? 'on' : ''}" data-act="posCat" data-c="${x}">${x}</button>`).join('')}</div>
        <div class="menu-grid">${R.S.menu.filter(m => m.cat === PO.cat).map(m => { const q = (PO.lines.find(l => l.id === m.id) || {}).qty; return R.tile(m.name, m.price, q, 'posQty', m.id); }).join('')}</div></div>
        <div class="panel"><div class="ph"><h2>Sales today</h2><div class="sp small muted">${todays.length} · ${R.peso(todays.reduce((s, x) => s + x.calc.total, 0))}</div></div>
          <div class="tbl"><table><tbody>${todays.map(s => `<tr class="click" data-act="${s.or ? 'fdReceipt' : 'openRes'}" data-id="${s.or ? s.id : s.resId}"><td class="num small">${s.at}</td><td>${esc(s.outlet)}</td><td>${s.or || '<span class="chip">Room bill</span>'}</td><td>${R.methodName(s.method)}</td><td class="right num"><b>${R.peso(s.calc.total)}</b></td></tr>`).join('') || '<tr><td class="empty">No sales yet today</td></tr>'}</tbody></table></div></div></div>
        <div class="panel ticket"><h2>Current order</h2>
          <div class="ticket-lines" aria-live="polite">${PO.lines.map(l => { const m = R.S.menu.find(x => x.id === l.id); return `<div class="ticket-line edit"><span>${l.qty} × ${esc(m.name)}</span><span class="line-ctl"><b class="num">${R.peso(m.price * l.qty)}</b><button class="qbtn" data-act="posQty" data-id="${l.id}" data-n="-1" aria-label="One less: ${esc(m.name)}">−</button><button class="qbtn" data-act="posQty" data-id="${l.id}" data-n="1" aria-label="One more: ${esc(m.name)}">+</button></span></div>`; }).join('') || '<p class="empty">Tap menu items to start</p>'}</div>
          <div class="row" style="margin:10px 0">${step('diners', 'Diners', 1)}${step('seniors', 'Senior / PWD', 0)}</div>
          <label class="field">Senior / PWD ID<input id="poSenior" value="${esc(PO.seniorId)}" ${PO.seniors ? 'placeholder="OSCA or PWD ID"' : 'disabled placeholder="Only needed for senior / PWD diners"'}></label>
          ${c.discount ? `<div class="ticket-line disc"><span>Senior / PWD discount and VAT exemption (${PO.seniors} of ${PO.diners} diners)</span><b class="num">− ${R.peso(c.discount)}</b></div>` : ''}
          <div class="ticket-line total"><b>Total</b><b class="num">${R.peso(c.total)}</b></div>
          ${payBox(PO, c.total, 'pos')}
          <button class="btn big" data-act="posPay" id="posGo" ${why ? 'aria-disabled="true"' : ''}>${PO.method === 'room' ? 'Charge ' + R.peso(c.total) + ' to room' : 'Complete sale · ' + R.peso(c.total)}</button>
          <p class="small muted" id="posWhy" style="margin-top:6px;min-height:1.5em">${c.lines.length ? esc(why) : ''}</p></div></div>`;
    },
    mount(el) {
      const refresh = () => {
        const c = posCalc(), why = posProblem(c), go = el.querySelector('#posGo'), ch = el.querySelector('#posChange');
        if (go) why ? go.setAttribute('aria-disabled', 'true') : go.removeAttribute('aria-disabled');
        el.querySelector('#posWhy').textContent = c.lines.length ? why : '';
        if (ch) ch.textContent = PO.tendered !== '' && +PO.tendered >= c.total ? R.peso(+PO.tendered - c.total) : '—';
      };
      bindPay(el, PO, 'pos', refresh);
      const s = el.querySelector('#poSenior'); if (s) s.addEventListener('input', () => { PO.seniorId = s.value; refresh(); });
    }
  };

  // ======================= Cottages & events: reservations made in advance =======================
  const { addDays } = R.util;
  const PACKAGES = [{ name: 'Boodle fight package', price: 450 }, { name: 'Lunch buffet', price: 350 }, { name: 'Merienda (snacks)', price: 150 }];
  const SESS = { day: 'Day tour', night: 'Night swim' };
  const vTaken = (venue, date, session, except) => R.S.venueBookings.some(v => v.id !== except && v.venue === venue && v.date === date && v.session === session && (v.status === 'booked' || v.status === 'arrived'));
  let evStart = null;
  R.act.evShift = d => { evStart = d.n === '0' ? bd() : addDays(evStart, +d.n); if (evStart < bd()) evStart = bd(); R.render(); };

  R.act.newEvent = d => {
    if (!R.need('till')) return;
    const D = R.S.dayuse;
    const stays = R.S.reservations.filter(r => (r.status === 'booked' || r.status === 'inhouse') && R.dep(r) >= bd()).sort((a, b) => (a.room || '').localeCompare(b.room || '', undefined, { numeric: true }));
    const pre = d.res ? R.res(d.res) : null;
    R.modal('Reserve a cottage or the pavilion', `<div class="form">
      <label class="field full">Staying guest (optional)<select id="evR"><option value="">Day visitors (no room booking)</option>${stays.map(r => `<option value="${r.id}" ${pre && pre.id === r.id ? 'selected' : ''}>${r.room ? 'Room ' + r.room : r.id} · ${esc(R.guest(r.guestId).name)} · ${R.fmtShort(r.arrive)} → ${R.fmtShort(R.dep(r))}</option>`).join('')}</select></label>
      <label class="field">Cottage<select id="evV">${D.cottages.map(c => `<option value="${c.id}" ${c.id === d.venue ? 'selected' : ''}>${esc(c.name)} · up to ${c.cap} · ${R.money(c.price)}</option>`).join('')}</select></label>
      <label class="field">Date<input id="evD" type="date" min="${bd()}" value="${d.date || addDays(bd(), 1)}"></label>
      <label class="field">Session<select id="evS">${Object.entries(SESS).map(([k, l]) => `<option value="${k}" ${k === d.session ? 'selected' : ''}>${l} (${D.hours[k]})</option>`).join('')}</select></label>
      <label class="field">Arriving around<input id="evE" type="time" value="09:00"></label>
      <label class="field">Group name<input id="evN" placeholder="e.g. Santos birthday" autofocus></label>
      <label class="field">Mobile<input id="evP" placeholder="+63 9xx xxx xxxx"></label>
      <label class="field">Number of guests<input id="evX" type="number" min="1" value="10"></label>
      <label class="field">Food package<select id="evK"><option value="">None</option>${PACKAGES.map((p, i) => `<option value="${i}">${p.name}, ${R.money(p.price)} per head</option>`).join('')}</select></label>
      <label class="field full" id="evOverW" hidden>Over capacity: why is it OK? (required)<input id="evOver" placeholder="e.g. 5 are small children, extra tables added"></label>
      <label class="field full">Notes<input id="evNo" placeholder="e.g. sound system, decorations from 3 pm"></label>
      <div class="full" id="evQ"></div>
      <label class="field">Deposit received<select id="evDep"><option value="">Not yet</option>${['GCash', 'Cash', 'Maya', 'Bank transfer'].map(m => `<option>${m}</option>`).join('')}</select></label>
      <label class="field">Deposit amount (₱)<input id="evAmt" type="number" min="0"></label>
      <label class="field full">Deposit reference<input id="evRef" placeholder="GCash / bank reference"></label></div>
      <p class="small warn-text" id="evErr" style="min-height:1.4em;margin-top:6px"></p>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="evGo">Reserve</button></div>`, b => {
      const $ = x => b.querySelector(x);
      let lastPrice = -1;
      // a staying guest: fill their details and keep the date inside their stay
      const pickStay = () => {
        const r = R.res($('#evR').value);
        if (!r) { $('#evD').min = bd(); $('#evD').removeAttribute('max'); return; }
        const g = R.guest(r.guestId), from = r.arrive > bd() ? r.arrive : bd();
        $('#evD').min = from; $('#evD').max = R.dep(r);
        if ($('#evD').value < from || $('#evD').value > R.dep(r)) $('#evD').value = from;
        $('#evN').value = `Room ${r.room || r.id} · ${g.name}`; $('#evP').value = g.phone; $('#evX').value = r.adults + r.children;
      };
      $('#evR').addEventListener('change', () => { pickStay(); q(); });
      if (pre) pickStay();
      const q = () => {
        const c = R.venue($('#evV').value), pax = Math.max(1, +$('#evX').value || 1), k = $('#evK').value, pk = k === '' ? null : PACKAGES[+k];
        const price = c.price + (pk ? pk.price * pax : 0), taken = vTaken(c.id, $('#evD').value, $('#evS').value);
        if (price !== lastPrice) { $('#evAmt').value = Math.round(price * R.S.rules.deposit / 100); lastPrice = price; }
        $('#evQ').innerHTML = `<div class="note ${taken || pax > c.cap ? 'warn' : ''}"><div>${taken ? `<b>${esc(c.name)} is already reserved</b> for that ${SESS[$('#evS').value].toLowerCase()}. Pick another cottage or date.` : `<b>${R.money(price)}</b> for the ${esc(c.name.toLowerCase())}${pk ? ` and ${pax} × ${esc(pk.name.toLowerCase())}` : ''}. Entrance fees are paid on the day. Suggested ${R.S.rules.deposit}% deposit: ${R.money(price * R.S.rules.deposit / 100)}.`}
          ${pax > c.cap ? `<div class="warn-text">${esc(c.name)} holds ${c.cap}. Choose a bigger cottage or the pavilion, or write why it's OK below.</div>` : ''}</div></div>`;
        $('#evOverW').hidden = pax <= c.cap;
        $('#evGo').disabled = taken;
        return { c, pax, pk, price };
      };
      b.querySelectorAll('input,select').forEach(i => i.addEventListener('input', q)); q();
      $('#evGo').onclick = () => {
        const x = q(), err = m => { $('#evErr').textContent = m; };
        const stay = R.res($('#evR').value);
        if (stay && ($('#evD').value < stay.arrive || $('#evD').value > R.dep(stay))) return err(`Pick a date during the stay: ${R.fmtShort(stay.arrive)} to ${R.fmtShort(R.dep(stay))}.`);
        if ($('#evN').value.trim().length < 3) return err('Enter the group name.');
        if ($('#evP').value.trim().length < 7) return err('Enter a mobile number.');
        if (x.pax > x.c.cap && $('#evOver').value.trim().length < 5) return err(`${x.pax} guests is more than ${x.c.name} holds (${x.c.cap}). Write why it's OK.`);
        const dep = $('#evDep').value, amt = +$('#evAmt').value || 0;
        if (dep && !(amt > 0)) return err('Enter the deposit amount.');
        if (dep && dep !== 'Cash' && $('#evRef').value.trim().length < 4) return err('Enter the deposit reference number.');
        const v = { id: R.nextId('EV'), venue: x.c.id, date: $('#evD').value, session: $('#evS').value, name: $('#evN').value.trim(), phone: $('#evP').value.trim(), pax: x.pax, catering: x.pk, eta: $('#evE').value || '09:00', notes: $('#evNo').value.trim(), overNote: x.pax > x.c.cap ? $('#evOver').value.trim() : '', resId: $('#evR').value || '', price: x.price, status: 'booked', payments: [], created: bd() };
        if (dep) v.payments.push({ id: R.nextId('VP'), date: bd(), at: R.now(), amount: amt, method: dep, ref: $('#evRef').value.trim(), or: R.nextOR(), by: R.S.user, shift: R.S.shift.id });
        R.S.venueBookings.push(v);
        if (v.resId) R.log('Cottage reserved', `${x.c.name}, ${R.fmtShort(v.date)} ${SESS[v.session].toLowerCase()}`, v.resId);
        R.log('Cottage reserved', `${x.c.name}, ${R.fmtShort(v.date)} ${SESS[v.session].toLowerCase()} · ${v.name} · ${R.money(v.price)}${dep ? ' · deposit ' + R.peso(amt) : ''}`, v.id);
        R.closeModal(); R.rerender(); R.toast(`${x.c.name} reserved for ${v.name}`);
      };
    });
  };
  R.act.openEvent = d => {
    const v = R.S.venueBookings.find(x => x.id === d.id), c = R.venue(v.venue), paid = R.vPaid(v);
    R.modal(`${c.name}: ${v.name}`, `<div class="row" style="margin-bottom:10px">${R.chip(v.status === 'arrived' ? 'done' : v.status === 'booked' ? 'booked' : v.status)}<span class="chip">${SESS[v.session]}</span></div>
      <dl class="kv">${v.resId ? `<dt>Staying guest</dt><dd><a href="#booking/${v.resId}" data-act="openRes" data-id="${v.resId}">${v.resId}</a> · entrance free for people on the booking</dd>` : ''}<dt>Date</dt><dd>${R.fmt(v.date)}, arriving around ${v.eta}</dd><dt>Guests</dt><dd>${v.pax}</dd><dt>Mobile</dt><dd>${esc(v.phone)}</dd>
        ${v.catering ? `<dt>Package</dt><dd>${esc(v.catering.name)} × ${v.pax} @ ${R.money(v.catering.price)}</dd>` : ''}${v.notes ? `<dt>Notes</dt><dd>${esc(v.notes)}</dd>` : ''}${v.overNote ? `<dt>Over capacity</dt><dd>${esc(v.overNote)}</dd>` : ''}
        <dt>Quoted</dt><dd>${R.money(v.price)} plus entrance fees on the day</dd>
        <dt>Paid</dt><dd>${v.payments.map(p => `${R.peso(p.amount)} ${esc(p.method)} · ${p.or} · ${R.fmtShort(p.date)}`).join('<br>') || 'Nothing yet'}</dd>
        ${v.status === 'arrived' && v.saleId ? `<dt>Sale</dt><dd><a href="#" data-act="fdReceipt" data-id="${v.saleId}">Receipt</a></dd>` : ''}</dl>
      <div class="foot">${v.status === 'booked' && R.can('till') ? `<button class="btn ghost warn-text" data-act="cancelEvent" data-id="${v.id}">Cancel</button><button class="btn ghost" data-act="eventPay" data-id="${v.id}">Take deposit</button>${v.date === bd() ? `<button class="btn" data-act="fdArrive" data-id="${v.id}">Group has arrived</button>` : ''}` : '<button class="btn" data-act="closeModal">Close</button>'}</div>`);
  };
  R.act.eventPay = d => {
    if (!R.need('pay')) return;
    const v = R.S.venueBookings.find(x => x.id === d.id), left = Math.max(0, v.price - R.vPaid(v));
    R.modal('Take deposit', `<div class="form"><label class="field">Amount<input id="vpA" type="number" min="1" value="${Math.round(left)}"></label>
      <label class="field">Method<select id="vpM">${['GCash', 'Cash', 'Maya', 'Card', 'Bank transfer'].map(m => `<option>${m}</option>`).join('')}</select></label>
      <label class="field full">Reference<input id="vpR" placeholder="Not needed for cash or card"></label></div>
      <div class="foot"><button class="btn ghost" data-act="openEvent" data-id="${v.id}">Back</button><button class="btn" id="vpGo">Record deposit</button></div>`, b => {
      b.querySelector('#vpGo').onclick = () => {
        const a = +b.querySelector('#vpA').value, m = b.querySelector('#vpM').value, ref = b.querySelector('#vpR').value.trim();
        if (!(a > 0)) return R.toast('Enter the amount', 'warn');
        if (!['Cash', 'Card'].includes(m) && ref.length < 4) return R.toast(`Enter the ${m} reference`, 'warn');
        const p = { id: R.nextId('VP'), date: bd(), at: R.now(), amount: a, method: m, ref, or: R.nextOR(), by: R.S.user, shift: R.S.shift.id };
        v.payments.push(p); R.log('Deposit', `${v.name}: ${R.peso(a)} ${m} · ${p.or}`, v.id);
        R.closeModal(); R.rerender(); R.toast(`${R.peso(a)} received · ${p.or}`);
      };
    });
  };
  R.act.cancelEvent = d => {
    const v = R.S.venueBookings.find(x => x.id === d.id), paid = R.vPaid(v);
    R.authorize({ perm: 'cancel', title: 'Cancel reservation', ok: 'Cancel reservation', danger: true, placeholder: 'What did the guest say?',
      body: `<p>${esc(v.name)}, ${esc(R.venue(v.venue).name)} on ${R.fmt(v.date)}.</p>${paid ? `<div class="note" style="margin-top:8px">House rule: the ${R.peso(paid)} deposit is not refunded.</div>` : ''}` }, a => {
      v.status = 'cancelled'; v.closed = bd(); v.reason = a.reason;
      R.log('Cottage reservation cancelled', `${v.name} · ${a.reason}${paid ? ' · deposit kept ' + R.peso(paid) : ''}`, v.id, a.by);
      R.rerender(); R.toast('Reservation cancelled');
    });
  };

  R.views.events = {
    title: 'Cottage reservations',
    hint: 'Cottages and the pavilion reserved ahead for reunions, birthdays and company outings, with deposits.',
    render() {
      if (!evStart || evStart < bd()) evStart = bd();
      const days = Array.from({ length: 14 }, (_, i) => addDays(evStart, i)), D = R.S.dayuse, can = R.can('till');
      const at = (c, d) => R.S.venueBookings.filter(v => v.venue === c.id && v.date === d && v.status !== 'cancelled' && v.status !== 'noshow');
      const cell = (c, d) => {
        const L = at(c, d);
        return `<td class="av">${['day', 'night'].map(s => { const v = L.find(x => x.session === s); return v ? `<button class="ev ${s} ${v.status}" data-act="openEvent" data-id="${v.id}" title="${esc(v.name)}, ${SESS[s].toLowerCase()}">${s === 'day' ? 'D' : 'N'} ${esc(v.name.split(' ')[0])}</button>` : can ? `<button class="ev free" data-act="newEvent" data-venue="${c.id}" data-date="${d}" data-session="${s}" aria-label="Reserve ${esc(c.name)} ${R.fmtShort(d)} ${SESS[s].toLowerCase()}">+</button>` : ''; }).join('')}</td>`;
      };
      const upcoming = R.S.venueBookings.filter(v => v.date >= bd() && v.status !== 'cancelled').sort((a, b) => (a.date + a.eta).localeCompare(b.date + b.eta));
      return `<div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Upcoming</h2><div class="sp">${can ? `<button class="btn" data-act="newEvent">${R.icon('plus')}Reserve a cottage</button>` : ''}</div></div>
          <div class="tbl"><table><thead><tr><th>Date</th><th>Cottage</th><th>Group</th><th>Guests</th><th>Package</th><th>Status</th><th class="right">Quoted · paid</th></tr></thead><tbody>
          ${upcoming.map(v => `<tr class="click" data-act="openEvent" data-id="${v.id}"><td>${R.fmt(v.date)}<div class="small muted">${SESS[v.session]} · ${v.eta}</div></td><td><b>${esc(R.venue(v.venue).name)}</b></td><td>${esc(v.name)}${v.resId ? ' <span class="chip ink">Room guest</span>' : ''}<div class="small muted">${esc(v.phone)}</div></td><td>${v.pax}</td><td class="small">${v.catering ? esc(v.catering.name) : '—'}</td>
            <td>${v.status === 'arrived' ? '<span class="chip green">Arrived</span>' : R.vPaid(v) ? '<span class="chip teal">Deposit paid</span>' : '<span class="chip amber">No deposit</span>'}</td><td class="right num">${R.money(v.price)}<div class="small muted">${R.money(R.vPaid(v))} paid</div></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No reservations yet</td></tr>'}
          </tbody></table></div></div>
        <div class="panel"><div class="ph"><h2>Cottage calendar</h2><div class="sp"><button class="btn ghost sm" data-act="evShift" data-n="-7">← Week</button><button class="btn ghost sm" data-act="evShift" data-n="0">Today</button><button class="btn ghost sm" data-act="evShift" data-n="7">Week →</button></div></div>
          <p class="small muted" style="margin-bottom:8px">D = day tour, N = night swim. Click + to reserve. Walk-ins can still take any cottage that is not reserved.</p>
          <div class="tbl"><table class="avail"><thead><tr><th>Cottage</th>${days.map(d => `<th class="${d === bd() ? 'today-col' : ''}">${new Date(d + 'T12:00').toLocaleDateString('en-PH', { weekday: 'short' })}<br>${R.fmtShort(d)}</th>`).join('')}</tr></thead><tbody>
          ${D.cottages.map(c => `<tr><td><b>${esc(c.name)}</b><div class="small muted">${c.cap} pax · ${R.money(c.price)}</div></td>${days.map(d => cell(c, d)).join('')}</tr>`).join('')}
          </tbody></table></div></div>`;
    }
  };
})();
