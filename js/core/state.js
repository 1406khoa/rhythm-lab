/* App state: one cfg object shared by Pulse/Practice/Forms (the engine reads it live), persisted
 * to localStorage, plus URL-hash share links (#p= pulse settings, #f= form). */
(function () {
  const RT = (window.RT = window.RT || {});
  const { clamp, store, b64 } = RT.util;
  const KEY = 'rt.cfg.v1', FORMS_KEY = 'rt.forms.v1';

  const cfg = RT.events.defaults();
  const saved = store.get(KEY, {});
  const sane = saved && Array.isArray(saved.levels) && saved.levels.length === saved.num && saved.form && Array.isArray(saved.form.bars) && saved.form.bars.length
    && saved.form.bars.every((b) => b && b.num >= 1 && Array.isArray(b.levels)) && saved.subdiv && saved.swing && saved.gap && saved.random;
  if (sane) { // older saves had one 'sound' field: electronic | clave | vocal
    if (saved.sound) { saved.click = saved.sound === 'vocal' ? 'electronic' : saved.sound; saved.voice = saved.sound === 'vocal'; delete saved.sound; }
    Object.assign(cfg, saved);
    cfg.click = 'electronic'; // only click sound left
  } // a stale/corrupt blob falls back to defaults instead of crashing init
  cfg.test = null;
  cfg.seed = 1;

  let saveT = 0;
  const S = (RT.state = {
    cfg,
    tab: 'pulse',
    save() { clearTimeout(saveT); saveT = setTimeout(() => store.set(KEY, cfg), 200); },
    changed(what) { S.save(); RT.bus.emit('cfg', what); },
    savedForms: () => store.get(FORMS_KEY, []),
    setSavedForms: (l) => store.set(FORMS_KEY, l),

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

    pulseLink() {
      const { bpm, num, den, levels, subdiv, subMask, followBeatMute, swing, click, voice, vocal } = cfg;
      return location.href.split('#')[0] + '#p=' + b64.enc({ bpm, num, den, levels, subdiv, subMask, followBeatMute, swing, click, voice, vocal });
    },
    formLink() {
      const f = cfg.form;
      return location.href.split('#')[0] + '#f=' + b64.enc({ b: f.bpm, r: f.bars.map((x) => [x.num, x.den, x.levels.join('')]) });
    },
    // accepts a full link, "#f=..." or the bare token; returns what it applied or null
    applyLink(text) {
      const m = /[#&]?([pf])=([A-Za-z0-9_-]+)/.exec(text || '');
      if (!m) return null;
      try {
        const d = b64.dec(m[2]);
        if (m[1] === 'p') {
          Object.assign(cfg, { bpm: clamp(d.bpm | 0, 1, 500), num: clamp(d.num | 0, 1, 32), den: d.den, levels: d.levels, subdiv: d.subdiv, subMask: d.subMask || [], followBeatMute: !!d.followBeatMute, swing: d.swing, click: RT.voices.CLICKS.some(([id]) => id === d.click) ? d.click : 'electronic', voice: !!d.voice, vocal: { grouping: String((d.vocal && d.vocal.grouping) || '') } });
          cfg.levels = S.resizeLevels(cfg.levels, cfg.num);
        } else {
          cfg.form.bpm = clamp(d.b | 0, 1, 500);
          cfg.form.bars = d.r.slice(0, 256).map(([num, den, lv]) => ({ num: clamp(num | 0, 1, 32), den, levels: S.resizeLevels([...String(lv)].map(Number), clamp(num | 0, 1, 32)) }));
          if (!cfg.form.bars.length) throw new Error('empty form');
          cfg.form.on = true;
        }
        S.changed('import');
        return m[1];
      } catch (e) { return null; }
    },
    resetPulse() {
      const d = RT.events.defaults();
      Object.assign(cfg, { bpm: d.bpm, num: d.num, den: d.den, levels: d.levels, subdiv: d.subdiv, subMask: [], followBeatMute: false, swing: d.swing, click: d.click, voice: d.voice, vocal: d.vocal });
      S.changed('reset');
    },
  });
})();
