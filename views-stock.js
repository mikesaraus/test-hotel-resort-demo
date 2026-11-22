/* Inventory: what is on the shelf (room amenities, linen, bar stock, supplies), its reorder level and cost per unit,
   and every movement in or out. Cleaning a room and selling a linked drink take stock out by themselves.
   Every change goes through move(), so an item's history always adds up to what is on hand. */
(function () {
  const esc = R.esc, bd = () => R.bd();
  const INV = () => R.S.inventory;
  const item = id => INV().items.find(i => i.id === id);
  const live = () => INV().items.filter(i => i.active);
  const isLow = i => i.qty <= i.par;
  const byName = (a, b) => a.name.localeCompare(b.name);
  const CATS = ['Room amenities', 'Linen', 'Bar & drinks', 'Kitchen', 'Cleaning supplies'];
  const KINDS = { open: 'Opening stock', receive: 'Received', use: 'Issued', count: 'Stock count', clean: 'Room cleaned', sale: 'Sold', undo: 'Undone' };
  const TO = ['Housekeeping', 'Restaurant & bar', 'Front office', 'Maintenance', 'Pool & activities', 'Damaged / thrown away'];
  const n0 = n => n.toLocaleString('en-PH');
  const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + n0(Math.abs(n));
  const round2 = n => Math.round(n * 100) / 100;
  const int = v => /^\d+$/.test(String(v).trim()) ? +v : NaN;
  const num = v => String(v).trim() !== '' && isFinite(+v) ? +v : NaN;
  const active = () => !!(R.S.modules.inventory && INV());
  R.stockLow = () => active() ? live().filter(isLow).length : 0;

  function move(it, qty, kind, note, ref, by) {
    it.qty += qty;
    const m = { id: R.nextId('IM'), item: it.id, date: bd(), at: R.now(), by: by || R.S.user, kind, qty, left: it.qty, cost: it.cost, note: note || '', ref: ref || '' };
    INV().moves.unshift(m);
    // shortcut: oldest movements drop off after 3000; the real build keeps them all in the database
    if (INV().moves.length > 3000) INV().moves.length = 3000;
    return m;
  }

  // ---------- hooks used by the rest of the PMS ----------
  // a room went from dirty to clean: the amenity kit (soap, shampoo, water...) leaves the shelf. Returns an undo.
  R.stockOnClean = function (no) {
    if (!active()) return null;
    const ms = live().filter(i => i.perClean > 0).map(i => move(i, -i.perClean, 'clean', 'Room ' + no, no));
    if (!ms.length) return null;
    return () => ms.forEach(m => { const it = item(m.item); if (it) move(it, -m.qty, 'undo', `Room ${no} cleaning undone`, no); });
  };
  // a till sale: menu items linked to a stock item take 1 unit each. A sale never waits for stock; below zero is flagged instead.
  R.stockOnSale = function (lines, ref, outlet) {
    if (!active()) return;
    lines.forEach(l => {
      const mi = R.S.menu.find(x => x.id === l.id), it = mi && mi.stock && item(mi.stock);
      if (it && it.active) move(it, -l.qty, 'sale', `${outlet}: ${l.qty}× ${mi.name}`, ref);
    });
  };

  // ---------- pieces ----------
  const status = i => i.qty < 0 ? ['red', 'Below zero, count it'] : i.qty === 0 ? ['red', 'Out of stock'] : isLow(i) ? ['amber', 'Reorder'] : ['green', 'OK'];
  const suggest = i => Math.max(0, i.par * 2 - i.qty);
  const itemOpts = sel => live().sort(byName).map(i => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.name)} (${n0(i.qty)} ${esc(i.unit)})</option>`).join('');
  const foot = (id, ok, form) => `<div class="foot nb-foot"><p id="${id}" class="fx-err" role="alert"></p><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="submit" form="${form}" class="btn">${ok}</button></div>`;
  // one form dialog: build(b) returns [errors, save]; save only runs when there are no errors
  const formDialog = (title, html, mount, submit) => R.modal(title, html, b => {
    const f = b.querySelector('form');
    if (mount) mount(b);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const errs = [], save = submit(b, (id, m) => errs.push([id, m]));
      if (!R.fx.report(b, errs, b.querySelector('.fx-err'))) return;
      save(); R.closeModal(); R.rerender();
    });
  });

  // ---------- receive a delivery ----------
  R.act.stReceive = d => {
    if (!R.need('stock')) return;
    const first = item(d.id) || live().sort(byName)[0];
    if (!first) return R.toast('Add an item first', 'warn');
    formDialog('Receive stock', `<form id="rcForm" novalidate><div class="form">
      <label class="field full">Item<select id="rcItem">${itemOpts(first.id)}</select></label>
      <label class="field">Quantity received<input id="rcQty" type="number" inputmode="numeric" min="1" step="1" autofocus></label>
      <label class="field">Cost per unit (₱)<input id="rcCost" type="number" inputmode="decimal" min="0" step="0.01" value="${first.cost}"></label>
      <label class="field full"><span>Supplier and invoice no. <span class="muted">(optional)</span></span><input id="rcRef" placeholder="e.g. Gaisano CDO, invoice 10482" autocomplete="off"></label></div>
      <p class="small muted" id="rcHint" aria-live="polite" style="margin-top:8px"></p></form>${foot('rcErr', 'Receive', 'rcForm')}`, b => {
      const $ = s => b.querySelector(s);
      const paint = () => {
        const it = item($('#rcItem').value), q = int($('#rcQty').value), c = num($('#rcCost').value);
        $('#rcHint').textContent = q > 0 && c >= 0 ? `${R.peso(q * c)} in total. On hand goes from ${n0(it.qty)} to ${n0(it.qty + q)} ${it.unit}.` : `${n0(it.qty)} ${it.unit} on hand now.`;
      };
      $('#rcItem').addEventListener('change', () => { $('#rcCost').value = item($('#rcItem').value).cost; paint(); });
      b.addEventListener('input', paint); paint();
    }, (b, err) => {
      const $ = s => b.querySelector(s), it = item($('#rcItem').value), q = int($('#rcQty').value), c = num($('#rcCost').value), ref = $('#rcRef').value.trim();
      if (!(q >= 1 && q <= 100000)) err('rcQty', 'Enter how many came in, a whole number from 1.');
      if (!(c >= 0 && c <= 1000000)) err('rcCost', 'Enter the cost per unit, ₱0 or more.');
      return () => {
        // the cost per unit becomes the average of what is on the shelf and what came in
        const was = it.cost;
        it.cost = it.qty > 0 ? round2((it.qty * it.cost + q * c) / (it.qty + q)) : c;
        move(it, q, 'receive', ref, '');
        R.log('Stock received', `${n0(q)} ${it.unit} ${it.name} at ${R.peso(c)}${ref ? ' · ' + ref : ''}${was !== it.cost ? ` · average cost now ${R.peso(it.cost)}` : ''}`, it.id);
        R.toast(`${n0(q)} ${it.unit} ${it.name} received`);
      };
    });
  };

  // ---------- issue stock to a team, or write off damaged items ----------
  R.act.stUse = d => {
    if (!R.need('stock')) return;
    const first = item(d.id) || live().sort(byName)[0];
    if (!first) return R.toast('Add an item first', 'warn');
    formDialog('Issue stock', `<form id="usForm" novalidate><div class="form">
      <label class="field full">Item<select id="usItem">${itemOpts(first.id)}</select></label>
      <label class="field">Quantity<input id="usQty" type="number" inputmode="numeric" min="1" step="1" autofocus></label>
      <label class="field">Given to<select id="usTo">${TO.map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
      <label class="field full"><span>Note <span class="muted">(required for damaged or thrown away)</span></span><input id="usNote" placeholder="e.g. pool towels for the Acenas reunion, room 204 request" autocomplete="off"></label></div></form>${foot('usErr', 'Issue', 'usForm')}`, null, (b, err) => {
      const $ = s => b.querySelector(s), it = item($('#usItem').value), q = int($('#usQty').value), to = $('#usTo').value, note = $('#usNote').value.trim();
      if (!(q >= 1)) err('usQty', 'Enter how many, a whole number from 1.');
      else if (q > it.qty) err('usQty', `Only ${n0(Math.max(0, it.qty))} ${it.unit} on hand. Receive or count it first.`);
      if (/^Damaged/.test(to) && note.length < 3) err('usNote', 'Say what happened to it.');
      return () => {
        move(it, -q, 'use', to + (note ? ' · ' + note : ''), '');
        R.log('Stock issued', `${n0(q)} ${it.unit} ${it.name} → ${to}${note ? ' · ' + note : ''}`, it.id);
        R.toast(`${n0(q)} ${it.unit} ${it.name} issued to ${to}${isLow(it) ? '. Now below the reorder level' : ''}`, isLow(it) ? 'warn' : '');
      };
    });
  };

  // ---------- stock count: a difference needs a reason, and approval from someone who can approve it ----------
  R.act.stCount = d => {
    if (!R.need('stock')) return;
    const it = item(d.id);
    formDialog(`Count ${it.name}`, `<form id="ctForm" novalidate><p class="small muted" style="margin-bottom:10px">Count what is on the shelf without looking at the system figure first.</p><div class="form">
      <label class="field">Counted (${esc(it.unit)})<input id="ctQty" type="number" inputmode="numeric" min="0" step="1" autofocus></label></div></form>${foot('ctErr', 'Save count', 'ctForm')}`, null, (b, err) => {
      const q = int(b.querySelector('#ctQty').value);
      if (!(q >= 0)) err('ctQty', 'Enter what you counted, 0 or more.');
      return () => {
        const diff = q - it.qty;
        if (!diff) { move(it, 0, 'count', 'Matches'); R.log('Stock count', `${it.name}: ${n0(q)} ${it.unit}, matches`, it.id); R.toast('Count matches the system'); return; }
        // the count dialog closes first, then the approval opens
        setTimeout(() => R.authorize({ perm: 'stockok', title: `Stock difference: ${it.name}`, ok: 'Save the new figure', danger: diff < 0,
          placeholder: diff < 0 ? 'e.g. towels stained and thrown out, bottles broken' : 'e.g. delivery not recorded last week',
          body: `<dl class="kv"><dt>System says</dt><dd>${n0(it.qty)} ${esc(it.unit)}</dd><dt>Counted</dt><dd>${n0(q)} ${esc(it.unit)}</dd>
            <dt>Difference</dt><dd class="${diff < 0 ? 'warn-text' : ''}">${signed(diff)} ${esc(it.unit)}, ${R.money(diff * it.cost)}</dd></dl>` }, a => {
          move(it, diff, 'count', a.reason, '', a.by);
          R.log('Stock count', `${it.name}: system ${n0(q - diff)}, counted ${n0(q)} (${signed(diff)}, ${R.money(diff * it.cost)}) · ${a.reason}`, it.id, a.by);
          R.rerender(); R.toast(`${it.name}: on hand set to ${n0(q)}`);
        }), 0);
      };
    });
  };

  // ---------- add or edit an item ----------
  R.act.stEdit = d => {
    if (!R.need('stockok')) return;
    const it = item(d.id), cats = [...new Set([...CATS, ...INV().items.map(i => i.cat)])];
    const linked = it ? R.S.menu.filter(m => m.stock === it.id).map(m => m.id) : [];
    const menuOpts = R.S.menu.filter(m => !m.stock || (it && m.stock === it.id)).map(m => `<label class="nb-chip"><input type="checkbox" name="itMenu" value="${m.id}" ${linked.includes(m.id) ? 'checked' : ''}><span>${esc(m.name)}</span></label>`).join('');
    formDialog(it ? `Edit ${it.name}` : 'New stock item', `<form id="itForm" novalidate><div class="form">
      <label class="field full">Name<input id="itName" value="${esc(it ? it.name : '')}" autocomplete="off" autofocus></label>
      <label class="field">Category<select id="itCat">${cats.map(c => `<option ${it && it.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
      <label class="field">Counted in<input id="itUnit" value="${esc(it ? it.unit : 'pcs')}" placeholder="pcs, bottles, rolls, sets" autocomplete="off"></label>
      ${it ? '' : '<label class="field">On hand now<input id="itQty" type="number" inputmode="numeric" min="0" step="1" value="0"></label>'}
      <label class="field">Cost per unit (₱)<input id="itCost" type="number" inputmode="decimal" min="0" step="0.01" value="${it ? it.cost : ''}"></label>
      <label class="field"><span>Reorder at <span class="muted">(or below)</span></span><input id="itPar" type="number" inputmode="numeric" min="0" step="1" value="${it ? it.par : 0}"></label>
      <label class="field"><span>Used per room cleaned <span class="muted">(0 if not)</span></span><input id="itClean" type="number" inputmode="numeric" min="0" max="20" step="1" value="${it ? it.perClean : 0}"></label>
      <fieldset class="nb-set full"><legend>Sold at the till as <span class="muted">(each sale takes 1 ${esc(it ? it.unit : 'unit')}; leave empty if not sold)</span></legend><div class="nb-chips">${menuOpts}</div></fieldset>
      ${it ? `<label class="field full list-item module"><input type="checkbox" id="itOff" ${it.active ? '' : 'checked'}><div class="grow"><b>No longer stocked</b><div class="small muted">Hidden from the list. Its history is kept.</div></div></label>` : ''}</div></form>${foot('itErr', it ? 'Save' : 'Add item', 'itForm')}`, null, (b, err) => {
      const $ = s => b.querySelector(s), name = $('#itName').value.trim().replace(/\s+/g, ' '), unit = $('#itUnit').value.trim();
      const cost = num($('#itCost').value), par = int($('#itPar').value), per = int($('#itClean').value), qty = it ? 0 : int($('#itQty').value);
      const menu = [...b.querySelectorAll('input[name="itMenu"]:checked')].map(o => o.value);
      if (name.length < 2) err('itName', 'Enter the item name.');
      else if (INV().items.some(x => x !== it && x.name.toLowerCase() === name.toLowerCase())) err('itName', 'There is already an item with this name.');
      if (!unit) err('itUnit', 'Enter what it is counted in, e.g. pcs.');
      if (!it && !(qty >= 0)) err('itQty', 'Enter what is on hand, 0 or more.');
      if (!(cost >= 0 && cost <= 1000000)) err('itCost', 'Enter the cost per unit, ₱0 or more.');
      if (!(par >= 0)) err('itPar', 'Enter a whole number, 0 or more.');
      if (!(per >= 0 && per <= 20)) err('itClean', 'Enter a whole number from 0 to 20.');
      return () => {
        const x = it || { id: R.nextId('I'), qty: 0, active: true };
        Object.assign(x, { name, cat: $('#itCat').value, unit, cost, par, perClean: per });
        if (it) x.active = !$('#itOff').checked; else { INV().items.push(x); if (qty) move(x, qty, 'open'); }
        R.S.menu.forEach(m => { if (m.stock === x.id && !menu.includes(m.id)) delete m.stock; if (menu.includes(m.id)) m.stock = x.id; });
        R.log(it ? 'Stock item changed' : 'Stock item added', `${name} · ${R.peso(cost)} per ${unit} · reorder at ${par}${per ? ` · ${per} per room cleaned` : ''}${it && !x.active ? ' · no longer stocked' : ''}`, x.id);
        R.toast(it ? 'Saved' : `${name} added`);
      };
    });
  };

  // ---------- one item: figures and its own history ----------
  R.act.stItem = d => {
    const it = item(d.id), st = status(it), ms = INV().moves.filter(m => m.item === it.id).slice(0, 25), can = R.can('stock');
    const menu = R.S.menu.filter(m => m.stock === it.id).map(m => m.name);
    R.modal(it.name, `<div class="row" style="margin-bottom:10px"><span class="chip ${st[0]}">${st[1]}</span><span class="chip">${esc(it.cat)}</span>${it.active ? '' : '<span class="chip">No longer stocked</span>'}</div>
      <dl class="kv"><dt>On hand</dt><dd>${n0(it.qty)} ${esc(it.unit)}</dd><dt>Reorder at</dt><dd>${n0(it.par)} ${esc(it.unit)}${isLow(it) ? ` · order about ${n0(suggest(it))}` : ''}</dd>
        <dt>Cost per unit</dt><dd>${R.peso(it.cost)} (average)</dd><dt>Value on hand</dt><dd>${R.peso(Math.max(0, it.qty) * it.cost)}</dd>
        ${it.perClean ? `<dt>Room cleaning</dt><dd>${it.perClean} per room cleaned</dd>` : ''}${menu.length ? `<dt>Sold at the till as</dt><dd>${menu.map(esc).join(', ')}</dd>` : ''}</dl>
      <h3 style="margin:16px 0 6px">Latest movements</h3>
      <div class="hist">${ms.map(m => `<div class="list-item"><span class="small muted nowrap">${R.fmtShort(m.date)} ${m.at}</span><div class="grow small"><b>${KINDS[m.kind]}</b>${m.note ? ' · ' + esc(m.note) : ''}</div><span class="num nowrap ${m.qty < 0 ? 'warn-text' : ''}">${signed(m.qty)}</span><span class="small muted nowrap">${n0(m.left)} left</span></div>`).join('') || '<p class="empty">Nothing yet</p>'}</div>
      <div class="foot">${can && it.active ? `<button class="btn ghost" data-act="stCount" data-id="${it.id}">Count</button><button class="btn ghost" data-act="stUse" data-id="${it.id}">Issue</button><button class="btn" data-act="stReceive" data-id="${it.id}">Receive</button>` : ''}
        ${R.can('stockok') ? `<button class="btn ghost" data-act="stEdit" data-id="${it.id}">Edit</button>` : ''}${can ? '' : '<button class="btn" data-act="closeModal">Close</button>'}</div>`, null, { wide: true });
  };

  // ---------- the screen ----------
  let tab = 'stock', cat = '', q = '', lowOnly = false, hq = '';
  R.act.stTab = d => { tab = d.tab; R.render(); };
  R.act.stCat = d => { cat = cat === d.c ? '' : d.c; R.render(); };
  R.act.stLow = () => { lowOnly = !lowOnly; R.render(); };
  const typing = (el, id, set) => {
    const s = el.querySelector('#' + id);
    if (s) s.addEventListener('input', () => { set(s.value); const p = s.selectionStart; R.render(); const n = document.getElementById(id); n.focus(); n.setSelectionRange(p, p); });
  };
  function history() {
    const t = hq.toLowerCase();
    const L = INV().moves.filter(m => { const it = item(m.item); return !t || `${it ? it.name : ''} ${KINDS[m.kind]} ${m.note} ${m.ref} ${R.staff(m.by).name}`.toLowerCase().includes(t); });
    return `<div class="panel"><div class="ph"><input class="search" id="stHq" placeholder="Filter by item, room, team or person" value="${esc(hq)}" aria-label="Filter stock movements"><div class="sp small muted">${L.length} movements</div></div>
      <div class="tbl"><table><thead><tr><th>When</th><th>Item</th><th>What</th><th class="right">Qty</th><th class="right">Left</th><th class="right">Value</th><th>Who</th></tr></thead><tbody>
      ${L.slice(0, 300).map(m => { const it = item(m.item) || { name: '?', unit: '' }; return `<tr><td class="small nowrap">${R.fmtShort(m.date)} ${m.at}</td><td><button class="linkish" data-act="stItem" data-id="${m.item}">${esc(it.name)}</button></td>
        <td><b>${KINDS[m.kind]}</b>${m.note ? `<div class="small muted">${esc(m.note)}</div>` : ''}</td><td class="right num ${m.qty < 0 ? 'warn-text' : ''}">${signed(m.qty)}</td><td class="right num">${n0(m.left)}</td>
        <td class="right num small">${m.qty ? R.peso(m.qty * m.cost) : ''}</td><td class="small">${esc(R.staff(m.by).name)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">No movements yet. Receiving, issuing, counting, cleaning rooms and bar sales show up here.</td></tr>'}
      </tbody></table></div></div>`;
  }
  R.views.inventory = {
    title: 'Inventory',
    hint: 'Room amenities, linen, bar stock and supplies. Cleaning a room and selling a linked drink take stock out by themselves.',
    render() {
      const can = R.can('stock'), all = live();
      const tabs = `<div class="tabs">${[['stock', 'Stock on hand'], ['history', 'Movements']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" aria-pressed="${tab === k}" data-act="stTab" data-tab="${k}">${l}</button>`).join('')}
        <div class="sp">${R.can('stockok') ? `<button class="btn ghost sm" data-act="stEdit">${R.icon('plus')}New item</button>` : ''}${can ? `<button class="btn sm" data-act="stReceive">Receive delivery</button>` : ''}</div></div>`;
      if (tab === 'history') return tabs + history();
      const lows = all.filter(isLow), value = all.reduce((s, i) => s + Math.max(0, i.qty) * i.cost, 0);
      const today = INV().moves.filter(m => m.date === bd());
      const usedToday = today.filter(m => m.qty < 0 && m.kind !== 'count').reduce((s, m) => s - m.qty * m.cost, 0);
      const cleaned = new Set(today.filter(m => m.kind === 'clean').map(m => m.ref)).size;
      const kpi = (label, val, sub) => `<div class="kpi"><div class="kpi-top"><span>${label}</span></div><b class="kpi-val num">${val}</b><small>${sub}</small></div>`;
      const tq = q.toLowerCase();
      let L = all.filter(i => (!cat || i.cat === cat) && (!lowOnly || isLow(i)) && (!tq || (i.name + ' ' + i.cat).toLowerCase().includes(tq)));
      L.sort((a, b) => isLow(b) - isLow(a) || CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || byName(a, b));
      const cats = [...new Set(all.map(i => i.cat))];
      return tabs + `<div class="kpis">${kpi('Items stocked', all.length, `${cats.length} categories`)}${kpi('Need ordering', lows.length, lows.length ? lows.slice(0, 3).map(i => esc(i.name)).join(', ') + (lows.length > 3 ? '…' : '') : 'Everything above its reorder level')}
        ${kpi('Stock value', R.money(value), 'At average cost per unit')}${kpi('Used today', R.money(usedToday), `${cleaned} room${cleaned === 1 ? '' : 's'} cleaned, bar sales and issues`)}</div>
        <div class="panel"><div class="ph"><input class="search" id="stQ" placeholder="Search items" value="${esc(q)}" aria-label="Search stock items">
          ${cats.map(c => `<button class="chip ${cat === c ? 'ink' : ''} legend-btn" data-act="stCat" data-c="${esc(c)}" aria-pressed="${cat === c}">${esc(c)}</button>`).join('')}
          <button class="chip ${lowOnly ? 'ink' : 'amber'} legend-btn" data-act="stLow" aria-pressed="${lowOnly}">Need ordering (${lows.length})</button></div>
        <div class="tbl"><table><thead><tr><th>Item</th><th class="right">On hand</th><th class="right">Reorder at</th><th class="right">Cost / unit</th><th class="right">Value</th><th>Status</th><th></th></tr></thead><tbody>
        ${L.map(i => { const st = status(i); return `<tr class="${st[0] === 'red' ? 'late' : ''}"><td><button class="linkish" data-act="stItem" data-id="${i.id}">${esc(i.name)}</button><div class="small muted">${esc(i.cat)}${i.perClean ? ` · ${i.perClean} per room cleaned` : ''}${R.S.menu.some(m => m.stock === i.id) ? ' · sold at the till' : ''}</div></td>
          <td class="right num"><b>${n0(i.qty)}</b> <span class="small muted">${esc(i.unit)}</span></td><td class="right num">${n0(i.par)}</td><td class="right num">${R.peso(i.cost)}</td><td class="right num">${R.money(Math.max(0, i.qty) * i.cost)}</td>
          <td><span class="chip ${st[0]}">${st[1]}</span>${isLow(i) ? `<div class="small muted">Order about ${n0(suggest(i))}</div>` : ''}</td>
          <td class="right nowrap">${can ? `<button class="btn sm" data-act="stReceive" data-id="${i.id}" aria-label="Receive ${esc(i.name)}">Receive</button> <button class="btn sm ghost" data-act="stUse" data-id="${i.id}" aria-label="Issue ${esc(i.name)}">Issue</button> <button class="btn sm ghost" data-act="stCount" data-id="${i.id}" aria-label="Count ${esc(i.name)}">Count</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">Nothing matches</td></tr>'}
        </tbody></table></div></div>`;
    },
    mount(el) { typing(el, 'stQ', v => { q = v; }); typing(el, 'stHq', v => { hq = v; }); }
  };
})();
