/* Practice tab: gap click, random mute, keep-screen-awake. */
(function () {
  const RT = (window.RT = window.RT || {});
  const { h } = RT.util;
  const { cfg } = RT.state;
  const ui = RT.ui;
  let els = {}, lock = null;

  function valueRow(label, input, valEl, unit) {
    return h('div', { class: 'vrow' }, h('span', { class: 'lbl' }, label), input, h('span', { class: 'val' }, valEl), h('span', { class: 'u' }, unit));
  }

  function init(root) {
    const g = cfg.gap, r = cfg.random;
    const mk = (obj, key, min, max, unit) => {
      const val = h('b', {});
      const input = ui.range(min, max, obj[key], (v) => { obj[key] = v; RT.state.changed('practice'); });
      return { row: valueRow('', input, val, unit), input, val, obj, key };
    };
    els.gapOn = ui.toggle(g.on, (v) => { g.on = v; RT.state.changed('gap'); }, 'Ngắt quãng click');
    els.unit = ui.seg([['measures', 'Ô nhịp'], ['beats', 'Phách']], g.unit, (v) => { g.unit = v; RT.state.changed('gap'); });
    els.play = mk(g, 'play', 1, 16, ''); els.sil = mk(g, 'silence', 1, 16, '');
    els.play.row.firstChild.textContent = 'Chơi'; els.sil.row.firstChild.textContent = 'Im lặng';
    els.pill = h('span', { class: 'status' }, 'Đang chờ');
    els.rndOn = ui.toggle(r.on, (v) => { r.on = v; RT.state.changed('random'); }, 'Tắt ngẫu nhiên');
    els.rb = mk(r, 'beatPct', 0, 100, '%'); els.rs = mk(r, 'subPct', 0, 100, '%');
    els.rb.row.firstChild.textContent = 'Phách'; els.rs.row.firstChild.textContent = 'Nốt chia';

    const gap = h('div', { class: 'card' },
      h('div', { class: 'cap row' }, 'Ngắt quãng click', h('span', { class: 'grow' }), els.gapOn),
      h('p', { class: 'hint' }, 'Chơi N, rồi im M. Luyện đồng hồ nội tại: hết khoảng im, bạn phải vẫn đúng phách'),
      h('div', { class: 'vrow' }, h('span', { class: 'lbl' }, 'Đếm theo'), els.unit),
      els.play.row, els.sil.row, els.pill);
    const rnd = h('div', { class: 'card' },
      h('div', { class: 'cap row' }, 'Tắt ngẫu nhiên', h('span', { class: 'grow' }), els.rndOn),
      h('p', { class: 'hint' }, 'Mỗi phách (và nếu muốn, mỗi nốt chia) có xác suất bị tắt tiếng ngẫu nhiên'),
      els.rb.row, els.rs.row);

    els.awake = ui.toggle(cfg.keepAwake, (v) => { cfg.keepAwake = v; RT.state.changed('awake'); syncLock(); }, 'Giữ màn hình sáng');
    const supported = 'wakeLock' in navigator;
    const dev = h('div', { class: 'card' }, h('div', { class: 'cap' }, 'Thiết bị'),
      h('div', { class: 'line' }, h('div', {}, h('b', {}, 'Giữ màn hình sáng'), h('small', {}, supported ? 'Màn hình không tự khóa khi máy nhịp đang chạy' : 'Trình duyệt này không hỗ trợ')), els.awake));
    if (!supported) els.awake.disabled = true;

    els.chOn = ui.toggle(cfg.challenge.on, (v) => { cfg.challenge.on = v; RT.state.changed('challenge'); }, 'Thử thách gõ');
    const ch = h('div', { class: 'card' }, h('div', { class: 'cap row' }, 'Thử thách gõ', h('span', { class: 'grow' }), els.chOn),
      h('p', { class: 'hint' }, 'Ở tab Máy nhịp hiện nút GÕ (hoặc phím Space). Khi click tắt (Ngắt quãng click hoặc Tắt ngẫu nhiên), tự đếm qua đoạn im rồi gõ đúng phách đầu tiên click quay lại. Không có đoạn im thì chấm phách 1 mỗi ô nhịp.'),
      h('p', { class: 'hint' }, 'Chuẩn: lệch ≤ 3 ms · Gần: ≤ 25 ms · Lệch: ≤ 100 ms · Rushing / Dragging: sớm / trễ hơn 100 ms · Bỏ lỡ: không gõ.'));
    const run = h('div', { class: 'run-row center' }, ui.runButton(), h('kbd', {}, 'SPACE'));
    root.append(h('div', { class: 'two-col even' }, gap, rnd), ch, dev, run);

    refresh();
    RT.bus.on('cfg', refresh);
    RT.engine.on('state', (running) => { syncLock(); if (!running) setPill(null); });
    RT.engine.on('draw', (ev) => { if (ev.sub === 0 && RT.engine.cfg === cfg) setPill(ev); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncLock(); });
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
    els.gapOn.set(g.on); els.unit.set(g.unit); els.rndOn.set(r.on); els.awake.set(cfg.keepAwake); els.chOn.set(cfg.challenge.on);
    for (const e of [els.play, els.sil, els.rb, els.rs]) { e.input.value = e.obj[e.key]; e.val.textContent = e.obj[e.key]; }
    els.play.row.lastChild.textContent = g.unit === 'beats' ? 'phách' : 'ô nhịp';
    els.sil.row.lastChild.textContent = els.play.row.lastChild.textContent;
  }

  async function syncLock() {
    const want = 'wakeLock' in navigator && cfg.keepAwake && RT.engine.running && document.visibilityState === 'visible';
    try {
      if (want && !lock) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
        RT.log.note('wakelock', { state: 'on' });
      } else if (!want && lock) { await lock.release(); lock = null; RT.log.note('wakelock', { state: 'off' }); }
    } catch (e) { lock = null; RT.log.note('wakelock', { state: 'error', msg: String(e) }); }
  }

  RT.tabs = RT.tabs || {};
  RT.tabs.practice = { init };
})();
