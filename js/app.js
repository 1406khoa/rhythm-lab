/* Wiring: tabs, practice panel, global keys, ?log=1. */
(function () {
  const RT = (window.RT = window.RT || {});
  const TABS = ['pulse', 'test'];
  const q = new URLSearchParams(location.search);

  RT.practice.mount();
  TABS.forEach((t) => RT.tabs[t].init(document.getElementById('tab-' + t)));

  function show(tab) {
    if (RT.state.tab !== tab) { RT.engine.stop(); RT.practice.close(); } // one engine: leaving a tab stops whatever ran
    RT.state.tab = tab;
    TABS.forEach((t) => { document.getElementById('tab-' + t).hidden = t !== tab; });
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    RT.log.note('tab', { tab });
    if (RT.viz) RT.viz.redraw();
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  RT.show = show;

  const typing = (e) => { const t = e.target; return t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type))); };
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault(); if (e.repeat) return;
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); // else keyup re-clicks it
      if (RT.state.tab === 'test') RT.tabs.test.hit();
      else if (RT.challenge.active() && RT.engine.running && RT.engine.cfg === RT.state.cfg) RT.challenge.tap(e); // Space = tap while the challenge runs
      else RT.ui.toggleRun();
    } else if (RT.state.tab === 'test' && e.code === 'KeyR') RT.tabs.test.reset();
    else if (RT.state.tab === 'test' && e.code === 'KeyM') RT.tabs.test.toggleMute();
  });

  if (location.hash) history.replaceState(null, '', location.pathname + location.search); // old share links (#p= / #f=) are no longer read
  show(RT.state.tab);
  if (q.get('log') === '1') RT.log.set(true);
  // offline: cache the app after the first visit (service workers need https or localhost, not file://)
  // not on localhost: a cached copy would hide every edit during development (and drop one left from before)
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    if (dev) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    else navigator.serviceWorker.register('sw.js').catch((e) => console.warn('offline cache unavailable', e));
  }
  if (q.has('selftest')) document.head.append(Object.assign(document.createElement('script'), { src: 'js/selftest.js' })); // dev only, not deployed
})();
