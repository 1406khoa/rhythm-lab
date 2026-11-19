/* Forms tab: chain bars with their own time signatures, undo/redo, select mode, save/share. */
(function () {
  const RT = (window.RT = window.RT || {});
  const { h, clamp } = RT.util;
  const { cfg } = RT.state;
  const ui = RT.ui;
  const f = cfg.form;
  const NEXT = { 2: 1, 1: 0, 0: 2 }, MARK = { 2: '▲', 1: '•', 0: '–' };
  const MAX_BARS = 256, HIST = 60;

  const undo = [], redo = [];
  let els = {}, view = 'beat', selecting = false, selected = new Set(), rows = [], cur = null;

  const snap = () => JSON.stringify({ bpm: f.bpm, bars: f.bars });
  function restore(s) { const d = JSON.parse(s); f.bpm = d.bpm; f.bars = d.bars; selected.clear(); RT.state.changed('form'); }
  // every edit goes through here: snapshot first, then mutate
  function edit(fn) {
    undo.push(snap()); if (undo.length > HIST) undo.shift(); redo.length = 0;
    fn(); RT.state.changed('form');
  }
  const newBar = (num, den) => ({ num, den, levels: RT.events.defaultLevels(num) });

  function init(root) {
    els.on = ui.toggle(f.on, (v) => { f.on = v; RT.state.changed('formOn'); }, 'Cấu trúc tùy chỉnh');
    els.view = ui.seg([['beat', 'Phách'], ['chart', 'Tổng quan']], view, (v) => { view = v; render(); });
    els.undo = h('button', { class: 'icon', 'aria-label': 'Hoàn tác', onclick: () => { if (undo.length) { redo.push(snap()); restore(undo.pop()); } } }, '↺');
    els.redo = h('button', { class: 'icon', 'aria-label': 'Làm lại', onclick: () => { if (redo.length) { undo.push(snap()); restore(redo.pop()); } } }, '↻');
    els.clear = h('button', { class: 'btn sm', onclick: () => edit(() => { f.bars = [newBar(4, 4)]; selected.clear(); }) }, 'Xóa hết');
    els.bpm = h('input', { class: 'num wide', type: 'number', min: 1, max: 500, 'aria-label': 'Nhịp độ của cấu trúc (BPM)' });
    els.bpm.addEventListener('change', () => { f.bpm = clamp(Number(els.bpm.value) || 60, 1, 500); RT.state.changed('formBpm'); });
    const step = (d, t) => h('button', { class: 'btn sm sq', 'aria-label': (d > 0 ? 'Tăng' : 'Giảm') + ' nhịp độ', onclick: () => { f.bpm = clamp(f.bpm + d, 1, 500); RT.state.changed('formBpm'); } }, t);

    const head = h('div', { class: 'card' },
      h('div', { class: 'cap row' }, 'Cấu trúc tùy chỉnh', h('span', { class: 'grow' }), els.on),
      h('p', { class: 'hint' }, 'Nối nhiều ô nhịp, mỗi ô có thể đổi số chỉ nhịp'),
      h('div', { class: 'toolbar' }, els.view, els.undo, els.redo, els.clear, h('span', { class: 'stepper' }, step(-1, '−'), els.bpm, step(1, '+'), h('span', { class: 'u' }, 'BPM'))));

    els.list = h('div', { class: 'bars' });
    els.add = h('button', { class: 'btn dashed', onclick: () => { const l = f.bars[f.bars.length - 1]; if (f.bars.length < MAX_BARS) edit(() => f.bars.push(newBar(l.num, l.den))); } });
    els.selBtn = h('button', { class: 'btn', onclick: () => { selecting = !selecting; selected.clear(); render(); } }, 'Chọn ô nhịp');
    els.dup = h('button', { class: 'btn sm', onclick: dupSelected }, 'Nhân bản');
    els.del = h('button', { class: 'btn sm danger', onclick: delSelected }, 'Xóa');
    els.selTools = h('span', { class: 'sel-tools' }, els.dup, els.del);
    const actions = h('div', { class: 'row-gap' }, els.add, els.selBtn, els.selTools);
    els.tip = h('p', { class: 'hint' }, 'Thêm ô nhịp để dựng cả bài, ví dụ 3 ô 4/4 rồi 1 ô 2/4. Bật “Cấu trúc tùy chỉnh” rồi bấm Bắt đầu để chơi theo thứ tự.');

    // save & share
    els.saved = h('div', { class: 'saved' });
    els.imp = h('input', { class: 'text', type: 'text', placeholder: 'Dán liên kết chia sẻ', 'aria-label': 'Liên kết cần nhập' });
    els.impRow = h('div', { class: 'row-gap', hidden: true }, els.imp, h('button', { class: 'btn sm', onclick: doImport }, 'Nhập'));
    const share = h('div', { class: 'card narrow' }, h('div', { class: 'cap' }, 'Lưu và chia sẻ'),
      h('p', { class: 'hint' }, 'Lưu cấu trúc vào máy, chia sẻ bằng liên kết, hoặc nhập liên kết người khác gửi.'),
      h('div', { class: 'row-gap' },
        h('button', { class: 'btn sm', onclick: saveForm }, 'Lưu cấu trúc'),
        h('button', { class: 'btn sm', onclick: () => RT.copyText(RT.state.formLink(), 'Đã sao chép liên kết') }, 'Sao chép liên kết'),
        h('button', { class: 'btn sm', onclick: () => { els.impRow.hidden = !els.impRow.hidden; } }, 'Nhập liên kết')),
      els.impRow, els.saved);

    root.append(head, els.list, actions, els.tip, h('div', { class: 'run-row' }, ui.runButton(), h('kbd', {}, 'SPACE')), share);
    render();
    RT.bus.on('cfg', (what) => { if (what !== 'levels' && what !== 'practice') render(); });
    RT.engine.on('draw', onDraw);
    RT.engine.on('state', (r) => { if (!r) clearCur(); });
  }

  function dupSelected() {
    if (!selected.size) return;
    edit(() => {
      const out = [];
      f.bars.forEach((b, i) => { out.push(b); if (selected.has(i)) out.push({ num: b.num, den: b.den, levels: b.levels.slice() }); });
      f.bars = out.slice(0, MAX_BARS); selected.clear();
    });
  }
  function delSelected() {
    if (!selected.size) return;
    edit(() => { const keep = f.bars.filter((_, i) => !selected.has(i)); f.bars = keep.length ? keep : [newBar(4, 4)]; selected.clear(); });
  }

  function saveForm() {
    const list = RT.state.savedForms();
    list.push({ name: 'Cấu trúc ' + (list.length + 1), bpm: f.bpm, bars: f.bars });
    RT.state.setSavedForms(list); renderSaved(); ui.toast('Đã lưu cấu trúc');
  }
  function doImport() {
    const ok = RT.state.applyLink(els.imp.value);
    if (ok === 'f') { els.imp.value = ''; els.impRow.hidden = true; ui.toast('Đã nhập cấu trúc'); } else ui.toast('Đây không phải liên kết cấu trúc', 'err');
  }
  function renderSaved() {
    const list = RT.state.savedForms();
    els.saved.replaceChildren(...(list.length ? list.map((s, i) => h('div', { class: 'saved-row' },
      h('span', {}, s.name, h('small', {}, ' · ' + s.bars.length + ' ô nhịp · ' + s.bpm + ' BPM')),
      h('button', { class: 'btn sm', onclick: () => edit(() => { f.bpm = s.bpm; f.bars = JSON.parse(JSON.stringify(s.bars)); selected.clear(); }) }, 'Mở'),
      h('button', { class: 'btn sm danger', onclick: () => { list.splice(i, 1); RT.state.setSavedForms(list); renderSaved(); } }, '×')))
      : [h('em', { class: 'hint' }, 'Chưa lưu cấu trúc nào')]));
  }

  function barRow(b, i) {
    const num = h('input', { class: 'num xs', type: 'number', min: 1, max: 32, value: b.num, 'aria-label': 'Số phách ô nhịp ' + (i + 1) });
    num.addEventListener('change', () => edit(() => { b.num = clamp(Number(num.value) || 4, 1, 32); b.levels = RT.state.resizeLevels(b.levels, b.num); }));
    const den = h('select', { 'aria-label': 'Giá trị nốt ô nhịp ' + (i + 1) }, [2, 4, 8, 16].map((d) => h('option', { value: d, selected: d === b.den }, d)));
    den.addEventListener('change', () => edit(() => { b.den = Number(den.value); }));
    const circles = b.levels.slice(0, b.num).map((lv, k) => h('button', { class: 'beat sm l' + lv, 'aria-label': 'Ô nhịp ' + (i + 1) + ', phách ' + (k + 1),
      onclick: (e) => { b.levels[k] = NEXT[b.levels[k]]; e.currentTarget.className = 'beat sm l' + b.levels[k]; e.currentTarget.lastChild.textContent = MARK[b.levels[k]]; RT.state.save(); } },
      h('span', { class: 'm' }, MARK[lv])));
    const row = h('div', { class: 'bar' + (selected.has(i) ? ' sel' : '') },
      selecting ? h('input', { type: 'checkbox', class: 'ck', checked: selected.has(i), 'aria-label': 'Chọn ô nhịp ' + (i + 1), onchange: (e) => { e.target.checked ? selected.add(i) : selected.delete(i); row.classList.toggle('sel', e.target.checked); } }) : null,
      h('span', { class: 'bar-no' }, i + 1),
      h('div', { class: 'ts' }, num, h('span', {}, '/'), den),
      h('div', { class: 'bar-beats' }, circles),
      h('button', { class: 'icon x', 'aria-label': 'Xóa ô nhịp ' + (i + 1), disabled: f.bars.length < 2, onclick: () => edit(() => f.bars.splice(i, 1)) }, '×'));
    row._circles = circles;
    return row;
  }

  function chartCell(b, i) {
    return h('div', { class: 'cell' + (selected.has(i) ? ' sel' : ''), onclick: (e) => { if (!selecting) return; selected.has(i) ? selected.delete(i) : selected.add(i); e.currentTarget.classList.toggle('sel'); } },
      h('small', {}, i + 1), h('b', {}, b.num + '/' + b.den),
      h('span', { class: 'mini' }, b.levels.slice(0, b.num).map((lv) => h('i', { class: 'l' + lv }))));
  }

  function render() {
    els.on.set(f.on); els.view.set(view); els.bpm.value = f.bpm;
    els.undo.disabled = !undo.length; els.redo.disabled = !redo.length;
    const last = f.bars[f.bars.length - 1];
    els.add.textContent = '+ Thêm ô nhịp ' + last.num + '/' + last.den;
    els.selBtn.textContent = selecting ? 'Xong' : 'Chọn ô nhịp';
    els.selTools.hidden = !selecting;
    els.tip.hidden = f.bars.length > 1;
    els.list.className = 'bars v-' + view;
    rows = f.bars.map(view === 'beat' ? barRow : chartCell);
    els.list.replaceChildren(...rows);
    cur = null;
    renderSaved();
  }

  function clearCur() { if (cur) cur.forEach((c) => c && c.classList.remove('cur')); cur = null; }
  function onDraw(ev) {
    if (RT.state.tab !== 'forms' || !f.on || RT.engine.cfg !== cfg || ev.kind !== 'beat') return;
    const row = rows[ev.bar % rows.length];
    clearCur();
    cur = [row, row && row._circles && row._circles[ev.beat]];
    cur.forEach((c) => c && c.classList.add('cur'));
  }

  RT.tabs = RT.tabs || {};
  RT.tabs.forms = { init, _undoDepth: () => undo.length };
})();
