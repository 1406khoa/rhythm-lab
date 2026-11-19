/* Tap challenge: carry the beat through each silence (gap / random), then tap (pad or Space) on the FIRST beat after it —
 * the moment the click comes back. With no silence set, beat 1 of every bar. Judged on the audio clock:
 *   perfect  |offset| <= 3 ms   green text, confetti, green glow
 *   near     |offset| <= 25 ms  amber text, amber glow
 *   off      <= 100 ms          red text, screen shake, red glow
 *   rushing / dragging  > 100 ms early / late: same red feedback, named for the habit
 *   miss     no tap for that beat (window = half a beat, max 250 ms)
 * Tap time = the keyboard/pointer event timestamp mapped onto the audio clock as it is HEARD (getOutputTimestamp),
 * so output latency is already accounted for. */
(function () {
  const RT = (window.RT = window.RT || {});
  const { h } = RT.util;
  const PERFECT_MS = 3, NEAR_MS = 25, OFF_MS = 100, BEST_KEY = 'rt.challenge.best';

  const judge = (offsetMs) => { const a = Math.abs(offsetMs); return a <= PERFECT_MS ? 'perfect' : a <= NEAR_MS ? 'near' : a <= OFF_MS ? 'off' : offsetMs < 0 ? 'rushing' : 'dragging'; };

  let targets = [], streak = 0, best = RT.util.store.get(BEST_KEY, 0) || 0, missTimer = 0, els = {};
  const cfg = () => RT.state.cfg;
  const active = () => !!(cfg().challenge && cfg().challenge.on);
  const hasSilence = (c) => c.gap.on || (c.random.on && c.random.beatPct > 0);

  // the beat before `ev` (pure, from the event model) — to know whether `ev` is where a silence ends
  function prevBeat(c, ev) {
    if (ev.gIdx === 0) return null;
    const first = ev.beat === 0, bar = first ? ev.bar - 1 : ev.bar;
    return RT.events.beatEvents(c, { gIdx: ev.gIdx - 1, barIdx: bar, beat: first ? RT.events.barInfo(c, bar).num - 1 : ev.beat - 1 }, 0, 1)[0];
  }
  // judged beat: the first beat after a silence (the click is back); without silences, beat 1 of every bar
  function isTarget(c, ev) {
    if (hasSilence(c)) { const p = prevBeat(c, ev); return !RT.events.isBlind(ev) && !!p && RT.events.isBlind(p); }
    return ev.played && ev.beat === 0;
  }
  RT.engine.on('schedule', (ev, dur) => {
    if (!active() || RT.engine.cfg !== cfg() || ev.kind !== 'beat') return;
    if (isTarget(cfg(), ev)) targets.push({ t: ev.t, win: Math.min(0.25, dur / 2), done: false, g: ev.gIdx });
  });
  RT.engine.on('state', (running) => {
    targets = []; clearInterval(missTimer);
    if (running && active()) missTimer = setInterval(checkMisses, 40);
    if (!running) setLine(null);
  });

  function heardNow(eventTimeStamp) {
    const ctx = RT.engine.ctx;
    if (!ctx) return 0;
    if (ctx.getOutputTimestamp && eventTimeStamp != null) {
      const ts = ctx.getOutputTimestamp();
      if (ts.contextTime > 0) return ts.contextTime + (eventTimeStamp - ts.performanceTime) / 1000;
    }
    return ctx.currentTime - (ctx.outputLatency || 0);
  }

  function checkMisses() {
    const now = heardNow(performance.now());
    for (const tg of targets) if (!tg.done && now > tg.t + tg.win) { tg.done = true; result('miss', null); }
    targets = targets.filter((tg) => !tg.done || tg.t > now - 2);
  }

  // a tap at audio time `at` (seconds, heard clock)
  function tapAt(at) {
    let bestT = null;
    for (const tg of targets) if (!tg.done && Math.abs(at - tg.t) <= tg.win && (!bestT || Math.abs(at - tg.t) < Math.abs(at - bestT.t))) bestT = tg;
    if (!bestT) { flashPad(); return null; } // stray tap between judged beats: no verdict
    bestT.done = true;
    const off = (at - bestT.t) * 1000, verdict = judge(off);
    result(verdict, off);
    return { verdict, off };
  }
  const tap = (e) => tapAt(heardNow(e && e.timeStamp != null ? e.timeStamp : performance.now()));

  // ---------- feedback ----------
  const LABEL = { perfect: 'CHUẨN', near: 'GẦN', off: 'LỆCH', rushing: 'RUSHING', dragging: 'DRAGGING', miss: 'BỎ LỠ' };
  function result(verdict, off) {
    streak = verdict === 'perfect' || verdict === 'near' ? streak + 1 : 0;
    if (streak > best) { best = streak; RT.util.store.set(BEST_KEY, best); }
    const detail = off == null ? 'không gõ' : Math.abs(off) < 0.5 ? 'đúng phách' : Math.abs(off).toFixed(Math.abs(off) < 10 ? 1 : 0) + ' ms ' + (off < 0 ? 'sớm' : 'trễ');
    setLine(verdict, LABEL[verdict] + ' · ' + detail);
    RT.log.note('challenge', { verdict, offMs: off == null ? null : +off.toFixed(2), streak });
    glow(verdict === 'perfect' ? 'g' : verdict === 'near' ? 'y' : 'r');
    if (verdict === 'perfect') confetti();
    if (verdict !== 'perfect' && verdict !== 'near') shake(); // off, rushing, dragging, miss
    flashPad();
  }
  function setLine(verdict, text) {
    if (!els.line) return;
    els.line.className = 'ch-line' + (verdict ? ' ' + verdict : '');
    els.text.textContent = text || (RT.engine.running ? 'Tự đếm qua đoạn im, gõ đúng phách click quay lại' : 'Bấm Bắt đầu. Hết đoạn im, gõ đúng phách đầu tiên click quay lại');
    els.streak.textContent = streak > 1 ? '🔥 ' + streak : '';
    els.best.textContent = best ? 'Kỷ lục ' + best : '';
  }
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function glow(color) {
    els.glow.className = 'ch-glow ' + color; void els.glow.offsetWidth; els.glow.classList.add('on');
  }
  function shake() {
    if (reduced()) return;
    const root = document.querySelector('.wrap'); root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
  }
  function flashPad() { if (!els.pad) return; els.pad.classList.remove('hit'); void els.pad.offsetWidth; els.pad.classList.add('hit'); }

  // confetti: one short burst on a fixed canvas, then the canvas is released
  function confetti() {
    if (reduced()) return;
    const cv = els.confetti, g = cv.getContext('2d'), W = (cv.width = innerWidth), H = (cv.height = innerHeight);
    const r = els.pad.getBoundingClientRect(), ox = r.left + r.width / 2, oy = r.top;
    const css = getComputedStyle(document.documentElement), colors = ['--ok', '--warn', '--led', '--ink', '--quiet'].map((n) => css.getPropertyValue(n).trim()); // theme colours
    const parts = Array.from({ length: 70 }, () => ({ x: ox, y: oy, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 10 - 4, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.4,
      w: 5 + Math.random() * 5, h: 3 + Math.random() * 3, c: colors[(Math.random() * colors.length) | 0] }));
    const t0 = performance.now();
    cancelAnimationFrame(els.cfRaf);
    (function step(now) {
      const age = (now - t0) / 1000; g.clearRect(0, 0, W, H);
      if (age > 1.4) return;
      g.globalAlpha = Math.max(0, 1 - age / 1.4);
      for (const p of parts) { p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); }
      els.cfRaf = requestAnimationFrame(step);
    })(t0);
  }
  const TAU = Math.PI * 2;

  // ---------- UI: the tap section on the Metronome tab ----------
  function mount(parent) {
    els.text = h('span', {}); els.streak = h('span', { class: 'ch-streak' }); els.best = h('span', { class: 'ch-best' });
    els.line = h('div', { class: 'ch-line', 'aria-live': 'polite' }, els.text, els.streak, els.best);
    els.pad = h('button', { class: 'ch-pad', 'aria-label': 'Gõ phách (hoặc phím Space)' }, h('b', {}, 'GÕ'), h('span', {}, ' hoặc Space'));
    els.pad.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!RT.engine.running) RT.ui.toggleRun(); else tap(e); });
    els.box = h('div', { class: 'challenge', hidden: true }, els.line, h('div', { class: 'ch-row' }, els.pad));
    parent.append(els.box);
    els.glow = h('div', { class: 'ch-glow', 'aria-hidden': 'true' });
    els.confetti = h('canvas', { class: 'ch-confetti', 'aria-hidden': 'true' });
    document.body.append(els.glow, els.confetti);
    const sync = () => { els.box.hidden = !active(); setLine(null); };
    RT.bus.on('cfg', sync); sync();
  }

  RT.challenge = { mount, tap, tapAt, judge, active, heardNow, isTarget, PERFECT_MS, NEAR_MS, OFF_MS, _targets: () => targets, _reset: () => { streak = 0; } };
})();
