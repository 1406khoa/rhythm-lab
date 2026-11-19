/* Pure event model: config + position -> events. No audio, no DOM, no clock.
 * Every event is returned, including the ones that will not sound, with `reason` saying why:
 *   test | gap | beatMuted | followBeatMute | subMuted | randomBeat | randomSub | null (= sounds)
 *
 * Rulings (see README): BPM is the rate of the beat circles (one circle = one BPM tick), the
 * denominator is a label only; swing delays the 2nd of each subdivision pair; vocal counts 1..12
 * and "and" (duplet) - everything else falls back to a click. */
(function () {
  const RT = (window.RT = window.RT || {});

  const SUBDIVS = { none: 1, duplet: 2, triplet: 3, quadruplet: 4, sextuplet: 6 };
  const SWING_PRESETS = { straight: 50, septuplet: 57.1, quintuplet: 60, triplet: 66.7, dotted: 75 };
  
  const defaultLevels = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 2 : 1)); // 2 accent, 1 normal, 0 mute

  function defaults() {
    return {
      bpm: 60, num: 4, den: 4,
      levels: defaultLevels(4),
      subdiv: { id: 'none', n: 1 },
      subMask: [],               // index k -> false = that subdivision slot is muted
      followBeatMute: false,
      swing: { amount: 50 },
      click: 'electronic',       // see RT.voices.CLICKS - always plays
      voice: false,              // count the beats out loud on top of the click
      vocal: { grouping: '', accent: true }, // grouping for odd meters (see js/core/syllables.js); accent = stress each group's first beat
      gap: { on: false, unit: 'measures', play: 2, silence: 2 },
      random: { on: false, beatPct: 30, subPct: 0 },
      poly: { on: false, m: 3, n: 1, listen: 'both' }, // polyrhythm: m even pulses per bar against the beats, each split in n; listen both | main | poly
      viz: 'pads',               // face display: pads | polygon | clock | ball | pendulum | lane
      seed: 1,
      challenge: { on: false },  // tap challenge (js/challenge.js), not used by buildEvents
      test: null,                // { countIn: 8, silent: true } -> Test tab profile
    };
  }

  const subCount = (cfg) => (cfg.subdiv.id === 'custom' ? RT.util.clamp(cfg.subdiv.n | 0, 2, 16) : SUBDIVS[cfg.subdiv.id] || 1);
  const effBpm = (cfg) => cfg.bpm;

  function barInfo(cfg, barIdx) {
    return { num: cfg.num, den: cfg.den, levels: cfg.levels };
  }

  // fraction of a beat at which subdivision k of n starts
  function subPos(k, n, ratio) {
    if (n < 2 || ratio === 0.5 || k % 2 === 0) return k / n;
    return (k - 1) / n + (2 / n) * ratio; // odd k: pair start + pairLen * ratio
  }

  const voiceFor = (cfg, num, kind, beat) => (cfg.voice && kind === 'beat' ? RT.syllables.voice(cfg, num, beat) : null);

  // pos: { gIdx, barIdx, beat }   t0/dur in seconds
  function beatEvents(cfg, pos, t0, dur) {
    const { num, den, levels } = barInfo(cfg, pos.barIdx);
    const n = subCount(cfg);
    const ratio = cfg.swing.amount / 100;
    const beatLevel = levels[pos.beat] == null ? 1 : levels[pos.beat];
    const out = [];
    for (let k = 0; k < n; k++) {
      const kind = k === 0 ? 'beat' : 'sub';
      const level = k === 0 ? beatLevel : 1;
      const ev = { t: t0 + subPos(k, n, ratio) * dur, gIdx: pos.gIdx, bar: pos.barIdx, beat: pos.beat, sub: k, n, num, den,
        kind, level, voice: voiceFor(cfg, num, kind, pos.beat), click: cfg.click, played: true, reason: null, tone: 'norm' };
      ev.reason = reasonFor(cfg, ev, beatLevel);
      ev.played = ev.reason === null;
      if (cfg.test && pos.gIdx < cfg.test.countIn) ev.tone = 'hi';
      out.push(ev);
    }
    // polyrhythm layer: pulse j of m sits at j*num/m beats into the bar; emit the ones inside this beat
    if (cfg.poly && cfg.poly.on && !cfg.test) {
      const m = RT.util.clamp(cfg.poly.m | 0, 2, 16), pn = RT.util.clamp(cfg.poly.n | 0 || 1, 1, 8), len = num / m;
      for (let j = 0; j < m; j++) for (let k = 0; k < pn; k++) { // pulse j split into pn equal parts (k = 0 is the pulse itself)
        const x = j * len + (k * len) / pn;
        if (x < pos.beat - 1e-9 || x >= pos.beat + 1 - 1e-9) continue;
        const ev = { t: t0 + (x - pos.beat) * dur, gIdx: pos.gIdx, bar: pos.barIdx, beat: pos.beat, sub: 100 + j * 16 + k, n, num, den,
          kind: k === 0 ? 'poly' : 'polysub', pulse: j, psub: k, m, level: k === 0 && j === 0 ? 2 : 1, voice: null, click: cfg.click, played: true, reason: null, tone: 'norm' };
        ev.reason = reasonFor(cfg, ev, beatLevel);
        ev.played = ev.reason === null;
        out.push(ev);
      }
      out.sort((a, b) => a.t - b.t); // the engine commits in order: keep events time-sorted
    }
    return out;
  }

  function reasonFor(cfg, ev, beatLevel) {
    if (cfg.test) return ev.gIdx < cfg.test.countIn || !cfg.test.silent ? (beatLevel === 0 ? 'beatMuted' : null) : 'test';
    const g = cfg.gap;
    if (g.on) {
      const idx = g.unit === 'beats' ? ev.gIdx : ev.bar;
      if (idx % (g.play + g.silence) >= g.play) return 'gap';
    }
    const listen = cfg.poly && cfg.poly.on ? cfg.poly.listen : 'both';
    if (ev.kind === 'poly' || ev.kind === 'polysub') return listen === 'main' ? 'polyMuted' : null;
    if (listen === 'poly') return 'mainMuted';
    if (ev.kind === 'beat' && ev.level === 0) return 'beatMuted';
    if (ev.kind === 'sub') {
      if (cfg.followBeatMute && beatLevel === 0) return 'followBeatMute';
      if (cfg.subMask[ev.sub] === false) return 'subMuted';
    }
    const r = cfg.random;
    if (r.on) {
      const pct = ev.kind === 'beat' ? r.beatPct : r.subPct;
      if (pct > 0 && RT.util.rand01(cfg.seed, ev.gIdx, ev.sub, 0) * 100 < pct) return ev.kind === 'beat' ? 'randomBeat' : 'randomSub';
    }
    return null;
  }

  // Constant-tempo expansion for tests / offline render: nBeats beats from t0.
  function build(cfg, nBeats, t0 = 0) {
    const dur = 60 / effBpm(cfg), out = [];
    let barIdx = 0, beat = 0;
    for (let g = 0; g < nBeats; g++) {
      out.push(...beatEvents(cfg, { gIdx: g, barIdx, beat }, t0 + g * dur, dur));
      if (++beat >= barInfo(cfg, barIdx).num) { beat = 0; barIdx++; }
    }
    return out;
  }

  // silences that are an exercise: the display must not give the timing away while they last
  const BLIND = new Set(['gap', 'randomBeat', 'test']);
  const isBlind = (ev) => !ev.played && BLIND.has(ev.reason);

  RT.events = { isBlind, SUBDIVS, SWING_PRESETS, defaults, defaultLevels, subCount, effBpm, barInfo, subPos, beatEvents, build };
})();
