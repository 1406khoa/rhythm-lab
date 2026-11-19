/* Metronome tab: a big stage (pads or a visualisation) on top, a tempo bar, then one compact settings grid. */
(function () {
  const RT = (window.RT = window.RT || {});
  const { h, clamp } = Object.assign({}, RT.util);
  const { cfg } = RT.state;
  const ui = RT.ui;

  const SIGS = ['2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '5/8', '6/8', '7/8', '9/8', '12/8', '3/16', '5/16', '7/16'];
  const SUBS = [['none', '♩', 'Nốt đen'], ['duplet', '♪♪', 'Móc đơn'], ['triplet', '♪♪♪', 'Liên ba'], ['quadruplet', '♬♬', 'Móc kép'], ['sextuplet', '♬♬♬', 'Liên sáu'], ['custom', 'n', 'Tùy chỉnh']];
  const SWINGS = [['straight', 'Đều'], ['septuplet', 'Liên bảy'], ['quintuplet', 'Liên năm'], ['triplet', 'Liên ba'], ['dotted', 'Chấm dôi']];
  // tap a pad to step it down: accent -> normal -> soft -> muted -> back to accent
  const NEXT_LEVEL = { 2: 1, 1: 0.5, 0.5: 0, 0: 2 };
  const LV_CLASS = { 2: 'l2', 1: 'l1', 0.5: 'ls', 0: 'l0' };

  const taps = [];
  let els = {};

  // second-layer choices follow the meter. Counts that divide (or are multiples of) the beats are plain subdivisions
  // (2 over 4 = half notes), not cross-rhythms, so they are left out. Labels in words, no ratios.
  const polyValid = (m, num) => m !== num && num % m !== 0 && m % num !== 0;
  const polyChoices = (num) => Array.from({ length: 11 }, (_, i) => i + 2).filter((m) => polyValid(m, num)).map((m) => [m, m + ' nốt trên ' + num + ' phách']);
  const defaultPoly = (num) => [3, 2, 4, 5, 7, 8, 9].find((m) => polyValid(m, num)) || 3;
  const ICONS = { // 24px line icons for the display-mode switch
    pads: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    polygon: '<path d="M12 3 21 9.5 17.5 20h-11L3 9.5Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 12 17 8"/>',
    ball: '<circle cx="12" cy="7" r="3.5"/><path d="M3 20h18"/>',
    pendulum: '<path d="M5 20h14M12 19 16 5"/><path d="M6 8a9 9 0 0 1 12 0"/>',
    lane: '<path d="M7 4v16M11 8h9M11 12h6M11 16h9"/>',
  };
  const icon = (id) => '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[id] + '</svg>';
  const opt = (value, label) => h('option', { value }, label);
  const field = (label, ...controls) => h('div', { class: 'field' }, h('span', { class: 'fl' }, label), h('div', { class: 'fc' }, ...controls));
  const select = (aria, options, onChange) => { const el = h('select', { class: 'sel', 'aria-label': aria }, options.map(([v, l]) => opt(v, l))); el.addEventListener('change', () => onChange(el.value)); return el; };

  function init(root) {
    // ---- stage: the big display (pads or a visualisation), display switch in the corner
    els.modeBtn = h('button', { class: 'mode-btn', onclick: cycleMode });
    els.canvas = h('canvas', { class: 'viz', 'aria-hidden': 'true' });
    els.beats = h('div', { class: 'pads' });
    els.polyPads = h('div', { class: 'pads poly-pads', hidden: true });
    els.dots = h('div', { class: 'dots' });
    els.formNote = h('p', { class: 'banner', hidden: true }, 'Đang chơi theo cấu trúc ở tab Cấu trúc.');
    const stage = h('div', { class: 'stage' }, els.modeBtn, els.canvas, els.beats, els.polyPads, els.dots, els.formNote);

    // ---- transport: tempo + start
    els.bpm = h('input', { class: 'bpm-num', type: 'number', min: 1, max: 500, inputmode: 'numeric', 'aria-label': 'Nhịp độ (BPM)' });
    els.bpm.addEventListener('change', () => RT.state.setBpm(Number(els.bpm.value) || 60));
    els.name = h('span', {});
    els.meter = h('span', {});
    els.slider = ui.range(1, 500, cfg.bpm, (v) => RT.state.setBpm(v));
    els.slider.setAttribute('aria-label', 'Nhịp độ');
    const step = (d) => h('button', { class: 'step', 'aria-label': (d > 0 ? 'Tăng ' : 'Giảm ') + Math.abs(d) + ' BPM', onclick: () => RT.state.setBpm(cfg.bpm + d) }, (d > 0 ? '+' : '−') + (Math.abs(d) === 1 ? '' : Math.abs(d)));
    const tempo = h('div', { class: 'tempo' }, step(-5), step(-1), h('div', { class: 'bpm-c' }, els.bpm, h('div', { class: 'tempo-meta' }, els.name, els.meter)), step(1), step(5));
    const run = h('div', { class: 'run-row' }, h('button', { class: 'btn tap', onclick: tapTempo, 'aria-label': 'Gõ để lấy nhịp độ' }, 'Gõ'), ui.runButton(), h('kbd', {}, 'Space'));
    els.run = run;
    const transport = h('div', { class: 'transport' }, tempo, h('div', { class: 'slider-c' }, els.slider), run);

    // ---- settings: one compact grid of dropdowns and switches
    els.sig = select('Số chỉ nhịp', SIGS.map((x) => [x, x]).concat([['other', 'Khác…']]), (v) => {
      if (v === 'other') { els.custom.hidden = false; return; }
      const [n, d] = v.split('/').map(Number); RT.state.setSignature(n, d);
    });
    els.cNum = h('input', { class: 'num', type: 'number', min: 1, max: 32, 'aria-label': 'Số phách mỗi ô nhịp' });
    els.cNum.addEventListener('change', () => RT.state.setSignature(Number(els.cNum.value) || 4, cfg.den));
    els.cDen = h('select', { class: 'sel sm', 'aria-label': 'Giá trị nốt' }, [2, 4, 8, 16].map((d) => opt(d, d)));
    els.cDen.addEventListener('change', () => RT.state.setSignature(cfg.num, Number(els.cDen.value)));
    els.custom = h('span', { class: 'custom-sig' }, els.cNum, h('span', { class: 'slash' }, '/'), els.cDen);

    els.sub = select('Chia phách', SUBS.map(([id, ic, label]) => [id, ic + '  ' + label]), setSub);
    els.customN = h('input', { class: 'num', type: 'number', min: 2, max: 16, 'aria-label': 'Số nốt mỗi phách' });
    els.customN.addEventListener('change', () => { cfg.subdiv.n = clamp(Number(els.customN.value) || 5, 2, 16); RT.state.changed('subdiv'); });

    els.swingSel = select('Kiểu swing', SWINGS.concat([['custom', 'Tùy chỉnh']]), (v) => { if (v !== 'custom') { cfg.swing.amount = RT.events.SWING_PRESETS[v]; RT.state.changed('swing'); } });
    els.swing = ui.range(50, 75, cfg.swing.amount, (v) => { cfg.swing.amount = v; RT.state.changed('swing'); }, 0.1);
    els.swing.setAttribute('aria-label', 'Mức swing');
    els.swingVal = h('b', { class: 'sw-val' });

    els.follow = ui.toggle(cfg.followBeatMute, (v) => { cfg.followBeatMute = v; RT.state.changed('follow'); }, 'Câm theo phách');
    // count-out-loud lives on the transport bar, next to Start, as a big labelled toggle
    els.voice = h('button', { class: 'btn voice-btn', 'aria-pressed': String(!!cfg.voice), title: 'Giọng đọc 1 2 3 4 trên mỗi phách, chồng lên tiếng click',
      onclick: () => { cfg.voice = !cfg.voice; RT.state.changed('voice'); } },
      h('span', { class: 'vi', 'aria-hidden': 'true' }), 'Đếm số');
    els.voice.querySelector('.vi').innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
    els.voice.set = (v) => els.voice.setAttribute('aria-pressed', String(!!v));
    // everything about counting out loud sits in one strip under the tempo bar, shown while "Đếm số" is on
    els.countOpts = h('div', { class: 'count-opts', role: 'radiogroup', 'aria-label': 'Cách đếm' });
    els.countAccent = ui.toggle(cfg.vocal.accent, (v) => { cfg.vocal.accent = v; applyGroupAccents(); RT.state.changed('grouping'); }, 'Nhấn phách đầu nhóm');
    els.accentRow = h('label', { class: 'count-accent' }, els.countAccent, h('span', {}, 'Nhấn phách đầu nhóm'));
    els.countHint = h('small', { class: 'count-hint' });
    els.countStrip = h('div', { class: 'count-strip', hidden: true }, h('span', { class: 'count-title' }, 'Cách đếm'), els.countOpts, els.countHint, els.accentRow);
    els.run.insertBefore(els.voice, els.run.children[1]);

    els.polyOn = ui.toggle(cfg.poly.on, (v) => {
      cfg.poly.on = v;
      if (v && !polyValid(cfg.poly.m, cfg.num)) cfg.poly.m = defaultPoly(cfg.num);
      RT.state.changed('poly');
    }, 'Đa nhịp');
    els.polySel = h('select', { class: 'sel', 'aria-label': 'Tỉ lệ đa nhịp' });
    els.polySel.addEventListener('change', () => { cfg.poly.m = Number(els.polySel.value); RT.state.changed('poly'); });
    els.listen = select('Nghe lớp nào', [['both', 'Cả hai lớp'], ['main', 'Lớp chính'], ['poly', 'Lớp phụ']], (v) => { cfg.poly.listen = v; RT.state.changed('poly'); });
    els.polySub = select('Chia lớp phụ', [[1, '♩ Không chia'], [2, '♪♪ Chia 2'], [3, '♪♪♪ Chia 3'], [4, '♬♬ Chia 4'], [6, '♬♬♬ Chia 6']], (v) => { cfg.poly.n = Number(v); RT.state.changed('poly'); });
    els.polyBox = h('span', { class: 'fc-sub poly-box' }, els.polySel, els.polySub, els.listen);

    els.swingField = field('Swing', els.swingSel, els.swing, els.swingVal);
    const settings = h('div', { class: 'settings' },
      field('Số chỉ nhịp', els.sig, els.custom),
      field('Chia phách', els.sub, els.customN),
      els.swingField,
      field('Câm theo phách', els.follow),
      Object.assign(field('Đa nhịp (độc lập chi)', els.polyOn, els.polyBox), { className: 'field poly-field' }),
      h('div', { class: 'field links' },
        h('button', { class: 'btn ghost', onclick: () => copy(RT.state.pulseLink(), 'Đã sao chép liên kết') }, 'Sao chép liên kết'),
        h('button', { class: 'btn ghost', onclick: () => { RT.state.resetPulse(); ui.toast('Đã đặt lại'); } }, 'Đặt lại')));

    root.append(h('div', { class: 'metro' }, stage, transport, els.countStrip, settings));
    RT.viz.attach(els.canvas);
    refresh();
    RT.bus.on('cfg', refresh);
    RT.engine.on('draw', onDraw);
    RT.engine.on('state', (r) => { if (!r) clearCur(); });
  }

  function cycleMode() {
    const ids = RT.viz.MODES.map(([id]) => id), next = ids[(ids.indexOf(cfg.viz) + 1) % ids.length];
    cfg.viz = next; RT.state.changed('viz');
    ui.toast(RT.viz.MODES.find(([id]) => id === next)[1]);
  }

  function setSub(id) {
    cfg.subdiv.id = id;
    if (id !== 'custom') cfg.subdiv.n = RT.events.SUBDIVS[id];
    else if (!(cfg.subdiv.n >= 2)) cfg.subdiv.n = 5;
    cfg.subMask = [];
    RT.state.changed('subdiv');
  }

  // what the voice will say for a grouping, e.g. '2+2+3' -> '1 2 · 1 2 · 1 2 3'
  function spoken(grouping, num) {
    const g = RT.syllables.parseGrouping(grouping, num) || [num];
    return g.map((size) => Array.from({ length: size }, (_, i) => i + 1).join(' ')).join(' · ');
  }
  // stress the first beat of every group (or just beat 1 without a grouping); muted beats stay muted
  function applyGroupAccents() {
    if (!cfg.vocal.accent) return;
    const starts = RT.syllables.groupStarts(cfg.vocal.grouping, cfg.num) || [0];
    cfg.levels = cfg.levels.map((lv, i) => (lv === 0 ? 0 : starts.includes(i) ? 2 : 1));
  }
  function pickCount(g) {
    cfg.vocal.grouping = g; applyGroupAccents(); RT.state.changed('grouping');
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
    const sig = cfg.num + '/' + cfg.den, preset = SIGS.includes(sig);
    els.sig.value = preset ? sig : 'other';
    els.custom.hidden = preset; els.cNum.value = cfg.num; els.cDen.value = cfg.den;
    els.sub.value = cfg.subdiv.id;
    els.customN.value = cfg.subdiv.n; els.customN.hidden = cfg.subdiv.id !== 'custom';
    const swingId = Object.keys(RT.events.SWING_PRESETS).find((k) => Math.abs(RT.events.SWING_PRESETS[k] - cfg.swing.amount) < 0.05);
    els.swingSel.value = swingId || 'custom';
    els.swing.value = cfg.swing.amount;
    els.swingVal.textContent = (+cfg.swing.amount.toFixed(1)) + '%';
    const canSwing = RT.events.subCount(cfg) >= 2;
    els.swingSel.disabled = els.swing.disabled = !canSwing;
    els.swingField.classList.toggle('off', !canSwing);
    els.swingField.title = canSwing ? '' : 'Chọn chia phách (ví dụ Móc đơn) để dùng swing';
    els.follow.set(cfg.followBeatMute);
    els.voice.set(cfg.voice);
    const groups = RT.syllables.GROUPINGS[cfg.num] || [];
    const current = groups.includes(cfg.vocal.grouping) ? cfg.vocal.grouping : '';
    els.countStrip.hidden = !cfg.voice;
    els.countOpts.replaceChildren(...[''].concat(groups).map((g) => h('button', { class: 'count-opt', role: 'radio', 'aria-checked': String(g === current), 'data-g': g,
      onclick: () => pickCount(g) }, spoken(g, Math.min(cfg.num, 12)))));
    els.countOpts.hidden = groups.length === 0;
    els.accentRow.hidden = groups.length === 0;
    els.countHint.textContent = groups.length ? '' : 'Giọng đọc ' + spoken('', Math.min(cfg.num, 12)) + ' trên mỗi ô nhịp. Nhịp từ 5 phách trở lên có thêm cách đếm theo nhóm.';
    els.countAccent.set(cfg.vocal.accent);
    els.polyOn.set(cfg.poly.on); els.polyBox.hidden = !cfg.poly.on;
    if (cfg.poly.on && !polyValid(cfg.poly.m, cfg.num)) { cfg.poly.m = defaultPoly(cfg.num); RT.state.save(); } // meter changed: pick a real cross-rhythm
    const choices = polyChoices(cfg.num);
    if (!choices.some(([m]) => m === cfg.poly.m)) choices.push([cfg.poly.m, cfg.poly.m + ' nốt trên ' + cfg.num + ' phách']); // e.g. from a shared link
    els.polySel.replaceChildren(...choices.map(([v, l]) => opt(v, l)));
    els.polySel.value = String(cfg.poly.m); els.polySub.value = String(cfg.poly.n || 1); els.listen.value = cfg.poly.listen;
    els.formNote.hidden = !cfg.form.on;
    const mode = RT.viz.MODES.find(([id]) => id === cfg.viz) || RT.viz.MODES[0];
    els.modeBtn.innerHTML = icon(mode[0]);
    els.modeBtn.setAttribute('aria-label', 'Kiểu hiển thị: ' + mode[1] + '. Chạm để đổi');
    els.modeBtn.title = 'Kiểu hiển thị: ' + mode[1];
    els.canvas.hidden = cfg.viz === 'pads';
    els.beats.classList.toggle('compact', cfg.viz !== 'pads');
    drawBeats();
    RT.viz.redraw();
  }

  function drawBeats() {
    const LABEL = { 2: 'phách mạnh', 1: 'phách thường', 0.5: 'phách nhẹ', 0: 'tắt tiếng' };
    els.beats.style.setProperty('--n', cfg.levels.length);
    const gStarts = cfg.voice ? RT.syllables.groupStarts(cfg.vocal.grouping, cfg.num) || [] : [];
    const cls = (i) => 'beat ' + (LV_CLASS[cfg.levels[i]] || 'l1') + (i > 0 && gStarts.includes(i) ? ' gs' : '');
    const label = (i) => 'Phách ' + (i + 1) + ', ' + (LABEL[cfg.levels[i]] || LABEL[1]) + '. Chạm để giảm';
    if (els.beats.children.length !== cfg.levels.length) {
      els.beats.replaceChildren(...cfg.levels.map((_, i) => h('button', { class: cls(i), 'aria-label': label(i),
        onclick: () => { cfg.levels[i] = NEXT_LEVEL[cfg.levels[i]] ?? 2; RT.state.changed('levels'); } },
        h('span', { class: 'fill' }), h('span', { class: 'n' }, i + 1))));
    } else { // same pads: update in place so the height change animates
      [...els.beats.children].forEach((b, i) => {
        const keep = ['cur', 'quiet'].filter((c) => b.classList.contains(c));
        b.className = cls(i); keep.forEach((c) => b.classList.add(c)); b.setAttribute('aria-label', label(i));
      });
    }
    const n = RT.events.subCount(cfg);
    els.dots.replaceChildren(...(n < 2 ? [] : Array.from({ length: n }, (_, k) => h(k === 0 ? 'span' : 'button', { class: 'sd' + (k && cfg.subMask[k] === false ? ' off' : ''), 'aria-label': 'Nốt chia ' + (k + 1),
      onclick: k ? () => { cfg.subMask[k] = cfg.subMask[k] === false; RT.state.changed('subMask'); } : null }))));
    // second layer of pads (red) for polyrhythm, in the pads display
    const showPoly = cfg.poly.on && cfg.viz === 'pads', m = clamp(cfg.poly.m | 0, 2, 16);
    els.polyPads.hidden = !showPoly;
    els.polyPads.style.setProperty('--n', m);
    els.polyPads.replaceChildren(...(showPoly ? Array.from({ length: m }, (_, j) => h('div', { class: 'beat p' + (j === 0 ? ' l2' : ''), 'aria-hidden': 'true' }, h('span', { class: 'n' }, j + 1))) : []));
    els.curDot = null; els.curPoly = null;
  }

  function clearCur() {
    if (els.curPoly) els.curPoly.classList.remove('cur');
    els.curPoly = null;
    if (els.cur) els.cur.classList.remove('cur', 'quiet');
    if (els.curDot) els.curDot.classList.remove('cur', 'quiet');
    els.cur = els.curDot = null;
  }

  function onDraw(ev) {
    if (RT.state.tab !== 'pulse' || RT.engine.cfg !== cfg) return;
    if (ev.kind === 'poly') {
      if (els.curPoly) els.curPoly.classList.remove('cur');
      els.curPoly = els.polyPads.children[ev.pulse] || null;
      if (els.curPoly && ev.played) els.curPoly.classList.add('cur');
      return;
    }
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
