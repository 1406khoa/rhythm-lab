/* One AudioContext, one scheduler. Pulse/Practice/Forms and the Test tab share it and exclude each
 * other: start() always stops whatever ran before.
 * Nothing is committed early: each event goes to Web Audio only once it is inside the lookahead
 * (~120 ms), and the next beat's time is computed at that moment from the CURRENT tempo. So any edit
 * (tempo, subdivision, mute...) is heard within ~120 ms, not one beat later.
 * Visuals come from a rAF queue keyed on audio time (no setTimeout per note). */
(function () {
  const RT = (window.RT = window.RT || {});
  const LOOKAHEAD = 0.12, TICK_MS = 25, QUEUE_MAX = 400;

  const bus = RT.util.bus();
  let ctx = null, timer = 0, raf = 0, cur = null, lead = 0, startSeq = 0;
  // cur = the beat being scheduled: { pos, t0, done } (done = how many of its events are already in Web Audio)
  const queue = [];

  const E = (RT.engine = {
    running: false, starting: false, cfg: null, muted: false,
    on: bus.on, off: bus.off,
    get ctx() { return ctx; },
    now: () => (ctx ? ctx.currentTime : 0),

    ensureCtx() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      return ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    },

    async start(cfg) {
      E.stop();
      const my = ++startSeq; // a stop() or a newer start() while we await cancels this one
      E.starting = true;
      await E.ensureCtx();
      await RT.voices.ready;
      if (my !== startSeq) return;
      E.starting = false;
      E.cfg = cfg;
      RT.voices.resetVoiceState();
      lead = cfg.voice ? RT.voices.maxOnset() : 0; // vocal starts earlier than its beat
      cur = { pos: { gIdx: 0, barIdx: 0, beat: 0 }, t0: ctx.currentTime + 0.06 + lead, done: 0 };
      queue.length = 0;
      E.running = true;
      RT.log.note('engine', { state: 'start', bpm: RT.events.effBpm(cfg), click: cfg.click, voice: cfg.voice, sr: ctx.sampleRate, baseLatency: ctx.baseLatency, outLatency: ctx.outputLatency || 0, lead });
      tick();
      raf = requestAnimationFrame(draw);
      bus.emit('state', true);
    },

    stop() {
      startSeq++; E.starting = false;
      if (!E.running) return;
      E.running = false;
      clearTimeout(timer); cancelAnimationFrame(raf);
      queue.length = 0;
      RT.log.note('engine', { state: 'stop' });
      bus.emit('state', false);
    },
  });

  function schedule(ev, dur) {
    const startAt = RT.voices.startFor(ev), now = ctx.currentTime;
    const r = RT.voices.play(ctx, ctx.destination, ev, E.muted);
    if (r && r.cut) RT.log.warn('vocal overlap: previous word faded out', { g: ev.gIdx, sub: ev.sub, beatMs: +(dur * 1000).toFixed(1) });
    RT.log.sched(ev, now, startAt);
    bus.emit('schedule', ev, dur);
    queue.push(ev);
  }

  function tick() {
    const cfg = E.cfg, horizon = ctx.currentTime + LOOKAHEAD;
    for (;;) {
      const dur = 60 / RT.events.effBpm(cfg);
      // rebuilt every tick from the live cfg: only the not-yet-committed events of this beat are used
      const evs = RT.events.beatEvents(cfg, cur.pos, cur.t0, dur);
      while (cur.done < evs.length && evs[cur.done].t - lead < horizon) schedule(evs[cur.done++], dur);
      if (cur.done < evs.length) break; // rest of this beat is still in the future
      let t1 = cur.t0 + dur; // next beat, from the tempo as it is NOW
      if (t1 - lead < ctx.currentTime - 0.05) { // timer was starved: drop the missed beats, do not burst them
        RT.log.warn('scheduler stalled, resync', { lateMs: +((ctx.currentTime - (t1 - lead)) * 1000).toFixed(1) });
        t1 = ctx.currentTime + 0.06 + lead;
      }
      if (t1 - lead >= horizon) break;
      RT.log.spacing(t1 - cur.t0, dur, cur.pos.gIdx + 1);
      const p = cur.pos, next = { gIdx: p.gIdx + 1, barIdx: p.barIdx, beat: p.beat + 1 };
      if (next.beat >= RT.events.barInfo(cfg, p.barIdx).num) { next.beat = 0; next.barIdx++; }
      cur = { pos: next, t0: t1, done: 0 };
    }
    if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX);
    timer = setTimeout(tick, TICK_MS);
  }

  function draw() {
    if (!E.running) return;
    const heard = ctx.currentTime - (ctx.outputLatency || 0);
    while (queue.length && queue[0].t <= heard) {
      const ev = queue.shift();
      RT.log.draw(ev, (heard - ev.t) * 1000);
      bus.emit('draw', ev);
    }
    raf = requestAnimationFrame(draw);
  }
})();
