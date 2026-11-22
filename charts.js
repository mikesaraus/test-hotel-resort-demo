/* Small SVG chart kit for the reports. One y-axis per chart, thin marks with 2px gaps,
   a legend plus direct labels, and a hover / keyboard tooltip on every data mark.
   Department colours are fixed (validated for colour-blind readers); identity never relies on colour alone. */
(function () {
  const esc = R.esc;
  R.DEPT_COLORS = { Rooms: '#7A1F24', 'Food & beverage': '#D3922F', 'Day tour & cottages': '#24707C', 'Spa & activities': '#8A5FB8', Other: '#D6CFC4' };
  const C = R.chart = {};
  const VW = 760; // viewBox width; the SVG scales to its box

  // a "nice" axis maximum and 4 steps
  C.nice = max => {
    if (max <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max))), m = max / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  };
  const short = n => n >= 1e6 ? '₱' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? '₱' + (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : '₱' + Math.round(n);
  C.shortMoney = short;
  const dayLbl = d => new Date(d + 'T12:00:00').toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
  const dow = d => new Date(d + 'T12:00:00').getDay();
  const weekend = d => dow(d) === 0 || dow(d) === 6;
  const tipAttr = (text, label) => `data-tip="${esc(text)}" tabindex="0" role="img" aria-label="${esc(label || text.replace(/\|/g, ', '))}"`;

  function frame(h, yMax, yFmt, pad) {
    const L = pad.l, Rr = VW - pad.r, T = pad.t, B = h - pad.b;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = yMax * i / 4, y = B - (B - T) * i / 4;
      g += `<line x1="${L}" x2="${Rr}" y1="${y}" y2="${y}" class="grid ${i ? '' : 'base'}"/><text x="${L - 8}" y="${y + 4}" class="ylab" text-anchor="end">${esc(yFmt(v))}</text>`;
    }
    return { L, R: Rr, T, B, g };
  }
  const xLabels = (days, x, B, every) => days.map((d, i) => (i % every === 0 || i === days.length - 1) ? `<text x="${x(i)}" y="${B + 18}" class="xlab" text-anchor="middle">${esc(dayLbl(d))}</text>` : '').join('');

  // ---------- stacked columns (e.g. revenue per day by department) ----------
  C.columns = function (o) {
    const h = o.height || 240, days = o.days, n = days.length;
    const totals = days.map(d => o.series.reduce((s, se) => s + Math.max(0, o.value(d, se.key)), 0));
    const yMax = C.nice(Math.max(...totals, 1)), f = frame(h, yMax, o.yFmt || short, { l: 56, r: 12, t: 12, b: 30 });
    const step = (f.R - f.L) / n, bw = Math.max(3, Math.min(34, step * 0.68)), x = i => f.L + step * i + step / 2, y = v => f.B - (f.B - f.T) * v / yMax;
    let bands = '', bars = '', hits = '';
    days.forEach((d, i) => {
      if (o.shadeWeekends && weekend(d)) bands += `<rect x="${f.L + step * i}" y="${f.T}" width="${step}" height="${f.B - f.T}" class="wk"/>`;
      let acc = 0;
      o.series.forEach(se => {
        const v = Math.max(0, o.value(d, se.key)); if (!v) return;
        const y0 = y(acc), y1 = y(acc + v); acc += v;
        const hh = Math.max(0, y0 - y1 - (acc > v ? 2 : 0));
        bars += `<rect x="${x(i) - bw / 2}" y="${y1}" width="${bw}" height="${hh}" rx="${y1 === y(totals[i]) ? 3 : 0}" fill="${se.color}" class="seg ${o.dim && o.dim(d) ? 'dimmed' : ''}"/>`;
      });
      const tip = `${new Date(d + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })}${o.dim && o.dim(d) ? ' (so far)' : ''}|` + o.series.map(se => { const v = o.value(d, se.key); return v ? `${se.name}: ${(o.vFmt || R.money)(v)}` : ''; }).filter(Boolean).join('|') + `|Total: ${(o.vFmt || R.money)(totals[i])}`;
      hits += `<rect x="${f.L + step * i}" y="${f.T}" width="${step}" height="${f.B - f.T}" class="hit" ${tipAttr(tip)}/>`;
    });
    const every = Math.ceil(n / 8);
    const svg = `<svg viewBox="0 0 ${VW} ${h}" class="chart-svg" aria-hidden="false">${bands}${f.g}${bars}${xLabels(days, x, f.B, every)}${hits}</svg>`;
    return `<div class="chart">${C.legend(o.series.filter(se => days.some(d => o.value(d, se.key))), o.extraLegend)}${svg}</div>`;
  };

  // ---------- line (e.g. occupancy): solid for actual, dashed for "on the books" ----------
  C.line = function (o) {
    const h = o.height || 220, pts = o.points, n = pts.length, yMax = o.yMax || C.nice(Math.max(...pts.map(p => p.y), 1));
    const f = frame(h, yMax, o.yFmt || (v => Math.round(v) + '%'), { l: 44, r: 16, t: 14, b: 30 });
    const step = (f.R - f.L) / Math.max(1, n - 1), x = i => f.L + step * i, y = v => f.B - (f.B - f.T) * v / yMax;
    const path = sel => { let s = '', on = false; pts.forEach((p, i) => { if (sel(p, i)) { s += (on ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.y).toFixed(1); on = true; } else on = false; }); return s; };
    const lastPast = pts.reduce((k, p, i) => p.future ? k : i, 0);
    const area = `M${x(0)},${f.B} ` + pts.slice(0, lastPast + 1).map((p, i) => `L${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ') + ` L${x(lastPast)},${f.B} Z`;
    const ti = pts.findIndex(p => p.today);
    const avg = o.avg != null ? `<line x1="${f.L}" x2="${x(lastPast)}" y1="${y(o.avg)}" y2="${y(o.avg)}" class="avg"/><text x="${f.L + 6}" y="${y(o.avg) - 6}" class="avg-lab">Average ${esc(o.yFmt ? o.yFmt(o.avg) : Math.round(o.avg) + '%')}</text>` : '';
    const today = ti >= 0 ? `<line x1="${x(ti)}" x2="${x(ti)}" y1="${f.T}" y2="${f.B}" class="today"/><text x="${x(ti) + 5}" y="${f.T + 10}" class="today-lab">Today</text>` : '';
    const hits = pts.map((p, i) => `<rect x="${x(i) - step / 2}" y="${f.T}" width="${step}" height="${f.B - f.T}" class="hit" data-gx="${x(i)}" data-gy="${y(p.y)}" ${tipAttr(`${new Date(p.x + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short' })}|${p.future ? 'On the books' : 'Actual'}: ${o.yFmt ? o.yFmt(p.y) : Math.round(p.y) + '%'}${p.note ? '|' + p.note : ''}`)}/>`).join('');
    const svg = `<svg viewBox="0 0 ${VW} ${h}" class="chart-svg">${f.g}<path d="${area}" class="area" fill="${o.color}"/>${avg}
      <path d="${path((p, i) => i <= lastPast)}" class="ln" stroke="${o.color}"/><path d="${path((p, i) => i >= lastPast)}" class="ln future" stroke="${o.color}"/>${today}
      ${xLabels(pts.map(p => p.x), x, f.B, Math.ceil(n / 8))}<circle r="5" class="guide-dot" fill="${o.color}" cx="-20" cy="-20"/>${hits}</svg>`;
    return `<div class="chart">${C.legend([{ name: o.name || 'Actual', color: o.color }, { name: 'On the books (future)', color: o.color, dashed: true }])}${svg}</div>`;
  };

  // ---------- bars now vs a tick for "a week ago" (booking pace) ----------
  C.pace = function (o) {
    const h = o.height || 200, n = o.rows.length, yMax = o.yMax;
    const f = frame(h, yMax, v => Math.round(v), { l: 40, r: 12, t: 12, b: 30 });
    const step = (f.R - f.L) / n, bw = Math.max(3, Math.min(18, step * 0.6)), x = i => f.L + step * i + step / 2, y = v => f.B - (f.B - f.T) * v / yMax;
    const bars = o.rows.map((r, i) => `<rect x="${x(i) - bw / 2}" y="${y(r.now)}" width="${bw}" height="${Math.max(0, f.B - y(r.now))}" rx="3" fill="${o.color}" class="seg"/><line x1="${x(i) - bw / 2 - 2}" x2="${x(i) + bw / 2 + 2}" y1="${y(r.then)}" y2="${y(r.then)}" class="tick-mark"/>`).join('');
    const hits = o.rows.map((r, i) => `<rect x="${f.L + step * i}" y="${f.T}" width="${step}" height="${f.B - f.T}" class="hit" ${tipAttr(`${dayLbl(r.d)}|${r.now} rooms booked now|${r.then} a week ago${r.now > r.then ? '|+' + (r.now - r.then) + ' picked up' : ''}`)}/>`).join('');
    return `<div class="chart">${C.legend([{ name: 'Rooms booked now', color: o.color }, { name: 'Booked a week ago', color: 'var(--ink)', tick: true }])}<svg viewBox="0 0 ${VW} ${h}" class="chart-svg">${f.g}${bars}${xLabels(o.rows.map(r => r.d), x, f.B, Math.ceil(n / 8))}${hits}</svg></div>`;
  };

  // ---------- part-to-whole as one bar, labelled ----------
  C.share = function (rows, fmt) {
    const tot = rows.reduce((s, r) => s + r.value, 0) || 1;
    const segs = rows.filter(r => r.value > 0).map(r => { const p = r.value / tot * 100; return `<span class="share-seg" style="flex:${r.value};background:${r.color}" ${tipAttr(`${r.name}|${fmt(r.value)} · ${p.toFixed(0)}%`)}>${p >= 9 ? `<b style="color:${r.ink || '#fff'}">${p.toFixed(0)}%</b>` : ''}</span>`; }).join('');
    return `<div class="chart"><div class="share">${segs}</div><ul class="share-list">${rows.filter(r => r.value > 0).map(r => `<li><i style="background:${r.color}"></i><span>${esc(r.name)}</span><b class="num">${fmt(r.value)}</b><small class="num">${(r.value / tot * 100).toFixed(0)}%</small></li>`).join('')}</ul></div>`;
  };

  // ---------- horizontal bars with up to two parts (e.g. net revenue + commission) ----------
  C.hbars = function (rows, o) {
    const max = Math.max(...rows.map(r => r.parts.reduce((s, p) => s + p.v, 0)), 1);
    return `<div class="chart">${o.legend ? C.legend(o.legend) : ''}${rows.map(r => {
      const tot = r.parts.reduce((s, p) => s + p.v, 0);
      return `<div class="hb-row"><span class="hb-name">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><div class="hb-track">${r.parts.filter(p => p.v > 0).map(p => `<span class="hb-part ${p.cls || ''}" style="width:${p.v / max * 100}%;background:${p.color}" ${tipAttr(`${r.name}|${p.label}: ${o.fmt(p.v)}`)}></span>`).join('')}</div><b class="num hb-val">${o.fmt(o.valueFn ? o.valueFn(r) : tot)}</b></div>`;
    }).join('')}</div>`;
  };

  // ---------- sparkline for a KPI card ----------
  C.spark = function (vals, color) {
    if (!vals.length) return '';
    const w = 120, h = 34, max = Math.max(...vals, 1), min = Math.min(...vals, 0), x = i => 2 + (w - 4) * i / Math.max(1, vals.length - 1), y = v => h - 3 - (h - 6) * (v - min) / Math.max(1e-9, max - min);
    const d = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="spark" aria-hidden="true"><path d="${d}" stroke="${color}"/><circle cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="3" fill="${color}"/></svg>`;
  };

  // ---------- one series of columns with its own labels (weekdays, months) ----------
  // o = { labels, values, tip(i) -> 'Head|line|line', yFmt, color, height, peak (index to mark as the busiest) }
  C.bars = function (o) {
    const h = o.height || 200, n = o.values.length, yMax = C.nice(Math.max(...o.values, 1));
    const f = frame(h, yMax, o.yFmt || (v => Math.round(v)), { l: 52, r: 12, t: 14, b: 30 });
    const step = (f.R - f.L) / Math.max(1, n), bw = Math.max(4, Math.min(44, step * 0.58)), x = i => f.L + step * i + step / 2, y = v => f.B - (f.B - f.T) * v / yMax;
    const bars = o.values.map((v, i) => v > 0 ? `<path d="M${x(i) - bw / 2},${f.B} V${y(v) + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${f.B} Z" fill="${o.color || '#7A1F24'}" class="seg ${o.peak !== undefined && o.peak !== i ? 'dimmed' : ''}"/>` : '').join('');
    const labels = o.labels.map((l, i) => `<text x="${x(i)}" y="${f.B + 18}" class="xlab" text-anchor="middle">${esc(l)}</text>`).join('');
    const top = o.peak !== undefined && o.values[o.peak] > 0 ? `<text x="${x(o.peak)}" y="${y(o.values[o.peak]) - 6}" class="xlab peak-lab" text-anchor="middle">${esc((o.yFmt || (v => Math.round(v)))(o.values[o.peak]))}</text>` : '';
    const hits = o.values.map((v, i) => `<rect x="${f.L + step * i}" y="${f.T}" width="${step}" height="${f.B - f.T}" class="hit" ${tipAttr(o.tip(i))}/>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${VW} ${h}" class="chart-svg">${f.g}${bars}${top}${labels}${hits}</svg></div>`;
  };

  // ---------- heat grid (e.g. visitors by weekday and hour): one hue, light = fewer, dark = more ----------
  // o = { rows: [label], cols: [label], val(r, c), tip(r, c, v), unit }
  // four steps of the brand maroon, checked: adjacent steps 15+ apart (OKLab), also for colour-blind readers; empty cells use an outline, not a colour
  C.HEAT = ['#E8C2BE', '#C98380', '#A04850', '#6E1B20'];
  C.heat = function (o) {
    const all = o.rows.flatMap((_, r) => o.cols.map((__, c) => o.val(r, c))), max = Math.max(...all, 1);
    const step = v => v <= 0 ? -1 : Math.min(3, Math.floor(v / max * 4 - 1e-9));
    const head = `<span></span>${o.cols.map(c => `<span class="heat-col">${esc(c)}</span>`).join('')}`;
    const body = o.rows.map((rl, r) => `<span class="heat-row">${esc(rl)}</span>${o.cols.map((_, c) => { const v = o.val(r, c), k = step(v);
      return `<span class="heat-cell ${k < 0 ? 'none' : ''}" style="${k < 0 ? '' : `background:${C.HEAT[k]}`}" ${tipAttr(o.tip(r, c, v))}></span>`; }).join('')}`).join('');
    return `<div class="chart"><div class="heat-scroll"><div class="heat" style="grid-template-columns:44px repeat(${o.cols.length},minmax(26px,1fr))">${head}${body}</div></div>
      <div class="heat-key" aria-hidden="true"><span>Fewer</span>${C.HEAT.map(c => `<i style="background:${c}"></i>`).join('')}<span>More ${esc(o.unit || '')}</span><span class="heat-none"><i></i>None</span></div></div>`;
  };

  C.legend = (items, extra) => `<div class="c-legend">${items.map(s => `<span>${s.tick ? '<i class="lg-tick"></i>' : s.dashed ? `<i class="lg-dash" style="border-color:${s.color}"></i>` : `<i style="background:${s.color}"></i>`}${esc(s.name)}</span>`).join('')}${extra || ''}</div>`;

  // ---------- one tooltip for every chart (mouse and keyboard) ----------
  let tip;
  const show = (el, cx, cy) => {
    if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    const [head, ...rest] = el.dataset.tip.split('|');
    tip.innerHTML = `<b>${esc(head)}</b>${rest.map(r => `<div>${esc(r)}</div>`).join('')}`;
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect(), x = Math.min(window.innerWidth - r.width - 8, cx + 14), y = cy - r.height - 12 < 8 ? cy + 18 : cy - r.height - 12;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = y + 'px';
    const svg = el.ownerSVGElement, dot = svg && svg.querySelector('.guide-dot');
    if (dot && el.dataset.gx) { dot.setAttribute('cx', el.dataset.gx); dot.setAttribute('cy', el.dataset.gy); }
  };
  const hide = () => { if (tip) tip.style.display = 'none'; document.querySelectorAll('.guide-dot').forEach(d => { d.setAttribute('cx', -20); d.setAttribute('cy', -20); }); };
  document.addEventListener('mousemove', e => { const el = e.target.closest && e.target.closest('.chart [data-tip]'); if (el) show(el, e.clientX, e.clientY); else hide(); });
  document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('.chart [data-tip]'); if (el) { const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top + 10); } else hide(); });
  window.addEventListener('scroll', hide, { passive: true });
})();
