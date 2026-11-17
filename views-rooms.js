/* Rooms: property map and housekeeping board (occupancy and cleaning kept separate). Tasks: guest requests and repairs. */
(function () {
  const { addDays } = R.util;
  const esc = R.esc;
  const bd = () => R.bd();
  const nextArrival = no => R.S.reservations.filter(r => r.room === no && r.status === 'booked' && r.arrive >= bd()).sort((a, b) => a.arrive.localeCompare(b.arrive))[0];
  const attendants = () => R.S.staff.filter(s => s.roleKey === 'housekeeping');

  // ---------- room dialog ----------
  R.act.openRoom = d => R.openRoom(d.no);
  R.openRoom = function (no) {
    const room = R.room(no), t = R.type(room.type), ih = R.inhouseIn(no), na = nextArrival(no), st = R.roomState(room);
    const tk = R.S.tasks.filter(x => x.area === no && x.status !== 'done');
    const btn = (hk, label, perm, primary) => R.can(perm) ? `<button class="btn ${primary ? '' : 'ghost'}" data-act="setHk" data-no="${no}" data-hk="${hk}" ${room.hk === hk ? 'disabled' : ''}>${label}</button>` : '';
    R.modal(`Room ${no}`, `
      <div class="row" style="margin-bottom:12px"><span class="chip ${st.occ ? 'ink' : ''}">${st.occ ? 'Occupied' : 'Vacant'}</span>${room.ooo ? R.chip('ooo') : R.chip(room.hk)}<span class="chip">${st.code}</span></div>
      <dl class="kv">
        <dt>Type</dt><dd>${esc(t.name)} · ${t.size} · ${esc(t.bed)} · sleeps ${t.cap}</dd>
        <dt>Guest now</dt><dd>${ih ? `<a href="#" data-act="openRes" data-id="${ih.id}">${esc(R.guest(ih.guestId).name)}</a> until ${R.fmt(R.dep(ih))}` : '—'}</dd>
        <dt>Next arrival</dt><dd>${na ? `<a href="#" data-act="openRes" data-id="${na.id}">${esc(R.guest(na.guestId).name)}</a> on ${R.fmt(na.arrive)}` : 'None booked'}</dd>
        <dt>Attendant</dt><dd>${R.can('inspect') ? `<select id="rmAtt" aria-label="Attendant"><option value="">Unassigned</option>${attendants().map(s => `<option value="${s.id}" ${room.attendant === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : esc(R.staff(room.attendant).name)}</dd>
        ${room.ooo ? `<dt>Out of order</dt><dd>${esc(room.ooo.reason)} · until ${R.fmt(room.ooo.until)}</dd>` : ''}
        ${tk.length ? `<dt>Open tasks</dt><dd>${tk.map(x => esc(x.text)).join(', ')}</dd>` : ''}
      </dl>
      <div class="foot" style="flex-wrap:wrap">
        ${R.can('task') ? `<button class="btn ghost" data-act="newTask" data-area="${no}">Report a problem</button>` : ''}
        ${room.ooo ? (R.can('ooo') ? `<button class="btn" data-act="backInService" data-no="${no}">Back in service</button>` : '') : `
          ${R.can('ooo') && !st.occ ? `<button class="btn ghost warn-text" data-act="takeOOO" data-no="${no}">Out of order</button>` : ''}
          ${btn('dirty', 'Mark dirty', 'hk')}${btn('clean', 'Cleaned', 'hk', !R.can('inspect'))}${btn('inspected', 'Inspected', 'inspect', true)}`}
      </div>`, b => {
      const a = b.querySelector('#rmAtt');
      if (a) a.addEventListener('change', () => { room.attendant = a.value || null; R.log('Attendant', `Room ${no} → ${R.staff(room.attendant).name}`); R.save(); R.toast(`Room ${no} given to ${R.staff(room.attendant).name}`); R.render(); });
    });
  };
  R.act.setHk = d => {
    const room = R.room(d.no), was = room.hk;
    if (!R.need(d.hk === 'inspected' ? 'inspect' : 'hk')) return;
    room.hk = d.hk;
    R.log('Room status', `Room ${d.no}: ${R.chipLabel(d.hk)}`);
    R.closeModal(); R.rerender();
    R.toast(`Room ${d.no}: ${R.chipLabel(d.hk)}`, '', () => { room.hk = was; R.log('Room status undone', `Room ${d.no}: back to ${R.chipLabel(was)}`); });
  };
  R.act.takeOOO = d => {
    const room = R.room(d.no);
    R.authorize({ perm: 'ooo', title: `Take room ${d.no} out of order`, ok: 'Take out of order', danger: true, placeholder: 'What is wrong with the room?',
      body: `<label class="field">Back in service by<input id="ooUntil" type="date" min="${addDays(bd(), 1)}" value="${addDays(bd(), 2)}"></label>
        <p class="small muted" style="margin-top:6px">Nobody can be checked in or booked into the room until then. Bookings already on it must be moved.</p>` }, a => {
      room.ooo = { reason: a.reason, since: bd(), until: a.body.querySelector('#ooUntil').value };
      R.S.tasks.unshift({ id: R.nextId('T'), kind: 'repair', area: d.no, text: a.reason, dept: 'Maintenance', priority: 'high', status: 'new', by: R.user().name, assignee: 'S9', created: bd(), at: R.now(), blocks: true });
      R.log('Out of order', `Room ${d.no} until ${R.fmtShort(room.ooo.until)} · ${a.reason}`, '', a.by);
      R.rerender(); R.toast(`Room ${d.no} is out of order. Repair task created.`);
    });
  };
  R.act.backInService = d => {
    if (!R.need('ooo')) return;
    const room = R.room(d.no);
    room.ooo = null; room.hk = 'dirty';
    R.S.tasks.forEach(t => { if (t.area === d.no && t.blocks) t.blocks = false; });
    R.log('Back in service', `Room ${d.no}, sent for cleaning`);
    R.closeModal(); R.rerender(); R.toast(`Room ${d.no} back in service and sent for cleaning`);
  };
  R.act.hkAuto = () => {
    if (!R.need('inspect')) return;
    const att = attendants().map(s => s.id);
    let i = 0;
    R.S.rooms.filter(r => r.hk === 'dirty' && !r.ooo).forEach(r => { r.attendant = att[i++ % att.length]; });
    R.log('Attendants', 'Dirty rooms shared evenly');
    R.rerender(); R.toast('Dirty rooms shared evenly between attendants');
  };

  // ---------- Rooms view ----------
  let rView = null, rFilter = '';
  R.act.rView = d => { rView = d.v; R.render(); };
  R.act.rFilter = d => { rFilter = rFilter === d.f ? '' : d.f; R.render(); };
  R.views.rooms = {
    title: 'Rooms',
    hint: 'Each room has two statuses: occupied or vacant, and dirty, clean or inspected. Click a room to change it.',
    render() {
      const k = R.roleKey(), me = R.S.user;
      if (!rView) rView = k === 'housekeeping' || k === 'hkhead' ? 'board' : 'map';
      const day = bd();
      const counts = { dirty: 0, clean: 0, inspected: 0, ooo: 0 };
      R.S.rooms.forEach(r => { counts[r.ooo ? 'ooo' : r.hk]++; });
      const occ = R.S.rooms.filter(r => R.inhouseIn(r.no)).length;
      const toggle = `<div class="row" style="margin-bottom:12px"><div class="seg" role="group" aria-label="View">${[['map', 'Property map'], ['board', 'Housekeeping board']].map(([v, l]) => `<button class="${rView === v ? 'on' : ''}" aria-pressed="${rView === v}" data-act="rView" data-v="${v}"><b>${l}</b></button>`).join('')}</div>
        <span class="muted small" style="margin-left:8px">${occ} occupied · ${R.S.rooms.length - occ} vacant</span></div>`;
      const legend = `<div class="legend">${[['inspected', 'Inspected (ready to sell)'], ['clean', 'Clean, not inspected'], ['dirty', 'Dirty'], ['ooo', 'Out of order']].map(([s, l]) => `<button class="chip ${rFilter === s ? 'ink' : ''} legend-btn" aria-pressed="${rFilter === s}" data-act="rFilter" data-f="${s}"><i class="st-${s}"></i>${l} · ${counts[s]}</button>`).join('')}
        <span class="muted small">Dark bar at the bottom = guest in room · "Arr" = arrival today</span></div>`;

      if (rView === 'map') return toggle + legend + R.mapHTML({ filter: rFilter }) + (R.can('settings') ? '<p class="small muted" style="margin-top:8px">Change buildings, rooms and the map in <a href="#settings">Settings → Property layout</a>.</p>' : '');

      // housekeeping board: one column per attendant; arrivals today first
      const prio = r => { const na = nextArrival(r.no); return na && na.arrive === day ? 0 : R.inhouseIn(r.no) ? 2 : 1; };
      const card = r => {
        const na = nextArrival(r.no), ih = R.inhouseIn(r.no);
        const why = na && na.arrive === day ? `<span class="chip red">Arrival ${na.eta}</span>` : ih ? `<span class="chip">Stay-over${R.dep(ih) === day ? ', leaving today' : ''}</span>` : '<span class="chip">Vacant</span>';
        const action = r.hk === 'dirty' ? (R.can('hk') ? `<button class="btn sm" data-act="setHk" data-no="${r.no}" data-hk="clean">Cleaned</button>` : '') : (R.can('inspect') ? `<button class="btn sm ghost" data-act="setHk" data-no="${r.no}" data-hk="inspected">Inspected</button>` : '<span class="small muted">Waiting for inspection</span>');
        return `<div class="list-item"><button class="tile st-${r.hk} ${ih ? 'occ' : ''}" style="width:56px;height:46px" data-act="openRoom" data-no="${r.no}" aria-label="Room ${r.no}"><b>${r.no}</b></button>
          <div class="grow small">${esc(R.type(r.type).name)}<div class="row" style="margin-top:2px">${R.chip(r.hk)} ${why}</div></div>${action}</div>`;
      };
      let work = R.S.rooms.filter(r => !r.ooo && (r.hk === 'dirty' || r.hk === 'clean'));
      if (rFilter) work = work.filter(r => r.hk === rFilter);
      const col = (name, sub, list) => `<div class="panel"><div class="ph"><span class="avatar">${R.initials(name)}</span><div><h2>${esc(name)}</h2><span class="small muted">${sub}</span></div></div>
        ${list.sort((a, b) => prio(a) - prio(b)).map(card).join('') || '<p class="empty">List finished</p>'}</div>`;
      const mine = k === 'housekeeping';
      const att = mine ? attendants().filter(s => s.id === me) : attendants();
      const un = work.filter(r => !r.attendant);
      return toggle + legend + `<div class="row" style="margin-bottom:12px"><span class="muted">${counts.dirty} dirty · ${counts.clean} waiting for inspection · ${counts.inspected} ready</span>
        ${R.can('inspect') ? '<button class="btn ghost sm" style="margin-left:auto" data-act="hkAuto">Share dirty rooms evenly</button>' : ''}</div>
        ${mine ? '<p class="small muted" style="margin-bottom:10px">Showing your rooms only.</p>' : ''}
        <div class="grid g3">${att.map(s => { const l = work.filter(r => r.attendant === s.id); return col(s.name, `${l.filter(r => r.hk === 'dirty').length} to clean`, l); }).join('')}
        ${!mine && un.length ? col('Unassigned', 'Give these to someone', un) : ''}</div>`;
    }
  };

  // ---------- Tasks: guest requests + repairs ----------
  const STATUSES = [['new', 'New'], ['in_progress', 'In progress'], ['waiting', 'Waiting on parts'], ['done', 'Done']];
  const TEAMS = ['Maintenance', 'Housekeeping', 'Front office', 'Food & beverage'];
  const ageDays = t => R.util.daysBetween(t.since || t.created, bd());
  const ageText = n => n <= 0 ? 'today' : n === 1 ? '1 day' : n + ' days';
  // a task needs attention when it has sat too long in its status
  R.taskFlag = t => {
    const a = ageDays(t);
    if (t.status === 'waiting' && t.expected && t.expected < bd()) return ['red', `Overdue: expected ${R.fmtShort(t.expected)}`];
    if (t.status === 'waiting' && !t.expected) return ['amber', 'No expected date'];
    if (t.status === 'new' && a >= 1) return ['amber', `Not started for ${ageText(a)}`];
    if (t.status === 'in_progress' && a >= 3) return ['amber', `In progress for ${ageText(a)}`];
    return null;
  };
  R.tasksNeedingAttention = () => R.S.tasks.filter(t => t.status !== 'done' && R.taskFlag(t) && R.taskFlag(t)[0] === 'red');

  R.act.newTask = d => {
    if (!R.need('task')) return;
    const areas = [...R.S.zones.filter(z => z.kind === 'feature').map(z => z.name), 'Lobby', 'Restaurant', ...R.S.dayuse.cottages.map(c => c.name), ...R.S.rooms.map(r => r.no)].filter((v, i, a) => a.indexOf(v) === i);
    R.modal('New task', `<div class="form">
      <label class="field">Type<select id="tkKind"><option value="repair">Repair</option><option value="request">Guest request</option></select></label>
      <label class="field">Room or area<select id="tkArea">${areas.map(x => `<option ${x === d.area ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="field">Team<select id="tkDept">${TEAMS.map(x => `<option>${x}</option>`).join('')}</select></label>
      <label class="field">Priority<select id="tkPr"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
      <label class="field full">What's needed?<input id="tkText" placeholder="e.g. aircon not cooling, extra pillows" autofocus></label>
      ${R.can('ooo') ? '<label class="full check"><input type="checkbox" id="tkBlock"> Take this room out of order until it is fixed</label>' : ''}</div>
      <div class="foot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" id="tkGo">Create task</button></div>`, b => {
      const $ = s => b.querySelector(s);
      $('#tkKind').addEventListener('change', () => { $('#tkDept').value = $('#tkKind').value === 'repair' ? 'Maintenance' : 'Housekeeping'; });
      $('#tkGo').onclick = () => {
        const text = $('#tkText').value.trim(), area = $('#tkArea').value;
        if (text.length < 3) return R.toast('Describe what is needed', 'warn');
        const block = $('#tkBlock') && $('#tkBlock').checked && !!R.room(area);
        if (block && R.inhouseIn(area)) return R.toast('A guest is in this room. Move them before taking it out of order.', 'warn');
        const ih = R.inhouseIn(area);
        const t = { id: R.nextId('T'), kind: $('#tkKind').value, area, resId: ih ? ih.id : '', text, dept: $('#tkDept').value, priority: $('#tkPr').value, status: 'new', by: R.user().name, assignee: $('#tkDept').value === 'Maintenance' ? 'S9' : null, created: bd(), since: bd(), at: R.now(), blocks: block, history: [] };
        R.S.tasks.unshift(t);
        if (block) R.room(area).ooo = { reason: text, since: bd(), until: addDays(bd(), 2) };
        R.log('Task created', `${text} (${area})${block ? ' · room out of order' : ''}`, t.id);
        R.closeModal(); R.rerender(); R.toast(`Task sent to ${t.dept}`);
      };
    });
  };

  // one place that changes a task's status, so the history and the room stay right
  R.setTaskStatus = function (t, s, extra) {
    const was = t.status;
    if (was === s && !extra) return;
    const prev = { status: was, since: t.since, expected: t.expected, waitNote: t.waitNote, blocks: t.blocks };
    t.status = s; t.since = bd();
    if (s === 'waiting') Object.assign(t, { expected: extra.expected, waitNote: extra.note });
    t.history = t.history || [];
    t.history.push({ date: bd(), at: R.now(), by: R.S.user, from: was, to: s, note: s === 'waiting' ? `${extra.note} · expected ${R.fmtShort(extra.expected)}` : (extra && extra.note) || '' });
    let msg = `Task: ${R.chipLabel(s)}`;
    if (s === 'done' && t.blocks && R.room(t.area)) { const rm = R.room(t.area); rm.ooo = null; rm.hk = 'dirty'; t.blocks = false; msg = `Fixed. Room ${t.area} is back in service and sent for cleaning.`; }
    else if (s === 'done' && t.kind === 'request') msg = 'Done. The guest gets a notification.';
    R.log('Task', `${t.text}: ${R.chipLabel(was)} → ${R.chipLabel(s)}${s === 'waiting' ? ' · ' + extra.note : ''}`, t.id);
    R.rerender();
    R.toast(msg, '', () => { Object.assign(t, prev); t.history.pop(); R.log('Task undone', `${t.text}: back to ${R.chipLabel(was)}`, t.id); });
  };
  // waiting on parts always records what is needed and when it should arrive
  const askWaiting = (t, back) => {
    R.modal('Waiting on parts', `<p class="small muted" style="margin-bottom:10px">${esc(t.text)} · ${esc(t.area)}</p><div class="form">
      <label class="field full">What is it waiting for?<input id="wpN" value="${esc(t.waitNote || '')}" placeholder="e.g. compressor from CDO supplier, ordered by Rodel" autofocus></label>
      <label class="field">Expected by<input id="wpD" type="date" min="${bd()}" value="${t.expected && t.expected >= bd() ? t.expected : addDays(bd(), 2)}"></label></div>
      <p class="small muted" style="margin-top:8px">If it isn't fixed by then, the task turns red on Tasks and Front desk.</p>
      <div class="foot"><button class="btn ghost" data-act="${back ? 'openTask" data-id="' + t.id : 'closeModal'}">Back</button><button class="btn" id="wpGo">Save</button></div>`, b => {
      b.querySelector('#wpGo').onclick = () => {
        const note = b.querySelector('#wpN').value.trim(), expected = b.querySelector('#wpD').value;
        if (note.length < 3) return R.toast('Write what it is waiting for', 'warn');
        if (!expected) return R.toast('Pick the expected date', 'warn');
        R.closeModal(); R.setTaskStatus(t, 'waiting', { note, expected });
      };
    });
  };
  R.act.tkStatus = d => {
    if (!R.need('task')) return;
    const t = R.S.tasks.find(x => x.id === d.id);
    if (d.s === 'waiting') return askWaiting(t, !!d.back);
    R.closeModal(); R.setTaskStatus(t, d.s);
  };
  R.act.tkSet = (d, el) => {
    if (!R.need('task')) return R.render();
    const t = R.S.tasks.find(x => x.id === d.id);
    if (el.value === 'waiting') { askWaiting(t); R.render(); return; } // the select resets until the details are saved
    R.setTaskStatus(t, el.value);
  };
  R.act.openTask = d => {
    const t = R.S.tasks.find(x => x.id === d.id), can = R.can('task'), fl = R.taskFlag(t);
    const staff = R.S.staff.filter(s => s.active && (s.dept === t.dept || (t.dept === 'Front office' && s.dept === 'Front office')));
    R.modal(t.text, `<div class="row" style="margin-bottom:10px">${R.chip(t.status)}${R.chip(t.priority)}<span class="chip">${t.kind === 'request' ? 'Guest request' : 'Repair'}</span>${fl ? `<span class="chip ${fl[0]}">${esc(fl[1])}</span>` : ''}</div>
      <dl class="kv"><dt>Where</dt><dd>${esc(t.area)}${t.blocks ? ' · room out of order' : ''}</dd><dt>Reported</dt><dd>${R.fmtShort(t.created)} ${t.at} by ${esc(t.by)}</dd>
        <dt>Status</dt><dd>${R.chipLabel(t.status)} for ${ageText(ageDays(t))}</dd>
        ${t.status === 'waiting' ? `<dt>Waiting for</dt><dd>${esc(t.waitNote || '—')} · expected ${t.expected ? R.fmt(t.expected) : '—'}</dd>` : ''}
        <dt>Team</dt><dd>${esc(t.dept)}</dd>
        <dt>Assigned to</dt><dd>${can ? `<select id="tkWho" aria-label="Assigned to"><option value="">Nobody yet</option>${staff.map(s => `<option value="${s.id}" ${s.id === t.assignee ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : esc(R.staff(t.assignee).name)}</dd></dl>
      <h3 style="margin:16px 0 6px">History</h3>
      <div class="hist">${[{ date: t.created, at: t.at, by: null, to: 'new', note: 'Reported by ' + t.by }].concat(t.history || []).map(h => `<div class="list-item"><span class="small muted nowrap">${R.fmtShort(h.date)} ${h.at}</span><div class="grow small">${h.to ? `<b>${R.chipLabel(h.to)}</b>` : '<b>Update</b>'}${h.note ? ' · ' + esc(h.note) : ''}</div><span class="small muted">${h.by ? esc(R.staff(h.by).name) : ''}</span></div>`).join('')}</div>
      ${can ? `<label class="field" style="margin-top:12px">Add an update<input id="tkNote" placeholder="e.g. supplier called, part arrives Thursday"></label>` : ''}
      <div class="foot">${can ? `${STATUSES.filter(([s]) => s !== t.status).map(([s, l]) => `<button class="btn ${s === 'done' ? '' : 'ghost'}" data-act="tkStatus" data-id="${t.id}" data-s="${s}" data-back="1">${t.status === 'done' && s !== 'done' ? 'Reopen as ' + l.toLowerCase() : l}</button>`).join('')}<button class="btn ghost" id="tkSave">Save update</button>` : '<button class="btn" data-act="closeModal">Close</button>'}</div>`, b => {
      const who = b.querySelector('#tkWho');
      if (who) who.addEventListener('change', () => { t.assignee = who.value || null; t.history.push({ date: bd(), at: R.now(), by: R.S.user, note: 'Assigned to ' + R.staff(t.assignee).name }); R.log('Task assigned', `${t.text} → ${R.staff(t.assignee).name}`, t.id); R.save(); R.render(); R.toast('Assigned'); });
      const sv = b.querySelector('#tkSave');
      if (sv) sv.onclick = () => {
        const n = b.querySelector('#tkNote').value.trim();
        if (n.length < 3) return R.toast('Write the update first', 'warn');
        t.history.push({ date: bd(), at: R.now(), by: R.S.user, note: n });
        R.log('Task update', `${t.text}: ${n}`, t.id); R.save(); R.render(); R.act.openTask({ id: t.id }); R.toast('Update saved');
      };
    }, { wide: true });
  };

  let tkFilter = 'open', tkKind = '';
  R.act.tkFilter = d => { if (d.k) tkKind = tkKind === d.k ? '' : d.k; else tkFilter = d.f; R.render(); };
  R.views.tasks = {
    title: 'Tasks',
    hint: 'Guest requests and repairs in one list. Change the status from the list, or open a task for its history and updates.',
    render() {
      const k = R.roleKey(), can = R.can('task');
      const myDept = k === 'maintenance' ? 'Maintenance' : k === 'hkhead' || k === 'housekeeping' ? 'Housekeeping' : k === 'fnb' ? 'Food & beverage' : '';
      const order = ['new', 'in_progress', 'waiting', 'done'], pr = ['urgent', 'high', 'medium', 'low'];
      let L = R.S.tasks.slice();
      if (myDept) L = L.filter(t => t.dept === myDept);
      const n = { open: L.filter(t => t.status !== 'done').length, waiting: L.filter(t => t.status === 'waiting').length, late: L.filter(t => t.status !== 'done' && R.taskFlag(t)).length };
      if (tkFilter === 'open') L = L.filter(t => t.status !== 'done');
      else if (tkFilter === 'waiting') L = L.filter(t => t.status === 'waiting');
      else if (tkFilter === 'late') L = L.filter(t => t.status !== 'done' && R.taskFlag(t));
      else if (tkFilter === 'done') L = L.filter(t => t.status === 'done');
      if (tkKind) L = L.filter(t => t.kind === tkKind);
      const flagRank = t => { const f = R.taskFlag(t); return f ? (f[0] === 'red' ? 0 : 1) : 2; };
      L.sort((a, b) => (a.status === 'done') - (b.status === 'done') || flagRank(a) - flagRank(b) || order.indexOf(a.status) - order.indexOf(b.status) || pr.indexOf(a.priority) - pr.indexOf(b.priority));
      const quick = { new: ['in_progress', 'Start'], in_progress: ['done', 'Done'], waiting: ['done', 'Done'] };
      const F = [['open', `Open (${n.open})`], ['late', `Needs a push (${n.late})`], ['waiting', `Waiting on parts (${n.waiting})`], ['done', 'Done'], ['all', 'All']];
      return `<div class="panel"><div class="ph">
        <div class="seg" role="group" aria-label="Show">${F.map(([f, l]) => `<button class="${tkFilter === f ? 'on' : ''}" aria-pressed="${tkFilter === f}" data-act="tkFilter" data-f="${f}"><b>${l}</b></button>`).join('')}</div>
        <button class="chip ${tkKind === 'request' ? 'ink' : ''} legend-btn" data-act="tkFilter" data-k="request" aria-pressed="${tkKind === 'request'}">Guest requests</button><button class="chip ${tkKind === 'repair' ? 'ink' : ''} legend-btn" data-act="tkFilter" data-k="repair" aria-pressed="${tkKind === 'repair'}">Repairs</button>
        ${myDept ? `<span class="small muted">Showing ${esc(myDept)} only</span>` : ''}
        <div class="sp">${can ? `<button class="btn" data-act="newTask">${R.icon('plus')}New task</button>` : ''}</div></div>
        <div class="tbl"><table><thead><tr><th>Task</th><th>Where</th><th>Team</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody>
        ${L.map(t => { const fl = R.taskFlag(t); return `<tr class="${fl && fl[0] === 'red' ? 'late' : ''}"><td><button class="linkish task-link" data-act="openTask" data-id="${t.id}">${esc(t.text)}</button><div class="small muted">${t.kind === 'request' ? 'Guest request' : 'Repair'} · ${esc(t.by)} · ${R.fmtShort(t.created)} ${t.at}${t.history && t.history.length ? ` · ${t.history.length} update${t.history.length > 1 ? 's' : ''}` : ''}</div>${t.status === 'waiting' && t.waitNote ? `<div class="small">Waiting for: ${esc(t.waitNote)}</div>` : ''}</td>
          <td>${R.room(t.area) ? `<button class="linkish" data-act="openRoom" data-no="${esc(t.area)}">${esc(t.area)}</button>` : esc(t.area)} ${t.blocks ? '<span class="chip red">Out of order</span>' : ''}</td>
          <td class="small">${esc(t.dept)}<div class="muted">${t.assignee ? esc(R.staff(t.assignee).name) : 'Not assigned'}</div></td><td>${R.chip(t.priority)}</td>
          <td>${can ? `<select class="search status-sel st-${t.status}" data-change="tkSet" data-id="${t.id}" aria-label="Status of ${esc(t.text)}">${STATUSES.map(([s, l]) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${l}</option>`).join('')}</select>` : R.chip(t.status)}
            <div class="small ${fl ? (fl[0] === 'red' ? 'warn-text' : 'amber-text') : 'muted'}">${fl ? esc(fl[1]) : t.status === 'done' ? 'Finished ' + R.fmtShort(t.since || t.created) : 'for ' + ageText(ageDays(t))}</div></td>
          <td class="right nowrap">${quick[t.status] && can ? `<button class="btn sm ${t.status === 'new' ? 'ghost' : ''}" data-act="tkStatus" data-id="${t.id}" data-s="${quick[t.status][0]}">${quick[t.status][1]}</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">Nothing here</td></tr>'}
        </tbody></table></div></div>`;
    }
  };

  // ---------- property map, also used as the live preview in Settings → Property layout ----------
  R.mapHTML = function (o) {
    o = o || {};
    const day = bd();
    const tile = room => {
      const st = R.roomState(room), na = nextArrival(room.no), arrToday = na && na.arrive === day;
      const dim = o.filter && st.cls !== o.filter ? 'dim' : '';
      const villa = ['VIL', 'BKD'].includes(room.type) ? 'villa' : '';
      if (o.preview) return `<span class="tile st-${st.cls} ${villa}"><b>${esc(room.no)}</b></span>`;
      return `<button class="tile st-${st.cls} ${st.occ ? 'occ' : ''} ${villa} ${dim}" data-act="openRoom" data-no="${esc(room.no)}" aria-label="Room ${esc(room.no)}, ${st.label}${arrToday ? ', arrival today' : ''}">
        <b>${esc(room.no)}</b><i>${st.code}${arrToday ? ' · Arr' : ''}</i></button>`;
    };
    const block = z => {
      if (z.kind === 'feature') return `<div class="feature f-${z.style || 'other'}" style="--span:${z.span}" ${o.preview ? '' : 'aria-hidden="true"'}><span>${esc(z.name)}</span></div>`;
      const rs = R.S.rooms.filter(r => r.zone === z.id);
      return `<div class="zone" style="--span:${z.span}"><h3>${esc(z.name)} <span>${o.preview ? rs.length + ' rooms' : rs.filter(r => R.inhouseIn(r.no)).length + '/' + rs.length + ' occupied'}</span></h3><div class="tiles">${rs.map(tile).join('') || '<span class="small muted">No rooms yet</span>'}</div></div>`;
    };
    return `<div class="bay ${o.preview ? 'preview' : ''}"><div class="zones">${R.S.zones.map(block).join('')}</div><span class="sea-label">${esc(R.S.propertyName || 'Camsair Resort')} grounds</span></div>`;
  };
})();
