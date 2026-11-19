/* Add-on modules: activities & spa, guest phone app. Switched on and off in Settings → Modules. */
(function () {
  const esc = R.esc;
  const bd = () => R.bd();
  const act = id => R.S.activities.find(a => a.id === id);
  const spaceLeft = (a, date, time) => a.cap - R.S.actBookings.filter(b => b.actId === a.id && b.date === date && b.time === time && b.status === 'confirmed').reduce((s, b) => s + b.people, 0);

  R.bookActivity = function (actId, resId, date, time, people) {
    const a = act(actId), r = R.res(resId);
    if (spaceLeft(a, date, time) < people) { R.toast('Fully booked at that time. Pick another time.', 'warn'); return false; }
    const b = { id: R.nextId('AB'), actId, resId, date, time, people, status: 'confirmed' };
    R.S.actBookings.push(b);
    if (a.price) b.line = R.postCharge(r, `${a.name} × ${people} (${R.fmtShort(date)} ${time})`, a.dept === 'Food & beverage' ? 'Food & beverage' : 'Spa & activities', a.price * people).id;
    R.log('Activity booked', `${a.name} × ${people}, ${R.fmtShort(date)} ${time}`, r.id);
    R.save(); return true;
  };

  // ---------- Activities ----------
  let actDate = null;
  R.act.actDate = (d, el) => { actDate = el.value; R.render(); };
  R.act.bookAct = d => {
    if (!R.need('activity')) return;
    const a = act(d.id);
    R.modal('Book: ' + a.name, `<div class="form">
      <label class="field full">Guest<select id="baRes">${R.inhouse().map(r => `<option value="${r.id}">Room ${r.room}, ${esc(R.guest(r.guestId).name)}</option>`).join('')}</select></label>
      <label class="field">Date<input type="date" id="baDate" value="${actDate}" min="${bd()}"></label>
      <label class="field">Time<select id="baTime">${a.times.map(t => `<option ${t === d.time ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field">People<input type="number" id="baPpl" value="1" min="1" max="${a.cap}"></label>
      <div class="field"><span>Price</span><b id="baPrice" style="font-size:18px"></b></div></div>
      <p class="small muted" style="margin-top:8px">The cost goes on the guest's room bill.</p>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="baGo">Confirm booking</button></div>`, b => {
      const upd = () => { b.querySelector('#baPrice').textContent = a.price ? R.money(a.price * (+b.querySelector('#baPpl').value || 1)) : 'Free'; };
      b.querySelector('#baPpl').oninput = upd; upd();
      b.querySelector('#baGo').onclick = () => {
        const r = b.querySelector('#baRes').value;
        if (R.bookActivity(a.id, r, b.querySelector('#baDate').value, b.querySelector('#baTime').value, +b.querySelector('#baPpl').value)) { R.closeModal(); R.rerender(); R.toast(`${a.name} booked for room ${R.res(r).room}`); }
      };
    });
  };
  R.act.cancelAct = d => {
    if (!R.need('activity')) return;
    const b = R.S.actBookings.find(x => x.id === d.id), r = R.res(b.resId);
    R.confirm('Cancel this activity?', `${esc(act(b.actId).name)} for room ${r.room}. ${b.line ? 'The charge is removed from the bill.' : ''}`, 'Cancel activity', () => {
      b.status = 'cancelled';
      const f = b.line && r.folio.find(x => x.id === b.line);
      if (f && !f.void) f.void = { by: R.S.user, reason: 'Activity cancelled', date: bd() };
      R.log('Activity cancelled', act(b.actId).name, r.id); R.rerender(); R.toast('Activity cancelled');
    }, true);
  };
  R.views.activities = {
    title: 'Activities & spa',
    hint: 'Massage, videoke, swimming lessons and events, with places left for each session.',
    render() {
      if (!actDate || actDate < bd()) actDate = bd();
      const day = R.S.actBookings.filter(b => b.date === actDate && b.status === 'confirmed').sort((a, b) => a.time.localeCompare(b.time));
      return `<div class="row" style="margin-bottom:12px"><label class="field" style="flex-direction:row;align-items:center;gap:8px">Showing<input type="date" value="${actDate}" min="${bd()}" data-change="actDate"></label></div>
        <div class="grid g-side"><div class="grid g2">${R.S.activities.map(a => `<div class="panel"><div class="ph"><h3>${esc(a.name)}</h3><div class="sp"><span class="chip">${esc(a.dept)}</span></div></div>
          <p class="small muted" style="margin-bottom:8px">${a.price ? R.money(a.price) + ' per person' : 'Free for guests'} · up to ${a.cap} people</p>
          <div class="row">${a.times.map(t => { const l = spaceLeft(a, actDate, t); return `<button class="btn sm ${l ? 'ghost' : ''}" ${l ? '' : 'disabled'} data-act="bookAct" data-id="${a.id}" data-time="${t}">${t} · ${l ? l + ' left' : 'full'}</button>`; }).join('')}</div></div>`).join('')}</div>
        <div class="panel"><h2>Booked for ${R.fmt(actDate)}</h2>${day.map(b => { const r = R.res(b.resId); return `<div class="list-item"><b class="num">${b.time}</b><div class="grow small">${esc(act(b.actId).name)}<div class="muted">Room ${r.room} · ${esc(R.guest(r.guestId).name)} · ${b.people} pax</div></div><button class="btn sm ghost" data-act="cancelAct" data-id="${b.id}" aria-label="Cancel ${esc(act(b.actId).name)}">Cancel</button></div>`; }).join('') || '<p class="empty">Nothing booked yet</p>'}</div></div>`;
    }
  };

  // ---------- Guest phone app ----------
  let gScreen = 'home', gCart = [];
  R.act.gGo = d => { gScreen = d.s; R.render(); };
  R.act.gWho = (d, el) => { R.S.guestResId = el.value; gScreen = 'home'; gCart = []; R.rerender(); };
  R.act.gReq = d => {
    const r = R.res(R.S.guestResId);
    const text = d.text || (document.getElementById('gReqText') || {}).value;
    if (!text) return R.toast('Type what you need first', 'warn');
    R.S.tasks.unshift({ id: R.nextId('Q'), kind: d.dept === 'Maintenance' ? 'repair' : 'request', area: r.room, resId: r.id, text, dept: d.dept || 'Front office', priority: 'medium', status: 'new', by: 'Guest app', assignee: d.dept === 'Maintenance' ? 'S9' : null, created: bd(), at: R.now(), blocks: false });
    R.log('Guest request', text, r.id, 'guest');
    gScreen = 'sent'; R.rerender(); R.toast(`Staff notified: "${text}"`);
  };
  R.act.gBookAct = d => { if (R.bookActivity(d.id, R.S.guestResId, bd(), d.time, 2)) { gScreen = 'booked'; R.rerender(); R.toast('Booked and added to your bill'); } };
  R.act.gAdd = d => { gCart.push(d.id); R.render(); };
  R.act.gOrder = () => {
    if (!gCart.length) return;
    const r = R.res(R.S.guestResId);
    const total = gCart.reduce((s, id) => s + R.S.menu.find(m => m.id === id).price, 0) + 50;
    const desc = 'Room service: ' + gCart.map(id => R.S.menu.find(m => m.id === id).name).join(', ') + ' (+₱50 delivery)';
    R.postCharge(r, desc, 'Food & beverage', total);
    R.S.tasks.unshift({ id: R.nextId('Q'), kind: 'request', area: r.room, resId: r.id, text: 'Deliver room service order', dept: 'Food & beverage', priority: 'high', status: 'new', by: 'Guest app', assignee: null, created: bd(), at: R.now(), blocks: false });
    R.log('Room service', `${desc} · ${R.money(total)}`, r.id, 'guest');
    gCart = []; gScreen = 'ordered'; R.rerender(); R.toast('Order sent to the kitchen');
  };
  // express check-out: the guest pays the balance on their phone first
  R.act.gCheckout = () => {
    const r = R.res(R.S.guestResId);
    R.postNightsUpTo(r, bd());
    const bal = R.balance(r), ref = (document.getElementById('gRef') || {}).value || '';
    const m = (document.querySelector('input[name=gpm]:checked') || {}).value || 'GCash';
    if (bal > 0 && m !== 'Card' && ref.trim().length < 4) { R.save(); R.render(); return R.toast(`Enter the ${m} reference number`, 'warn'); }
    if (bal > 0) R.addPayment(r, bal, m + ' (guest app)', ref.trim(), R.S.user, 'Express check-out');
    gScreen = 'bye';
    R.finishCheckout(r);
    R.closeModal();
  };

  function phone(r) {
    const g = R.guest(r.guestId), first = g.name.split(' ')[0];
    const back = `<button class="g-back" data-act="gGo" data-s="home">← Back</button>`;
    const head = (title, sub) => `<div class="g-hero" style="padding-top:28px">${back}<h2>${title}</h2>${sub ? `<p style="opacity:.85">${sub}</p>` : ''}</div>`;
    const S = {
      home: () => `<div class="g-hero"><p style="opacity:.8">Camsair Resort</p><h2>Welcome, ${esc(first)}</h2><p style="opacity:.9">Room ${r.room} · ${esc(R.type(r.type).name)}<br>Until ${R.fmt(R.dep(r))}</p></div>
        <div class="g-body"><div class="g-actions">
          <button data-act="gGo" data-s="request">${R.icon('check')}Ask for something</button>
          ${R.S.modules.activities ? `<button data-act="gGo" data-s="acts">${R.icon('sun')}Activities</button>` : ''}
          ${R.S.modules.fnb ? `<button data-act="gGo" data-s="food">${R.icon('cup')}Order food</button>` : ''}
          <button data-act="gGo" data-s="bill">${R.icon('book')}My bill</button>
          <button data-act="gGo" data-s="info">${R.icon('desk')}Resort info</button>
          <button data-act="gGo" data-s="bill">${R.icon('back')}Check out</button></div>
          <div class="g-card"><b>Wi-Fi</b><p class="small muted">Network: Camsair-Guest · Password on your key card sleeve</p></div>
          <div class="g-card"><b>Today</b><p class="small muted">Zumba by the pool 7:00 am · Pool open until 10 pm · Boodle fight dinner 6:30 pm</p></div></div>`,
      request: () => head('How can we help?', 'Your request goes straight to the right team.') + `<div class="g-body">
        ${[['Extra towels', 'Housekeeping'], ['Clean my room now', 'Housekeeping'], ['Late check-out', 'Front office'], ['Van to the airport', 'Front office'], ['Something is broken', 'Maintenance']].map(([t, dpt]) => `<button class="g-card" style="width:100%;text-align:left;cursor:pointer" data-act="gReq" data-text="${t}" data-dept="${dpt}"><b>${t}</b><div class="small muted">${dpt}</div></button>`).join('')}
        <div class="g-card"><label class="field">Something else<textarea id="gReqText" rows="2" placeholder="e.g. extra mattress, more pillows"></textarea></label><button class="btn sm" style="margin-top:8px" data-act="gReq" data-dept="Front office">Send</button></div></div>`,
      sent: () => head('Request sent', 'The team has it. We\'ll let you know when it\'s done.') + `<div class="g-body"><div class="g-card small">Staff see it under Tasks.</div></div>`,
      acts: () => head('Activities today', 'Booked activities go on your room bill.') + `<div class="g-body">${R.S.activities.map(a => `<div class="g-card"><b>${esc(a.name)}</b><div class="small muted">${a.price ? R.money(a.price) + ' pp' : 'Free'}</div><div class="row" style="margin-top:6px">${a.times.map(t => { const l = spaceLeft(a, bd(), t); return `<button class="btn sm ${l >= 2 ? 'ghost' : ''}" ${l >= 2 ? '' : 'disabled'} data-act="gBookAct" data-id="${a.id}" data-time="${t}">${t}</button>`; }).join('')}</div></div>`).join('')}</div>`,
      booked: () => head('You\'re booked', 'See you there! It\'s been added to your bill.') + '<div class="g-body"><div class="g-card small">Staff see this booking under Activities &amp; spa.</div></div>',
      food: () => head('Room service', 'Delivered in about 30 minutes. ₱50 delivery.') + `<div class="g-body">${R.S.menu.filter(m => m.cat !== 'Breakfast').map(m => `<div class="g-card row"><div style="flex:1"><b>${esc(m.name)}</b><div class="small muted">${R.money(m.price)}</div></div><button class="btn sm ghost" data-act="gAdd" data-id="${m.id}">Add</button></div>`).join('')}
        <div style="position:sticky;bottom:0;padding:10px 0;background:#FBF8F2"><button class="btn" style="width:100%;justify-content:center" data-act="gOrder" ${gCart.length ? '' : 'disabled'}>${gCart.length ? `Order ${gCart.length} item${gCart.length > 1 ? 's' : ''} · ${R.money(gCart.reduce((s, id) => s + R.S.menu.find(m => m.id === id).price, 0) + 50)}` : 'Add items to order'}</button></div></div>`,
      ordered: () => head('Order on its way', 'The kitchen has your order.') + '<div class="g-body"><div class="g-card small">The charge is on your bill.</div></div>',
      bill: () => { const exp = R.expectedBalance(r); return head('My bill', `Room ${r.room}`) + `<div class="g-body"><div class="g-card">${R.lines(r).map(f => `<div class="ticket-line small"><span>${esc(f.desc)}</span><b>${R.money(f.amount)}</b></div>`).join('')}
        ${exp !== R.balance(r) ? `<div class="ticket-line small"><span>Nights not yet posted</span><b>${R.money(exp - R.balance(r))}</b></div>` : ''}
        <div class="ticket-line small"><span>Paid</span><b>− ${R.money(R.paid(r))}</b></div><div class="ticket-line"><b>To pay at check-out</b><b>${R.money(exp)}</b></div></div>
        ${R.dep(r) <= bd() ? `${exp > 0 ? `<div class="g-card"><div class="methods" role="radiogroup" aria-label="Pay with">${['GCash', 'Maya', 'Card'].map((m, i) => `<label><input type="radio" name="gpm" value="${m}" ${i ? '' : 'checked'}><span>${m}</span></label>`).join('')}</div>
          <label class="field">Reference no. (GCash / Maya)<input id="gRef" placeholder="From your payment app"></label></div>` : ''}
          <button class="btn" style="width:100%;justify-content:center" data-act="gCheckout">${exp > 0 ? 'Pay ' + R.money(exp) + ' and check out' : 'Express check-out'}</button>
          <p class="small muted" style="margin-top:8px">Leave your key at the front desk.</p>` : `<p class="small muted">Express check-out opens on your departure day, ${R.fmt(R.dep(r))}.</p>`}</div>`; },
      info: () => head('Resort info') + `<div class="g-body">${[['Swimming pool', '8 am – 10 pm · lifeguard on duty until 5 pm'], ['Camsair Restaurant', 'Breakfast 6:30–10 am · Lunch and dinner until 9 pm'], ['Poolside Bar', '10 am – 10 pm'], ['Massage', '10 am – 7 pm'], ['Front desk', 'Open 24 hours · dial 0'], ['Check-out', R.S.rules.checkout + ' · late check-out on request']].map(([a, b]) => `<div class="g-card"><b>${a}</b><div class="small muted">${esc(b)}</div></div>`).join('')}</div>`,
      bye: () => `<div class="g-hero" style="min-height:300px"><h2>Thanks for staying, ${esc(first)}</h2><p>Your receipt is on its way by email. Safe travels!</p></div><div class="g-body"><div class="g-card small">Pick another guest above to keep exploring.</div></div>`
    };
    return (S[gScreen] || S.home)();
  }

  R.views.guestapp = {
    title: 'Guest app',
    hint: 'What guests see when they scan the QR code in their room. Nothing to download.',
    render() {
      const ih = R.inhouse();
      let r = R.res(R.S.guestResId);
      if (!r || (r.status !== 'inhouse' && gScreen !== 'bye')) { r = ih[0]; R.S.guestResId = r ? r.id : ''; }
      if (!r) return '<p class="empty">No guests in house to preview.</p>';
      const feed = R.S.tasks.filter(t => t.resId).slice(0, 6);
      return `<div class="phone-wrap"><div>
          <label class="field" style="margin-bottom:12px">Preview as<select data-change="gWho">${ih.map(x => `<option value="${x.id}" ${x.id === R.S.guestResId ? 'selected' : ''}>Room ${x.room}, ${esc(R.guest(x.guestId).name)}</option>`).join('')}</select></label>
          <div class="phone"><div class="screen">${phone(r)}</div></div></div>
        <div class="stack"><div class="panel"><h2>What staff see, live</h2>
          ${feed.map(q => { const x = R.res(q.resId); return `<div class="list-item"><b class="num small">${q.at}</b><div class="grow small">${esc(q.text)}<div class="muted">Room ${x ? x.room : q.area} · ${esc(q.dept)}</div></div>${R.chip(q.status)}</div>`; }).join('')}
          <a class="btn ghost sm" href="#tasks" style="margin-top:8px">Open tasks</a></div>
          <div class="panel"><h2>Why a web app, not a download</h2><p class="muted">Guests scan a QR code in the room and it opens in their phone browser, already linked to their booking. Most guests won't install an app for a three-night stay, but nearly all will scan a code.</p></div></div></div>`;
    }
  };
})();
