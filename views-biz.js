/* Back office: staff roster, reports, booking channels, rooms & rates */
(function () {
  const { addDays, TODAY } = R.util;
  const esc = R.esc;

  // ---------- Staff roster ----------
  const SHIFTS = ['06:00–14:00', '14:00–22:00', '22:00–06:00', 'Off'];
  let rosDept = '';
  R.act.rosDept = (d, el) => { rosDept = el.value; R.render(); };
  R.act.rosCycle = d => {
    const a = R.S.roster[d.id], i = SHIFTS.indexOf(a[+d.day]);
    a[+d.day] = SHIFTS[(i + 1) % SHIFTS.length]; R.rerender();
  };
  R.views.staff = {
    title: 'Staff roster',
    hint: "This week's shifts by department. Click a shift to change it.",
    how: ['Each row is a staff member and each column is a day.', 'Click a shift to switch it between morning, evening, night and day off.', 'The bottom row warns when a department has nobody rostered.'],
    render() {
      const days = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i));
      const depts = [...new Set(R.S.staff.map(s => s.dept))];
      const L = R.S.staff.filter(s => !rosDept || s.dept === rosDept);
      const cls = v => v === 'Off' ? '' : v.startsWith('06') ? 'green' : v.startsWith('14') ? 'teal' : 'ink';
      const gaps = days.map((_, i) => depts.filter(dp => !R.S.staff.some(s => s.dept === dp && R.S.roster[s.id][i] !== 'Off')));
      return `<div class="panel"><div class="ph"><select class="search" data-change="rosDept"><option value="">All departments</option>${depts.map(d => `<option ${d === rosDept ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <div class="sp legend" style="margin:0"><span class="chip green">Morning</span><span class="chip teal">Evening</span><span class="chip ink">Night</span><span class="chip">Off</span></div></div>
        <div style="overflow:auto"><table><thead><tr><th>Staff</th>${days.map(d => `<th>${R.fmt(d)}</th>`).join('')}</tr></thead><tbody>
        ${L.map(s => `<tr><td><b>${esc(s.name)}</b><div class="small muted">${esc(s.role)} · ${esc(s.dept)}</div></td>${R.S.roster[s.id].map((v, i) => `<td><button class="chip ${cls(v)}" style="border:0;cursor:pointer" data-act="rosCycle" data-id="${s.id}" data-day="${i}">${v}</button></td>`).join('')}</tr>`).join('')}
        <tr><td class="small muted">Gaps</td>${gaps.map(g => `<td>${g.length ? `<span class="chip red" title="${esc(g.join(', '))}">${g.length} dept${g.length > 1 ? 's' : ''} empty</span>` : '<span class="chip green">Covered</span>'}</td>`).join('')}</tr>
        </tbody></table></div></div>`;
    }
  };

  // ---------- Reports ----------
  R.views.reports = {
    title: 'Reports',
    hint: 'How the resort is doing. Updates live as bookings, check-outs and charges happen.',
    how: ['Occupancy is the share of rooms sold each night. Light bars are future nights already on the books.', 'ADR is the average price per room night. RevPAR is room revenue divided by every room, sold or not: the best single measure of room performance.', 'Booking channels show where guests come from and what you pay in commission.'],
    render() {
      const N = R.S.rooms.length, live = R.live();
      const span = Array.from({ length: 28 }, (_, i) => addDays(TODAY, i - 14));
      const occ = span.map(d => ({ d, ...R.occupancyOn(d) }));
      const past = span.slice(0, 14);
      const nightsSold = past.reduce((s, d) => s + R.occupancyOn(d).sold, 0);
      const roomRev = past.reduce((s, d) => s + live.filter(r => r.arrive <= d && d < R.dep(r)).reduce((a, r) => a + r.rate, 0), 0);
      const adr = nightsSold ? roomRev / nightsSold : 0, revpar = roomRev / (N * 14);
      const occPast = Math.round(nightsSold / (N * 14) * 100);
      const fwd = Math.round(span.slice(14).reduce((s, d) => s + R.occupancyOn(d).sold, 0) / (N * 14) * 100);

      const dept = {};
      R.S.reservations.forEach(r => r.folio.forEach(f => { if (f.date >= past[0]) dept[f.dept] = (dept[f.dept] || 0) + f.amount; }));
      R.S.orders.filter(o => !o.inFolio).forEach(o => dept['Food & beverage'] = (dept['Food & beverage'] || 0) + o.total);
      R.S.sales.filter(s => s.method !== 'room').forEach(s => dept['Day tour & cottages'] = (dept['Day tour & cottages'] || 0) + s.calc.total);
      const dMax = Math.max(...Object.values(dept), 1);

      const ch = {};
      live.forEach(r => { ch[r.channel] = ch[r.channel] || { n: 0, v: 0 }; ch[r.channel].n++; ch[r.channel].v += r.rate * r.nights; });
      const cMax = Math.max(...Object.values(ch).map(x => x.n), 1);
      const comm = R.S.channelStatus.reduce((s, c) => s + (ch[c.name] ? ch[c.name].v * c.commission / 100 : 0), 0);

      return `<div class="pulse">
        <div><b>${occPast}%</b><span>Occupancy, last 14 nights</span></div>
        <div><b>${fwd}%</b><span>On the books, next 14 nights</span></div>
        <div><b>${R.money(adr)}</b><span>Average daily rate (ADR)</span></div>
        <div><b>${R.money(revpar)}</b><span>RevPAR</span></div>
        <div><b>${R.money(roomRev)}</b><span>Room revenue, 14 nights</span></div>
        <div><b>${R.money(comm)}</b><span>Commission paid to booking sites</span></div></div>
        <div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Occupancy by night</h2><div class="sp small muted">Last 14 nights · next 14 nights</div></div>
          <div class="bars">${occ.map(o => `<div class="b ${o.d >= TODAY ? 'f' : ''}" style="height:${Math.max(o.pct, 2)}%" data-tip="${R.fmtShort(o.d)}: ${o.pct}%"></div>`).join('')}</div>
          <div class="row small muted" style="justify-content:space-between;margin-top:4px"><span>${R.fmtShort(span[0])}</span><span>Today</span><span>${R.fmtShort(span[27])}</span></div></div>
        <div class="grid g2">
          <div class="panel"><h2>Revenue by department</h2>${Object.entries(dept).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${v / dMax * 100}%"></div></div><b class="num right">${R.money(v)}</b></div>`).join('')}</div>
          <div class="panel"><h2>Where bookings come from</h2>${Object.entries(ch).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => { const c = R.S.channelStatus.find(x => x.name === k); return `<div class="hbar"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${v.n / cMax * 100}%;background:${c && c.commission ? 'var(--sun)' : 'var(--lagoon)'}"></div></div><span class="num right small">${v.n} · ${c && c.commission ? c.commission + '% fee' : 'no fee'}</span></div>`; }).join('')}
            <p class="small muted" style="margin-top:8px">Teal = no commission. Every booking moved from Agoda or Booking.com to Facebook Messenger or walk-in saves about 15%.</p></div>
          <div class="panel" style="grid-column:1/-1"><h2>Room types</h2><table><thead><tr><th>Type</th><th>Rooms</th><th>Occupancy tonight</th><th>Base rate</th><th>Bookings ahead</th></tr></thead><tbody>
            ${R.S.roomTypes.map(t => { const rooms = R.S.rooms.filter(r => r.type === t.id).length, sold = live.filter(r => r.type === t.id && r.arrive <= TODAY && TODAY < R.dep(r)).length; return `<tr><td><b>${esc(t.name)}</b></td><td>${rooms}</td><td>${Math.round(sold / rooms * 100)}%</td><td>${R.money(t.base)}</td><td>${live.filter(r => r.type === t.id && r.status === 'booked').length}</td></tr>`; }).join('')}
          </tbody></table></div></div>`;
    }
  };

  // ---------- Booking channels ----------
  R.act.chSync = d => { const c = R.S.channelStatus.find(x => x.name === d.n); c.synced = 'Just now'; c.ok = true; R.rerender(); R.toast(`${d.n} reconnected and up to date`); };
  R.act.stopSell = d => { R.S.stop = R.S.stop || {}; const k = d.t + '|' + d.d; R.S.stop[k] = !R.S.stop[k]; R.rerender(); R.toast(R.S.stop[k] ? 'Closed on booking sites for that night' : 'Open for sale again'); };
  R.views.channels = {
    title: 'Booking channels',
    hint: 'Your rooms are sold on several websites at once. This keeps them all in step.',
    how: ['When a room sells anywhere, the number left goes down on every site within seconds. That is what stops double bookings.', 'Prices and rooms left are set here once and sent to all sites.', 'Click a number in the grid to stop selling that room type on booking sites for that night. Your own website keeps selling.'],
    render() {
      const days = Array.from({ length: 10 }, (_, i) => addDays(TODAY, i));
      const stop = R.S.stop || {};
      return `<div class="grid g-side"><div class="panel"><h2>Rooms left and price, next 10 nights</h2><div style="overflow:auto"><table><thead><tr><th>Room type</th>${days.map(d => `<th class="small">${R.fmtShort(d)}</th>`).join('')}</tr></thead><tbody>
        ${R.S.roomTypes.map(t => `<tr><td><b>${esc(t.name)}</b><div class="small muted">${R.money(t.base)}</div></td>${days.map(d => { const l = R.typeAvail(t.id, d, 1), s = stop[t.id + '|' + d]; return `<td><button class="chip ${s ? 'red' : l === 0 ? 'red' : l <= 2 ? 'amber' : 'green'}" style="border:0;cursor:pointer" data-act="stopSell" data-t="${t.id}" data-d="${d}" title="${s ? 'Closed on booking sites' : 'Click to close on booking sites'}">${s ? 'Closed' : l === 0 ? 'Sold out' : l + ' left'}</button></td>`; }).join('')}</tr>`).join('')}
        </tbody></table></div></div>
        <div class="panel"><h2>Connections</h2>${R.S.channelStatus.map(c => `<div class="list-item"><div class="grow"><b>${esc(c.name)}</b><div class="small muted">${c.commission ? c.commission + '% commission' : 'No commission'} · updated ${esc(c.synced)}</div></div>${c.ok ? '<span class="chip green">Connected</span>' : `<button class="btn sm warn" data-act="chSync" data-n="${esc(c.name)}">Reconnect</button>`}</div>`).join('')}</div></div>`;
    }
  };

  // ---------- Rooms & rates ----------
  R.act.setRate = (d, el) => { const t = R.type(d.id); t.base = Math.max(1, +el.value || t.base); R.rerender(); R.toast(`${t.name} rate is now ${R.money(t.base)}. Booking sites updated.`); };
  R.views.setup = {
    title: 'Rooms & rates',
    hint: 'Room types, prices, seasons and house rules.',
    how: ['Change a base rate here and it applies to new bookings and goes out to every booking site.', 'Seasons raise or lower rates automatically for set dates.', 'In the real system these settings are for managers only.'],
    render() {
      return `<div class="grid g2"><div class="panel"><h2>Room types</h2><table><thead><tr><th>Type</th><th>Rooms</th><th>Details</th><th>Base rate (₱)</th></tr></thead><tbody>
        ${R.S.roomTypes.map(t => `<tr><td><b>${esc(t.name)}</b></td><td>${R.S.rooms.filter(r => r.type === t.id).length}</td><td class="small muted">${t.size} · ${esc(t.bed)} · sleeps ${t.cap}<br>${esc(t.view)}</td><td><input type="number" value="${t.base}" style="width:90px" class="search" data-change="setRate" data-id="${t.id}" aria-label="${esc(t.name)} base rate"></td></tr>`).join('')}
        </tbody></table></div>
        <div class="stack"><div class="panel"><h2>Seasons</h2><table><tbody>
          <tr><td><b>Holy Week</b><div class="small muted">Maundy Thursday to Easter Sunday</div></td><td class="right">+30%</td></tr>
          <tr><td><b>Summer</b><div class="small muted">March – May</div></td><td class="right">+20%</td></tr>
          <tr><td><b>Christmas season</b><div class="small muted">20 Dec – 2 Jan</div></td><td class="right">+20%</td></tr>
          <tr><td><b>Rainy season</b><div class="small muted">June – November, weekdays</div></td><td class="right">−10%</td></tr></tbody></table></div>
        <div class="panel"><h2>House rules</h2><dl class="kv">
          <dt>Check-in / out</dt><dd>2:00 pm / 12:00 noon</dd><dt>Deposit</dt><dd>50% by GCash to confirm a Messenger or phone booking</dd>
          <dt>Cancellation</dt><dd>Deposit is non-refundable, can be moved to another date once</dd><dt>Tax</dt><dd>Prices include 12% VAT</dd>
          <dt>Senior / PWD</dt><dd>20% discount and VAT exemption on their share, with valid ID</dd>
          <dt>Day tour</dt><dd>8 am – 5 pm · night swim 6 – 10 pm · corkage applies to outside lechon and drinks</dd></dl></div></div></div>`;
    }
  };
})();
