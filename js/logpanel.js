/* Dev-only log panel (open with ?log=1, no button in the UI): shows live stats + the tail of RT.log.entries. Heavy rendering only while visible and on. */
(function () {
  const RT = (window.RT = window.RT || {});
  const panel = document.getElementById('logpanel');
  const stats = document.getElementById('lp-stats'), body = document.getElementById('lp-body');
  let timer = 0;

  const paint = () => {
    const s = RT.log.summary();
    stats.textContent = ' scheduled ' + s.scheduled + ' · played ' + s.played + ' · skipped ' + s.skipped + ' · min lead ' + s.minLeadMs + ' ms · late ' + s.lateCount + ' · draw lag max ' + s.maxDrawLagMs.toFixed(0) + ' ms · warns ' + s.warns;
    body.textContent = RT.log.entries.slice(-60).map((e) => JSON.stringify(e)).join('\n');
  };

  RT.bus.on('log:mode', (on) => {
    panel.hidden = !on;
    clearInterval(timer);
    if (on) { paint(); timer = setInterval(paint, 500); }
  });
  document.getElementById('lp-clear').addEventListener('click', () => { RT.log.reset(); paint(); });
  document.getElementById('lp-copy').addEventListener('click', () => RT.copyText(JSON.stringify(RT.log.export()), 'Đã sao chép nhật ký'));
  document.getElementById('lp-dl').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(RT.log.export(), null, 1)], { type: 'application/json' }));
    a.download = 'rhythm-log-' + Date.now() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
})();
