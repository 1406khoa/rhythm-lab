/* Object beat displays: hammer and nails, paddle ball. Line art in the theme colours (light fill, dark outline, red accent).
 * Each draw(g, W, H, S) is a pure function of the audio-clock state S from js/viz.js stateFor().
 * Motion is closed-form between two known hit times, never simulated, so nothing drifts off the click.
 * Kept apart from viz.js because these two are drawings, the others are diagrams. */
(function () {
  const RT = (window.RT = window.RT || {}), { clamp } = RT.util, TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  let C = {};
  const readColors = () => { const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
    C = { ink: v('--ink'), quiet: v('--quiet'), hair: v('--hair'), led: v('--led'), off: v('--led-off'), face: v('--face'), bg: v('--bg'), ok: v('--ok'), warn: v('--warn') }; };
  readColors();
  // line art: a light fill with a dark outline on both themes, the theme red as the only accent.
  // fill = the lightest theme tone mixed 20% into the stage colour (a notch under the accent beat bar), outline = the darkest tone
  const mix = (a, b, t) => { const p = (x) => { x = x.replace('#', ''); if (x.length === 3) x = [...x].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); }, A = p(a), B = p(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const lum = (x) => { x = x.replace('#', ''); if (x.length === 3) x = [...x].map((c) => c + c).join(''); return [0, 2, 4].reduce((s, i, j) => s + parseInt(x.slice(i, i + 2), 16) * [0.299, 0.587, 0.114][j], 0); };
  function palette() { const by = [C.ink, C.face, C.bg].sort((a, b) => lum(a) - lum(b)); return { fill: mix(by[2], C.face, 0.2), line: by[0] }; }
  let PAL = palette();
  function ink(g, fill, lw) { g.fillStyle = fill; g.fill(); g.strokeStyle = PAL.line; g.lineWidth = lw; g.lineJoin = g.lineCap = 'round'; g.stroke(); } // fill the current path, then outline it
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); PAL = palette(); });

  // ---------- shared helpers ----------
  const starts = (n, ratio) => Array.from({ length: n + 1 }, (_, k) => (k === n ? 1 : RT.events.subPos(k, n, ratio))); // slot edges inside a beat
  const slot = (st, ph) => { let k = st.length - 2; while (k > 0 && st[k] > ph) k--; return [k, clamp((ph - st[k]) / (st[k + 1] - st[k]), 0, 1)]; };
  function line(g, pts, color, lw, dash) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = color; g.lineWidth = lw; g.lineCap = g.lineJoin = 'round'; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]); }
  // main layer + (when polyrhythm is on) the second layer in red, one above the other
  function lanes(g, W, H, S, draw) {
    const lv = (i) => (S.levels[i] == null ? 1 : S.levels[i]);
    const main = { idx: S.g, phase: S.phase, st: starts(S.n, S.ratio), level: lv(S.b), next: lv((S.b + 1) % S.num), played: S.played, color: C.ink, accent: C.led, main: true,
      lvAt: (d) => lv((((S.b + d) % S.num) + S.num) % S.num), subOn: (k) => S.subMask[k] !== false };
    if (!S.poly) return draw(0, 0, W, H, main);
    const P = S.poly;
    draw(0, 0, W, H * 0.5, main);
    line(g, [[W * 0.04, H * 0.5], [W * 0.96, H * 0.5]], C.hair, 1, [4, 6]);
    draw(0, H * 0.5, W, H * 0.5, { idx: S.bar * P.m + P.j, phase: P.phase, st: starts(P.n, 0.5), level: P.j === 0 ? 2 : 1, next: (P.j + 1) % P.m === 0 ? 2 : 1, played: true, color: C.led, accent: C.led,
      lvAt: (d) => ((((P.j + d) % P.m) + P.m) % P.m === 0 ? 2 : 1), subOn: () => true });
  }

  // ---------- 1. hammer and nails: one blow per click. Three nails wait on the right; the board feeds left after every blow ----------
  // Materials keep their own colours (wood, steel) so they read as objects on the light and the dark theme alike.
  const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function rr(g, x, y, w, hgt, r) { g.beginPath(); g.roundRect(x, y, w, hgt, r); }
  function drawNail(g, x, top, base, u, kind, sunk) { // kind: 2 accent, 1 normal, 0.5 soft, 't' tack
    const w = u * (kind === 2 ? 0.04 : kind === 't' ? 0.022 : 0.032), hw = w * (kind === 't' ? 2.6 : 2.8), hh = u * (kind === 2 ? 0.034 : kind === 't' ? 0.022 : 0.028), lw = Math.max(2, u * 0.008);
    if (!sunk && base - top > hh) { g.beginPath(); g.rect(x - w / 2, top + hh, w, base - top - hh); ink(g, PAL.fill, lw); }
    rr(g, x - hw / 2, top, hw, hh, hh * 0.4); ink(g, kind === 2 ? C.led : PAL.fill, lw);
  }
  function drawHammer(g, px, py, L, ang, red) { // pivot = the end of the grip; ang 0 = handle level, face down on the nail
    g.save(); g.translate(px, py); g.scale(-1, 1); g.rotate(ang); // mirrored: the hand is on the left, over the nails already driven
    const t = L * 0.09, Lf = L * 0.9, F = L * 0.25, lw = Math.max(2.5, L * 0.028);
    g.beginPath(); g.moveTo(L * 0.1, -t * 0.62); g.quadraticCurveTo(-L * 0.4, -t * 0.4, -Lf - L * 0.06, -t * 0.42); g.lineTo(-Lf - L * 0.06, t * 0.42); g.quadraticCurveTo(-L * 0.4, t * 0.4, L * 0.1, t * 0.62); g.quadraticCurveTo(L * 0.15, 0, L * 0.1, -t * 0.62);
    ink(g, red ? C.led : PAL.fill, lw);
    line(g, [[-L * 0.24, -t * 0.5], [-L * 0.24, t * 0.5]], PAL.line, lw); // where the grip ends
    rr(g, -Lf - L * 0.11, -L * 0.2, L * 0.22, L * 0.2 + F, L * 0.045); ink(g, PAL.fill, lw); // head: a rounded block across the handle, striking face at the bottom
    g.restore();
  }
  function hammer(g, W, H, S) {
    lanes(g, W, H, S, (x0, y0, w, hh, o) => {
      const u = Math.min(hh, w * 0.62), n = o.st.length - 1, run = S.running, hitX = x0 + w * 0.36, D = (w * 0.64) / 3.5, top0 = y0 + hh * 0.5 + u * 0.24, thick = u * 0.2;
      const [k, q] = slot(o.st, run ? o.phase : 0), slotSec = (o.st[k + 1] - o.st[k]) * S.dur, tHit = q * slotSec;
      // what was just struck (start of this slot) and what the hammer is going for next
      const kindAt = (kk, beatOff) => (kk % n === 0 ? (o.lvAt(beatOff) || null) : o.subOn(kk % n) ? 't' : null);
      const hit = k === 0 ? (o.played && run ? kindAt(0, 0) : null) : kindAt(k, 0), target = k + 1 === n ? kindAt(0, 1) : kindAt(k + 1, 0);
      const rb = Math.min(0.3, 0.13 / slotSec), dn = Math.min(0.4, 0.15 / slotSec); // rebound and downswing take real time, not a share of the beat
      const slide = run ? easeIO(clamp((q - rb * 0.5) / Math.max(0.05, 1 - dn - 0.04 - rb * 0.5), 0, 1)) : 0, pos = o.st[k] + (o.st[k + 1] - o.st[k]) * slide; // board position, in beats
      const A = (kind) => ((kind === 't' ? 24 : kind === 2 ? 66 : kind === 0.5 ? 40 : 54) * Math.PI) / 180, rest = (30 * Math.PI) / 180, up = target ? A(target) : rest;
      const from = hit ? 0 : run ? rest * 0.7 : up;
      const ang = !run ? A(1) : q < rb ? lerp(from, up, 1 - Math.pow(1 - q / rb, 2)) : q < 1 - dn ? up + Math.sin((q - rb) * 9) * 0.02 : lerp(up, target ? 0 : rest * 0.7, Math.pow((q - (1 - dn)) / dn, 2.4));
      const power = hit === 2 ? 1.5 : hit === 't' ? 0.5 : hit === 0.5 ? 0.7 : 1, shake = hit ? Math.exp(-tHit * 20) * Math.cos(tHit * 80) * u * 0.014 * power : 0, top = top0 + shake;
      g.save(); g.beginPath(); g.rect(x0, y0, w, hh); g.clip();
      g.beginPath(); g.rect(x0 - 10, top, w + 20, thick); ink(g, PAL.fill, Math.max(2.5, u * 0.01)); // the board, endless: its ends are off screen
      // nails and tacks stuck in the board: driven ones on the left, three waiting on the right, the next one entering
      const face = (a) => py - L * 0.9 * Math.sin(a) + L * 0.25 * Math.cos(a), L = Math.min(u * 0.62, (hitX - x0) * 0.94), py = top0 - L * 0.25, px = hitX - L * 0.9, faceY = face(ang) + shake;
      for (let j = -3; j <= 5; j++) for (let s2 = 0; s2 < n; s2++) {
        const p = j + o.st[s2], kind = kindAt(s2, j), x = hitX + (p - pos) * D; if (!kind || x < x0 - D || x > x0 + w + D) continue;
        const past = j < 0 || (j === 0 && s2 <= k), struck = past && !(j === 0 && s2 === 0 && !o.played && run) && (run || j < 0);
        const nh = u * (kind === 2 ? 0.25 : kind === 't' ? 0.1 : kind === 0.5 ? 0.15 : 0.19);
        const isTarget = !past && (k + 1 === n ? j === 1 && s2 === 0 : j === 0 && s2 === k + 1);
        const topY = struck ? top - u * 0.012 : Math.min(top - u * 0.012, Math.max(top - nh, isTarget && run ? faceY : -1e9)); // the hammer face pushes it in over the last instant
        drawNail(g, x, topY, top, u, kind, struck);
      }
      g.restore();
      if (hit && tHit < 0.4) { // the blow: a flash, then sparks on ballistic paths
        const hy = top0 - u * 0.012;
        if (tHit < 0.06) { g.fillStyle = C.led; g.globalAlpha = 1 - tHit / 0.06; g.beginPath(); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = u * (i % 2 ? 0.035 : 0.11) * power; g.lineTo(hitX + Math.cos(a) * r, hy + Math.sin(a) * r * 0.6); } g.fill(); g.globalAlpha = 1; }
        const count = hit === 2 ? 11 : hit === 't' ? 4 : 7;
        for (let i = 0; i < count; i++) {
          const r1 = RT.util.rand01(o.idx * 8 + k, i, 1, o.main ? 1 : 2), r2 = RT.util.rand01(o.idx * 8 + k, i, 2, 5), a = -Math.PI * (0.12 + 0.76 * (i + r1) / count), v = u * (1.1 + 1.5 * r2) * power;
          const sx = hitX + Math.cos(a) * v * tHit, sy = hy + Math.sin(a) * v * tHit + 0.5 * u * 6 * tHit * tHit, vx = Math.cos(a) * v, vy = Math.sin(a) * v + u * 6 * tHit;
          g.globalAlpha = Math.max(0, 1 - tHit / 0.4); line(g, [[sx, sy], [sx - vx * 0.025, sy - vy * 0.025]], C.led, Math.max(2, u * 0.008));
        }
        g.globalAlpha = 1;
      }
      g.globalAlpha = 1; drawHammer(g, px, py + shake * 0.5, L, ang, !o.main);
    });
  }

  // ---------- 2. paddle ball: a table-tennis bat seen from above-front, a ball with a face on an elastic cord ----------
  // The ball rides a spring (sin): fast off the rubber, hanging at the top, back on the bat exactly on the click.
  function drawBat(g, cx, cy, rx, tilt, rubber) {
    const ry = rx * 0.36, th = rx * 0.08, lw = Math.max(2.5, rx * 0.03);
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    g.save(); g.translate(rx * 0.5, ry * 0.72); g.rotate(0.62); // handle, toward the viewer
    const hl = rx * 0.95, hw = rx * 0.2;
    g.beginPath(); g.moveTo(-rx * 0.1, -hw * 0.62); g.quadraticCurveTo(hl * 0.5, -hw * 0.5, hl, -hw); g.quadraticCurveTo(hl + hw * 0.5, 0, hl, hw); g.quadraticCurveTo(hl * 0.5, hw * 0.5, -rx * 0.1, hw * 0.62); g.closePath();
    ink(g, PAL.fill, lw);
    g.restore();
    g.beginPath(); g.ellipse(0, th, rx, ry, 0, 0, TAU); ink(g, PAL.fill, lw); // the blade's edge
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); ink(g, rubber, lw);    // the face
    g.beginPath(); g.ellipse(0, 0, rx * 0.86, ry * 0.8, 0, 0, TAU); g.strokeStyle = PAL.line; g.lineWidth = lw * 0.5; g.stroke(); // rim of the rubber
    g.beginPath(); g.arc(0, 0, rx * 0.035, 0, TAU); ink(g, PAL.fill, lw * 0.6); // eyelet for the cord
    g.restore();
  }
  function drawBall(g, x, y, r, sx, sy, rot, mood) { // mood: 'hit' | 'up' (eyes wide) | 'fly' | 'sleep'
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(sx, sy);
    g.beginPath(); g.arc(0, 0, r, 0, TAU); ink(g, PAL.fill, Math.max(2.5, r * 0.1));
    g.fillStyle = C.led; g.globalAlpha = 0.35; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * r * 0.55, r * 0.22, r * 0.16, r * 0.1, 0, 0, TAU); g.fill(); } g.globalAlpha = 1; // cheeks
    g.strokeStyle = g.fillStyle = PAL.line; g.lineWidth = r * 0.1; g.lineCap = g.lineJoin = 'round';
    for (const s of [-1, 1]) {
      const ex = s * r * 0.33, ey = -r * 0.05;
      if (mood === 'hit') { g.beginPath(); g.moveTo(ex - s * r * 0.13, ey - r * 0.13); g.lineTo(ex + s * r * 0.1, ey); g.lineTo(ex - s * r * 0.13, ey + r * 0.13); g.stroke(); } // > <
      else if (mood === 'sleep') { g.beginPath(); g.arc(ex, ey - r * 0.04, r * 0.12, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
      else { const big = mood === 'up' ? 1.25 : 1; g.beginPath(); g.ellipse(ex, ey, r * 0.1 * big, r * 0.15 * big, 0, 0, TAU); g.fill(); }
    }
    g.beginPath(); // mouth
    if (mood === 'hit') g.ellipse(0, r * 0.36, r * 0.13, r * 0.07, 0, 0, TAU); else if (mood === 'up') g.ellipse(0, r * 0.36, r * 0.11, r * 0.15, 0, 0, TAU); else if (mood === 'sleep') { g.moveTo(-r * 0.08, r * 0.38); g.lineTo(r * 0.08, r * 0.38); } else g.arc(0, r * 0.26, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
    mood === 'up' || mood === 'hit' ? g.fill() : g.stroke();
    g.restore();
  }
  function paddle(g, W, H, S) {
    const lv = (i) => (S.levels[i] == null ? 1 : S.levels[i]);
    const one = (cx, o) => {
      const rx = Math.min(o.span * 0.26, H * 0.26), ry = rx * 0.36, py = H * 0.66, r = rx * 0.24, n = o.st.length - 1, run = S.running;
      const [k, q] = slot(o.st, run ? o.phase : 0), slotSec = (o.st[k + 1] - o.st[k]) * S.dur, tHit = q * slotSec, tTo = (1 - q) * slotSec;
      // The bounce comes from the player: the bat flicks UP into the ball at every contact (harder flick = higher ball),
      // then drops back while the ball is in the air. No flick (a muted beat) = the ball just lies on the rubber.
      const powerOf = (kk, beatLevel, played) => (!played ? 0 : kk % n !== 0 ? (o.subOn(kk % n) ? 0.45 : 0) : beatLevel === 2 ? 1.3 : beatLevel === 0.5 ? 0.6 : beatLevel === 0 ? 0 : 1);
      const P0 = run ? powerOf(k, o.level, k > 0 || o.played) : 0, P1 = run ? (k + 1 < n ? powerOf(k + 1, o.level, true) : powerOf(0, o.nextLevel, true)) : 0;
      const power = Math.max(P0, 0.3), rest = run && P0 === 0, hitNow = run && P0 > 0;
      const LIFT = rx * 0.34, TAUF = Math.min(0.07, slotSec * 0.22); // flick height, flick time (s)
      const e0 = Math.exp(-Math.pow(tHit / TAUF, 2)), e1 = Math.exp(-Math.pow(tTo / TAUF, 2));
      const batUp = LIFT * (P0 * e0 + P1 * e1), base = -LIFT * lerp(P0, P1, q); // the ball leaves from / lands on the raised bat
      const amp = rest ? 0 : (k > 0 ? 0.34 : o.level === 2 ? 1 : o.level === 0.5 ? 0.5 : 0.76) * (py - r * 3.4 - H * 0.08); // the top of a strong beat stays inside the frame
      const ext = run && !rest ? Math.sin(Math.PI * q) : 0, side = ((o.idx * n + k) % 2 ? 1 : -1);
      const imp = run ? Math.max(P0 > 0 ? Math.max(0, 1 - tHit / 0.05) : 0, P1 > 0 ? Math.max(0, 1 - tTo / 0.05) : 0) : 0, speed = run && !rest ? Math.abs(Math.cos(Math.PI * q)) * (1 - imp) : 0;
      const sy = 1 - 0.32 * imp + 0.16 * speed * power, sx = 1 + 0.3 * imp - 0.1 * speed * power; // squash on the rubber, stretch in flight
      const tilt = 0.1 * (P1 * e1 - P0 * e0 * 0.6) * side; // wrist: cocks back on the way up, follows through after the hit
      const kick = -batUp, bx = cx + side * amp * 0.12 * ext;
      const by = py + (rest ? kick : base) - r * sy - amp * ext; // resting: lies on the bat wherever it is
      if (run && P1 * e1 > 0.15) for (let i = 0; i < 3; i++) { // the flick: speed lines under the bat while it rises
        const yy = py + kick + ry * (1.1 + i * 0.45), ww = rx * (0.75 - i * 0.18);
        g.globalAlpha = Math.min(1, P1 * e1) * (0.5 - i * 0.13); g.strokeStyle = PAL.line; g.lineWidth = Math.max(2, rx * 0.022); g.beginPath(); g.ellipse(cx, yy, ww, ry * 0.35, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      }
      g.globalAlpha = 1;
      drawBat(g, cx, py + kick, rx, tilt, o.rubber);
      if (hitNow && tHit < 0.35) { // "pok": a ripple across the rubber and a burst of little stars
        const a = tHit / 0.35; g.globalAlpha = 1 - a; g.strokeStyle = PAL.line; g.lineWidth = Math.max(2, rx * 0.025) * (1 - a);
        g.beginPath(); g.ellipse(cx, py + kick, rx * (0.25 + 0.6 * a), ry * (0.25 + 0.6 * a), 0, 0, TAU); g.stroke();
        const count = k > 0 ? 4 : o.level === 2 ? 9 : 6;
        for (let i = 0; i < count; i++) {
          const an = -Math.PI * (0.08 + 0.84 * (i + RT.util.rand01(o.idx * 8 + k, i, 3, o.rubber === C.led ? 2 : 1)) / count), d = rx * (0.45 + 0.9 * Math.sqrt(a)) * power, x = cx + Math.cos(an) * d, y = py - ry * 0.3 + Math.sin(an) * d * 0.75 + rx * 0.5 * a * a, sz = rx * 0.07 * (1 - a * 0.6) * (i % 2 ? 1 : 0.7);
          g.fillStyle = C.led; g.beginPath(); for (let p = 0; p < 8; p++) { const pa = (p / 8) * TAU + a * 2 + i, pr = p % 2 ? sz * 0.4 : sz; g.lineTo(x + Math.cos(pa) * pr, y + Math.sin(pa) * pr); } g.fill();
        }
        g.globalAlpha = 1;
      }
      // elastic cord: wavy while slack, a straight thin line when the ball is far out
      const slack = 1 - ext, pts = Array.from({ length: 19 }, (_, i) => { const t = i / 18, w = Math.sin(t * Math.PI); return [lerp(cx, bx, t) + w * Math.sin(t * Math.PI * 2.5 + side) * slack * rx * 0.3 * side, lerp(py + kick, by + r * sy * 0.9, t) - w * slack * r * 0.7]; });
      line(g, pts, PAL.line, Math.max(1.5, rx * 0.016));
      const mood = rest ? 'sleep' : imp > 0.25 ? 'hit' : ext > 0.82 && k === 0 ? 'up' : 'fly';
      drawBall(g, bx, by, r, sx, sy, side * 0.12 * ext + tilt, mood);
    };
    const main = { idx: S.g, phase: S.phase, st: starts(S.n, S.ratio), level: lv(S.b), nextLevel: lv((S.b + 1) % S.num), subOn: (k) => S.subMask[k] !== false, played: S.played, rubber: PAL.fill, span: W * (S.poly ? 0.5 : 1) };
    if (!S.poly) return one(W * 0.48, main);
    const P = S.poly; one(W * 0.25, main);
    one(W * 0.73, { idx: S.bar * P.m + P.j, phase: P.phase, st: starts(P.n, 0.5), level: P.j === 0 ? 2 : 1, nextLevel: (P.j + 1) % P.m === 0 ? 2 : 1, subOn: () => true, played: true, rubber: C.led, span: W * 0.5 }); // second layer: the red side of the bat, like every other display
  }

  RT.vizObjects = { hammer, paddle };
})();
