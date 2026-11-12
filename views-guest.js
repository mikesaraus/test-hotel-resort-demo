/* Guest services: activities & spa, restaurant POS, guests, guest phone app */
(function () {
  const { addDays, TODAY } = R.util;
  const esc = R.esc;
  const now = () => new Date().toTimeString().slice(0, 5);
  const inhouse = () => R.S.reservations.filter(r => r.status === 'inhouse').sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }));
  const act = id => R.S.activities.find(a => a.id === id);
  const spaceLeft = (a, date, time) => a.cap - R.S.actBookings.filter(b => b.actId === a.id && b.date === date && b.time === time && b.status === 'confirmed').reduce((s, b) => s + b.people, 0);

  R.bookActivity = function (actId, resId, date, time, people) {
    const a = act(actId), r = R.res(resId);
    if (spaceLeft(a, date, time) < people) { R.toast('Fully booked at that time — pick another time'); return false; }
    R.S.actBookings.push({ id: R.nextId('AB'), actId, resId, date, time, people, status: 'confirmed' });
    if (a.price) r.folio.push({ date: TODAY, desc: `${a.name} × ${people} (${R.fmtShort(date)} ${time})`, dept: a.dept === 'Spa' || a.dept === 'Wellness' ? 'Spa' : a.dept === 'Food & beverage' ? 'Food & beverage' : 'Activities', amount: a.price * people });
    R.save(); return true;
  };

  // ---------- Activities ----------
  let actDate = TODAY;
  R.act.actDate = (d, el) => { actDate = el.value; R.render(); };
  R.act.bookAct = d => {
    const a = act(d.id);
    R.modal('Book: ' + a.name, `<div class="form">
      <label class="field full">Guest<select id="baRes">${inhouse().map(r => `<option value="${r.id}">Room ${r.room} — ${esc(R.guest(r.guestId).name)}</option>`).join('')}</select></label>
      <label class="field">Date<input type="date" id="baDate" value="${actDate}" min="${TODAY}"></label>
      <label class="field">Time<select id="baTime">${a.times.map(t => `<option ${t === d.time ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field">People<input type="number" id="baPpl" value="2" min="1" max="${a.cap}"></label>
      <div class="field"><span>Price</span><b id="baPrice" style="font-size:18px"></b></div></div>
      <p class="small muted" style="margin-top:8px">The cost goes on the guest's room bill.</p>
      <div class="foot"><button class="btn ghost" id="baCancel">Cancel</button><button class="btn" id="baGo">Confirm booking</button></div>`, b => {
      const upd = () => b.querySelector('#baPrice').textContent = a.price ? R.money(a.price * (+b.querySelector('#baPpl').value || 1)) : 'Free';
      b.querySelector('#baPpl').oninput = upd; upd();
      b.querySelector('#baCancel').onclick = R.closeModal;
      b.querySelector('#baGo').onclick = () => {
        const r = b.querySelector('#baRes').value;
        if (R.bookActivity(a.id, r, b.querySelector('#baDate').value, b.querySelector('#baTime').value, +b.querySelector('#baPpl').value)) {
          R.closeModal(); R.rerender(); R.toast(`${a.name} booked for room ${R.res(r).room}`);
        }
      };
    });
  };
  R.act.cancelAct = d => { const b = R.S.actBookings.find(x => x.id === d.id); b.status = 'cancelled'; R.rerender(); R.toast('Activity booking cancelled'); };
  R.views.activities = {
    title: 'Activities & spa',
    hint: 'Massage, videoke, swimming lessons and events, with places left for each session.',
    how: ['Every activity has session times and a maximum number of people.', 'Book for a guest here, or the guest books it themselves in the phone app.', 'The price goes straight onto the room bill, so nothing gets forgotten at check-out.'],
    render() {
      const day = R.S.actBookings.filter(b => b.date === actDate && b.status === 'confirmed').sort((a, b) => a.time.localeCompare(b.time));
      return `<div class="row" style="margin-bottom:12px"><label class="field" style="flex-direction:row;align-items:center;gap:8px">Showing<input type="date" value="${actDate}" data-change="actDate"></label></div>
        <div class="grid g-side"><div class="grid g2">${R.S.activities.map(a => `<div class="panel"><div class="ph"><h3>${esc(a.name)}</h3><div class="sp"><span class="chip">${esc(a.dept)}</span></div></div>
          <p class="small muted" style="margin-bottom:8px">${a.price ? R.money(a.price) + ' per person' : 'Free for guests'} · up to ${a.cap} people</p>
          <div class="row">${a.times.map(t => { const l = spaceLeft(a, actDate, t); return `<button class="btn sm ${l ? 'ghost' : ''}" ${l ? '' : 'disabled'} data-act="bookAct" data-id="${a.id}" data-time="${t}">${t} · ${l ? l + ' left' : 'full'}</button>`; }).join('')}</div></div>`).join('')}</div>
        <div class="panel"><h2>Booked for ${R.fmt(actDate)}</h2>${day.map(b => { const r = R.res(b.resId); return `<div class="list-item"><b class="num">${b.time}</b><div class="grow small">${esc(act(b.actId).name)}<div class="muted">Room ${r.room} · ${esc(R.guest(r.guestId).name)} · ${b.people} pax</div></div><button class="btn sm ghost" data-act="cancelAct" data-id="${b.id}" aria-label="Cancel">✕</button></div>`; }).join('') || '<p class="empty">Nothing booked yet</p>'}</div></div>`;
    }
  };

  // ---------- Restaurant & bar POS ----------
  let posCat = 'Mains', posOutlet = 'Camsair Restaurant', posLines = [];
  R.act.posCat = d => { posCat = d.c; R.render(); };
  R.act.posOutlet = (d, el) => { posOutlet = el.value; R.render(); };
  R.act.posAdd = d => { const l = posLines.find(x => x.id === d.id); if (l) l.qty++; else posLines.push({ id: d.id, qty: 1 }); R.render(); };
  R.act.posQty = d => { const l = posLines.find(x => x.id === d.id); l.qty += +d.n; posLines = posLines.filter(x => x.qty > 0); R.render(); };
  const posTotal = () => posLines.reduce((s, l) => s + R.S.menu.find(m => m.id === l.id).price * l.qty, 0);
  R.act.posPay = d => {
    const total = posTotal(); if (!total) return;
    const desc = posOutlet + ' — ' + posLines.map(l => l.qty + '× ' + R.S.menu.find(m => m.id === l.id).name).join(', ');
    if (d.how === 'room') {
      const resId = document.getElementById('posRoom').value, r = R.res(resId);
      r.folio.push({ date: TODAY, desc, dept: 'Food & beverage', amount: total });
      R.S.orders.unshift({ id: R.nextId('O'), date: TODAY, at: now(), outlet: posOutlet, total, paid: 'Room ' + r.room, desc, inFolio: true });
      R.toast(`${R.money(total)} charged to room ${r.room}`);
    } else {
      R.S.orders.unshift({ id: R.nextId('O'), date: TODAY, at: now(), outlet: posOutlet, total, paid: 'Cash / GCash', desc });
      R.toast(`${R.money(total)} paid`);
    }
    posLines = []; R.rerender();
  };
  R.views.dining = {
    title: 'Restaurant & bar',
    hint: 'A simple till for the restaurant, poolside bar and room service.',
    how: ['Tap menu items to build the order.', 'Charge it to a room: the system only lists rooms with a guest in house, so nothing is charged to an empty room.', 'Room charges appear on the guest\'s bill immediately and are paid at check-out.'],
    render() {
      const cats = [...new Set(R.S.menu.map(m => m.cat))];
      const ih = inhouse();
      // orders are recorded on the room folio for room charges; card orders are separate
      const todays = R.S.orders.filter(o => o.date === TODAY);
      return `<div class="grid g-side"><div class="panel">
        <div class="row" style="margin-bottom:10px"><select class="search" data-change="posOutlet">${R.S.outlets.map(o => `<option ${o === posOutlet ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="tabs">${cats.map(c => `<button class="${c === posCat ? 'on' : ''}" data-act="posCat" data-c="${c}">${c}</button>`).join('')}</div>
        <div class="menu-grid">${R.S.menu.filter(m => m.cat === posCat).map(m => `<button class="menu-item" data-act="posAdd" data-id="${m.id}"><b>${esc(m.name)}</b><span class="muted">${R.money(m.price)}</span></button>`).join('')}</div>
        <h3 style="margin:20px 0 6px">Today's orders</h3>${todays.map(o => `<div class="ticket-line small"><span>${o.at} · ${esc(o.outlet)} · ${esc(o.paid)}</span><b>${R.money(o.total)}</b></div>`).join('') || '<p class="muted small">No orders yet today.</p>'}
        </div>
        <div class="panel"><h2>Current order</h2>
          ${posLines.map(l => { const m = R.S.menu.find(x => x.id === l.id); return `<div class="ticket-line"><span>${esc(m.name)}</span><span class="row"><button class="btn sm ghost" data-act="posQty" data-id="${l.id}" data-n="-1" aria-label="Remove one">−</button><b>${l.qty}</b><button class="btn sm ghost" data-act="posQty" data-id="${l.id}" data-n="1" aria-label="Add one">+</button><b class="num" style="width:64px;text-align:right">${R.money(m.price * l.qty)}</b></span></div>`; }).join('') || '<p class="empty">Tap items to add them</p>'}
          <div class="ticket-line" style="font-size:18px"><b>Total</b><b>${R.money(posTotal())}</b></div>
          <label class="field" style="margin-top:12px">Charge to room<select id="posRoom">${ih.map(r => `<option value="${r.id}">Room ${r.room} — ${esc(R.guest(r.guestId).name)}</option>`).join('')}</select></label>
          <div class="row" style="margin-top:12px"><button class="btn" data-act="posPay" data-how="room" ${posLines.length ? '' : 'disabled'}>Charge to room</button><button class="btn ghost" data-act="posPay" data-how="card" ${posLines.length ? '' : 'disabled'}>Pay now (cash / GCash)</button></div>
        </div></div>`;
    }
  };

  // ---------- Guests ----------
  let gQ = '';
  R.act.openGuest = d => {
    const g = R.guest(d.id), rs = R.S.reservations.filter(r => r.guestId === g.id).sort((a, b) => b.arrive.localeCompare(a.arrive));
    R.modal(g.name, `<dl class="kv"><dt>Email</dt><dd>${esc(g.email)}</dd><dt>Phone</dt><dd>${esc(g.phone)}</dd><dt>From</dt><dd>${esc(g.country)}</dd><dt>Notes</dt><dd>${esc(g.tag) || '—'}</dd><dt>Stays</dt><dd>${Math.max(g.stays, rs.length)}</dd><dt>Total spend</dt><dd>${R.money(rs.reduce((s, r) => s + R.total(r), 0))}</dd></dl>
      <h3 style="margin:14px 0 4px">Bookings</h3><table><tbody>${rs.map(r => R.resRow(r)).join('')}</tbody></table>`);
  };
  R.views.guests = {
    title: 'Guests',
    hint: 'Everyone who has stayed or is booked, with their preferences and history.',
    how: ['Every booking creates or updates a guest profile.', 'Notes like allergies, VIP or honeymoon show on every screen where that guest appears.', 'Repeat guests are easy to spot, so staff can welcome them back.'],
    render() {
      const q = gQ.toLowerCase();
      const L = R.S.guests.filter(g => !q || g.name.toLowerCase().includes(q) || g.email.includes(q));
      const status = g => { const r = R.S.reservations.find(x => x.guestId === g.id && x.status === 'inhouse'); if (r) return `<span class="chip ink">In room ${r.room}</span>`; const b = R.S.reservations.find(x => x.guestId === g.id && x.status === 'booked'); return b ? `<span class="chip teal">Arrives ${R.fmtShort(b.arrive)}</span>` : ''; };
      return `<div class="panel"><div class="ph"><input class="search" id="gSearch" placeholder="Search guests" value="${esc(gQ)}"><div class="sp muted small">${L.length} guests</div></div>
        <table><thead><tr><th>Guest</th><th>From</th><th>Notes</th><th>Stays</th><th>Now</th></tr></thead><tbody>
        ${L.slice(0, 120).map(g => `<tr class="click" data-act="openGuest" data-id="${g.id}"><td><div class="row"><span class="avatar">${R.initials(g.name)}</span><div><b>${esc(g.name)}</b><div class="small muted">${esc(g.email)}</div></div></div></td><td>${esc(g.country)}</td><td>${g.tag ? `<span class="chip amber">${esc(g.tag)}</span>` : ''}</td><td>${g.stays > 1 ? `<span class="chip green">${g.stays} stays</span>` : '1'}</td><td>${status(g)}</td></tr>`).join('')}
        </tbody></table></div>`;
    },
    mount(el) { const s = el.querySelector('#gSearch'); s.addEventListener('input', () => { gQ = s.value; const p = s.selectionStart; R.render(); const n = document.getElementById('gSearch'); n.focus(); n.setSelectionRange(p, p); }); }
  };

  // ---------- Guest phone app ----------
  let gScreen = 'home', gCart = [];
  R.act.gGo = d => { gScreen = d.s; R.render(); };
  R.act.gWho = (d, el) => { R.S.guestResId = el.value; gScreen = 'home'; gCart = []; R.rerender(); };
  R.act.gReq = d => {
    const r = R.res(R.S.guestResId);
    const text = d.text || (document.getElementById('gReqText') || {}).value;
    if (!text) return R.toast('Type what you need first');
    if (d.dept === 'Maintenance') {
      R.S.tickets.unshift({ id: R.nextId('T'), room: r.room, title: text, priority: 'medium', status: 'open', by: 'Guest app', assignee: 'S9', created: TODAY, blocks: false });
    }
    R.S.requests.unshift({ id: R.nextId('Q'), resId: r.id, text, dept: d.dept || 'Front office', status: 'new', at: now() });
    gScreen = 'sent'; R.rerender(); R.toast(`Staff notified: "${text}"`);
  };
  R.act.gBookAct = d => {
    if (R.bookActivity(d.id, R.S.guestResId, TODAY, d.time, 2)) { gScreen = 'booked'; R.rerender(); R.toast('Booked — added to your bill'); }
  };
  R.act.gAdd = d => { gCart.push(d.id); R.render(); };
  R.act.gOrder = () => {
    if (!gCart.length) return;
    const r = R.res(R.S.guestResId);
    const total = gCart.reduce((s, id) => s + R.S.menu.find(m => m.id === id).price, 0) + 50;
    const desc = 'Room service — ' + gCart.map(id => R.S.menu.find(m => m.id === id).name).join(', ') + ' (+₱50 delivery)';
    r.folio.push({ date: TODAY, desc, dept: 'Food & beverage', amount: total });
    R.S.orders.unshift({ id: R.nextId('O'), date: TODAY, at: now(), outlet: 'Room service', total, paid: 'Room ' + r.room, desc, inFolio: true });
    R.S.requests.unshift({ id: R.nextId('Q'), resId: r.id, text: 'Deliver room service order', dept: 'Food & beverage', status: 'new', at: now() });
    gCart = []; gScreen = 'ordered'; R.rerender(); R.toast('Order sent to the kitchen');
  };
  R.act.gCheckout = () => {
    const r = R.res(R.S.guestResId);
    r.paid = R.total(r); r.status = 'checkedout'; R.room(r.room).hk = 'dirty';
    gScreen = 'bye'; R.rerender(); R.toast(`Express check-out done. Room ${r.room} sent to housekeeping.`);
  };

  function phone(r) {
    const g = R.guest(r.guestId), first = g.name.split(' ')[0];
    const back = `<button class="g-back" data-act="gGo" data-s="home">← Back</button>`;
    const head = (title, sub) => `<div class="g-hero" style="padding-top:28px">${back}<h2>${title}</h2>${sub ? `<p style="opacity:.85">${sub}</p>` : ''}</div>`;
    const S = {
      home: () => `<div class="g-hero"><p style="opacity:.8">Camsair Resort</p><h2>Welcome, ${esc(first)}</h2><p style="opacity:.9">Room ${r.room} · ${esc(R.type(r.type).name)}<br>Until ${R.fmt(R.dep(r))}</p></div>
        <div class="g-body"><div class="g-actions">
          <button data-act="gGo" data-s="request"><span>🛎</span>Ask for something</button>
          <button data-act="gGo" data-s="acts"><span>🏊</span>Book activities</button>
          <button data-act="gGo" data-s="food"><span>🍽</span>Order food</button>
          <button data-act="gGo" data-s="bill"><span>🧾</span>My bill</button>
          <button data-act="gGo" data-s="info"><span>ℹ</span>Resort info</button>
          <button data-act="gGo" data-s="bill"><span>👋</span>Check out</button></div>
          <div class="g-card"><b>Wi-Fi</b><p class="small muted">Network: Camsair-Guest · Password: camsair${r.room}</p></div>
          <div class="g-card"><b>Today</b><p class="small muted">Zumba by the pool 7:00 am · Pool open until 10 pm · Boodle fight dinner 6:30 pm</p></div></div>`,
      request: () => head('How can we help?', 'Your request goes straight to the right team.') + `<div class="g-body">
        ${[['Extra towels', 'Housekeeping'], ['Clean my room now', 'Housekeeping'], ['Late check-out', 'Front office'], ['Van to the airport', 'Front office'], ['Something is broken', 'Maintenance']].map(([t, dpt]) => `<button class="g-card" style="width:100%;text-align:left;cursor:pointer" data-act="gReq" data-text="${t}" data-dept="${dpt}"><b>${t}</b><div class="small muted">${dpt}</div></button>`).join('')}
        <div class="g-card"><label class="field">Something else<textarea id="gReqText" rows="2" placeholder="e.g. extra mattress, more pillows"></textarea></label><button class="btn sm" style="margin-top:8px" data-act="gReq" data-dept="Front office">Send</button></div></div>`,
      sent: () => head('Request sent', 'The team has it. We\'ll let you know when it\'s done.') + `<div class="g-body"><div class="g-card small">Switch "Viewing as" to Housekeeping or Front desk to see it arrive under Guest requests.</div></div>`,
      acts: () => head('Activities today', 'Booked activities go on your room bill.') + `<div class="g-body">${R.S.activities.map(a => `<div class="g-card"><b>${esc(a.name)}</b><div class="small muted">${a.price ? R.money(a.price) + ' pp' : 'Free'}</div><div class="row" style="margin-top:6px">${a.times.map(t => { const l = spaceLeft(a, TODAY, t); return `<button class="btn sm ${l >= 2 ? 'ghost' : ''}" ${l >= 2 ? '' : 'disabled'} data-act="gBookAct" data-id="${a.id}" data-time="${t}">${t}</button>`; }).join('')}</div></div>`).join('')}</div>`,
      booked: () => head('You\'re booked', 'See you there! It\'s been added to your bill.') + '<div class="g-body"><div class="g-card small">Staff see this booking under Activities &amp; spa.</div></div>',
      food: () => head('Room service', 'Delivered in about 30 minutes. ₱50 delivery.') + `<div class="g-body">${R.S.menu.filter(m => m.cat !== 'Breakfast').map(m => `<div class="g-card row"><div style="flex:1"><b>${esc(m.name)}</b><div class="small muted">${R.money(m.price)}</div></div><button class="btn sm ghost" data-act="gAdd" data-id="${m.id}">Add</button></div>`).join('')}
        <div style="position:sticky;bottom:0;padding:10px 0;background:#F7FAF9"><button class="btn" style="width:100%;justify-content:center" data-act="gOrder" ${gCart.length ? '' : 'disabled'}>${gCart.length ? `Order ${gCart.length} item${gCart.length > 1 ? 's' : ''} · ${R.money(gCart.reduce((s, id) => s + R.S.menu.find(m => m.id === id).price, 0) + 50)}` : 'Add items to order'}</button></div></div>`,
      ordered: () => head('Order on its way', 'The kitchen has your order.') + '<div class="g-body"><div class="g-card small">The charge is on your bill. Staff see it in Restaurant &amp; bar and Guest requests.</div></div>',
      bill: () => head('My bill', `Room ${r.room}`) + `<div class="g-body"><div class="g-card">${r.folio.map(f => `<div class="ticket-line small"><span>${esc(f.desc)}</span><b>${R.money(f.amount)}</b></div>`).join('')}
        <div class="ticket-line small"><span>Paid</span><b>− ${R.money(r.paid)}</b></div><div class="ticket-line"><b>Balance</b><b>${R.money(R.balance(r))}</b></div></div>
        <button class="btn" style="width:100%;justify-content:center" data-act="gCheckout">Express check-out${R.balance(r) > 0 ? ' · pay ' + R.money(R.balance(r)) : ''}</button>
        <p class="small muted" style="margin-top:8px">Pay the balance by GCash, Maya or card. Leave your key at the front desk.</p></div>`,
      info: () => head('Resort info') + `<div class="g-body">${[['Swimming pool', '8 am – 10 pm · lifeguard on duty until 5 pm'], ['Camsair Restaurant', 'Breakfast 6:30–10 am · Lunch and dinner until 9 pm'], ['Poolside Bar', '10 am – 10 pm'], ['Massage', '10 am – 7 pm · book in Activities'], ['Front desk', 'Open 24 hours · dial 0'], ['Check-out', '12 noon · late check-out on request']].map(([a, b]) => `<div class="g-card"><b>${a}</b><div class="small muted">${b}</div></div>`).join('')}</div>`,
      bye: () => `<div class="g-hero" style="min-height:300px"><h2>Thanks for staying, ${esc(first)}</h2><p>Your receipt is on its way by email. Safe travels!</p></div><div class="g-body"><div class="g-card small">Pick another guest above to keep exploring. Front desk sees this check-out, and housekeeping sees the room as needing cleaning.</div></div>`
    };
    return (S[gScreen] || S.home)();
  }

  R.views.guestapp = {
    title: 'Guest phone app',
    hint: 'What guests see on their phone, by scanning the QR code in their room. Nothing to download.',
    how: ['Pick an in-house guest to preview their app.', 'Requests, activity bookings and food orders made here show up immediately on the staff screens.', 'Everything ordered goes on the room bill. Guests can check out from the app.'],
    render() {
      let r = R.res(R.S.guestResId);
      const ih = inhouse();
      if (!r || r.status !== 'inhouse') { if (gScreen !== 'bye') { r = ih[0]; R.S.guestResId = r.id; } }
      const feed = R.S.requests.slice(0, 6);
      return `<div class="phone-wrap"><div>
          <label class="field" style="margin-bottom:12px">Preview as<select data-change="gWho">${ih.map(x => `<option value="${x.id}" ${x.id === R.S.guestResId ? 'selected' : ''}>Room ${x.room} — ${esc(R.guest(x.guestId).name)}</option>`).join('')}</select></label>
          <div class="phone"><div class="screen">${phone(R.res(R.S.guestResId))}</div></div></div>
        <div class="stack"><div class="panel"><h2>What staff see, live</h2><p class="small muted" style="margin-bottom:8px">Latest guest requests across the resort:</p>
          ${feed.map(q => { const x = R.res(q.resId); return `<div class="list-item"><b class="num small">${q.at}</b><div class="grow small">${esc(q.text)}<div class="muted">Room ${x.room} · ${esc(q.dept)}</div></div>${R.chip(q.status)}</div>`; }).join('')}
          <a class="btn ghost sm" href="#requests" style="margin-top:8px">Open guest requests</a></div>
          <div class="panel"><h2>Why a web app, not a download</h2><p class="muted">Guests scan a QR code in the room and it opens in their phone browser, already signed in to their booking. Most guests won't install an app for a three-night stay, but nearly all will scan a code.</p></div></div></div>`;
    }
  };
})();
