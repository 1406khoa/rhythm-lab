/* Beat visualisations on one canvas: polygon, clock, bouncing ball, pendulum, scrolling lane.
 * Motion is computed every frame from the AUDIO clock (the engine's scheduled beat times), so the picture
 * stays locked to the click. Drawing runs only while the canvas is on screen and a visual mode is chosen. */
(function () {
  const RT = (window.RT = window.RT || {});
  const MODES = [['pads', 'Ô phách'], ['polygon', 'Đa giác'], ['clock', 'Đồng hồ'], ['ball', 'Bóng nảy'], ['pendulum', 'Con lắc'], ['lane', 'Dòng nhịp']];
  const TAU = Math.PI * 2;

  // ---------- geometry (pure, tested) ----------
  // vertices of a beat polygon, first beat at the top, clockwise. 2 beats = a horizontal segment.
  function polygonPoints(num, cx, cy, R) {
    if (num === 2) return [[cx - R, cy], [cx + R, cy]];
    return Array.from({ length: num }, (_, i) => { const a = -Math.PI / 2 + (i * TAU) / num; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
  }
  // dot position at beat b + phase (0..1) on the polygon; circle above 8 beats (or 1)
  function polygonDot(num, b, phase, cx, cy, R) {
    if (num === 1 || num > 8) { const a = -Math.PI / 2 + ((b + phase) * TAU) / num; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; }
    const P = polygonPoints(num, cx, cy, R), p0 = P[b % num], p1 = P[(b + 1) % num];
    return [p0[0] + (p1[0] - p0[0]) * phase, p0[1] + (p1[1] - p0[1]) * phase];
  }
  const ballHeight = (phase) => 4 * phase * (1 - phase);              // 0 on every beat, 1 half way
  const pendulumAngle = (b, phase, A) => A * Math.cos(Math.PI * (b + phase)); // extremes exactly on the beats

  // ---------- timing from the engine ----------
  const beats = []; // recent scheduled beats { t, dur, gIdx, bar, beat, num, played }
  RT.engine.on('schedule', (ev, dur) => {
    if (ev.kind !== 'beat') return;
    beats.push({ t: ev.t, dur, gIdx: ev.gIdx, bar: ev.bar, beat: ev.beat, num: ev.num, played: ev.played });
    if (beats.length > 32) beats.shift();
  });
  // clear on STOP: the engine commits beat 1 before it announces 'running', so clearing on start would lose it
  RT.engine.on('state', (r) => { if (!r) beats.length = 0; });

  // where the music is right now
  function now() {
    const ctx = RT.engine.ctx;
    if (!RT.engine.running || !ctx || !beats.length) return null;
    const t = ctx.currentTime - (ctx.outputLatency || 0);
    let i = beats.length - 1;
    while (i > 0 && beats[i].t > t) i--;
    const cur = beats[i];
    if (cur.t > t) return null; // count-off: first beat not reached yet
    return { t, cur, prev: beats[i - 1] || null, phase: Math.min(1, (t - cur.t) / cur.dur) };
  }

  // ---------- colours from the CSS tokens ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
    C = { ink: v('--ink'), quiet: v('--quiet'), hair: v('--hair'), led: v('--led'), off: v('--led-off'), face: v('--face'), bg: v('--bg') };
  }
  readColors();
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); RT.viz.redraw(); });

  // ---------- drawing ----------
  function dotAt(g, x, y, r, fill, stroke) {
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = Math.max(1.5, r * 0.25); g.stroke(); }
  }
  const flash = (S, i) => (S.running && S.b === i && S.played ? 1 + 0.7 * Math.pow(1 - S.phase, 3) : 1);

  function drawVertices(g, S, P, r, groupStarts) {
    P.forEach(([x, y], i) => {
      const lv = S.levels[i] == null ? 1 : S.levels[i], k = flash(S, i);
      if (lv === 0) dotAt(g, x, y, r * 0.8, null, C.hair);
      else dotAt(g, x, y, (lv === 2 ? r * 1.25 : r) * k, lv === 2 ? (S.poly ? C.ink : C.led) : C.ink);
      if (groupStarts && groupStarts.includes(i) && i !== 0) dotAt(g, x, y, r * 1.7, null, C.quiet);
    });
  }
  function label(g, txt, x, y, size, color, align) {
    g.fillStyle = color; g.font = `600 ${size}px Barlow, system-ui, sans-serif`; g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y);
  }

  function drawPolygon(g, W, H, S) {
    const cx = W / 2, cy = H / 2 + (S.num === 2 ? 0 : H * 0.03), R = Math.min(W, H) * 0.41, r = Math.max(5, R * 0.07);
    const P = S.num === 1 || S.num > 8 ? [] : polygonPoints(S.num, cx, cy, R); // ring for 1 or >8 beats
    g.lineWidth = 2; g.strokeStyle = C.hair;
    g.beginPath();
    if (P.length) { P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (S.num > 2) g.closePath(); }
    else g.arc(cx, cy, R, 0, TAU);
    g.stroke();
    const V = P.length ? P : Array.from({ length: S.num }, (_, i) => polygonDot(S.num, i, 0, cx, cy, R));
    // subdivision ticks along each edge (swing-aware)
    if (S.n > 1) for (let i = 0; i < S.num; i++) for (let k = 1; k < S.n; k++) {
      const [x, y] = polygonDot(S.num, i, RT.events.subPos(k, S.n, S.ratio), cx, cy, R);
      dotAt(g, x, y, r * 0.32, S.subMask[k] === false ? null : C.quiet, S.subMask[k] === false ? C.hair : null);
    }
    // labels outside the vertices
    V.forEach(([x, y], i) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; label(g, String(i + 1), x + (dx / d) * r * 2.6, y + (dy / d) * r * 2.6 + (S.num === 2 ? -r * 2.6 : 0), Math.max(11, r * 1.3), C.quiet); });
    drawVertices(g, S, V, r, S.groupStarts);
    if (S.poly) { // second layer: inner polygon in LED red
      const R2 = R * 0.52, P2 = polygonPoints(Math.max(S.poly.m, 2), cx, cy, R2);
      g.strokeStyle = C.led; g.globalAlpha = 0.35; g.beginPath(); P2.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (S.poly.m > 2) g.closePath(); g.stroke(); g.globalAlpha = 1;
      if (S.poly.n > 1) for (let j = 0; j < S.poly.m; j++) for (let k = 1; k < S.poly.n; k++) { const [x, y] = polygonDot(S.poly.m, j, k / S.poly.n, cx, cy, R2); dotAt(g, x, y, r * 0.28, C.led); }
      P2.forEach(([x, y], j) => dotAt(g, x, y, r * (j === 0 ? 0.95 : 0.75) * (S.running && S.poly.j === j ? 1 + 0.7 * Math.pow(1 - S.poly.phase, 3) : 1), C.led));
      if (S.running) { const [x, y] = polygonDot(S.poly.m, S.poly.j, S.poly.phase, cx, cy, R2); dotAt(g, x, y, r * 0.6, C.face, C.led); }
    }
    if (S.running) { const [x, y] = polygonDot(S.num, S.b, S.phase, cx, cy, R); dotAt(g, x, y, r * 0.75, C.face, C.ink); }
  }

  function drawClock(g, W, H, S) {
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
    g.lineWidth = 2; g.strokeStyle = C.hair; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
    const at = (pos, r0, r1, w, col) => { const a = -Math.PI / 2 + (pos * TAU) / S.num; g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)); g.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); g.stroke(); };
    for (let i = 0; i < S.num; i++) {
      for (let k = 1; k < S.n; k++) if (S.subMask[k] !== false) at(i + RT.events.subPos(k, S.n, S.ratio), R * 0.9, R, 2, C.quiet);
      const lv = S.levels[i] == null ? 1 : S.levels[i], k = flash(S, i);
      at(i, R * (lv === 2 ? 0.72 : 0.8) / Math.min(k, 1.25), R, lv === 2 ? 7 : lv === 0 ? 2 : 4, lv === 0 ? C.hair : lv === 2 && !S.poly ? C.led : C.ink);
      const a = -Math.PI / 2 + (i * TAU) / S.num; label(g, String(i + 1), cx + R * 0.6 * Math.cos(a), cy + R * 0.6 * Math.sin(a), Math.max(12, R * 0.09), C.quiet);
    }
    if (S.poly && S.poly.n > 1) for (let j = 0; j < S.poly.m; j++) for (let k = 1; k < S.poly.n; k++) {
      const a = -Math.PI / 2 + (((j + k / S.poly.n) * S.num) / S.poly.m * TAU) / S.num; dotAt(g, cx + R * 0.42 * Math.cos(a), cy + R * 0.42 * Math.sin(a), R * 0.018, C.led);
    }
    if (S.poly) for (let j = 0; j < S.poly.m; j++) { // inner ring of red ticks for the second layer
      const pos = (j * S.num) / S.poly.m, a = -Math.PI / 2 + (pos * TAU) / S.num, k = S.running && S.poly.j === j ? 1 + 0.6 * Math.pow(1 - S.poly.phase, 3) : 1;
      dotAt(g, cx + R * 0.42 * Math.cos(a), cy + R * 0.42 * Math.sin(a), R * 0.05 * k * (j === 0 ? 1.2 : 1), C.led);
    }
    const a = -Math.PI / 2 + (((S.running ? S.b + S.phase : 0)) * TAU) / S.num;
    g.strokeStyle = C.ink; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * 0.95 * Math.cos(a), cy + R * 0.95 * Math.sin(a)); g.stroke();
    dotAt(g, cx, cy, 6, C.ink);
  }

  // one bouncing track: count landing spots on a ground line, ball travels spot to spot, lands on each pulse
  function ballTrack(g, W, ground, height, count, b, phase, running, color, levelOf, flashOf) {
    const pad = W * 0.08, span = W - pad * 2, col = (i) => pad + (count === 1 ? span / 2 : (i * span) / (count - 1));
    const r = Math.max(7, Math.min(W / (count * 5), height * 0.1));
    g.strokeStyle = C.hair; g.lineWidth = 2; g.beginPath(); g.moveTo(pad * 0.5, ground); g.lineTo(W - pad * 0.5, ground); g.stroke();
    for (let i = 0; i < count; i++) {
      const lv = levelOf(i), w = r * 1.6 * flashOf(i);
      g.fillStyle = lv === 0 ? C.hair : lv === 2 ? color.accent : color.normal;
      g.fillRect(col(i) - w / 2, ground + 5, w, lv === 2 ? 7 : 4);
      label(g, String(i + 1), col(i), ground + 22, Math.max(11, r), C.quiet);
    }
    const bb = running ? b : 0, ph = running ? phase : 0, nxt = (bb + 1) % count;
    const x = col(bb) + (col(nxt) - col(bb)) * ph, y = ground - r - (height - r * 2) * ballHeight(ph);
    dotAt(g, x, ground - 1, r * (0.5 + 0.5 * (1 - ballHeight(ph))), C.off);
    dotAt(g, x, y, r, color.ball);
  }

  function drawBall(g, W, H, S) {
    const lv = (i) => (S.levels[i] == null ? 1 : S.levels[i]);
    if (!S.poly) {
      ballTrack(g, W, H * 0.82, H * 0.7, S.num, S.b, S.phase, S.running, { accent: C.led, normal: C.ink, ball: C.ink }, lv, (i) => flash(S, i));
      return;
    }
    // two tracks: main layer on top (ink), second layer below (red)
    const P = S.poly, flashP = (j) => (S.running && P.j === j ? 1 + 0.7 * Math.pow(1 - P.phase, 3) : 1);
    label(g, 'Lớp chính · ' + S.num, W * 0.04, H * 0.05, 13, C.quiet, 'left');
    ballTrack(g, W, H * 0.38, H * 0.3, S.num, S.b, S.phase, S.running, { accent: C.ink, normal: C.ink, ball: C.ink }, lv, (i) => flash(S, i));
    label(g, 'Lớp phụ · ' + P.m, W * 0.04, H * 0.6, 13, C.led, 'left');
    ballTrack(g, W, H * 0.88, H * 0.26, P.m, P.j, P.phase, S.running, { accent: C.led, normal: C.led, ball: C.led }, (j) => (j === 0 ? 2 : 1), flashP);
  }

  // one pendulum: pivot at the bottom, the arm reaches an end of its swing on every pulse
  function pendulum(g, px, py, L, A, count, b, phase, running, color, lit) {
    const ang = running ? pendulumAngle(b, phase, A) : -A;
    g.strokeStyle = C.hair; g.lineWidth = 2; g.beginPath(); g.arc(px, py, L, -Math.PI / 2 - A, -Math.PI / 2 + A); g.stroke();
    for (const side of [-1, 1]) {
      const a = -Math.PI / 2 + side * A, onThis = running && Math.sign(pendulumAngle(b, 0, A)) === side;
      dotAt(g, px + L * Math.cos(a), py + L * Math.sin(a), Math.max(5, L * 0.03) * (onThis ? lit : 1), onThis ? color.hit : C.off);
    }
    const tipX = px + L * Math.sin(ang), tipY = py - L * Math.cos(ang);
    g.strokeStyle = color.arm; g.lineWidth = Math.max(3, L * 0.018); g.lineCap = 'round'; g.beginPath(); g.moveTo(px, py); g.lineTo(tipX, tipY); g.stroke();
    const wx = px + L * 0.62 * Math.sin(ang), wy = py - L * 0.62 * Math.cos(ang), ww = Math.max(18, L * 0.12);
    g.fillStyle = color.arm; g.fillRect(wx - ww / 2, wy - ww / 3, ww, (ww * 2) / 3);
    dotAt(g, px, py, Math.max(5, L * 0.03), color.arm);
  }

  function drawPendulum(g, W, H, S) {
    const A = 0.5, lv = S.running ? (S.levels[S.b] == null ? 1 : S.levels[S.b]) : 1;
    if (!S.poly) {
      const L = H * 0.78;
      pendulum(g, W / 2, H * 0.9, L, A, S.num, S.b, S.phase, S.running, { arm: C.ink, hit: lv === 2 ? C.led : C.ink }, flash(S, S.b));
      if (S.running) label(g, String(S.b + 1), W * 0.1, H * 0.12, Math.max(18, H * 0.1), lv === 2 ? C.led : C.quiet);
      return;
    }
    // two pendulums side by side: main layer (ink) left, second layer (red) right
    const P = S.poly, litP = S.running ? 1 + 0.7 * Math.pow(1 - P.phase, 3) : 1;
    const tMain = 'Chính ' + (S.running ? S.b + 1 : '–') + '/' + S.num, tPoly = 'Phụ ' + (S.running ? P.j + 1 : '–') + '/' + P.m;
    if (W >= H * 1.4) { // wide: side by side
      const L = Math.min(H * 0.72, W * 0.26), py = H * 0.88;
      pendulum(g, W * 0.3, py, L, A, S.num, S.b, S.phase, S.running, { arm: C.ink, hit: C.ink }, flash(S, S.b));
      pendulum(g, W * 0.7, py, L, A, P.m, P.j, P.phase, S.running, { arm: C.led, hit: C.led }, litP);
      label(g, tMain, W * 0.3, H * 0.97, 13, C.quiet); label(g, tPoly, W * 0.7, H * 0.97, 13, C.led);
    } else { // narrow (phone): stacked, each gets half the height
      const L = Math.min(H * 0.38, W * 0.7);
      pendulum(g, W / 2, H * 0.46, L, A, S.num, S.b, S.phase, S.running, { arm: C.ink, hit: C.ink }, flash(S, S.b));
      pendulum(g, W / 2, H * 0.95, L, A, P.m, P.j, P.phase, S.running, { arm: C.led, hit: C.led }, litP);
      label(g, tMain, W * 0.04, H * 0.06, 13, C.quiet, 'left'); label(g, tPoly, W * 0.04, H * 0.55, 13, C.led, 'left');
    }
  }

  // scrolling lane: everything that is coming (including silent gap/random beats, hollow) slides to a hit line.
  // With polyrhythm on, two lanes: main layer on top, second layer (red) below.
  function drawLane(g, W, H, S, T) {
    const hit = W * 0.16, cfg = S.cfg, two = !!S.poly;
    const midA = two ? H * 0.32 : H * 0.5, midB = H * 0.74, k = two ? 0.62 : 1;
    const dur = 60 / RT.events.effBpm(cfg), span = Math.max(1.6, Math.min(4, dur * S.num * 1.5)), pps = (W - hit) / span;
    g.strokeStyle = C.hair; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, midA); g.lineTo(W, midA); if (two) { g.moveTo(0, midB); g.lineTo(W, midB); } g.stroke();
    if (two) { label(g, 'Chính', 8, midA - H * 0.2, 12, C.quiet, 'left'); label(g, 'Phụ', 8, midB - H * 0.13, 12, C.led, 'left'); }
    let pos, t0, tNow;
    if (T) { const ref = T.prev || T.cur; pos = { gIdx: ref.gIdx, barIdx: ref.bar, beat: ref.beat }; t0 = ref.t; tNow = T.t; }
    else { pos = { gIdx: 0, barIdx: 0, beat: 0 }; t0 = 0; tNow = -0.25 * dur; }
    for (let guard = 0; guard < 64; guard++) {
      const x0 = hit + (t0 - tNow) * pps;
      if (x0 > W + 10) break;
      if (pos.beat === 0) { g.strokeStyle = C.hair; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, H * 0.08); g.lineTo(x0, H * 0.92); g.stroke(); label(g, String(pos.barIdx + 1), x0 + 10, H * 0.08, 12, C.quiet); }
      for (const ev of RT.events.beatEvents(cfg, pos, t0, dur)) {
        const x = hit + (ev.t - tNow) * pps;
        if (x < -20 || x > W + 20) continue;
        const beat = ev.kind === 'beat', poly = ev.kind === 'poly', psub = ev.kind === 'polysub', layer2 = poly || psub;
        const h = (beat ? (ev.level === 2 ? H * 0.5 : H * 0.36) : poly ? (two ? (ev.level === 2 ? H * 0.5 : H * 0.36) : H * 0.22) : H * 0.16) * k;
        const y = layer2 ? (two ? midB : midA + H * 0.2) : midA, w = beat || poly ? 10 : 6;
        const col = layer2 ? C.led : beat && ev.level === 2 && !two ? C.led : beat ? C.ink : C.quiet;
        g.globalAlpha = x < hit ? 0.35 : 1;
        if (ev.played) { g.fillStyle = col; g.fillRect(x - w / 2, y - h / 2, w, h); }
        else { g.strokeStyle = C.hair; g.lineWidth = 2; g.strokeRect(x - w / 2, y - h / 2, w, h); }
        g.globalAlpha = 1;
      }
      t0 += dur;
      if (++pos.beat >= RT.events.barInfo(cfg, pos.barIdx).num) { pos.beat = 0; pos.barIdx++; }
      pos.gIdx++;
    }
    g.strokeStyle = C.led; g.lineWidth = 3; g.beginPath(); g.moveTo(hit, H * 0.06); g.lineTo(hit, H * 0.94); g.stroke();
  }

  const DRAW = { polygon: drawPolygon, clock: drawClock, ball: drawBall, pendulum: drawPendulum, lane: drawLane };

  // snapshot of what to draw
  function stateFor(cfg, T) {
    const cur = T && T.cur, num = cur ? cur.num : RT.events.barInfo(cfg, 0).num;
    const levels = cfg.form.on ? RT.events.barInfo(cfg, cur ? cur.bar : 0).levels : cfg.levels;
    const S = { cfg, running: !!T, b: cur ? cur.beat : 0, phase: T ? T.phase : 0, played: cur ? cur.played : true, num, levels, n: RT.events.subCount(cfg),
      ratio: cfg.swing.amount / 100, subMask: cfg.subMask, groupStarts: cfg.voice ? RT.syllables.groupStarts(cfg.vocal.grouping, num) : null, poly: null };
    if (cfg.poly && cfg.poly.on) {
      const m = RT.util.clamp(cfg.poly.m | 0, 2, 16), p = ((S.b + S.phase) / num) * m, j = Math.min(m - 1, Math.floor(p + 1e-9));
      S.poly = { m, j, phase: p - j, n: RT.util.clamp(cfg.poly.n | 0 || 1, 1, 8) };
    }
    return S;
  }

  // ---------- canvas host ----------
  let canvas = null, g = null, raf = 0, dpr = 1;
  function attach(el) {
    canvas = el; g = canvas.getContext('2d');
    new ResizeObserver(() => { size(); RT.viz.redraw(); }).observe(canvas);
    RT.engine.on('state', () => loop());
    document.addEventListener('visibilitychange', loop);
    size();
  }
  function size() {
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  }
  function render(mode, cfg, T, target) {
    const c = target || canvas, gg = target ? target.getContext('2d') : g;
    if (!c || !DRAW[mode]) return;
    const W = c.width / (target ? 1 : dpr), H = c.height / (target ? 1 : dpr);
    gg.setTransform(target ? 1 : dpr, 0, 0, target ? 1 : dpr, 0, 0);
    gg.clearRect(0, 0, W, H);
    DRAW[mode](gg, W, H, stateFor(cfg, T), T);
  }
  function frame() {
    raf = 0;
    if (!visible()) return;
    render(RT.state.cfg.viz, RT.state.cfg, RT.engine.cfg === RT.state.cfg ? now() : null);
    if (RT.engine.running) raf = requestAnimationFrame(frame);
  }
  const visible = () => canvas && RT.state.cfg.viz !== 'pads' && RT.state.tab === 'pulse' && document.visibilityState === 'visible' && canvas.clientWidth > 0;
  function loop() { if (!raf) raf = requestAnimationFrame(frame); }

  RT.viz = { MODES, attach, redraw: loop, render, position: now, polygonPoints, polygonDot, ballHeight, pendulumAngle, stateFor };
})();
