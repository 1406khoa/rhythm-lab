/* App state: one cfg object shared by the metronome and its practice panel (the engine reads it live),
 * persisted to localStorage. */
(function () {
  const RT = (window.RT = window.RT || {});
  const { clamp, store } = RT.util;
  const KEY = 'rt.cfg.v1';

  const cfg = RT.events.defaults();
  const saved = store.get(KEY, {});
  const sane = saved && Array.isArray(saved.levels) && saved.levels.length === saved.num && saved.subdiv && saved.swing && saved.gap && saved.random;
  if (sane) { // older saves had one 'sound' field: electronic | clave | vocal
    if (saved.sound) { saved.click = saved.sound === 'vocal' ? 'electronic' : saved.sound; saved.voice = saved.sound === 'vocal'; delete saved.sound; }
    delete saved.form; // the song-form editor was removed
    Object.assign(cfg, saved);
    cfg.click = 'electronic'; // only click sound left
    const d = RT.events.defaults(); // fields added later: keep defaults when an older save lacks them
    if (!cfg.poly || typeof cfg.poly !== 'object') cfg.poly = d.poly;
    if (!(cfg.poly.n >= 1)) cfg.poly.n = 1;
    if (typeof cfg.vocal.accent !== 'boolean') cfg.vocal.accent = true;
    if (!cfg.challenge || typeof cfg.challenge !== 'object') cfg.challenge = d.challenge;
    if (!['pads', 'polygon', 'clock', 'ball', 'pendulum', 'lane'].includes(cfg.viz)) cfg.viz = d.viz;
  } // a stale/corrupt blob falls back to defaults instead of crashing init
  cfg.test = null;
  cfg.seed = 1;

  let saveT = 0;
  const S = (RT.state = {
    cfg,
    tab: 'pulse',
    save() { clearTimeout(saveT); saveT = setTimeout(() => store.set(KEY, cfg), 200); },
    changed(what) { S.save(); RT.bus.emit('cfg', what); },

    resizeLevels(levels, n) {
      const out = levels.slice(0, n);
      while (out.length < n) out.push(1);
      return out;
    },
    setSignature(num, den) {
      cfg.num = clamp(num | 0, 1, 32); cfg.den = den;
      cfg.levels = S.resizeLevels(cfg.levels, cfg.num);
      S.changed('ts');
    },
    setBpm(v) { cfg.bpm = clamp(Math.round(v), 1, 500); S.changed('bpm'); },
  });
})();
