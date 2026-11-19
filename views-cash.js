/* Cashier (shift, cash count, X / Z reading, receipt register) and the night audit (closes the business day). */
(function () {
  const { addDays, daysBetween } = R.util;
  const esc = R.esc;
  const bd = () => R.bd();

  // every money movement in a shift: counter (POS) sales (not room charges) and payments on room bills
  R.shiftTx = function (shiftId) {
    const tx = [];
    R.S.sales.filter(s => s.shift === shiftId && s.method !== 'room').forEach(s => tx.push({ at: s.at, or: s.or, what: s.kind === 'fnb' ? s.outlet : 'Day tour', method: R.methodName(s.method), amount: R.saleAmount(s), by: s.cashier, sale: s.id }));
    R.S.venueBookings.forEach(v => v.payments.filter(p => p.shift === shiftId).forEach(p => tx.push({ at: p.at, or: p.or, what: `Cottage deposit, ${v.name}`, method: p.method, amount: p.amount, by: p.by, ev: v.id })));
    R.S.reservations.forEach(r => r.payments.filter(p => p.shift === shiftId).forEach(p => tx.push({ at: p.at, or: p.or, what: `${p.amount < 0 ? 'Refund' : 'Room bill'}, ${R.guest(r.guestId).name}`, method: p.method, amount: p.amount, by: p.by, res: r.id })));
    return tx.sort((a, b) => b.at.localeCompare(a.at));
  };
  const byMethod = tx => { const m = {}; tx.forEach(t => { m[t.method] = (m[t.method] || 0) + t.amount; }); return m; };
  const expectedCash = sh => sh.float + R.shiftTx(sh.id).filter(t => t.method === 'Cash').reduce((s, t) => s + t.amount, 0);

  R.act.xRead = () => { R.log('X-reading', `Shift ${R.S.shift.id}, ${R.peso(R.shiftTx(R.S.shift.id).reduce((s, t) => s + t.amount, 0))}`); R.save(); R.toast('X-reading sent to the receipt printer'); };
  R.act.closeShift = () => {
    if (!R.need('shift')) return;
    const sh = R.S.shift, exp = expectedCash(sh);
    const tills = R.S.staff.filter(s => s.active && ['frontdesk', 'supervisor', 'nightaudit'].includes(s.roleKey));
    R.modal('Close shift (Z-reading)', `<p class="small muted">Count the drawer before you type the amount. The count is saved with the Z-reading.</p>
      <div class="ticket-line" style="margin-top:8px"><span>Cash expected (float + cash in − cash refunds)</span><b class="num">${R.peso(exp)}</b></div>
      <div class="form" style="margin-top:10px">
        <label class="field">Cash counted<input id="zCount" type="number" min="0" step="0.01" placeholder="0.00" autofocus></label>
        <div class="field"><span>Difference</span><b id="zDiff" class="num" style="font-size:18px">—</b></div>
        <label class="field">Next cashier<select id="zNext">${tills.map(s => `<option value="${s.id}" ${s.id !== sh.cashier && s.roleKey === 'frontdesk' ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field">Opening float for next shift<input id="zFloat" type="number" min="0" value="2000"></label>
        <label class="field full">Note (required if the drawer is over or short)<input id="zNote" placeholder="e.g. ₱20 short, recounted twice"></label></div>
      <p class="small warn-text" id="zErr" style="min-height:1.4em;margin-top:6px"></p>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Back</button><button class="btn" id="zGo">Close shift</button></div>`, b => {
      const $ = s => b.querySelector(s);
      const diff = () => Math.round((+$('#zCount').value - exp) * 100) / 100;
      $('#zCount').addEventListener('input', () => { const d = diff(); $('#zDiff').textContent = $('#zCount').value === '' ? '—' : d === 0 ? 'Balanced' : d > 0 ? 'Over ' + R.peso(d) : 'Short ' + R.peso(-d); $('#zDiff').className = 'num ' + (d && $('#zCount').value !== '' ? 'warn-text' : ''); });
      $('#zGo').onclick = () => {
        if ($('#zCount').value === '') return ($('#zErr').textContent = 'Enter the cash counted.');
        const d = diff();
        if (d !== 0 && $('#zNote').value.trim().length < 3) return ($('#zErr').textContent = 'Explain the difference in the note.');
        const tx = R.shiftTx(sh.id);
        R.S.shiftsClosed.unshift({ ...sh, closed: R.now(), closedDate: bd(), expected: exp, counted: +$('#zCount').value, variance: d, note: $('#zNote').value.trim(), totals: byMethod(tx), count: tx.length, closedBy: R.S.user });
        R.log('Shift closed (Z-reading)', `${R.staff(sh.cashier).name} · expected ${R.peso(exp)}, counted ${R.peso(+$('#zCount').value)}${d ? ', ' + (d > 0 ? 'over ' : 'short ') + R.peso(Math.abs(d)) : ''}`, sh.id);
        R.S.shift = { id: R.nextId('SH'), cashier: $('#zNext').value, date: bd(), opened: R.now(), float: +$('#zFloat').value || 0 };
        R.log('Shift opened', `${R.staff(R.S.shift.cashier).name} with ${R.peso(R.S.shift.float)} float`, R.S.shift.id);
        R.closeModal(); R.rerender();
        R.toast(`Shift closed. ${R.staff(R.S.shift.cashier).name} now has the cash drawer.`);
      };
    });
  };

  let cTab = 'shift';
  R.act.cTab = d => { cTab = d.tab; R.render(); };
  R.views.cashier = {
    title: 'Cashier',
    hint: 'The current shift, cash count and Z-reading, closed shifts and every official receipt issued.',
    render() {
      const sh = R.S.shift, tx = R.shiftTx(sh.id), m = byMethod(tx), exp = expectedCash(sh), can = R.can('shift');
      const tabs = `<div class="tabs">${[['shift', 'Current shift'], ['closed', `Closed shifts (${R.S.shiftsClosed.length})`], ['ors', 'Receipt register']].map(([k, l]) => `<button class="${cTab === k ? 'on' : ''}" aria-pressed="${cTab === k}" data-act="cTab" data-tab="${k}">${l}</button>`).join('')}</div>`;
      if (cTab === 'closed') {
        return tabs + `<div class="panel"><div class="tbl"><table><thead><tr><th>Date</th><th>Cashier</th><th>Hours</th><th class="right">Takings</th><th class="right">Cash expected</th><th class="right">Counted</th><th>Difference</th></tr></thead><tbody>
          ${R.S.shiftsClosed.map(s => `<tr><td>${R.fmtShort(s.closedDate)}</td><td>${esc(R.staff(s.cashier).name)}</td><td class="small">${s.opened}–${s.closed}</td><td class="right num">${R.peso(Object.values(s.totals).reduce((a, b) => a + b, 0))}</td><td class="right num">${R.peso(s.expected)}</td><td class="right num">${R.peso(s.counted)}</td>
            <td>${s.variance === 0 ? '<span class="chip green">Balanced</span>' : `<span class="chip red">${s.variance > 0 ? 'Over' : 'Short'} ${R.peso(Math.abs(s.variance))}</span><div class="small muted">${esc(s.note)}</div>`}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No shifts closed yet. Close the current shift to see it here.</td></tr>'}</tbody></table></div></div>`;
      }
      if (cTab === 'ors') {
        const ors = [];
        R.S.sales.filter(s => s.or).forEach(s => ors.push({ date: s.date, at: s.at, or: s.or, what: s.kind === 'fnb' ? s.outlet : 'Day tour', method: R.methodName(s.method), amount: R.saleAmount(s), by: s.cashier, act: `data-act="fdReceipt" data-id="${s.id}"` }));
        R.S.venueBookings.forEach(v => v.payments.filter(p => p.or).forEach(p => ors.push({ date: p.date, at: p.at, or: p.or, what: `Cottage deposit, ${v.name}`, method: p.method, amount: p.amount, by: p.by, act: `data-act="openEvent" data-id="${v.id}"` })));
        R.S.reservations.forEach(r => r.payments.filter(p => p.or).forEach(p => ors.push({ date: p.date, at: p.at, or: p.or, what: `Room bill, ${R.guest(r.guestId).name}`, method: p.method, amount: p.amount, by: p.by, act: `data-act="openRes" data-id="${r.id}"` })));
        ors.sort((a, b) => b.or.localeCompare(a.or));
        return tabs + `<div class="panel"><p class="small muted" style="margin-bottom:8px">Every official receipt in number order, so gaps are easy to spot. ${ors.length} receipts.</p><div class="tbl"><table><thead><tr><th>Receipt</th><th>Date</th><th>For</th><th>Method</th><th>Cashier</th><th class="right">Amount</th></tr></thead><tbody>
          ${ors.slice(0, 200).map(o => `<tr class="click" ${o.act}><td><b>${o.or}</b></td><td class="small">${R.fmtShort(o.date)} ${o.at}</td><td>${esc(o.what)}</td><td>${esc(o.method)}</td><td class="small">${esc(R.staff(o.by).name)}</td><td class="right num">${R.peso(o.amount)}</td></tr>`).join('')}</tbody></table></div></div>`;
      }
      return tabs + `<div class="grid g2"><div class="panel"><h2>This shift</h2><dl class="kv">
          <dt>Cashier</dt><dd>${esc(R.staff(sh.cashier).name)}</dd><dt>Opened</dt><dd>${R.fmt(sh.date)}, ${sh.opened}</dd>
          <dt>Opening float</dt><dd>${R.peso(sh.float)}</dd><dt>Transactions</dt><dd>${tx.length}</dd>
          <dt>Takings</dt><dd><b>${R.peso(tx.reduce((s, t) => s + t.amount, 0))}</b></dd></dl>
          <h3 style="margin:16px 0 4px">By payment method</h3>
          ${Object.keys(m).length ? Object.entries(m).map(([k, v]) => `<div class="ticket-line"><span>${esc(k)}</span><b class="num">${R.peso(v)}</b></div>`).join('') : '<p class="muted small">Nothing taken yet</p>'}
          <div class="ticket-line total"><b>Cash expected in drawer</b><b class="num">${R.peso(exp)}</b></div>
          ${can ? `<div class="row" style="margin-top:12px"><button class="btn ghost" data-act="xRead">${R.icon('print')}X-reading</button><button class="btn" data-act="closeShift">Count drawer and close shift</button></div>` : '<p class="small muted" style="margin-top:10px">View only.</p>'}</div>
        <div class="panel"><h2>Transactions</h2><div class="tbl"><table><tbody>
          ${tx.map(t => `<tr class="click" ${t.sale ? `data-act="fdReceipt" data-id="${t.sale}"` : t.ev ? `data-act="openEvent" data-id="${t.ev}"` : `data-act="openRes" data-id="${t.res}"`}><td class="num small">${t.at}</td><td>${esc(t.what)}<div class="small muted">${t.or || ''}</div></td><td class="small">${esc(t.method)}</td><td class="right num">${R.peso(t.amount)}</td></tr>`).join('') || '<tr><td class="empty">No transactions yet</td></tr>'}
        </tbody></table></div></div></div>`;
    }
  };

  // ======================= Night audit =======================
  R.act.extendNight = d => {
    const r = R.res(d.id);
    if (!R.need('book')) return;
    if (!R.roomFree(r.room, R.dep(r), 1, r.id)) return R.toast(`Room ${r.room} is booked tonight. Move the guest first.`, 'warn');
    r.rates.push(R.priceOn(r.type, R.dep(r))); r.nights++;
    R.log('Stay extended', `1 night, now until ${R.fmtShort(R.dep(r))}`, r.id);
    R.rerender(); R.toast('Stay extended by one night');
  };
  R.act.allNoShow = () => {
    if (!R.need('checkin')) return;
    const L = R.S.reservations.filter(r => r.status === 'booked' && r.arrive <= bd());
    R.confirm('Mark all as no-show?', `${L.length} booking(s). Deposits are kept and the rooms are released.`, 'Mark all no-show', () => { L.forEach(r => R.markNoShow(r)); R.rerender(); R.toast(`${L.length} marked as no-show`); }, true);
  };
  R.act.runAudit = () => {
    if (!R.need('audit')) return;
    const day = bd(), ih = R.inhouse();
    const toPost = ih.filter(r => !R.lines(r).some(f => f.kind === 'night' && f.date === day));
    const sum = toPost.reduce((s, r) => s + r.rates[daysBetween(r.arrive, day)], 0);
    R.confirm(`Close ${R.fmt(day)}?`, `Posts tonight's room charge to ${toPost.length} in-house room(s) (${R.peso(sum)}), sends occupied rooms for cleaning, frees all day tour cottages, saves the daily report and moves the business date to ${R.fmt(addDays(day, 1))}. This can't be undone.`, 'Run night audit', () => {
      toPost.forEach(r => { const i = daysBetween(r.arrive, day); R.postCharge(r, `Room ${r.room}, night ${i + 1}`, 'Rooms', r.rates[i], { kind: 'night', date: day }); });
      ih.forEach(r => { R.room(r.room).hk = 'dirty'; });
      R.S.rooms.forEach(rm => { if (rm.ooo && rm.ooo.until <= addDays(day, 1)) rm.ooo.until = addDays(day, 2); });
      R.S.cottageUse = {};
      const nsV = R.S.venueBookings.filter(v => v.date === day && v.status === 'booked');
      nsV.forEach(v => { v.status = 'noshow'; v.closed = day; R.log('Cottage no-show', `${v.name}${R.vPaid(v) ? ', deposit kept ' + R.peso(R.vPaid(v)) : ''}`, v.id); });
      const rep = R.dailyFigures(day);
      rep.by = R.S.user; rep.closedAt = R.now();
      R.S.dailyReports.unshift(rep);
      R.log('Night audit', `${R.fmt(day)} closed · ${toPost.length} room nights posted (${R.peso(sum)})`);
      R.S.bd = addDays(day, 1);
      R.rerender();
      R.toast(`Day closed. Business date is now ${R.fmt(R.S.bd)}.`);
      if (R.S.notify.on) { R.log('Daily report sent', `${R.fmt(day)} to ${R.S.notify.to}`); R.save(); R.toast(`Daily manager report for ${R.fmtShort(day)} sent to ${R.S.notify.to.split(',')[0]}`); }
    });
  };
  R.views.audit = {
    title: 'Night audit',
    hint: 'Closes the business day: checks arrivals and departures, posts room nights, saves the daily report and moves to the next day.',
    render() {
      const day = bd();
      const arr = R.S.reservations.filter(r => r.status === 'booked' && r.arrive <= day);
      const dep = R.S.reservations.filter(r => r.status === 'inhouse' && R.dep(r) <= day);
      const ih = R.inhouse(), toPost = ih.filter(r => !R.lines(r).some(f => f.kind === 'night' && f.date === day));
      const shTx = R.shiftTx(R.S.shift.id);
      const step = (n, ok, title, body) => `<div class="panel step ${ok ? 'ok' : ''}"><div class="ph"><span class="avatar">${ok ? '✓' : n}</span><h2>${title}</h2><div class="sp">${ok ? '<span class="chip green">Done</span>' : '<span class="chip amber">To do</span>'}</div></div>${body}</div>`;
      const ready = !arr.length && !dep.length;
      return `<div class="note ${day < R.util.realToday() ? 'warn' : ''}" style="margin-bottom:16px">${R.icon('moon')}<div>Business date <b>${R.fmt(day)}</b>. ${day < R.util.realToday() ? 'The calendar date has moved on: run the audit to catch up.' : 'Usually run after midnight by the night auditor.'}</div></div>
        <div class="stack">
        ${step(1, !arr.length, 'Arrivals not checked in', arr.length ? `<p class="small muted" style="margin-bottom:6px">Check them in, or mark them as no-show. The deposit is kept.</p><div class="tbl"><table><tbody>${arr.map(r => R.resRow(r, `<button class="btn sm ghost" data-act="noShow" data-id="${r.id}">No-show</button>`)).join('')}</tbody></table></div><button class="btn sm ghost" data-act="allNoShow" style="margin-top:8px">Mark all as no-show</button>` : '<p class="small muted">Everyone due has arrived or been marked no-show.</p>')}
        ${step(2, !dep.length, 'Departures still in house', dep.length ? `<p class="small muted" style="margin-bottom:6px">Check them out, or extend if they are staying another night.</p><div class="tbl"><table><tbody>${dep.map(r => R.resRow(r, `<button class="btn sm ghost" data-act="extendNight" data-id="${r.id}">Extend 1 night</button> <button class="btn sm" data-act="checkOut" data-id="${r.id}">Check out</button>`)).join('')}</tbody></table></div>` : '<p class="small muted">All departures are checked out.</p>')}
        ${step(3, R.S.shift.date === day && !shTx.length, 'Cashier shift', `<p class="small">${esc(R.staff(R.S.shift.cashier).name)} has had the cash drawer since ${R.fmtShort(R.S.shift.date)} ${R.S.shift.opened} with ${shTx.length} transaction(s). ${shTx.length ? 'Close the shift so the cash count is on record before the day closes.' : ''}</p><a class="btn sm ghost" href="#cashier" style="margin-top:8px">Open Cashier</a>`)}
        ${step(4, false, 'Close the day', `<ul class="small plain"><li>Post tonight's room charge to ${toPost.length} in-house room(s): ${R.peso(toPost.reduce((s, r) => s + r.rates[daysBetween(r.arrive, day)], 0))}</li><li>Occupied rooms go on tomorrow's cleaning list</li><li>All day tour cottages are freed. Cottage reservations for today that never arrived (${R.S.venueBookings.filter(v => v.date === day && v.status === 'booked').length}) become no-shows, deposit kept</li><li>The daily manager report for ${R.fmt(day)} is saved${R.S.notify.on ? ' and sent to ' + esc(R.S.notify.to.split(',')[0]) : ''}</li><li>Business date moves to ${R.fmt(addDays(day, 1))}</li></ul>
          <button class="btn big" data-act="runAudit" ${ready ? '' : 'disabled'} style="max-width:360px">Run night audit</button>${ready ? '' : '<p class="small warn-text" style="margin-top:6px">Finish steps 1 and 2 first.</p>'}`)}
        <div class="panel"><h2>Past audits</h2><div class="tbl"><table><thead><tr><th>Business date</th><th>Occupancy</th><th class="right">ADR</th><th class="right">Room revenue</th><th class="right">Total revenue</th><th>Run by</th></tr></thead><tbody>
          ${R.S.dailyReports.map(d => `<tr><td>${R.fmt(d.date)}</td><td>${d.occPct}%</td><td class="right num">${R.money(d.adr)}</td><td class="right num">${R.money(d.rooms)}</td><td class="right num">${R.money(d.total)}</td><td class="small">${esc(R.staff(d.by).name)} · ${d.closedAt}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No audits run in this demo yet</td></tr>'}</tbody></table></div></div>
        </div>`;
    }
  };
})();
