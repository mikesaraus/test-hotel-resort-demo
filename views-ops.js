/* Daily operations: overview, today, front desk, reservations, calendar + shared reservation dialogs */
(function () {
  const { addDays, TODAY } = R.util;
  const esc = R.esc;

  // ---------- shared: reservation row + dialogs ----------
  R.resRow = function (r, actions) {
    const g = R.guest(r.guestId);
    return `<tr class="click" data-act="openRes" data-id="${r.id}">
      <td><b>${esc(g.name)}</b>${g.tag ? ` <span class="chip amber">${esc(g.tag)}</span>` : ''}<div class="small muted">${r.id} · ${esc(r.channel)}</div></td>
      <td>${r.room ? `<b>${r.room}</b>` : '<span class="chip red">No room</span>'}<div class="small muted">${esc(R.type(r.type).name)}</div></td>
      <td class="small">${R.fmtShort(r.arrive)} → ${R.fmtShort(R.dep(r))}<div class="muted">${r.nights} night${r.nights > 1 ? 's' : ''} · ${r.adults + r.children} guests</div></td>
      <td>${R.chip(r.status)}</td>
      <td class="right">${actions || ''}</td></tr>`;
  };

  function canCheckIn(r) {
    if (r.status !== 'booked' || r.arrive > TODAY) return [false, 'Arrives ' + R.fmt(r.arrive)];
    if (!r.room) return [false, 'Assign a room first'];
    const hk = R.room(r.room).hk;
    if (hk === 'dirty') return [false, `Room ${r.room} still needs cleaning`];
    if (hk === 'ooo') return [false, `Room ${r.room} is out of order`];
    return [true, ''];
  }
  R.canCheckIn = canCheckIn;

  R.act.openRes = d => R.openRes(d.id);
  R.openRes = function (id) {
    const r = R.res(id), g = R.guest(r.guestId), t = R.type(r.type);
    const free = r.status === 'booked' ? R.freeRooms(r.type, r.arrive, r.nights, r.id) : [];
    const [ci, why] = canCheckIn(r);
    const bal = R.balance(r);
    const folio = r.folio.length ? r.folio.map(f => `<div class="ticket-line"><span>${R.fmtShort(f.date)} · ${esc(f.desc)} <span class="muted small">${esc(f.dept)}</span></span><b class="num">${R.money(f.amount)}</b></div>`).join('')
      : '<p class="muted small">No charges yet. Room nights are posted at check-in.</p>';
    R.modal(`${g.name} — ${r.id}`, `
      <div class="row" style="margin-bottom:12px">${R.chip(r.status)} ${g.tag ? `<span class="chip amber">${esc(g.tag)}</span>` : ''} <span class="chip">${esc(r.channel)}</span></div>
      <dl class="kv">
        <dt>Stay</dt><dd>${R.fmt(r.arrive)} → ${R.fmt(R.dep(r))} (${r.nights} nights)</dd>
        <dt>Room type</dt><dd>${esc(t.name)} · ${t.size}</dd>
        <dt>Room</dt><dd>${r.status === 'booked' ? `<select id="assignSel"><option value="">— not assigned —</option>${(r.room && !free.find(x => x.no === r.room) ? [R.room(r.room)] : []).concat(free).map(x => `<option value="${x.no}" ${x.no === r.room ? 'selected' : ''}>${x.no} — ${R.chip(x.hk).replace(/<[^>]+>/g, '')}</option>`).join('')}</select>` : (r.room || '—')}</dd>
        <dt>Guests</dt><dd>${r.adults} adults, ${r.children} children</dd>
        <dt>Rate</dt><dd>${R.money(r.rate)} per night</dd>
        <dt>Arriving</dt><dd>around ${r.eta}</dd>
        <dt>Contact</dt><dd>${esc(g.email)} · ${esc(g.phone)} · ${esc(g.country)}</dd>
      </dl>
      <h3 style="margin:16px 0 6px">Bill (folio)</h3>${folio}
      <div class="ticket-line"><span>Paid</span><b class="num">− ${R.money(r.paid)}</b></div>
      <div class="ticket-line"><b>Balance due</b><b class="num">${R.money(bal)}</b></div>
      ${ci || r.status !== 'booked' ? '' : `<p class="small" style="color:var(--hibiscus);margin-top:10px">Can't check in yet: ${esc(why)}</p>`}
      <div class="foot" style="flex-wrap:wrap">
        ${r.status === 'booked' ? `<button class="btn ghost warn-text" data-act="cancelRes" data-id="${r.id}">Cancel booking</button>` : ''}
        ${r.status === 'inhouse' ? `<button class="btn ghost" data-act="addCharge" data-id="${r.id}">Add charge</button>` : ''}
        ${bal > 0 && r.status !== 'cancelled' ? `<button class="btn ghost" data-act="takePay" data-id="${r.id}">Take payment</button>` : ''}
        ${r.status === 'booked' ? `<button class="btn" data-act="checkIn" data-id="${r.id}" ${ci ? '' : 'disabled'}>Check in</button>` : ''}
        ${r.status === 'inhouse' ? `<button class="btn" data-act="checkOut" data-id="${r.id}">${bal > 0 ? 'Settle ' + R.money(bal) + ' and check out' : 'Check out'}</button>` : ''}
      </div>`, body => {
      const s = body.querySelector('#assignSel');
      if (s) s.addEventListener('change', () => { r.room = s.value || null; R.save(); R.toast(r.room ? `Room ${r.room} assigned to ${g.name}` : 'Room unassigned'); R.render(); R.openRes(r.id); });
    });
  };

  R.act.checkIn = d => {
    const r = R.res(d.id), [ok, why] = canCheckIn(r);
    if (!ok) return R.toast(why);
    r.status = 'inhouse';
    r.folio.push({ date: TODAY, desc: `Room — ${r.nights} night${r.nights > 1 ? 's' : ''} @ ${R.money(r.rate)}`, dept: 'Rooms', amount: r.rate * r.nights });
    R.room(r.room).hk = 'clean';
    R.closeModal(); R.rerender();
    R.toast(`${R.guest(r.guestId).name} checked in to ${r.room}. Key card ready.`);
  };
  R.act.checkOut = d => {
    const r = R.res(d.id);
    r.paid = R.total(r); r.status = 'checkedout';
    if (R.dep(r) > TODAY) r.nights = Math.max(1, Math.round((new Date(TODAY) - new Date(r.arrive)) / 864e5)) || r.nights;
    const room = R.room(r.room); room.hk = 'dirty'; room.attendant = room.attendant || 'S6';
    R.closeModal(); R.rerender();
    R.toast(`${R.guest(r.guestId).name} checked out. Room ${r.room} sent to housekeeping.`);
  };
  R.act.takePay = d => {
    const r = R.res(d.id), bal = R.balance(r);
    R.modal('Take payment', `<div class="form">
      <label class="field">Amount<input id="payAmt" type="number" value="${bal}" min="1"></label>
      <label class="field">Method<select id="payMethod"><option>Cash</option><option>GCash</option><option>Maya</option><option>Card (terminal)</option><option>Bank transfer</option></select></label></div>
      <div class="foot"><button class="btn ghost" data-act="openRes" data-id="${r.id}">Back</button><button class="btn" id="payGo">Record payment</button></div>`, b => {
      b.querySelector('#payGo').onclick = () => { const a = +b.querySelector('#payAmt').value; if (a > 0) { r.paid += a; R.save(); R.toast(`${R.money(a)} received from ${R.guest(r.guestId).name}`); R.render(); R.openRes(r.id); } };
    });
  };
  R.act.addCharge = d => {
    const r = R.res(d.id);
    R.modal('Add charge to room ' + r.room, `<div class="form">
      <label class="field full">Description<input id="chDesc" value="Minibar"></label>
      <label class="field">Department<select id="chDept"><option>Food & beverage</option><option>Spa</option><option>Activities</option><option>Day tour & cottages</option><option>Rooms</option><option>Other</option></select></label>
      <label class="field">Amount (₱)<input id="chAmt" type="number" value="150"></label></div>
      <div class="foot"><button class="btn ghost" data-act="openRes" data-id="${r.id}">Back</button><button class="btn" id="chGo">Add charge</button></div>`, b => {
      b.querySelector('#chGo').onclick = () => {
        r.folio.push({ date: TODAY, desc: b.querySelector('#chDesc').value, dept: b.querySelector('#chDept').value, amount: +b.querySelector('#chAmt').value });
        R.save(); R.toast('Charge added'); R.render(); R.openRes(r.id);
      };
    });
  };
  R.act.cancelRes = d => {
    if (!confirm('Cancel this booking? The room becomes available again.')) return;
    const r = R.res(d.id); r.status = 'cancelled'; r.room = null;
    R.closeModal(); R.rerender(); R.toast(`Booking ${r.id} cancelled`);
  };

  // ---------- new booking ----------
  R.act.newBooking = d => R.newBooking(d || {});
  R.newBooking = function (pre) {
    const types = R.S.roomTypes;
    R.modal('New booking', `<div class="form">
      <label class="field full">Guest<select id="nbGuest"><option value="__new">+ New guest…</option>${R.S.guests.slice(0, 60).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
      <label class="field full" id="nbNewWrap">New guest name<input id="nbNew" value="Juan Dela Cruz"></label>
      <label class="field">Room type<select id="nbType">${types.map(t => `<option value="${t.id}" ${pre.type === t.id ? 'selected' : ''}>${esc(t.name)} — ${R.money(t.base)}</option>`).join('')}</select></label>
      <label class="field">Booked through<select id="nbCh">${['Walk-in', 'Facebook Messenger', 'Phone / text', 'Agoda', 'Booking.com'].map(c => `<option ${pre.ch === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field">Arrival<input id="nbArr" type="date" value="${pre.date || addDays(TODAY, 3)}" min="${TODAY}"></label>
      <label class="field">Nights<input id="nbN" type="number" value="3" min="1" max="30"></label>
      <label class="field">Adults<input id="nbA" type="number" value="2" min="1" max="6"></label>
      <label class="field">Children<input id="nbC" type="number" value="0" min="0" max="4"></label>
      <div class="full panel" id="nbQuote" style="background:var(--bg)"></div></div>
      <div class="foot"><button class="btn ghost" id="nbCancel">Cancel</button><button class="btn" id="nbGo">Create booking</button></div>`, b => {
      const $ = s => b.querySelector(s);
      const quote = () => {
        $('#nbNewWrap').style.display = $('#nbGuest').value === '__new' ? '' : 'none';
        const t = R.type($('#nbType').value), n = +$('#nbN').value || 1, a = $('#nbArr').value;
        const left = R.typeAvail(t.id, a, n), ppl = +$('#nbA').value + +$('#nbC').value;
        const tooMany = ppl > t.cap;
        $('#nbQuote').innerHTML = `<div class="row"><b>${left} ${esc(t.name)}${left === 1 ? '' : 's'} free</b> for ${R.fmt(a)} → ${R.fmt(addDays(a, n))}<span style="margin-left:auto" class="num"><b>${R.money(t.base * n)}</b> total</span></div>
          ${tooMany ? `<p class="small" style="color:var(--hibiscus)">This room sleeps ${t.cap}. Choose a bigger room type.</p>` : ''}
          ${left === 0 ? '<p class="small" style="color:var(--hibiscus)">Sold out for these dates — try another room type or date.</p>' : ''}`;
        $('#nbGo').disabled = left === 0 || tooMany;
      };
      b.querySelectorAll('input,select').forEach(i => i.addEventListener('input', quote));
      quote();
      $('#nbCancel').onclick = R.closeModal;
      $('#nbGo').onclick = () => {
        let gid = $('#nbGuest').value;
        if (gid === '__new') {
          gid = R.nextId('G');
          const nm = $('#nbNew').value.trim() || 'New guest';
          R.S.guests.unshift({ id: gid, name: nm, email: nm.toLowerCase().replace(/\s+/g, '.') + '@example.com', phone: '+63 917 000 0000', country: 'Walk-in', tag: '', stays: 1 });
        }
        const t = R.type($('#nbType').value), n = +$('#nbN').value, a = $('#nbArr').value;
        const room = pre.room && R.roomFree(pre.room, a, n) && R.room(pre.room).type === t.id ? pre.room : (R.freeRooms(t.id, a, n)[0] || {}).no || null;
        const r = { id: 'CR-' + (++R.S.seq), guestId: gid, type: t.id, room, arrive: a, nights: n, adults: +$('#nbA').value, children: +$('#nbC').value, channel: $('#nbCh').value, rate: t.base, status: 'booked', notes: '', folio: [], paid: 0, eta: '14:00' };
        R.S.reservations.push(r);
        R.closeModal(); R.rerender();
        R.toast(`Booking ${r.id} created${room ? ' — room ' + room + ' assigned' : ''}. Confirmation sent by text.`);
      };
    });
  };

  // ---------- Start here ----------
  R.views.overview = {
    title: 'Start here',
    hint: 'A tour of how Camsair runs day to day in this system. Every screen is clickable and runs on sample data.',
    render() {
      const steps = [
        ['Day tour at the gate', 'Walk-in guests pay entrance, rent a cottage and extras at the front desk. Senior and PWD discounts, GCash and change are handled for you.', 'frontdesk', 'Open the till'],
        ['Book a room', 'Guests book by Facebook Messenger, text, Agoda or as walk-ins. Every booking lands in one list, so the same room is never sold twice.', 'reservations', 'Make a booking'],
                ['Check in', 'Front desk only checks a guest into a room that is clean. The bill opens and room nights are posted.', 'frontdesk', 'Check a guest in'],
        ['During the stay', 'Guests order from the phone app. Massage, videoke and restaurant bills go straight to the room. Requests reach the right team.', 'guestapp', 'Open the guest app'],
        ['Check out', 'Front desk settles the bill in one step. The room turns "needs cleaning" and appears on the housekeeper\'s list.', 'housekeeping', 'Clean a room'],
        ['After the stay', 'Reports update by themselves: occupancy, average rate, revenue per department, and where bookings came from.', 'reports', 'See the reports']
      ];
      const tries = [
        ['frontdesk', 'Sell a day tour: 4 adults, 1 senior and a kubo, paid in cash. Then look at the receipt.'],
        ['frontdesk', 'Check in an arrival whose room is ready, then try one whose room is still dirty.'],
        ['map', 'Click a yellow room on the property map and mark it clean, then ready.'],
        ['guestapp', 'As a guest, ask for extra towels, then switch to Housekeeping to see it arrive.'],
        ['dining', 'Ring up sisig and Red Horse at the Poolside Bar and charge it to a room.'],
        ['maintenance', 'Report a broken aircon and block the room so nobody can be checked into it.']
      ];
      return `<div class="grid g3">${steps.map((s, i) => `
        <div class="panel"><div class="row" style="margin-bottom:6px"><span class="avatar">${i + 1}</span><h2>${s[0]}</h2></div>
        <p class="muted" style="margin-bottom:12px">${s[1]}</p><a class="btn ghost sm" href="#${s[2]}">${s[3]}</a></div>`).join('')}</div>
        <div class="grid g2" style="margin-top:16px">
          <div class="panel"><h2>Try these</h2>${tries.map(t => `<div class="list-item"><div class="grow">${t[1]}</div><a class="btn sm" href="#${t[0]}">Go</a></div>`).join('')}</div>
          <div class="panel"><h2>The resort in this demo</h2>
            <dl class="kv"><dt>Name</dt><dd>Camsair Resort</dd><dt>Location</dt><dd>Brgy. San Pedro, Initao, Misamis Oriental</dd>
            <dt>Rooms</dt><dd>${R.S.rooms.length} rooms, ${R.S.dayuse.cottages.length} cottages for day tours</dd>
            ${R.S.roomTypes.map(t => `<dt>${esc(t.name)}</dt><dd>${R.S.rooms.filter(r => r.type === t.id).length} rooms · ${t.size} · sleeps ${t.cap} · from ${R.money(t.base)}</dd>`).join('')}
            <dt>Facilities</dt><dd>Swimming pool, kubo and family cottages, pavilion, Camsair Restaurant, Poolside Bar, massage, videoke</dd>
            <dt>Staff</dt><dd>${R.S.staff.length} people in 6 departments</dd></dl>
            <p class="small muted" style="margin-top:10px">Room types, prices, cottages and staff are placeholders until Camsair sends the real ones. Use "Viewing as" in the sidebar to see what each team sees. Changes are saved in this browser. "Reset sample data" starts over.</p></div>
        </div>`;
    }
  };

  // ---------- Today ----------
  R.views.today = {
    title: 'Today',
    hint: 'Everything happening at the resort today, at a glance.',
    how: ['The numbers at the top update live as you check guests in and out.', 'The alerts list shows only problems that need someone today.', 'Click any guest to open the booking and bill.'],
    render() {
      const L = R.live();
      const arr = L.filter(r => r.arrive === TODAY && (r.status === 'booked' || r.status === 'inhouse'));
      const dep = L.filter(r => R.dep(r) === TODAY);
      const ih = L.filter(r => r.status === 'inhouse');
      const dirty = R.S.rooms.filter(r => r.hk === 'dirty').length;
      const occ = R.occupancyOn(TODAY);
      const rev = R.S.reservations.reduce((s, r) => s + r.folio.filter(f => f.date === TODAY).reduce((a, f) => a + f.amount, 0), 0) + R.S.orders.filter(o => o.date === TODAY && !o.inFolio).reduce((s, o) => s + o.total, 0) + R.S.sales.filter(s => s.date === TODAY && s.method !== 'room').reduce((a, s) => a + s.calc.total, 0);
      const alerts = [];
      arr.filter(r => r.status === 'booked' && !r.room).forEach(r => alerts.push(['red', `${R.guest(r.guestId).name} arrives today with no room assigned`, r.id]));
      arr.filter(r => r.status === 'booked' && r.room && R.room(r.room).hk === 'dirty').forEach(r => alerts.push(['amber', `Room ${r.room} must be cleaned before ${R.guest(r.guestId).name} arrives (${r.eta})`, r.id]));
      R.S.tickets.filter(t => t.status !== 'done' && (t.priority === 'urgent' || t.priority === 'high')).forEach(t => alerts.push(['red', `Maintenance: ${t.title} — ${t.room}`, null, 'maintenance']));
      R.S.requests.filter(q => q.status === 'new').forEach(q => alerts.push(['amber', `Guest request: ${q.text}`, null, 'requests']));
      ih.filter(r => R.guest(r.guestId).tag === 'VIP').slice(0, 3).forEach(r => alerts.push(['teal', `VIP in house: ${R.guest(r.guestId).name}, room ${r.room}`, r.id]));
      const acts = R.S.actBookings.filter(a => a.date === TODAY).sort((a, b) => a.time.localeCompare(b.time));
      return `
      <div class="pulse">
        <div><b>${occ.pct}%</b><span>Occupancy tonight (${occ.sold}/${R.S.rooms.length})</span></div>
        <div><b>${arr.filter(r => r.status === 'booked').length}</b><span>Arrivals still to come</span></div>
        <div><b>${dep.filter(r => r.status === 'inhouse').length}</b><span>Departures still to go</span></div>
        <div><b>${R.S.sales.filter(s => s.date === TODAY).reduce((a, s) => a + s.calc.heads, 0)}</b><span>Day guests through the gate</span></div>
        <div><b>${dirty}</b><span>Rooms to clean</span></div>
        <div><b>${R.money(rev)}</b><span>Revenue posted today</span></div>
      </div>
      <div class="grid g-side">
        <div class="stack">
          <div class="panel"><div class="ph"><h2>Arrivals</h2><div class="sp"><a class="btn ghost sm" href="#frontdesk">Open front desk</a></div></div>
            <table><tbody>${arr.map(r => R.resRow(r)).join('') || '<tr><td class="empty">No arrivals today</td></tr>'}</tbody></table></div>
          <div class="panel"><h2>Departures</h2><table><tbody>${dep.map(r => R.resRow(r)).join('') || '<tr><td class="empty">No departures today</td></tr>'}</tbody></table></div>
        </div>
        <div class="stack">
          <div class="panel"><h2>Needs attention</h2>${alerts.map(a => `<div class="list-item"><span class="chip ${a[0]}">${a[0] === 'red' ? 'Now' : a[0] === 'amber' ? 'Soon' : 'Info'}</span><div class="grow small">${esc(a[1])}</div>${a[2] ? `<button class="btn ghost sm" data-act="openRes" data-id="${a[2]}">Open</button>` : `<a class="btn ghost sm" href="#${a[3]}">Open</a>`}</div>`).join('') || '<p class="empty">All clear</p>'}</div>
          <div class="panel"><h2>Activities today</h2>${acts.map(a => { const x = R.S.activities.find(y => y.id === a.actId), r = R.res(a.resId); return `<div class="list-item"><b class="num">${a.time}</b><div class="grow small">${esc(x.name)}<div class="muted">${esc(R.guest(r.guestId).name)} · room ${r.room} · ${a.people} pax</div></div></div>`; }).join('') || '<p class="empty">Nothing booked</p>'}</div>
        </div>
      </div>`;
    }
  };

  // Front desk lives in views-frontdesk.js

  // ---------- Reservations ----------
  let rsStatus = 'upcoming', rsChannel = '', rsQ = '';
  R.act.rsFilter = (d, el) => { if (el.id === 'rsStatus') rsStatus = el.value; else rsChannel = el.value; R.render(); };
  R.views.reservations = {
    title: 'Reservations',
    hint: 'Every booking from every channel in one list.',
    how: ['Bookings from Facebook Messenger, phone, walk-ins, Agoda and Booking.com all land in this one list.', 'Click "New booking": the system checks live availability and price before saving.', 'Click any booking to assign a room, take a deposit or cancel.'],
    render() {
      const q = rsQ.toLowerCase();
      let L = R.S.reservations.slice();
      if (rsStatus === 'upcoming') L = L.filter(r => r.status === 'booked');
      else if (rsStatus) L = L.filter(r => r.status === rsStatus);
      if (rsChannel) L = L.filter(r => r.channel === rsChannel);
      if (q) L = L.filter(r => R.guest(r.guestId).name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
      L.sort((a, b) => a.arrive.localeCompare(b.arrive));
      const chs = [...new Set(R.S.reservations.map(r => r.channel))];
      return `<div class="panel"><div class="ph">
        <select id="rsStatus" data-change="rsFilter" class="search"><option value="upcoming" ${rsStatus === 'upcoming' ? 'selected' : ''}>Upcoming</option><option value="inhouse" ${rsStatus === 'inhouse' ? 'selected' : ''}>In house</option><option value="checkedout" ${rsStatus === 'checkedout' ? 'selected' : ''}>Checked out</option><option value="cancelled" ${rsStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option><option value="" ${rsStatus === '' ? 'selected' : ''}>All</option></select>
        <select id="rsChannel" data-change="rsFilter" class="search"><option value="">All channels</option>${chs.map(c => `<option ${c === rsChannel ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <input class="search" id="rsSearch" placeholder="Search guest or booking no." value="${esc(rsQ)}">
        <div class="sp"><span class="muted small">${L.length} bookings</span><button class="btn" data-act="newBooking">New booking</button></div></div>
        <table><thead><tr><th>Guest</th><th>Room</th><th>Stay</th><th>Status</th><th class="right">Value</th></tr></thead>
        <tbody>${L.slice(0, 150).map(r => R.resRow(r, `<span class="num">${R.money(r.rate * r.nights)}</span>`)).join('') || '<tr><td colspan="5" class="empty">No bookings match. Clear the filters or make a new booking.</td></tr>'}</tbody></table></div>`;
    },
    mount(el) {
      const s = el.querySelector('#rsSearch');
      s.addEventListener('input', () => { rsQ = s.value; const p = s.selectionStart; R.render(); const n = document.getElementById('rsSearch'); n.focus(); n.setSelectionRange(p, p); });
    }
  };

  // ---------- Room calendar (tape chart) ----------
  let calStart = addDays(TODAY, -2);
  R.act.calShift = d => { calStart = d.n === '0' ? addDays(TODAY, -2) : addDays(calStart, +d.n); R.render(); };
  R.act.calNew = d => R.newBooking({ room: d.room, type: R.room(d.room).type, date: d.date });
  R.views.calendar = {
    title: 'Room calendar',
    hint: 'Every room, every night. Dark = in house, teal = booked, grey = checked out.',
    how: ['Each row is a room and each column is a night.', 'Click a coloured bar to open that booking.', 'Click an empty future square to book that room from that date.'],
    render() {
      const days = 16, W = 62;
      const dates = Array.from({ length: days }, (_, i) => addDays(calStart, i));
      const end = addDays(calStart, days);
      let rows = '';
      R.S.zones.forEach(z => {
        rows += `<tr><td class="rn" style="background:var(--bg)" colspan="1">${esc(z.name)}</td><td colspan="${days}" style="background:var(--bg)"></td></tr>`;
        R.S.rooms.filter(r => r.zone === z.id).forEach(room => {
          const rs = R.live().filter(r => r.room === room.no && r.arrive < end && R.dep(r) > calStart);
          rows += `<tr><td class="rn">${room.no}<small>${esc(R.type(room.type).name)}</small> ${room.hk === 'ooo' ? R.chip('ooo') : ''}</td>`;
          dates.forEach(dt => {
            const r = rs.find(x => (x.arrive === dt) || (x.arrive < calStart && dt === calStart));
            let bar = '';
            if (r) {
              const s = r.arrive < calStart ? calStart : r.arrive;
              const n = Math.min(Math.round((new Date(R.dep(r)) - new Date(s)) / 864e5), Math.round((new Date(end) - new Date(s)) / 864e5));
              bar = `<div class="bar ${r.status}" style="width:${n * W - 4}px" data-act="openRes" data-id="${r.id}" title="${esc(R.guest(r.guestId).name)}">${esc(R.guest(r.guestId).name)}</div>`;
            } else if (room.hk === 'ooo' && dt >= TODAY && dt < addDays(TODAY, 3) && dt === (calStart > TODAY ? calStart : TODAY)) {
              bar = `<div class="bar ooo" style="width:${(Math.round((new Date(addDays(TODAY, 3)) - new Date(dt)) / 864e5)) * W - 4}px" data-act="go" data-v="maintenance">Out of order</div>`;
            }
            const busy = rs.some(x => x.arrive <= dt && dt < R.dep(x));
            const canBook = !busy && dt >= TODAY && !(room.hk === 'ooo' && dt < addDays(TODAY, 3));
            rows += `<td class="cell ${dt === TODAY ? 'today-col' : ''}" ${canBook ? `data-act="calNew" data-room="${room.no}" data-date="${dt}" title="Book ${room.no} from ${R.fmtShort(dt)}" style="cursor:copy"` : ''}>${bar}</td>`;
          });
          rows += '</tr>';
        });
      });
      return `<div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-act="calShift" data-n="-7">← Week</button><button class="btn ghost sm" data-act="calShift" data-n="0">Today</button><button class="btn ghost sm" data-act="calShift" data-n="7">Week →</button>
        <span class="legend" style="margin:0 0 0 12px"><span><i style="background:var(--ink);border-color:var(--ink)"></i>In house</span><span><i style="background:var(--sea);border-color:var(--sea)"></i>Booked</span><span><i style="background:#9AB0AD;border-color:#9AB0AD"></i>Checked out</span><span><i style="background:var(--hibiscus);border-color:var(--hibiscus)"></i>Out of order</span></span></div>
        <div class="tape"><table style="table-layout:fixed"><colgroup><col style="width:170px">${dates.map(() => `<col style="width:${W}px">`).join('')}</colgroup>
        <thead><tr><th style="left:0;z-index:3">Room</th>${dates.map(d => `<th class="${d === TODAY ? 'today-col' : ''}">${new Date(d + 'T12:00').toLocaleDateString('en-PH', { weekday: 'short' })}<br>${new Date(d + 'T12:00').getDate()}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }
  };
  R.act.go = d => R.go(d.v);
})();
