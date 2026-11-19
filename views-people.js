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
  let gQ = '', gF = 'all', gSort = 'recent';
  const lastArrive = g => staysOf(g).filter(r => r.status !== 'cancelled').map(r => r.arrive).sort().pop() || '';
  const whenChip = g => {
    const now = nowChip(g); if (now) return now;
    const last = staysOf(g).filter(r => r.status === 'checkedout').map(r => R.dep(r)).sort().pop();
    return last ? `<span class="small muted">Stayed ${R.fmtShort(last)}</span>` : '<span class="small muted">No stays yet</span>';
  };
  const SORTS = [['recent', 'Most recent stay'], ['name', 'Name, A to Z'], ['stays', 'Most stays'], ['spend', 'Highest spend']];
  R.act.gFilter = d => { gF = d.f; R.render(); };
  R.act.gSort = (d, el) => { gSort = el.value; R.render(); };
  R.act.gClear = () => { gQ = ''; R.render(); const s = document.getElementById('gSearch'); if (s) s.focus(); };
  R.views.guests = {
    title: 'Guests',
    hint: 'Everyone who has stayed or is booked: contact details, preferences, history and spend.',
    render() {
      const q = gQ.trim().toLowerCase(), qd = q.replace(/\D/g, '');
      const dupSet = new Set(); R.S.guests.forEach(g => { if (R.dupsOf(g).length) dupSet.add(g.id); });
      const match = g => !q || g.name.toLowerCase().includes(q) || (g.email || '').toLowerCase().includes(q) || (g.town || '').toLowerCase().includes(q) || (qd.length >= 3 && g.phone.replace(/\D/g, '').includes(qd));
      const TESTS = { all: () => true, inhouse: g => staysOf(g).some(r => r.status === 'inhouse'), soon: g => staysOf(g).some(r => r.status === 'booked' && r.arrive <= addDays(bd(), 7)),
        repeat: g => pastStays(g) >= 2 || g.tag === 'Repeat guest', vip: g => g.tag === 'VIP', dups: g => dupSet.has(g.id) };
      const found = R.S.guests.filter(match);
      let L = found.filter(TESTS[gF]);
      const by = { recent: (a, b) => lastArrive(b).localeCompare(lastArrive(a)) || a.name.localeCompare(b.name), name: (a, b) => a.name.localeCompare(b.name), stays: (a, b) => pastStays(b) - pastStays(a) || a.name.localeCompare(b.name), spend: (a, b) => spendOf(b) - spendOf(a) };
      L = L.sort(gF === 'dups' ? by.name : by[gSort]);
      const F = [['all', 'All'], ['inhouse', 'In house'], ['soon', 'Arriving in 7 days'], ['repeat', 'Repeat'], ['vip', 'VIP'], ['dups', 'Possible duplicates']];
      const can = R.can('book'), shown = L.slice(0, 150);
      return `<div class="panel"><div class="g-tools">
          <div class="g-search">${R.icon('search')}<input type="search" id="gSearch" placeholder="Search name, mobile, email or town" value="${esc(gQ)}" aria-label="Search guests" autocomplete="off" spellcheck="false">${gQ ? '<button type="button" class="g-clear" data-act="gClear" aria-label="Clear the search">×</button>' : ''}</div>
          <label class="g-sort">Sort<select data-change="gSort" aria-label="Sort guests" ${gF === 'dups' ? 'disabled' : ''}>${SORTS.map(([k, l]) => `<option value="${k}" ${gSort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${can ? `<button class="btn" data-act="newGuest">${R.icon('plus')}New guest</button>` : ''}</div>
        <div class="seg g-filters" role="group" aria-label="Show">${F.map(([f, l]) => { const n = found.filter(TESTS[f]).length; return `<button class="${gF === f ? 'on' : ''}" aria-pressed="${gF === f}" data-act="gFilter" data-f="${f}"><b>${l}</b> <span class="g-n">${n}</span></button>`; }).join('')}</div>
        ${gF === 'dups' && L.length ? `<div class="note warn" style="margin:10px 0">${R.icon('users')}<div>These profiles share a name or a mobile number. Open one and merge the others into it, so the stay history is in one place.</div></div>` : ''}
        ${L.length ? `<div class="tbl"><table class="g-tbl"><thead><tr><th>Guest</th><th>From</th><th>Stay</th><th>Notes</th><th class="right">Stays</th><th class="right">Spend</th></tr></thead><tbody>
        ${shown.map(g => `<tr class="click" data-act="openGuest" data-id="${g.id}"><td class="g-who"><span class="avatar sm ${g.tag === 'VIP' ? 'vip' : ''}" aria-hidden="true">${esc(R.initials(g.name))}</span><div><a href="#guest/${g.id}" class="g-name">${esc(g.name)}</a>${dupSet.has(g.id) ? ' <span class="chip amber">Duplicate?</span>' : ''}<div class="small muted">${esc(g.phone) || 'No mobile'}${g.email ? ` · ${esc(g.email)}` : ''}</div></div></td>
          <td class="small">${esc(g.town) || '<span class="muted">—</span>'}</td><td>${whenChip(g)}</td>
          <td>${g.tag ? `<span class="chip amber">${esc(g.tag)}</span>` : ''}${g.prefs ? `<div class="small muted ellip">${esc(g.prefs)}</div>` : ''}</td>
          <td class="right num">${pastStays(g) > 1 ? `<span class="chip green">${pastStays(g)}</span>` : pastStays(g)}</td><td class="right num">${R.money(spendOf(g))}</td></tr>`).join('')}
        </tbody></table></div>${L.length > shown.length ? `<p class="small muted g-more">Showing ${shown.length} of ${L.length} guests. Search to find the others.</p>` : ''}`
        : `<div class="g-empty"><b>${q ? `No guests match “${esc(gQ.trim())}”` : 'No guests here yet'}</b><p class="muted">${q ? 'Check the spelling, or search by mobile number.' : 'Guests appear here once they book.'}</p>
            <div class="row">${q ? '<button class="btn ghost" data-act="gClear">Clear the search</button>' : ''}${gF !== 'all' ? '<button class="btn ghost" data-act="gFilter" data-f="all">Show all guests</button>' : ''}${can && q && !/^\d+$/.test(q) ? `<button class="btn" data-act="newGuest" data-name="${esc(gQ.trim())}">${R.icon('plus')}Add “${esc(gQ.trim())}”</button>` : ''}</div></div>`}</div>`;
    },
    mount(el) { const s = el.querySelector('#gSearch'); s.addEventListener('input', () => { gQ = s.value; const p = s.selectionStart; R.render(); const n = document.getElementById('gSearch'); n.focus(); n.setSelectionRange(p, p); }); }
  };

  // ---------- Guest profile ----------
  R.act.guestNotes = (d, el) => {
    if (!R.need('book')) return R.render();
    const g = R.findGuest(d.id); g.prefs = el.value.trim();
    R.log('Guest notes', `${g.name}: ${g.prefs || '(cleared)'}`); R.rerender(); R.toast('Guest notes saved');
  };
  R.act.gCopy = d => { const ok = () => R.toast(`${d.v} copied`); if (navigator.clipboard) navigator.clipboard.writeText(d.v).then(ok, () => R.toast('Copy failed')); };
  const NATIONS = ['Filipino', 'American', 'Australian', 'British', 'Canadian', 'Chinese', 'Dutch', 'French', 'German', 'Indian', 'Indonesian', 'Italian', 'Japanese', 'Korean', 'Malaysian', 'New Zealander', 'Singaporean', 'Spanish', 'Swiss', 'Taiwanese', 'Thai', 'Vietnamese', 'Other'];
  const phoneOk = p => p.replace(/\D/g, '').length >= 7;
  // one dialog for editing and for adding a guest by hand
  const guestDialog = (g, isNew) => {
    const nat = g.nationality || 'Filipino', nations = NATIONS.includes(nat) ? NATIONS : [nat, ...NATIONS];
    R.modal(isNew ? 'New guest' : 'Edit guest', `<form class="nb eg" id="egForm" novalidate><div class="nb-main">
      <section class="nb-sec" aria-labelledby="egH1"><h3 id="egH1">Name</h3>
        <label class="field">Full name<input id="egN" value="${esc(g.name)}" autocomplete="off" autocapitalize="words" placeholder="As on their ID, e.g. Maria Santos"></label>
        ${R.fx.chips('egTag', [['', 'No tag'], ...TAGS.concat(g.tag && !TAGS.includes(g.tag) ? [g.tag] : []).map(t => [t, esc(t)])], g.tag || '', 'Tag')}</section>
      <section class="nb-sec" aria-labelledby="egH2"><h3 id="egH2">Contact</h3>
        <div class="form"><label class="field">Mobile number<input id="egP" type="tel" inputmode="tel" value="${esc(g.phone)}" placeholder="0917 123 4567" autocomplete="off"></label>
          <label class="field"><span>Email <span class="muted">(optional)</span></span><input id="egE" type="email" value="${esc(g.email)}" placeholder="name@gmail.com" spellcheck="false" autocomplete="off"></label></div>
        <div id="egDup"></div>
        <div class="form"><label class="field"><span>Town or city <span class="muted">(optional)</span></span><input id="egT" value="${esc(g.town)}" placeholder="e.g. Cagayan de Oro"></label>
          <label class="field">Nationality<select id="egNa">${nations.map(n => `<option ${n === nat ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label></div></section>
      <section class="nb-sec" aria-labelledby="egH3"><h3 id="egH3">ID on file <span class="muted eg-sub">usually taken at check-in</span></h3>
        <div class="form"><label class="field">ID type<select id="egIdT"><option value="">Not taken yet</option>${R.ID_TYPES.map(x => `<option ${x === g.idType ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label class="field">ID number<input id="egIdN" value="${esc(g.idNo || '')}" placeholder="As printed on the ID" autocomplete="off" spellcheck="false"></label></div>
      </section>
      <section class="nb-sec" aria-labelledby="egH4"><h3 id="egH4">Preferences and notes</h3>
        <label class="field"><span>Notes <span class="muted">(shown at check-in and on the arrivals list)</span></span><textarea id="egPr" rows="3" placeholder="e.g. likes a ground floor room, allergic to shrimp, birthday on 12 March">${esc(g.prefs || '')}</textarea></label></section>
      </div></form>
      <div class="foot nb-foot"><p id="egErr" class="fx-err" role="alert"></p><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="submit" form="egForm" class="btn" id="egGo">${isNew ? 'Add guest' : 'Save changes'}</button></div>`, b => {
      const $ = s => b.querySelector(s), form = $('#egForm');
      // someone else with this mobile number or name? say so before a second profile is made
      const dupHint = () => {
        const p = $('#egP').value.replace(/\D/g, '').slice(-10), n = $('#egN').value.trim().toLowerCase();
        const others = R.S.guests.filter(x => x.id !== g.id && ((p.length >= 7 && x.phone.replace(/\D/g, '').slice(-10) === p) || (n.length >= 3 && x.name.trim().toLowerCase() === n))).slice(0, 3);
        $('#egDup').innerHTML = others.length ? `<div class="note warn eg-dup">${R.icon('users')}<div><b>${others.length === 1 ? 'Another guest has' : 'Other guests have'} this ${others.some(x => p.length >= 7 && x.phone.replace(/\D/g, '').slice(-10) === p) ? 'mobile number' : 'name'}.</b> ${isNew ? 'Open their profile instead, so the history stays in one place.' : 'If it is the same person, merge the profiles from the guest page.'}
          <div class="row" style="margin-top:6px">${others.map(x => `<button type="button" class="btn ghost sm" data-act="openGuest" data-id="${x.id}">${esc(x.name)}, ${esc(x.phone)}</button>`).join('')}</div></div></div>` : '';
      };
      form.addEventListener('input', e => { if (e.target.id) R.fx.clearErr(b, e.target.id); if (['egP', 'egN'].includes(e.target.id)) dupHint(); });
      form.addEventListener('focusout', e => { if (e.target.id === 'egP' && /^(\+?63|0)9\d{9}$/.test(e.target.value.replace(/[\s-]/g, ''))) { const d = e.target.value.replace(/\D/g, '').replace(/^63/, '0'); e.target.value = `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`; } });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const v = s => $(s).value.trim(), errs = [], add = (id, m) => errs.push([id, m]);
        if (v('#egN').length < 3) add('egN', 'Enter the full name.');
        if (!phoneOk(v('#egP'))) add('egP', 'Enter a mobile number, like 0917 123 4567.');
        if (v('#egE') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('#egE'))) add('egE', 'Check the email address, or leave it empty.');
        if (v('#egIdN') && !$('#egIdT').value) add('egIdT', 'Pick the ID type for this number.');
        if (!R.fx.report(b, errs, $('#egErr'))) return;
        const vals = { name: v('#egN'), phone: v('#egP'), email: v('#egE'), town: v('#egT'), nationality: $('#egNa').value, tag: R.fx.radio(b, 'egTag'), idType: $('#egIdT').value, idNo: $('#egIdT').value ? v('#egIdN') : '', prefs: v('#egPr') };
        if (isNew) { const ng = { id: R.nextId('G'), stays: 0, ...vals }; R.S.guests.unshift(ng); R.log('Guest added', ng.name); R.closeModal(); R.save(); R.go('guest', ng.id); R.toast(`${ng.name} added`); return; }
        const changed = Object.keys(vals).filter(k => (g[k] || '') !== vals[k]);
        if (!changed.length) { R.closeModal(); return R.toast('No changes to save'); }
        Object.assign(g, vals);
        R.log('Guest edited', `${g.name}: ${changed.join(', ')}`); R.closeModal(); R.rerender(); R.toast('Changes saved');
      });
      dupHint();
    }, { tall: true });
  };
  R.act.editGuest = d => { if (!R.need('book')) return; guestDialog(R.findGuest(d.id), false); };
  R.act.newGuest = d => { if (!R.need('book')) return; guestDialog({ name: d && d.name || '', phone: '', email: '', town: '', nationality: 'Filipino', tag: '', idType: '', idNo: '', prefs: '' }, true); };
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
      const ahead = rs.filter(r => r.status === 'booked' || r.status === 'inhouse').sort((a, b) => a.arrive.localeCompare(b.arrive)), past = rs.filter(r => !ahead.includes(r));
      const next = ahead[0];
      const ids = new Set(rs.map(r => r.id)), cots = R.S.venueBookings.filter(v => (v.guestId === g.id || ids.has(v.resId)) && v.status !== 'cancelled').sort((a, b) => b.date.localeCompare(a.date));
      const first = rs.map(r => r.arrive).sort()[0], tel = (g.phone || '').replace(/[^\d+]/g, '');
      const resTable = L => `<div class="tbl"><table><tbody>${L.map(r => R.resRow(r, `<span class="num small">${R.money(R.total(r) || R.stayValue(r))}</span>`)).join('')}</tbody></table></div>`;
      const staysNow = pastStays(g) + (rs.some(r => r.status === 'inhouse') ? 1 : 0);
      return `<div class="bk-head"><a class="btn ghost sm" href="#guests">${R.icon('back')}Guests</a><span class="row g-chips">${g.tag ? `<span class="chip amber">${esc(g.tag)}</span>` : ''}${nowChip(g)}${staysNow >= 2 ? '<span class="chip green">Repeat guest</span>' : ''}</span>
          <div class="sp row">${can ? `${next ? `<button class="btn ghost sm" data-act="msgGuest" data-id="${next.id}">Message guest</button>` : ''}<button class="btn ghost sm" data-act="editGuest" data-id="${g.id}">Edit guest</button><button class="btn sm" data-act="newBooking" data-guest="${g.id}">${R.icon('plus')}New booking</button>` : ''}</div></div>
        <div class="pulse pulse5"><div><b>${staysNow}</b><span>${rs.some(r => r.status === 'inhouse') ? 'Stays, this one included' : 'Stays'}</span></div><div><b>${nights}</b><span>Nights stayed</span></div><div><b>${R.money(spendOf(g))}</b><span>Total spend</span></div>
          <div><b>${nights ? R.money(roomRev / nights) : '—'}</b><span>Average room rate</span></div><div><b>${next ? R.fmtShort(next.status === 'inhouse' ? R.dep(next) : next.arrive) : '—'}</b><span>${next && next.status === 'inhouse' ? 'Checks out' : 'Next arrival'}</span></div></div>
        <div class="grid g-side"><div class="stack">
          <div class="panel"><h2>Stays</h2>${rs.length ? `${ahead.length ? `<p class="g-sub">Coming up</p>${resTable(ahead)}` : ''}${past.length ? `<p class="g-sub">Past</p>${resTable(past)}` : ''}`
            : `<p class="empty">No stays yet.${can ? ` <button class="btn ghost sm" data-act="newBooking" data-guest="${g.id}">Make a booking</button>` : ''}</p>`}</div>
          ${cots.length ? `<div class="panel"><h2>Cottage reservations <span class="g-n">${cots.length}</span></h2>${cots.map(v => `<button class="list-item g-cot" data-act="openEvent" data-id="${v.id}"><span class="grow"><b>${esc(R.venue(v.venue).name)}</b><span class="small muted">${R.fmt(v.date)}, ${v.session === 'day' ? 'day tour' : 'night swim'}, ${v.pax} guests</span></span>${R.chip(v.status === 'arrived' ? 'done' : v.status === 'booked' ? 'booked' : v.status)}</button>`).join('')}</div>` : ''}
          ${dups.length ? `<div class="panel"><h2>Possible duplicates</h2><p class="small muted" style="margin-bottom:6px">Same name or the same mobile number. Merge them so the history is in one place.</p>${dups.map(x => `<div class="list-item"><span class="avatar sm">${R.initials(x.name)}</span><div class="grow small"><b>${esc(x.name)}</b> · ${esc(x.phone)}<div class="muted">${staysOf(x).length} booking(s)</div></div>${can ? `<button class="btn ghost sm" data-act="mergeGuest" data-keep="${g.id}" data-drop="${x.id}">Merge into this profile</button>` : ''}</div>`).join('')}</div>` : ''}
        </div><div class="stack">
          <div class="panel"><h2>Details</h2>
            <dl class="kv kv-side"><dt>Mobile</dt><dd>${g.phone ? `<a href="tel:${esc(tel)}">${esc(g.phone)}</a> <button class="g-copy" data-act="gCopy" data-v="${esc(g.phone)}" aria-label="Copy mobile number">Copy</button>` : '—'}</dd><dt>Email</dt><dd>${g.email ? `<a href="mailto:${esc(g.email)}">${esc(g.email)}</a>` : '—'}</dd><dt>From</dt><dd>${esc(g.town) || '—'}</dd><dt>Nationality</dt><dd>${esc(g.nationality) || '—'}</dd>${first ? `<dt>Guest since</dt><dd>${new Date(first + 'T12:00').toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</dd>` : ''}${fav ? `<dt>Books through</dt><dd>${esc(fav[0])}</dd>` : ''}
            <dt>ID on file</dt><dd>${g.idNo ? `${esc(g.idType)} · ${esc(g.idNo.replace(/.(?=.{3})/g, '•'))}` : '<span class="muted">Taken at check-in</span>'}</dd></dl></div>
          <div class="panel"><h2>Preferences and notes</h2><p class="small muted" style="margin-bottom:6px">Shown at check-in, on the booking and on the arrivals list. Saved when you click away.</p>
            <textarea class="search" style="width:100%" rows="4" data-change="guestNotes" data-id="${g.id}" ${can ? '' : 'disabled'} placeholder="e.g. likes a ground floor room, allergic to shrimp, birthday on 12 March" aria-label="Guest notes">${esc(g.prefs)}</textarea></div>
        </div></div>`;
    }
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
