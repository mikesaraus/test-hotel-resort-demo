/* Guest booking page: book a room or reserve a cottage, pay the deposit, get a booking number.
   Shares the PMS data (same browser storage), so bookings show up at the front desk straight away. */
(function () {
  const { addDays, daysBetween } = R.util;
  const esc = R.esc;
  const SKEY = 'camsair-book-draft';
  const $ = s => document.querySelector(s);
  R.load();
  const bd = () => R.S.bd;

  // ---------- what the guest has chosen so far (kept if they reload or go back) ----------
  const fresh = () => ({ tab: 'stay', step: 1, arrive: addDays(bd(), 7), depart: addDays(bd(), 9), adults: 2, children: 0,
    type: '', date: addDays(bd(), 7), session: 'day', pax: 10, kind: '', name: '', phone: '', email: '', eta: '14:00', requests: '', consent: false, pay: 'gcash', done: null });
  let B; try { B = Object.assign(fresh(), JSON.parse(sessionStorage.getItem(SKEY)) || {}); } catch (e) { B = fresh(); }
  if (B.arrive < bd()) Object.assign(B, { arrive: addDays(bd(), 7), depart: addDays(bd(), 9) });
  if (B.date < bd()) B.date = addDays(bd(), 7);
  const keep = () => { try { sessionStorage.setItem(SKEY, JSON.stringify(B)); } catch (e) { /* private mode */ } };
  let errors = {}, busy = false;

  // ---------- facts ----------
  const nights = () => Math.max(0, daysBetween(B.arrive, B.depart));
  const people = () => B.adults + B.children;
  const KIND = { Kubo: ['i-hut', 'Bamboo kubo with table and benches, by the pool'], 'Family cottage': ['i-users', 'Bigger cottage for families and barkadas'], Pavilion: ['i-sun', 'Covered pavilion for parties and reunions'] };
  const TYPE_LOOK = { STD: ['#E9E1D3', 'i-leaf'], DLX: ['#D7E6EC', 'i-wave'], FAM: ['#E6E9D6', 'i-users'], VIL: ['#E3DDEB', 'i-leaf'], BKD: ['#F1E2CF', 'i-users'] };
  const cottageKinds = () => [...new Set(R.S.dayuse.cottages.map(c => c.kind))].map(kind => {
    const list = R.S.dayuse.cottages.filter(c => c.kind === kind);
    const free = list.filter(c => !R.S.venueBookings.some(v => v.venue === c.id && v.date === B.date && v.session === B.session && (v.status === 'booked' || v.status === 'arrived')));
    return { kind, cap: Math.max(...list.map(c => c.cap)), price: Math.min(...list.map(c => c.price)), free };
  });
  const roomOptions = () => R.S.roomTypes.map(t => {
    const rates = R.quote(t.id, B.arrive, nights()), total = rates.reduce((a, b) => a + b, 0);
    const seasons = [...new Set(rates.map((_, i) => (R.seasonOn(addDays(B.arrive, i)) || {}).name).filter(Boolean))];
    return { t, rates, total, left: R.typeAvail(t.id, B.arrive, nights()), fits: people() <= t.cap, seasons };
  });
  const depositOf = n => Math.round(n * R.S.rules.deposit / 100);
  const phoneOk = p => /^(\+?63|0)9\d{9}$/.test(p.replace(/[\s-]/g, ''));
  const phoneNice = p => { const d = p.replace(/\D/g, '').replace(/^63/, '0'); return d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : p; };
  const longDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const sel = () => B.tab === 'stay' ? roomOptions().find(o => o.t.id === B.type) : cottageKinds().find(k => k.kind === B.kind);

  // ---------- validation, step by step ----------
  function check(step) {
    const e = {};
    if (step === 1 && B.tab === 'stay') {
      if (!B.arrive || B.arrive < bd()) e.arrive = 'Pick a check-in date from today onwards.';
      if (!B.depart || B.depart <= B.arrive) e.depart = 'Check-out must be at least one night after check-in.';
      else if (nights() > 30) e.depart = 'For stays longer than 30 nights, message us on Messenger.';
      if (B.adults < 1) e.adults = 'At least one adult is needed.';
    }
    if (step === 1 && B.tab === 'day') {
      if (!B.date || B.date < bd()) e.date = 'Pick a date from today onwards.';
      if (!(B.pax >= 1)) e.pax = 'How many people are coming?';
    }
    if (step === 2) {
      const o = sel();
      if (!o) e.pick = B.tab === 'stay' ? 'Choose a room to continue.' : 'Choose a cottage to continue.';
    }
    if (step === 3) {
      if (B.name.trim().length < 3) e.name = 'Enter your full name, as on your ID.';
      if (!phoneOk(B.phone)) e.phone = 'Enter a Philippine mobile number, like 0917 123 4567.';
      if (B.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(B.email.trim())) e.email = 'Check the email address, like name@gmail.com, or leave it empty.';
      if (!B.consent) e.consent = 'Please agree so we can keep your booking details.';
    }
    return e;
  }

  // ---------- pieces ----------
  const field = (id, label, input, hint) => `<div class="bk-field ${errors[id] ? 'has-err' : ''}"><label for="b-${id}">${label}</label>${input}${hint ? `<small class="hint">${hint}</small>` : ''}${errors[id] ? `<p class="err" id="e-${id}" role="alert">${esc(errors[id])}</p>` : ''}</div>`;
  const aria = id => errors[id] ? `aria-invalid="true" aria-describedby="e-${id}"` : '';
  const stepper = (k, label, sub, min) => `<div class="bk-step-row ${errors[k] ? 'has-err' : ''}"><div><b>${label}</b><small>${sub}</small></div><div class="bk-stepper">
    <button type="button" data-b="n" data-k="${k}" data-n="-1" aria-label="One less ${label.toLowerCase()}" ${B[k] <= min ? 'disabled' : ''}>−</button><output aria-live="polite">${B[k]}</output>
    <button type="button" data-b="n" data-k="${k}" data-n="1" aria-label="One more ${label.toLowerCase()}">+</button></div></div>${errors[k] ? `<p class="err" role="alert">${esc(errors[k])}</p>` : ''}`;
  const STEPS = () => B.tab === 'stay' ? ['Dates', 'Room', 'Your details', 'Pay deposit'] : ['Date', 'Cottage', 'Your details', 'Pay deposit'];
  const progress = () => `<ol class="bk-progress" aria-label="Booking steps">${STEPS().map((s, i) => `<li class="${i + 1 < B.step ? 'done' : i + 1 === B.step ? 'on' : ''}" ${i + 1 === B.step ? 'aria-current="step"' : ''}><span>${i + 1 < B.step ? '✓' : i + 1}</span>${s}</li>`).join('')}</ol>`;

  function summary(compact) {
    if (B.tab === 'stay') {
      const o = sel(), n = nights();
      return `<div class="bk-sum"><h3>Your stay</h3>
        <p><b>${longDate(B.arrive)}</b> → <b>${longDate(B.depart)}</b><br><span class="muted">${n} night${n === 1 ? '' : 's'} · ${B.adults} adult${B.adults === 1 ? '' : 's'}${B.children ? `, ${B.children} child${B.children === 1 ? '' : 'ren'}` : ''}</span></p>
        ${o ? `<p><b>${esc(o.t.name)}</b></p>${compact ? '' : o.rates.map((r, i) => `<div class="bk-line"><span>${R.fmtShort(addDays(B.arrive, i))}</span><span>${R.money(r)}</span></div>`).join('')}
        <div class="bk-line total"><span>Total</span><b>${R.money(o.total)}</b></div>
        <div class="bk-line due"><span>Pay now (${R.S.rules.deposit}% deposit)</span><b>${R.money(depositOf(o.total))}</b></div>
        <div class="bk-line"><span>Pay at check-in</span><span>${R.money(o.total - depositOf(o.total))}</span></div>` : ''}</div>`;
    }
    const k = sel(), sess = B.session === 'day' ? `Day tour, ${R.S.dayuse.hours.day}` : `Night swim, ${R.S.dayuse.hours.night}`;
    return `<div class="bk-sum"><h3>Your day at Camsair</h3><p><b>${longDate(B.date)}</b><br><span class="muted">${sess} · ${B.pax} people</span></p>
      ${k ? `<p><b>${esc(k.kind)}</b> <span class="muted">for up to ${k.cap}</span></p><div class="bk-line total"><span>Cottage</span><b>${R.money(k.price)}</b></div>
      <div class="bk-line due"><span>Pay now (${R.S.rules.deposit}% deposit)</span><b>${R.money(depositOf(k.price))}</b></div>
      <div class="bk-line"><span>Pay at the gate</span><span>${R.money(k.price - depositOf(k.price))} + entrance</span></div>` : ''}
      <p class="small muted" style="margin-top:8px">Entrance: adult ${R.money(R.S.dayuse.entrance[B.session].adult)}, child ${R.money(R.S.dayuse.entrance[B.session].child)}, below 3 free. Seniors and PWDs get 20% off with ID.</p></div>`;
  }

  // ---------- steps ----------
  function step1() {
    if (B.tab === 'day') return `<h1 tabindex="-1">When are you coming?</h1><p class="lead">Reserve a cottage so it's ready when your group arrives.</p>
      <div class="bk-card">${field('date', 'Date', `<input type="date" id="b-date" data-f="date" min="${bd()}" value="${B.date}" ${aria('date')}>`)}
        <fieldset class="bk-choice"><legend>Session</legend>${[['day', 'Day tour', R.S.dayuse.hours.day], ['night', 'Night swim', R.S.dayuse.hours.night]].map(([v, l, h]) => `<label class="bk-opt"><input type="radio" name="sess" value="${v}" data-f="session" ${B.session === v ? 'checked' : ''}><span><b>${l}</b><small>${h}</small></span></label>`).join('')}</fieldset>
        ${stepper('pax', 'People', 'everyone coming, kids too', 1)}</div>
      <button class="btn big bk-go" data-b="next">See available cottages</button>`;
    return `<h1 tabindex="-1">When are you staying?</h1><p class="lead">Check-in ${esc(R.S.rules.checkin)} · check-out ${esc(R.S.rules.checkout)}</p>
      <div class="bk-card"><div class="bk-two">${field('arrive', 'Check-in', `<input type="date" id="b-arrive" data-f="arrive" min="${bd()}" value="${B.arrive}" ${aria('arrive')}>`)}
        ${field('depart', 'Check-out', `<input type="date" id="b-depart" data-f="depart" min="${addDays(B.arrive || bd(), 1)}" value="${B.depart}" ${aria('depart')}>`, nights() > 0 ? `${nights()} night${nights() === 1 ? '' : 's'}` : '')}</div>
        ${stepper('adults', 'Adults', '13 and older', 1)}${stepper('children', 'Children', '12 and younger', 0)}</div>
      <button class="btn big bk-go" data-b="next">See available rooms</button>`;
  }
  function step2() {
    if (B.tab === 'day') {
      const K = cottageKinds();
      return `<button class="bk-back" data-b="back">${R.icon('back')}Change date</button><h1 tabindex="-1">Choose a cottage</h1><p class="lead">${longDate(B.date)} · ${B.session === 'day' ? 'Day tour' : 'Night swim'} · ${B.pax} people</p>
        ${errors.pick ? `<p class="err" role="alert">${esc(errors.pick)}</p>` : ''}
        <div class="bk-rooms">${K.map(k => { const ok = k.free.length && B.pax <= k.cap; const [ico, desc] = KIND[k.kind] || ['i-hut', '']; return `<article class="bk-room ${B.kind === k.kind ? 'picked' : ''} ${ok ? '' : 'off'}">
          <div class="bk-pic" style="background:#E6E9D6">${R.icon(ico.slice(2))}<span>${esc(k.kind)}</span></div>
          <div class="bk-room-body"><h2>${esc(k.kind)}</h2><p class="muted">${esc(desc)}</p><p class="bk-facts">${R.icon('users')}Up to ${k.cap} people</p>
            <div class="bk-price"><b>${R.money(k.price)}</b><span>for the ${B.session === 'day' ? 'day' : 'night swim'}, plus entrance</span></div>
            <p class="bk-left ${k.free.length <= 1 ? 'low' : ''}">${!k.free.length ? 'Fully reserved' : B.pax > k.cap ? `Too small for ${B.pax} people` : k.free.length <= 2 ? `Only ${k.free.length} left` : `${k.free.length} available`}</p>
            <button class="btn ${B.kind === k.kind ? '' : 'ghost'}" data-b="pick" data-v="${esc(k.kind)}" ${ok ? '' : 'disabled'}>${B.kind === k.kind ? 'Selected' : 'Choose'}</button></div></article>`; }).join('')}</div>
        ${sel() ? '<button class="btn big bk-go" data-b="next">Continue</button>' : ''}
        ${K.every(k => !k.free.length || B.pax > k.cap) ? `<div class="bk-card bk-none"><b>Nothing fits on this date.</b><p class="muted">Try another date, split the group, or message us on Messenger and we'll find you a spot.</p><button class="btn ghost" data-b="back">Change date</button></div>` : ''}`;
    }
    const O = roomOptions(), n = nights();
    return `<button class="bk-back" data-b="back">${R.icon('back')}Change dates</button><h1 tabindex="-1">Choose your room</h1>
      <p class="lead">${longDate(B.arrive)} → ${longDate(B.depart)} · ${n} night${n === 1 ? '' : 's'} · ${people()} guest${people() === 1 ? '' : 's'}</p>
      ${errors.pick ? `<p class="err" role="alert">${esc(errors.pick)}</p>` : ''}
      <div class="bk-rooms">${O.map(o => { const ok = o.left > 0 && o.fits, [bg, ico] = TYPE_LOOK[o.t.id] || ['#E9E1D3', 'i-bed']; return `<article class="bk-room ${B.type === o.t.id ? 'picked' : ''} ${ok ? '' : 'off'}">
        <div class="bk-pic" style="background:${bg}">${R.icon(ico.slice(2))}<span>${esc(o.t.view)}</span></div>
        <div class="bk-room-body"><h2>${esc(o.t.name)}</h2>
          <p class="bk-facts">${R.icon('users')}Sleeps ${o.t.cap} · ${R.icon('bed')}${esc(o.t.bed)} · ${esc(o.t.size)}</p>
          <div class="bk-price"><b>${R.money(o.total)}</b><span>for ${n} night${n === 1 ? '' : 's'} · ${R.money(o.total / n)} a night${o.seasons.length ? ` · ${o.seasons.map(esc).join(', ')} rates` : ''}</span></div>
          <p class="bk-left ${o.left <= 2 ? 'low' : ''}">${!o.left ? 'Sold out for these dates' : !o.fits ? `Sleeps ${o.t.cap}: too small for ${people()}` : o.left <= 2 ? `Only ${o.left} left` : 'Available'}</p>
          <button class="btn ${B.type === o.t.id ? '' : 'ghost'}" data-b="pick" data-v="${o.t.id}" ${ok ? '' : 'disabled'} aria-label="${B.type === o.t.id ? 'Selected' : 'Choose'} ${esc(o.t.name)}, ${R.money(o.total)}">${B.type === o.t.id ? 'Selected' : 'Choose'}</button></div></article>`; }).join('')}</div>
      ${sel() ? '<button class="btn big bk-go" data-b="next">Continue</button>' : ''}
      ${O.every(o => !o.left || !o.fits) ? `<div class="bk-card bk-none"><b>No room fits ${people()} guests on these dates.</b><p class="muted">Try other dates, or message us: big groups can book two rooms.</p><button class="btn ghost" data-b="back">Change dates</button></div>` : ''}`;
  }
  function step3() {
    return `<button class="bk-back" data-b="back">${R.icon('back')}Back</button><h1 tabindex="-1">Your details</h1><p class="lead">We'll text your confirmation. Takes less than a minute.</p>
      <div class="bk-layout"><form class="bk-card" id="b-form" novalidate>
        ${field('name', 'Full name', `<input id="b-name" data-f="name" autocomplete="name" value="${esc(B.name)}" placeholder="e.g. Maria Santos" ${aria('name')}>`)}
        ${field('phone', 'Mobile number', `<input id="b-phone" data-f="phone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(B.phone)}" placeholder="0917 123 4567" ${aria('phone')}>`, 'For your confirmation text and arrival updates')}
        ${field('email', 'Email <span class="opt">(optional)</span>', `<input id="b-email" data-f="email" type="email" inputmode="email" autocomplete="email" value="${esc(B.email)}" placeholder="name@gmail.com" ${aria('email')}>`, 'For a copy of your booking')}
        ${B.tab === 'stay' ? field('eta', 'Arriving around', `<select id="b-eta" data-f="eta">${['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '20:00', '22:00'].map(t => `<option ${B.eta === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`)
          : field('eta', 'Arriving around', `<select id="b-eta" data-f="eta">${(B.session === 'day' ? ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'] : ['18:00', '19:00', '20:00']).map(t => `<option ${B.eta === t ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
        ${field('requests', 'Special requests <span class="opt">(optional)</span>', `<textarea id="b-requests" data-f="requests" rows="2" placeholder="${B.tab === 'stay' ? 'e.g. birthday surprise, ground floor, baby crib' : 'e.g. birthday, sound system, bringing lechon'}">${esc(B.requests)}</textarea>`)}
        <label class="bk-check ${errors.consent ? 'has-err' : ''}"><input type="checkbox" id="b-consent" data-f="consent" ${B.consent ? 'checked' : ''} ${aria('consent')}><span>I agree that Camsair keeps my details for this booking, as in the privacy notice (Data Privacy Act).</span></label>
        ${errors.consent ? `<p class="err" id="e-consent" role="alert">${esc(errors.consent)}</p>` : ''}
        <button class="btn big bk-go" data-b="next">Continue to payment</button></form>
        <aside class="bk-aside">${summary(true)}</aside></div>`;
  }
  function step4() {
    const o = sel(), total = B.tab === 'stay' ? o.total : o.price, dep = depositOf(total);
    const M = [['gcash', 'GCash'], ['maya', 'Maya'], ['card', 'Debit / credit card']];
    return `<button class="bk-back" data-b="back">${R.icon('back')}Back</button><h1 tabindex="-1">Pay the deposit</h1><p class="lead">Your ${B.tab === 'stay' ? 'room' : 'cottage'} is held once the ${R.S.rules.deposit}% deposit is paid. The rest is paid ${B.tab === 'stay' ? 'at check-in' : 'at the gate'}.</p>
      <div class="bk-layout"><div class="bk-card">
        <fieldset class="bk-choice bk-pay"><legend>Pay with</legend>${M.map(([v, l]) => `<label class="bk-opt"><input type="radio" name="pay" value="${v}" data-f="pay" ${B.pay === v ? 'checked' : ''}><span><b>${l}</b>${v === 'card' ? '<small>Visa, Mastercard</small>' : '<small>Pay in the app</small>'}</span></label>`).join('')}</fieldset>
        <div class="bk-policy"><b>Good to know</b><ul><li>${esc(R.S.rules.cancellation)}</li><li>Bring a valid ID. Seniors and PWDs: bring your ID for the 20% discount.</li><li>Prices include 12% VAT.</li></ul></div>
        <button class="btn big bk-go" data-b="pay" ${busy ? 'disabled aria-busy="true"' : ''}>${busy ? 'Opening ' + M.find(m => m[0] === B.pay)[1] + '…' : `${R.icon('lock')}Pay ${R.money(dep)} deposit with ${M.find(m => m[0] === B.pay)[1]}`}</button>
        <p class="small muted center" style="margin-top:8px">Demo: no money is taken. In the real site you finish paying in ${M.find(m => m[0] === B.pay)[1]}.</p></div>
        <aside class="bk-aside">${summary(false)}</aside></div>`;
  }
  function done() {
    const d = B.done;
    return `<div class="bk-done"><span class="bk-done-ico">${R.icon('check')}</span><h1 tabindex="-1">You're booked!</h1>
      <p class="lead">Booking number <b class="bk-ref">${esc(d.ref)}</b>. We've texted the details to ${esc(phoneNice(d.phone))}${d.email ? ' and emailed ' + esc(d.email) : ''}.</p>
      <div class="bk-card bk-done-card"><dl>${d.rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></div>
      <div class="bk-card"><b>What's next</b><ul class="bk-next">${d.next.map(x => `<li>${x}</li>`).join('')}</ul></div>
      <div class="row center" style="margin-top:16px"><button class="btn ghost" data-b="ics">${R.icon('calendar')}Add to calendar</button><button class="btn" data-b="again">Make another booking</button></div></div>`;
  }

  // ---------- create the booking in the PMS ----------
  function create() {
    R.load(); // latest data, in case the front desk changed something meanwhile
    const phone = B.phone.replace(/[\s-]/g, ''), digits = phone.replace(/\D/g, '').slice(-10);
    let g = R.S.guests.find(x => x.phone.replace(/\D/g, '').slice(-10) === digits);
    if (!g) { g = { id: R.nextId('G'), name: B.name.trim(), email: B.email.trim(), phone: phoneNice(phone), town: '', tag: '', stays: 0, nationality: 'Filipino', idType: '', idNo: '', prefs: '' }; R.S.guests.unshift(g); }
    else if (!g.email && B.email.trim()) g.email = B.email.trim();
    const method = { gcash: 'GCash', maya: 'Maya', card: 'Card' }[B.pay] + ' (online)', payRef = 'WEB-' + Math.floor(1e8 + Math.random() * 9e8);
    const payment = amount => ({ id: R.nextId('P'), date: bd(), at: R.now(), amount, method, ref: payRef, or: R.nextOR(), by: 'web', shift: '', note: 'Deposit, booking website' });
    if (B.tab === 'stay') {
      const t = R.type(B.type), n = nights();
      if (R.typeAvail(t.id, B.arrive, n) < 1) return { error: `Sorry, the last ${t.name} for these dates was just booked. Please choose another room.` };
      const rates = R.quote(t.id, B.arrive, n), room = (R.freeRooms(t.id, B.arrive, n)[0] || {}).no || null;
      const r = { id: 'CR-' + (++R.S.seq), guestId: g.id, type: t.id, room, arrive: B.arrive, nights: n, rates, adults: B.adults, children: B.children, channel: 'Website', status: 'booked', notes: B.requests.trim(), folio: [], payments: [], reg: null, eta: B.eta, created: bd() };
      const total = rates.reduce((a, b) => a + b, 0), dep = depositOf(total);
      r.payments.push(payment(dep));
      R.S.reservations.push(r);
      R.log('Booking created', `Website: ${t.name}, ${n}n from ${R.fmtShort(B.arrive)} · ${R.money(total)} · deposit ${R.peso(dep)} ${method}`, r.id, 'web');
      R.save();
      return { ref: r.id, phone, email: B.email.trim(), ics: [B.arrive, B.depart, `Camsair Resort: ${t.name}`],
        rows: [['Room', esc(t.name)], ['Check-in', `${longDate(B.arrive)}, from ${esc(R.S.rules.checkin)}`], ['Check-out', `${longDate(B.depart)}, by ${esc(R.S.rules.checkout)}`], ['Guests', `${B.adults} adult${B.adults === 1 ? '' : 's'}${B.children ? `, ${B.children} child${B.children === 1 ? '' : 'ren'}` : ''}`], ['Paid', `${R.money(dep)} deposit by ${esc(method)}`], ['To pay at check-in', R.money(total - dep)]],
        next: ['Bring a valid ID for check-in. Seniors and PWDs: bring your ID for the discount.', `Check-in is from ${esc(R.S.rules.checkin)}. Tell us on Messenger if you'll arrive late.`, 'Need to change dates? Message us with your booking number. You can move your dates once.'] };
    }
    const k = cottageKinds().find(x => x.kind === B.kind);
    if (!k || !k.free.length) return { error: 'Sorry, that cottage was just reserved. Please choose another one.' };
    const c = k.free[0], dep = depositOf(c.price);
    const v = { id: R.nextId('EV'), venue: c.id, date: B.date, session: B.session, name: B.name.trim(), phone: phoneNice(phone), pax: B.pax, catering: null, eta: B.eta, notes: B.requests.trim(), overNote: '', resId: '', price: c.price, status: 'booked', payments: [payment(dep)], created: bd(), source: 'Website', guestId: g.id };
    R.S.venueBookings.push(v);
    R.log('Cottage reserved', `Website: ${c.name}, ${R.fmtShort(B.date)} ${B.session === 'day' ? 'day tour' : 'night swim'} · ${v.name} · deposit ${R.peso(dep)} ${method}`, v.id, 'web');
    R.save();
    return { ref: v.id, phone, email: B.email.trim(), ics: [B.date, B.date, `Camsair Resort: ${c.name}`],
      rows: [['Cottage', esc(c.name)], ['Date', longDate(B.date)], ['Session', B.session === 'day' ? `Day tour, ${esc(R.S.dayuse.hours.day)}` : `Night swim, ${esc(R.S.dayuse.hours.night)}`], ['People', B.pax], ['Paid', `${R.money(dep)} deposit by ${esc(method)}`], ['To pay at the gate', `${R.money(c.price - dep)} + entrance`]],
      next: ['Show your booking number at the gate. Your cottage is held until 1 hour after your arrival time.', 'Entrance is paid at the gate. Seniors and PWDs: bring your ID for the 20% discount.', 'Outside lechon and drinks have a corkage fee.'] };
  }

  // ---------- render + events ----------
  function render(focusTop) {
    const main = $('#book');
    const tabs = B.step === 5 ? '' : `<div class="bk-tabs" role="tablist" aria-label="What do you want to book?">${[['stay', 'bed', 'Stay overnight', 'Rooms and villas'], ['day', 'sun', 'Day tour & cottages', 'Kubo, family cottage, pavilion']].map(([v, ico, l, s]) => `<button role="tab" aria-selected="${B.tab === v}" class="${B.tab === v ? 'on' : ''}" data-b="tab" data-v="${v}">${R.icon(ico)}<span><b>${l}</b><small>${s}</small></span></button>`).join('')}</div>`;
    const body = B.step === 5 ? done() : [step1, step2, step3, step4][B.step - 1]();
    const o = B.step > 1 && B.step < 5 ? sel() : null, total = o ? (B.tab === 'stay' ? o.total : o.price) : 0;
    // phones: the total and the next button stay at the bottom of the screen
    const dock = o && B.step < 4 ? `<div class="bk-dock"><div><small>${B.tab === 'stay' ? `${nights()} night${nights() === 1 ? '' : 's'}` : 'Cottage'} · total</small><b>${R.money(total)}</b><small>${R.money(depositOf(total))} deposit today</small></div><button class="btn" data-b="next">${B.step === 2 ? 'Continue' : 'Continue to payment'}</button></div>` : '';
    main.innerHTML = tabs + (B.step === 5 ? '' : progress()) + `<section class="bk-body">${body}</section>` + dock;
    document.body.classList.toggle('has-dock', !!dock);
    if (focusTop) { const h = main.querySelector('h1'); if (h) h.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
    else { const first = main.querySelector('[aria-invalid="true"]'); if (first) first.focus(); }
  }
  const go = (step, top) => { errors = {}; B.step = step; keep(); render(top !== false); };

  document.addEventListener('input', e => {
    const f = e.target.dataset && e.target.dataset.f; if (!f) return;
    const el = e.target;
    B[f] = el.type === 'checkbox' ? el.checked : el.value;
    if (f === 'arrive' && B.depart <= B.arrive) B.depart = addDays(B.arrive, 1);
    if (['arrive', 'depart', 'date', 'session', 'pay'].includes(f)) { if (f !== 'pay') { B.type = ''; B.kind = ''; } keep(); render(false); return; }
    if (errors[f]) { delete errors[f]; const box = el.closest('.has-err'); if (box) { box.classList.remove('has-err'); const m = box.querySelector('.err'); if (m) m.remove(); el.removeAttribute('aria-invalid'); } }
    keep();
  });
  document.addEventListener('submit', e => e.preventDefault());
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    e.preventDefault();
    const a = b.dataset.b;
    if (a === 'tab') { B.tab = b.dataset.v; B.step = 1; B.type = ''; B.kind = ''; errors = {}; keep(); render(true); }
    else if (a === 'n') { B[b.dataset.k] = Math.max(b.dataset.k === 'children' ? 0 : 1, B[b.dataset.k] + +b.dataset.n); B.type = ''; B.kind = ''; keep(); render(false); }
    else if (a === 'pick') { if (B.tab === 'stay') B.type = b.dataset.v; else B.kind = b.dataset.v; errors = {}; keep(); render(false); }
    else if (a === 'back') go(Math.max(1, B.step - 1));
    else if (a === 'next') {
      errors = check(B.step);
      if (Object.keys(errors).length) { render(false); return; }
      go(B.step + 1);
    }
    else if (a === 'pay') {
      if (busy) return;
      for (const s of [1, 2, 3]) { errors = check(s); if (Object.keys(errors).length) { go(s); errors = check(s); render(false); return; } }
      busy = true; render(false);
      setTimeout(() => { // stands in for the GCash / Maya / card page
        busy = false;
        const res = create();
        if (res.error) { B.type = ''; B.kind = ''; errors = { pick: res.error }; B.step = 2; keep(); render(true); return; }
        B.done = res; go(5);
      }, 900);
    }
    else if (a === 'ics') {
      const [from, to, title] = B.done.ics, d = s => s.replace(/-/g, '');
      const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Camsair Resort//Booking//EN\r\nBEGIN:VEVENT\r\nUID:${B.done.ref}@camsair\r\nDTSTAMP:${d(R.util.realToday())}T000000Z\r\nDTSTART;VALUE=DATE:${d(from)}\r\nDTEND;VALUE=DATE:${d(addDays(to, from === to ? 1 : 0))}\r\nSUMMARY:${title}\r\nDESCRIPTION:Booking ${B.done.ref}\r\nLOCATION:Camsair Resort\\, Initao\\, Misamis Oriental\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), link = document.createElement('a');
      link.href = url; link.download = `camsair-${B.done.ref}.ics`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    else if (a === 'again') { const tab = B.tab; B = fresh(); B.tab = tab; keep(); render(true); }
  });
  render(false);
})();
