/* Sound generation. play() works on any BaseAudioContext, so the live engine and the
 * OfflineAudioContext self-test run the very same code path. */
(function () {
  const RT = (window.RT = window.RT || {});

  const buffers = {};   // '1'..'12' -> AudioBuffer (FLAC samples from tools/build-samples.py)
  const onsets = {};    // perceptual onset (s) from tools/build-samples.py
  let lastVoice = null; // { gain, end } of the previous vocal sample, to cut overlaps

  const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

  const ready = (async function load() {
    const data = RT.VOCAL || {};
    const dec = new OfflineAudioContext(1, 1, 44100);
    await Promise.all(Object.entries(data).map(async ([k, v]) => {
      buffers[k] = await dec.decodeAudioData(b64ToBytes(v.flac));
      onsets[k] = v.onset;
    }));
  })().catch((e) => { console.error('vocal samples failed to decode', e); });

  const maxOnset = () => Math.max(0, ...Object.values(onsets));

  // when the audio must START so that the perceived beat lands on ev.t
  const startFor = (ev) => (ev.voice && ev.voice in buffers ? ev.t - onsets[ev.voice] : ev.t);

  function blip(ctx, dest, t, freq, vol, dur, type) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur);
  }

  const VOL = { 2: 1, 1: 0.65, 0.5: 0.35 }; // accent, normal, soft

  // The click: the original analyzer sine blip. role: accent | beat | sub. hi = Test count-in.
  const CLICKS = [['electronic', 'Điện tử']];
  // A struck tone: 1.5 ms attack (no click artefact), exponential decay, optional downward pitch glide and partials.
  function tone(ctx, dest, t, spec, vol) {
    const g = ctx.createGain(), end = t + spec.dur;
    if (spec.attack) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + spec.attack); }
    else g.gain.setValueAtTime(vol, t); // instant start: the crisp edge is part of a metronome click
    g.gain.exponentialRampToValueAtTime(0.001, end);
    g.connect(dest);
    const parts = [[1, 1]].concat(spec.partials || []), total = parts.reduce((x, [, gn]) => x + gn, 0);
    for (const [ratio, gain] of parts) { // partial gains are normalised so richer packs never clip
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = spec.type || 'sine';
      o.frequency.setValueAtTime(spec.f * ratio, t);
      if (spec.glide) o.frequency.exponentialRampToValueAtTime(spec.f * ratio * spec.glide, t + spec.dur * 0.7);
      og.gain.value = gain / total; o.connect(og); og.connect(g);
      o.start(t); o.stop(end + 0.01);
    }
  }
  // The click pack (picked by ear on 19/11 from 5 candidates): accent / normal / soft / sub = 1200 / 900 / 700 Hz sine, 800 Hz triangle.
  const PACKS = {
    // measured from upbeat.studio "Classic Clicks" (19/11): pure tones, no filters/effects, instant start + exponential decay
    classic: { accent: { f: 1200, dur: 0.05 }, normal: { f: 900, dur: 0.05 }, soft: { f: 700, dur: 0.025 }, sub: { f: 800, dur: 0.025, type: 'triangle' } },
  };
  const VOLS = { accent: 1, normal: 1, soft: 1, sub: 0.4 }; // as measured: every beat level at full level, subs at 0.4
  let pack = 'classic';
  const setPack = (name) => { if (PACKS[name]) pack = name; };

  function click(ctx, dest, type, t, role, hi, fixedF) {
    if (role === 'polySub') { blip(ctx, dest, t, 1300, 0.3, 0.035, 'triangle'); return; } // second-layer subdivision: soft
    if (role === 'poly' || role === 'polyAccent') {
      // second layer: different timbre (triangle) and a longer ring, so it stays audible even when it lands on a main beat
      const acc = role === 'polyAccent';
      blip(ctx, dest, t, acc ? 2000 : 1600, acc ? 0.75 : 0.6, acc ? 0.07 : 0.055, 'triangle');
      return;
    }
    if (hi || fixedF) { // Test tab count-in and the completion chime: the original analyzer clicks, unchanged
      blip(ctx, dest, t, fixedF || (role === 'accent' ? 1600 : 1000), role === 'accent' ? 0.8 : 0.5, 0.03);
      return;
    }
    // the pad height is heard as the tone (see PACKS): higher and brighter = stronger, lower and rounder = lighter
    const spec = PACKS[pack][role === 'accent' || role === 'soft' || role === 'sub' ? role : 'normal'];
    tone(ctx, dest, t, spec, VOLS[role] || VOLS.normal);
  }

  function play(ctx, dest, ev, muted) {
    if (!ev.played || muted) return null;
    const isSub = ev.kind === 'sub', v = VOL[ev.level] || 0.65;
    const buf = ev.voice && buffers[ev.voice];
    let res = { start: ev.t, cut: false };
    if (buf) { // vocal: the word, and the click below on top of it (always both)
      const start = ev.t - onsets[ev.voice];
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf;
      g.gain.value = (isSub ? 0.5 : v) * 1.2;
      src.connect(g); g.connect(dest);
      let cut = false;
      if (lastVoice && lastVoice.end > start) { // previous word still ringing: short fade instead of a smear
        lastVoice.gain.gain.setTargetAtTime(0, Math.max(start - 0.006, 0), 0.002);
        cut = true;
      }
      src.start(start);
      lastVoice = { gain: g, end: start + buf.duration };
      res = { start, cut };
    }
    const role = ev.kind === 'polysub' ? 'polySub' : ev.kind === 'poly' ? (ev.level === 2 ? 'polyAccent' : 'poly') : isSub ? 'sub' : ev.level === 0.5 ? 'soft' : ev.level === 2 ? 'accent' : 'beat';
    click(ctx, dest, ev.click || 'electronic', ev.t, role, ev.tone === 'hi', ev._f);
    return res;
  }

  function resetVoiceState() { lastVoice = null; }

  RT.voices = { ready, buffers, onsets, maxOnset, startFor, play, click, CLICKS, PACKS, setPack, tone, resetVoiceState, hasVocal: () => Object.keys(buffers).length > 0 };
})();
