/* Reports: business health, daily manager report, revenue, day tour, operations. */
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

  R.act.printPage = () => window.print();
  R.act.sendReport = d => { R.log('Daily report sent', `${R.fmt(d.day)} to ${R.S.notify.to}`); R.save(); R.toast(`Daily manager report sent to ${R.S.notify.to.split(',')[0]}`); };
  // ---------- Guests & trends: who comes, from where, when, and how they book ----------
  // Filters in one row; everything below follows them. Places with fewer than 3 bookings are grouped, so no one guest stands out.
  const AN = { p: '30', from: '', to: '', by: 'arrive', src: '', loc: '', type: '', who: '', geo: 'town', heat: 'daytour' };
  const PROVINCE = { 'Cagayan de Oro': 'Misamis Oriental', Initao: 'Misamis Oriental', Naawan: 'Misamis Oriental', Manticao: 'Misamis Oriental', 'Iligan City': 'Lanao del Norte',
    Ozamiz: 'Misamis Occidental', Bukidnon: 'Bukidnon', Davao: 'Davao', Cebu: 'Cebu', Manila: 'Metro Manila', 'Abroad (balikbayan)': 'Abroad' };
  const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], WEEK_L = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const wd = d => (new Date(d + 'T12:00:00').getDay() + 6) % 7; // Monday = 0
  const placeOf = r => R.guest(r.guestId).town || 'Not given';
  const areaOf = (r, geo) => geo === 'province' ? (PROVINCE[placeOf(r)] || 'Other or not given') : placeOf(r);
  R.act.anSet = (d, el) => { const k = d.k, v = el && el.tagName === 'SELECT' ? el.value : d.v; AN[k] = v; if (k === 'p' && v !== 'custom') { AN.from = ''; AN.to = ''; } R.render(); };
  R.act.anDates = () => { const f = document.getElementById('anFrom'), t = document.getElementById('anTo'); if (!f || !t) return; AN.from = f.value; AN.to = t.value < f.value ? f.value : t.value; R.render(); };
  R.act.anClear = () => { Object.assign(AN, { src: '', loc: '', type: '', who: '' }); R.render(); };
  const isRepeat = r => (R.guest(r.guestId).stays || 0) > 1 || R.S.reservations.some(x => x.guestId === r.guestId && x.id !== r.id && x.status === 'checkedout' && x.arrive < r.arrive);
  function anRange() {
    const t = bd();
    if (AN.p === 'custom') return [AN.from || addDays(t, -29), AN.to || t];
    if (AN.p === 'month') return [t.slice(0, 8) + '01', t];
    const n = +AN.p || 30; return [addDays(t, 1 - n), t];
  }
  // the bookings that count, for a date range, with every filter applied
  function anBookings(from, to, keepLost) {
    return R.S.reservations.filter(r => {
      const key = AN.by === 'created' ? r.created || r.arrive : r.arrive;
      if (key < from || key > to) return false;
      if (!keepLost && (r.status === 'cancelled' || r.status === 'noshow')) return false;
      if (AN.src && r.channel !== AN.src) return false;
      if (AN.type && r.type !== AN.type) return false;
      if (AN.loc && areaOf(r, AN.geo) !== AN.loc) return false;
      if (AN.who && (AN.who === 'repeat') !== isRepeat(r)) return false;
      return true;
    });
  }
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const figures = (from, to) => {
    const all = anBookings(from, to, true), L = all.filter(r => r.status !== 'cancelled' && r.status !== 'noshow');
    return { all, L, n: L.length, guests: L.reduce((s, r) => s + r.adults + r.children, 0), rev: L.reduce((s, r) => s + R.stayValue(r), 0),
      stay: L.length ? L.reduce((s, r) => s + r.nights, 0) / L.length : 0, lead: median(L.filter(r => r.created).map(r => Math.max(0, daysBetween(r.created, r.arrive)))),
      repeat: L.length ? L.filter(isRepeat).length / L.length * 100 : 0, lost: all.length ? (all.length - L.length) / all.length * 100 : 0 };
  };
  function trends() {
    const [from, to] = anRange(), len = daysBetween(from, to) + 1, pFrom = addDays(from, -len), pTo = addDays(from, -1);
    const cur = figures(from, to), prev = figures(pFrom, pTo), L = cur.L, T = rTables;
    const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
    // filter options from the data on record
    const srcs = [...new Set(R.S.reservations.map(r => r.channel))].sort();
    const places = [...new Set(R.S.reservations.map(r => areaOf(r, AN.geo)))].sort();
    const sel = (k, label, opts, all) => `<label class="an-f"><span>${label}</span><select data-change="anSet" data-k="${k}" aria-label="${label}"><option value="">${all}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${AN[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const seg = (k, opts, label) => `<div class="seg" role="group" aria-label="${label}">${opts.map(([v, l]) => `<button class="${AN[k] === v ? 'on' : ''}" aria-pressed="${AN[k] === v}" data-act="anSet" data-k="${k}" data-v="${v}"><b>${l}</b></button>`).join('')}</div>`;
    const filtered = AN.src || AN.loc || AN.type || AN.who;
    const bar = `<div class="an-bar">
        ${seg('p', [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['month', 'This month'], ['custom', 'Pick dates']], 'Period')}
        ${AN.p === 'custom' ? `<div class="an-range" data-dp-range="days"><input type="date" id="anFrom" data-change="anDates" data-dp-label="From" value="${AN.from || from}" max="${bd()}"><input type="date" id="anTo" data-change="anDates" data-dp-label="To" value="${AN.to || to}" max="${addDays(bd(), 365)}"></div>` : ''}
        ${sel('by', 'Count by', [['arrive', 'Arrival date'], ['created', 'Date booked']], 'Arrival date').replace('<option value="">Arrival date</option>', '')}
        ${sel('src', 'Source', srcs.map(s => [s, s]), 'All sources')}
        ${sel('loc', AN.geo === 'province' ? 'Province' : 'Town', places.map(p => [p, p]), 'Everywhere')}
        ${sel('type', 'Room type', R.S.roomTypes.map(t => [t.id, t.name]), 'All rooms')}
        ${sel('who', 'Guests', [['new', 'First stay'], ['repeat', 'Repeat guests']], 'New and repeat')}
        ${filtered ? '<button class="btn sm ghost" data-act="anClear">Clear filters</button>' : ''}
        <button class="btn sm ghost an-tables" data-act="rTables" aria-pressed="${T}">${T ? 'Hide tables' : 'Show tables'}</button></div>
      <p class="small muted an-note">${R.fmt(from)} to ${R.fmt(to)} (${len} day${len === 1 ? '' : 's'}), bookings counted by ${AN.by === 'created' ? 'the date they were made' : 'arrival date'}, compared with the ${len} days before. Cancelled and no-show bookings only count in “Lost bookings”.</p>`;
    if (!L.length) return bar + `<div class="panel g-empty"><b>No bookings match these filters</b><p class="muted">Try a longer period, or clear a filter.</p><div class="row">${filtered ? '<button class="btn ghost" data-act="anClear">Clear filters</button>' : ''}<button class="btn ghost" data-act="anSet" data-k="p" data-v="90">Last 90 days</button></div></div>`;
    const kpi = (label, value, ch, explain) => `<div class="kpi"><div class="kpi-top"><span>${label}</span>${ch.html}</div><b class="kpi-val num">${value}</b><small>${explain}</small></div>`;
    // for lost bookings, up is bad news: same arrow and words, opposite colour
    const worse = c => ({ ...c, html: c.html.replace('delta up', 'delta up is-bad').replace('delta down', 'delta down is-good') });
    const kpis = [
      kpi('Bookings', cur.n, change(cur.n, prev.n), `${cur.guests} guests`),
      kpi('Room revenue', R.money(cur.rev), change(cur.rev, prev.rev), `${R.money(cur.rev / cur.n)} a booking`),
      kpi('Average stay', cur.stay.toFixed(1) + ' nights', change(cur.stay, prev.stay), 'Nights per booking'),
      kpi('Booked ahead', Math.round(cur.lead) + ' days', change(cur.lead, prev.lead), 'Typical days between booking and arrival'),
      kpi('Repeat guests', Math.round(cur.repeat) + '%', change(cur.repeat, prev.repeat, true), 'Had stayed with us before'),
      kpi('Lost bookings', Math.round(cur.lost) + '%', worse(change(cur.lost, prev.lost, true)), 'Cancelled or no-show')].join('');

    // where from (small places grouped)
    const byArea = {}; L.forEach(r => { const k = areaOf(r, AN.geo), o = byArea[k] = byArea[k] || { n: 0, g: 0, v: 0 }; o.n++; o.g += r.adults + r.children; o.v += R.stayValue(r); });
    let areas = Object.entries(byArea).sort((a, b) => b[1].n - a[1].n);
    const small = areas.filter(([, o]) => o.n < 3);
    if (small.length > 1) { const o = small.reduce((s, [, x]) => ({ n: s.n + x.n, g: s.g + x.g, v: s.v + x.v }), { n: 0, g: 0, v: 0 }); areas = areas.filter(([, x]) => x.n >= 3).concat([[`Other places (${small.length})`, o]]); }
    const where = C().hbars(areas.map(([k, o]) => ({ name: k, sub: `${pct(o.n, cur.n)}% · ${o.g} guests · ${R.money(o.v)}`, parts: [{ v: o.n, color: '#7A1F24', label: 'Bookings' }] })), { fmt: v => `${v} booking${v === 1 ? '' : 's'}` });
    // how they book
    const bySrc = {}; cur.all.forEach(r => { const o = bySrc[r.channel] = bySrc[r.channel] || { n: 0, lost: 0, v: 0 }; if (r.status === 'cancelled' || r.status === 'noshow') o.lost++; else { o.n++; o.v += R.stayValue(r); } });
    const srcRows = Object.entries(bySrc).sort((a, b) => b[1].n - a[1].n);
    const how = C().hbars(srcRows.map(([k, o]) => ({ name: k, sub: `${pct(o.n, cur.n)}% · ${R.money(o.v)} · ${pct(o.lost, o.n + o.lost)}% lost`, parts: [{ v: o.n, color: '#7A1F24', label: 'Bookings' }] })), { fmt: v => `${v} booking${v === 1 ? '' : 's'}` });
    // peak hours (Day pass visitors, or restaurant orders) - these follow the period only
    const sales = R.S.sales.filter(x => x.date >= from && x.date <= to && x.at && (AN.heat === 'daytour' ? x.kind === 'daytour' : x.kind === 'fnb'));
    const hours = Array.from({ length: 15 }, (_, i) => 7 + i), grid = WEEK.map(() => hours.map(() => 0));
    sales.forEach(x => { const h = +x.at.slice(0, 2), c = hours.indexOf(h); if (c >= 0) grid[wd(x.date)][c] += AN.heat === 'daytour' ? (x.calc.heads || 0) : 1; });
    const unit = AN.heat === 'daytour' ? 'visitors' : 'orders';
    const hTot = hours.map((_, c) => grid.reduce((s, row) => s + row[c], 0)), dTot = grid.map(row => row.reduce((a, b) => a + b, 0));
    const peakH = hTot.indexOf(Math.max(...hTot)), peakD = dTot.indexOf(Math.max(...dTot));
    const h12 = h => `${(h + 11) % 12 + 1} ${h < 12 ? 'am' : 'pm'}`;
    const heat = C().heat({ rows: WEEK, cols: hours.map(h => (h + 11) % 12 + 1 + (h < 12 ? 'a' : 'p')), val: (r, c) => grid[r][c],
      tip: (r, c, v) => `${WEEK_L[r]}, ${h12(hours[c])} to ${h12(hours[c] + 1)}|${v ? `${v} ${unit}` : `No ${unit}`}`, unit });
    // busiest days of the week (arrivals) and months
    const arrW = WEEK.map((_, i) => L.filter(r => wd(r.arrive) === i).length), peakW = arrW.indexOf(Math.max(...arrW));
    const days = C().bars({ labels: WEEK, values: arrW, peak: peakW, tip: i => `${WEEK_L[i]}|${arrW[i]} arrival${arrW[i] === 1 ? '' : 's'}|${pct(arrW[i], cur.n)}% of bookings` });
    const months = {}; R.S.reservations.forEach(r => { if (r.status === 'cancelled' || r.status === 'noshow') return; const k = (AN.by === 'created' ? r.created || r.arrive : r.arrive).slice(0, 7);
      if (AN.src && r.channel !== AN.src || AN.type && r.type !== AN.type || AN.loc && areaOf(r, AN.geo) !== AN.loc || AN.who && (AN.who === 'repeat') !== isRepeat(r)) return;
      const o = months[k] = months[k] || { n: 0, v: 0 }; o.n++; o.v += R.stayValue(r); });
    const mk = Object.keys(months).sort(), mName = k => new Date(k + '-15T12:00').toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
    const monthChart = C().bars({ labels: mk.map(mName), values: mk.map(k => months[k].v), yFmt: C().shortMoney, peak: mk.indexOf(mk.reduce((a, b) => months[b].v > months[a].v ? b : a, mk[0])),
      tip: i => `${new Date(mk[i] + '-15T12:00').toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}|${R.money(months[mk[i]].v)} room revenue|${months[mk[i]].n} bookings${mk[i] === bd().slice(0, 7) ? '|Month not over yet' : ''}${mk[i] > bd().slice(0, 7) ? '|Booked so far' : ''}` });
    // stay patterns
    const bucket = (vals, edges) => edges.map(([l, lo, hi]) => [l, vals.filter(v => v >= lo && v <= hi).length]);
    const patt = (rows, noun) => C().hbars(rows.map(([l, n]) => ({ name: l, sub: `${pct(n, cur.n)}%`, parts: [{ v: n, color: '#7A1F24', label: noun }] })), { fmt: v => `${v} booking${v === 1 ? '' : 's'}` });
    const nightsR = bucket(L.map(r => r.nights), [['1 night', 1, 1], ['2 nights', 2, 2], ['3 nights', 3, 3], ['4 to 6 nights', 4, 6], ['7 or more', 7, 999]]);
    const leadR = bucket(L.filter(r => r.created).map(r => daysBetween(r.created, r.arrive)), [['Same day', -99, 0], ['1 to 7 days', 1, 7], ['8 to 30 days', 8, 30], ['31 to 90 days', 31, 90], ['More than 90', 91, 9999]]);
    const sizeR = bucket(L.map(r => r.adults + r.children), [['1 guest', 1, 1], ['2 guests', 2, 2], ['3 to 4', 3, 4], ['5 to 8', 5, 8], ['9 or more', 9, 999]]);
    const typeR = R.S.roomTypes.map(t => [t.name, L.filter(r => r.type === t.id).length]).sort((a, b) => b[1] - a[1]);
    const kids = L.filter(r => r.children > 0).length;
    // what stands out
    const topA = areas[0], topS = srcRows[0];
    const notes = [
      topA && `<b>${esc(topA[0])}</b> sends the most guests: ${pct(topA[1].n, cur.n)}% of bookings${areas[1] ? `, then ${esc(areas[1][0])} (${pct(areas[1][1].n, cur.n)}%)` : ''}.`,
      topS && `Most bookings come through <b>${esc(topS[0])}</b> (${pct(topS[1].n, cur.n)}%).${(() => { const worst = srcRows.filter(([, o]) => o.n + o.lost >= 5).sort((a, b) => b[1].lost / (b[1].n + b[1].lost) - a[1].lost / (a[1].n + a[1].lost))[0]; return worst && worst[1].lost ? ` ${esc(worst[0])} loses the most: ${pct(worst[1].lost, worst[1].n + worst[1].lost)}% cancel or don't show.` : ''; })()}`,
      arrW[peakW] && `<b>${WEEK_L[peakW]}</b> is the busiest arrival day (${pct(arrW[peakW], cur.n)}% of bookings).`,
      sales.length && hTot[peakH] && `${AN.heat === 'daytour' ? 'Day pass' : 'The restaurant'} is busiest around <b>${h12(hours[peakH])}</b>, and on <b>${WEEK_L[peakD]}s</b>.`,
      `Guests book a typical <b>${Math.round(cur.lead)} days</b> ahead and stay <b>${cur.stay.toFixed(1)} nights</b>; ${pct(kids, cur.n)}% of bookings bring children.`
    ].filter(Boolean);
    const tb = (head, rows) => T ? table(head, rows) : '';
    const geoSeg = `<div class="seg seg-sm" role="group" aria-label="Group places by">${[['town', 'Town'], ['province', 'Province']].map(([v, l]) => `<button class="${AN.geo === v ? 'on' : ''}" aria-pressed="${AN.geo === v}" data-act="anSet" data-k="geo" data-v="${v}"><b>${l}</b></button>`).join('')}</div>`;
    const heatSeg = `<div class="seg seg-sm" role="group" aria-label="Show">${[['daytour', 'Day pass visitors'], ['fnb', 'Restaurant orders']].map(([v, l]) => `<button class="${AN.heat === v ? 'on' : ''}" aria-pressed="${AN.heat === v}" data-act="anSet" data-k="heat" data-v="${v}"><b>${l}</b></button>`).join('')}</div>`;
    return bar + `<div class="kpis">${kpis}</div>
      <div class="panel an-notes"><h2>What stands out</h2><ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul></div>
      <div class="grid g2">
        <div class="panel"><div class="ph"><h2>Where guests come from</h2>${geoSeg}</div><p class="small muted an-sub">Home town given at booking or check-in. Places with fewer than 3 bookings are grouped.</p>${where}${tb([AN.geo === 'province' ? 'Province' : 'Town', 'Bookings', 'Guests', 'Room revenue'], areas.map(([k, o]) => [esc(k), o.n, o.g, R.money(o.v)]))}</div>
        <div class="panel"><h2>How they book</h2><p class="small muted an-sub">Bookings kept, share, revenue, and how many were lost (cancelled or no-show).</p>${how}${tb(['Source', 'Bookings', 'Lost', 'Room revenue'], srcRows.map(([k, o]) => [esc(k), o.n, o.lost, R.money(o.v)]))}</div>
      </div>
      <div class="panel"><div class="ph"><h2>Peak hours</h2>${heatSeg}</div><p class="small muted an-sub">${AN.heat === 'daytour' ? 'Day pass visitors' : 'Restaurant orders'} by day and hour, ${R.fmtShort(from)} to ${R.fmtShort(to)}. Follows the period only: walk-in sales don't record source or home town.</p>
        ${sales.length ? heat : '<p class="empty">No sales in this period.</p>'}${tb(['Day', ...hours.map(h12)], WEEK_L.map((d, r) => [d, ...grid[r]]))}</div>
      <div class="grid g2">
        <div class="panel"><h2>Busiest days of the week</h2><p class="small muted an-sub">Arrivals by weekday.</p>${days}${tb(['Day', 'Arrivals'], WEEK_L.map((d, i) => [d, arrW[i]]))}</div>
        <div class="panel"><h2>Month by month</h2><p class="small muted an-sub">Room revenue per month, all months on record, with the same filters.</p>${monthChart}${tb(['Month', 'Bookings', 'Room revenue'], mk.map(k => [mName(k), months[k].n, R.money(months[k].v)]))}</div>
      </div>
      <div class="grid g2">
        <div class="panel"><h2>How long they stay</h2>${patt(nightsR, 'Bookings')}${tb(['Nights', 'Bookings'], nightsR)}</div>
        <div class="panel"><h2>How far ahead they book</h2>${patt(leadR, 'Bookings')}${tb(['Booked', 'Bookings'], leadR)}</div>
        <div class="panel"><h2>Group size</h2>${patt(sizeR, 'Bookings')}${tb(['Guests', 'Bookings'], sizeR)}</div>
        <div class="panel"><h2>Room types</h2>${patt(typeR, 'Bookings')}${tb(['Room type', 'Bookings'], typeR)}</div>
      </div>`;
  }

  R.views.reports = {
    title: 'Reports',
    hint: 'How the resort is doing. Figures update live as bookings, charges and payments happen.',
    render() {
      const tabs = [['health', 'Business health'], ['trends', 'Guests & trends'], ['daily', 'Daily manager report'], ['revenue', 'Revenue'], ['daytour', 'Day tour'], ['ops', 'Operations']];
      if (!tabs.some(t => t[0] === rTab)) rTab = 'health';
      return `<div class="tabs no-print">${tabs.map(([k, l]) => `<button class="${rTab === k ? 'on' : ''}" aria-pressed="${rTab === k}" data-act="rTab" data-tab="${k}">${l}</button>`).join('')}</div>
        ${{ health, trends, daily, revenue, daytour, ops }[rTab]()}`;
    }
  };
})();
