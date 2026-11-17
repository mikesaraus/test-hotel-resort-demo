/* Settings: rooms & rates, seasons, house rules, booking sources, users & roles, modules, audit log. */
(function () {
  const { addDays } = R.util;
  const esc = R.esc;
  let sTab = 'rates', logQ = '';
  R.act.sTab = d => { sTab = d.tab; R.render(); };
  const guard = p => R.need(p);

  // ---------- edits ----------
  R.act.setSeason = (d, el) => {
    if (!guard('settings')) return R.render();
    const s = R.S.seasons.find(x => x.id === d.id);
    if (d.f === 'pct') s.pct = Math.round(+el.value) || 0;
    else if (d.f === 'weekdays') s.weekdays = el.checked;
    else if (d.f === 'from' || d.f === 'to') { if (!/^\d{2}-\d{2}$/.test(el.value)) { R.toast('Use month-day, like 12-20', 'warn'); return R.render(); } s[d.f] = el.value; }
    else s[d.f] = el.value;
    R.log('Season changed', `${s.name}: ${d.f} = ${d.f === 'weekdays' ? el.checked : el.value}`);
    R.rerender();
  };
  R.act.addSeason = () => { if (!guard('settings')) return; R.S.seasons.push({ id: R.nextId('SN'), name: 'New season', from: '01-01', to: '01-07', pct: 10, weekdays: false, note: '' }); R.log('Season added', ''); R.rerender(); };
  R.act.delSeason = d => {
    if (!guard('settings')) return;
    const s = R.S.seasons.find(x => x.id === d.id);
    R.confirm('Delete season?', `"${esc(s.name)}" will stop applying to new bookings. Existing bookings keep their prices.`, 'Delete', () => { R.S.seasons = R.S.seasons.filter(x => x !== s); R.log('Season deleted', s.name); R.rerender(); }, true);
  };
  R.act.setRule = (d, el) => { if (!guard('settings')) return R.render(); R.S.rules[d.k] = d.k === 'deposit' ? Math.max(0, Math.min(100, +el.value || 0)) : el.value; R.log('House rule', `${d.k} = ${el.value}`); R.rerender(); R.toast('Saved'); };
  R.act.setGuestFree = (d, el) => { if (!guard('settings')) return R.render(); R.S.rules.guestEntranceFree = el.checked; R.log('House rule', `Entrance free for overnight guests: ${el.checked ? 'yes' : 'no'}`); R.rerender(); R.toast('Saved'); };
  R.act.setVoucher = (d, el) => {
    if (!guard('settings')) return R.render();
    const v = R.S.vouchers.find(x => x.code === d.code);
    if (d.f === 'active') v.active = el.checked;
    else if (d.f === 'value') { const n = Math.round(+el.value); if (!(n > 0) || (v.kind === 'pct' && n > 100)) { R.toast(v.kind === 'pct' ? 'Use 1 to 100%' : 'Enter an amount above 0', 'warn'); return R.render(); } v.value = n; }
    else v[d.f] = el.value.trim() || v[d.f];
    R.log('Voucher', `${v.code}: ${d.f} = ${d.f === 'active' ? el.checked : el.value}`); R.rerender();
  };
  R.act.addVoucher = () => {
    if (!guard('settings')) return;
    R.modal('Add a voucher', `<div class="form"><label class="field">Code<input id="avC" placeholder="e.g. SUMMER15" style="text-transform:uppercase" autofocus></label>
      <label class="field">Description<input id="avL" placeholder="e.g. 15% off cottage"></label>
      <label class="field">Type<select id="avK"><option value="pct">Percent off the cottage</option><option value="amt">Peso amount off the cottage</option></select></label>
      <label class="field">Value<input id="avV" type="number" min="1" value="10"></label></div>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="avGo">Add voucher</button></div>`, b => {
      b.querySelector('#avGo').onclick = () => {
        const code = b.querySelector('#avC').value.trim().toUpperCase(), kind = b.querySelector('#avK').value, val = Math.round(+b.querySelector('#avV').value);
        if (!/^[A-Z0-9]{3,16}$/.test(code)) return R.toast('Use 3 to 16 letters or numbers', 'warn');
        if (R.S.vouchers.some(v => v.code === code)) return R.toast('That code already exists', 'warn');
        if (!(val > 0) || (kind === 'pct' && val > 100)) return R.toast('Check the value', 'warn');
        R.S.vouchers.push({ code, label: b.querySelector('#avL').value.trim() || (kind === 'pct' ? val + '% off cottage' : '₱' + val + ' off cottage'), kind, value: val, active: true, uses: 0 });
        R.log('Voucher added', code); R.closeModal(); R.rerender();
      };
    });
  };
  R.act.setNotify = (d, el) => { if (!guard('settings')) return R.render(); R.S.notify[d.k] = d.k === 'on' ? el.checked : el.value; R.log('Report delivery', `${d.k} = ${d.k === 'on' ? el.checked : el.value}`); R.rerender(); R.toast('Saved'); };
  R.act.setFee = (d, el) => { if (!guard('settings')) return R.render(); const s = R.S.sources.find(x => x.name === d.n); s.commission = Math.max(0, +el.value || 0); R.log('Commission', `${s.name}: ${s.commission}%`); R.rerender(); };
  R.act.addSource = () => {
    if (!guard('settings')) return;
    R.modal('Add a booking source', `<div class="form"><label class="field">Name<input id="srN" placeholder="e.g. Travel agent, Website" autofocus></label><label class="field">Commission %<input id="srC" type="number" min="0" value="0"></label></div>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="srGo">Add</button></div>`, b => {
      b.querySelector('#srGo').onclick = () => { const n = b.querySelector('#srN').value.trim(); if (n.length < 2) return; R.S.sources.push({ name: n, commission: +b.querySelector('#srC').value || 0 }); R.log('Source added', n); R.closeModal(); R.rerender(); };
    });
  };
  R.act.setRole = (d, el) => {
    if (!guard('admin')) return R.render();
    const s = R.staff(d.id);
    if (s.id === R.S.user) { R.toast("You can't change your own role", 'warn'); return R.render(); }
    R.log('Role changed', `${s.name}: ${R.ROLES[s.roleKey].name} → ${R.ROLES[el.value].name}`); s.roleKey = el.value;
    R.rerender(); R.toast(`${s.name} is now ${R.ROLES[el.value].name}`);
  };
  R.act.setActive = (d, el) => {
    if (!guard('admin')) return R.render();
    const s = R.staff(d.id);
    if (s.id === R.S.user) { R.toast("You can't switch off your own account", 'warn'); return R.render(); }
    s.active = el.checked; R.log(s.active ? 'User enabled' : 'User disabled', s.name); R.rerender();
  };
  R.act.addUser = () => {
    if (!guard('admin')) return;
    R.modal('Add a staff account', `<div class="form"><label class="field">Full name<input id="uN" autofocus></label><label class="field">Job title<input id="uT" placeholder="e.g. Front desk cashier"></label>
      <label class="field">Department<input id="uD" placeholder="e.g. Front office"></label><label class="field">Role<select id="uR">${Object.entries(R.ROLES).map(([k, r]) => `<option value="${k}" ${k === 'frontdesk' ? 'selected' : ''}>${r.name}</option>`).join('')}</select></label></div>
      <p class="small muted" style="margin-top:8px">In the real system they get an email invite and set their own password and PIN. The mockup PIN is 1234.</p>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="uGo">Add account</button></div>`, b => {
      b.querySelector('#uGo').onclick = () => {
        const n = b.querySelector('#uN').value.trim(); if (n.length < 3) return R.toast('Enter the name', 'warn');
        const s = { id: R.nextId('S'), name: n, title: b.querySelector('#uT').value.trim() || R.ROLES[b.querySelector('#uR').value].name, dept: b.querySelector('#uD').value.trim() || '—', roleKey: b.querySelector('#uR').value, pin: '1234', active: true };
        R.S.staff.push(s); R.log('User added', `${n} as ${R.ROLES[s.roleKey].name}`); R.closeModal(); R.rerender();
      };
    });
  };
  R.act.setModule = (d, el) => { if (!guard('admin')) return R.render(); R.S.modules[d.m] = el.checked; R.log('Module', `${d.m} ${el.checked ? 'on' : 'off'}`); R.rerender(); R.toast(el.checked ? 'Module switched on. It is now in the menu.' : 'Module switched off'); };

  // ---------- render ----------
  // ---------- property: room types, rooms, buildings & map, cottages ----------
  const SPANS = [[2, 'Small (⅓)'], [3, 'Half'], [4, 'Large (⅔)'], [6, 'Full width']];
  const FEATURES = [['pool', 'Pool'], ['garden', 'Garden'], ['beach', 'Beach'], ['parking', 'Parking'], ['other', 'Other']];
  const openStays = no => R.S.reservations.filter(r => r.room === no && (r.status === 'booked' || r.status === 'inhouse'));
  const everUsedRoom = no => R.S.reservations.some(r => r.room === no) || R.S.tasks.some(t => t.area === no && t.status !== 'done');
  const cottageUsed = id => R.S.sales.some(s => (s.cottages || []).includes(id)) || R.S.venueBookings.some(v => v.venue === id) || R.S.cottageUse[id];

  R.act.setType = (d, el) => {
    if (!guard('settings')) return R.render();
    const t = R.type(d.id), f = d.f, old = t[f];
    let v = el.value.trim();
    if (f === 'cap' || f === 'base') { v = Math.round(+v); if (!(v > 0)) { R.toast('Enter a number above 0', 'warn'); return R.render(); } }
    if (f === 'name' && v.length < 3) { R.toast('Enter a name', 'warn'); return R.render(); }
    t[f] = v; R.log('Room type', `${t.name}: ${f} ${old} → ${v}`); R.rerender();
    R.toast(f === 'base' ? `${t.name} base rate is now ${R.money(v)}. Applies to new bookings.` : 'Saved');
  };
  R.act.addType = () => {
    if (!guard('settings')) return;
    R.modal('Add a room type', `<div class="form"><label class="field full">Name<input id="atN" placeholder="e.g. Treehouse Suite" autofocus></label>
      <label class="field">Sleeps<input id="atC" type="number" min="1" value="2"></label><label class="field">Base rate (₱)<input id="atB" type="number" min="1" value="3000"></label>
      <label class="field">Size<input id="atS" placeholder="e.g. 30 m²"></label><label class="field">Beds<input id="atBd" placeholder="e.g. Queen"></label><label class="field full">View<input id="atV" placeholder="e.g. Sea view"></label></div>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="atGo">Add room type</button></div>`, b => {
      b.querySelector('#atGo').onclick = () => {
        const v = s => b.querySelector(s).value.trim(), n = v('#atN');
        if (n.length < 3) return R.toast('Enter a name', 'warn');
        const id = 'T' + (++R.S.seq);
        R.S.roomTypes.push({ id, name: n, cap: Math.max(1, +v('#atC') || 1), base: Math.max(1, +v('#atB') || 1), size: v('#atS') || '—', bed: v('#atBd') || '—', view: v('#atV') || '—' });
        R.log('Room type added', n); R.closeModal(); R.rerender(); R.toast(`${n} added. Now add rooms of this type in Property layout.`);
      };
    });
  };
  R.act.delType = d => {
    if (!guard('settings')) return;
    const t = R.type(d.id);
    if (R.S.rooms.some(r => r.type === t.id) || R.S.reservations.some(r => r.type === t.id)) return R.toast(`${t.name} still has rooms or bookings. Move or remove those first.`, 'warn');
    R.confirm('Delete room type?', `"${esc(t.name)}" has no rooms and no bookings.`, 'Delete', () => { R.S.roomTypes = R.S.roomTypes.filter(x => x !== t); R.log('Room type deleted', t.name); R.rerender(); }, true);
  };

  // rooms
  R.act.setRoom = (d, el) => {
    if (!guard('settings')) return R.render();
    const room = R.room(d.no), v = el.value.trim();
    if (d.f === 'no') {
      if (!/^[A-Za-z0-9-]{1,6}$/.test(v)) { R.toast('Use 1–6 letters or numbers, like 109 or V4', 'warn'); return R.render(); }
      if (v !== room.no && R.room(v)) { R.toast(`Room ${v} already exists`, 'warn'); return R.render(); }
      const old = room.no;
      R.S.reservations.forEach(r => { if (r.room === old) r.room = v; });
      R.S.tasks.forEach(t => { if (t.area === old) t.area = v; });
      room.no = v; R.log('Room renumbered', `${old} → ${v} (bookings and tasks updated)`);
    } else if (d.f === 'type') {
      const clash = openStays(room.no).filter(r => r.type !== v);
      if (clash.length) { R.toast(`Room ${room.no} has ${clash.length} booking(s) as ${R.type(room.type).name}. Move them first, or change them in the booking.`, 'warn'); return R.render(); }
      R.log('Room type changed', `${room.no}: ${R.type(room.type).name} → ${R.type(v).name}`); room.type = v;
    } else if (d.f === 'zone') { R.log('Room moved', `${room.no} → ${R.S.zones.find(z => z.id === v).name}`); room.zone = v; }
    R.rerender(); R.toast('Saved');
  };
  R.act.addRoom = () => {
    if (!guard('settings')) return;
    const bs = R.S.zones.filter(z => z.kind === 'building');
    R.modal('Add rooms', `<div class="form">
      <label class="field">Room number<input id="arN" placeholder="e.g. 109" autofocus></label>
      <label class="field">How many<input id="arQ" type="number" min="1" max="20" value="1"></label>
      <label class="field">Room type<select id="arT">${R.S.roomTypes.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
      <label class="field">Building<select id="arZ">${bs.map(z => `<option value="${z.id}">${esc(z.name)}</option>`).join('')}</select></label></div>
      <p class="small muted" style="margin-top:8px">Adding more than one numbers them in order: 109, 110, 111. New rooms start as inspected and ready to sell.</p>
      <p class="small warn-text" id="arErr" style="min-height:1.4em"></p>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="arGo">Add</button></div>`, b => {
      b.querySelector('#arGo').onclick = () => {
        const first = b.querySelector('#arN').value.trim(), q = Math.max(1, Math.min(20, +b.querySelector('#arQ').value || 1));
        const m = first.match(/^([A-Za-z-]*)(\d+)$/);
        if (!m) return (b.querySelector('#arErr').textContent = 'Use a number, optionally with letters in front, like 109 or V4.');
        const nos = Array.from({ length: q }, (_, i) => m[1] + String(+m[2] + i).padStart(m[2].length, '0'));
        const dup = nos.find(n => R.room(n));
        if (dup) return (b.querySelector('#arErr').textContent = `Room ${dup} already exists.`);
        nos.forEach(no => R.S.rooms.push({ no, type: b.querySelector('#arT').value, zone: b.querySelector('#arZ').value, hk: 'inspected', ooo: null, attendant: null }));
        R.log('Rooms added', nos.join(', ')); R.closeModal(); R.rerender(); R.toast(`Added ${nos.length > 1 ? 'rooms ' + nos[0] + '–' + nos[nos.length - 1] : 'room ' + nos[0]}`);
      };
    });
  };
  R.act.delRoom = d => {
    if (!guard('settings')) return;
    const room = R.room(d.no);
    if (openStays(room.no).length) return R.toast(`Room ${room.no} has current or future bookings. Move them first.`, 'warn');
    if (everUsedRoom(room.no)) return R.toast(`Room ${room.no} has booking history, so it can't be deleted. Take it out of order instead.`, 'warn');
    R.confirm('Delete room?', `Room ${esc(room.no)} has never been booked and will be removed.`, 'Delete room', () => { R.S.rooms = R.S.rooms.filter(r => r !== room); R.log('Room deleted', room.no); R.rerender(); }, true);
  };

  // buildings and map blocks
  R.act.setZone = (d, el) => {
    if (!guard('settings')) return R.render();
    const z = R.S.zones.find(x => x.id === d.id);
    if (d.f === 'name') { if (el.value.trim().length < 2) { R.toast('Enter a name', 'warn'); return R.render(); } z.name = el.value.trim(); }
    else if (d.f === 'span') z.span = +el.value; else z[d.f] = el.value;
    R.log('Map', `${z.name}: ${d.f} = ${el.value}`); R.rerender();
  };
  R.act.moveZone = d => {
    if (!guard('settings')) return;
    const i = R.S.zones.findIndex(z => z.id === d.id), j = i + +d.n;
    if (j < 0 || j >= R.S.zones.length) return;
    [R.S.zones[i], R.S.zones[j]] = [R.S.zones[j], R.S.zones[i]];
    R.log('Map', `${R.S.zones[j].name} moved ${+d.n < 0 ? 'up' : 'down'}`); R.rerender();
  };
  R.act.addZone = d => {
    if (!guard('settings')) return;
    const feat = d.kind === 'feature';
    R.S.zones.push(feat ? { id: R.nextId('Z'), name: 'Garden', kind: 'feature', style: 'garden', span: 3 } : { id: R.nextId('Z'), name: 'New building', kind: 'building', span: 3 });
    R.log('Map', feat ? 'Area added' : 'Building added'); R.rerender(); R.toast(feat ? 'Area added at the end of the map. Rename it and move it into place.' : 'Building added. Rename it, then add rooms to it.');
  };
  R.act.delZone = d => {
    if (!guard('settings')) return;
    const z = R.S.zones.find(x => x.id === d.id), n = R.S.rooms.filter(r => r.zone === z.id).length;
    if (n) return R.toast(`${z.name} still has ${n} room(s). Move them to another building first.`, 'warn');
    R.confirm(`Remove ${esc(z.name)}?`, 'It disappears from the property map.', 'Remove', () => { R.S.zones = R.S.zones.filter(x => x !== z); R.log('Map', `${z.name} removed`); R.rerender(); }, true);
  };

  // cottages and entrance fees
  R.act.setCot = (d, el) => {
    if (!guard('settings')) return R.render();
    const c = R.venue(d.id), f = d.f;
    let v = el.value.trim();
    if (f === 'cap' || f === 'price') { v = Math.round(+v); if (!(v > 0)) { R.toast('Enter a number above 0', 'warn'); return R.render(); } }
    if (f === 'name' && v.length < 2) { R.toast('Enter a name', 'warn'); return R.render(); }
    R.log('Cottage', `${c.name}: ${f} ${c[f]} → ${v}`); c[f] = v; R.rerender(); R.toast('Saved');
  };
  R.act.addCot = () => {
    if (!guard('settings')) return;
    const n = R.S.dayuse.cottages.filter(c => c.kind === 'Kubo').length + 1;
    R.S.dayuse.cottages.push({ id: R.nextId('K'), name: 'Kubo ' + n, kind: 'Kubo', cap: 8, price: 500 });
    R.log('Cottage added', 'Kubo ' + n); R.rerender(); R.toast(`Kubo ${n} added. Edit its name, size and price below.`);
  };
  R.act.delCot = d => {
    if (!guard('settings')) return;
    const c = R.venue(d.id);
    if (cottageUsed(c.id)) return R.toast(`${c.name} has sales or reservations on record, so it can't be deleted.`, 'warn');
    R.confirm('Delete cottage?', `${esc(c.name)} has never been sold or reserved.`, 'Delete', () => { R.S.dayuse.cottages = R.S.dayuse.cottages.filter(x => x !== c); R.log('Cottage deleted', c.name); R.rerender(); }, true);
  };
  R.act.setEntrance = (d, el) => {
    if (!guard('settings')) return R.render();
    const v = Math.max(0, Math.round(+el.value || 0)); R.log('Entrance fee', `${d.s} ${d.k}: ${R.S.dayuse.entrance[d.s][d.k]} → ${v}`);
    R.S.dayuse.entrance[d.s][d.k] = v; R.rerender(); R.toast('Saved');
  };

  function rates(can) {
    const days = Array.from({ length: 14 }, (_, i) => addDays(R.bd(), i)), dis = can ? '' : 'disabled';
    const inp = (t, f, w, type) => can ? `<input class="search" ${type ? 'type="number" min="1"' : ''} style="width:${w}px" value="${esc(t[f])}" data-change="setType" data-id="${t.id}" data-f="${f}" aria-label="${esc(t.name)} ${f}">` : esc(f === 'base' ? R.money(t[f]) : t[f]);
    return `<div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Room types</h2><div class="sp">${can ? `<button class="btn sm" data-act="addType">${R.icon('plus')}Add room type</button>` : ''}</div></div>
      <p class="small muted" style="margin-bottom:8px">Changes apply to new bookings. Existing bookings keep their prices. Add or move rooms in <button class="linkish" data-act="sTab" data-tab="layout">Property layout</button>.</p>
      <div class="tbl"><table><thead><tr><th>Name</th><th>Rooms</th><th>Sleeps</th><th>Size</th><th>Beds</th><th>View</th><th>Base rate (₱)</th><th></th></tr></thead><tbody>
      ${R.S.roomTypes.map(t => `<tr><td>${inp(t, 'name', 170)}</td><td>${R.S.rooms.filter(r => r.type === t.id).length}</td><td>${inp(t, 'cap', 64, 1)}</td><td>${inp(t, 'size', 80)}</td><td>${inp(t, 'bed', 140)}</td><td>${inp(t, 'view', 120)}</td><td>${inp(t, 'base', 96, 1)}</td>
        <td class="right">${can ? `<button class="btn sm ghost" data-act="delType" data-id="${t.id}" aria-label="Delete ${esc(t.name)}" ${dis}>Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><h2>Selling price, next 14 nights</h2><p class="small muted" style="margin-bottom:8px">Base rate with the season applied. This is what new bookings are quoted.</p><div class="tbl"><table><thead><tr><th>Type</th>${days.map(d => `<th class="small">${R.fmtShort(d)}</th>`).join('')}</tr></thead><tbody>
      ${R.S.roomTypes.map(t => `<tr><td><b>${esc(t.name)}</b></td>${days.map(d => { const p = R.priceOn(t.id, d), s = R.seasonOn(d); return `<td class="small num ${s ? (s.pct > 0 ? 'up' : 'down') : ''}" title="${s ? esc(s.name) : 'Base rate'}">${R.money(p)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }

  function layout(can) {
    const bs = R.S.zones.filter(z => z.kind === 'building'), dis = can ? '' : 'disabled';
    const zrow = (z, i) => `<div class="layout-row"><span class="chip ${z.kind === 'feature' ? 'teal' : ''}">${z.kind === 'feature' ? 'Area' : 'Building'}</span>
      <input class="search" value="${esc(z.name)}" data-change="setZone" data-id="${z.id}" data-f="name" ${dis} aria-label="Name">
      ${z.kind === 'feature' ? `<select class="search" data-change="setZone" data-id="${z.id}" data-f="style" ${dis} aria-label="Look">${FEATURES.map(([k, l]) => `<option value="${k}" ${k === z.style ? 'selected' : ''}>${l}</option>`).join('')}</select>` : `<span class="small muted">${R.S.rooms.filter(r => r.zone === z.id).length} rooms</span>`}
      <select class="search" data-change="setZone" data-id="${z.id}" data-f="span" ${dis} aria-label="Width on the map">${SPANS.map(([v, l]) => `<option value="${v}" ${v === z.span ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${can ? `<span class="row"><button class="btn sm ghost" data-act="moveZone" data-id="${z.id}" data-n="-1" ${i ? '' : 'disabled'} aria-label="Move ${esc(z.name)} up">↑</button><button class="btn sm ghost" data-act="moveZone" data-id="${z.id}" data-n="1" ${i < R.S.zones.length - 1 ? '' : 'disabled'} aria-label="Move ${esc(z.name)} down">↓</button><button class="btn sm ghost warn-text" data-act="delZone" data-id="${z.id}">Remove</button></span>` : ''}</div>`;
    const rooms = R.S.zones.filter(z => z.kind === 'building').flatMap(z => R.S.rooms.filter(r => r.zone === z.id)).concat(R.S.rooms.filter(r => !bs.some(z => z.id === r.zone)));
    const E = R.S.dayuse.entrance, ent = (s, k) => `<input class="search" type="number" min="0" style="width:90px" value="${E[s][k]}" data-change="setEntrance" data-s="${s}" data-k="${k}" ${dis} aria-label="${s} ${k} entrance">`;
    const cin = (c, f, w, n) => `<input class="search" ${n ? 'type="number" min="1"' : ''} style="width:${w}px" value="${esc(c[f])}" data-change="setCot" data-id="${c.id}" data-f="${f}" ${dis} aria-label="${esc(c.name)} ${f}">`;
    return `<div class="grid g-side" style="margin-bottom:16px">
        <div class="panel"><div class="ph"><h2>Buildings and map</h2><div class="sp">${can ? '<button class="btn sm ghost" data-act="addZone" data-kind="feature">Add area</button><button class="btn sm" data-act="addZone" data-kind="building">' + R.icon('plus') + 'Add building</button>' : ''}</div></div>
          <p class="small muted" style="margin-bottom:10px">Top to bottom is the order on the map. Blocks fill each row left to right: two halves or three smalls make one row. Areas (pool, garden) are landmarks without rooms.</p>
          ${R.S.zones.map(zrow).join('')}</div>
        <div class="panel"><h2>Preview</h2><div class="map-preview">${R.mapHTML({ preview: true })}</div></div></div>
      <div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Rooms</h2><span class="small muted">${R.S.rooms.length} rooms</span><div class="sp">${can ? `<button class="btn sm" data-act="addRoom">${R.icon('plus')}Add rooms</button>` : ''}</div></div>
        <p class="small muted" style="margin-bottom:8px">Renumbering a room updates its bookings and tasks. A room with booking history can't be deleted: take it out of order instead.</p>
        <div class="tbl"><table><thead><tr><th>Room</th><th>Type</th><th>Building</th><th>Status</th><th class="right">Bookings ahead</th><th></th></tr></thead><tbody>
        ${rooms.map(r => `<tr><td><input class="search" style="width:80px" value="${esc(r.no)}" data-change="setRoom" data-no="${esc(r.no)}" data-f="no" ${dis} aria-label="Room number"></td>
          <td><select class="search" data-change="setRoom" data-no="${esc(r.no)}" data-f="type" ${dis} aria-label="Room ${esc(r.no)} type">${R.S.roomTypes.map(t => `<option value="${t.id}" ${t.id === r.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></td>
          <td><select class="search" data-change="setRoom" data-no="${esc(r.no)}" data-f="zone" ${dis} aria-label="Room ${esc(r.no)} building">${bs.map(z => `<option value="${z.id}" ${z.id === r.zone ? 'selected' : ''}>${esc(z.name)}</option>`).join('')}</select></td>
          <td>${R.roomState(r).cls === 'ooo' ? R.chip('ooo') : `<span class="chip">${R.roomState(r).code}</span>`}</td><td class="right">${openStays(r.no).length}</td>
          <td class="right">${can ? `<button class="btn sm ghost" data-act="delRoom" data-no="${esc(r.no)}" aria-label="Delete room ${esc(r.no)}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="grid g-side"><div class="panel"><div class="ph"><h2>Cottages and pavilion</h2><div class="sp">${can ? `<button class="btn sm" data-act="addCot">${R.icon('plus')}Add cottage</button>` : ''}</div></div>
          <div class="tbl"><table><thead><tr><th>Name</th><th>Kind</th><th>Holds</th><th>Price (₱)</th><th></th></tr></thead><tbody>
          ${R.S.dayuse.cottages.map(c => `<tr><td>${cin(c, 'name', 150)}</td><td>${cin(c, 'kind', 130)}</td><td>${cin(c, 'cap', 64, 1)}</td><td>${cin(c, 'price', 90, 1)}</td><td class="right">${can ? `<button class="btn sm ghost" data-act="delCot" data-id="${c.id}" aria-label="Delete ${esc(c.name)}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="panel"><h2>Entrance fees (₱)</h2><table><thead><tr><th></th><th>Adult</th><th>Child 3–12</th></tr></thead><tbody>
          <tr><td>Day tour</td><td>${ent('day', 'adult')}</td><td>${ent('day', 'child')}</td></tr><tr><td>Night swim</td><td>${ent('night', 'adult')}</td><td>${ent('night', 'child')}</td></tr></tbody></table>
          <p class="small muted" style="margin-top:8px">Seniors and PWDs pay the adult price less their discount. Below 3 is free. Rentals and fees can be added to the price list in the real build.</p></div></div>`;
  }

  function seasons(can) {
    const dis = can ? '' : 'disabled';
    return `<div class="panel"><div class="ph"><h2>Seasons</h2><div class="sp">${can ? '<button class="btn sm" data-act="addSeason">Add season</button>' : ''}</div></div>
      <p class="small muted" style="margin-bottom:8px">Raise or lower the base rate for set dates. Dates are month-day and can run over New Year (12-20 to 01-02). The first matching season in the list wins.</p>
      <div class="tbl"><table><thead><tr><th>Name</th><th>From</th><th>To</th><th>Change %</th><th>Weeknights only</th><th></th></tr></thead><tbody>
      ${R.S.seasons.map(s => `<tr><td><input class="search" value="${esc(s.name)}" data-change="setSeason" data-id="${s.id}" data-f="name" ${dis} aria-label="Season name">${s.note ? `<div class="small muted">${esc(s.note)}</div>` : ''}</td>
        <td><input class="search" style="width:80px" value="${s.from}" data-change="setSeason" data-id="${s.id}" data-f="from" ${dis} aria-label="From (MM-DD)"></td>
        <td><input class="search" style="width:80px" value="${s.to}" data-change="setSeason" data-id="${s.id}" data-f="to" ${dis} aria-label="To (MM-DD)"></td>
        <td><input class="search" type="number" style="width:80px" value="${s.pct}" data-change="setSeason" data-id="${s.id}" data-f="pct" ${dis} aria-label="Change percent"></td>
        <td><input type="checkbox" ${s.weekdays ? 'checked' : ''} data-change="setSeason" data-id="${s.id}" data-f="weekdays" ${dis} aria-label="Sunday to Thursday nights only"></td>
        <td class="right">${can ? `<button class="btn sm ghost" data-act="delSeason" data-id="${s.id}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function rules(can) {
    const r = R.S.rules, f = (k, l, type) => `<label class="field ${type === 'long' ? 'full' : ''}">${l}<input ${type === 'num' ? 'type="number" min="0" max="100"' : ''} value="${esc(r[k])}" data-change="setRule" data-k="${k}" ${can ? '' : 'disabled'}></label>`;
    return `<div class="panel"><h2>House rules</h2><div class="form">${f('checkin', 'Check-in time')}${f('checkout', 'Check-out time')}${f('deposit', 'Deposit to confirm (%)', 'num')}<div></div>${f('cancellation', 'Cancellation policy', 'long')}${f('noshow', 'No-show policy', 'long')}</div>
      <dl class="kv" style="margin-top:16px"><dt>Tax</dt><dd>Prices include 12% VAT</dd><dt>Senior / PWD</dt><dd>20% discount and VAT exemption on their share, with valid ID (RA 9994, RA 10754)</dd>
      <dt>Day tour</dt><dd>${esc(R.S.dayuse.hours.day)} · night swim ${esc(R.S.dayuse.hours.night)} · corkage applies to outside lechon and drinks</dd></dl>
      <h3 style="margin:18px 0 8px">Daily manager report</h3>
      <div class="form"><label class="full check"><input type="checkbox" ${R.S.notify.on ? 'checked' : ''} data-change="setNotify" data-k="on" ${can ? '' : 'disabled'}> Send the report automatically after each night audit</label>
        <label class="field">Send to (name and mobile or email)<input value="${esc(R.S.notify.to)}" data-change="setNotify" data-k="to" ${can ? '' : 'disabled'}></label>
        <label class="field">Latest time<input type="time" value="${esc(R.S.notify.time)}" data-change="setNotify" data-k="time" ${can ? '' : 'disabled'}></label></div>
      <h3 style="margin:18px 0 8px">Overnight guests in the day-tour area</h3>
      <label class="check"><input type="checkbox" ${R.S.rules.guestEntranceFree ? 'checked' : ''} data-change="setGuestFree" ${can ? '' : 'disabled'}> Entrance is free for the people on a room booking (visitors still pay)</label>
      <p class="small muted" style="margin-top:6px">Cottages are at the regular price for everyone. Use a voucher or an approved discount to lower it.</p></div>`;
  }
  function vouchers(can) {
    const dis = can ? '' : 'disabled';
    return `<div class="panel"><div class="ph"><h2>Vouchers</h2><div class="sp">${can ? `<button class="btn sm" data-act="addVoucher">${R.icon('plus')}Add voucher</button>` : ''}</div></div>
      <p class="small muted" style="margin-bottom:8px">Codes the cashier types on Day pass. They lower the cottage price only. Without a code, a discount needs a supervisor's PIN and a reason.</p>
      <div class="tbl"><table><thead><tr><th>Code</th><th>Description</th><th>Type</th><th>Value</th><th class="right">Used</th><th>Active</th></tr></thead><tbody>
      ${R.S.vouchers.map(v => `<tr><td><b>${esc(v.code)}</b></td><td><input class="search" value="${esc(v.label)}" data-change="setVoucher" data-code="${esc(v.code)}" data-f="label" ${dis} aria-label="${esc(v.code)} description"></td>
        <td class="small">${v.kind === 'pct' ? 'Percent off' : 'Peso amount off'}</td><td><input class="search" type="number" min="1" style="width:90px" value="${v.value}" data-change="setVoucher" data-code="${esc(v.code)}" data-f="value" ${dis} aria-label="${esc(v.code)} value"></td>
        <td class="right">${v.uses}</td><td><input type="checkbox" ${v.active ? 'checked' : ''} data-change="setVoucher" data-code="${esc(v.code)}" data-f="active" ${dis} aria-label="${esc(v.code)} active"></td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function sources(can) {
    return `<div class="panel"><div class="ph"><h2>Booking sources</h2><div class="sp">${can ? '<button class="btn sm" data-act="addSource">Add source</button>' : ''}</div></div>
      <p class="small muted" style="margin-bottom:8px">Where bookings come from. Commission is used to report net revenue. A live link to Agoda and Booking.com needs a channel manager, which is planned for the real build.</p>
      <div class="tbl"><table><thead><tr><th>Source</th><th>Commission %</th><th class="right">Bookings on file</th></tr></thead><tbody>
      ${R.S.sources.map(s => `<tr><td><b>${esc(s.name)}</b></td><td><input class="search" type="number" min="0" style="width:80px" value="${s.commission}" data-change="setFee" data-n="${esc(s.name)}" ${can ? '' : 'disabled'} aria-label="${esc(s.name)} commission"></td><td class="right">${R.S.reservations.filter(r => r.channel === s.name).length}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function users() {
    const can = R.can('admin'), perms = Object.keys(R.PERMS);
    return `<div class="panel" style="margin-bottom:16px"><div class="ph"><h2>Staff accounts</h2><div class="sp">${can ? '<button class="btn sm" data-act="addUser">Add account</button>' : '<span class="small muted">Only the owner can change accounts</span>'}</div></div>
      <div class="tbl"><table><thead><tr><th>Name</th><th>Job title</th><th>Role</th><th>Active</th></tr></thead><tbody>
      ${R.S.staff.map(s => `<tr class="${s.active ? '' : 'voided'}"><td><div class="row"><span class="avatar sm">${R.initials(s.name)}</span><b>${esc(s.name)}</b></div></td><td class="small">${esc(s.title)}<div class="muted">${esc(s.dept)}</div></td>
        <td>${can ? `<select class="search" data-change="setRole" data-id="${s.id}" aria-label="Role of ${esc(s.name)}">${Object.entries(R.ROLES).map(([k, r]) => `<option value="${k}" ${k === s.roleKey ? 'selected' : ''}>${r.name}</option>`).join('')}</select>` : esc(R.ROLES[s.roleKey].name)}</td>
        <td><input type="checkbox" ${s.active ? 'checked' : ''} data-change="setActive" data-id="${s.id}" ${can ? '' : 'disabled'} aria-label="${esc(s.name)} active"></td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><h2>What each role can do</h2><p class="small muted" style="margin-bottom:8px">When someone without a permission tries a risky action (void, refund, lower rate), a supervisor approves on the spot with their PIN. Every approval is in the audit log.</p>
      <div class="tbl"><table class="matrix"><thead><tr><th>Permission</th>${Object.values(R.ROLES).map(r => `<th class="vert"><span>${r.name}</span></th>`).join('')}</tr></thead><tbody>
      ${perms.map(p => `<tr><td class="small">${R.PERMS[p]}</td>${Object.values(R.ROLES).map(r => `<td class="center">${r.perms === '*' || r.perms.includes(p) ? '<span class="yes" aria-label="Yes">✓</span>' : '<span class="sr">No</span>'}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <h3 style="margin:16px 0 6px">Roles in plain words</h3>${Object.values(R.ROLES).map(r => `<div class="list-item"><b style="min-width:190px">${r.name}</b><div class="grow small muted">${r.does}</div></div>`).join('')}</div>`;
  }
  function modules() {
    const can = R.can('admin');
    const M = [['fnb', 'Restaurant & bar', 'Point of sale for the restaurant, poolside bar and room service. Charges go to the room bill or get a receipt.'],
      ['activities', 'Activities & spa', 'Session times and places left for massage, videoke, lessons and events. Most resorts can use "Add charge" instead.'],
      ['guestapp', 'Guest app', 'QR code in each room: requests, room service, activities and express check-out with GCash or card.'],
      ['roster', 'Staff roster', 'Weekly shifts per person, who is on duty today, and warnings when a team has nobody on. Off until Camsair is ready to plan shifts here.']];
    return `<div class="panel"><h2>Add-on modules</h2><p class="small muted" style="margin-bottom:8px">Keep the system simple: switch on only what Camsair uses. Switched-off modules disappear from the menu for everyone.</p>
      ${M.map(([k, n, t]) => `<label class="list-item module"><input type="checkbox" ${R.S.modules[k] ? 'checked' : ''} data-change="setModule" data-m="${k}" ${can ? '' : 'disabled'}><div class="grow"><b>${n}</b><div class="small muted">${t}</div></div>${R.S.modules[k] ? '<span class="chip green">On</span>' : '<span class="chip">Off</span>'}</label>`).join('')}
      ${can ? '' : '<p class="small muted" style="margin-top:8px">Only the owner can switch modules.</p>'}</div>`;
  }
  function audit() {
    const q = logQ.toLowerCase();
    const L = R.S.audit.filter(a => !q || (a.action + ' ' + a.detail + ' ' + a.ref + ' ' + R.staff(a.user).name).toLowerCase().includes(q));
    return `<div class="panel"><div class="ph"><input class="search" id="logQ" placeholder="Filter by person, action or booking no." value="${esc(logQ)}" aria-label="Filter audit log"><div class="sp small muted">${L.length} entries</div></div>
      <div class="tbl"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th><th>Ref</th></tr></thead><tbody>
      ${L.slice(0, 200).map(a => `<tr><td class="small nowrap">${R.fmtShort(a.date)} ${a.at}</td><td class="small">${esc(R.staff(a.user).name)}</td><td><b>${esc(a.action)}</b></td><td class="small">${esc(a.detail)}</td><td class="small">${R.res(a.ref) ? `<a href="#booking/${a.ref}">${a.ref}</a>` : esc(a.ref)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing logged yet. Every change you make in the demo appears here.</td></tr>'}
      </tbody></table></div></div>`;
  }

  R.views.settings = {
    title: 'Settings',
    hint: 'Rates, seasons and house rules for managers. Users and modules for the owner. Everything changed here is logged.',
    render() {
      const can = R.can('settings');
      const tabs = [['rates', 'Rooms & rates'], ['layout', 'Property layout'], ['seasons', 'Seasons'], ['rules', 'House rules'], ['sources', 'Booking sources'], ['vouchers', 'Vouchers'], ['users', 'Users & roles'], ['modules', 'Modules'], ['audit', 'Audit log']];
      return `<div class="tabs">${tabs.map(([k, l]) => `<button class="${sTab === k ? 'on' : ''}" aria-pressed="${sTab === k}" data-act="sTab" data-tab="${k}">${l}</button>`).join('')}</div>
        ${can ? '' : '<p class="small muted" style="margin-bottom:10px">View only.</p>'}
        ${{ rates, layout, seasons, rules, sources, vouchers, users, modules, audit }[sTab](can)}`;
    },
    mount(el) {
      const s = el.querySelector('#logQ');
      if (s) s.addEventListener('input', () => { logQ = s.value; const p = s.selectionStart; R.render(); const n = document.getElementById('logQ'); n.focus(); n.setSelectionRange(p, p); });
    }
  };
})();
