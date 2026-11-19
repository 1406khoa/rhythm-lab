/* Sound generation. play() works on any BaseAudioContext, so the live engine and the
 * OfflineAudioContext self-test run the very same code path. */
(function () {
  const RT = (window.RT = window.RT || {});

  const buffers = {};   // '1'..'12','e','and','a' -> AudioBuffer
  const onsets = {};    // perceptual onset (s) from tools/build-samples.py
  let lastVoice = null; // { gain, end } of the previous vocal sample, to cut overlaps

  const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

  const ready = (async function load() {
    const data = RT.VOCAL || {};
    const dec = new OfflineAudioContext(1, 1, 44100);
    await Promise.all(Object.entries(data).map(async ([k, v]) => {
      buffers[k] = await dec.decodeAudioData(b64ToBytes(v.wav));
      onsets[k] = v.onset;
    }));
  })().catch((e) => { console.error('vocal samples failed to decode', e); });

  const maxOnset = () => Math.max(0, ...Object.values(onsets));

  // when the audio must START so that the perceived beat lands on ev.t
  const startFor = (ev) => (ev.voice && ev.voice in buffers ? ev.t - onsets[ev.voice] : ev.t);

  function blip(ctx, dest, t, freq, vol, dur) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur);
  }

  const VOL = { 2: 1, 1: 0.65 };

  // The click: the original analyzer sine blip. role: accent | beat | sub. hi = Test count-in.
  const CLICKS = [['electronic', 'Điện tử']];
  function click(ctx, dest, type, t, role, hi, fixedF) {
    const A = role === 'accent', S = role === 'sub';
    const f = fixedF || (S ? 600 : A ? (hi ? 1600 : 1200) : hi ? 1000 : 800);
    blip(ctx, dest, t, f, S ? 0.25 : A ? 0.8 : 0.5, 0.03);
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
    click(ctx, dest, ev.click || 'electronic', ev.t, isSub ? 'sub' : ev.level === 2 ? 'accent' : 'beat', ev.tone === 'hi', ev._f);
    return res;
  }

  function resetVoiceState() { lastVoice = null; }

  RT.voices = { ready, buffers, onsets, maxOnset, startFor, play, click, CLICKS, resetVoiceState, hasVocal: () => Object.keys(buffers).length > 0 };
})();
