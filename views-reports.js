/* Reports: business health, daily manager report, revenue, day tour, operations, compliance (BIR / VAT). */
(function () {
  const { addDays, daysBetween } = R.util;
  const esc = R.esc;
  const bd = () => R.bd();
  const N = () => R.S.rooms.length;
  const DEPT_ORDER = ['Rooms', 'Food & beverage', 'Day tour & cottages', 'Spa & activities', 'Other'];
  const deptOf = d => DEPT_ORDER.includes(d) ? d : d === 'Spa' || d === 'Activities' ? 'Spa & activities' : 'Other';

  // room revenue for a night = the rate of every stay that covers that night
  const roomRevOn = day => R.live().filter(r => r.arrive <= day && day < R.dep(r)).reduce((s, r) => s + (r.rates[daysBetween(r.arrive, day)] || 0), 0);

  // all the figures for one business date (also saved by the night audit)
  R.dailyFigures = function (day) {
    const { sold, pct } = R.occupancyOn(day), rooms = roomRevOn(day);
    const dept = { Rooms: rooms };
    R.S.reservations.forEach(r => R.lines(r).forEach(f => { if (f.date === day && f.kind !== 'night' && f.kind !== 'night-moved') { const k = f.kind === 'fee' ? 'Rooms' : deptOf(f.dept); dept[k] = (dept[k] || 0) + f.amount; } }));
    R.S.sales.filter(s => s.date === day && s.method !== 'room').forEach(s => { const k = s.kind === 'fnb' ? 'Food & beverage' : 'Day tour & cottages'; dept[k] = (dept[k] || 0) + s.calc.total; });
    const pay = {};
    R.S.reservations.forEach(r => r.payments.filter(p => p.date === day).forEach(p => { pay[p.method] = (pay[p.method] || 0) + p.amount; }));
    R.S.sales.filter(s => s.date === day && s.method !== 'room').forEach(s => { const m = R.methodName(s.method); pay[m] = (pay[m] || 0) + R.saleAmount(s); });
    R.S.venueBookings.forEach(v => v.payments.filter(p => p.date === day).forEach(p => { pay[p.method] = (pay[p.method] || 0) + p.amount; }));
    // deposits kept when a cottage reservation is cancelled or never arrives
    R.S.venueBookings.filter(v => (v.status === 'noshow' || v.status === 'cancelled') && v.closed === day).forEach(v => { dept['Day tour & cottages'] = (dept['Day tour & cottages'] || 0) + R.vPaid(v); });
    const total = Object.values(dept).reduce((a, b) => a + b, 0);
    const voids = R.S.reservations.reduce((n, r) => n + r.folio.filter(f => f.void && f.void.date === day).length, 0);
    const refunds = R.S.reservations.reduce((s, r) => s + r.payments.filter(p => p.date === day && p.amount < 0).reduce((a, p) => a - p.amount, 0), 0);
    const shifts = R.S.shiftsClosed.filter(s => s.closedDate === day);
    const daySales = R.S.sales.filter(s => s.date === day);
    return {
      date: day, sold, occPct: pct, rooms, adr: sold ? rooms / sold : 0, revpar: rooms / N(), total, trevpar: total / N(), dept, pay,
      arrivals: R.S.reservations.filter(r => r.arrive === day && (r.status === 'inhouse' || r.status === 'checkedout')).length,
      departures: R.S.reservations.filter(r => R.dep(r) === day && r.status === 'checkedout').length,
      noshows: R.S.reservations.filter(r => r.arrive === day && r.status === 'noshow').length,
      cancels: R.S.reservations.filter(r => r.cancel && r.cancel.date === day).length,
      inhouse: R.live().filter(r => r.arrive <= day && day < R.dep(r)).reduce((s, r) => s + r.adults + r.children, 0),
      dayGuests: daySales.filter(s => s.kind === 'daytour').reduce((s, x) => s + x.calc.heads, 0),
      scDisc: daySales.reduce((s, x) => s + x.calc.discount, 0), voids, refunds,
      variance: shifts.reduce((s, x) => s + x.variance, 0), shifts: shifts.length,
      ooo: R.S.rooms.filter(r => r.ooo && r.ooo.since <= day && day < r.ooo.until).length
    };
  };

  // ---------- small chart pieces (single hue, hover tooltip, table alongside) ----------
  const tile = (v, l, sub) => `<div><b>${v}</b><span>${l}</span>${sub ? `<small class="muted">${sub}</small>` : ''}</div>`;
  const hbars = (rows, fmt) => { const max = Math.max(...rows.map(r => r[1]), 1); return rows.map(([k, v, note]) => `<div class="hbar"><span>${esc(k)}</span><div class="track" title="${esc(k)}: ${fmt(v)}"><div class="fill" style="width:${Math.max(0, v) / max * 100}%"></div></div><b class="num right">${fmt(v)}</b>${note ? `<small class="muted hnote">${note}</small>` : ''}</div>`).join(''); };

  let rTab = 'health', rDay = null;
  R.act.rTab = d => { rTab = d.tab; R.render(); };
  R.act.rDay = (d, el) => { rDay = el.value; R.render(); };

  function health() {
    const day = bd(), past = Array.from({ length: 14 }, (_, i) => addDays(day, i - 14)), fwd = Array.from({ length: 30 }, (_, i) => addDays(day, i));
    const F = past.map(R.dailyFigures);
    const sum = k => F.reduce((s, f) => s + f[k], 0);
    const sold = sum('sold'), rooms = sum('rooms'), total = sum('total');
    const live = R.live(), all = R.S.reservations;
    const recent = all.filter(r => r.created >= addDays(day, -60));
    const nonCancel = live.filter(r => r.arrive >= past[0] && r.arrive < day);
    const alos = nonCancel.length ? nonCancel.reduce((s, r) => s + r.nights, 0) / nonCancel.length : 0;
    const lead = nonCancel.length ? nonCancel.reduce((s, r) => s + daysBetween(r.created, r.arrive), 0) / nonCancel.length : 0;
    const cxl = recent.length ? recent.filter(r => r.status === 'cancelled').length / recent.length * 100 : 0;
    const due = all.filter(r => r.arrive < day && ['inhouse', 'checkedout', 'noshow'].includes(r.status) || r.status === 'noshow');
    const ns = due.length ? due.filter(r => r.status === 'noshow').length / due.length * 100 : 0;
    const direct = live.filter(r => !R.sourceFee(r.channel)).length / Math.max(1, live.length) * 100;
    const repeat = R.inhouse().filter(r => R.guest(r.guestId).stays > 1 || R.guest(r.guestId).tag === 'Repeat guest').length / Math.max(1, R.inhouse().length) * 100;
    const owed = all.filter(r => r.status === 'checkedout' || r.status === 'inhouse').reduce((s, r) => s + Math.max(0, R.balance(r)), 0);

    // occupancy by night: actual (past) and on the books (future), one hue
    const occ = past.concat(fwd).map(d => ({ d, ...R.occupancyOn(d) }));
    // pickup: on the books now vs 7 days ago, for each of the next 30 nights
    const weekAgo = addDays(day, -7);
    const otbThen = d => all.filter(r => r.created <= weekAgo && r.arrive <= d && d < R.dep(r) && (r.status !== 'cancelled' || (r.cancel && r.cancel.date > weekAgo))).length;
    const pace = fwd.map(d => ({ d, now: R.occupancyOn(d).sold, then: otbThen(d) }));
    const pickup = pace.reduce((s, p) => s + p.now - p.then, 0);
    const deptTotals = {}; F.forEach(f => Object.entries(f.dept).forEach(([k, v]) => { deptTotals[k] = (deptTotals[k] || 0) + v; }));
    const src = {}; live.filter(r => r.arrive >= past[0]).forEach(r => { const s = src[r.channel] = src[r.channel] || { n: 0, v: 0 }; s.n++; s.v += R.stayValue(r); });

    return `<p class="small muted" style="margin-bottom:10px">Last 14 nights (${R.fmtShort(past[0])} to ${R.fmtShort(past[13])}) unless noted.</p>
      <div class="pulse">${tile(Math.round(sold / (N() * 14) * 100) + '%', 'Occupancy')}${tile(R.money(sold ? rooms / sold : 0), 'ADR (average room rate)')}${tile(R.money(rooms / (N() * 14)), 'RevPAR (room revenue per room)')}
        ${tile(R.money(total / (N() * 14)), 'TRevPAR (all revenue per room)', 'includes day tour and restaurant')}${tile(R.money(total), 'Total revenue')}${tile(R.money(owed), 'Unpaid balances', 'in house and checked out')}</div>
      <div class="pulse">${tile(Math.round(direct) + '%', 'Booked direct (no commission)')}${tile(alos.toFixed(1) + ' nights', 'Average length of stay')}${tile(Math.round(lead) + ' days', 'Average booking lead time')}
        ${tile(Math.round(cxl) + '%', 'Cancellation rate', 'bookings made in the last 60 days')}${tile(Math.round(ns) + '%', 'No-show rate')}${tile(Math.round(repeat) + '%', 'Repeat guests in house')}</div>
      <div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Occupancy by night</h2><div class="sp legend" style="margin:0"><span><i style="background:var(--lagoon);border-color:var(--lagoon)"></i>Actual</span><span><i style="background:#D4A9A6;border-color:#D4A9A6"></i>On the books</span></div></div>
        <div class="bars" role="img" aria-label="Occupancy by night, last 14 and next 30 nights">${occ.map(o => `<div class="b ${o.d >= day ? 'f' : ''} ${o.d === day ? 'now' : ''}" style="height:${Math.max(o.pct, 2)}%" data-tip="${R.fmtShort(o.d)}: ${o.pct}% (${o.sold} rooms)"></div>`).join('')}</div>
        <div class="row small muted" style="justify-content:space-between;margin-top:4px"><span>${R.fmtShort(occ[0].d)}</span><span>Today</span><span>${R.fmtShort(occ[occ.length - 1].d)}</span></div></div>
      <div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Booking pace, next 30 nights</h2><div class="sp small muted">${pickup >= 0 ? '+' : ''}${pickup} room nights picked up in the last 7 days</div></div>
        <div class="sp legend" style="margin:0 0 6px"><span><i style="background:var(--sea);border-color:var(--sea)"></i>On the books now</span><span><i class="tick-key"></i>On the books 7 days ago</span></div>
        <div class="bars pace" role="img" aria-label="Rooms on the books per night now and 7 days ago">${pace.map(p => `<div class="b" style="height:${Math.max(p.now / N() * 100, 2)}%" data-tip="${R.fmtShort(p.d)}: ${p.now} rooms now, ${p.then} a week ago"><span class="tick" style="bottom:${p.then / N() * 100}%"></span></div>`).join('')}</div>
        <div class="row small muted" style="justify-content:space-between;margin-top:4px"><span>${R.fmtShort(fwd[0])}</span><span>${R.fmtShort(fwd[29])}</span></div></div>
      <div class="grid g2">
        <div class="panel"><h2>Revenue by department</h2>${hbars(Object.entries(deptTotals).sort((a, b) => b[1] - a[1]), R.money)}</div>
        <div class="panel"><h2>Booking sources</h2><div class="tbl"><table><thead><tr><th>Source</th><th class="right">Bookings</th><th class="right">Room revenue</th><th class="right">Commission</th><th class="right">Net</th></tr></thead><tbody>
          ${Object.entries(src).sort((a, b) => b[1].v - a[1].v).map(([k, v]) => { const c = v.v * R.sourceFee(k) / 100; return `<tr><td>${esc(k)}</td><td class="right">${v.n}</td><td class="right num">${R.money(v.v)}</td><td class="right num">${c ? R.money(c) : '—'}</td><td class="right num"><b>${R.money(v.v - c)}</b></td></tr>`; }).join('')}</tbody></table></div>
          <p class="small muted" style="margin-top:8px">Every booking moved from Agoda or Booking.com to Messenger or walk-in keeps about 15% more.</p></div>
        <div class="panel" style="grid-column:1/-1"><h2>Room types</h2><div class="tbl"><table><thead><tr><th>Type</th><th class="right">Rooms</th><th class="right">Occupancy, 14 nights</th><th class="right">ADR, 14 nights</th><th class="right">Tonight</th><th class="right">Base rate</th><th class="right">Bookings ahead</th></tr></thead><tbody>
          ${R.S.roomTypes.map(t => {
            const n = R.S.rooms.filter(r => r.type === t.id).length, stays = R.live().filter(r => r.type === t.id);
            let sold14 = 0, rev14 = 0;
            past.forEach(d => stays.filter(r => r.arrive <= d && d < R.dep(r)).forEach(r => { sold14++; rev14 += r.rates[daysBetween(r.arrive, d)] || 0; }));
            const tonight = stays.filter(r => r.arrive <= day && day < R.dep(r)).length;
            return `<tr><td><b>${esc(t.name)}</b></td><td class="right">${n}</td><td class="right">${Math.round(sold14 / (n * 14) * 100)}%</td><td class="right num">${R.money(sold14 ? rev14 / sold14 : 0)}</td><td class="right">${tonight} of ${n}</td><td class="right num">${R.money(t.base)}</td><td class="right">${stays.filter(r => r.status === 'booked').length}</td></tr>`;
          }).join('')}</tbody></table></div></div>
      </div>`;
  }

  function daily() {
    const opts = [bd(), ...R.S.dailyReports.map(d => d.date)].filter((v, i, a) => a.indexOf(v) === i);
    const day = rDay && opts.includes(rDay) ? rDay : bd();
    const f = R.dailyFigures(day), owed = R.S.reservations.filter(r => r.status === 'checkedout' && R.balance(r) > 0);
    const kv = rows => `<dl class="kv">${rows.map(([a, b]) => `<dt>${a}</dt><dd class="num">${b}</dd>`).join('')}</dl>`;
    return `<div class="row" style="margin-bottom:12px"><label class="field" style="flex-direction:row;align-items:center;gap:8px">Business date<select class="search" data-change="rDay">${opts.map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${R.fmt(d)}${d === bd() ? ' (open)' : ''}</option>`).join('')}</select></label>
        <span class="sp row" style="margin-left:auto">${R.can('reports') ? `<button class="btn ghost sm" data-act="sendReport" data-day="${day}">Send to ${esc(R.S.notify.to.split(' (')[0].split(',')[0])}</button>` : ''}<button class="btn ghost sm" data-act="printPage">${R.icon('print')}Print or save as PDF</button></span></div>
      ${R.S.notify.on ? `<p class="small muted" style="margin-bottom:10px">Sent automatically every night after the night audit to ${esc(R.S.notify.to)}. Change this in Settings → House rules.</p>` : ''}
      <div class="report">
        <div class="report-head"><div><h2>Daily manager report</h2><p class="muted">Camsair Resort · ${R.fmt(day)}${day === bd() ? ' · day still open, figures may change' : ''}</p></div></div>
        <div class="pulse">${tile(f.occPct + '%', `Occupancy · ${f.sold}/${N()}`)}${tile(R.money(f.adr), 'ADR')}${tile(R.money(f.revpar), 'RevPAR')}${tile(R.money(f.trevpar), 'TRevPAR')}${tile(R.money(f.total), 'Total revenue')}${tile(f.dayGuests, 'Day tour guests')}</div>
        <div class="grid g3">
          <div class="panel"><h3>Revenue</h3>${kv(DEPT_ORDER.filter(k => f.dept[k]).map(k => [k, R.money(f.dept[k])]).concat([['<b>Total</b>', '<b>' + R.money(f.total) + '</b>']]))}</div>
          <div class="panel"><h3>Payments received</h3>${kv(Object.entries(f.pay).map(([k, v]) => [esc(k), R.money(v)]).concat([['<b>Total</b>', '<b>' + R.money(Object.values(f.pay).reduce((a, b) => a + b, 0)) + '</b>']]))}</div>
          <div class="panel"><h3>Guests</h3>${kv([['Arrivals', f.arrivals], ['Departures', f.departures], ['In house tonight', f.inhouse + ' guests'], ['No-shows', f.noshows], ['Cancellations', f.cancels], ['Rooms out of order', f.ooo]])}</div>
          <div class="panel"><h3>Exceptions</h3>${kv([['Voided charges', f.voids], ['Refunds', R.money(f.refunds)], ['Senior / PWD discounts', R.money(f.scDisc)], ['Shifts closed', f.shifts], ['Cash over / short', f.variance ? R.peso(f.variance) : 'None']])}</div>
          <div class="panel" style="grid-column:span 2"><h3>Unpaid balances after check-out</h3>${owed.length ? `<div class="tbl"><table><tbody>${owed.map(r => `<tr class="click" data-act="openRes" data-id="${r.id}"><td>${esc(R.guest(r.guestId).name)}</td><td>${r.id}</td><td class="right num">${R.money(R.balance(r))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">None. Every guest who left has paid in full.</p>'}</div>
        </div></div>`;
  }

  function revenue() {
    const days = Array.from({ length: 14 }, (_, i) => addDays(bd(), i - 13)), F = days.map(R.dailyFigures);
    const max = Math.max(...F.map(f => f.total), 1);
    return `<div class="panel" style="margin-bottom:16px"><h2>Total revenue per day</h2>
        <div class="bars" role="img" aria-label="Total revenue per day, last 14 days">${F.map(f => `<div class="b ${f.date === bd() ? 'f' : ''}" style="height:${Math.max(f.total / max * 100, 2)}%" data-tip="${R.fmtShort(f.date)}: ${R.money(f.total)}"></div>`).join('')}</div>
        <div class="row small muted" style="justify-content:space-between;margin-top:4px"><span>${R.fmtShort(days[0])}</span><span>Today (open)</span></div></div>
      <div class="panel"><h2>By department</h2><div class="tbl"><table><thead><tr><th>Date</th>${DEPT_ORDER.map(k => `<th class="right">${k}</th>`).join('')}<th class="right">Total</th><th class="right">Occ.</th><th class="right">ADR</th></tr></thead><tbody>
        ${F.slice().reverse().map(f => `<tr><td>${R.fmt(f.date)}</td>${DEPT_ORDER.map(k => `<td class="right num">${f.dept[k] ? R.money(f.dept[k]) : '—'}</td>`).join('')}<td class="right num"><b>${R.money(f.total)}</b></td><td class="right">${f.occPct}%</td><td class="right num">${R.money(f.adr)}</td></tr>`).join('')}
        <tr class="sum"><td><b>14 days</b></td>${DEPT_ORDER.map(k => `<td class="right num"><b>${R.money(F.reduce((s, f) => s + (f.dept[k] || 0), 0))}</b></td>`).join('')}<td class="right num"><b>${R.money(F.reduce((s, f) => s + f.total, 0))}</b></td><td></td><td></td></tr>
      </tbody></table></div></div>`;
  }

  function daytour() {
    const S = R.S.sales.filter(s => s.kind === 'daytour' && s.date === bd());
    const pax = { adult: 0, child: 0, senior: 0, toddler: 0 }; S.forEach(s => Object.keys(pax).forEach(k => { pax[k] += s.pax[k]; }));
    const heads = S.reduce((a, x) => a + x.calc.heads, 0), rev = S.reduce((s, x) => s + x.calc.total, 0);
    const cot = {}; S.forEach(s => s.cottages.forEach(id => { cot[id] = (cot[id] || 0) + 1; }));
    const D = R.S.dayuse;
    const extras = {}; S.forEach(s => s.items.forEach(i => { const x = D.extras.find(e => e.id === i.id); extras[x.name] = (extras[x.name] || 0) + i.qty * x.price; }));
    return `<div class="pulse">${tile(heads, 'Day guests today')}${tile(R.money(rev), 'Day tour revenue')}${tile(R.money(heads ? rev / heads : 0), 'Revenue per guest')}
        ${tile(Object.keys(cot).length + ' of ' + D.cottages.length, 'Cottages rented today')}${tile(S.filter(s => s.session === 'day').length + ' / ' + S.filter(s => s.session === 'night').length, 'Day tour / night swim sales')}${tile(R.money(S.reduce((s, x) => s + x.calc.discount, 0)), 'Senior / PWD discounts')}</div>
      <div class="grid g2"><div class="panel"><h2>Guests by type</h2>${hbars([['Overnight guests', S.reduce((a, x) => a + (x.freeHeads || 0), 0)], ['Adults', pax.adult], ['Children 3–12', pax.child], ['Senior / PWD', pax.senior], ['Below 3', pax.toddler]], v => v)}</div>
        <div class="panel"><h2>Rentals and fees</h2>${Object.keys(extras).length ? hbars(Object.entries(extras).sort((a, b) => b[1] - a[1]), R.money) : '<p class="empty">None sold yet today</p>'}</div></div>
      <p class="small muted" style="margin-top:12px">This is the open business date. Earlier days are in the daily manager reports saved by each night audit.</p>`;
  }

  function ops() {
    const day = bd(), c = { dirty: 0, clean: 0, inspected: 0 };
    R.S.rooms.filter(r => !r.ooo).forEach(r => { c[r.hk]++; });
    const arr = R.S.reservations.filter(r => r.status === 'booked' && r.arrive === day);
    const open = R.S.tasks.filter(t => t.status !== 'done'), rep = open.filter(t => t.kind === 'repair');
    const age = rep.length ? rep.reduce((s, t) => s + daysBetween(t.created, day), 0) / rep.length : 0;
    const ooo = R.S.rooms.filter(r => r.ooo);
    const lostNights = ooo.reduce((s, r) => s + Math.max(0, daysBetween(r.ooo.since, r.ooo.until)), 0);
    const lost = ooo.reduce((s, r) => s + Math.max(0, daysBetween(r.ooo.since, r.ooo.until)) * R.type(r.type).base, 0);
    const teams = {}; open.forEach(t => { teams[t.dept] = (teams[t.dept] || 0) + 1; });
    return `<div class="pulse">${tile(c.dirty, 'Rooms dirty')}${tile(c.clean, 'Waiting for inspection')}${tile(c.inspected, 'Inspected and ready')}
        ${tile(arr.filter(r => r.room && R.room(r.room).hk !== 'dirty').length + ' of ' + arr.length, 'Arrivals with room ready')}${tile(age.toFixed(1) + ' days', 'Average age of open repairs')}${tile(R.money(lost), 'Room revenue lost to out of order', lostNights + ' room nights')}</div>
      <div class="grid g2"><div class="panel"><h2>Open tasks by team</h2>${Object.keys(teams).length ? hbars(Object.entries(teams), v => v) : '<p class="empty">No open tasks</p>'}</div>
        <div class="panel"><h2>Rooms out of order</h2>${ooo.map(r => `<div class="list-item"><b>${r.no}</b><div class="grow small">${esc(r.ooo.reason)}<div class="muted">${R.fmtShort(r.ooo.since)} → ${R.fmtShort(r.ooo.until)}</div></div></div>`).join('') || '<p class="empty">None</p>'}</div></div>`;
  }

  function compliance() {
    const day = bd(), from = addDays(day, -6);
    const S = R.S.sales.filter(s => s.or && s.date >= from);
    const P = []; R.S.reservations.forEach(r => r.payments.filter(p => p.or && p.date >= from).forEach(p => P.push({ p, r })));
    const VP = []; R.S.venueBookings.forEach(v => v.payments.filter(p => p.or && p.date >= from).forEach(p => VP.push(p)));
    const ors = S.map(s => s.or).concat(P.map(x => x.p.or), VP.map(p => p.or)).sort();
    const sum = k => S.reduce((s, x) => s + x.calc[k], 0);
    const folio = P.reduce((s, x) => s + x.p.amount, 0);
    const sc = R.S.sales.filter(s => s.date >= from && s.calc.scDisc);
    const withId = R.S.guests.filter(g => g.idNo).length;
    return `<div class="note" style="margin-bottom:16px">${R.icon('alert')}<div>Mockup figures. Before the system's point of sale (POS) issues official receipts, Camsair needs the BIR Permit to Use for the system. Check the format with the accountant.</div></div>
      <div class="grid g2"><div class="panel"><h2>Sales summary, last 7 days</h2><dl class="kv">
        <dt>Receipts issued</dt><dd>${ors.length}${ors.length ? ` · ${ors[0]} to ${ors[ors.length - 1]}` : ''}</dd>
        <dt>POS sales (gross)</dt><dd>${R.peso(sum('gross'))}</dd><dt>Senior / PWD discount</dt><dd>− ${R.peso(sum('scDisc'))}</dd><dt>VAT removed for seniors / PWDs</dt><dd>− ${R.peso(sum('vatRemoved'))}</dd>
        <dt>POS sales (net)</dt><dd>${R.peso(sum('total'))}</dd><dt>VATable sales</dt><dd>${R.peso(sum('vatable'))}</dd><dt>VAT (12%)</dt><dd>${R.peso(sum('vat'))}</dd><dt>VAT-exempt sales</dt><dd>${R.peso(sum('vatExempt'))}</dd>
        <dt>Room bill payments</dt><dd>${R.peso(folio)} (VAT ${R.peso(folio - folio / 1.12)})</dd>
        <dt>Cottage deposits</dt><dd>${R.peso(VP.reduce((a, p) => a + p.amount, 0))}</dd></dl></div>
        <div class="panel"><h2>Senior citizen and PWD sales</h2><div class="tbl"><table><thead><tr><th>Receipt</th><th>Date</th><th>ID</th><th class="right">Discount</th></tr></thead><tbody>
          ${sc.map(s => `<tr class="click" data-act="fdReceipt" data-id="${s.id}"><td>${s.or || 'Room bill'}</td><td class="small">${R.fmtShort(s.date)}</td><td>${esc(s.seniorId)}</td><td class="right num">${R.peso(s.calc.discount)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">None</td></tr>'}</tbody></table></div></div>
        <div class="panel"><h2>Guest data (Data Privacy Act)</h2><dl class="kv"><dt>Guests on file</dt><dd>${R.S.guests.length}</dd><dt>With ID details</dt><dd>${withId}</dd><dt>Consent recorded</dt><dd>At every check-in (registration card)</dd><dt>Who can see IDs</dt><dd>Front office and managers. IDs are masked on screen.</dd></dl></div>
        <div class="panel"><h2>Audit trail</h2><p class="small muted" style="margin-bottom:8px">Voids, refunds, rate changes and cancellations, with who approved them.</p>
          ${R.S.audit.filter(a => /void|Refund|Rate|Cancel|Out of order|Night audit|Shift closed/i.test(a.action)).slice(0, 8).map(a => `<div class="list-item"><span class="small muted nowrap">${R.fmtShort(a.date)} ${a.at}</span><div class="grow small"><b>${esc(a.action)}</b> ${esc(a.detail)}</div><span class="small">${esc(R.staff(a.user).name)}</span></div>`).join('') || '<p class="empty">Nothing yet. Void a charge or give a refund to see it here.</p>'}</div></div>`;
  }

  R.act.printPage = () => window.print();
  R.act.sendReport = d => { R.log('Daily report sent', `${R.fmt(d.day)} to ${R.S.notify.to}`); R.save(); R.toast(`Daily manager report sent to ${R.S.notify.to.split(',')[0]}`); };
  R.views.reports = {
    title: 'Reports',
    hint: 'How the resort is doing. Figures update live as bookings, charges and payments happen.',
    render() {
      const tabs = [['health', 'Business health'], ['daily', 'Daily manager report'], ['revenue', 'Revenue'], ['daytour', 'Day tour'], ['ops', 'Operations'], ['compliance', 'BIR & compliance']];
      return `<div class="tabs no-print">${tabs.map(([k, l]) => `<button class="${rTab === k ? 'on' : ''}" aria-pressed="${rTab === k}" data-act="rTab" data-tab="${k}">${l}</button>`).join('')}</div>
        ${{ health, daily, revenue, daytour, ops, compliance }[rTab]()}`;
    }
  };
})();
