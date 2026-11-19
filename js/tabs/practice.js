/* Practice panel: gap click, random mute, tap challenge. Opens over the metronome (bottom sheet on phones,
 * side panel on wide screens) so setting up and starting happen on one screen. Keeps the screen awake while running. */
(function () {
  const RT = (window.RT = window.RT || {});
  const { h } = RT.util;
  const { cfg } = RT.state;
  const ui = RT.ui;
  let els = {}, lock = null;

  function valueRow(label, input, valEl, unit) {
    return h('div', { class: 'vrow' }, h('span', { class: 'lbl' }, label), input, h('span', { class: 'val' }, valEl), h('span', { class: 'u' }, unit));
  }
  // a mode card: title + switch, a one-line hint, and its options (shown only while the mode is on)
  const card = (title, toggle, hint, ...opts) => h('div', { class: 'card' },
    h('div', { class: 'cap row' }, title, h('span', { class: 'grow' }), toggle), h('p', { class: 'hint' }, hint), h('div', { class: 'opts' }, ...opts));

  function mount() {
    const g = cfg.gap, r = cfg.random;
    const mk = (obj, key, min, max, label, unit) => {
      const val = h('b', {});
      const input = ui.range(min, max, obj[key], (v) => { obj[key] = v; RT.state.changed('practice'); });
      return { row: valueRow(label, input, val, unit), input, val, obj, key };
    };
    els.gapOn = ui.toggle(g.on, (v) => { g.on = v; RT.state.changed('gap'); }, 'Ngắt quãng click');
    els.unit = ui.seg([['measures', 'Ô nhịp'], ['beats', 'Phách']], g.unit, (v) => { g.unit = v; RT.state.changed('gap'); });
    els.play = mk(g, 'play', 1, 16, 'Chơi', ''); els.sil = mk(g, 'silence', 1, 16, 'Im lặng', '');
    els.pill = h('span', { class: 'status' }, 'Đang chờ');
    els.rndOn = ui.toggle(r.on, (v) => { r.on = v; RT.state.changed('random'); }, 'Tắt ngẫu nhiên');
    els.rb = mk(r, 'beatPct', 0, 100, 'Phách', '%'); els.rs = mk(r, 'subPct', 0, 100, 'Nốt chia', '%');
    els.chOn = ui.toggle(cfg.challenge.on, (v) => { cfg.challenge.on = v; RT.state.changed('challenge'); }, 'Thử thách gõ');

    els.cards = [
      card('Ngắt quãng click', els.gapOn, 'Chơi N, rồi im M. Hết khoảng im, bạn phải vẫn đúng phách.',
        h('div', { class: 'vrow' }, h('span', { class: 'lbl' }, 'Đếm theo'), els.unit), els.play.row, els.sil.row, els.pill),
      card('Tắt ngẫu nhiên', els.rndOn, 'Mỗi phách (và nốt chia) có xác suất bị tắt tiếng.', els.rb.row, els.rs.row),
      card('Thử thách gõ', els.chOn, 'Gõ nút GÕ (hoặc Space) đúng phách đầu tiên click quay lại sau đoạn im. Không có đoạn im thì chấm phách 1.',
        h('p', { class: 'hint' }, 'Chuẩn ≤ 3 ms · Gần ≤ 25 ms · Lệch ≤ 100 ms · Rushing / Dragging: sớm / trễ hơn 100 ms.')),
    ];
    els.close = h('button', { class: 'icon sheet-x', 'aria-label': 'Đóng', onclick: close }, '✕');
    els.sheet = h('aside', { class: 'sheet', role: 'dialog', 'aria-label': 'Luyện tập', hidden: true },
      h('div', { class: 'sheet-head' }, h('b', {}, 'Luyện tập'), h('span', { class: 'grow' }), ui.runButton('sm'), els.close),
      h('div', { class: 'sheet-body' }, ...els.cards));
    document.body.append(els.sheet);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });

    refresh();
    RT.bus.on('cfg', refresh);
    RT.engine.on('state', (running) => { syncLock(); if (!running) setPill(null); });
    RT.engine.on('draw', (ev) => { if (ev.sub === 0 && RT.engine.cfg === cfg) setPill(ev); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncLock(); });
  }

  const isOpen = () => !els.sheet.hidden;
  function open() { els.sheet.hidden = false; document.body.classList.add('sheet-open'); soloStart(); RT.bus.emit('sheet', true); if (RT.viz) RT.viz.redraw(); }
  // one Start on screen: the panel shows its own only when it covers the metronome's (final layout, ignoring the slide-in)
  function soloStart() {
    const main = document.querySelector('#tab-pulse .run-row .start');
    if (!main || els.sheet.hidden) return;
    const S = els.sheet.style;
    S.maxHeight = S.minHeight = '';
    const r = main.getBoundingClientRect(), side = els.sheet.offsetHeight >= innerHeight - 1;
    let covered;
    if (side) covered = r.right > innerWidth - els.sheet.offsetWidth;
    else {
      const top = innerHeight - els.sheet.offsetHeight;
      covered = r.bottom > top;
      if (covered && r.top < top) { // half-covered: stop just under it if that leaves a usable panel, else cover it fully
        const room = innerHeight - r.bottom - 8;
        if (room >= 240) { S.maxHeight = room + 'px'; covered = false; } else S.minHeight = innerHeight - r.top + 8 + 'px';
      }
    }
    els.sheet.classList.toggle('own-start', covered);
  }
  addEventListener('resize', soloStart);
  function close() { els.sheet.hidden = true; document.body.classList.remove('sheet-open'); RT.bus.emit('sheet', false); if (RT.viz) RT.viz.redraw(); }

  // what is switched on, for the label on the metronome face ('' = nothing)
  function summary() {
    const g = cfg.gap, out = [];
    if (g.on) out.push('Ngắt quãng ' + g.play + '/' + g.silence + (g.unit === 'beats' ? ' phách' : ' ô'));
    if (cfg.random.on) out.push('Tắt ngẫu nhiên ' + cfg.random.beatPct + '%');
    if (cfg.challenge.on) out.push('Thử thách gõ');
    return out.join(' · ');
  }

  function setPill(ev) {
    if (!els.pill) return;
    if (!ev) { els.pill.textContent = 'Đang chờ'; els.pill.className = 'status'; return; }
    const g = cfg.gap;
    if (!g.on) { els.pill.textContent = 'Đang chơi'; els.pill.className = 'status live'; return; }
    const idx = g.unit === 'beats' ? ev.gIdx : ev.bar, ph = idx % (g.play + g.silence), silent = ph >= g.play;
    const left = silent ? g.play + g.silence - ph : g.play - ph;
    // no countdown while silent: it would tell the player when the click comes back
    els.pill.textContent = silent ? 'Đang im · tự đếm tiếp' : 'Đang chơi · còn ' + left + ' ' + (g.unit === 'beats' ? 'phách' : 'ô nhịp') + ' rồi im';
    els.pill.className = 'status ' + (silent ? 'quiet' : 'live');
  }

  function refresh() {
    const g = cfg.gap, r = cfg.random;
    els.gapOn.set(g.on); els.unit.set(g.unit); els.rndOn.set(r.on); els.chOn.set(cfg.challenge.on);
    [g.on, r.on, cfg.challenge.on].forEach((on, i) => els.cards[i].classList.toggle('on', on));
    for (const e of [els.play, els.sil, els.rb, els.rs]) { e.input.value = e.obj[e.key]; e.val.textContent = e.obj[e.key]; }
    els.play.row.lastChild.textContent = g.unit === 'beats' ? 'phách' : 'ô nhịp';
    els.sil.row.lastChild.textContent = els.play.row.lastChild.textContent;
  }

  // keep the screen on while the metronome runs (nobody wants it to lock mid-practice)
  async function syncLock() {
    const want = 'wakeLock' in navigator && RT.engine.running && document.visibilityState === 'visible';
    try {
      if (want && !lock) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
        RT.log.note('wakelock', { state: 'on' });
      } else if (!want && lock) { await lock.release(); lock = null; RT.log.note('wakelock', { state: 'off' }); }
    } catch (e) { lock = null; RT.log.note('wakelock', { state: 'error', msg: String(e) }); }
  }

  RT.practice = { mount, open, close, toggle: () => (isOpen() ? close() : open()), isOpen, summary };
})();
