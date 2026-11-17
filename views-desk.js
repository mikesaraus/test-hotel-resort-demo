/* Front office: front desk home, reservations list, room calendar, the booking page,
   new booking, check-in (registration card), check-out (payment first), folio actions. */
(function () {
  const { addDays, daysBetween } = R.util;
  const esc = R.esc;
  const bd = () => R.bd();
  const PAY_METHODS = ['Cash', 'GCash', 'Maya', 'Card', 'Bank transfer'];
  const ID_TYPES = ['PhilSys National ID', "Driver's license", 'Passport', 'UMID', 'Senior citizen ID', 'PWD ID', 'Other government ID'];

  // stop early, with a clear message, when the role can't do something
  R.need = function (p) {
    if (R.can(p)) return true;
    R.toast(`${R.ROLES[R.roleKey()].name} can't ${R.PERMS[p].toLowerCase()}.`, 'warn');
    return false;
  };

  // ---------- shared row ----------
  R.resRow = function (r, actions) {
    const g = R.guest(r.guestId);
    return `<tr class="click" data-act="openRes" data-id="${r.id}">
      <td><b>${esc(g.name)}</b>${g.tag ? ` <span class="chip amber">${esc(g.tag)}</span>` : ''}${r.group ? ` <span class="chip teal">Group</span>` : ''}<div class="small muted">${r.id} · ${esc(r.channel)}${r.group ? ' · ' + esc(R.group(r.group).name) : ''}</div></td>
      <td>${r.room ? `<b>${r.room}</b>` : '<span class="chip red">No room</span>'}<div class="small muted">${esc(R.type(r.type).name)}</div></td>
      <td class="small">${R.fmtShort(r.arrive)} → ${R.fmtShort(R.dep(r))}<div class="muted">${r.nights} night${r.nights > 1 ? 's' : ''} · ${r.adults + r.children} guests</div></td>
      <td>${R.chip(r.status)}</td>
      <td class="right">${actions || ''}</td></tr>`;
  };

  function canCheckIn(r) {
    if (r.status !== 'booked') return [false, R.chipLabel(r.status)];
    if (r.arrive > bd()) return [false, 'Arrives ' + R.fmt(r.arrive)];
    if (!r.room) return [false, 'Assign a room first'];
    const room = R.room(r.room);
    if (room.ooo) return [false, `Room ${r.room} is out of order`];
    if (room.hk === 'dirty') return [false, `Room ${r.room} is still dirty`];
    return [true, ''];
  }
  R.canCheckIn = canCheckIn;

  // ---------- money ----------
  R.addPayment = function (r, amount, method, ref, by, note) {
    const p = { id: R.nextId('P'), date: bd(), at: R.now(), amount, method, ref: ref || '', or: amount > 0 ? R.nextOR() : '', by: by || R.S.user, shift: R.S.shift.id, note: note || '' };
    r.payments.push(p);
    R.log(amount > 0 ? 'Payment' : 'Refund', `${R.peso(Math.abs(amount))} by ${method}${p.or ? ' · ' + p.or : ''}${note ? ' · ' + note : ''}`, r.id, by);
    return p;
  };
  R.postCharge = function (r, desc, dept, amount, extra) {
    const line = Object.assign({ id: R.nextId('L'), date: bd(), desc, dept, amount }, extra || {});
    r.folio.push(line);
    return line;
  };
  // post every room night the guest has actually slept, up to the business date
  R.postNightsUpTo = function (r, untilDate) {
    const n = Math.min(r.nights, Math.max(1, daysBetween(r.arrive, untilDate)));
    let posted = 0;
    for (let i = 0; i < n; i++) {
      const date = addDays(r.arrive, i);
      if (!R.lines(r).some(f => f.kind === 'night' && f.date === date)) { R.postCharge(r, `Room ${r.room}, night ${i + 1}`, 'Rooms', r.rates[i], { kind: 'night', date }); posted++; }
    }
    return posted;
  };
  R.markNoShow = function (r, by) {
    const paid = R.paid(r);
    r.status = 'noshow';
    if (paid > 0) R.postCharge(r, 'No-show: deposit kept', 'Rooms', paid, { kind: 'fee' });
    R.log('No-show', paid > 0 ? `Deposit ${R.peso(paid)} kept` : 'No deposit on file', r.id, by);
    r.room = null;
  };

  // ---------- check-in: registration card ----------
  R.act.checkIn = d => {
    const all = (d.ids ? d.ids.split(',') : [d.id]).map(R.res);
    const r = all[0], [ok, why] = canCheckIn(r);
    if (!R.need('checkin')) return;
    if (!ok) return R.toast(why, 'warn');
    const g = R.guest(r.guestId), t = R.type(r.type), many = all.length > 1;
    R.modal(many ? `Registration card: ${all.length} group rooms` : 'Registration card', `
      <div class="reg-head"><div><b>${esc(g.name)}</b><div class="small muted">${r.id} · ${esc(r.channel)}</div></div><div class="right"><b>Room${many ? 's ' + all.map(x => x.room).join(', ') : ' ' + r.room}</b><div class="small muted">${many ? 'Group leader signs for all rooms' : esc(t.name)}</div></div></div>
      ${g.prefs ? `<div class="note" style="margin-top:8px">${R.icon('users')}<div><b>Guest notes:</b> ${esc(g.prefs)}</div></div>` : ''}
      <dl class="kv" style="margin:10px 0 14px"><dt>Stay</dt><dd>${R.fmt(r.arrive)} → ${R.fmt(R.dep(r))}, ${r.nights} night${r.nights > 1 ? 's' : ''}</dd><dt>Guests</dt><dd>${r.adults} adults, ${r.children} children</dd>
        <dt>Room charges</dt><dd>${R.money(R.stayValue(r))} · paid so far ${R.money(R.paid(r))}</dd></dl>
      <div class="form">
        <label class="field">ID type<select id="ciType">${ID_TYPES.map(x => `<option ${g.idType === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="field">ID number<input id="ciNo" value="${esc(g.idNo)}" placeholder="As printed on the ID" autofocus></label>
        <label class="field">Nationality<input id="ciNat" value="${esc(g.nationality || 'Filipino')}"></label>
        <label class="field">Mobile<input id="ciPhone" value="${esc(g.phone)}"></label>
        <label class="field full">Home address<input id="ciAddr" value="${esc(g.town)}" placeholder="Town / city"></label>
        <label class="full check"><input type="checkbox" id="ciSigned"> Guest signed the registration card</label>
        <label class="full check"><input type="checkbox" id="ciConsent"> Guest agreed to the privacy notice (Data Privacy Act, RA 10173)</label>
      </div>
      <p class="small warn-text" id="ciErr" style="min-height:1.4em;margin-top:8px"></p>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Back</button><button class="btn" id="ciGo">Check in to ${all.map(x => x.room).join(', ')}</button></div>`, b => {
      const $ = s => b.querySelector(s);
      $('#ciGo').onclick = () => {
        const err = m => { $('#ciErr').textContent = m; };
        if ($('#ciNo').value.trim().length < 4) return err('Enter the ID number.');
        if (!$('#ciSigned').checked) return err('The guest needs to sign the registration card.');
        if (!$('#ciConsent').checked) return err('Privacy consent is required before we keep the ID details.');
        Object.assign(g, { idType: $('#ciType').value, idNo: $('#ciNo').value.trim(), nationality: $('#ciNat').value.trim(), phone: $('#ciPhone').value.trim(), town: $('#ciAddr').value.trim() });
        all.forEach(x => {
          x.reg = { idType: g.idType, idNo: g.idNo, signed: true, consent: true, at: R.now(), by: R.S.user };
          x.status = 'inhouse';
          R.log('Checked in', `Room ${x.room} · ID ${g.idType}`, x.id);
        });
        R.closeModal(); R.rerender();
        R.toast(`${g.name} checked in to ${all.map(x => x.room).join(', ')}. Key cards ready.`);
      };
    });
  };

  // ---------- check-out: post nights, take payment, then close the stay ----------
  R.act.checkOut = d => {
    const r = R.res(d.id);
    if (!R.need('checkin')) return;
    // group with one bill: the leader's room checks out last
    const grp = r.group && R.group(r.group), master = grp && grp.billing === 'master' ? R.res(grp.master) : null;
    if (master && master.id === r.id) {
      const open = R.S.reservations.filter(x => x.group === grp.id && x.id !== r.id && x.status === 'inhouse');
      if (open.length) return R.toast(`Check out rooms ${open.map(x => x.room).join(', ')} first. Their charges go on this master bill.`, 'warn');
    }
    const added = R.postNightsUpTo(r, bd());
    if (added) R.log('Room nights posted', `${added} night(s) at check-out`, r.id);
    if (master && master.id !== r.id && master.status !== 'checkedout' && R.balance(r) > 0) R.moveToMaster(r, master);
    R.save();
    const bal = R.balance(r);
    if (bal > 0) return R.payModal(r, { checkout: true });
    if (bal < 0) {
      return R.authorize({ perm: 'refund', title: 'Refund before check-out', ok: `Refund ${R.peso(-bal)}`, placeholder: 'e.g. left a day early, prepaid nights not used',
        body: `<p>${esc(R.guest(r.guestId).name)} paid ${R.peso(-bal)} more than the bill${R.dep(r) > bd() ? ' because they are leaving early' : ''}.</p>
          <label class="field" style="margin-top:10px">Refund by<select id="rfM">${PAY_METHODS.map(m => `<option>${m}</option>`).join('')}</select></label>` }, a => {
        R.addPayment(r, bal, a.body.querySelector('#rfM').value, '', a.by, a.reason);
        finishCheckout(r);
      });
    }
    finishCheckout(r);
  };
  // group with one bill: a room's charges move to the group leader's (master) bill
  R.moveToMaster = function (r, master) {
    const lines = R.lines(r);
    if (!lines.length) return 0;
    r.folio = r.folio.filter(f => f.void);
    lines.forEach(f => master.folio.push(Object.assign({}, f, { id: R.nextId('L'), kind: f.kind === 'night' ? 'night-moved' : f.kind, desc: f.desc + ` (room ${r.room})` })));
    const sum = lines.reduce((a, f) => a + f.amount, 0);
    R.log('Moved to master bill', `${lines.length} charge(s), ${R.peso(sum)} → ${master.id}`, r.id);
    R.log('Charges from group room', `Room ${r.room}: ${R.peso(sum)}`, master.id);
    return sum;
  };
  function finishCheckout(r) {
    const stayed = Math.min(r.nights, Math.max(1, daysBetween(r.arrive, bd())));
    if (stayed < r.nights) { R.log('Early departure', `Planned ${r.nights} nights, stayed ${stayed}`, r.id); r.nights = stayed; r.rates = r.rates.slice(0, stayed); }
    r.status = 'checkedout';
    const room = R.room(r.room); room.hk = 'dirty';
    if (!room.attendant) {
      const att = R.S.staff.filter(s => s.roleKey === 'housekeeping').map(s => s.id);
      room.attendant = att.sort((a, b) => R.S.rooms.filter(x => x.attendant === a && x.hk === 'dirty').length - R.S.rooms.filter(x => x.attendant === b && x.hk === 'dirty').length)[0];
    }
    R.log('Checked out', `Room ${r.room} sent to housekeeping`, r.id);
    R.rerender();
    R.toast(`${R.guest(r.guestId).name} checked out. Room ${r.room} sent to housekeeping.`);
    R.statement(r);
  }
  R.finishCheckout = finishCheckout;

  R.statement = function (r) {
    const g = R.guest(r.guestId), row = (a, b, c) => `<div class="rc-row ${c || ''}"><span>${a}</span><span class="num">${b}</span></div>`;
    R.modal('Guest statement', `<div class="receipt">
      <div class="rc-head"><strong>CAMSAIR</strong><span class="brand-rule" aria-hidden="true"><i></i>RESORT<i></i></span><small>Brgy. San Pedro, Initao, Misamis Oriental</small></div>
      ${row('Guest', esc(g.name))}${row('Booking', r.id)}${row('Room', r.room || '—')}${row('Stay', `${R.fmtShort(r.arrive)} → ${R.fmtShort(R.dep(r))}`)}<hr>
      ${R.lines(r).map(f => row(`${R.fmtShort(f.date)} ${esc(f.desc)}`, R.peso(f.amount))).join('')}<hr>
      ${row('<b>Total charges</b>', '<b>' + R.peso(R.total(r)) + '</b>', 'rc-total')}
      ${row('VATable sales', R.peso(R.total(r) / 1.12))}${row('VAT (12%)', R.peso(R.total(r) - R.total(r) / 1.12))}<hr>
      ${r.payments.map(p => row(`${p.amount < 0 ? 'Refund' : 'Paid'} · ${esc(p.method)}${p.or ? ' · ' + p.or : ''}`, R.peso(-p.amount))).join('')}
      ${row('<b>Balance</b>', '<b>' + R.peso(R.balance(r)) + '</b>', 'rc-total')}
      <p class="rc-foot">Thank you for staying at Camsair Resort!</p></div>
      <div class="foot"><button class="btn ghost" data-act="printDoc">${R.icon('print')}Print</button><button class="btn" data-act="closeModal">Done</button></div>`);
  };
  R.act.printDoc = () => { document.body.classList.add('print-modal'); window.print(); document.body.classList.remove('print-modal'); };

  // ---------- take payment (split payments allowed) ----------
  R.act.takePay = d => R.payModal(R.res(d.id), {});
  R.payModal = function (r, o) {
    if (!R.need('pay')) return;
    const bal = R.balance(r);
    R.modal(o.checkout ? 'Settle the bill' : 'Take payment', `
      <div class="ticket-line"><span>${esc(R.guest(r.guestId).name)} · room ${r.room || '—'}</span><b class="num">Balance ${R.peso(bal)}</b></div>
      <div class="methods" role="radiogroup" aria-label="Payment method">${PAY_METHODS.map((m, i) => `<label><input type="radio" name="pm" value="${m}" ${i === 0 ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div>
      <div class="form">
        <label class="field">Amount<input id="pAmt" type="number" inputmode="decimal" min="1" step="0.01" value="${Math.max(0, bal)}"></label>
        <label class="field" id="pTendW">Cash received<input id="pTend" type="number" inputmode="decimal" min="0" placeholder="Leave empty if exact"></label>
        <label class="field" id="pRefW" hidden>Reference no.<input id="pRef" placeholder="From the receipt or the guest's phone"></label>
      </div>
      <p class="small" id="pInfo" style="min-height:1.4em;margin-top:8px"></p>
      ${o.checkout ? '<p class="small muted">The guest can pay with more than one method: record the first part, then the rest.</p>' : ''}
      <div class="foot"><button class="btn ghost" data-act="closeModal">Back</button><button class="btn" id="pGo">${o.checkout ? 'Record payment' : 'Record payment'}</button></div>`, b => {
      const $ = s => b.querySelector(s);
      const method = () => b.querySelector('input[name=pm]:checked').value;
      const upd = () => {
        const m = method(), amt = +$('#pAmt').value, tend = $('#pTend').value;
        $('#pTendW').hidden = m !== 'Cash'; $('#pRefW').hidden = m === 'Cash';
        $('#pInfo').textContent = m === 'Cash' && tend !== '' ? (+tend >= amt ? `Change: ${R.peso(+tend - amt)}` : 'Cash received is less than the amount') : amt > bal ? 'More than the balance. Record only what is owed.' : amt > 0 && amt < bal ? `${R.peso(bal - amt)} will still be owed.` : '';
        $('#pInfo').className = 'small ' + ((m === 'Cash' && tend !== '' && +tend < amt) || amt > bal ? 'warn-text' : '');
      };
      b.querySelectorAll('input').forEach(i => i.addEventListener('input', upd)); upd();
      $('#pGo').onclick = () => {
        const m = method(), amt = Math.round(+$('#pAmt').value * 100) / 100, ref = $('#pRef').value.trim(), tend = $('#pTend').value;
        if (!(amt > 0)) return R.toast('Enter the amount', 'warn');
        if (amt > bal + 0.001) return R.toast('That is more than the balance', 'warn');
        if (m === 'Cash' && tend !== '' && +tend < amt) return R.toast('Cash received is less than the amount', 'warn');
        if (m !== 'Cash' && m !== 'Card' && ref.length < 4) return R.toast(`Enter the ${m} reference number`, 'warn');
        const p = R.addPayment(r, amt, m, ref);
        R.save();
        if (o.checkout && R.balance(r) <= 0) { R.closeModal(); finishCheckout(r); return; }
        R.closeModal(); R.rerender();
        R.toast(`${R.peso(amt)} received · ${p.or}${m === 'Cash' && tend !== '' && +tend > amt ? ' · change ' + R.peso(+tend - amt) : ''}`);
        if (o.checkout) R.payModal(r, o);
      };
    });
  };

  // ---------- folio actions ----------
  const DEPTS = ['Food & beverage', 'Spa & activities', 'Day tour & cottages', 'Rooms', 'Laundry', 'Damages', 'Other'];
  R.act.addCharge = d => {
    const r = R.res(d.id);
    if (!R.need('pay')) return;
    R.modal('Add a charge', `<div class="form">
      <label class="field full">Description<input id="chDesc" placeholder="e.g. Minibar, 2 soft drinks" autofocus></label>
      <label class="field">Department<select id="chDept">${DEPTS.map(x => `<option>${x}</option>`).join('')}</select></label>
      <label class="field">Amount (₱)<input id="chAmt" type="number" min="1" inputmode="decimal" placeholder="0.00"></label></div>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Back</button><button class="btn" id="chGo">Add charge</button></div>`, b => {
      b.querySelector('#chGo').onclick = () => {
        const desc = b.querySelector('#chDesc').value.trim(), amt = +b.querySelector('#chAmt').value;
        if (!desc) return R.toast('Describe the charge', 'warn');
        if (!(amt > 0)) return R.toast('Enter the amount', 'warn');
        R.postCharge(r, desc, b.querySelector('#chDept').value, amt);
        R.log('Charge posted', `${desc} · ${R.peso(amt)}`, r.id);
        R.closeModal(); R.rerender(); R.toast('Charge added');
      };
    });
  };
  R.act.voidLine = d => {
    const r = R.res(d.id), f = r.folio.find(x => x.id === d.line);
    R.authorize({ perm: 'void', title: 'Void a charge', ok: 'Void charge', danger: true, placeholder: 'e.g. posted to the wrong room, guest complaint',
      body: `<div class="ticket-line"><span>${R.fmtShort(f.date)} · ${esc(f.desc)}</span><b class="num">${R.peso(f.amount)}</b></div><p class="small muted" style="margin-top:6px">The line stays on the bill crossed out, so it can be audited.</p>` }, a => {
      f.void = { by: a.by, reason: a.reason, date: bd() };
      R.log('Charge voided', `${f.desc} · ${R.peso(f.amount)} · ${a.reason}`, r.id, a.by);
      R.rerender(); R.toast('Charge voided');
    });
  };
  R.act.transferLine = d => {
    const r = R.res(d.id), f = r.folio.find(x => x.id === d.line);
    if (!R.need('pay')) return;
    const others = R.inhouse().filter(x => x.id !== r.id);
    R.modal('Move a charge to another room', `<div class="ticket-line"><span>${esc(f.desc)}</span><b class="num">${R.peso(f.amount)}</b></div>
      <label class="field" style="margin-top:12px">Move to<select id="trTo">${others.map(x => `<option value="${x.id}">Room ${x.room}, ${esc(R.guest(x.guestId).name)}</option>`).join('')}</select></label>
      <p class="small muted" style="margin-top:6px">Use this when one guest pays for another room's charges (split bill).</p>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Back</button><button class="btn" id="trGo">Move charge</button></div>`, b => {
      b.querySelector('#trGo').onclick = () => {
        const to = R.res(b.querySelector('#trTo').value);
        r.folio = r.folio.filter(x => x !== f);
        to.folio.push(Object.assign({}, f, { kind: f.kind === 'night' ? 'night-moved' : f.kind, desc: f.desc + ` (from room ${r.room})` }));
        R.log('Charge moved', `${f.desc} → room ${to.room}`, r.id); R.log('Charge received', `${f.desc} from room ${r.room}`, to.id);
        R.closeModal(); R.rerender(); R.toast(`Moved to room ${to.room}`);
      };
    });
  };
  R.act.refund = d => {
    const r = R.res(d.id), paid = R.paid(r);
    R.authorize({ perm: 'refund', title: 'Give a refund', ok: 'Refund', danger: true, placeholder: 'e.g. overcharged, service problem',
      body: `<p class="small muted">Paid so far: ${R.peso(paid)}</p><div class="form" style="margin-top:8px">
        <label class="field">Amount<input id="rfAmt" type="number" min="1" placeholder="0.00"></label>
        <label class="field">Refund by<select id="rfM">${PAY_METHODS.map(m => `<option>${m}</option>`).join('')}</select></label></div>`,
      check: b => { const a = +b.querySelector('#rfAmt').value; return !(a > 0) ? 'Enter the amount' : a > paid ? 'More than was paid' : ''; } }, a => {
      R.addPayment(r, -Math.round(+a.body.querySelector('#rfAmt').value * 100) / 100, a.body.querySelector('#rfM').value, '', a.by, a.reason);
      R.rerender(); R.toast('Refund recorded');
    });
  };

  // ---------- stay changes ----------
  R.act.assignRoom = (d, el) => {
    const r = R.res(d.id);
    if (!R.need('book')) { R.render(); return; }
    r.room = el.value || null;
    R.log(r.room ? 'Room assigned' : 'Room unassigned', r.room ? 'Room ' + r.room : '', r.id);
    R.rerender(); R.toast(r.room ? `Room ${r.room} assigned` : 'Room unassigned');
  };
  R.act.moveRoom = d => {
    const r = R.res(d.id);
    const from = r.status === 'inhouse' ? bd() : r.arrive, left = Math.max(1, daysBetween(from, R.dep(r)));
    const free = R.freeRooms(null, from, left, r.id).filter(x => x.no !== r.room);
    R.authorize({ perm: 'move', title: `Move from room ${r.room || '—'}`, ok: 'Move room', placeholder: 'e.g. aircon problem, guest asked for pool view',
      body: `<label class="field">New room (free ${R.fmtShort(from)} → ${R.fmtShort(R.dep(r))})<select id="mvTo">${free.map(x => { const s = R.roomState(x); return `<option value="${x.no}">${x.no} · ${esc(R.type(x.type).name)} · ${s.label}</option>`; }).join('')}</select></label>
        <p class="small muted" style="margin-top:6px">The rate stays the same. Change it separately if the new room costs more.</p>`,
      check: () => free.length ? '' : 'No free rooms for these dates' }, a => {
      const to = a.body.querySelector('#mvTo').value, old = r.room;
      if (r.status === 'inhouse' && old) R.room(old).hk = 'dirty';
      r.room = to; r.type = R.room(to).type;
      R.log('Room move', `${old || '—'} → ${to} · ${a.reason}`, r.id, a.by);
      R.rerender(); R.toast(`Moved to room ${to}`);
    });
  };
  R.act.changeRate = d => {
    const r = R.res(d.id), posted = R.lines(r).filter(f => f.kind === 'night').length;
    if (posted >= r.nights) return R.toast('All nights are already posted. Void and repost to correct them.', 'warn');
    R.authorize({ perm: 'rate', title: 'Change the room rate', ok: 'Change rate', placeholder: 'e.g. repeat guest discount, upgrade at same price',
      body: `<p class="small muted">Applies to the ${r.nights - posted} night(s) not posted yet. Now: ${r.rates.slice(posted).map(R.money).join(', ')}.</p>
        <label class="field" style="margin-top:8px">New rate per night (₱)<input id="crR" type="number" min="1" value="${Math.round(R.avgRate(r))}"></label>`,
      check: b => +b.querySelector('#crR').value > 0 ? '' : 'Enter the new rate' }, a => {
      const v = +a.body.querySelector('#crR').value;
      r.rates = r.rates.map((x, i) => i < posted ? x : v);
      R.log('Rate changed', `${R.money(v)} per night · ${a.reason}`, r.id, a.by);
      R.rerender(); R.toast('Rate changed');
    });
  };
  R.act.editDates = d => {
    const r = R.res(d.id);
    if (!R.need('book')) return;
    R.modal('Change dates', `<div class="form">
      <label class="field">Arrival<input id="edA" type="date" value="${r.arrive}" min="${bd()}"></label>
      <label class="field">Nights<input id="edN" type="number" min="1" max="30" value="${r.nights}"></label>
      <div class="full" id="edQ"></div></div>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Back</button><button class="btn" id="edGo">Save new dates</button></div>`, b => {
      const $ = s => b.querySelector(s);
      const q = () => {
        const a = $('#edA').value, n = +$('#edN').value || 1, left = R.typeAvail(r.type, a, n, r.id), rates = R.quote(r.type, a, n);
        $('#edQ').innerHTML = `<div class="note">${left ? `${left} ${esc(R.type(r.type).name)} free · new price ${R.money(rates.reduce((x, y) => x + y, 0))}` : 'Sold out for these dates'}${r.room && !R.roomFree(r.room, a, n, r.id) ? `<br>Room ${r.room} is taken then, so the room will be unassigned.` : ''}</div>`;
        $('#edGo').disabled = !left;
        return { a, n, rates };
      };
      b.querySelectorAll('input').forEach(i => i.addEventListener('input', q)); q();
      $('#edGo').onclick = () => {
        const { a, n, rates } = q(), old = `${R.fmtShort(r.arrive)}, ${r.nights}n`;
        if (r.room && !R.roomFree(r.room, a, n, r.id)) r.room = null;
        Object.assign(r, { arrive: a, nights: n, rates });
        R.log('Dates changed', `${old} → ${R.fmtShort(a)}, ${n}n`, r.id);
        R.closeModal(); R.rerender(); R.toast('Dates changed');
      };
    });
  };
  R.act.cancelRes = d => {
    const r = R.res(d.id), paid = R.paid(r);
    R.authorize({ perm: 'cancel', title: 'Cancel booking ' + r.id, ok: 'Cancel booking', danger: true, placeholder: 'What did the guest say?',
      body: `<p>${esc(R.guest(r.guestId).name)}, ${R.fmt(r.arrive)}, ${r.nights} night${r.nights > 1 ? 's' : ''}.</p>
        ${paid > 0 ? `<div class="note" style="margin-top:10px">House rule: the ${R.peso(paid)} deposit is <b>not refunded</b>. It is kept as a cancellation fee. The guest may move to new dates once instead. <a href="#" data-act="editDates" data-id="${r.id}">Move dates instead</a></div>` : '<p class="small muted" style="margin-top:6px">No deposit was paid.</p>'}` }, a => {
      r.status = 'cancelled'; r.room = null; r.cancel = { date: bd(), reason: a.reason, by: a.by };
      if (paid > 0) R.postCharge(r, 'Cancellation: deposit kept (non-refundable)', 'Rooms', paid, { kind: 'fee' });
      R.log('Cancelled', a.reason, r.id, a.by);
      R.rerender(); R.toast(`Booking ${r.id} cancelled`);
    });
  };
  R.act.noShow = d => {
    const r = R.res(d.id);
    if (!R.need('checkin')) return;
    R.confirm('Mark as no-show?', `${esc(R.guest(r.guestId).name)} was due ${R.fmt(r.arrive)}. ${R.paid(r) > 0 ? `The ${R.peso(R.paid(r))} deposit is kept.` : 'No deposit was paid.'} The room is released.`, 'Mark no-show', () => {
      R.markNoShow(r); R.rerender(); R.toast('Marked as no-show');
    }, true);
  };

  // ---------- new booking ----------
  R.act.newBooking = d => R.newBooking(d || {});
  R.newBooking = function (pre) {
    if (!R.need('book')) return;
    const types = R.S.roomTypes, srcs = R.S.sources.map(s => s.name);
    R.modal('New booking', `<div class="form">
      <label class="field full">Guest<input id="nbGuest" list="nbGuests" placeholder="Type a name: returning guests appear in the list" autocomplete="off" autofocus>
        <datalist id="nbGuests">${R.S.guests.map(g => `<option value="${esc(g.name)} — ${g.id}">${esc(g.town)}${g.tag ? ' · ' + esc(g.tag) : ''}</option>`).join('')}</datalist></label>
      <div class="full" id="nbDup"></div>
      <div class="full form" id="nbNewWrap" style="grid-template-columns:1fr 1fr">
        <label class="field">Mobile (new guest)<input id="nbPhone" placeholder="+63 9xx xxx xxxx"></label>
        <label class="field">Email (optional)<input id="nbEmail" type="email" placeholder="name@example.com"></label></div>
      <label class="field">Room type<select id="nbType">${types.map(t => `<option value="${t.id}" ${pre.type === t.id ? 'selected' : ''}>${esc(t.name)} (sleeps ${t.cap})</option>`).join('')}</select></label>
      <label class="field">Booked through<select id="nbCh">${srcs.map(c => `<option ${(pre.ch || 'Facebook Messenger') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field">Arrival<input id="nbArr" type="date" value="${pre.date || bd()}" min="${bd()}"></label>
      <label class="field">Nights<input id="nbN" type="number" value="1" min="1" max="30"></label>
      <label class="field">Adults<input id="nbA" type="number" value="2" min="1" max="10"></label>
      <label class="field">Children<input id="nbC" type="number" value="0" min="0" max="8"></label>
      <label class="field">Room<select id="nbRoom"></select></label>
      <label class="field">Rate per night (₱)<input id="nbRate" type="number" min="1" placeholder="Season price"></label>
      <div class="full" id="nbQuote"></div>
      <label class="field">Deposit received<select id="nbDep"><option value="">Not yet</option>${['GCash', 'Cash', 'Maya', 'Card', 'Bank transfer', 'Prepaid on booking site'].map(m => `<option>${m}</option>`).join('')}</select></label>
      <label class="field">Deposit reference<input id="nbRef" placeholder="GCash / bank reference"></label>
      <label class="field full" id="nbOverW" hidden>Over capacity: why is it OK? (required)<input id="nbOver" placeholder="e.g. extra mattress ₱500, 1 baby in a crib"></label>
      <label class="field full">Notes<input id="nbNotes" placeholder="e.g. birthday cake at 7 pm, late arrival"></label></div>
      <p class="small warn-text" id="nbErr" style="min-height:1.4em;margin-top:8px"></p>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="nbGo">Create booking</button></div>`, b => {
      const $ = s => b.querySelector(s);
      const found = () => { const m = $('#nbGuest').value.match(/ — (G\d+)$/); return m ? R.guest(m[1]) : null; };
      let lastKey = '';
      if (pre.guest) { const pg = R.findGuest(pre.guest); $('#nbGuest').value = pg.name + ' — ' + pg.id; }
      b.addEventListener('click', e => { const p = e.target.closest('[data-pick]'); if (p) { e.preventDefault(); $('#nbGuest').value = p.dataset.pick; quote(); } });
      const quote = () => {
        $('#nbNewWrap').style.display = found() || !$('#nbGuest').value.trim() ? 'none' : '';
        // returning guest? warn before a duplicate profile is made
        const nm = $('#nbGuest').value.trim().toLowerCase(), ph = $('#nbPhone').value.replace(/\D/g, '');
        const dups = found() || nm.length < 3 ? [] : R.S.guests.filter(g => g.name.toLowerCase() === nm || g.name.toLowerCase().startsWith(nm + ' ') || (ph.length >= 7 && g.phone.replace(/\D/g, '').endsWith(ph.slice(-7)))).slice(0, 3);
        $('#nbDup').innerHTML = dups.length ? `<div class="note warn">${R.icon('users')}<div><b>Already a guest?</b> Use the existing profile so their history stays in one place.<div class="row" style="margin-top:6px">${dups.map(g => `<button class="btn sm ghost" data-pick="${esc(g.name)} — ${g.id}">${esc(g.name)} · ${esc(g.phone)}</button>`).join('')}</div></div></div>` : '';
        const t = R.type($('#nbType').value), n = Math.max(1, +$('#nbN').value || 1), a = $('#nbArr').value;
        const rates = R.quote(t.id, a, n), sum = rates.reduce((x, y) => x + y, 0), left = R.typeAvail(t.id, a, n);
        const ppl = +$('#nbA').value + +$('#nbC').value, seasons = [...new Set(rates.map((_, i) => (R.seasonOn(addDays(a, i)) || {}).name).filter(Boolean))];
        const key = t.id + a + n;
        if (key !== lastKey) {
          lastKey = key;
          const free = R.freeRooms(t.id, a, n);
          $('#nbRoom').innerHTML = `<option value="">Assign automatically</option>` + free.map(x => `<option value="${x.no}" ${x.no === pre.room ? 'selected' : ''}>${x.no}</option>`).join('');
          $('#nbRate').placeholder = 'Season price ' + R.money(sum / n);
        }
        const over = +$('#nbRate').value > 0 && +$('#nbRate').value * n < sum;
        const total = +$('#nbRate').value > 0 ? +$('#nbRate').value * n : sum;
        $('#nbQuote').innerHTML = `<div class="note ${left ? '' : 'warn'}"><div class="row"><b>${left ? `${left} free` : 'Sold out'}</b> <span class="muted">${R.fmt(a)} → ${R.fmt(addDays(a, n))}</span><span style="margin-left:auto" class="num"><b>${R.money(total)}</b> total</span></div>
          <div class="small muted">${rates.map(R.money).join(' + ')}${seasons.length ? ' · ' + seasons.map(esc).join(', ') + ' pricing' : ''}${$('#nbCh').value.match(/Agoda|Booking/) ? ` · ${R.sourceFee($('#nbCh').value)}% commission` : ` · ${R.S.rules.deposit}% deposit to confirm: ${R.money(total * R.S.rules.deposit / 100)}`}</div>
          ${ppl > t.cap ? `<div class="small warn-text">${ppl} guests, but this room sleeps ${t.cap}. Choose a bigger room type, or write why it's OK below.</div>` : ''}
          ${over ? `<div class="small">Below the season price: ${R.can('rate') ? 'you can approve this.' : 'a supervisor will approve with their PIN.'}</div>` : ''}</div>`;
        $('#nbOverW').hidden = ppl <= t.cap;
        $('#nbGo').disabled = !left;
        return { t, n, a, rates, over, ppl };
      };
      b.querySelectorAll('input,select').forEach(i => i.addEventListener('input', quote));
      quote();
      $('#nbGo').onclick = () => {
        const q = quote(), err = m => { $('#nbErr').textContent = m; };
        const name = $('#nbGuest').value.trim();
        let g = found();
        if (!g && name.length < 3) return err('Enter the guest name.');
        if (!g && $('#nbPhone').value.trim().length < 7) return err('Enter a mobile number for the new guest.');
        if (q.ppl > q.t.cap && $('#nbOver').value.trim().length < 5) return err(`${q.ppl} guests is more than the ${q.t.name} sleeps (${q.t.cap}). Write why it's OK.`);
        if ($('#nbDep').value && $('#nbDep').value !== 'Cash' && $('#nbRef').value.trim().length < 4) return err('Enter the deposit reference number.');
        const vals = { name, phone: $('#nbPhone').value.trim(), email: $('#nbEmail').value.trim(), ch: $('#nbCh').value, adults: +$('#nbA').value, children: +$('#nbC').value,
          room: $('#nbRoom').value, rate: +$('#nbRate').value, dep: $('#nbDep').value, ref: $('#nbRef').value.trim(), notes: [$('#nbNotes').value.trim(), q.ppl > q.t.cap ? `Over capacity (${q.ppl} in a room for ${q.t.cap}): ${$('#nbOver').value.trim()}` : ''].filter(Boolean).join(' · ') };
        const create = by => {
          if (!g) { g = { id: R.nextId('G'), name: vals.name, email: vals.email, phone: vals.phone, town: '', tag: '', stays: 0, nationality: 'Filipino', idType: '', idNo: '' }; R.S.guests.unshift(g); }
          const rates = vals.rate > 0 ? q.rates.map(() => vals.rate) : q.rates;
          const room = vals.room || (R.freeRooms(q.t.id, q.a, q.n)[0] || {}).no || null;
          const r = { id: 'CR-' + (++R.S.seq), guestId: g.id, type: q.t.id, room, arrive: q.a, nights: q.n, rates, adults: vals.adults, children: vals.children, channel: vals.ch, status: 'booked', notes: vals.notes, folio: [], payments: [], reg: null, eta: '14:00', created: bd() };
          R.S.reservations.push(r);
          R.log('Booking created', `${q.t.name}, ${q.n}n from ${R.fmtShort(q.a)} · ${R.money(R.stayValue(r))}${vals.rate > 0 ? ' · rate set by hand' : ''}`, r.id, by);
          if (vals.dep) R.addPayment(r, Math.round(R.stayValue(r) * (vals.dep === 'Prepaid on booking site' ? 1 : R.S.rules.deposit / 100)), vals.dep, vals.ref, R.S.user, 'Deposit');
          R.closeModal(); R.rerender(); R.go('booking', r.id);
          R.toast(`Booking ${r.id} created${room ? ', room ' + room : ''}. Confirmation sent by text.`);
        };
        if (q.over && !R.can('rate')) {
          return R.authorize({ perm: 'rate', title: 'Approve a lower rate', ok: 'Approve and create', body: `<p>${R.money(vals.rate)} per night instead of the season price of ${R.money(q.rates.reduce((x, y) => x + y, 0) / q.n)}.</p>` }, a => { R.log('Rate approved', a.reason, '', a.by); create(R.S.user); });
        }
        create();
      };
    });
  };

  // ---------- Front desk (home) ----------
  let fdTab = 'arrivals', fdQ = '';
  R.act.fdTab = d => { fdTab = d.tab; R.render(); };
  R.views.desk = {
    title: 'Front desk',
    hint: "Today's arrivals, guests in house and departures, and anything that needs attention.",
    render() {
      const day = bd(), all = R.S.reservations;
      const arrAll = all.filter(r => r.arrive === day && ['booked', 'inhouse', 'noshow'].includes(r.status));
      const arr = all.filter(r => r.status === 'booked' && r.arrive <= day);
      const ih = all.filter(r => r.status === 'inhouse');
      const depAll = all.filter(r => R.dep(r) === day && (r.status === 'inhouse' || r.status === 'checkedout'));
      const dep = ih.filter(r => R.dep(r) <= day);
      const occ = R.occupancyOn(day);
      const readyFor = arr.filter(r => canCheckIn(r)[0]).length;
      const due = dep.reduce((s, r) => s + Math.max(0, R.expectedBalance(r)), 0);
      const sets = { arrivals: arr, inhouse: ih, departures: dep };
      const q = fdQ.toLowerCase();
      const rows = sets[fdTab].filter(r => !q || R.guest(r.guestId).name.toLowerCase().includes(q) || (r.room || '').toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
        .sort((a, b) => (a.room || '').localeCompare(b.room || '', undefined, { numeric: true }));
      const act = r => {
        if (fdTab === 'arrivals') {
          const [ok, why] = canCheckIn(r);
          return `${r.arrive < day ? `<button class="btn sm ghost" data-act="noShow" data-id="${r.id}">No-show</button> ` : ''}${ok ? `<button class="btn sm" data-act="checkIn" data-id="${r.id}">Check in</button>` : `<span class="small muted">${esc(why)}</span>`}`;
        }
        if (fdTab === 'departures') { const b = R.expectedBalance(r); return `<button class="btn sm" data-act="checkOut" data-id="${r.id}">Check out${b > 0 ? ' · ' + R.money(b) + ' due' : ''}</button>`; }
        const b = R.expectedBalance(r);
        return `<span class="num small ${b > 0 ? '' : 'muted'}">${b > 0 ? R.money(b) + ' due by check-out' : 'Paid up'}</span>`;
      };
      const alerts = [];
      const ar = (lvl, text, a) => alerts.push([lvl, text, a]);
      arr.filter(r => r.arrive < day).forEach(r => ar('red', `${R.guest(r.guestId).name} was due ${R.fmtShort(r.arrive)}. Check in or mark no-show.`, `data-act="openRes" data-id="${r.id}"`));
      arr.filter(r => !r.room).forEach(r => ar('red', `${R.guest(r.guestId).name} arrives today with no room assigned`, `data-act="openRes" data-id="${r.id}"`));
      arr.filter(r => r.room && R.room(r.room).hk === 'dirty' && !R.room(r.room).ooo).forEach(r => ar('amber', `Room ${r.room} must be cleaned before ${R.guest(r.guestId).name} arrives (${r.eta})`, `href="#rooms"`));
      R.S.rooms.filter(r => r.ooo).forEach(r => ar('amber', `Room ${r.no} out of order until ${R.fmtShort(r.ooo.until)}: ${r.ooo.reason}`, `href="#tasks"`));
      R.S.tasks.filter(t => t.status !== 'done' && (t.priority === 'urgent' || t.priority === 'high' || (R.taskFlag(t) && R.taskFlag(t)[0] === 'red'))).forEach(t => { const f = R.taskFlag(t); ar('red', `${t.text} (${t.area})${f ? ': ' + f[1].toLowerCase() : ''}`, `href="#" data-act="openTask" data-id="${t.id}"`); });
      const newReq = R.S.tasks.filter(t => t.kind === 'request' && t.status === 'new').length;
      if (newReq) ar('amber', `${newReq} new guest request${newReq > 1 ? 's' : ''}`, `href="#tasks"`);
      ih.filter(r => R.guest(r.guestId).tag === 'VIP').forEach(r => ar('teal', `VIP in house: ${R.guest(r.guestId).name}, room ${r.room}`, `data-act="openRes" data-id="${r.id}"`));
      if (day < R.util.realToday()) ar('red', 'The night audit for ' + R.fmt(day) + ' has not been run', `href="#audit"`);
      return `
      <div class="pulse">
        <div><b>${occ.pct}%</b><span>Occupancy tonight · ${occ.sold} of ${R.S.rooms.length}</span></div>
        <div><b>${arr.length}<small> of ${arrAll.length + arr.filter(r => r.arrive < day).length}</small></b><span>Arrivals to check in</span></div>
        <div><b>${dep.length}<small> of ${depAll.length}</small></b><span>Departures to check out</span></div>
        <div><b>${ih.length}</b><span>Rooms in house · ${ih.reduce((s, r) => s + r.adults + r.children, 0)} guests</span></div>
        <div><b>${readyFor}<small> of ${arr.length}</small></b><span>Arrivals with a room ready</span></div>
        <div><b>${R.money(due)}</b><span>Still to collect from departures</span></div>
      </div>
      <div class="grid g-side">
        <div class="panel">
          <div class="tabs">${[['arrivals', 'Arrivals', arr.length], ['inhouse', 'In house', ih.length], ['departures', 'Departures', dep.length]].map(([k, l, n]) => `<button class="${fdTab === k ? 'on' : ''}" aria-pressed="${fdTab === k}" data-act="fdTab" data-tab="${k}">${l} <span class="chip">${n}</span></button>`).join('')}
            <span class="sp"><button class="btn sm ghost" data-act="prepList">${R.icon('print')}Arrivals list</button>${R.can('book') ? `<button class="btn sm" data-act="newBooking" data-ch="Walk-in">${R.icon('plus')}Walk-in room</button>` : ''}</span></div>
          <input class="search" id="fdSearch" placeholder="Filter by name, room or booking no." value="${esc(fdQ)}" style="width:100%;margin-bottom:8px" aria-label="Filter list">
          <div class="tbl"><table><thead><tr><th>Guest</th><th>Room</th><th>Stay</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows.map(r => R.resRow(r, act(r))).join('') || `<tr><td colspan="5" class="empty">${fdTab === 'arrivals' ? 'Everyone due today is checked in' : fdTab === 'departures' ? 'All departures are checked out' : 'Nobody in house'}</td></tr>`}</tbody></table></div>
        </div>
        <div class="panel"><h2>Needs attention</h2>${alerts.map(([lvl, t, a]) => `<a class="list-item alert-row" ${a.startsWith('href="#tasks') || a.startsWith('href="#rooms') || a.startsWith('href="#audit') ? a : a.startsWith('href') ? a : `href="#" ${a}`}><span class="dot ${lvl}" aria-hidden="true"></span><div class="grow small">${esc(t)}</div><span class="sr">${lvl === 'red' ? 'Urgent' : lvl === 'amber' ? 'Soon' : 'Info'}</span>${R.icon('back', 'flip')}</a>`).join('') || '<p class="empty">All clear</p>'}</div>
      </div>`;
    },
    mount(el) {
      const s = el.querySelector('#fdSearch');
      s.addEventListener('input', () => { fdQ = s.value; const p = s.selectionStart; R.render(); const n = document.getElementById('fdSearch'); n.focus(); n.setSelectionRange(p, p); });
    }
  };

  // ---------- Reservations: list, availability, groups ----------
  let rsStatus = 'upcoming', rsChannel = '', rsQ = '', rsView = 'list', avStart = null;
  R.act.rsFilter = (d, el) => { if (el.id === 'rsStatus') rsStatus = el.value; else rsChannel = el.value; R.render(); };
  R.act.rsView = d => { rsView = d.v; R.render(); };
  R.act.avShift = d => { avStart = d.n === '0' ? bd() : addDays(avStart, +d.n); if (avStart < bd()) avStart = bd(); R.render(); };
  R.act.avNew = d => R.newBooking({ type: d.t, date: d.d });

  function availability() {
    if (!avStart || avStart < bd()) avStart = bd();
    const days = Array.from({ length: 14 }, (_, i) => addDays(avStart, i));
    const totalLeft = d => R.S.roomTypes.reduce((s, t) => s + R.typeAvail(t.id, d, 1), 0);
    const cell = (t, d) => {
      const l = R.typeAvail(t.id, d, 1), cls = l === 0 ? 'red' : l <= 1 ? 'amber' : 'green', s = R.seasonOn(d);
      const can = R.can('book') && l > 0;
      return `<td class="av"><${can ? 'button' : 'span'} class="av-cell ${cls}" ${can ? `data-act="avNew" data-t="${t.id}" data-d="${d}" title="Book ${esc(t.name)} from ${R.fmtShort(d)}"` : ''}><b>${l === 0 ? 'Full' : l + ' left'}</b><small>${R.money(R.priceOn(t.id, d))}${s ? ' · ' + esc(s.name.split(',')[0]) : ''}</small></${can ? 'button' : 'span'}></td>`;
    };
    const groups = R.S.groups.map(g => ({ g, rs: R.S.reservations.filter(r => r.group === g.id) })).filter(x => x.rs.some(r => r.status === 'booked' || r.status === 'inhouse'));
    return `<div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Rooms left per night</h2>
        <div class="sp"><button class="btn ghost sm" data-act="avShift" data-n="-7">← Week</button><button class="btn ghost sm" data-act="avShift" data-n="0">Today</button><button class="btn ghost sm" data-act="avShift" data-n="7">Week →</button>
        <button class="btn sm ghost" data-act="quoteMsg">Quote for Messenger</button>${R.can('book') ? `<button class="btn sm" data-act="newGroup">${R.icon('users')}Group booking</button>` : ''}</div></div>
        <p class="small muted" style="margin-bottom:8px">Price shown is tonight's selling price with the season applied. Click a night to book that room type.</p>
        <div class="tbl"><table class="avail"><thead><tr><th>Room type</th>${days.map(d => `<th class="${d === bd() ? 'today-col' : ''}">${new Date(d + 'T12:00').toLocaleDateString('en-PH', { weekday: 'short' })}<br>${R.fmtShort(d)}</th>`).join('')}</tr></thead><tbody>
        ${R.S.roomTypes.map(t => `<tr><td><b>${esc(t.name)}</b><div class="small muted">${R.S.rooms.filter(r => r.type === t.id).length} rooms · sleeps ${t.cap}</div></td>${days.map(d => cell(t, d)).join('')}</tr>`).join('')}
        <tr class="sum"><td><b>All rooms</b></td>${days.map(d => { const l = totalLeft(d); return `<td class="center small"><b>${l}</b> left<div class="muted">${Math.round((R.S.rooms.length - l) / R.S.rooms.length * 100)}% sold</div></td>`; }).join('')}</tr>
        </tbody></table></div></div>
      <div class="panel"><div class="ph"><h2>Groups</h2><div class="sp small muted">Several rooms under one booking, with one bill or separate bills</div></div>
        <div class="tbl"><table><thead><tr><th>Group</th><th>Dates</th><th>Rooms</th><th>Bill</th><th class="right">Value · due</th></tr></thead><tbody>
        ${groups.map(({ g, rs }) => { const due = rs.reduce((s, r) => s + Math.max(0, r.status === 'booked' || r.status === 'inhouse' ? R.expectedBalance(r) : R.balance(r)), 0); return `<tr class="click" data-act="openGroup" data-id="${g.id}"><td><b>${esc(g.name)}</b><div class="small muted">${esc(R.guest(g.contactId).name)}${g.company ? ' · ' + esc(g.company) : ''}</div></td><td class="small">${R.fmtShort(rs[0].arrive)} → ${R.fmtShort(R.dep(rs[0]))}</td><td>${rs.filter(r => r.status !== 'cancelled').map(r => r.room || '—').join(', ')}</td><td class="small">${g.billing === 'master' ? 'One bill' : 'Separate bills'}</td><td class="right num">${R.money(rs.reduce((s, r) => s + R.stayValue(r), 0))}<div class="small ${due > 0 ? '' : 'muted'}">${due > 0 ? R.money(due) + ' due' : 'Paid'}</div></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">No upcoming groups</td></tr>'}
        </tbody></table></div></div>`;
  }

  R.views.reservations = {
    title: 'Reservations',
    hint: 'Every booking from every source, rooms left per night, and group bookings.',
    render() {
      const toggle = `<div class="row" style="margin-bottom:12px"><div class="seg" role="group" aria-label="View">${[['list', 'Bookings'], ['avail', 'Availability & groups']].map(([v, l]) => `<button class="${rsView === v ? 'on' : ''}" aria-pressed="${rsView === v}" data-act="rsView" data-v="${v}"><b>${l}</b></button>`).join('')}</div></div>`;
      if (rsView === 'avail') return toggle + availability();
      const q = rsQ.toLowerCase();
      let L = R.S.reservations.slice();
      if (rsStatus === 'upcoming') L = L.filter(r => r.status === 'booked');
      else if (rsStatus) L = L.filter(r => r.status === rsStatus);
      if (rsChannel) L = L.filter(r => r.channel === rsChannel);
      if (q) L = L.filter(r => R.guest(r.guestId).name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
      L.sort((a, b) => rsStatus === 'upcoming' || rsStatus === 'booked' ? a.arrive.localeCompare(b.arrive) : b.arrive.localeCompare(a.arrive));
      const opts = [['upcoming', 'Upcoming'], ['inhouse', 'In house'], ['checkedout', 'Checked out'], ['cancelled', 'Cancelled'], ['noshow', 'No-show'], ['', 'All']];
      return toggle + `<div class="panel"><div class="ph">
        <select id="rsStatus" data-change="rsFilter" class="search" aria-label="Status">${opts.map(([v, l]) => `<option value="${v}" ${rsStatus === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="rsChannel" data-change="rsFilter" class="search" aria-label="Booked through"><option value="">All sources</option>${R.S.sources.map(c => `<option ${c.name === rsChannel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <input class="search" id="rsSearch" placeholder="Guest or booking no." value="${esc(rsQ)}" aria-label="Search">
        <div class="sp"><span class="muted small">${L.length} bookings</span>${R.can('book') ? `<button class="btn ghost" data-act="newGroup">Group</button><button class="btn" data-act="newBooking">${R.icon('plus')}New booking</button>` : ''}</div></div>
        <div class="tbl"><table><thead><tr><th>Guest</th><th>Room</th><th>Stay</th><th>Status</th><th class="right">Value · balance</th></tr></thead>
        <tbody>${L.slice(0, 150).map(r => { const b = r.status === 'booked' || r.status === 'inhouse' ? R.expectedBalance(r) : R.balance(r); return R.resRow(r, `<span class="num">${R.money(R.stayValue(r))}</span><div class="small ${b > 0 ? '' : 'muted'}">${b > 0 ? R.money(b) + ' due' : 'Paid'}</div>`); }).join('') || '<tr><td colspan="5" class="empty">No bookings match. Clear the filters or make a new booking.</td></tr>'}</tbody></table></div></div>`;
    },
    mount(el) {
      const s = el.querySelector('#rsSearch');
      if (s) s.addEventListener('input', () => { rsQ = s.value; const p = s.selectionStart; R.render(); const n = document.getElementById('rsSearch'); n.focus(); n.setSelectionRange(p, p); });
    }
  };

  // ---------- quick price quote to paste into Messenger / SMS ----------
  R.act.quoteMsg = () => {
    R.modal('Quote for Messenger', `<div class="form">
      <label class="field">Arrival<input id="qmA" type="date" min="${bd()}" value="${avStart || bd()}"></label>
      <label class="field">Nights<input id="qmN" type="number" min="1" max="30" value="1"></label>
      <label class="field">Adults<input id="qmP" type="number" min="1" value="2"></label>
      <label class="field">Children<input id="qmC" type="number" min="0" value="0"></label>
      <label class="field full">Message<textarea id="qmT" rows="11"></textarea></label></div>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Close</button><button class="btn" id="qmCopy">Copy message</button></div>`, b => {
      const $ = s => b.querySelector(s);
      const upd = () => {
        const a = $('#qmA').value, n = Math.max(1, +$('#qmN').value || 1), ppl = (+$('#qmP').value || 0) + (+$('#qmC').value || 0);
        const opts = R.S.roomTypes.filter(t => R.typeAvail(t.id, a, n) > 0).map(t => {
          const rooms = Math.ceil(ppl / t.cap), left = R.typeAvail(t.id, a, n), tot = R.quote(t.id, a, n).reduce((x, y) => x + y, 0) * rooms;
          return rooms <= left ? `• ${rooms > 1 ? rooms + ' × ' : ''}${t.name} (sleeps ${t.cap}, ${t.bed}): ₱${tot.toLocaleString('en-PH')} for ${n} night${n > 1 ? 's' : ''}` : '';
        }).filter(Boolean);
        $('#qmT').value = `Hi! Thank you for your inquiry at Camsair Resort.\n\nFor ${R.fmt(a)} to ${R.fmt(addDays(a, n))} (${n} night${n > 1 ? 's' : ''}), ${ppl} guest${ppl > 1 ? 's' : ''}, we have:\n${opts.join('\n') || '• Sorry, we are fully booked for these dates. Can we offer you other dates?'}\n\nPrices include VAT. Senior citizens and PWDs get 20% off their share with a valid ID.\nTo confirm, please send a ${R.S.rules.deposit}% deposit by GCash and the screenshot here. ${R.S.rules.cancellation}\nCheck-in ${R.S.rules.checkin}, check-out ${R.S.rules.checkout}.\n\nSee you at Camsair!`;
      };
      b.querySelectorAll('input').forEach(i => i.addEventListener('input', upd)); upd();
      $('#qmCopy').onclick = () => R.copy($('#qmT').value);
    });
  };

  // ---------- group booking ----------
  R.act.newGroup = () => {
    if (!R.need('book')) return;
    R.modal('Group booking', `<div class="form">
      <label class="field">Group name<input id="ggN" placeholder="e.g. Santos family reunion" autofocus></label>
      <label class="field">Company (optional)<input id="ggCo" placeholder="For company outings"></label>
      <label class="field full">Group leader<input id="ggLead" list="ggGuests" placeholder="Type a name: returning guests appear in the list" autocomplete="off">
        <datalist id="ggGuests">${R.S.guests.map(g => `<option value="${esc(g.name)} — ${g.id}">${esc(g.phone)}</option>`).join('')}</datalist></label>
      <label class="field" id="ggPhW">Leader's mobile (new guest)<input id="ggPh" placeholder="+63 9xx xxx xxxx"></label>
      <label class="field">Booked through<select id="ggCh">${R.S.sources.map(c => `<option>${c.name}</option>`).join('')}</select></label>
      <label class="field">Arrival<input id="ggA" type="date" min="${bd()}" value="${addDays(bd(), 7)}"></label>
      <label class="field">Nights<input id="ggNt" type="number" min="1" max="30" value="2"></label>
      <div class="full"><span class="field">Rooms</span><div id="ggRooms" class="grp-rooms"></div></div>
      <label class="field">Bill<select id="ggBill"><option value="master">One bill: the leader pays for all rooms</option><option value="individual">Separate bills: each room pays its own</option></select></label>
      <label class="field">Deposit received<select id="ggDep"><option value="">Not yet</option>${['GCash', 'Cash', 'Bank transfer', 'Card'].map(m => `<option>${m}</option>`).join('')}</select></label>
      <label class="field">Deposit reference<input id="ggRef" placeholder="GCash / bank reference"></label>
      <label class="field">Notes<input id="ggNo" placeholder="e.g. lechon from outside, early check-in"></label>
      <div class="full" id="ggSum"></div></div>
      <p class="small warn-text" id="ggErr" style="min-height:1.4em;margin-top:6px"></p>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="ggGo">Create group</button></div>`, b => {
      const $ = s => b.querySelector(s);
      const counts = {};
      const lead = () => { const m = $('#ggLead').value.match(/ — (G\d+)$/); return m ? R.findGuest(m[1]) : null; };
      const draw = () => {
        const a = $('#ggA').value, n = Math.max(1, +$('#ggNt').value || 1);
        $('#ggPhW').style.display = lead() ? 'none' : '';
        $('#ggRooms').innerHTML = R.S.roomTypes.map(t => { const left = R.typeAvail(t.id, a, n); counts[t.id] = Math.min(counts[t.id] || 0, left); return `<div class="mini-step"><span style="min-width:150px">${esc(t.name)} <small class="muted">${left} free · sleeps ${t.cap}</small></span><button class="btn sm ghost" data-gg="${t.id}" data-n="-1" ${counts[t.id] ? '' : 'disabled'} aria-label="One less ${esc(t.name)}">−</button><b>${counts[t.id]}</b><button class="btn sm ghost" data-gg="${t.id}" data-n="1" ${counts[t.id] < left ? '' : 'disabled'} aria-label="One more ${esc(t.name)}">+</button></div>`; }).join('');
        const rooms = Object.values(counts).reduce((x, y) => x + y, 0);
        const tot = R.S.roomTypes.reduce((s, t) => s + (counts[t.id] || 0) * R.quote(t.id, a, n).reduce((x, y) => x + y, 0), 0);
        $('#ggSum').innerHTML = `<div class="note">${rooms} room${rooms === 1 ? '' : 's'} · ${R.fmt(a)} → ${R.fmt(addDays(a, n))} · <b>${R.money(tot)}</b> total · ${R.S.rules.deposit}% deposit ${R.money(tot * R.S.rules.deposit / 100)}</div>`;
        return { a, n, rooms, tot };
      };
      b.addEventListener('click', e => { const x = e.target.closest('[data-gg]'); if (x) { counts[x.dataset.gg] = (counts[x.dataset.gg] || 0) + +x.dataset.n; draw(); } });
      b.querySelectorAll('input,select').forEach(i => i.addEventListener('input', draw)); draw();
      $('#ggGo').onclick = () => {
        const q = draw(), err = m => { $('#ggErr').textContent = m; };
        const name = $('#ggN').value.trim();
        let g = lead();
        if (name.length < 3) return err('Enter the group name.');
        if (!g && $('#ggLead').value.trim().length < 3) return err('Enter the group leader.');
        if (!g && $('#ggPh').value.trim().length < 7) return err("Enter the leader's mobile number.");
        if (q.rooms < 2) return err('A group needs at least 2 rooms. Use New booking for one room.');
        if ($('#ggDep').value && $('#ggDep').value !== 'Cash' && $('#ggRef').value.trim().length < 4) return err('Enter the deposit reference number.');
        if (!g) { g = { id: R.nextId('G'), name: $('#ggLead').value.trim(), email: '', phone: $('#ggPh').value.trim(), town: '', tag: '', stays: 0, nationality: 'Filipino', idType: '', idNo: '', prefs: '' }; R.S.guests.unshift(g); }
        const grp = { id: R.nextId('GR'), name, contactId: g.id, company: $('#ggCo').value.trim(), billing: $('#ggBill').value, master: '', created: bd(), notes: $('#ggNo').value.trim() };
        R.S.groups.push(grp);
        R.S.roomTypes.forEach(t => {
          for (let i = 0; i < (counts[t.id] || 0); i++) {
            const room = (R.freeRooms(t.id, q.a, q.n)[0] || {}).no || null;
            const r = { id: 'CR-' + (++R.S.seq), guestId: g.id, type: t.id, room, arrive: q.a, nights: q.n, rates: R.quote(t.id, q.a, q.n), adults: Math.min(2, t.cap), children: 0, channel: $('#ggCh').value, status: 'booked', notes: 'Group: ' + name, folio: [], payments: [], reg: null, eta: '14:00', created: bd(), group: grp.id };
            R.S.reservations.push(r);
            if (!grp.master) grp.master = r.id;
          }
        });
        R.log('Group created', `${name}: ${q.rooms} rooms, ${R.money(q.tot)}`, grp.master);
        if ($('#ggDep').value) R.addPayment(R.res(grp.master), Math.round(q.tot * R.S.rules.deposit / 100), $('#ggDep').value, $('#ggRef').value.trim(), R.S.user, 'Group deposit');
        R.closeModal(); R.rerender(); R.go('group', grp.id);
        R.toast(`Group created with ${q.rooms} rooms`);
      };
    });
  };
  R.act.groupCheckIn = d => {
    const ids = R.S.reservations.filter(r => r.group === d.id && canCheckIn(r)[0]).map(r => r.id);
    if (!ids.length) return R.toast('No rooms are ready to check in yet', 'warn');
    R.act.checkIn({ ids: ids.join(',') });
  };
  R.act.groupToMaster = d => {
    const g = R.group(d.id), m = R.res(g.master);
    if (!R.need('pay')) return;
    const moved = R.S.reservations.filter(r => r.group === g.id && r.id !== m.id && R.balance(r) > 0).reduce((s, r) => s + R.moveToMaster(r, m), 0);
    R.rerender(); R.toast(moved ? `${R.peso(moved)} moved to the master bill` : 'Nothing to move');
  };
  R.views.group = {
    title: () => R.group(R.param).name,
    hint: '',
    render() {
      const g = R.group(R.param), rs = R.S.reservations.filter(r => r.group === g.id), m = R.res(g.master), lead = R.guest(g.contactId);
      const open = rs.filter(r => r.status === 'booked' || r.status === 'inhouse');
      const due = rs.reduce((s, r) => s + Math.max(0, open.includes(r) ? R.expectedBalance(r) : R.balance(r)), 0);
      const ready = rs.filter(r => canCheckIn(r)[0]).length;
      const act = r => r.status === 'booked' ? (canCheckIn(r)[0] ? `<button class="btn sm" data-act="checkIn" data-id="${r.id}">Check in</button>` : `<span class="small muted">${esc(canCheckIn(r)[1])}</span>`)
        : r.status === 'inhouse' ? `<button class="btn sm ghost" data-act="checkOut" data-id="${r.id}">Check out</button>` : '';
      return `<div class="bk-head"><a class="btn ghost sm" href="#reservations">${R.icon('back')}Reservations</a><span class="row"><span class="chip teal">Group</span>${g.company ? `<span class="chip">${esc(g.company)}</span>` : ''}</span>
          <div class="sp row">${R.can('book') ? `<button class="btn ghost sm" data-act="msgGuest" data-id="${m.id}">Message leader</button>` : ''}${ready && R.can('checkin') ? `<button class="btn sm" data-act="groupCheckIn" data-id="${g.id}">Check in ${ready} ready room${ready > 1 ? 's' : ''}</button>` : ''}</div></div>
        <div class="pulse pulse5"><div><b>${rs.filter(r => r.status !== 'cancelled').length}</b><span>Rooms</span></div><div><b>${R.fmtShort(rs[0].arrive)} → ${R.fmtShort(R.dep(rs[0]))}</b><span>${rs[0].nights} night(s)</span></div>
          <div><b>${R.money(rs.reduce((s, r) => s + R.stayValue(r), 0))}</b><span>Room charges</span></div><div><b>${R.money(rs.reduce((s, r) => s + R.paid(r), 0))}</b><span>Paid</span></div><div><b class="${due > 0 ? 'warn-text' : ''}">${R.money(due)}</b><span>Due by check-out</span></div></div>
        <div class="grid g-side"><div class="panel"><h2>Rooms</h2><div class="tbl"><table><tbody>${rs.map(r => R.resRow(r, act(r))).join('')}</tbody></table></div></div>
          <div class="panel"><h2>Group</h2><dl class="kv"><dt>Leader</dt><dd>${R.screens().includes('guests') ? `<a href="#guest/${lead.id}">${esc(lead.name)}</a>` : esc(lead.name)} · ${esc(lead.phone)}</dd>
            <dt>Bill</dt><dd>${g.billing === 'master' ? `One bill, on <a href="#booking/${m.id}">${m.id}</a> (room ${m.room || '—'})` : 'Separate bills per room'}</dd>
            <dt>Booked</dt><dd>${R.fmtShort(g.created)}</dd>${g.notes ? `<dt>Notes</dt><dd>${esc(g.notes)}</dd>` : ''}</dl>
            ${g.billing === 'master' ? `<p class="small muted" style="margin-top:10px">When a room checks out, its charges move to the master bill automatically. The leader settles everything at the end.</p>
              <div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="groupToMaster" data-id="${g.id}">Move all charges to master bill now</button><a class="btn sm" href="#booking/${m.id}">Open master bill</a></div>` : ''}</div></div>`;
    }
  };

  // ---------- arrivals list: today or tomorrow, grouped by time, printable for housekeeping, kitchen and gate ----------
  let arrDay = 'today', arrF = 'all';
  const ready = r => {
    if (r.status === 'inhouse') return ['done', '✓', 'Checked in'];
    if (!r.room) return ['bad', '!', 'No room assigned'];
    const room = R.room(r.room);
    if (room.ooo) return ['bad', '!', 'Out of order'];
    if (room.hk === 'dirty') return ['warn', '!', 'Needs cleaning'];
    if (room.hk === 'clean') return ['mid', '•', 'Clean, not inspected'];
    return ['ok', '✓', 'Ready'];
  };
  const slot = t => t < '12:00' ? 'Morning' : t < '17:00' ? 'Afternoon' : 'Evening';
  R.act.arrDay = d => { arrDay = d.v; R.act.prepList(); };
  R.act.arrF = d => { arrF = d.v; R.act.prepList(); };
  R.act.arrOpen = d => { R.closeModal(); d.kind === 'ev' ? R.act.openEvent({ id: d.id }) : R.go('booking', d.id); };
  R.act.prepList = () => {
    const day = arrDay === 'tomorrow' ? addDays(bd(), 1) : bd();
    const rooms = R.S.reservations.filter(r => r.arrive === day && (r.status === 'booked' || r.status === 'inhouse'));
    const cots = R.S.venueBookings.filter(v => v.date === day && (v.status === 'booked' || v.status === 'arrived'));
    const notReady = rooms.filter(r => ['bad', 'warn'].includes(ready(r)[0])).length;
    const guests = rooms.reduce((s, r) => s + r.adults + r.children, 0), cotGuests = cots.reduce((s, v) => s + v.pax, 0);
    const collect = rooms.filter(r => r.status === 'booked').reduce((s, r) => s + Math.max(0, R.expectedBalance(r)), 0) + cots.filter(v => v.status === 'booked').reduce((s, v) => s + Math.max(0, v.price - R.vPaid(v)), 0);
    // one list, rooms and cottage groups together, in arrival order
    let L = rooms.map(r => ({ kind: 'room', t: r.eta, r })).concat(cots.map(v => ({ kind: 'ev', t: v.eta, v })));
    if (arrF === 'pending') L = L.filter(x => x.kind === 'room' ? x.r.status === 'booked' : x.v.status === 'booked');
    if (arrF === 'rooms') L = L.filter(x => x.kind === 'room');
    if (arrF === 'cottages') L = L.filter(x => x.kind === 'ev');
    L.sort((a, b) => a.t.localeCompare(b.t) || (a.kind === 'room' ? R.guest(a.r.guestId).name : a.v.name).localeCompare(b.kind === 'room' ? R.guest(b.r.guestId).name : b.v.name));
    const canIn = R.can('checkin');
    const row = x => {
      if (x.kind === 'room') {
        const r = x.r, g = R.guest(r.guestId), t = R.type(r.type), [cls, ico, lbl] = ready(r), due = Math.max(0, R.expectedBalance(r));
        const tags = [g.tag, r.group ? R.group(r.group).name : '', r.channel === 'Walk-in' ? '' : r.channel].filter(Boolean);
        const notes = [g.prefs, r.notes && !r.notes.startsWith('Group:') ? r.notes : ''].filter(Boolean).join(' · ');
        const action = r.status === 'inhouse' ? '' : canIn && R.canCheckIn(r)[0] ? `<button class="btn sm" data-act="checkIn" data-id="${r.id}">Check in</button>` : `<button class="btn sm ghost" data-act="arrOpen" data-id="${r.id}" aria-label="Open booking of ${esc(g.name)}">Open</button>`;
        return `<li class="arr-row ${r.status === 'inhouse' ? 'is-done' : ''}">
          <span class="arr-tick print-only" aria-hidden="true"></span>
          <div class="arr-time"><b class="num">${esc(r.eta)}</b><small>ETA</small></div>
          <div class="arr-main"><div class="arr-name"><b>${esc(g.name)}</b>${tags.map(x => `<span class="chip ${x === 'VIP' ? 'red' : x === g.tag ? 'amber' : ''}">${esc(x)}</span>`).join('')}</div>
            <div class="arr-meta">${esc(t.name)} · ${r.nights} night${r.nights > 1 ? 's' : ''} · ${r.adults} adult${r.adults > 1 ? 's' : ''}${r.children ? `, ${r.children} child${r.children > 1 ? 'ren' : ''}` : ''}</div>
            ${notes ? `<div class="arr-note">${R.icon('alert')}<span>${esc(notes)}</span></div>` : ''}</div>
          <div class="arr-room"><b class="num">${r.room || '—'}</b><span class="rdy ${cls}"><i aria-hidden="true">${ico}</i>${lbl}</span></div>
          <div class="arr-money num">${r.status === 'inhouse' ? '<span class="muted">—</span>' : due > 0 ? `<b>${R.money(due)}</b><small>to collect</small>` : '<span class="paid">Paid</span>'}</div>
          <div class="arr-act no-print">${action}</div></li>`;
      }
      const v = x.v, c = R.venue(v.venue), bal = Math.max(0, v.price - R.vPaid(v));
      const notes = [v.catering ? `${v.catering.name} × ${v.pax}` : '', v.notes, v.overNote ? 'Over capacity: ' + v.overNote : ''].filter(Boolean).join(' · ');
      return `<li class="arr-row arr-cot ${v.status === 'arrived' ? 'is-done' : ''}">
        <span class="arr-tick print-only" aria-hidden="true"></span>
        <div class="arr-time"><b class="num">${esc(v.eta)}</b><small>ETA</small></div>
        <div class="arr-main"><div class="arr-name"><b>${esc(v.name)}</b><span class="chip teal">${v.session === 'day' ? 'Day tour' : 'Night swim'}</span>${v.resId ? '<span class="chip ink">Room guest</span>' : ''}</div>
          <div class="arr-meta">${v.pax} guests · ${esc(v.phone)}</div>
          ${notes ? `<div class="arr-note">${R.icon('alert')}<span>${esc(notes)}</span></div>` : ''}</div>
        <div class="arr-room"><b>${esc(c.name.replace('Family cottage', 'Family'))}</b><span class="rdy ${v.status === 'arrived' ? 'done' : 'resv'}"><i aria-hidden="true">${v.status === 'arrived' ? '✓' : '⌂'}</i>${v.status === 'arrived' ? 'Arrived' : 'Reserved'}</span></div>
        <div class="arr-money num">${v.status === 'arrived' ? '<span class="muted">—</span>' : bal > 0 ? `<b>${R.money(bal)}</b><small>+ entrance</small>` : '<span class="paid">Paid</span>'}</div>
        <div class="arr-act no-print"><button class="btn sm ghost" data-act="arrOpen" data-kind="ev" data-id="${v.id}" aria-label="Open reservation of ${esc(v.name)}">Open</button></div></li>`;
    };
    const groups = ['Morning', 'Afternoon', 'Evening'].map(s => [s, L.filter(x => slot(x.t) === s)]).filter(([, l]) => l.length);
    const seg = (act, cur, opts) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}" data-act="${act}" data-v="${v}"><b>${l}</b></button>`).join('')}</div>`;
    const empty = !rooms.length && !cots.length
      ? `<div class="arr-empty"><b>No arrivals ${arrDay === 'tomorrow' ? 'tomorrow' : 'today'}</b><p class="muted">Nobody is due to check in or arrive for a cottage.</p>${R.can('book') && arrDay === 'today' ? '<button class="btn sm" data-act="newBooking" data-ch="Walk-in">Book a walk-in room</button>' : ''}</div>`
      : !L.length ? `<div class="arr-empty"><b>Nothing in this view</b><p class="muted">Everyone here has already arrived, or the filter hides them.</p><button class="btn sm ghost" data-act="arrF" data-v="all">Show all</button></div>` : '';
    R.modal('Arrivals', `<div class="arr-sheet">
      <div class="arr-head"><div><h3>${R.fmt(day)}</h3><p class="small muted">Camsair Resort · arrivals list for front desk, housekeeping, kitchen and gate · printed ${R.now()}</p></div>
        <div class="row no-print">${seg('arrDay', arrDay, [['today', 'Today'], ['tomorrow', 'Tomorrow']])}</div></div>
      <div class="arr-sum">
        <div><b>${rooms.length}</b><span>room${rooms.length === 1 ? '' : 's'} · ${guests} guest${guests === 1 ? '' : 's'}</span></div>
        <div class="${notReady ? 'warn' : ''}"><b>${notReady}</b><span>${notReady === 1 ? 'room' : 'rooms'} not ready</span></div>
        <div><b>${cots.length}</b><span>cottage group${cots.length === 1 ? '' : 's'} · ${cotGuests} guests</span></div>
        <div><b>${R.money(collect)}</b><span>to collect on arrival</span></div></div>
      <div class="row no-print" style="margin:4px 0 6px">${seg('arrF', arrF, [['all', 'All'], ['pending', 'Not arrived yet'], ['rooms', 'Rooms'], ['cottages', 'Cottages']])}</div>
      ${empty || groups.map(([s, l]) => `<section class="arr-group"><h4>${s} <span>${l.length}</span></h4><ul class="arr-list">${l.map(row).join('')}</ul></section>`).join('')}
      <p class="arr-foot print-only">Tick each arrival when the room is ready and the guest is welcomed. Return this sheet to the front desk.</p></div>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Close</button><button class="btn" data-act="printDoc">${R.icon('print')}Print</button></div>`, null, { wide: true });
  };

  // ---------- Booking page ----------
  let bkTab = 'stay', bkId = '';
  R.act.bkTab = d => { bkTab = d.tab; R.render(); };
  R.views.booking = {
    title: () => R.guest(R.res(R.param).guestId).name,
    hint: '',
    render() {
      const r = R.res(R.param), g = R.guest(r.guestId), t = R.type(r.type), day = bd();
      if (bkId !== r.id) { bkId = r.id; bkTab = 'stay'; }
      const [ci, why] = canCheckIn(r);
      const open = r.status === 'booked' || r.status === 'inhouse';
      const expected = open ? R.expectedBalance(r) : R.balance(r);
      const main = [];
      if (r.status === 'booked') main.push(ci ? `<button class="btn" data-act="checkIn" data-id="${r.id}">Check in</button>` : `<span class="small muted">${esc(why)}</span>`);
      if (r.status === 'inhouse') main.push(`<button class="btn" data-act="checkOut" data-id="${r.id}">Check out</button>`);
      const posted = R.lines(r).filter(f => f.kind === 'night').length;

      const stay = `<div class="grid g2">
        <div class="panel"><div class="ph"><h2>Stay</h2><div class="sp">${r.status === 'booked' ? `<button class="btn sm ghost" data-act="editDates" data-id="${r.id}">Change dates</button>` : ''}</div></div>
          <dl class="kv"><dt>Dates</dt><dd>${R.fmt(r.arrive)} → ${R.fmt(R.dep(r))} · ${r.nights} night${r.nights > 1 ? 's' : ''}</dd>
          <dt>Room type</dt><dd>${esc(t.name)} · ${t.size} · sleeps ${t.cap}</dd>
          <dt>Room</dt><dd>${r.status === 'booked' && R.can('book') ? `<select data-change="assignRoom" data-id="${r.id}" aria-label="Assign room"><option value="">Not assigned</option>${(r.room ? [R.room(r.room)] : []).concat(R.freeRooms(r.type, r.arrive, r.nights, r.id).filter(x => x.no !== r.room)).map(x => `<option value="${x.no}" ${x.no === r.room ? 'selected' : ''}>${x.no} · ${R.roomState(x).label}</option>`).join('')}</select>` : (r.room || '—')}
            ${open && r.room ? ` <button class="btn sm ghost" data-act="moveRoom" data-id="${r.id}">Move</button>` : ''}</dd>
          <dt>Guests</dt><dd>${r.adults} adults, ${r.children} children</dd>
          ${r.group ? `<dt>Group</dt><dd><a href="#group/${r.group}">${esc(R.group(r.group).name)}</a> · ${R.group(r.group).billing === 'master' ? (R.group(r.group).master === r.id ? 'master bill (pays for the group)' : 'charges go to the master bill') : 'each room pays its own bill'}</dd>` : ''}
          <dt>Booked through</dt><dd>${esc(r.channel)}${R.sourceFee(r.channel) ? ` · ${R.sourceFee(r.channel)}% commission` : ''} · on ${R.fmtShort(r.created)}</dd>
          <dt>Arriving</dt><dd>around ${r.eta}</dd>
          ${r.notes ? `<dt>Notes</dt><dd>${esc(r.notes)}</dd>` : ''}
          ${R.S.venueBookings.filter(v => v.resId === r.id && v.status !== 'cancelled').map(v => `<dt>Cottage</dt><dd><a href="#" data-act="openEvent" data-id="${v.id}">${esc(R.venue(v.venue).name)}</a>, ${R.fmtShort(v.date)} ${v.session === 'day' ? 'day' : 'night'} · ${v.status === 'arrived' ? 'used' : v.status === 'noshow' ? 'no-show' : 'reserved'}</dd>`).join('')}
          ${r.cancel ? `<dt>Cancelled</dt><dd>${R.fmtShort(r.cancel.date)} · ${esc(r.cancel.reason)}</dd>` : ''}</dl>
          ${open ? `<div class="row" style="margin-top:12px">${r.status === 'booked' ? `<button class="btn sm ghost warn-text" data-act="cancelRes" data-id="${r.id}">Cancel booking</button>${r.arrive < day ? `<button class="btn sm ghost" data-act="noShow" data-id="${r.id}">No-show</button>` : ''}` : ''}</div>` : ''}</div>
        <div class="stack">
          <div class="panel"><div class="ph"><h2>Guest</h2><div class="sp">${R.screens().includes('guests') ? `<a class="btn sm ghost" href="#guest/${g.id}">Profile</a>` : ''}</div></div><dl class="kv"><dt>Name</dt><dd>${esc(g.name)} ${g.tag ? `<span class="chip amber">${esc(g.tag)}</span>` : ''}</dd><dt>Mobile</dt><dd>${esc(g.phone)}</dd><dt>Email</dt><dd>${esc(g.email) || '—'}</dd><dt>From</dt><dd>${esc(g.town) || '—'}</dd>
            <dt>Stays</dt><dd>${R.S.reservations.filter(x => x.guestId === g.id && x.status === 'checkedout').length} past stay(s)</dd>
            ${g.prefs ? `<dt>Guest notes</dt><dd>${esc(g.prefs)}</dd>` : ''}
            <dt>Registration</dt><dd>${r.reg ? `${esc(r.reg.idType)} · ${esc(r.reg.idNo.replace(/.(?=.{3})/g, '•'))} · signed` : '<span class="muted">Filled in at check-in</span>'}</dd></dl></div>
          <div class="panel"><div class="ph"><h2>Nightly rates</h2><div class="sp">${open && posted < r.nights ? `<button class="btn sm ghost" data-act="changeRate" data-id="${r.id}">Change rate</button>` : ''}</div></div>
            ${r.rates.map((x, i) => { const dt = addDays(r.arrive, i), s = R.seasonOn(dt); return `<div class="ticket-line small"><span>${R.fmt(dt)}${s ? ` <span class="chip">${esc(s.name)}</span>` : ''}</span><span>${i < posted ? '<span class="muted">posted</span> ' : ''}<b class="num">${R.money(x)}</b></span></div>`; }).join('')}</div>
        </div></div>`;

      const bill = `<div class="panel"><div class="ph"><h2>Bill</h2><div class="sp">${r.status === 'inhouse' ? `<button class="btn sm" data-act="addCharge" data-id="${r.id}">${R.icon('plus')}Add charge</button>` : ''}<button class="btn sm ghost" data-act="printStatement" data-id="${r.id}">${R.icon('print')}Statement</button></div></div>
        <div class="tbl"><table><thead><tr><th>Date</th><th>Description</th><th>Department</th><th class="right">Amount</th><th></th></tr></thead><tbody>
        ${r.folio.map(f => `<tr class="${f.void ? 'voided' : ''}"><td class="small">${R.fmtShort(f.date)}</td><td>${esc(f.desc)}${f.void ? `<div class="small warn-text">Voided by ${esc(R.staff(f.void.by).name)}: ${esc(f.void.reason)}</div>` : ''}</td><td class="small muted">${esc(f.dept)}</td><td class="right num">${R.peso(f.amount)}</td>
          <td class="right nowrap">${!f.void && r.status === 'inhouse' ? `<button class="btn sm ghost" data-act="transferLine" data-id="${r.id}" data-line="${f.id}">Move</button> <button class="btn sm ghost" data-act="voidLine" data-id="${r.id}" data-line="${f.id}">Void</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No charges yet. Room nights are posted each night by the night audit.</td></tr>'}
        </tbody></table></div>
        <div class="totals"><div class="ticket-line"><span>Charges</span><b class="num">${R.peso(R.total(r))}</b></div><div class="ticket-line"><span>Payments</span><b class="num">${R.peso(-R.paid(r))}</b></div>
          <div class="ticket-line total"><b>Balance now</b><b class="num">${R.peso(R.balance(r))}</b></div>
          ${open && expected !== R.balance(r) ? `<p class="small muted">Including nights not posted yet: ${R.peso(expected)} by check-out.</p>` : ''}</div></div>`;

      const pays = `<div class="panel"><div class="ph"><h2>Payments</h2><div class="sp">${R.balance(r) > 0 || (open && expected > 0) ? `<button class="btn sm" data-act="takePay" data-id="${r.id}">Take payment</button>` : ''}${R.paid(r) > 0 ? `<button class="btn sm ghost" data-act="refund" data-id="${r.id}">Refund</button>` : ''}</div></div>
        <div class="tbl"><table><thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th>Reference</th><th>Taken by</th><th class="right">Amount</th></tr></thead><tbody>
        ${r.payments.map(p => `<tr><td class="small">${R.fmtShort(p.date)} ${p.at}</td><td>${p.or || '<span class="chip red">Refund</span>'}</td><td>${esc(p.method)}${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}</td><td class="small muted">${esc(p.ref) || '—'}</td><td class="small">${esc(R.staff(p.by).name)}</td><td class="right num"><b>${R.peso(p.amount)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No payments yet</td></tr>'}
        </tbody></table></div></div>`;

      const hist = R.S.audit.filter(a => a.ref === r.id);
      const history = `<div class="panel"><h2>History</h2>${hist.map(a => `<div class="list-item"><span class="small muted num nowrap">${R.fmtShort(a.date)} ${a.at}</span><div class="grow small"><b>${esc(a.action)}</b> ${esc(a.detail)}</div><span class="small muted">${esc(R.staff(a.user).name)}</span></div>`).join('') || '<p class="empty">Changes made in this demo appear here: who did what, and when.</p>'}</div>`;

      return `<div class="bk-head"><a class="btn ghost sm" href="#reservations">${R.icon('back')}Reservations</a>
          <span class="row">${R.chip(r.status)}<span class="chip">${r.id}</span>${g.tag ? `<span class="chip amber">${esc(g.tag)}</span>` : ''}</span><div class="sp row">${R.can('till') && r.status === 'inhouse' ? `<button class="btn ghost sm" data-act="useCottage" data-id="${r.id}">Use a cottage</button>` : ''}${R.can('till') && open ? `<button class="btn ghost sm" data-act="newEvent" data-res="${r.id}">Reserve a cottage</button>` : ''}${R.can('book') ? `<button class="btn ghost sm" data-act="msgGuest" data-id="${r.id}">Message guest</button>` : ''}${main.join('')}</div></div>
        <div class="pulse pulse5">
          <div><b>${R.fmtShort(r.arrive)} → ${R.fmtShort(R.dep(r))}</b><span>${r.nights} night${r.nights > 1 ? 's' : ''}</span></div>
          <div><b>${r.room || '—'}</b><span>${esc(t.name)}</span></div>
          <div><b>${R.money(R.stayValue(r))}</b><span>Room charges</span></div>
          <div><b>${R.money(R.paid(r))}</b><span>Paid</span></div>
          <div><b class="${expected > 0 ? 'warn-text' : ''}">${R.money(expected)}</b><span>${open ? 'Due by check-out' : 'Balance'}</span></div></div>
        <div class="tabs">${[['stay', 'Stay'], ['bill', `Bill (${R.lines(r).length})`], ['pay', `Payments (${r.payments.length})`], ['hist', 'History']].map(([k, l]) => `<button class="${bkTab === k ? 'on' : ''}" aria-pressed="${bkTab === k}" data-act="bkTab" data-tab="${k}">${l}</button>`).join('')}</div>
        ${bkTab === 'stay' ? stay : bkTab === 'bill' ? bill : bkTab === 'pay' ? pays : history}`;
    }
  };
  R.act.printStatement = d => R.statement(R.res(d.id));

  // ---------- Room calendar ----------
  let calStart = null;
  R.act.calShift = d => { calStart = d.n === '0' ? addDays(bd(), -2) : addDays(calStart, +d.n); R.render(); };
  R.act.calNew = d => R.newBooking({ room: d.room, type: R.room(d.room).type, date: d.date });
  R.views.calendar = {
    title: 'Room calendar',
    hint: 'Every room, every night. Click a bar to open the booking, or an empty future night to book that room.',
    render() {
      if (!calStart) calStart = addDays(bd(), -2);
      const days = 16, W = 62, day = bd(), canBookAny = R.can('book');
      const dates = Array.from({ length: days }, (_, i) => addDays(calStart, i));
      const end = addDays(calStart, days);
      let rows = '';
      R.S.zones.filter(z => z.kind !== 'feature').forEach(z => {
        rows += `<tr class="zone-row"><td class="rn">${esc(z.name)}</td><td colspan="${days}"></td></tr>`;
        R.S.rooms.filter(r => r.zone === z.id).forEach(room => {
          const rs = R.live().filter(r => r.room === room.no && r.arrive < end && R.dep(r) > calStart);
          const st = R.roomState(room);
          rows += `<tr><td class="rn"><button class="linkish" data-act="openRoom" data-no="${room.no}">${room.no}</button><small>${esc(R.type(room.type).name)}</small> <span class="chip ${st.cls === 'ooo' ? 'red' : st.cls === 'dirty' ? 'amber' : ''}" title="${esc(st.label)}">${st.code}</span></td>`;
          dates.forEach(dt => {
            const r = rs.find(x => x.arrive === dt || (x.arrive < calStart && dt === calStart));
            let bar = '';
            if (r) {
              const s = r.arrive < calStart ? calStart : r.arrive;
              const n = Math.min(daysBetween(s, R.dep(r)), daysBetween(s, end));
              bar = `<button class="bar ${r.status}" style="width:${n * W - 4}px" data-act="openRes" data-id="${r.id}" title="${esc(R.guest(r.guestId).name)}, ${R.chipLabel(r.status)}">${esc(R.guest(r.guestId).name)}</button>`;
            } else if (room.ooo && dt === (calStart > day ? calStart : day) && dt < room.ooo.until && dt >= day) {
              bar = `<a class="bar ooo" style="width:${Math.min(daysBetween(dt, room.ooo.until), daysBetween(dt, end)) * W - 4}px" href="#tasks">Out of order</a>`;
            }
            const busy = rs.some(x => x.arrive <= dt && dt < R.dep(x));
            const canBook = canBookAny && !busy && dt >= day && !R.oooOn(room, dt, 1);
            rows += `<td class="cell ${dt === day ? 'today-col' : ''}" ${canBook ? `data-act="calNew" data-room="${room.no}" data-date="${dt}" title="Book ${room.no} from ${R.fmtShort(dt)}" style="cursor:copy"` : ''}>${bar}</td>`;
          });
          rows += '</tr>';
        });
      });
      return `<div class="row" style="margin-bottom:10px"><button class="btn ghost sm" data-act="calShift" data-n="-7">← Week</button><button class="btn ghost sm" data-act="calShift" data-n="0">Today</button><button class="btn ghost sm" data-act="calShift" data-n="7">Week →</button>
        <span class="legend" style="margin:0 0 0 12px"><span><i style="background:var(--ink);border-color:var(--ink)"></i>In house</span><span><i style="background:var(--sea);border-color:var(--sea)"></i>Booked</span><span><i style="background:#A89B8C;border-color:#A89B8C"></i>Checked out</span><span><i style="background:var(--hibiscus);border-color:var(--hibiscus)"></i>Out of order</span><span class="muted">Room codes: V/O = vacant/occupied, C/D/I = clean/dirty/inspected</span></span></div>
        <div class="tape"><table style="table-layout:fixed"><colgroup><col class="rn-col">${dates.map(() => `<col style="width:${W}px">`).join('')}</colgroup>
        <thead><tr><th class="rn-head">Room</th>${dates.map(d => `<th class="${d === day ? 'today-col' : ''}">${new Date(d + 'T12:00').toLocaleDateString('en-PH', { weekday: 'short' })}<br>${new Date(d + 'T12:00').getDate()}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }
  };
})();
