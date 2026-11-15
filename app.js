/* =========================================================
   CHIRON+ · Astronaut Health Dashboard — DEMO SIMULATION
   NASA Space Apps Challenge 2026
   All data below is SIMULATED (no real sensors connected).
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   Helpers
   --------------------------------------------------------- */
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const rint = (a, b) => Math.round(rnd(a, b));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad = n => String(n).padStart(2, '0');
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hhmmss = (d = new Date()) => `${hhmm(d)}:${pad(d.getSeconds())}`;
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sum = a => a.reduce((s, v) => s + v, 0);
const fmt = (v, dec = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const minToHHMM = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TICK_MS = 2000;

// Seeded random → historical data is stable between reloads
function seeded(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const R = seeded(20261115);
const sr = (a, b) => a + R() * (b - a);
const sn = () => (R() + R() + R() - 1.5) * 2;   // ≈ normal(0,1)

/* ---------------------------------------------------------
   Mission context
   --------------------------------------------------------- */
const MISSION = { day: 142, length: 180 };
const NOW0 = Date.now();
const MET_START = NOW0 - ((MISSION.day - 1) * 24 + 7.25) * 3600e3;

/* ---------------------------------------------------------
   Live metrics (drift towards a baseline + noise; events override the target)
   --------------------------------------------------------- */
const M = {
  hr:    { v: 75,    base: 75,    vol: 3.5,  min: 42,   max: 165 },
  temp:  { v: 36.7,  base: 36.7,  vol: 0.1,  min: 35.5, max: 40 },
  spo2:  { v: 98,    base: 97.6,  vol: 1,    min: 84,   max: 100 },
  glu:   { v: 92,    base: 94,    vol: 3,    min: 50,   max: 190, every: 3 },
  sys:   { v: 120,   base: 119,   vol: 3.5,  min: 90,   max: 175, every: 2 },
  dia:   { v: 80,    base: 79,    vol: 2.5,  min: 55,   max: 110, every: 2 },
  vo2:   { v: 45,    base: 45,    vol: 0.3,  min: 43,   max: 47,  every: 5 },
  o2:    { v: 20.9,  base: 20.9,  vol: 0.08, min: 17,   max: 24 },
  co2:   { v: 2900,  base: 2900,  vol: 140,  min: 1500, max: 7000 },
  ctemp: { v: 22.8,  base: 22.8,  vol: 0.12, min: 16,   max: 30 },
  noise: { v: 56,    base: 56,    vol: 1.6,  min: 42,   max: 80 },
  hum:   { v: 46,    base: 46,    vol: 1,    min: 18,   max: 84,  every: 2 },
  press: { v: 101.3, base: 101.3, vol: 0.05, min: 96.5, max: 103.5, every: 2 },
  dose:  { v: 66,    base: 66,    vol: 5,    min: 40,   max: 2000, prop: true } // µSv/h
};
const events = {};     // metric -> { target, ticks }
let tick = 0;

const tempHist = [], spo2Hist = [], doseHist = [];
for (let i = 0; i < 30; i++) { tempHist.push(+(36.7 + rnd(-0.2, 0.2)).toFixed(1)); spo2Hist.push(Math.round(rnd(96, 99))); }
for (let i = 0; i < 60; i++) doseHist.push(66 + rnd(-6, 6));

function stepMetric(k) {
  const m = M[k];
  if (m.every && tick % m.every) return;
  const e = events[k];
  const target = e ? e.target : m.base;
  const rate = e ? 0.4 : 0.18;
  const noise = (Math.random() - 0.5) * m.vol * (m.prop ? target / m.base : 1);
  m.v = clamp(m.v + (target - m.v) * rate + noise, m.min, m.max);
}

/* ---------------------------------------------------------
   Anomaly events — the most common in-flight alerts, frequent on purpose for the demo
   --------------------------------------------------------- */
function setEv(obj, ticks) {
  const t = ticks || rint(5, 10);
  for (const k in obj) events[k] = { target: rnd(obj[k][0], obj[k][1]), ticks: t };
}
const EVENT_CATALOG = [
  // ---- warnings (most common) ----
  { w: 10, run: () => setEv({ hr: [104, 118] }) },               // elevated heart rate
  { w: 8,  run: () => setEv({ spo2: [93, 94.2] }) },             // low SpO2
  { w: 8,  run: () => setEv({ co2: [4250, 4900] }) },            // high cabin CO2
  { w: 7,  run: () => setEv({ noise: [66.5, 71] }) },            // noisy cabin
  { w: 6,  run: () => setEv({ temp: [37.7, 38.1] }) },           // mild hyperthermia
  { w: 6,  run: () => setEv({ sys: [140, 150], dia: [89, 95] }) },// high blood pressure
  { w: 5,  run: () => setEv({ glu: [134, 150] }, 12) },          // high glucose
  { w: 3,  run: () => setEv({ glu: [60, 67] }, 12) },            // low glucose
  { w: 4,  run: () => setEv({ ctemp: [27, 28] }) },              // warm cabin
  { w: 4,  run: () => setEv({ dose: [165, 230] }) },             // elevated dose rate
  { w: 3,  run: () => setEv({ hum: [76.5, 80] }) },              // humid cabin
  { w: 4,  run: () => logDizziness(true) },                      // dizziness episode
  // ---- urgent (rarer) ----
  { w: 2.5, run: () => setEv({ hr: [133, 146] }) },              // tachycardia
  { w: 2,   run: () => setEv({ spo2: [87, 89.4] }) },            // hypoxemia
  { w: 1.5, run: () => setEv({ co2: [5600, 6300] }) },           // critical CO2
  { w: 1.2, run: () => setEv({ o2: [18.5, 19.1] }) },            // low cabin O2
  { w: 1,   run: () => setEv({ temp: [38.6, 39.1] }) }           // fever
];
function maybeEvent() {
  if (tick === 3) { setEv({ hr: [105, 112] }, 7); return; }      // quick first alert for the demo
  if (Object.keys(events).length >= 2 || Math.random() > 0.17) return;
  const total = sum(EVENT_CATALOG.map(e => e.w));
  let r = Math.random() * total;
  for (const e of EVENT_CATALOG) { if ((r -= e.w) <= 0) { e.run(); return; } }
}

/* ---------------------------------------------------------
   Solar storm state machine: calm → watch (flare) → storm (SPE) → calm
   --------------------------------------------------------- */
const storm = { state: 'calm', ticks: 24, kp: 2.3, pfu: 0.6, xlog: -6.2, wind: 410, flare: null, eta: 0 };
const manual = new Map();   // non-threshold alerts: key -> { sev, msg, card, view, ticks }

function stepStorm() {
  storm.ticks--;
  if (storm.ticks <= 0) {
    if (storm.state === 'calm') {
      storm.state = 'watch'; storm.ticks = rint(9, 13);
      storm.flare = pick(['M4.7', 'M7.2', 'X1.3', 'X2.1']);
      manual.set('storm', { sev: 'warn', msg: `Solar flare ${storm.flare} detected — proton event possible`, card: 'stormPanel', view: 'radiation' });
    } else if (storm.state === 'watch') {
      storm.state = 'storm'; storm.ticks = rint(16, 22);
      events.dose = { target: rnd(480, 900), ticks: storm.ticks + 1 };
      manual.set('storm', { sev: 'urgent', msg: 'Solar particle event — move to storm shelter now', card: 'stormPanel', view: 'radiation' });
    } else {
      storm.state = 'calm'; storm.ticks = rint(70, 120); storm.flare = null;
      manual.delete('storm');
    }
  }
  storm.eta = storm.state === 'watch' ? storm.ticks * 2 : 0;
  const tg = { calm: { kp: 2.4, pfu: 0.7, x: -6.2, wind: 420 }, watch: { kp: 4.8, pfu: 7, x: -4.5, wind: 540 }, storm: { kp: 6.8, pfu: 900, x: -5.2, wind: 700 } }[storm.state];
  storm.kp = clamp(storm.kp + (tg.kp - storm.kp) * 0.25 + rnd(-0.12, 0.12), 0, 9);
  storm.pfu = Math.max(0.1, storm.pfu + (tg.pfu - storm.pfu) * 0.3 + rnd(-0.08, 0.08) * tg.pfu);
  storm.xlog = storm.xlog + (tg.x - storm.xlog) * 0.3 + rnd(-0.05, 0.05);
  storm.wind = storm.wind + (tg.wind - storm.wind) * 0.2 + rnd(-8, 8);
}
const sScale = p => p >= 10000 ? 'S4' : p >= 1000 ? 'S3' : p >= 100 ? 'S2' : p >= 10 ? 'S1' : 'S0';
const sName = { S0: 'None', S1: 'Minor', S2: 'Moderate', S3: 'Strong', S4: 'Severe' };
const xClass = lf => { const c = ['A', 'B', 'C', 'M', 'X'][clamp(Math.floor(lf + 8), 0, 4)]; return c + (Math.pow(10, lf - Math.floor(lf))).toFixed(1); };

/* ---------------------------------------------------------
   Alert rules (warning / urgent)
   --------------------------------------------------------- */
const r0 = v => Math.round(v);
const RULES = [
  { k: 'hr', card: 'c-hr', view: 'vital', eval: () => { const v = M.hr.v; return v >= 130 ? 'urgent' : (v > 100 || v < 50) ? 'warn' : null; },
    msg: s => s === 'urgent' ? `Tachycardia detected: ${r0(M.hr.v)} BPM` : M.hr.v < 50 ? `Low heart rate: ${r0(M.hr.v)} BPM` : `Elevated heart rate: ${r0(M.hr.v)} BPM` },
  { k: 'temp', card: 'c-temp', view: 'vital', eval: () => M.temp.v >= 38.5 ? 'urgent' : M.temp.v >= 37.6 ? 'warn' : null,
    msg: s => s === 'urgent' ? `Fever: ${M.temp.v.toFixed(1)} °C` : `Body temperature elevated: ${M.temp.v.toFixed(1)} °C` },
  { k: 'spo2', card: 'c-spo2', view: 'vital', eval: () => M.spo2.v < 90 ? 'urgent' : M.spo2.v < 94.5 ? 'warn' : null,
    msg: s => s === 'urgent' ? `Hypoxemia: SpO2 ${r0(M.spo2.v)}%` : `Low oxygen saturation: ${r0(M.spo2.v)}%` },
  { k: 'glu', card: 'c-glu', view: 'vital', eval: () => { const v = M.glu.v; return (v > 180 || v < 55) ? 'urgent' : (v > 130 || v < 70) ? 'warn' : null; },
    msg: () => M.glu.v < 70 ? `Low glucose: ${r0(M.glu.v)} mg/dL` : `High glucose: ${r0(M.glu.v)} mg/dL` },
  { k: 'bp', card: 'c-bp', view: 'vital', eval: () => (M.sys.v >= 160 || M.dia.v >= 100) ? 'urgent' : (M.sys.v > 135 || M.dia.v > 88) ? 'warn' : null,
    msg: () => `High blood pressure: ${r0(M.sys.v)}/${r0(M.dia.v)} mmHg` },
  { k: 'o2', card: 'e-o2', view: 'radiation', eval: () => M.o2.v < 19.5 ? 'urgent' : M.o2.v < 20 ? 'warn' : null,
    msg: () => `Cabin O2 low: ${M.o2.v.toFixed(1)}% — hypoxia risk` },
  { k: 'co2', card: 'e-co2', view: 'radiation', eval: () => M.co2.v >= 5300 ? 'urgent' : M.co2.v >= 4000 ? 'warn' : null,
    msg: s => s === 'urgent' ? `Cabin CO2 critical: ${fmt(M.co2.v)} ppm` : `Cabin CO2 high: ${fmt(M.co2.v)} ppm — headache risk` },
  { k: 'ctemp', card: 'e-ctemp', view: 'radiation', eval: () => (M.ctemp.v > 26.7 || M.ctemp.v < 18.3) ? 'warn' : null,
    msg: () => `Cabin temperature out of range: ${M.ctemp.v.toFixed(1)} °C` },
  { k: 'noise', card: 'e-noise', view: 'radiation', eval: () => M.noise.v > 65 ? 'warn' : null,
    msg: () => `Cabin noise high: ${r0(M.noise.v)} dBA` },
  { k: 'hum', card: 'e-hum', view: 'radiation', eval: () => (M.hum.v > 75 || M.hum.v < 25) ? 'warn' : null,
    msg: () => `Cabin humidity out of range: ${r0(M.hum.v)}%` },
  { k: 'dose', card: 'doseRatePanel', view: 'radiation', eval: () => storm.state !== 'storm' && M.dose.v > 150 ? 'warn' : null,
    msg: () => `Elevated radiation dose rate: ${r0(M.dose.v)} µSv/h` }
];

const active = new Map();   // key -> { sev, entry }
const alertLog = [];

function evaluateAlerts() {
  const current = new Map();
  for (const r of RULES) { const sev = r.eval(); if (sev) current.set(r.k, { sev, msg: r.msg(sev), card: r.card, view: r.view }); }
  for (const [k, a] of manual) current.set(k, a);

  for (const [k, c] of current) {
    const prev = active.get(k);
    if (!prev || (prev.sev === 'warn' && c.sev === 'urgent')) {
      if (prev) { prev.entry.resolved = true; prev.entry.note = 'escalated'; }
      const entry = { sev: c.sev, msg: c.msg, time: hhmmss(), resolved: false };
      alertLog.unshift(entry);
      toast(c.sev, c.msg);
      active.set(k, { sev: c.sev, entry, view: c.view });
    } else if (prev.sev === 'urgent' && c.sev === 'warn') {
      prev.sev = 'warn';
    }
  }
  for (const [k, a] of active) if (!current.has(k)) { a.entry.resolved = true; active.delete(k); }
  alertLog.length = Math.min(alertLog.length, 30);

  document.querySelectorAll('.alertable').forEach(el => el.classList.remove('warn', 'urgent'));
  for (const [, c] of current) { const el = c.card && $(c.card); if (el) el.classList.add(c.sev); }

  // per-tab indicator
  const worst = {};
  for (const [, c] of current) if (c.view && worst[c.view] !== 'urgent') worst[c.view] = c.sev;
  ['vital', 'trends', 'anatomy', 'radiation'].forEach(v => { $('td-' + v).className = 'tdot ' + (worst[v] || ''); });

  renderStatus();
}

function renderStatus() {
  const n = active.size;
  const urgent = [...active.values()].filter(a => a.sev === 'urgent').length;
  const level = urgent ? 'urgent' : n ? 'warn' : 'ok';

  const pill = $('statusPill'), ic = $('statusIc'), svg = $('statusSvg');
  pill.classList.remove('st-ok', 'st-warn', 'st-urgent'); pill.classList.add('st-' + level);
  ic.className = 'ic ' + level;
  if (level === 'ok') {
    svg.innerHTML = '<path d="M7 16l5.5 6L24 8"/>';
    $('statusSub').innerHTML = 'Everything under<br>control';
  } else {
    svg.innerHTML = '<path d="M15 6.5v11"/><circle cx="15" cy="23" r="1" fill="#fff"/>';
    $('statusSub').innerHTML = level === 'urgent' ? 'URGENT - ANOMALY' : 'Warning - Check health<br>status';
  }

  const badge = $('alertBadge');
  badge.textContent = n; badge.classList.toggle('show', n > 0); badge.classList.toggle('warn', n > 0 && !urgent);
  $('siren').classList.toggle('active', n > 0);
  $('alertsSub').textContent = n ? `${n} active${urgent ? ` · ${urgent} urgent` : ''} · Deploy` : 'Deploy to see more';

  $('alertsList').innerHTML = alertLog.length
    ? alertLog.map(a => `<li class="${a.resolved ? 'resolved' : ''}"><span class="dot ${a.sev}"></span><span>${a.msg}</span><span class="meta"><span class="time">${a.time}</span><span class="st ${a.resolved ? '' : 'on'}">${a.resolved ? (a.note || 'RESOLVED').toUpperCase() : 'ACTIVE'}</span></span></li>`).join('')
    : '<li class="empty">No alerts registered</li>';
}

function toast(sev, msg) {
  const t = document.createElement('div');
  t.className = `toast ${sev}`;
  t.innerHTML = `<div class="ti">!</div><div><b>${sev === 'urgent' ? 'URGENT - ANOMALY' : 'Warning - Check health status'}</b><span>${msg}</span></div><button aria-label="Close">×</button>`;
  const box = $('toasts');
  box.prepend(t);
  while (box.children.length > 3) box.lastChild.remove();
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 300); };
  t.querySelector('button').onclick = close;
  setTimeout(close, sev === 'urgent' ? 9000 : 6000);
}

/* ---------------------------------------------------------
   Chart engine (SVG, responsive, hover tooltips)
   --------------------------------------------------------- */
function niceStep(range, count) {
  const raw = range / count, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function yTicks(lo, hi, count = 4) {
  const st = niceStep(hi - lo, count), out = [];
  for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(6));
  return out;
}
const axFmt = v => Math.abs(v) >= 1000 ? fmt(v, 0) : (Math.abs(v % 1) > 1e-6 ? fmt(v, 1) : fmt(v, 0));

const chartRO = new ResizeObserver(es => es.forEach(e => drawChart(e.target)));
function chart(el, cfg) {
  if (typeof el === 'string') el = $(el);
  el._cfg = cfg;
  if (!el._obs) {
    el._obs = true; chartRO.observe(el);
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); el._mx = e.clientX - r.left; showTip(el); });
    el.addEventListener('pointerleave', () => { el._mx = null; const t = el.querySelector('.tip'); if (t) t.style.opacity = 0; const hl = el.querySelector('.hl'); if (hl) hl.setAttribute('opacity', 0); });
  }
  drawChart(el);
}
function drawChart(el) {
  const cfg = el._cfg; if (!cfg) return;
  const W = el.clientWidth, H = el.clientHeight;
  if (W < 20 || H < 20) return;
  const svg = cfg.type === 'bar' ? barSVG(el, cfg, W, H) : cfg.type === 'hypno' ? hypnoSVG(el, cfg, W, H) : lineSVG(el, cfg, W, H);
  el.innerHTML = svg + '<div class="tip"></div>';
  if (el._mx != null) showTip(el);
}
function showTip(el) {
  const g = el._geom; if (!g) return;
  const i = g.index(el._mx);
  const tip = el.querySelector('.tip'), hl = el.querySelector('.hl');
  if (i == null) { tip.style.opacity = 0; if (hl) hl.setAttribute('opacity', 0); return; }
  const r = g.tip(i);
  tip.innerHTML = r.html;
  tip.style.left = clamp(r.x, 80, el.clientWidth - 80) + 'px';
  tip.style.top = r.y + 'px';
  tip.style.opacity = 1;
  if (hl) { hl.setAttribute('x1', r.x); hl.setAttribute('x2', r.x); hl.setAttribute('opacity', 0.45); }
}

function lineSVG(el, cfg, W, H) {
  const P = { l: cfg.padL ?? 42, r: 14, t: 14, b: cfg.noX ? 8 : 26 };
  const S = cfg.series, n = S[0].data.length;
  const vals = S.flatMap(s => s.data);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (cfg.band) { lo = Math.min(lo, cfg.band[0]); hi = Math.max(hi, cfg.band[1]); }
  const pv = (hi - lo) * 0.1 || 1; lo -= pv; hi += pv;
  if (cfg.yMin != null) lo = cfg.yMin;
  if (cfg.yMax != null) hi = cfg.yMax;
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const X = i => P.l + iw * (n < 2 ? 0 : i / (n - 1));
  const Y = v => P.t + ih * (1 - (v - lo) / (hi - lo));
  let s = `<svg width="${W}" height="${H}">`;
  (cfg.shades || []).forEach(sh => {
    s += `<rect x="${X(sh.i0)}" y="${P.t}" width="${Math.max(0, X(sh.i1) - X(sh.i0))}" height="${ih}" fill="${sh.color}" rx="4"/>`;
    if (sh.label) s += `<text x="${X(sh.i0) + 6}" y="${P.t + 13}" class="ax" style="fill:#4a4a7a;font-weight:500">${sh.label}</text>`;
  });
  if (cfg.band) {
    const c = S[0].color;
    s += `<rect x="${P.l}" y="${Y(cfg.band[1])}" width="${iw}" height="${Math.max(0, Y(cfg.band[0]) - Y(cfg.band[1]))}" fill="${c}" opacity=".06"/>`;
    cfg.band.forEach(b => { s += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(b)}" y2="${Y(b)}" stroke="${c}" stroke-opacity=".35" stroke-dasharray="4 4"/>`; });
  }
  yTicks(lo, hi, cfg.yCount || 4).forEach(t => {
    s += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="#eef0f5"/><text x="${P.l - 7}" y="${Y(t) + 3.5}" text-anchor="end" class="ax">${axFmt(t)}</text>`;
  });
  if (!cfg.noX) (cfg.ticks || []).forEach(t => { s += `<text x="${X(t.i)}" y="${H - 7}" text-anchor="middle" class="ax">${t.label}</text>`; });
  S.forEach(se => {
    const d = 'M' + se.data.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('L');
    if (se.fill) {
      const id = 'g' + Math.random().toString(36).slice(2, 9);
      s += `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${se.color}" stop-opacity=".25"/><stop offset="1" stop-color="${se.color}" stop-opacity="0"/></linearGradient></defs>`;
      s += `<path d="${d}L${X(n - 1).toFixed(1)},${P.t + ih}L${X(0).toFixed(1)},${P.t + ih}Z" fill="url(#${id})"/>`;
    }
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2}" stroke-linejoin="round" stroke-linecap="round"${se.dash ? ' stroke-dasharray="5 4"' : ''}/>`;
  });
  (cfg.markers || []).forEach(m => {
    const v = S[0].data[m.i];
    s += `<circle cx="${X(m.i)}" cy="${Y(v)}" r="5" fill="#fff" stroke="${S[0].color}" stroke-width="2.5"/><text x="${X(m.i)}" y="${Y(v) + 20}" text-anchor="middle" class="ax" style="font-weight:600;fill:#333">${m.label}</text>`;
  });
  if (cfg.live) {
    const v = S[0].data[n - 1];
    s += `<circle cx="${X(n - 1)}" cy="${Y(v)}" r="6" fill="${S[0].color}" opacity=".25"><animate attributeName="r" values="4;11;4" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="${X(n - 1)}" cy="${Y(v)}" r="4" fill="${S[0].color}"/>`;
  }
  s += `<line class="hl" y1="${P.t}" y2="${P.t + ih}" stroke="#111" stroke-dasharray="3 3" opacity="0"/></svg>`;
  el._geom = {
    index: mx => (mx < P.l - 10 || mx > W - P.r + 10) ? null : clamp(Math.round((mx - P.l) / iw * (n - 1)), 0, n - 1),
    tip: i => ({
      x: X(i), y: Math.max(48, Math.min(...S.map(se => Y(se.data[i])))),
      html: `<div class="k">${cfg.labels ? cfg.labels[i] : ''}</div>` + S.map(se => `<div><i style="background:${se.color}"></i>${se.label ? se.label + ': ' : ''}<b>${fmt(se.data[i], se.dec || 0)}</b> ${se.unit || ''}</div>`).join('')
    })
  };
  return s;
}

function barSVG(el, cfg, W, H) {
  const P = { l: cfg.padL ?? 40, r: 12, t: 16, b: 26 };
  const n = cfg.categories.length, iw = W - P.l - P.r, ih = H - P.t - P.b;
  const tot = cfg.categories.map((_, i) => cfg.stacks.reduce((a, st) => a + st.data[i], 0));
  const hi = (Math.max(...tot, cfg.target ? cfg.target.value : 0) * 1.15) || 1;
  const Y = v => P.t + ih * (1 - v / hi);
  const bw = iw / n, gap = cfg.gap ?? 0.3;
  let s = `<svg width="${W}" height="${H}">`;
  yTicks(0, hi, 4).forEach(t => {
    s += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="#eef0f5"/><text x="${P.l - 7}" y="${Y(t) + 3.5}" text-anchor="end" class="ax">${axFmt(t)}</text>`;
  });
  const every = Math.max(1, Math.ceil(n / (iw / 46)));
  for (let i = 0; i < n; i++) {
    let acc = 0;
    const x = P.l + bw * i + bw * gap / 2, w = bw * (1 - gap);
    cfg.stacks.forEach((st, si) => {
      const v = st.data[i]; if (v <= 0) return;
      const col = cfg.colorFn ? cfg.colorFn(i, si, st) : st.color;
      s += `<rect x="${x.toFixed(1)}" y="${Y(acc + v).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0.5, Y(acc) - Y(acc + v)).toFixed(1)}" fill="${col}" rx="${cfg.stacks.length > 1 ? 1.5 : 3}"/>`;
      acc += v;
    });
    if ((n - 1 - i) % every === 0) s += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="ax">${cfg.categories[i]}</text>`;
  }
  if (cfg.target) {
    const y = Y(cfg.target.value);
    s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke="#111" stroke-dasharray="5 4" stroke-opacity=".6"/><text x="${W - P.r}" y="${y - 5}" text-anchor="end" class="ax" style="fill:#111;font-weight:600">${cfg.target.label}</text>`;
  }
  s += '</svg>';
  const dec = cfg.dec ?? 1;
  el._geom = {
    index: mx => { const i = Math.floor((mx - P.l) / bw); return i >= 0 && i < n ? i : null; },
    tip: i => ({
      x: P.l + bw * i + bw / 2, y: Math.max(48, Y(tot[i])),
      html: `<div class="k">${cfg.labels ? cfg.labels[i] : cfg.categories[i]}</div>` +
        cfg.stacks.map(st => `<div><i style="background:${st.color}"></i>${st.label ? st.label + ': ' : ''}<b>${fmt(st.data[i], dec)}</b> ${cfg.unit || ''}</div>`).join('') +
        (cfg.stacks.length > 1 ? `<div>Total: <b>${fmt(tot[i], dec)}</b> ${cfg.unit || ''}</div>` : '')
    })
  };
  return s;
}

const STAGES = ['Awake', 'REM', 'Light', 'Deep'];
const STAGE_COL = ['#f5a300', '#8e5cd9', '#6ab0f3', '#1a237e'];
function hypnoSVG(el, cfg, W, H) {
  const P = { l: 50, r: 10, t: 6, b: 24 };
  const ep = cfg.epochs, n = ep.length, iw = W - P.l - P.r, ih = H - P.t - P.b, lh = ih / 4;
  const X = i => P.l + iw * i / n;
  let s = `<svg width="${W}" height="${H}">`;
  STAGES.forEach((l, k) => {
    const y = P.t + lh * (k + 0.5);
    s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke="#f0f0f6"/><text x="${P.l - 8}" y="${y + 3.5}" text-anchor="end" class="ax">${l}</text>`;
  });
  let d = '';
  ep.forEach((st, i) => { const y = (P.t + lh * (st + 0.5)).toFixed(1); d += (i ? `L${X(i).toFixed(1)},${y}` : `M${X(0).toFixed(1)},${y}`) + `L${X(i + 1).toFixed(1)},${y}`; });
  s += `<path d="${d}" fill="none" stroke="#c9c9d8" stroke-width="1"/>`;
  for (let i = 0; i < n;) {
    let j = i; while (j < n && ep[j] === ep[i]) j++;
    s += `<rect x="${X(i).toFixed(1)}" y="${(P.t + lh * ep[i] + lh * 0.2).toFixed(1)}" width="${Math.max(1.5, X(j) - X(i)).toFixed(1)}" height="${(lh * 0.6).toFixed(1)}" rx="3" fill="${STAGE_COL[ep[i]]}"/>`;
    i = j;
  }
  cfg.ticks.forEach(t => { s += `<text x="${X(t.i)}" y="${H - 7}" text-anchor="middle" class="ax">${t.label}</text>`; });
  s += `<line class="hl" y1="${P.t}" y2="${P.t + ih}" stroke="#111" stroke-dasharray="3 3" opacity="0"/></svg>`;
  el._geom = {
    index: mx => { const i = Math.floor((mx - P.l) / iw * n); return i >= 0 && i < n ? i : null; },
    tip: i => ({ x: X(i + 0.5), y: Math.max(48, P.t + lh * ep[i] + lh * 0.2), html: `<div class="k">${cfg.labels[i]}</div><div><i style="background:${STAGE_COL[ep[i]]}"></i><b>${STAGES[ep[i]]}</b></div>` })
  };
  return s;
}

function sparkSVG(data, color, cls = 'espark', lo, hi) {
  lo = lo ?? Math.min(...data); hi = hi ?? Math.max(...data);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const n = data.length;
  const pts = data.map((v, i) => `${(i / (n - 1) * 100).toFixed(2)},${(28 - (clamp(v, lo, hi) - lo) / (hi - lo) * 26).toFixed(2)}`).join('L');
  return `<svg class="${cls}" viewBox="0 0 100 30" preserveAspectRatio="none"><path d="M${pts}L100,30L0,30Z" fill="${color}" fill-opacity=".12"/><path d="M${pts}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

function ringSVG(pct, color, size, label) {
  const c0 = size / 2, r = size / 2 - 9, C = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${c0}" cy="${c0}" r="${r}" stroke="#eeeef5" stroke-width="11" fill="none"/>
    <circle cx="${c0}" cy="${c0}" r="${r}" stroke="${color}" stroke-width="11" fill="none" stroke-linecap="round" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${c0} ${c0})"/>
    <text x="${c0}" y="${c0 + size * 0.06}" text-anchor="middle" font-size="${size * 0.22}" font-weight="700" font-family="Inter">${Math.round(pct * 100)}%</text>
    <text x="${c0}" y="${c0 + size * 0.2}" text-anchor="middle" font-size="${size * 0.09}" fill="#6b6b7e" font-family="Inter">${label}</text></svg>`;
}

function gaugeSVG(value, limit, projected) {
  const cx = 110, cy = 112, r = 86;
  const pct = clamp(value / limit, 0.002, 1), pp = clamp(projected / limit, 0, 1);
  const pt = (f, rad = r) => { const a = Math.PI * (1 + f); return [(cx + rad * Math.cos(a)).toFixed(2), (cy + rad * Math.sin(a)).toFixed(2)]; };
  const arc = (f0, f1) => { const [x0, y0] = pt(f0), [x1, y1] = pt(f1); return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`; };
  const [a1, b1] = pt(pp, r - 15), [a2, b2] = pt(pp, r + 15), [lx, ly] = pt(pp, r + 24);
  return `<svg class="gauge" viewBox="0 0 220 140">
    <defs><linearGradient id="gaugeG" gradientUnits="userSpaceOnUse" x1="24" y1="0" x2="196" y2="0"><stop offset="0" stop-color="#1fb83a"/><stop offset=".6" stop-color="#f5b400"/><stop offset="1" stop-color="#e3141b"/></linearGradient></defs>
    <path d="${arc(0, 1)}" stroke="#eeeef5" stroke-width="18" fill="none" stroke-linecap="round"/>
    <path d="${arc(0, pp)}" stroke="#f5b400" stroke-opacity=".28" stroke-width="18" fill="none" stroke-linecap="round"/>
    <path d="${arc(0, pct)}" stroke="url(#gaugeG)" stroke-width="18" fill="none" stroke-linecap="round"/>
    <line x1="${a1}" y1="${b1}" x2="${a2}" y2="${b2}" stroke="#111" stroke-width="2"/>
    <text x="${lx}" y="${ly}" text-anchor="middle" font-size="8.5" fill="#111" font-family="Inter" font-weight="600">proj.</text>
    <text x="110" y="94" text-anchor="middle" font-size="27" font-weight="700" font-family="Inter">${fmt(value, 2)}</text>
    <text x="110" y="112" text-anchor="middle" font-size="10.5" fill="#6b6b7e" font-family="Inter">mSv of ${limit} mSv mission limit</text>
    <text x="24" y="134" text-anchor="middle" font-size="10" fill="#8a8a9c" font-family="Inter">0</text>
    <text x="196" y="134" text-anchor="middle" font-size="10" fill="#8a8a9c" font-family="Inter">${limit}</text></svg>`;
}

const kpi = (l, v, unit = '', d = '', style = '') =>
  `<div class="kpi"><div class="l">${l}</div><div class="v" style="${style}">${v}${unit ? ` <small>${unit}</small>` : ''}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;

/* =========================================================
   VITAL SIGNS (cards + ECG)
   ========================================================= */
function setText(id, value) {
  const el = $(id), s = String(value);
  if (el.textContent !== s) { el.textContent = s; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function renderVital() {
  setText('hr', r0(M.hr.v));
  setText('tNow', M.temp.v.toFixed(1));
  setText('tAvg', mean(tempHist).toFixed(1));
  setText('tMax', Math.max(...tempHist).toFixed(1));
  drawTempMini();
  setText('sNow', r0(M.spo2.v));
  setText('sAvg', r0(mean(spo2Hist)));
  setText('sMin', Math.min(...spo2Hist));
  setText('glu', r0(M.glu.v));
  const sys = r0(M.sys.v), dia = r0(M.dia.v);
  setText('bp', `${sys}/${dia}`); setText('sys', sys); setText('dia', dia);
  setText('vo2', M.vo2.v.toFixed(1));
}
function drawTempMini() {
  const h = tempHist, x0 = 12, x1 = 166, lo = 35.6, hi = 39.2;
  const sm = h.map((v, i) => mean(h.slice(Math.max(0, i - 2), i + 3)));
  const pts = sm.map((v, i) => [x0 + (x1 - x0) * i / (sm.length - 1), 38 - (clamp(v, lo, hi) - lo) / (hi - lo) * 34]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i];
    d += ` Q${px.toFixed(1)} ${py.toFixed(1)} ${((px + cx) / 2).toFixed(1)} ${((py + cy) / 2).toFixed(1)}`;
  }
  d += ` T${pts.at(-1)[0].toFixed(1)} ${pts.at(-1)[1].toFixed(1)}`;
  $('tpath').setAttribute('d', d);
}

// ECG sweep monitor
const cv = $('ecg'), ctx = cv.getContext('2d');
let W = 0, H = 0, SPEED = 62, phase = 0, sx = 0, lastY = null, lastT = performance.now();
function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  W = cv.clientWidth; H = cv.clientHeight; SPEED = Math.max(40, W * 0.5);
  cv.width = Math.max(1, W * dpr); cv.height = Math.max(1, H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  sx = 0; lastY = null;
}
sizeCanvas();
new ResizeObserver(sizeCanvas).observe(cv);
const gss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));
const ecgWave = p => 0.12 * gss(p, 0.16, 0.025) - 0.12 * gss(p, 0.275, 0.01) + 1.0 * gss(p, 0.30, 0.012) - 0.28 * gss(p, 0.325, 0.011) + 0.26 * gss(p, 0.52, 0.045);
function ecgLoop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  if (W > 0 && H > 0) {
    const steps = Math.max(1, Math.ceil(dt / 0.002));
    ctx.lineWidth = Math.max(1.6, H / 34); ctx.strokeStyle = '#e01b1b'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < steps; i++) {
      const h = dt / steps, prev = phase;
      phase += h * M.hr.v / 60;
      if (phase >= 1) phase -= 1;
      if (prev < 0.3 && phase >= 0.3) beat();
      sx += SPEED * h;
      if (sx > W) { sx = 0; lastY = null; }
      const y = H * 0.68 - ecgWave(phase) * H * 0.58 + (Math.random() - 0.5) * 0.6;
      ctx.clearRect(sx, 0, 10, H);
      if (lastY === null) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
      lastY = y;
    }
    ctx.stroke();
  }
  requestAnimationFrame(ecgLoop);
}
requestAnimationFrame(ecgLoop);
function beat() {
  if (currentView === 'vital') $('hrBox').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
}

/* =========================================================
   TENDENCIES — 24 h / 7 days / full mission
   ========================================================= */
const TM = {
  hr:   { label: 'Heart rate',       unit: 'BPM',   color: '#b71c1c', band: [60, 100],   dec: 0, src: () => M.hr.v,   thr: 1.5 },
  temp: { label: 'Body temperature', unit: '°C',    color: '#c2185b', band: [36.1, 37.5], dec: 1, src: () => M.temp.v, thr: 0.1 },
  spo2: { label: 'SpO2',             unit: '%',     color: '#e53935', band: [95, 100],   dec: 0, src: () => M.spo2.v, thr: 0.3 },
  sys:  { label: 'Systolic BP',      unit: 'mmHg',  color: '#6a1b9a', band: [90, 130],   dec: 0, src: () => M.sys.v,  thr: 2 },
  glu:  { label: 'Glucose',          unit: 'mg/dL', color: '#c25510', band: [70, 130],   dec: 0, src: () => M.glu.v,  thr: 3 }
};
const TKEYS = Object.keys(TM);

function physio(k, ts) {
  const d = new Date(ts), h = d.getHours() + d.getMinutes() / 60;
  const md = MISSION.day - (NOW0 - ts) / 864e5;
  const sleep = h >= 23 || h < 6.2;
  const ex = (h >= 10 && h < 11.5) ? Math.sin(Math.PI * (h - 10) / 1.5) : 0;
  const n = sn();
  switch (k) {
    case 'hr':   return 65 + md * 0.03 + 5 * Math.sin(2 * Math.PI * (h - 9) / 24) - (sleep ? 6 : 0) + ex * 42 + n * 2.5;
    case 'temp': return 36.72 + md * 0.0008 + 0.3 * Math.sin(2 * Math.PI * (h - 10.5) / 24) + ex * 0.45 + n * 0.06;
    case 'spo2': return Math.min(99.6, 97.7 - (sleep ? 0.8 : 0) - ex * 0.6 + n * 0.6);
    case 'sys':  return 119 - md * 0.02 + 5 * Math.sin(2 * Math.PI * (h - 8) / 24) - (sleep ? 8 : 0) + ex * 20 + n * 3;
    case 'glu': {
      let g = 88;
      for (const m of [7.5, 12.5, 18.5]) { const dt = h - m; if (dt > 0 && dt < 4) g += 36 * (dt / 0.8) * Math.exp(1 - dt / 0.8); }
      return g - ex * 8 + n * 3;
    }
  }
}

const TR = {};
(function genTrends() {
  const mk = () => ({ labels: [], ticks: [], ts: [], data: Object.fromEntries(TKEYS.map(k => [k, []])) });
  const a = TR['24h'] = mk();
  for (let i = 0; i < 96; i++) {
    const ts = NOW0 - (95 - i) * 9e5, d = new Date(ts);
    a.ts.push(ts); a.labels.push(`${DAYS[d.getDay()]} ${hhmm(d)}`);
    if (d.getMinutes() < 15 && d.getHours() % 4 === 0) a.ticks.push({ i, label: `${pad(d.getHours())}:00` });
    TKEYS.forEach(k => a.data[k].push(physio(k, ts)));
  }
  const b = TR['7d'] = mk();
  for (let i = 0; i < 168; i++) {
    const ts = NOW0 - (167 - i) * 36e5, d = new Date(ts);
    b.ts.push(ts); b.labels.push(`${DAYS[d.getDay()]} ${pad(d.getHours())}:00`);
    if (d.getHours() === 0) b.ticks.push({ i, label: DAYS[d.getDay()] });
    TKEYS.forEach(k => b.data[k].push(physio(k, ts)));
  }
  const c = TR['mission'] = mk();
  for (let md = 1; md <= MISSION.day; md++) {
    c.labels.push(`Mission day ${md}`);
    if (md === 1 || md % 20 === 0) c.ticks.push({ i: md - 1, label: `MD ${md}` });
    const dayStart = new Date(NOW0 - (MISSION.day - md) * 864e5); dayStart.setHours(0, 30, 0, 0);
    TKEYS.forEach(k => {
      let s = 0; for (let h = 0; h < 24; h += 2) s += physio(k, dayStart.getTime() + h * 36e5);
      let v = s / 12;
      if (md < 10) { if (k === 'hr') v += (10 - md) * 0.8; if (k === 'sys') v -= (10 - md) * 0.5; } // early space adaptation
      c.data[k].push(v);
    });
  }
})();

let trendMetric = 'hr', trendRange = '24h';
$('metricChips').innerHTML = TKEYS.map(k => `<button class="chip${k === trendMetric ? ' on' : ''}" data-k="${k}"><i style="background:${TM[k].color}"></i>${TM[k].label}</button>`).join('');
$('metricChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; trendMetric = b.dataset.k; renderTrends(); };
$('rangeSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; trendRange = b.dataset.r; renderTrends(); };
$('trendTable').onclick = e => { const tr = e.target.closest('tr[data-k]'); if (!tr) return; trendMetric = tr.dataset.k; renderTrends(); };

const RANGE_TXT = { '24h': 'Last 24 h · 15-min resolution', '7d': 'Last 7 days · hourly averages', mission: `Mission days 1–${MISSION.day} · daily averages` };
function renderTrends() {
  document.querySelectorAll('#metricChips .chip').forEach(c => c.classList.toggle('on', c.dataset.k === trendMetric));
  document.querySelectorAll('#rangeSeg button').forEach(b => b.classList.toggle('on', b.dataset.r === trendRange));
  const r = TR[trendRange], m = TM[trendMetric], data = r.data[trendMetric];
  $('trendTitle').textContent = m.label;
  $('trendIcon').style.background = m.color;
  $('trendSub').textContent = RANGE_TXT[trendRange];
  $('sumSub').textContent = RANGE_TXT[trendRange].split(' · ')[0] + ' · click a row to plot it';
  chart('trendChart', { series: [{ data, color: m.color, fill: true, label: m.label, unit: m.unit, dec: m.dec }], labels: r.labels, ticks: r.ticks, band: m.band, live: trendRange === '24h' });

  const inR = data.filter(v => v >= m.band[0] && v <= m.band[1]).length / data.length * 100;
  $('trendKpis').innerHTML =
    kpi('Now', fmt(m.src(), m.dec), m.unit, '<span class="live-dot" style="width:6px;height:6px"></span> live sensor') +
    kpi('Average', fmt(mean(data), m.dec), m.unit) +
    kpi('Minimum', fmt(Math.min(...data), m.dec), m.unit) +
    kpi('Maximum', fmt(Math.max(...data), m.dec), m.unit) +
    kpi('Time in range', fmt(inR, 0), '%', `normal ${m.band[0]}–${m.band[1]} ${m.unit}`);

  $('trendTable').innerHTML = '<tr><th>Metric</th><th>Avg</th><th>Min–Max</th><th>Trend</th></tr>' + TKEYS.map(k => {
    const d = r.data[k], t = TM[k], q = Math.max(1, Math.floor(d.length / 4));
    const delta = mean(d.slice(-q)) - mean(d.slice(0, q));
    const bad = k === 'spo2' ? delta < 0 : delta > 0;
    const tag = Math.abs(delta) < t.thr ? '<span class="tag info">■ stable</span>'
      : `<span class="tag ${bad ? 'warn' : 'ok'}">${delta > 0 ? '▲' : '▼'} ${fmt(Math.abs(delta), 1)}</span>`;
    return `<tr data-k="${k}" style="cursor:pointer;${k === trendMetric ? 'background:#f6f6fb' : ''}"><td><span class="dotc" style="background:${t.color}"></span>${t.label}</td><td class="num">${fmt(mean(d), t.dec)}</td><td class="num">${fmt(Math.min(...d), t.dec)}–${fmt(Math.max(...d), t.dec)}</td><td>${tag}</td></tr>`;
  }).join('');
}
(function trendInsight() {
  const hr = TR.mission.data.hr, sys = TR.mission.data.sys;
  const dHr = mean(hr.slice(-20)) - mean(hr.slice(10, 30)), dSys = mean(sys.slice(-20)) - mean(sys.slice(10, 30));
  $('trendInsight').innerHTML = `<b>Mission insight:</b> resting heart rate is <b>${dHr >= 0 ? '+' : ''}${fmt(dHr, 1)} BPM</b> and systolic pressure <b>${dSys >= 0 ? '+' : ''}${fmt(dSys, 1)} mmHg</b> vs. MD 10–30 — consistent with mild cardiovascular deconditioning in microgravity. Keep ≥ 4 CEVIS aerobic sessions per week.`;
})();

/* ---------------- Sleep & circadian ---------------- */
const nights = [];
for (let i = 13; i >= 0; i--) {
  const d = new Date(NOW0 - i * 864e5);
  const total = i === 0 ? 6.4 : clamp(7.0 + sn() * 0.5, 5.7, 8.2);
  const deep = total * (i === 0 ? 0.16 : sr(0.15, 0.2)), rem = total * (i === 0 ? 0.21 : sr(0.2, 0.25));
  const light = total - deep - rem, awake = i === 0 ? 0.45 : sr(0.2, 0.5);
  const aw = i === 0 ? 4 : Math.round(sr(1, 5));
  const eff = total / (total + awake + 0.25) * 100;
  const bed = i === 0 ? 22 * 60 + 58 : 22 * 60 + 42 + sn() * 15;
  const q = clamp(Math.round(total / 8 * 60 + (eff - 80) * 1.6 + (deep / total * 100 - 15) * 1.5 - aw * 2 + 12), 35, 97);
  nights.push({ label: DAYS[d.getDay()], total, deep, rem, light, awake, aw, eff, bed, q });
}
const last = nights.at(-1), last7 = nights.slice(-7);
const avg7 = mean(last7.map(n => n.total)), avgBed = mean(last7.map(n => n.bed));

const hypno = (function () {
  const n0 = Math.round((last.total + last.awake) * 12), ep = [0, 0, 0, 0];
  let c = 0;
  while (ep.length < n0) {
    const deepLen = Math.max(0, Math.round(7 - c * 2.2 + sn() * 0.8)), remLen = Math.max(1, Math.round(2 + c * 1.6 + sn() * 0.6));
    for (let k = 0; k < 3; k++) ep.push(2);
    for (let k = 0; k < deepLen; k++) ep.push(3);
    for (let k = 0; k < 2; k++) ep.push(2);
    for (let k = 0; k < remLen; k++) ep.push(1);
    if (R() < 0.45) ep.push(0);
    c++;
  }
  ep.length = n0; ep.push(0, 0);
  const labels = [], ticks = [];
  ep.forEach((_, i) => { const m = last.bed + i * 5; labels.push(minToHHMM(m)); if (Math.round(m) % 60 < 5) ticks.push({ i, label: minToHHMM(Math.floor(m / 60) * 60) }); });
  return { epochs: ep, labels, ticks };
})();

function circadian() {
  const a = TR['24h'], t = a.data.temp;
  const sm = t.map((v, i) => mean(t.slice(Math.max(0, i - 3), i + 4)));
  const hours = a.ts.map(ts => { const d = new Date(ts); return d.getHours() + d.getMinutes() / 60; });
  let i0 = hours.findIndex(h => h >= 23 || h < 6.2);
  let i1 = i0; while (i1 + 1 < hours.length && (hours[i1 + 1] >= 23 || hours[i1 + 1] < 6.2)) i1++;
  if (i0 < 0) { i0 = 0; i1 = 0; }
  let tmin = i0; for (let i = i0; i <= i1; i++) if (sm[i] < sm[tmin]) tmin = i;
  const dt = new Date(a.ts[tmin]), tminMin = dt.getHours() * 60 + dt.getMinutes();
  return { sm, i0, i1, tmin, tminMin, shift: tminMin - 240 };
}

function renderSleep() {
  $('sleepKpis').innerHTML =
    kpi('Last night', fmt(last.total, 1), 'h', `${fmt(last.total - 8, 1)} h vs 8 h target`, 'color:#1a237e') +
    kpi('Sleep quality', last.q, '/100', last.q >= 80 ? 'Good' : last.q >= 65 ? 'Fair' : 'Poor') +
    kpi('Efficiency', fmt(last.eff, 0), '%', 'time asleep / time in bed') +
    kpi('Awakenings', last.aw, '', `${fmt(last.awake * 60, 0)} min awake`) +
    kpi('Deep sleep', fmt(last.deep, 1), 'h', `${fmt(last.deep / last.total * 100, 0)}% of total`) +
    kpi('REM sleep', fmt(last.rem, 1), 'h', `${fmt(last.rem / last.total * 100, 0)}% of total`) +
    kpi('7-night average', fmt(avg7, 1), 'h', `avg bedtime ${minToHHMM(avgBed)}`);
  $('hypSub').textContent = `${minToHHMM(last.bed)} → ${minToHHMM(last.bed + (last.total + last.awake) * 60)} GMT · ${fmt(last.total, 1)} h asleep`;
  chart('hypnoChart', { type: 'hypno', ...hypno });
  chart('sleepBars', {
    type: 'bar', categories: last7.map(n => n.label), unit: 'h', dec: 1, padL: 32,
    stacks: [{ label: 'Deep', color: '#1a237e', data: last7.map(n => n.deep) }, { label: 'REM', color: '#8e5cd9', data: last7.map(n => n.rem) },
             { label: 'Light', color: '#6ab0f3', data: last7.map(n => n.light) }, { label: 'Awake', color: '#f5a300', data: last7.map(n => n.awake) }],
    target: { value: 8, label: '8 h target' }
  });
  renderCirc();

  const c = circadian();
  const bedT = Math.round((avgBed - (avg7 < 7 ? 35 : 0)) / 5) * 5, wakeT = bedT + 8 * 60;
  let txt = avg7 < 7.5
    ? `You averaged <b>${fmt(avg7, 1)} h</b> over the last 7 nights (target 8 h). Go to bed at <b>${minToHHMM(bedT)} GMT</b>${avg7 < 7 ? ' — 35 min earlier than usual —' : ''} and switch the crew-quarters lighting to <b>Pre-Sleep mode</b> (warm 2700 K, &lt;50 lux) one hour before.`
    : `Sleep duration is on target (<b>${fmt(avg7, 1)} h</b>). Keep your bedtime at <b>${minToHHMM(bedT)} GMT</b> and Pre-Sleep lighting one hour before.`;
  if (c.shift > 20) txt += ` Your circadian phase is <b>${c.shift} min delayed</b>: take 30 min of bright blue-enriched light (≥1,000 lux) right after waking.`;
  $('sleepReco').innerHTML = txt;
  $('sleepSteps').innerHTML = [
    [minToHHMM(bedT - 210), 'Finish the last exercise session (no ARED/T2 after this time).'],
    [minToHHMM(bedT - 60), 'Lighting → Pre-Sleep mode · stop screens & caffeine.'],
    [minToHHMM(bedT), 'Lights out · crew quarters CO2 below 3,000 ppm and noise < 50 dBA.'],
    [minToHHMM(wakeT), 'Wake up · 30 min bright light (Phase-Shift mode) + breakfast.']
  ].map(([t, s]) => `<li><span class="tm">${t}</span><span>${s}</span></li>`).join('');
}
function renderCirc() {
  const c = circadian(), a = TR['24h'];
  chart('circChart', {
    series: [{ data: c.sm, color: '#c2185b', fill: true, label: 'Core temp', unit: '°C', dec: 2, width: 2.5 }],
    labels: a.labels, ticks: a.ticks, shades: [{ i0: c.i0, i1: c.i1, color: 'rgba(26,35,126,.08)', label: '☾ Sleep' }],
    markers: [{ i: c.tmin, label: `Tmin ${minToHHMM(c.tminMin)}` }], live: true
  });
  $('circKpis').innerHTML =
    kpi('Core temp minimum', minToHHMM(c.tminMin), '', 'target 04:00') +
    kpi('Phase shift', `${c.shift >= 0 ? '+' : ''}${c.shift}`, 'min', c.shift > 20 ? 'delayed' : c.shift < -20 ? 'advanced' : 'aligned', c.shift > 20 ? 'color:#a86d00' : '') +
    kpi('Sleep midpoint', minToHHMM(last.bed + (last.total + last.awake) * 30), '', 'GMT') +
    kpi('Morning light', '18', 'min', '≥1,000 lux · target 30');
}

/* =========================================================
   ANATOMY — exercise, muscles & bones, balance
   ========================================================= */
const DEV = [
  { k: 'ARED', full: 'ARED resistance', color: '#6a1b9a', plan: [1, 1, 1, 1, 1, 1, 0], dur: 60 },
  { k: 'T2', full: 'T2 treadmill', color: '#c2185b', plan: [1, 0, 1, 0, 1, 1, 1], dur: 45 },
  { k: 'CEVIS', full: 'CEVIS cycle', color: '#1a3466', plan: [0, 1, 0, 1, 0, 1, 1], dur: 30 }
];
const todayIdx = (new Date(NOW0).getDay() + 6) % 7;   // Monday = 0
const WEEK = DEV.map(dv => dv.plan.map((p, i) => !p ? 'rest' : i < todayIdx ? (R() < 0.86 ? 'done' : 'missed') : 'planned'));
const session = { dev: -1, min: 0, dur: 0, done: false };
(function () {
  const plannedToday = DEV.map((d, i) => i).filter(i => DEV[i].plan[todayIdx]);
  if (plannedToday.length >= 2) WEEK[plannedToday[0]][todayIdx] = 'done';
  const s = plannedToday.at(-1);
  if (s != null) { WEEK[s][todayIdx] = 'prog'; session.dev = s; session.dur = DEV[s].dur; session.min = Math.round(DEV[s].dur * 0.35); }
})();
const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const curWeek = Math.ceil(MISSION.day / 7);
const loadWeeks = [];
for (let w = curWeek - 11; w <= curWeek; w++) loadWeeks.push(w === curWeek ? 0 : sr(27, 35.5));
const MISSION_ARED_T = 31.2 * (curWeek - 1);

function weekCompliance() {
  let done = 0, missed = 0;
  WEEK.forEach(row => row.forEach(s => { if (s === 'done') done++; if (s === 'missed') missed++; }));
  return done / Math.max(1, done + missed);
}
function renderWeek() {
  let h = '<div></div>' + WEEKDAY.map((d, i) => `<div class="h${i === todayIdx ? ' today' : ''}">${d}</div>`).join('');
  DEV.forEach((dv, r) => {
    h += `<div class="dev"><i style="background:${dv.color}"></i>${dv.k} <span style="color:#888;font-weight:400">${dv.dur}′</span></div>`;
    WEEK[r].forEach((s, i) => {
      const lab = { done: '✓', missed: '✕', planned: '', rest: '·', prog: `${Math.round(session.min / session.dur * 100)}%` }[s];
      const st = s === 'prog' ? `style="--p:${session.min / session.dur * 100}%"` : '';
      h += `<div class="c ${s}${i === todayIdx ? ' today' : ''}" ${st} title="${dv.full} · ${WEEKDAY[i]} · ${s}">${lab}</div>`;
    });
  });
  $('weekGrid').innerHTML = h;
}
function renderCompliance() {
  const wc = weekCompliance();
  $('compliance').innerHTML = ringSVG(wc, wc >= 0.85 ? '#1fb83a' : '#f5b400', 128, 'this week') +
    `<div style="flex:1;min-width:120px">${kpi('Mission to date', '91', '%', '412 of 453 sessions')}<div style="height:8px"></div>${kpi('Missed this week', WEEK.flat().filter(s => s === 'missed').length, 'sessions', 'make-up slot: Sat')}</div>`;
}
function renderSession() {
  const el = $('session');
  if (session.dev < 0) { el.innerHTML = '<div class="row"><b>No sessions planned today</b></div>'; return; }
  const dv = DEV[session.dev], p = session.min / session.dur;
  el.innerHTML = session.done
    ? `<div class="row"><b>Today's sessions completed ✓</b><span class="tag ok">Done</span></div><div class="row" style="color:#666"><span>${dv.full} · ${dv.dur} min</span><span>avg HR ${r0(M.hr.v + 22)} BPM</span></div>`
    : `<div class="row"><b>Live · ${dv.full}</b><span class="tag info"><span class="live-dot" style="width:6px;height:6px;vertical-align:1px"></span> in progress</span></div>
       <div class="bar"><i style="width:${(p * 100).toFixed(1)}%;background:${dv.color}"></i></div>
       <div class="row" style="margin:6px 0 0;color:#555"><span>${fmt(session.min, 0)} / ${session.dur} min</span><span>HR ${r0(M.hr.v + 38)} BPM · zone 2</span></div>`;
  renderWeek();
  if (session.done) renderCompliance();
}
function renderLoad() {
  const done = WEEK[0].filter(s => s === 'done').length;
  loadWeeks[loadWeeks.length - 1] = done * 5.4;
  chart('loadChart', {
    type: 'bar', categories: loadWeeks.map((_, i) => `W${curWeek - 11 + i}`), labels: loadWeeks.map((_, i) => `Mission week ${curWeek - 11 + i}${i === 11 ? ' (in progress)' : ''}`),
    stacks: [{ label: 'ARED volume', color: '#6a1b9a', data: loadWeeks }], unit: 't', dec: 1,
    colorFn: i => i === 11 ? '#c9a3e6' : '#6a1b9a', target: { value: 32, label: 'Target 32 t/week' }
  });
  $('loadKpis').innerHTML =
    kpi('ARED total', fmt(MISSION_ARED_T + loadWeeks[11], 0), 't', 'lifted this mission') +
    kpi('Treadmill', '486', 'km', 'harness load 72% BW') +
    kpi('Cycle ergometer', '1,214', 'km', 'avg 152 W') +
    kpi('Bone loading', '0.87', 'index', 'target ≥ 0.80');
}
const MSK = [
  { name: 'Hip bone density', v: -1.1, exp: -6.5, sev: 'ok' },
  { name: 'Lumbar spine density', v: -0.9, exp: -5.0, sev: 'ok' },
  { name: 'Quadriceps volume', v: -2.4, exp: -10, sev: 'ok' },
  { name: 'Calf (soleus) volume', v: -3.6, exp: -12, sev: 'warn', note: 'add 2 heel-raise sets' },
  { name: 'Grip strength', v: -1.2, exp: -4, sev: 'ok' }
];
function mix(c1, c2, t) {
  const a = c1.match(/\w\w/g).map(h => parseInt(h, 16)), b = c2.match(/\w\w/g).map(h => parseInt(h, 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function renderMsk() {
  const L = { arms: 0.42, chest: 0.55, core: 0.7, hips: 0.88, thighs: 0.97, calves: 0.78 };
  const c = k => mix('f3e5f5', '4a0e5c', L[k]);
  const t = k => `<title>${k} · weekly load ${Math.round(L[k] * 100)}%</title>`;
  $('bodyMap').innerHTML = `<svg viewBox="0 0 160 300" style="width:100%;max-height:300px">
    <circle cx="80" cy="26" r="17" fill="#e9e9f1"/><rect x="72" y="42" width="16" height="12" rx="4" fill="#e9e9f1"/>
    <path d="M48 56Q80 48 112 56L116 100Q80 108 44 100Z" fill="${c('chest')}">${t('chest')}</path>
    <path d="M50 104Q80 112 110 104L106 150Q80 158 54 150Z" fill="${c('core')}">${t('core')}</path>
    <path d="M54 154Q80 162 106 154L110 178Q80 186 50 178Z" fill="${c('hips')}">${t('hips')}</path>
    <path d="M44 58L34 62L26 120L38 122L46 80Z M116 58L126 62L134 120L122 122L114 80Z M26 124L38 126L34 170L22 168Z M134 124L122 126L126 170L138 168Z" fill="${c('arms')}">${t('arms')}</path>
    <path d="M52 182L78 186L74 240L56 240Z M108 182L82 186L86 240L104 240Z" fill="${c('thighs')}">${t('thighs')}</path>
    <path d="M57 244L74 244L72 288L61 288Z M103 244L86 244L88 288L99 288Z" fill="${c('calves')}">${t('calves')}</path>
    <circle cx="80" cy="166" r="5" fill="none" stroke="#1fb83a" stroke-width="2" stroke-dasharray="2 2"/><circle cx="80" cy="128" r="5" fill="none" stroke="#1fb83a" stroke-width="2" stroke-dasharray="2 2"/>
  </svg><div class="legend" style="justify-content:center;margin-top:2px"><span><i style="background:linear-gradient(90deg,#f3e5f5,#4a0e5c);width:40px"></i>muscle load</span><span><i style="border:2px dashed #1fb83a;background:none;border-radius:50%"></i>bone scan site</span></div>`;
  $('mskList').innerHTML = MSK.map(m => `<div class="msk-item"><div class="row"><span>${m.name}</span><span><b>${m.v.toFixed(1)}%</b> <span class="tag ${m.sev}">${m.sev === 'ok' ? 'On track' : 'Watch'}</span></span></div>
    <div class="bar"><i style="width:${Math.abs(m.v) / 8 * 100}%;background:${m.sev === 'ok' ? '#8e24aa' : '#f5a300'}"></i></div>
    <div class="exp">Expected without exercise: ${m.exp}%${m.note ? ' · ' + m.note : ''}</div></div>`).join('');
}

const VEST = [
  ['Sensory Organization Test (composite)', '76', '84', 'warn', 'Below baseline'],
  ['Romberg · eyes closed on foam', '24 s', '30 s', 'warn', 'Below baseline'],
  ['Tandem walk · eyes closed', '8/10 steps', '10/10', 'warn', 'Below baseline'],
  ['Video head impulse (VOR gain)', '0.95', '0.97', 'ok', 'Normal'],
  ['Subjective visual vertical', '1.4°', '0.8°', 'ok', 'Normal (< 2°)'],
  ['Dynamic visual acuity loss', '0.10 logMAR', '0.08', 'ok', 'Normal'],
  ['Motion sickness score (MSAQ)', '12', '9', 'ok', 'Mild']
];
function renderVest() {
  $('vestTable').innerHTML = '<tr><th>Test</th><th>Result</th><th>Pre-flight</th><th>Status</th></tr>' +
    VEST.map(r => `<tr><td>${r[0]}</td><td class="num"><b>${r[1]}</b></td><td class="num" style="color:#888">${r[2]}</td><td><span class="tag ${r[3]}">${r[4]}</span></td></tr>`).join('');
}

const dizzyWeeks = [12, 8, 6, 5, 4, 3, 3, 2, 3, 2, 2, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1];
const dizzyLog = [
  { md: 141, time: '06:42', sev: 3, dur: 2, trigger: 'Rapid head turn after waking', sym: 'Vertigo' },
  { md: 139, time: '14:15', sev: 2, dur: 1, trigger: 'After T2 treadmill session', sym: 'Light-headedness' },
  { md: 136, time: '07:05', sev: 4, dur: 5, trigger: 'Waking up', sym: 'Vertigo, nausea' },
  { md: 131, time: '19:30', sev: 2, dur: 2, trigger: 'Visual reorientation in Node 2', sym: 'Disorientation' },
  { md: 127, time: '11:02', sev: 3, dur: 3, trigger: 'Head movement during EVA prep', sym: 'Vertigo' }
];
const sevCol = s => s <= 3 ? '#f5b400' : s <= 5 ? '#f57c00' : '#e3141b';
function logDizziness(auto) {
  const e = {
    md: MISSION.day, time: hhmm(new Date()), sev: rint(2, 6), dur: rint(1, 4),
    trigger: pick(['Rapid head movement', 'After exercise session', 'Visual reorientation', 'Leaving sleep station', 'Looking out the window']),
    sym: pick(['Vertigo', 'Light-headedness', 'Disorientation', 'Vertigo, mild nausea']), isNew: true,
    src: auto ? 'auto-detected (IMU head sensor)' : 'reported by crew'
  };
  dizzyLog.unshift(e); dizzyWeeks[dizzyWeeks.length - 1]++;
  manual.set('dizzy', { sev: 'warn', msg: `Dizziness episode · severity ${e.sev}/10 (${e.trigger.toLowerCase()})`, card: 'c-dizzy', view: 'anatomy', ticks: 10 });
  renderDizzy();
  if (!auto) evaluateAlerts();
}
function renderDizzy() {
  chart('dizzyChart', {
    type: 'bar', categories: dizzyWeeks.map((_, i) => `W${i + 1}`), labels: dizzyWeeks.map((_, i) => `Mission week ${i + 1}`),
    stacks: [{ label: 'Episodes', color: '#90caf9', data: dizzyWeeks }], dec: 0, padL: 28, gap: 0.25,
    colorFn: i => i === dizzyWeeks.length - 1 ? '#f5a300' : '#90caf9'
  });
  $('dizzyLog').innerHTML = dizzyLog.slice(0, 8).map(e => `<li class="${e.isNew ? 'new' : ''}"><div class="sev" style="background:${sevCol(e.sev)}">${e.sev}</div>
    <div><b>${e.sym}</b> · ${e.dur} min<div class="sub">${e.trigger}${e.src ? ' · ' + e.src : ''}</div></div><div class="when">MD ${e.md}<br>${e.time}</div></li>`).join('');
  dizzyLog.forEach(e => { e.isNew = false; });
}
$('logDizzy').onclick = () => logDizziness(false);

/* =========================================================
   RADIATION + CABIN ENVIRONMENT
   ========================================================= */
const DOSE = { limit: 400, career: 600, prevCareer: 74, daily: [], cum: 0, today: 0 };
(function () {
  const spe = { 23: 2.1, 61: 4.6, 97: 1.4, 118: 3.2, 133: 4.1 };
  for (let md = 1; md < MISSION.day; md++) DOSE.daily.push(1.55 + sn() * 0.07 + (spe[md] || 0));
  DOSE.spe = spe;
  DOSE.cum = sum(DOSE.daily);
  const mid = new Date(NOW0); mid.setHours(0, 0, 0, 0);
  DOSE.today = (NOW0 - mid) / 36e5 * 64;
  DOSE.cum += DOSE.today / 1000;
})();

function renderRadiation() {
  const hoursLeftToday = 24 - (Date.now() - new Date().setHours(0, 0, 0, 0)) / 36e5;
  const avg30 = mean(DOSE.daily.slice(-30));
  const projected = DOSE.cum + (MISSION.length - MISSION.day) * avg30 + hoursLeftToday / 24 * avg30;
  $('doseGauge').innerHTML = gaugeSVG(DOSE.cum, DOSE.limit, projected);
  $('doseKpis').innerHTML =
    kpi('Limit used', fmt(DOSE.cum / DOSE.limit * 100, 1), '%') +
    kpi('Projected (MD 180)', fmt(projected, 0), 'mSv', `${fmt(projected / DOSE.limit * 100, 0)}% of limit`) +
    kpi('Career dose', fmt(DOSE.prevCareer + DOSE.cum, 0), 'mSv', `of ${DOSE.career} mSv NASA limit`) +
    kpi('30-day average', fmt(avg30, 2), 'mSv/day');

  // Storm panel
  const sc = sScale(storm.pfu), b = $('stormBanner');
  b.className = 'storm ' + storm.state;
  const icon = storm.state === 'calm'
    ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#14532d" stroke-width="2.6" stroke-linecap="round"><path d="M5 12l5 5L20 7"/></svg>'
    : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${storm.state === 'storm' ? '#fff' : '#6b4500'}" stroke-width="2.6" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>`;
  b.innerHTML = icon.replace('<svg', '<div class="si"><svg').replace('</svg>', '</svg></div>') + ({
    calm: `<div><b>No solar storm activity</b><span>NOAA ${sc} · nominal galactic cosmic-ray background</span></div>`,
    watch: `<div><b>Solar flare ${storm.flare} detected — WATCH</b><span>Proton event possible in ~${storm.eta} min · prepare storm shelter</span></div>`,
    storm: `<div><b>SOLAR STORM · ${sc} ${sName[sc].toUpperCase()} RADIATION STORM</b><span>Move to storm shelter now — dose rate ×${fmt(M.dose.v / 66, 0)}</span></div>`
  })[storm.state];
  $('swKpis').innerHTML =
    kpi('NOAA scale', sc, '', sName[sc]) +
    kpi('Kp index', fmt(storm.kp, 1), '', storm.kp >= 5 ? 'geomagnetic storm' : 'quiet') +
    kpi('Protons ≥10 MeV', fmt(storm.pfu, storm.pfu < 10 ? 1 : 0), 'pfu') +
    kpi('X-ray flux', xClass(storm.xlog), '', 'GOES class') +
    kpi('Solar wind', fmt(storm.wind, 0), 'km/s');
  $('stormActions').innerHTML = ({
    calm: ['Normal operations · no restrictions on EVA.', '3-day outlook: M-flare 35% · X-flare 10% · proton event 15%.'],
    watch: ['Postpone any EVA and robotic arm operations.', 'Pre-position water bags and food in the storm shelter.', 'Keep the personal dosimeter on at all times.'],
    storm: ['Go to the storm shelter (crew quarters + water wall, ~20 g/cm²).', 'Stay sheltered until the proton flux drops below 10 pfu.', 'Flight surgeon notified automatically.']
  })[storm.state].map(s => `<li>${s}</li>`).join('');

  // Live dose
  $('doseRate').innerHTML = `${fmt(M.dose.v, 0)}<small>µSv/h</small>`;
  $('doseRate').style.color = storm.state === 'storm' ? '#e3141b' : M.dose.v > 150 ? '#a86d00' : '#111';
  chart('doseSpark', { series: [{ data: doseHist, color: storm.state === 'storm' ? '#e3141b' : '#e08a00', fill: true, label: 'Dose rate', unit: 'µSv/h' }], labels: doseHist.map((_, i) => `${(doseHist.length - 1 - i) * 2} s ago`), noX: true, padL: 38, yMin: 0 });
  $('doseLive').innerHTML =
    kpi('Dose today', fmt(DOSE.today, 1), 'µSv') +
    kpi('Source', storm.state === 'storm' ? 'SPE' : 'GCR', '', storm.state === 'storm' ? 'solar protons' : 'cosmic rays') +
    kpi('Location', storm.state === 'storm' ? 'Shelter' : 'Hab module', '', storm.state === 'storm' ? '~20 g/cm²' : '~8 g/cm² shielding');

  // Daily dose (last 30 days incl. today)
  const days = DOSE.daily.slice(-29).concat([DOSE.today / 1000]);
  const firstMd = MISSION.day - 29;
  chart('doseDaily', {
    type: 'bar', categories: days.map((_, i) => `MD ${firstMd + i}`), labels: days.map((_, i) => `Mission day ${firstMd + i}${i === 29 ? ' (today, live)' : DOSE.spe[firstMd + i] ? ' · solar particle event' : ''}`),
    stacks: [{ label: 'Dose', color: '#f0a020', data: days }], unit: 'mSv', dec: 2, gap: 0.22,
    colorFn: i => i === 29 ? '#111' : DOSE.spe[firstMd + i] ? '#e3141b' : '#f0a020', target: { value: 1.8, label: 'Daily planning limit 1.8 mSv' }
  });
}

const ENV = [
  { k: 'o2', name: 'Oxygen (O₂)', unit: '%', dec: 2, scale: [17, 24], zones: [[17, 19.5, 'u'], [19.5, 20, 'w'], [20, 23.5, 'ok'], [23.5, 24, 'w']], nr: ['17%', 'nominal 19.5–23.5 %', '24%'], color: '#1a3466',
    impact: 'Low O₂ → hypoxia: dizziness, headache, slower reaction time and fatigue.' },
  { k: 'co2', name: 'Carbon dioxide (CO₂)', unit: 'ppm', dec: 0, scale: [1500, 7000], zones: [[1500, 4000, 'ok'], [4000, 5300, 'w'], [5300, 7000, 'u']], nr: ['1,500', 'limit 4,000 ppm', '7,000'], color: '#5d4037',
    impact: 'High CO₂ → headaches, poor concentration, irritability and worse sleep.' },
  { k: 'ctemp', name: 'Cabin temperature', unit: '°C', dec: 1, scale: [16, 30], zones: [[16, 18.3, 'w'], [18.3, 26.7, 'ok'], [26.7, 30, 'w']], nr: ['16 °C', 'nominal 18.3–26.7 °C', '30 °C'], color: '#c2185b',
    impact: 'Heat → sweating, dehydration and thermal discomfort; cold → poor sleep.' },
  { k: 'noise', name: 'Noise level', unit: 'dBA', dec: 0, scale: [40, 80], zones: [[40, 65, 'ok'], [65, 80, 'w']], nr: ['40', 'work limit 65 dBA', '80'], color: '#455a64',
    impact: 'Above 65 dBA → stress, hearing fatigue, communication errors and disrupted sleep.' },
  { k: 'hum', name: 'Relative humidity', unit: '%', dec: 0, scale: [15, 85], zones: [[15, 25, 'w'], [25, 75, 'ok'], [75, 85, 'w']], nr: ['15%', 'nominal 25–75 %', '85%'], color: '#0288d1',
    impact: 'Too dry → irritated eyes and airways; too humid → discomfort and condensation.' },
  { k: 'press', name: 'Cabin pressure', unit: 'kPa', dec: 1, scale: [96, 104], zones: [[96, 97.9, 'w'], [97.9, 102.7, 'ok'], [102.7, 104, 'w']], nr: ['96', 'nominal 97.9–102.7 kPa', '104'], color: '#6a1b9a',
    impact: 'Pressure changes → ear discomfort and lower O₂ partial pressure.' }
];
const ZCOL = { ok: '#bfeccb', w: '#ffe39a', u: '#f8b4b4' };
const ENVH = {};
ENV.forEach(e => { ENVH[e.k] = Array.from({ length: 40 }, () => M[e.k].base + (Math.random() - 0.5) * M[e.k].vol * 2); });
$('envGrid').innerHTML = ENV.map(e => {
  const span = e.scale[1] - e.scale[0];
  const grad = e.zones.map(([a, b, z]) => `${ZCOL[z]} ${((a - e.scale[0]) / span * 100).toFixed(1)}% ${((b - e.scale[0]) / span * 100).toFixed(1)}%`).join(',');
  return `<div class="etile alertable" id="e-${e.k}">
    <div class="top"><span class="name">${e.name}</span><span class="tag ok" id="et-${e.k}">Nominal</span></div>
    <div class="v" id="ev-${e.k}">--</div>
    <div class="range" style="background:linear-gradient(90deg,${grad})"><i id="em-${e.k}"></i></div>
    <div class="nr"><span>${e.nr[0]}</span><span>${e.nr[1]}</span><span>${e.nr[2]}</span></div>
    <div id="es-${e.k}"></div>
    <div class="imp">${e.impact}</div></div>`;
}).join('');
function renderEnv() {
  ENV.forEach(e => {
    const v = M[e.k].v;
    $('ev-' + e.k).innerHTML = `${fmt(v, e.dec)}<small>${e.unit}</small>`;
    $('em-' + e.k).style.left = clamp((v - e.scale[0]) / (e.scale[1] - e.scale[0]) * 100, 0, 100) + '%';
    const z = (e.zones.find(([a, b]) => v >= a && v < b) || [0, 0, 'ok'])[2];
    const tg = $('et-' + e.k);
    tg.className = 'tag ' + (z === 'ok' ? 'ok' : z === 'w' ? 'warn' : 'urgent');
    tg.textContent = z === 'ok' ? 'Nominal' : z === 'w' ? 'Caution' : 'Critical';
    $('es-' + e.k).innerHTML = sparkSVG(ENVH[e.k], e.color);
  });
}

/* =========================================================
   Simulation loop
   ========================================================= */
let currentView = 'vital';
function simulate() {
  tick++;
  maybeEvent();
  stepStorm();
  for (const k in M) stepMetric(k);
  for (const k in events) if (--events[k].ticks <= 0) delete events[k];
  for (const [k, a] of manual) if (a.ticks != null && --a.ticks <= 0) manual.delete(k);

  tempHist.push(+M.temp.v.toFixed(1)); if (tempHist.length > 40) tempHist.shift();
  spo2Hist.push(r0(M.spo2.v)); if (spo2Hist.length > 40) spo2Hist.shift();
  doseHist.push(M.dose.v); if (doseHist.length > 60) doseHist.shift();
  ENV.forEach(e => { ENVH[e.k].push(M[e.k].v); if (ENVH[e.k].length > 40) ENVH[e.k].shift(); });
  TKEYS.forEach(k => { const a = TR['24h'].data[k]; a[a.length - 1] = TM[k].src(); });

  const add = M.dose.v * TICK_MS / 36e5;   // µSv in this tick
  DOSE.today += add; DOSE.cum += add / 1000;

  if (session.dev >= 0 && !session.done) {
    session.min = Math.min(session.dur, session.min + 0.25);
    if (session.min >= session.dur) { session.done = true; WEEK[session.dev][todayIdx] = 'done'; }
  }

  evaluateAlerts();
  renderLive();
  $('lastUpd').textContent = hhmmss();
}
function renderLive() {
  renderVital();
  if (currentView === 'trends') { renderTrends(); renderCirc(); }
  if (currentView === 'anatomy') renderSession();
  if (currentView === 'radiation') { renderRadiation(); renderEnv(); }
}
function renderAll() {
  renderVital(); renderTrends(); renderSleep();
  renderWeek(); renderCompliance(); renderSession(); renderLoad(); renderMsk(); renderVest(); renderDizzy();
  renderRadiation(); renderEnv();
}

/* MET clock */
function renderMET() {
  const el = Date.now() - MET_START, d = Math.floor(el / 864e5);
  const h = Math.floor(el / 36e5) % 24, m = Math.floor(el / 6e4) % 60, s = Math.floor(el / 1e3) % 60;
  $('metClock').textContent = `${d}:${pad(h)}:${pad(m)}:${pad(s)}`;
  $('mdNum').textContent = d + 1;
}

/* =========================================================
   UI interactions
   ========================================================= */
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  currentView = t.dataset.view;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + currentView));
  $('main').scrollTop = 0;
  if (currentView === 'trends') { renderTrends(); renderSleep(); }
  if (currentView === 'anatomy') { renderWeek(); renderCompliance(); renderSession(); renderLoad(); renderDizzy(); }
  if (currentView === 'radiation') { renderRadiation(); renderEnv(); }
  t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
});
const toggleAlerts = () => { $('alertsPill').classList.toggle('open'); $('alertsPanel').classList.toggle('open'); };
$('alertsPill').onclick = toggleAlerts;
$('statusPill').onclick = () => { if (active.size && !$('alertsPanel').classList.contains('open')) toggleAlerts(); };
$('helpPill').onclick = () => {
  document.body.classList.add('chat-open');
  botSay('Need help? Ask me about vitals, sleep, exercise, balance, radiation, solar storms or the cabin environment.');
  setTimeout(() => $('chatText').focus(), 250);
};
$('chatFab').onclick = () => document.body.classList.toggle('chat-open');
$('chatClose').onclick = () => document.body.classList.remove('chat-open');

/* AI MED-BOT (canned demo answers using live values) */
const msgs = $('msgs');
function addMsg(text, who) {
  const m = document.createElement('div');
  m.className = `msg ${who}`; m.innerHTML = text;
  msgs.appendChild(m); msgs.scrollTop = msgs.scrollHeight; return m;
}
function botSay(text) {
  $('botIc').classList.add('typing');
  const d = addMsg('•••', 'from-bot dots');
  setTimeout(() => { d.remove(); addMsg(text, 'from-bot'); $('botIc').classList.remove('typing'); }, 700 + Math.random() * 600);
}
function reply(q) {
  q = q.toLowerCase();
  const has = (...w) => w.some(x => q.includes(x));
  if (has('storm', 'tormenta', 'solar', 'flare'))
    return storm.state === 'calm' ? 'No solar storm activity right now (NOAA S0). I will warn you as soon as a flare is detected.'
      : storm.state === 'watch' ? `Solar flare ${storm.flare} detected. A proton event may arrive in ~${storm.eta} min — prepare the storm shelter.`
      : `⚠ Solar radiation storm in progress (${sScale(storm.pfu)}). Go to the storm shelter now.`;
  if (has('radiation', 'radiación', 'radiacion', 'dose', 'dosis'))
    return `Accumulated dose: ${fmt(DOSE.cum, 1)} mSv of the ${DOSE.limit} mSv mission limit (${fmt(DOSE.cum / DOSE.limit * 100, 0)}%). Current rate ${fmt(M.dose.v, 0)} µSv/h.`;
  if (has('co2', 'cabin', 'cabina', 'noise', 'ruido', 'ambiente'))
    return `Cabin: O2 ${M.o2.v.toFixed(1)}%, CO2 ${fmt(M.co2.v)} ppm, ${M.ctemp.v.toFixed(1)} °C, noise ${r0(M.noise.v)} dBA. ${M.co2.v >= 4000 ? 'CO2 is high — it may cause headaches.' : 'All nominal.'}`;
  if (has('sleep', 'sueño', 'dormir', 'circadian', 'circadiano'))
    return `Last night you slept ${fmt(last.total, 1)} h (quality ${last.q}/100). 7-night average: ${fmt(avg7, 1)} h. Check the Tendencies tab for tonight's recommendation.`;
  if (has('exercise', 'ejercicio', 'muscle', 'músculo', 'musculo', 'bone', 'hueso'))
    return `Exercise compliance this week: ${Math.round(weekCompliance() * 100)}%. Hip bone density −1.1% vs pre-flight (on track). Calf volume needs attention: add 2 heel-raise sets.`;
  if (has('balance', 'equilibrio', 'dizz', 'mareo', 'vestibular'))
    return `${dizzyLog.length} dizziness episodes logged; latest MD ${dizzyLog[0].md} ${dizzyLog[0].time} (severity ${dizzyLog[0].sev}/10). 3 of 7 vestibular tests are below baseline.`;
  if (has('heart', 'bpm', 'pulse', 'corazon', 'corazón', 'pulso'))
    return `Current heart rate: ${r0(M.hr.v)} BPM. ${M.hr.v > 100 ? 'It is elevated — rest and breathe slowly.' : 'Within the normal range (60–100).'}`;
  if (has('temp', 'fever', 'fiebre'))
    return `Body temperature is ${M.temp.v.toFixed(1)} °C. ${M.temp.v >= 37.6 ? 'Slightly elevated.' : 'No fever.'}`;
  if (has('spo2', 'saturation', 'saturación', 'saturacion', 'oxygen', 'oxígeno', 'oxigeno'))
    return `SpO2 is ${r0(M.spo2.v)}%. ${M.spo2.v < 95 ? 'Slightly low, keep monitoring.' : 'Normal (95–100%).'}`;
  if (has('glucose', 'glucosa', 'sugar', 'azúcar', 'azucar'))
    return `Glucose: ${r0(M.glu.v)} mg/dL. ${M.glu.v > 130 ? 'Above range.' : M.glu.v < 70 ? 'Below range — eat something.' : 'Normal.'}`;
  if (has('pressure', 'presión', 'presion'))
    return `Blood pressure: ${r0(M.sys.v)}/${r0(M.dia.v)} mmHg. ${M.sys.v > 135 ? 'High — please rest.' : 'Normal.'}`;
  if (has('status', 'estado', 'alert', 'alerta', 'how am i', 'cómo estoy', 'como estoy'))
    return active.size ? `There ${active.size > 1 ? 'are' : 'is'} ${active.size} active alert(s): ${[...active.values()].map(a => a.entry.msg).join('; ')}.` : 'Everything is under control. All parameters are nominal.';
  if (has('hola', 'hello', 'hi', 'buenas')) return 'Hello! How can I help you today?';
  return 'I can tell you about vitals, sleep, exercise, balance, radiation, solar storms or the cabin environment. (DEMO assistant)';
}
$('chatForm').onsubmit = e => {
  e.preventDefault();
  const v = $('chatText').value.trim(); if (!v) return;
  addMsg(v.replace(/</g, '&lt;'), 'user'); $('chatText').value = '';
  botSay(reply(v));
};
$('micBtn').onclick = () => {
  const b = $('micBtn'); b.classList.add('on');
  setTimeout(() => { b.classList.remove('on'); $('chatText').value = 'How am I?'; }, 1800);
};

/* =========================================================
   Start
   ========================================================= */
renderAll();
renderStatus();
renderMET();
$('lastUpd').textContent = hhmmss();
setInterval(renderMET, 1000);
setInterval(simulate, TICK_MS);
setTimeout(() => botSay("Hello Commander! I'm AI MED-BOT. I'm monitoring your vital signs, radiation and cabin environment in real time."), 600);
