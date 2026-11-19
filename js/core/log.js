/* Log mode. Exists because the author (Claude) cannot hear: every scheduled event, including the
 * silent ones with their reason, plus scheduling lead/jitter, is recorded and exposed as
 * window.__rtlog so headless runs can assert on it. Off by default; ?log=1 or the header toggle. */
(function () {
  const RT = (window.RT = window.RT || {});
  const CAP = 20000;

  const log = (RT.log = {
    on: false,
    entries: [],
    stats: null,
    set(on) { log.on = !!on; if (on) log.reset(); RT.bus.emit('log:mode', log.on); },
    reset() {
      log.entries.length = 0;
      log.stats = { scheduled: 0, played: 0, skipped: 0, minLeadMs: Infinity, lateCount: 0, maxSpacingErrMs: 0, maxDrawLagMs: 0, warns: 0 };
    },
    add(e) {
      if (!log.on) return;
      if (log.entries.length >= CAP) log.entries.splice(0, CAP / 4);
      log.entries.push(e);
    },
    // called by the engine right after it hands an event to Web Audio
    sched(ev, now, startAt) {
      if (!log.on) return;
      const s = log.stats, leadMs = (startAt - now) * 1000;
      s.scheduled++; ev.played ? s.played++ : s.skipped++;
      if (ev.played) {
        s.minLeadMs = Math.min(s.minLeadMs, leadMs);
        if (leadMs < 0) s.lateCount++;
      }
      log.add({ k: 'sched', g: ev.gIdx, bar: ev.bar, beat: ev.beat, sub: ev.sub, kind: ev.kind, lvl: ev.level,
        voice: ev.voice, click: ev.click, played: ev.played, why: ev.reason, t: +ev.t.toFixed(4), start: +startAt.toFixed(4), leadMs: +leadMs.toFixed(2) });
    },
    // spacing between consecutive beat events vs the expected duration
    spacing(actualS, expectedS, g) {
      if (!log.on) return;
      const err = Math.abs(actualS - expectedS) * 1000;
      log.stats.maxSpacingErrMs = Math.max(log.stats.maxSpacingErrMs, err);
      if (err > 0.05) log.add({ k: 'spacing', g, actualMs: +(actualS * 1000).toFixed(3), expectedMs: +(expectedS * 1000).toFixed(3) });
    },
    draw(ev, lagMs) {
      if (!log.on) return;
      log.stats.maxDrawLagMs = Math.max(log.stats.maxDrawLagMs, lagMs);
      log.add({ k: 'draw', g: ev.gIdx, sub: ev.sub, lagMs: +lagMs.toFixed(1) });
    },
    note(k, data) { // engine/tap/test lifecycle
      if (!log.on) return;
      log.add(Object.assign({ k, at: +performance.now().toFixed(1) }, data));
    },
    warn(msg, data) {
      if (!log.on) return;
      log.stats.warns++;
      log.add(Object.assign({ k: 'warn', msg }, data));
    },
    summary() { return Object.assign({}, log.stats, { minLeadMs: log.stats.minLeadMs === Infinity ? null : +log.stats.minLeadMs.toFixed(2) }); },
    export() { return { stats: log.summary(), entries: log.entries }; },
  });
  log.reset();
  Object.defineProperty(window, '__rtlog', { get: () => log.export() });
})();
