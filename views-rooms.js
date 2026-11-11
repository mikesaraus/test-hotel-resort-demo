/* Rooms side: property map, housekeeping, guest requests, maintenance */
(function () {
  const { addDays, TODAY } = R.util;
  const esc = R.esc;
  const SHORT = { clean: 'Clean', inspected: 'Ready', dirty: 'Dirty', ooo: 'Blocked' };
  const nextArrival = no => R.live().filter(r => r.room === no && r.status === 'booked' && r.arrive >= TODAY).sort((a, b) => a.arrive.localeCompare(b.arrive))[0];

  // ---------- room dialog ----------
  R.act.openRoom = d => R.openRoom(d.no);
  R.openRoom = function (no) {
    const room = R.room(no), t = R.type(room.type), ih = R.inhouseIn(no), na = nextArrival(no);
    const tk = R.S.tickets.filter(x => x.room === no && x.status !== 'done');
    R.modal(`Room ${no} — ${t.name}`, `
      <div class="row" style="margin-bottom:12px">${R.chip(room.hk)} ${ih ? '<span class="chip ink">Guest in room</span>' : '<span class="chip">Vacant</span>'}</div>
      <dl class="kv">
        <dt>Size &amp; bed</dt><dd>${t.size} · ${esc(t.bed)} · sleeps ${t.cap}</dd>
        <dt>View</dt><dd>${esc(t.view)}</dd>
        <dt>Guest now</dt><dd>${ih ? `<a href="#" data-act="openRes" data-id="${ih.id}">${esc(R.guest(ih.guestId).name)}</a> until ${R.fmt(R.dep(ih))}` : '—'}</dd>
        <dt>Next arrival</dt><dd>${na ? `<a href="#" data-act="openRes" data-id="${na.id}">${esc(R.guest(na.guestId).name)}</a> on ${R.fmt(na.arrive)}` : 'None booked'}</dd>
        <dt>Attendant</dt><dd><select id="rmAtt"><option value="">Unassigned</option>${R.S.staff.filter(s => s.dept === 'Housekeeping' && s.role === 'Room attendant').map(s => `<option value="${s.id}" ${room.attendant === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></dd>
        ${room.note ? `<dt>Note</dt><dd>${esc(room.note)}</dd>` : ''}
        ${tk.length ? `<dt>Open repairs</dt><dd>${tk.map(x => esc(x.title)).join(', ')}</dd>` : ''}
      </dl>
      <div class="foot" style="flex-wrap:wrap">
        <button class="btn ghost" data-act="newTicket" data-room="${no}">Report a problem</button>
        ${room.hk === 'ooo' ? `<button class="btn" data-act="setHk" data-no="${no}" data-hk="dirty">Back in service</button>` : `
        <button class="btn ghost" data-act="setHk" data-no="${no}" data-hk="dirty" ${room.hk === 'dirty' ? 'disabled' : ''}>Needs cleaning</button>
        <button class="btn ghost" data-act="setHk" data-no="${no}" data-hk="clean" ${room.hk === 'clean' ? 'disabled' : ''}>Mark clean</button>
        <button class="btn" data-act="setHk" data-no="${no}" data-hk="inspected" ${room.hk === 'inspected' ? 'disabled' : ''}>Inspected — ready</button>`}
      </div>`, b => {
      b.querySelector('#rmAtt').addEventListener('change', e => { room.attendant = e.target.value || null; R.save(); R.toast(`Room ${no} given to ${R.staff(room.attendant).name}`); R.render(); });
    });
  };
  R.act.setHk = d => {
    const room = R.room(d.no);
    if (d.hk !== 'ooo' && room.hk === 'ooo') { room.note = ''; R.S.tickets.forEach(t => { if (t.room === d.no && t.blocks) t.blocks = false; }); }
    room.hk = d.hk;
    R.closeModal(); R.rerender();
    R.toast(`Room ${d.no}: ${R.chip(d.hk).replace(/<[^>]+>/g, '')}`);
    const tile = document.querySelector(`.tile[data-no="${d.no}"]`);
    if (tile) tile.classList.add('flash');
  };

  // ---------- Property map ----------
  let mapFilter = '';
  R.act.mapFilter = d => { mapFilter = mapFilter === d.f ? '' : d.f; R.render(); };
  R.views.map = {
    title: 'Property map',
    hint: 'Every room at the resort, coloured by its cleaning status. A dark line along the bottom means a guest is in the room.',
    how: ['Each tile is a room, laid out by building from the garden down to the beach.', 'Click a room to see who is in it, who arrives next, and to change its status.', 'Click a status in the key to show only those rooms.'],
    render() {
      const counts = {}; R.S.rooms.forEach(r => counts[r.hk] = (counts[r.hk] || 0) + 1);
      const tile = room => {
        const ih = R.inhouseIn(room.no), na = nextArrival(room.no);
        const arrToday = na && na.arrive === TODAY;
        const dim = mapFilter && room.hk !== mapFilter ? 'opacity:.25' : '';
        return `<button class="tile st-${room.hk} ${ih ? 'occ' : ''} ${room.zone === 'beach' || room.zone === 'pool' ? 'villa' : ''}" style="${dim}" data-act="openRoom" data-no="${room.no}" aria-label="Room ${room.no}, ${SHORT[room.hk]}${ih ? ', occupied' : ''}${arrToday ? ', arrival today' : ''}">
          <b>${room.no}</b><i>${SHORT[room.hk]}${arrToday ? ' · Arr' : ''}</i></button>`;
      };
      const zone = z => {
        const rs = R.S.rooms.filter(r => r.zone === z.id);
        return `<div class="zone z-${z.id}"><h3>${esc(z.name)} <span>${rs.filter(r => R.inhouseIn(r.no)).length}/${rs.length} occupied</span></h3><div class="tiles">${rs.map(tile).join('')}</div></div>`;
      };
      const key = [['inspected', 'Ready for guests'], ['clean', 'Clean, not yet inspected'], ['dirty', 'Needs cleaning'], ['ooo', 'Out of order']];
      return `<div class="legend">${key.map(([k, l]) => `<span><button class="chip ${mapFilter === k ? 'ink' : ''}" style="border:0;cursor:pointer" data-act="mapFilter" data-f="${k}"><i class="st-${k}" style="width:10px;height:10px;border-radius:3px;border:2px solid;display:inline-block;margin-right:4px;vertical-align:-1px"></i>${l} · ${counts[k] || 0}</button></span>`).join('')}
        <span class="muted">"Arr" = guest arriving today</span></div>
        <div class="bay"><div class="zones">${['garden', 'ocean', 'family', 'pool', 'beach'].map(id => zone(R.S.zones.find(z => z.id === id))).join('')}</div>
        <span class="sea-label">Kalinaw Bay</span></div>`;
    }
  };

  // ---------- Housekeeping ----------
  R.act.hkAuto = () => {
    const att = R.S.staff.filter(s => s.role === 'Room attendant').map(s => s.id);
    let i = 0;
    R.S.rooms.filter(r => r.hk === 'dirty').forEach(r => { r.attendant = att[i++ % att.length]; });
    R.rerender(); R.toast('Dirty rooms shared evenly between attendants');
  };
  R.views.housekeeping = {
    title: 'Housekeeping',
    hint: "Each attendant's list for today. Rooms with a guest arriving today come first.",
    how: ['When a guest checks out, their room appears here as "needs cleaning".', 'The attendant taps "Cleaned" on their phone. A supervisor then taps "Inspected" and the room is ready to sell.', 'Front desk can check guests in as soon as the room is clean or ready.'],
    render() {
      const att = R.S.staff.filter(s => s.role === 'Room attendant');
      const prio = r => { const na = nextArrival(r.no); return na && na.arrive === TODAY ? 0 : R.inhouseIn(r.no) ? 2 : 1; };
      const card = r => {
        const na = nextArrival(r.no), ih = R.inhouseIn(r.no);
        const why = na && na.arrive === TODAY ? `<span class="chip red">Arrival ${na.eta}</span>` : ih ? '<span class="chip">Stay-over</span>' : '<span class="chip">Vacant</span>';
        return `<div class="list-item"><button class="tile st-${r.hk}" style="width:52px;height:44px" data-act="openRoom" data-no="${r.no}"><b>${r.no}</b></button>
          <div class="grow small">${esc(R.type(r.type).name)}<div class="row" style="margin-top:2px">${R.chip(r.hk)} ${why}</div></div>
          ${r.hk === 'dirty' ? `<button class="btn sm" data-act="setHk" data-no="${r.no}" data-hk="clean">Cleaned</button>` : `<button class="btn sm ghost" data-act="setHk" data-no="${r.no}" data-hk="inspected">Inspected</button>`}</div>`;
      };
      const work = R.S.rooms.filter(r => r.hk === 'dirty' || r.hk === 'clean');
      const col = (name, sub, list) => `<div class="panel"><div class="ph"><span class="avatar">${R.initials(name)}</span><div><h2>${esc(name)}</h2><span class="small muted">${sub}</span></div></div>
        ${list.sort((a, b) => prio(a) - prio(b)).map(card).join('') || '<p class="empty">List finished 🎉</p>'}</div>`;
      const un = work.filter(r => !r.attendant);
      return `<div class="row" style="margin-bottom:12px"><span class="muted">${work.filter(r => r.hk === 'dirty').length} to clean · ${work.filter(r => r.hk === 'clean').length} waiting for inspection · ${R.S.rooms.filter(r => r.hk === 'inspected').length} ready</span>
        <button class="btn ghost sm" style="margin-left:auto" data-act="hkAuto">Share out dirty rooms evenly</button></div>
        <div class="grid g3">${att.map(s => { const l = work.filter(r => r.attendant === s.id); return col(s.name, `${l.filter(r => r.hk === 'dirty').length} to clean`, l); }).join('')}
        ${un.length ? col('Unassigned', 'Give these to someone', un) : ''}</div>`;
    }
  };

  // ---------- Guest requests ----------
  R.act.reqStatus = d => {
    const q = R.S.requests.find(x => x.id === d.id); q.status = d.s;
    R.rerender(); R.toast(d.s === 'done' ? 'Request done — the guest gets a notification' : 'Request accepted');
  };
  R.views.requests = {
    title: 'Guest requests',
    hint: 'Requests from the guest phone app and the front desk, sent to the team who handles them.',
    how: ['Guests send requests from the phone app (try it under "Guest phone app").', 'Each request goes to the right team: housekeeping, front office, restaurant or maintenance.', 'Marking a request done tells the guest straight away.'],
    render() {
      const sorted = R.S.requests.slice().sort((a, b) => ['new', 'in_progress', 'done'].indexOf(a.status) - ['new', 'in_progress', 'done'].indexOf(b.status));
      return `<div class="panel"><table><thead><tr><th>Time</th><th>Request</th><th>Room</th><th>Team</th><th>Status</th><th></th></tr></thead><tbody>
        ${sorted.map(q => { const r = R.res(q.resId); return `<tr><td class="num">${q.at}</td><td><b>${esc(q.text)}</b><div class="small muted">${esc(R.guest(r.guestId).name)}</div></td><td>${r.room}</td><td>${esc(q.dept)}</td><td>${R.chip(q.status)}</td>
          <td class="right">${q.status === 'new' ? `<button class="btn sm ghost" data-act="reqStatus" data-id="${q.id}" data-s="in_progress">Accept</button>` : ''}${q.status !== 'done' ? ` <button class="btn sm" data-act="reqStatus" data-id="${q.id}" data-s="done">Done</button>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
  };

  // ---------- Maintenance ----------
  R.act.newTicket = d => {
    R.modal('Report a problem', `<div class="form">
      <label class="field">Room or area<select id="tkRoom">${['Pool area', 'Lobby', 'Restaurant', 'Spa'].concat(R.S.rooms.map(r => r.no)).map(x => `<option ${x === d.room ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="field">Priority<select id="tkPr"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      <label class="field full">What's wrong?<input id="tkTitle" value="Air-con not cooling"></label>
      <label class="full row small"><input type="checkbox" id="tkBlock"> Block this room so nobody can be checked in until it's fixed</label></div>
      <div class="foot"><button class="btn ghost" id="tkCancel">Cancel</button><button class="btn" id="tkGo">Send to maintenance</button></div>`, b => {
      b.querySelector('#tkCancel').onclick = R.closeModal;
      b.querySelector('#tkGo').onclick = () => {
        const room = b.querySelector('#tkRoom').value, block = b.querySelector('#tkBlock').checked && !!R.room(room);
        const t = { id: R.nextId('T'), room, title: b.querySelector('#tkTitle').value, priority: b.querySelector('#tkPr').value, status: 'open', by: 'Staff', assignee: 'S9', created: TODAY, blocks: block };
        R.S.tickets.unshift(t);
        if (block) { if (R.inhouseIn(room)) R.toast('A guest is still in this room — move them before blocking'); else { R.room(room).hk = 'ooo'; R.room(room).note = t.title; } }
        R.closeModal(); R.rerender(); R.toast(`Ticket ${t.id} sent to ${R.staff('S9').name}`);
      };
    });
  };
  R.act.tkStatus = d => {
    const t = R.S.tickets.find(x => x.id === d.id); t.status = d.s;
    if (d.s === 'done' && t.blocks && R.room(t.room)) { R.room(t.room).hk = 'dirty'; R.room(t.room).note = ''; t.blocks = false; R.toast(`Fixed. Room ${t.room} is back in service and sent for cleaning.`); }
    else R.toast(`Ticket ${t.id}: ${R.chip(d.s).replace(/<[^>]+>/g, '')}`);
    R.rerender();
  };
  R.views.maintenance = {
    title: 'Maintenance',
    hint: 'Repairs reported by staff and guests, from first report to fixed.',
    how: ['Anyone can report a problem: front desk, housekeeping, or a guest in the app.', 'Urgent repairs can block the room so it can\'t be sold or checked into.', 'When the repair is done, the room goes back to housekeeping for cleaning, then becomes sellable again.'],
    render() {
      const order = ['open', 'in_progress', 'waiting', 'done'];
      const L = R.S.tickets.slice().sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
      const next = { open: ['in_progress', 'Start'], in_progress: ['done', 'Mark fixed'], waiting: ['done', 'Mark fixed'] };
      return `<div class="panel"><div class="ph"><h2>${L.filter(t => t.status !== 'done').length} open repairs</h2><div class="sp"><button class="btn" data-act="newTicket">Report a problem</button></div></div>
        <table><thead><tr><th>Ticket</th><th>Where</th><th>Priority</th><th>Status</th><th>Assigned</th><th></th></tr></thead><tbody>
        ${L.map(t => `<tr><td><b>${esc(t.title)}</b><div class="small muted">${t.id} · reported by ${esc(t.by)} · ${R.fmtShort(t.created)}</div></td>
          <td>${esc(t.room)} ${t.blocks ? '<span class="chip red">Room blocked</span>' : ''}</td><td>${R.chip(t.priority)}</td><td>${R.chip(t.status)}</td><td class="small">${esc(R.staff(t.assignee).name)}</td>
          <td class="right">${next[t.status] ? `${t.status === 'in_progress' ? `<button class="btn sm ghost" data-act="tkStatus" data-id="${t.id}" data-s="waiting">Waiting on parts</button> ` : ''}<button class="btn sm" data-act="tkStatus" data-id="${t.id}" data-s="${next[t.status][0]}">${next[t.status][1]}</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>`;
    }
  };
})();
