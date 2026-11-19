/* Wiring: tabs, global keys, share-link import, ?log=1. */
(function () {
  const RT = (window.RT = window.RT || {});
  const TABS = ['pulse', 'practice', 'forms', 'test'];
  const q = new URLSearchParams(location.search);

  TABS.forEach((t) => RT.tabs[t].init(document.getElementById('tab-' + t)));

  function show(tab) {
    if (RT.state.tab !== tab) RT.engine.stop(); // one engine: leaving a tab stops whatever ran
    RT.state.tab = tab;
    TABS.forEach((t) => { document.getElementById('tab-' + t).hidden = t !== tab; });
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    RT.log.note('tab', { tab });
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  RT.show = show;

  const typing = (e) => { const t = e.target; return t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type))); };
  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault(); if (e.repeat) return;
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); // else keyup re-clicks it
      if (RT.state.tab === 'test') RT.tabs.test.hit(); else RT.ui.toggleRun();
    } else if (RT.state.tab === 'test' && e.code === 'KeyR') RT.tabs.test.reset();
    else if (RT.state.tab === 'test' && e.code === 'KeyM') RT.tabs.test.toggleMute();
  });

  if (location.hash) {
    const kind = RT.state.applyLink(location.hash);
    if (kind) { show(kind === 'f' ? 'forms' : 'pulse'); history.replaceState(null, '', location.pathname + location.search); RT.ui.toast(kind === 'f' ? 'Đã nhập cấu trúc' : 'Đã nhập cài đặt'); }
  }
  show(RT.state.tab);
  if (q.get('log') === '1') RT.log.set(true);
  // offline: cache the app after the first visit (service workers need https or localhost, not file://)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch((e) => console.warn('offline cache unavailable', e));
  if (q.has('selftest')) document.head.append(Object.assign(document.createElement('script'), { src: 'js/selftest.js' })); // dev only, not deployed
})();
