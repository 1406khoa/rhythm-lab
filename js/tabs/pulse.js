/* Pulse tab: the face (tempo + beat pads) and the settings below it. */
(function () {
  const RT = (window.RT = window.RT || {});
  const { h, clamp } = Object.assign({}, RT.util);
  const { cfg } = RT.state;
  const ui = RT.ui;

  const SIGS = ['2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '5/8', '6/8', '7/8', '9/8', '12/8', '3/16', '5/16', '7/16'];
  const SUBS = [['none', '♩', 'Nốt đen'], ['duplet', '♪♪', 'Móc đơn'], ['triplet', '♪♪♪', 'Liên ba'], ['quadruplet', '♬♬', 'Móc kép'], ['sextuplet', '♬♬♬', 'Liên sáu'], ['custom', 'n', 'Tùy chỉnh']];
  const SWINGS = [['straight', 'Đều'], ['septuplet', 'Liên bảy'], ['quintuplet', 'Liên năm'], ['triplet', 'Liên ba'], ['dotted', 'Chấm dôi']];
  const NEXT_LEVEL = { 2: 1, 1: 0, 0: 2 };

  const taps = [];
  let els = {};

  const section = (title, ...kids) => h('section', { class: 'sec' }, h('h3', {}, title), ...kids);
  const row = (label, hint, control) => h('div', { class: 'line' }, h('div', {}, h('b', {}, label), hint ? h('small', {}, hint) : null), control);

  function init(root) {
    // ---- the face: tempo + beat pads
    els.bpm = h('input', { class: 'bpm-num', type: 'number', min: 1, max: 500, inputmode: 'numeric', 'aria-label': 'Nhịp độ (BPM)' });
    els.bpm.addEventListener('change', () => RT.state.setBpm(Number(els.bpm.value) || 60));
    els.name = h('span', {});
    els.meter = h('span', {});
    els.slider = ui.range(1, 500, cfg.bpm, (v) => RT.state.setBpm(v));
    els.slider.setAttribute('aria-label', 'Nhịp độ');
    const step = (d, cls) => h('button', { class: 'step ' + (cls || ''), 'aria-label': (d > 0 ? 'Tăng ' : 'Giảm ') + Math.abs(d), onclick: () => RT.state.setBpm(cfg.bpm + d) }, (d > 0 ? '+' : '−') + (Math.abs(d) === 1 ? '' : Math.abs(d)));
    els.beats = h('div', { class: 'pads' });
    els.dots = h('div', { class: 'dots' });
    els.formNote = h('p', { class: 'banner', hidden: true }, 'Đang chơi theo cấu trúc ở tab Cấu trúc.');
    const face = h('div', { class: 'face' },
      h('div', { class: 'tempo-row' }, step(-1), h('div', { class: 'bpm-c' }, els.bpm), step(1)),
      h('div', { class: 'tempo-meta' }, step(-5, 'big5'), h('span', { class: 'meta' }, els.name, els.meter), step(5, 'big5')),
      els.slider, els.beats, els.dots, els.formNote);
    const transport = h('div', { class: 'run-row' }, h('button', { class: 'btn tap', onclick: tapTempo, 'aria-label': 'Gõ để lấy nhịp độ' }, 'Gõ'), ui.runButton(), h('kbd', {}, 'Space'));

    // ---- time signature
    els.sigBtns = SIGS.map((s) => h('button', { class: 'pill', 'data-s': s, onclick: () => { const [n, d] = s.split('/').map(Number); RT.state.setSignature(n, d); } }, s));
    els.cNum = h('input', { class: 'num', type: 'number', min: 1, max: 32, 'aria-label': 'Số phách mỗi ô nhịp' });
    els.cNum.addEventListener('change', () => RT.state.setSignature(Number(els.cNum.value) || 4, cfg.den));
    els.cDen = h('select', { 'aria-label': 'Giá trị nốt' }, [2, 4, 8, 16].map((d) => h('option', { value: d }, d)));
    els.cDen.addEventListener('change', () => RT.state.setSignature(cfg.num, Number(els.cDen.value)));
    const sig = section('Số chỉ nhịp', h('div', { class: 'pills scroll' }, els.sigBtns),
      h('div', { class: 'custom-sig' }, h('span', {}, 'Khác'), els.cNum, h('span', { class: 'slash' }, '/'), els.cDen));

    // ---- subdivision + swing
    els.subBtns = SUBS.map(([id, ic, label]) => h('button', { class: 'tile', 'data-id': id, onclick: () => setSub(id) }, h('span', { class: 'ic' }, ic), h('span', {}, label)));
    els.customN = h('input', { class: 'num', type: 'number', min: 2, max: 16, 'aria-label': 'Số nốt mỗi phách' });
    els.customN.addEventListener('change', () => { cfg.subdiv.n = clamp(Number(els.customN.value) || 5, 2, 16); RT.state.changed('subdiv'); });
    els.customRow = row('Số nốt mỗi phách', null, els.customN);
    els.follow = ui.toggle(cfg.followBeatMute, (v) => { cfg.followBeatMute = v; RT.state.changed('follow'); }, 'Câm theo phách');
    els.swingBtns = SWINGS.map(([id, label]) => h('button', { class: 'pill sm', 'data-id': id, onclick: () => { cfg.swing.amount = RT.events.SWING_PRESETS[id]; RT.state.changed('swing'); } }, label));
    els.swing = ui.range(50, 75, cfg.swing.amount, (v) => { cfg.swing.amount = v; RT.state.changed('swing'); }, 0.1);
    els.swing.setAttribute('aria-label', 'Mức swing');
    els.swingVal = h('b', { class: 'sw-val' });
    els.swingBox = h('div', { class: 'swing' }, h('div', { class: 'line flat' }, h('b', {}, 'Swing'), els.swingVal), h('div', { class: 'pills scroll' }, els.swingBtns), els.swing);
    const sub = section('Chia phách', h('div', { class: 'tiles' }, els.subBtns), els.customRow,
      row('Câm theo phách', 'Phách nào tắt tiếng thì các nốt chia của phách đó cũng tắt', els.follow), els.swingBox);

    // ---- sound: the click always plays; the voice is optional on top
    els.voice = ui.toggle(cfg.voice, (v) => { cfg.voice = v; RT.state.changed('voice'); }, 'Đếm thành tiếng');
    els.groups = h('div', { class: 'pills scroll' });
    els.groupIn = h('input', { class: 'text sm', type: 'text', inputmode: 'numeric', placeholder: '2+2+3', 'aria-label': 'Cách chia nhóm' });
    els.groupIn.addEventListener('change', () => setGrouping(els.groupIn.value.replace(/\s/g, '')));
    els.accentG = h('button', { class: 'btn sm', onclick: accentGroups }, 'Nhấn phách đầu nhóm');
    els.vocalBox = h('div', { class: 'vocal-box' }, h('small', {}, 'Đếm nhịp lẻ theo nhóm, ví dụ 7/8 chia 2+2+3 đọc là 1 2 · 1 2 · 1 2 3'), els.groups, h('div', { class: 'row-gap' }, els.groupIn, els.accentG));
    const sound = section('Âm thanh',
      row('Đếm thành tiếng', 'Giọng đọc số phách (one, two, three…) chồng lên tiếng click', els.voice), els.vocalBox);

    const more = h('div', { class: 'row-gap end' },
      h('button', { class: 'btn ghost', onclick: () => copy(RT.state.pulseLink(), 'Đã sao chép liên kết') }, 'Sao chép liên kết'),
      h('button', { class: 'btn ghost', onclick: () => { RT.state.resetPulse(); ui.toast('Đã đặt lại'); } }, 'Đặt lại'));

    root.append(h('div', { class: 'split' }, h('div', { class: 'left' }, face, transport), h('div', { class: 'right' }, sig, sub, sound, more)));
    refresh();
    RT.bus.on('cfg', refresh);
    RT.engine.on('draw', onDraw);
    RT.engine.on('state', (r) => { if (!r) clearCur(); });
  }

  function setSub(id) {
    cfg.subdiv.id = id;
    if (id !== 'custom') cfg.subdiv.n = RT.events.SUBDIVS[id];
    else if (!(cfg.subdiv.n >= 2)) cfg.subdiv.n = 5;
    cfg.subMask = [];
    RT.state.changed('subdiv');
  }

  function setGrouping(str) {
    if (str && !RT.syllables.parseGrouping(str, cfg.num)) { ui.toast('Tổng các nhóm phải bằng ' + cfg.num, 'err'); str = ''; }
    cfg.vocal.grouping = str; RT.state.changed('grouping');
  }
  function accentGroups() {
    const starts = RT.syllables.groupStarts(cfg.vocal.grouping, cfg.num);
    if (!starts) { ui.toast('Hãy chọn cách chia nhóm trước', 'err'); return; }
    cfg.levels = cfg.levels.map((_, i) => (starts.includes(i) ? 2 : 1)); RT.state.changed('levels');
  }

  function tapTempo() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 8) taps.shift();
    if (taps.length >= 2) RT.state.setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1)));
  }

  function copy(text, msg) {
    const done = () => ui.toast(msg);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => ui.toast('Không sao chép được', 'err'));
    else { const t = h('textarea', {}); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { ui.toast('Không sao chép được', 'err'); } t.remove(); }
  }
  RT.copyText = copy;

  function refresh() {
    els.bpm.value = cfg.bpm;
    els.slider.value = cfg.bpm;
    els.name.textContent = RT.util.tempoName(cfg.bpm);
    els.meter.textContent = cfg.form.on ? 'Cấu trúc' : cfg.num + '/' + cfg.den;
    els.sigBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === cfg.num + '/' + cfg.den)));
    els.cNum.value = cfg.num; els.cDen.value = cfg.den;
    els.subBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === cfg.subdiv.id)));
    els.customN.value = cfg.subdiv.n; els.customRow.hidden = cfg.subdiv.id !== 'custom';
    els.follow.set(cfg.followBeatMute);
    els.swing.value = cfg.swing.amount;
    els.swingVal.textContent = (+cfg.swing.amount.toFixed(1)) + '%';
    els.swingBtns.forEach((b) => b.setAttribute('aria-pressed', String(Math.abs(RT.events.SWING_PRESETS[b.dataset.id] - cfg.swing.amount) < 0.05)));
    els.swingBox.hidden = RT.events.subCount(cfg) < 2;
    els.voice.set(cfg.voice);
    els.vocalBox.hidden = !cfg.voice || !RT.syllables.GROUPINGS[cfg.num];
    els.groupIn.value = cfg.vocal.grouping;
    els.groups.replaceChildren(...[''].concat(RT.syllables.GROUPINGS[cfg.num] || []).map((g) => h('button', { class: 'pill sm', 'aria-pressed': String(cfg.vocal.grouping === g), onclick: () => setGrouping(g) }, g || 'Không chia nhóm')));
    els.formNote.hidden = !cfg.form.on;
    drawBeats();
  }

  function drawBeats() {
    const LABEL = { 2: 'phách mạnh', 1: 'phách thường', 0: 'tắt tiếng' };
    els.beats.style.setProperty('--n', cfg.levels.length);
    els.beats.replaceChildren(...cfg.levels.map((lv, i) => h('button', { class: 'beat l' + lv, 'aria-label': 'Phách ' + (i + 1) + ', ' + LABEL[lv] + '. Chạm để đổi', onclick: () => { cfg.levels[i] = NEXT_LEVEL[cfg.levels[i]]; RT.state.changed('levels'); } },
      h('span', { class: 'n' }, i + 1))));
    const n = RT.events.subCount(cfg);
    els.dots.replaceChildren(...(n < 2 ? [] : Array.from({ length: n }, (_, k) => h(k === 0 ? 'span' : 'button', { class: 'sd' + (k && cfg.subMask[k] === false ? ' off' : ''), 'aria-label': 'Nốt chia ' + (k + 1),
      onclick: k ? () => { cfg.subMask[k] = cfg.subMask[k] === false; RT.state.changed('subMask'); } : null }))));
    els.cur = null; els.curDot = null;
  }

  function clearCur() {
    if (els.cur) els.cur.classList.remove('cur', 'quiet');
    if (els.curDot) els.curDot.classList.remove('cur', 'quiet');
    els.cur = els.curDot = null;
  }

  function onDraw(ev) {
    if (RT.state.tab !== 'pulse' || RT.engine.cfg !== cfg) return;
    if (ev.kind === 'beat' && !cfg.form.on) {
      if (els.cur) els.cur.classList.remove('cur', 'quiet');
      els.cur = els.beats.children[ev.beat] || null;
      if (els.cur) { els.cur.classList.add('cur'); els.cur.classList.toggle('quiet', !ev.played); }
    }
    const d = els.dots.children[ev.sub];
    if (d) {
      if (els.curDot) els.curDot.classList.remove('cur', 'quiet');
      els.curDot = d; d.classList.add('cur'); d.classList.toggle('quiet', !ev.played);
    }
  }

  RT.tabs = RT.tabs || {};
  RT.tabs.pulse = { init };
})();
