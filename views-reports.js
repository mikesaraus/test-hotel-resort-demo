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

  // ---------- small pieces ----------
  const tile = (v, l, sub) => `<div><b>${v}</b><span>${l}</span>${sub ? `<small class="muted">${sub}</small>` : ''}</div>`;
  const hbars = (rows, fmt) => { const max = Math.max(...rows.map(r => r[1]), 1); return rows.map(([k, v, note]) => `<div class="hbar"><span>${esc(k)}</span><div class="track" title="${esc(k)}: ${fmt(v)}"><div class="fill" style="width:${Math.max(0, v) / max * 100}%"></div></div><b class="num right">${fmt(v)}</b>${note ? `<small class="muted hnote">${note}</small>` : ''}</div>`).join(''); };
  const C = () => R.chart, COL = () => R.DEPT_COLORS;
  const DARK_INK = { 'Food & beverage': '#2B1B18', Other: '#2B1B18' };
  const table = (head, rows) => `<div class="tbl chart-table"><table><thead><tr>${head.map((h, i) => `<th class="${i ? 'right' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? 'right num' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  let rTab = 'health', rDay = null, rPeriod = 14, rTables = false;
  R.act.rTab = d => { rTab = d.tab; R.render(); };
  R.act.rDay = (d, el) => { rDay = el.value; R.render(); };
  R.act.rPeriod = d => { rPeriod = +d.p; R.render(); };
  R.act.rTables = () => { rTables = !rTables; R.render(); };

  // n closed business days ending the day before `end` (today is still open, so it isn't counted)
  const range = (end, n) => Array.from({ length: n }, (_, i) => addDays(end, i - n));
  function periodStats(days) {
    const F = days.map(R.dailyFigures), n = days.length, sum = k => F.reduce((s, f) => s + f[k], 0);
    const sold = sum('sold'), rooms = sum('rooms'), total = sum('total');
    const dept = {}; F.forEach(f => Object.entries(f.dept).forEach(([k, v]) => { dept[k] = (dept[k] || 0) + v; }));
    const stays = R.live().filter(r => r.arrive >= days[0] && r.arrive <= days[n - 1]);
    const stayRev = stays.reduce((s, r) => s + R.stayValue(r), 0), direct = stays.filter(r => !R.sourceFee(r.channel)).reduce((s, r) => s + R.stayValue(r), 0);
    const all = R.S.reservations.filter(r => r.arrive >= days[0] && r.arrive <= days[n - 1]);
    return { days, F, n, sold, rooms, total, dept, stays, occ: sold / (N() * n) * 100, adr: sold ? rooms / sold : 0, revpar: rooms / (N() * n), trevpar: total / (N() * n),
      dayGuests: sum('dayGuests'), directPct: stayRev ? direct / stayRev * 100 : 0, comm: stays.reduce((s, r) => s + R.stayValue(r) * R.sourceFee(r.channel) / 100, 0),
      noshows: all.filter(r => r.status === 'noshow').length, cancels: all.filter(r => r.status === 'cancelled').length, bookings: all.length };
  }
  // change vs the previous period: arrow + words, never colour alone
  const change = (cur, prev, pts) => {
    const d = pts ? cur - prev : prev ? (cur - prev) / prev * 100 : 0;
    const dir = !pts && !prev ? 'flat' : Math.abs(d) < 2 ? 'flat' : d > 0 ? 'up' : 'down';
    const txt = dir === 'flat' ? (!pts && !prev ? 'New' : 'About the same') : `${Math.abs(d).toFixed(0)}${pts ? ' pts' : '%'} ${dir === 'up' ? 'up' : 'down'}`;
    return { dir, d, html: `<span class="delta ${dir}"><span aria-hidden="true">${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●'}</span> ${txt}</span>` };
  };
  const STATUS = { good: ['Good', '✓'], watch: ['Watch', '!'], info: ['Note', 'i'] };

  function health() {
    const day = bd(), P = rPeriod, cur = periodStats(range(day, P)), prev = periodStats(range(addDays(day, -P), P));
    const rev = change(cur.total, prev.total), occ = change(cur.occ, prev.occ, true);
    const verdict = rev.dir === 'up' ? ['up', 'Business is growing'] : rev.dir === 'down' ? ['down', 'Business is slower'] : ['flat', 'Business is steady'];
    const fwd = Array.from({ length: 30 }, (_, i) => addDays(day, i)), fwdOcc = fwd.reduce((s, d) => s + R.occupancyOn(d).sold, 0) / (N() * 30) * 100;
    const weekAgo = addDays(day, -7), all = R.S.reservations;
    const otbThen = d => all.filter(r => r.created <= weekAgo && r.arrive <= d && d < R.dep(r) && (r.status !== 'cancelled' || (r.cancel && r.cancel.date > weekAgo))).length;
    const pace = fwd.map(d => ({ d, now: R.occupancyOn(d).sold, then: otbThen(d) })), pickup = pace.reduce((s, p) => s + p.now - p.then, 0);

    // headline numbers
    const kpi = (label, value, ch, series, color, explain) => `<div class="kpi"><div class="kpi-top"><span>${label}</span>${ch.html}</div><b class="kpi-val num">${value}</b>${series ? C().spark(series, color) : ''}<small>${explain}</small></div>`;
    const kpis = [
      kpi('Total revenue', R.money(cur.total), rev, cur.F.map(f => f.total), '#7A1F24', `Everything earned: rooms, day tours, food and more`),
      kpi('Rooms filled', Math.round(cur.occ) + '%', occ, cur.F.map(f => f.occPct), '#7A1F24', `Share of rooms sold each night (occupancy)`),
      kpi('Average room rate', R.money(cur.adr), change(cur.adr, prev.adr), cur.F.map(f => f.adr), '#7A1F24', `Average price per room night sold (ADR)`),
      kpi('Room revenue per room', R.money(cur.revpar), change(cur.revpar, prev.revpar), cur.F.map(f => f.revpar), '#7A1F24', `Rooms filled × price, in one number (RevPAR)`),
      kpi('Day tour guests', cur.dayGuests.toLocaleString('en-PH'), change(cur.dayGuests, prev.dayGuests), cur.F.map(f => f.dayGuests), '#24707C', `People through the gate for day tour and night swim`),
      kpi('Booked direct', Math.round(cur.directPct) + '%', change(cur.directPct, prev.directPct, true), null, null, `Room revenue with no booking-site commission`)
    ].join('');

    // plain-language findings
    const ins = [];
    const add = (s, t) => ins.push([s, t]);
    add(occ.dir === 'down' ? 'watch' : 'good', `Rooms were <b>${Math.round(cur.occ)}% full</b> on average${prev.occ ? `, ${occ.dir === 'flat' ? 'about the same as' : occ.dir === 'up' ? 'up from' : 'down from'} ${Math.round(prev.occ)}% the ${P} days before` : ''}.`);
    const wkDays = cur.F.filter(f => [0, 6].includes(new Date(f.date + 'T12:00:00').getDay())), wdDays = cur.F.filter(f => !wkDays.includes(f));
    const avg = L => L.length ? L.reduce((s, f) => s + f.total, 0) / L.length : 0;
    if (wkDays.length && wdDays.length && avg(wdDays)) add('info', `A weekend day earns <b>${(avg(wkDays) / avg(wdDays)).toFixed(1)}× a weekday</b> (${R.money(avg(wkDays))} vs ${R.money(avg(wdDays))}). Weekday promos could fill the gap.`);
    const top = Object.entries(cur.dept).sort((a, b) => b[1] - a[1]);
    if (top.length > 1) add('info', `<b>${esc(top[0][0])}</b> brings ${Math.round(top[0][1] / cur.total * 100)}% of revenue, then ${esc(top[1][0].toLowerCase())} with ${Math.round(top[1][1] / cur.total * 100)}%.`);
    add(cur.directPct >= 70 ? 'good' : 'watch', `<b>${Math.round(cur.directPct)}%</b> of room revenue was booked direct. Booking sites cost <b>${R.money(cur.comm)}</b> in commission.${cur.directPct < 70 ? ' Moving guests to Messenger bookings saves about 15% each.' : ''}`);
    add(fwdOcc >= 50 ? 'good' : 'watch', `Next 30 nights are <b>${Math.round(fwdOcc)}% booked</b>, with <b>${pickup >= 0 ? '+' : ''}${pickup} room nights</b> added in the last 7 days.`);
    const owed = R.S.reservations.filter(r => r.status === 'checkedout' && R.balance(r) > 0);
    add(owed.length ? 'watch' : 'good', owed.length ? `<b>${R.money(owed.reduce((s, r) => s + R.balance(r), 0))}</b> still unpaid from ${owed.length} guest${owed.length > 1 ? 's' : ''} who already left.` : 'Every guest who left has paid in full.');
    if (cur.noshows + cur.cancels) add(cur.bookings && (cur.noshows + cur.cancels) / cur.bookings > 0.1 ? 'watch' : 'info', `${cur.cancels} cancellation${cur.cancels === 1 ? '' : 's'} and ${cur.noshows} no-show${cur.noshows === 1 ? '' : 's'} out of ${cur.bookings} bookings due in this period. Deposits were kept.`);
    const ooo = R.S.rooms.filter(r => r.ooo);
    if (ooo.length) add('watch', `${ooo.length} room${ooo.length > 1 ? 's are' : ' is'} out of order (${ooo.map(r => r.no).join(', ')}). Each night costs about ${R.money(ooo.reduce((s, r) => s + R.type(r.type).base, 0))} in lost sales.`);

    // charts
    const revDays = cur.days.concat([day]), revF = {}; revDays.forEach(d => { revF[d] = R.dailyFigures(d); });
    const series = DEPT_ORDER.map(k => ({ key: k, name: k, color: COL()[k] }));
    const revChart = C().columns({ days: revDays, series, value: (d, k) => revF[d].dept[k] || 0, shadeWeekends: true, dim: d => d === day, extraLegend: '<span><i class="lg-wk"></i>Weekend</span>' });
    const occPts = cur.days.map(d => ({ x: d, y: R.occupancyOn(d).pct, future: false })).concat(fwd.map(d => ({ x: d, y: R.occupancyOn(d).pct, future: true, today: d === day })));
    const occChart = C().line({ points: occPts, yMax: 100, color: '#7A1F24', name: `Actual, last ${P} nights`, avg: cur.occ });
    const mix = DEPT_ORDER.map(k => ({ name: k, value: cur.dept[k] || 0, color: COL()[k], ink: DARK_INK[k] }));
    const src = {}; cur.stays.forEach(r => { const s = src[r.channel] = src[r.channel] || { n: 0, v: 0 }; s.n++; s.v += R.stayValue(r); });
    const srcRows = Object.entries(src).sort((a, b) => b[1].v - a[1].v).map(([k, v]) => { const c = v.v * R.sourceFee(k) / 100; return { name: k, sub: `${v.n} booking${v.n > 1 ? 's' : ''}${c ? ' · ' + R.sourceFee(k) + '% fee' : ' · no fee'}`, parts: [{ v: v.v - c, color: '#2F5D7C', label: 'Kept' }, { v: c, color: '#D6CFC4', label: 'Commission', cls: 'hatch' }], net: v.v - c }; });
    const yMaxPace = C().nice(Math.max(...pace.map(p => Math.max(p.now, p.then)), 1));

    const periodBtns = `<div class="seg" role="group" aria-label="Period">${[7, 14, 30].map(p => `<button class="${P === p ? 'on' : ''}" aria-pressed="${P === p}" data-act="rPeriod" data-p="${p}"><b>${p} days</b></button>`).join('')}</div>`;
    const T = rTables;
    return `<div class="rep-bar">${periodBtns}<span class="small muted">${R.fmtShort(cur.days[0])} to ${R.fmtShort(cur.days[P - 1])}, compared with the ${P} days before. Today isn't counted until the night audit closes it.</span>
        <button class="btn sm ghost" style="margin-left:auto" data-act="rTables" aria-pressed="${T}">${T ? 'Hide tables' : 'Show tables'}</button></div>
      <div class="verdict ${verdict[0]}"><span class="v-ico" aria-hidden="true">${verdict[0] === 'up' ? '▲' : verdict[0] === 'down' ? '▼' : '●'}</span><div><h2>${verdict[1]}</h2>
        <p><b>${R.money(cur.total)}</b> earned in the last ${P} days, ${rev.dir === 'flat' ? 'about the same as' : `${Math.abs(rev.d).toFixed(0)}% ${rev.dir === 'up' ? 'more than' : 'less than'}`} the ${P} days before (${R.money(prev.total)}). Rooms were ${Math.round(cur.occ)}% full and ${cur.dayGuests.toLocaleString('en-PH')} day tour guests came through the gate.</p></div></div>
      <div class="kpis">${kpis}</div>
      <div class="grid g-side" style="margin-bottom:16px">
        <div class="panel"><div class="ph"><h2>Money in, per day</h2><span class="small muted">by department</span></div>${revChart}
          ${T ? table(['Date', ...DEPT_ORDER, 'Total'], revDays.map(d => [R.fmt(d) + (d === day ? ' (so far)' : ''), ...DEPT_ORDER.map(k => R.money(revF[d].dept[k] || 0)), '<b>' + R.money(revF[d].total) + '</b>'])) : ''}</div>
        <div class="panel"><h2>What this means</h2><ul class="insights">${ins.map(([s, t]) => `<li class="${s}"><span class="ins-ico" aria-hidden="true">${STATUS[s][1]}</span><div><span class="sr">${STATUS[s][0]}: </span>${t}</div></li>`).join('')}</ul></div></div>
      <div class="panel" style="margin-bottom:16px"><div class="ph"><h2>How full the rooms are</h2><span class="small muted">each night, last ${P} nights and the next 30</span></div>${occChart}
        ${T ? table(['Night', 'Rooms sold', 'Occupancy', ''], occPts.map(p => [R.fmt(p.x), R.occupancyOn(p.x).sold + ' of ' + N(), p.y + '%', p.future ? 'on the books' : 'actual'])) : ''}</div>
      <div class="grid g2" style="margin-bottom:16px">
        <div class="panel"><div class="ph"><h2>Where the money comes from</h2><span class="small muted">last ${P} days</span></div>${C().share(mix, R.money)}</div>
        <div class="panel"><div class="ph"><h2>Booking sources</h2><span class="small muted">stays arriving in the last ${P} days</span></div>
          ${C().hbars(srcRows, { fmt: R.money, valueFn: r => r.net, legend: [{ name: 'Kept by Camsair', color: '#2F5D7C' }, { name: 'Commission to booking site', color: '#D6CFC4' }] })}
          ${T ? table(['Source', 'Bookings', 'Room revenue', 'Commission', 'Kept'], srcRows.map(r => [esc(r.name), src[r.name].n, R.money(src[r.name].v), R.money(src[r.name].v - r.net), '<b>' + R.money(r.net) + '</b>'])) : ''}</div></div>
      <div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Bookings coming in</h2><span class="small muted">next 30 nights · ${pickup >= 0 ? '+' : ''}${pickup} room nights booked in the last 7 days</span></div>
        ${C().pace({ rows: pace, yMax: yMaxPace, color: '#2F5D7C' })}
        ${T ? table(['Night', 'Booked now', 'A week ago', 'Picked up'], pace.map(p => [R.fmt(p.d), p.now, p.then, (p.now - p.then >= 0 ? '+' : '') + (p.now - p.then)])) : ''}</div>
      <div class="panel"><h2>Room types</h2><div class="tbl"><table><thead><tr><th>Type</th><th class="right">Rooms</th><th class="right">Occupancy, ${P} nights</th><th class="right">Average rate</th><th class="right">Tonight</th><th class="right">Bookings ahead</th></tr></thead><tbody>
        ${R.S.roomTypes.map(t => {
          const n = R.S.rooms.filter(r => r.type === t.id).length, stays = R.live().filter(r => r.type === t.id);
          let s = 0, v = 0; cur.days.forEach(d => stays.filter(r => r.arrive <= d && d < R.dep(r)).forEach(r => { s++; v += r.rates[daysBetween(r.arrive, d)] || 0; }));
          const o = n ? Math.round(s / (n * P) * 100) : 0;
          return `<tr><td><b>${esc(t.name)}</b></td><td class="right">${n}</td><td class="right"><span class="mini-bar"><i style="width:${o}%"></i></span> ${o}%</td><td class="right num">${R.money(s ? v / s : 0)}</td><td class="right">${stays.filter(r => r.arrive <= day && day < R.dep(r)).length} of ${n}</td><td class="right">${stays.filter(r => r.status === 'booked').length}</td></tr>`;
        }).join('')}</tbody></table></div></div>`;
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

  const periodBar = note => `<div class="rep-bar"><div class="seg" role="group" aria-label="Period">${[7, 14, 30].map(p => `<button class="${rPeriod === p ? 'on' : ''}" aria-pressed="${rPeriod === p}" data-act="rPeriod" data-p="${p}"><b>${p} days</b></button>`).join('')}</div><span class="small muted">${note}</span></div>`;

  function revenue() {
    const P = rPeriod, days = range(bd(), P).concat([bd()]), F = days.map(R.dailyFigures), byDay = {}; F.forEach(f => { byDay[f.date] = f; });
    const closed = F.slice(0, P), tot = closed.reduce((s, f) => s + f.total, 0);
    const series = DEPT_ORDER.map(k => ({ key: k, name: k, color: COL()[k] }));
    return periodBar(`Last ${P} closed days plus today so far.`) + `
      <div class="pulse">${tile(R.money(tot), `Revenue, ${P} days`)}${tile(R.money(tot / P), 'Average per day')}${tile(R.money(Math.max(...closed.map(f => f.total))), 'Best day', R.fmt(closed.reduce((a, f) => f.total > a.total ? f : a, closed[0]).date))}
        ${tile(R.money(closed.reduce((s, f) => s + (f.dept.Rooms || 0), 0)), 'Rooms')}${tile(R.money(closed.reduce((s, f) => s + (f.dept['Day tour & cottages'] || 0), 0)), 'Day tour & cottages')}${tile(R.money(closed.reduce((s, f) => s + (f.dept['Food & beverage'] || 0), 0)), 'Food & beverage')}</div>
      <div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Revenue per day</h2><span class="small muted">by department · today is still open</span></div>
        ${C().columns({ days, series, value: (d, k) => byDay[d].dept[k] || 0, shadeWeekends: true, dim: d => d === bd(), height: 280, extraLegend: '<span><i class="lg-wk"></i>Weekend</span>' })}</div>
      <div class="panel"><h2>By department</h2><div class="tbl"><table><thead><tr><th>Date</th>${DEPT_ORDER.map(k => `<th class="right"><i class="dot-sw" style="background:${COL()[k]}"></i>${k}</th>`).join('')}<th class="right">Total</th><th class="right">Occ.</th><th class="right">ADR</th></tr></thead><tbody>
        ${F.slice().reverse().map(f => `<tr><td>${R.fmt(f.date)}${f.date === bd() ? ' <span class="chip">open</span>' : ''}</td>${DEPT_ORDER.map(k => `<td class="right num">${f.dept[k] ? R.money(f.dept[k]) : '—'}</td>`).join('')}<td class="right num"><b>${R.money(f.total)}</b></td><td class="right">${f.occPct}%</td><td class="right num">${R.money(f.adr)}</td></tr>`).join('')}
        <tr class="sum"><td><b>${P} days</b></td>${DEPT_ORDER.map(k => `<td class="right num"><b>${R.money(closed.reduce((s, f) => s + (f.dept[k] || 0), 0))}</b></td>`).join('')}<td class="right num"><b>${R.money(tot)}</b></td><td></td><td></td></tr>
      </tbody></table></div></div>`;
  }

  function daytour() {
    const P = rPeriod, days = range(bd(), P).concat([bd()]);
    const S = R.S.sales.filter(s => s.kind === 'daytour' && s.date >= days[0]);
    const per = {}; days.forEach(d => { per[d] = { day: 0, night: 0, rev: 0 }; });
    S.forEach(s => { const p = per[s.date]; if (p) { p[s.session] += s.calc.heads; p.rev += s.calc.total; } });
    const heads = S.reduce((a, s) => a + s.calc.heads, 0), rev = S.reduce((a, s) => a + s.calc.total, 0);
    const pax = { adult: 0, child: 0, senior: 0, toddler: 0 }; S.forEach(s => Object.keys(pax).forEach(k => { pax[k] += s.pax[k]; }));
    const overnight = S.reduce((a, s) => a + (s.freeHeads || 0), 0);
    const cot = {}; S.forEach(s => s.cottages.forEach(id => { cot[id] = (cot[id] || 0) + 1; }));
    const D = R.S.dayuse, extras = {};
    S.forEach(s => s.items.forEach(i => { const x = D.extras.find(e => e.id === i.id); if (x) extras[x.name] = (extras[x.name] || 0) + i.qty * x.price; }));
    const cRows = D.cottages.map(c => ({ name: c.name, sub: `${cot[c.id] || 0} rental${cot[c.id] === 1 ? '' : 's'} · holds ${c.cap}`, parts: [{ v: (cot[c.id] || 0) * c.price, color: '#24707C', label: 'Cottage sales' }] })).sort((a, b) => b.parts[0].v - a.parts[0].v);
    return periodBar(`Last ${P} days plus today so far.`) + `
      <div class="pulse">${tile(heads.toLocaleString('en-PH'), 'Day guests')}${tile(R.money(rev), 'Day tour revenue')}${tile(R.money(heads ? rev / heads : 0), 'Revenue per guest')}
        ${tile(Math.round(heads / (P + 1)), 'Guests per day, average')}${tile(overnight, 'Overnight guests in the day area')}${tile(R.money(S.reduce((a, s) => a + s.calc.discount, 0)), 'Senior / PWD discounts')}</div>
      <div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Guests per day</h2><span class="small muted">day tour and night swim</span></div>
        ${C().columns({ days, series: [{ key: 'day', name: 'Day tour', color: '#24707C' }, { key: 'night', name: 'Night swim', color: '#D3922F' }], value: (d, k) => per[d][k], yFmt: v => Math.round(v), vFmt: v => v + ' guests', shadeWeekends: true, dim: d => d === bd(), extraLegend: '<span><i class="lg-wk"></i>Weekend</span>' })}</div>
      <div class="grid g2"><div class="panel"><h2>Guests by type</h2>${hbars([['Overnight guests', overnight], ['Adults', pax.adult], ['Children 3–12', pax.child], ['Senior / PWD', pax.senior], ['Below 3', pax.toddler]], v => v)}</div>
        <div class="panel"><h2>Cottage sales</h2>${C().hbars(cRows, { fmt: R.money })}</div>
        <div class="panel" style="grid-column:1/-1"><h2>Rentals and fees</h2>${Object.keys(extras).length ? hbars(Object.entries(extras).sort((a, b) => b[1] - a[1]), R.money) : '<p class="empty">None sold in this period</p>'}</div></div>`;
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
      const tabs = [['health', 'Business health'], ['daily', 'Daily manager report'], ['revenue', 'Revenue'], ['daytour', 'Day tour'], ['ops', 'Operations']].concat(R.S.modules.bir ? [['compliance', 'BIR & compliance']] : []);
      if (!tabs.some(t => t[0] === rTab)) rTab = 'health';
      return `<div class="tabs no-print">${tabs.map(([k, l]) => `<button class="${rTab === k ? 'on' : ''}" aria-pressed="${rTab === k}" data-act="rTab" data-tab="${k}">${l}</button>`).join('')}</div>
        ${{ health, daily, revenue, daytour, ops, compliance }[rTab]()}`;
    }
  };
})();
