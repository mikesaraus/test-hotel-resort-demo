/* People: guest list and profiles (edit, merge duplicates, message templates) and the staff roster. */
(function () {
  const { addDays } = R.util;
  const esc = R.esc;
  const bd = () => R.bd();
  const TAGS = ['VIP', 'Repeat guest', 'Birthday', 'Anniversary', 'Senior citizen', 'PWD', 'Allergy: seafood', 'Late arrival', 'Do not rebook'];

  // ---------- guest facts ----------
  const staysOf = g => R.S.reservations.filter(r => r.guestId === g.id);
  const spendOf = g => staysOf(g).filter(r => r.status === 'checkedout' || r.status === 'inhouse').reduce((s, r) => s + R.total(r), 0);
  const pastStays = g => staysOf(g).filter(r => r.status === 'checkedout').length + Math.max(0, (g.stays || 0) - 1);
  const digits = p => (p || '').replace(/\D/g, '').slice(-10);
  // same name, or same mobile number = probably the same person
  R.dupsOf = g => R.S.guests.filter(x => x.id !== g.id && (x.name.trim().toLowerCase() === g.name.trim().toLowerCase() || (digits(x.phone).length >= 7 && digits(x.phone) === digits(g.phone))));
  const nowChip = g => {
    const ih = staysOf(g).find(r => r.status === 'inhouse');
    if (ih) return `<span class="chip ink">In room ${ih.room}</span>`;
    const nx = staysOf(g).filter(r => r.status === 'booked').sort((a, b) => a.arrive.localeCompare(b.arrive))[0];
    return nx ? `<span class="chip teal">Arrives ${R.fmtShort(nx.arrive)}</span>` : '';
  };

  // ---------- Guests list ----------
  let gQ = '', gF = 'all';
  R.act.gFilter = d => { gF = d.f; R.render(); };
  R.views.guests = {
    title: 'Guests',
    hint: 'Everyone who has stayed or is booked: contact details, preferences, history and spend.',
    render() {
      const q = gQ.toLowerCase(), qd = q.replace(/\D/g, '');
      const dupSet = new Set(); R.S.guests.forEach(g => { if (R.dupsOf(g).length) dupSet.add(g.id); });
      let L = R.S.guests.filter(g => !q || g.name.toLowerCase().includes(q) || (g.email || '').toLowerCase().includes(q) || (qd.length >= 3 && g.phone.replace(/\D/g, '').includes(qd)));
      if (gF === 'inhouse') L = L.filter(g => staysOf(g).some(r => r.status === 'inhouse'));
      if (gF === 'soon') L = L.filter(g => staysOf(g).some(r => r.status === 'booked' && r.arrive <= addDays(bd(), 7)));
      if (gF === 'repeat') L = L.filter(g => pastStays(g) >= 2 || g.tag === 'Repeat guest');
      if (gF === 'vip') L = L.filter(g => g.tag === 'VIP');
      if (gF === 'dups') L = L.filter(g => dupSet.has(g.id)).sort((a, b) => a.name.localeCompare(b.name));
      const F = [['all', 'All'], ['inhouse', 'In house'], ['soon', 'Arriving in 7 days'], ['repeat', 'Repeat'], ['vip', 'VIP'], ['dups', `Possible duplicates (${dupSet.size})`]];
      return `<div class="panel"><div class="ph"><input class="search" id="gSearch" placeholder="Name, mobile or email" value="${esc(gQ)}" aria-label="Search guests" style="min-width:240px">
          <div class="seg" role="group" aria-label="Filter">${F.map(([f, l]) => `<button class="${gF === f ? 'on' : ''}" aria-pressed="${gF === f}" data-act="gFilter" data-f="${f}"><b>${l}</b></button>`).join('')}</div>
          <div class="sp muted small">${L.length} guests</div></div>
        ${gF === 'dups' ? '<div class="note warn" style="margin-bottom:10px">' + R.icon('users') + '<div>These profiles share a name or a mobile number. Open one and merge the others into it so the stay history is in one place.</div></div>' : ''}
        <div class="tbl"><table><thead><tr><th>Guest</th><th>From</th><th>Notes</th><th class="right">Stays</th><th class="right">Spend</th><th>Now</th></tr></thead><tbody>
        ${L.slice(0, 150).map(g => `<tr class="click" data-act="openGuest" data-id="${g.id}"><td><div class="row"><span class="avatar sm">${R.initials(g.name)}</span><div><b>${esc(g.name)}</b>${dupSet.has(g.id) ? ' <span class="chip amber">Duplicate?</span>' : ''}<div class="small muted">${esc(g.phone)}</div></div></div></td>
          <td class="small">${esc(g.town) || '—'}</td><td>${g.tag ? `<span class="chip amber">${esc(g.tag)}</span>` : ''}${g.prefs ? `<div class="small muted ellip">${esc(g.prefs)}</div>` : ''}</td>
          <td class="right">${pastStays(g) > 1 ? `<span class="chip green">${pastStays(g)}</span>` : pastStays(g)}</td><td class="right num">${R.money(spendOf(g))}</td><td>${nowChip(g)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No guests match</td></tr>'}
        </tbody></table></div></div>`;
    },
    mount(el) { const s = el.querySelector('#gSearch'); s.addEventListener('input', () => { gQ = s.value; const p = s.selectionStart; R.render(); const n = document.getElementById('gSearch'); n.focus(); n.setSelectionRange(p, p); }); }
  };

  // ---------- Guest profile ----------
  R.act.guestNotes = (d, el) => {
    if (!R.need('book')) return R.render();
    const g = R.findGuest(d.id); g.prefs = el.value.trim();
    R.log('Guest notes', `${g.name}: ${g.prefs || '(cleared)'}`); R.rerender(); R.toast('Guest notes saved');
  };
  R.act.editGuest = d => {
    if (!R.need('book')) return;
    const g = R.findGuest(d.id);
    R.modal('Edit guest', `<div class="form">
      <label class="field full">Full name<input id="egN" value="${esc(g.name)}"></label>
      <label class="field">Mobile<input id="egP" value="${esc(g.phone)}"></label><label class="field">Email<input id="egE" type="email" value="${esc(g.email)}"></label>
      <label class="field">Town / city<input id="egT" value="${esc(g.town)}"></label><label class="field">Nationality<input id="egNa" value="${esc(g.nationality || '')}"></label>
      <label class="field">Tag<select id="egTag"><option value="">None</option>${TAGS.concat(g.tag && !TAGS.includes(g.tag) ? [g.tag] : []).map(t => `<option ${t === g.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label></div>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="egGo">Save</button></div>`, b => {
      b.querySelector('#egGo').onclick = () => {
        const v = s => b.querySelector(s).value.trim();
        if (v('#egN').length < 3) return R.toast('Enter the name', 'warn');
        Object.assign(g, { name: v('#egN'), phone: v('#egP'), email: v('#egE'), town: v('#egT'), nationality: v('#egNa'), tag: b.querySelector('#egTag').value });
        R.log('Guest edited', g.name); R.closeModal(); R.rerender(); R.toast('Saved');
      };
    });
  };
  R.act.mergeGuest = d => {
    if (!R.need('book')) return;
    const keep = R.findGuest(d.keep), drop = R.findGuest(d.drop);
    R.confirm('Merge these profiles?', `<b>${esc(drop.name)}</b> (${esc(drop.phone)}, ${staysOf(drop).length} booking(s)) will be folded into <b>${esc(keep.name)}</b>. Bookings, groups and notes move over. The other profile is removed.`, 'Merge', () => {
      R.S.reservations.forEach(r => { if (r.guestId === drop.id) r.guestId = keep.id; });
      R.S.groups.forEach(x => { if (x.contactId === drop.id) x.contactId = keep.id; });
      keep.prefs = [keep.prefs, drop.prefs].filter(Boolean).join(' · ');
      ['email', 'town', 'tag', 'idType', 'idNo'].forEach(k => { if (!keep[k] && drop[k]) keep[k] = drop[k]; });
      keep.stays = Math.max(keep.stays || 0, 0) + Math.max(0, (drop.stays || 0) - 1);
      R.S.guests = R.S.guests.filter(x => x !== drop);
      R.log('Guests merged', `${drop.name} (${drop.id}) → ${keep.name} (${keep.id})`);
      R.rerender(); R.toast('Profiles merged');
    });
  };
  R.views.guest = {
    title: () => R.findGuest(R.param).name,
    hint: '',
    render() {
      const g = R.findGuest(R.param), rs = staysOf(g).sort((a, b) => b.arrive.localeCompare(a.arrive));
      const done = rs.filter(r => r.status === 'checkedout'), nights = done.reduce((s, r) => s + r.nights, 0);
      const roomRev = done.reduce((s, r) => s + R.stayValue(r), 0);
      const src = {}; rs.forEach(r => { src[r.channel] = (src[r.channel] || 0) + 1; });
      const fav = Object.entries(src).sort((a, b) => b[1] - a[1])[0];
      const dups = R.dupsOf(g), can = R.can('book');
      const next = rs.find(r => r.status === 'booked' || r.status === 'inhouse');
      return `<div class="bk-head"><a class="btn ghost sm" href="#guests">${R.icon('back')}Guests</a><span class="row">${g.tag ? `<span class="chip amber">${esc(g.tag)}</span>` : ''}${nowChip(g)}</span>
          <div class="sp row">${can ? `<button class="btn ghost sm" data-act="editGuest" data-id="${g.id}">Edit</button>${next ? `<button class="btn ghost sm" data-act="msgGuest" data-id="${next.id}">Message guest</button>` : ''}<button class="btn sm" data-act="newBooking" data-guest="${g.id}">${R.icon('plus')}New booking</button>` : ''}</div></div>
        <div class="pulse pulse5"><div><b>${pastStays(g)}</b><span>Stays</span></div><div><b>${nights}</b><span>Nights stayed</span></div><div><b>${R.money(spendOf(g))}</b><span>Total spend</span></div>
          <div><b>${R.money(nights ? roomRev / nights : 0)}</b><span>Average room rate</span></div><div><b class="b-text">${fav ? esc(fav[0]) : '—'}</b><span>Usually books through</span></div></div>
        <div class="grid g-side"><div class="stack">
          <div class="panel"><h2>Stays</h2><div class="tbl"><table><tbody>${rs.map(r => R.resRow(r, `<span class="num small">${R.money(R.total(r) || R.stayValue(r))}</span>`)).join('') || '<tr><td class="empty">No bookings yet</td></tr>'}</tbody></table></div></div>
          ${dups.length ? `<div class="panel"><h2>Possible duplicates</h2><p class="small muted" style="margin-bottom:6px">Same name or the same mobile number.</p>${dups.map(x => `<div class="list-item"><span class="avatar sm">${R.initials(x.name)}</span><div class="grow small"><b>${esc(x.name)}</b> · ${esc(x.phone)}<div class="muted">${staysOf(x).length} booking(s) · ${esc(x.town) || '—'}</div></div><a class="btn sm ghost" href="#guest/${x.id}">Open</a>${can ? `<button class="btn sm" data-act="mergeGuest" data-keep="${g.id}" data-drop="${x.id}">Merge into this profile</button>` : ''}</div>`).join('')}</div>` : ''}
        </div><div class="stack">
          <div class="panel"><h2>Contact</h2><dl class="kv"><dt>Mobile</dt><dd>${esc(g.phone)}</dd><dt>Email</dt><dd>${esc(g.email) || '—'}</dd><dt>From</dt><dd>${esc(g.town) || '—'}</dd><dt>Nationality</dt><dd>${esc(g.nationality) || '—'}</dd>
            <dt>ID on file</dt><dd>${g.idNo ? `${esc(g.idType)} · ${esc(g.idNo.replace(/.(?=.{3})/g, '•'))}` : '<span class="muted">Taken at check-in</span>'}</dd></dl></div>
          <div class="panel"><h2>Preferences & notes</h2><p class="small muted" style="margin-bottom:6px">Shown at check-in, on the booking and on the arrivals list.</p>
            <textarea class="search" style="width:100%" rows="4" data-change="guestNotes" data-id="${g.id}" ${can ? '' : 'disabled'} placeholder="e.g. likes a ground floor room, allergic to shrimp, birthday on 12 March" aria-label="Guest notes">${esc(g.prefs)}</textarea></div>
        </div></div>`;
    }
  };
  // ---------- Message guest (templates; the real system sends them) ----------
  R.act.msgGuest = d => {
    const r = R.res(d.id), g = R.guest(r.guestId), first = g.name.split(' ')[0];
    const due = Math.max(0, R.expectedBalance(r)), dep = Math.round(R.stayValue(r) * R.S.rules.deposit / 100);
    const T = {
      confirm: ['Booking confirmation', `Hi ${first}! Your booking at Camsair Resort is confirmed.\n\nBooking no.: ${r.id}\nRoom: ${R.type(r.type).name}${r.room ? ' (room ' + r.room + ')' : ''}\nDates: ${R.fmt(r.arrive)} to ${R.fmt(R.dep(r))}, ${r.nights} night(s)\nTotal: ₱${R.stayValue(r).toLocaleString('en-PH')}${R.paid(r) ? `\nPaid: ₱${R.paid(r).toLocaleString('en-PH')}` : ''}\n\nCheck-in ${R.S.rules.checkin}, check-out ${R.S.rules.checkout}. Please bring a valid ID. See you!`],
      deposit: ['Deposit reminder', `Hi ${first}! This is Camsair Resort. To hold your ${R.type(r.type).name} for ${R.fmt(r.arrive)}, please send the ${R.S.rules.deposit}% deposit of ₱${dep.toLocaleString('en-PH')} by GCash and reply with the screenshot. Booking no. ${r.id}. Thank you!`],
      arrival: ['Before arrival', `Hi ${first}! We're looking forward to seeing you on ${R.fmt(r.arrive)}.\n\nHow to find us: Brgy. San Pedro, Initao, Misamis Oriental, along the national highway (about 1 hour from Cagayan de Oro, 1.5 hours from Iligan).\nCheck-in from ${R.S.rules.checkin}. Balance to pay on arrival: ₱${due.toLocaleString('en-PH')} (cash, GCash, Maya or card).\nOutside lechon and drinks have a corkage fee.\n\nReply here if you need anything. Safe trip!`],
      thanks: ['Thank you', `Hi ${first}! Thank you for staying at Camsair Resort. We hope you had a great time.\n\nHow was your stay? Reply with a number from 1 (poor) to 5 (excellent) and tell us anything we can do better.\n\nBook direct with us on Messenger next time for our best rate. Salamat!`]
    };
    let k = r.status === 'checkedout' ? 'thanks' : r.status === 'booked' && !R.paid(r) ? 'deposit' : r.status === 'booked' && r.arrive <= addDays(bd(), 2) ? 'arrival' : 'confirm';
    const draw = b => {
      b.querySelectorAll('[data-tpl]').forEach(x => { x.classList.toggle('on', x.dataset.tpl === k); x.setAttribute('aria-pressed', x.dataset.tpl === k); });
      b.querySelector('#mgT').value = T[k][1];
    };
    R.modal('Message ' + g.name, `<div class="seg" role="group" aria-label="Template" style="margin-bottom:10px;flex-wrap:wrap">${Object.entries(T).map(([key, [l]]) => `<button data-tpl="${key}"><b>${l}</b></button>`).join('')}</div>
      <label class="field">Message<textarea id="mgT" rows="10"></textarea></label>
      <div class="form" style="margin-top:10px"><label class="field">Send by<select id="mgC"><option>Facebook Messenger</option><option>SMS to ${esc(g.phone)}</option>${g.email ? `<option>Email to ${esc(g.email)}</option>` : ''}</select></label></div>
      <p class="small muted" style="margin-top:8px">In the real system these send automatically: confirmation on booking, deposit reminder after 24 hours, before-arrival note 2 days ahead, thank-you after check-out.</p>
      <div class="foot"><button class="btn ghost" id="mgCopy">Copy</button><button class="btn" id="mgGo">Mark as sent</button></div>`, b => {
      draw(b);
      b.addEventListener('click', e => { const x = e.target.closest('[data-tpl]'); if (x) { k = x.dataset.tpl; draw(b); } });
      b.querySelector('#mgCopy').onclick = () => R.copy(b.querySelector('#mgT').value);
      b.querySelector('#mgGo').onclick = () => { R.log('Message sent', `${T[k][0]} by ${b.querySelector('#mgC').value.split(' to ')[0]}`, r.id); R.closeModal(); R.rerender(); R.toast('Saved to the booking history'); };
    });
  };

  // ---------- Staff roster ----------
  const SHIFTS = ['06:00–14:00', '14:00–22:00', '22:00–06:00', '08:00–17:00', 'Off'];
  const NEED = { 'Front office': 'Front desk', Housekeeping: 'Housekeeping', 'Food & beverage': 'Restaurant', Maintenance: 'Maintenance' };
  let rWeek = null, rDept = '';
  const scope = () => R.roleKey() === 'hkhead' ? 'Housekeeping' : R.roleKey() === 'supervisor' ? 'Front office' : '';
  const canEdit = s => R.can('roster') && (!scope() || s.dept === scope());
  R.act.rosDept = (d, el) => { rDept = el.value; R.render(); };
  R.act.rosWeek = d => { rWeek = d.n === '0' ? bd() : addDays(rWeek, +d.n); R.render(); };
  R.act.rosCycle = d => {
    const s = R.staff(d.id);
    if (!canEdit(s)) return R.toast(`You can only change the ${scope() || 'roster for your team'}`, 'warn');
    const row = R.S.roster[d.id] = R.S.roster[d.id] || {}, old = R.shiftOf(d.id, d.date);
    row[d.date] = SHIFTS[(SHIFTS.indexOf(old) + 1) % SHIFTS.length];
    R.log('Roster', `${s.name}, ${R.fmtShort(d.date)}: ${old} → ${row[d.date]}`);
    R.rerender();
  };
  R.act.rosCopy = () => {
    if (!R.need('roster')) return;
    const L = R.S.staff.filter(s => s.active && s.roleKey !== 'owner' && canEdit(s));
    R.confirm('Copy this week to next week?', `${L.length} people. Next week's shifts are replaced by this week's.`, 'Copy week', () => {
      L.forEach(s => { const row = R.S.roster[s.id] = R.S.roster[s.id] || {}; for (let i = 0; i < 7; i++) row[addDays(rWeek, i + 7)] = R.shiftOf(s.id, addDays(rWeek, i)); });
      R.log('Roster', `Week of ${R.fmtShort(rWeek)} copied to the next week`); R.rerender(); R.toast('Copied to next week');
    });
  };
  R.views.roster = {
    title: 'Staff roster',
    hint: 'Who works when. Click a shift to change it. The bottom row warns when a team has nobody on.',
    render() {
      if (!rWeek) rWeek = bd();
      const days = Array.from({ length: 7 }, (_, i) => addDays(rWeek, i));
      const lock = scope(), dept = lock && !R.can('settings') ? lock : rDept;
      const staff = R.S.staff.filter(s => s.active && s.roleKey !== 'owner');
      const L = staff.filter(s => !dept || s.dept === dept);
      const cls = v => v === 'Off' ? '' : v.startsWith('06') ? 'green' : v.startsWith('14') ? 'teal' : v.startsWith('22') ? 'ink' : 'amber';
      const on = (dp, d, test) => staff.some(s => s.dept === dp && R.shiftOf(s.id, d) !== 'Off' && (!test || test(R.shiftOf(s.id, d))));
      const gaps = d => {
        const g = Object.entries(NEED).filter(([dp]) => (!dept || dp === dept) && !on(dp, d)).map(([, l]) => l);
        if ((!dept || dept === 'Front office') && on('Front office', d) && !on('Front office', d, v => v.startsWith('22'))) g.push('Night desk');
        return g;
      };
      const today = bd(), working = staff.filter(s => R.shiftOf(s.id, today) !== 'Off');
      const depts = [...new Set(staff.map(s => s.dept))];
      return `<div class="panel" style="margin-bottom:16px"><h2>On duty ${R.fmt(today)}</h2><div class="duty">${depts.map(dp => { const w = working.filter(s => s.dept === dp); return `<div><b>${esc(dp)}</b>${w.map(s => `<div class="small">${esc(s.name)} <span class="muted">${R.shiftOf(s.id, today)}</span></div>`).join('') || '<div class="small warn-text">Nobody on</div>'}</div>`; }).join('')}</div></div>
        <div class="panel"><div class="ph">
          ${lock && !R.can('settings') ? `<span class="chip">${esc(lock)}</span>` : `<select class="search" data-change="rosDept" aria-label="Department"><option value="">All departments</option>${depts.map(d => `<option ${d === rDept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>`}
          <button class="btn ghost sm" data-act="rosWeek" data-n="-7">← Week</button><button class="btn ghost sm" data-act="rosWeek" data-n="0">This week</button><button class="btn ghost sm" data-act="rosWeek" data-n="7">Week →</button>
          <div class="sp legend" style="margin:0"><span class="chip green">Morning</span><span class="chip teal">Evening</span><span class="chip ink">Night</span><span class="chip amber">Office</span><span class="chip">Off</span>${R.can('roster') ? '<button class="btn sm ghost" data-act="rosCopy">Copy to next week</button>' : ''}</div></div>
          <div class="tbl"><table class="roster"><thead><tr><th>Staff</th>${days.map(d => `<th class="${d === today ? 'today-col' : ''}">${R.fmt(d)}</th>`).join('')}</tr></thead><tbody>
          ${L.map(s => `<tr><td><b>${esc(s.name)}</b><div class="small muted">${esc(s.title)} · ${esc(s.dept)}</div></td>${days.map(d => { const v = R.shiftOf(s.id, d); return `<td>${canEdit(s) ? `<button class="chip ${cls(v)} legend-btn" data-act="rosCycle" data-id="${s.id}" data-date="${d}" aria-label="${esc(s.name)}, ${R.fmt(d)}: ${v}. Click to change">${v}</button>` : `<span class="chip ${cls(v)}">${v}</span>`}</td>`; }).join('')}</tr>`).join('')}
          <tr class="sum"><td class="small muted">Gaps</td>${days.map(d => { const g = gaps(d); return `<td>${g.length ? `<span class="chip red" title="${esc(g.join(', '))}">${g.length === 1 ? 'No ' + esc(g[0].toLowerCase()) : g.length + ' teams empty'}</span>` : '<span class="chip green">Covered</span>'}</td>`; }).join('')}</tr>
          </tbody></table></div>
          ${R.can('roster') ? '' : '<p class="small muted" style="margin-top:8px">View only.</p>'}</div>`;
    }
  };
})();
