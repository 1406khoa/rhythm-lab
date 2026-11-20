/* Metronome tab: a big stage (pads or a visualisation) holding the controls (Gõ · Start · Đếm số) and the setting chips,
 * then the tempo (steps around an editable number) under it. */
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
  let editing = null; // 'sig' | 'subN' | 'swing': its inline editor shows only while being edited, the chip shows the value otherwise

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
  // option: full text (shown in the menu) + optional short label (shown on the closed chip, keeps the row to one line)
  const opt = (value, text, short) => h('option', { value, label: short }, text);
  const select = (aria, options, onChange) => { const el = h('select', { class: 'sel', 'aria-label': aria }, options.map(([v, l, sh]) => opt(v, l, sh))); el.addEventListener('change', () => onChange(el.value)); return el; };

  function init(root) {
    // ---- stage: the big display (pads or a visualisation), display switch in the corner
    els.modeBtn = h('button', { class: 'mode-btn', onclick: cycleMode });
    els.canvas = h('canvas', { class: 'viz', 'aria-hidden': 'true' });
    els.beats = h('div', { class: 'pads' });
    els.polyPads = h('div', { class: 'pads poly-pads', hidden: true });
    els.dots = h('div', { class: 'dots' });
    els.blindNote = h('div', { class: 'blind-note', 'aria-live': 'polite' }, h('span', { class: 'eye', 'aria-hidden': 'true' }), 'Tự đếm tiếp…');
    els.blindNote.firstChild.innerHTML = '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
    // practice chip, first in the settings row: opens the practice panel and says what is switched on
    els.practice = h('button', { class: 'practice-chip', 'aria-expanded': 'false', onclick: () => RT.practice.toggle() }, h('span', { class: 'pi', 'aria-hidden': 'true' }), els.practiceText = h('span', {}));
    els.practice.firstChild.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>';
    RT.bus.on('sheet', (o) => els.practice.setAttribute('aria-expanded', String(o)));
    const stage = els.stage = h('div', { class: 'stage' }, els.blindNote, els.modeBtn, els.canvas, els.beats, els.polyPads, els.dots);

    // ---- transport: tempo steps around an editable number, then start
    els.bpm = h('input', { class: 'bpm-num', type: 'number', min: 1, max: 500, inputmode: 'numeric', 'aria-label': 'Nhịp độ (BPM), chạm để nhập', 'data-tip': 'Chạm để nhập BPM' });
    els.bpm.addEventListener('change', () => RT.state.setBpm(Number(els.bpm.value) || 60));
    els.bpm.addEventListener('focus', () => els.bpm.select());
    els.bpm.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.bpm.blur(); });
    els.name = h('span', {});
    const step = (d) => h('button', { class: 'step', 'aria-label': (d > 0 ? 'Tăng ' : 'Giảm ') + Math.abs(d) + ' BPM', onclick: () => RT.state.setBpm(cfg.bpm + d) }, (d > 0 ? '+' : '−') + Math.abs(d));
    const tempo = h('div', { class: 'tempo' }, step(-5), step(-2), step(-1),
      h('label', { class: 'bpm-c' }, els.bpm, h('span', { class: 'tempo-meta' }, h('b', {}, 'BPM'), els.name)), step(1), step(2), step(5));
    // round controls: tap tempo · start (largest) · count out loud
    const tap = h('button', { class: 'btn tap', onclick: tapTempo, 'aria-label': 'Gõ để lấy nhịp độ', 'data-tip': 'Gõ vài lần theo nhịp để lấy BPM' });
    tap.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 9.5V4a2 2 0 0 0-4 0v10"/><path d="M14 10V9a2 2 0 0 0-4 0v1"/><path d="M18 11v-1a2 2 0 0 0-4 0"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-6-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>';
    const run = h('div', { class: 'run-row' }, tap, ui.runButton('', 'Space'));
    els.run = run;
    const transport = h('div', { class: 'transport' }, tempo);

    // ---- settings: value chips on the stage's bottom edge; each shows what is set, tap to change (native menus)
    els.sig = select('Số chỉ nhịp', SIGS.map((x) => [x, x]).concat([['other', 'Khác…']]), (v) => {
      if (v === 'other') { edit('sig'); return; }
      const [n, d] = v.split('/').map(Number); RT.state.setSignature(n, d);
    });
    els.cNum = h('input', { class: 'num', type: 'number', min: 1, max: 32, 'aria-label': 'Số phách mỗi ô nhịp' });
    els.cNum.addEventListener('change', () => RT.state.setSignature(Number(els.cNum.value) || 4, cfg.den));
    els.cDen = h('select', { class: 'sel sm', 'aria-label': 'Giá trị nốt' }, [2, 4, 8, 16].map((d) => opt(d, d)));
    els.cDen.addEventListener('change', () => RT.state.setSignature(cfg.num, Number(els.cDen.value)));
    els.custom = h('span', { class: 'custom-sig' }, els.cNum, h('span', { class: 'slash' }, '/'), ui.dropdown(els.cDen));

    els.sub = select('Chia phách', SUBS.map(([id, ic, label]) => [id, ic + ' ' + label, id === 'custom' ? 'Chia n' : ic]), setSub);
    els.customN = h('input', { class: 'num', type: 'number', min: 2, max: 16, 'aria-label': 'Số nốt mỗi phách' });
    els.customN.addEventListener('change', () => { cfg.subdiv.n = clamp(Number(els.customN.value) || 5, 2, 16); RT.state.changed('subdiv'); });

    els.swingSel = select('Kiểu swing', SWINGS.concat([['custom', 'Tùy chỉnh']]).map(([v, l]) => [v, l, v === 'straight' ? 'Swing đều' : v === 'custom' ? 'Swing' : 'Swing ' + Math.round(RT.events.SWING_PRESETS[v]) + '%']), (v) => { if (v !== 'custom') { cfg.swing.amount = RT.events.SWING_PRESETS[v]; RT.state.changed('swing'); } else edit('swing'); });
    els.swing = ui.range(50, 75, cfg.swing.amount, (v) => { cfg.swing.amount = v; RT.state.changed('swing'); }, 0.1);
    els.swing.setAttribute('aria-label', 'Mức swing');
    els.swingVal = h('b', { class: 'sw-val' });

    els.swingBox = h('span', { class: 'chip-extra' }, els.swing, els.swingVal);
    els.follow = h('button', { class: 'chip-tg', 'aria-pressed': 'false', 'data-tip': 'Phách bị tắt thì các nốt chia của nó cũng tắt',
      onclick: () => { cfg.followBeatMute = !cfg.followBeatMute; RT.state.changed('follow'); } }, 'Câm theo phách');
    // count-out-loud: a round toggle right of Start
    els.voice = h('button', { class: 'btn voice-btn', 'aria-pressed': String(!!cfg.voice), 'aria-label': 'Đếm số', 'data-tip': 'Đếm số: giọng đọc 1 2 3 4 trên mỗi phách',
      onclick: () => {
        cfg.voice = !cfg.voice; RT.state.changed('voice');
        RT.voices.ready.then(() => { // a browser that cannot decode the samples must say so, not stay silent
          if (cfg.voice && !RT.voices.hasVocal()) ui.toast('Máy này không phát được giọng đếm, chỉ có tiếng click', 'err');
          else ui.toast(cfg.voice ? 'Đã bật đếm số' : 'Đã tắt đếm số');
        });
      } },
      h('span', { class: 'vi', 'aria-hidden': 'true' }));
    els.voice.querySelector('.vi').innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
    els.voice.set = (v) => els.voice.setAttribute('aria-pressed', String(!!v));
    // everything about counting out loud sits in one strip under the tempo bar, shown while "Đếm số" is on
    els.countOpts = h('div', { class: 'count-opts', role: 'radiogroup', 'aria-label': 'Cách đếm' });
    els.countAccent = ui.toggle(cfg.vocal.accent, (v) => { cfg.vocal.accent = v; applyGroupAccents(); RT.state.changed('grouping'); }, 'Nhấn phách đầu nhóm');
    els.accentRow = h('label', { class: 'count-accent' }, els.countAccent, h('span', {}, 'Nhấn phách đầu nhóm'));
    els.countStrip = h('div', { class: 'count-strip', hidden: true }, h('span', { class: 'count-title' }, 'Cách đếm'), els.countOpts, els.accentRow);
    els.run.append(els.voice);

    els.polySel = h('select', { class: 'sel', 'aria-label': 'Đa nhịp (độc lập chi)' });
    els.polySel.addEventListener('change', () => {
      const v = els.polySel.value;
      cfg.poly.on = v !== 'off';
      if (cfg.poly.on) cfg.poly.m = Number(v);
      RT.state.changed('poly');
    });
    els.listen = select('Nghe lớp nào', [['both', 'Nghe cả hai lớp', 'Nghe 2 lớp'], ['main', 'Chỉ nghe lớp chính', 'Nghe chính'], ['poly', 'Chỉ nghe lớp phụ', 'Nghe phụ']], (v) => { cfg.poly.listen = v; RT.state.changed('poly'); });
    els.polySub = select('Chia lớp phụ', [[1, '♩ Lớp phụ không chia', '♩'], [2, '♪♪ Lớp phụ chia 2', '♪♪'], [3, '♪♪♪ Lớp phụ chia 3', '♪♪♪'], [4, '♬♬ Lớp phụ chia 4', '♬♬'], [6, '♬♬♬ Lớp phụ chia 6', '♬♬♬']], (v) => { cfg.poly.n = Number(v); RT.state.changed('poly'); });
    // one control row in the stage: setting chips left · Gõ ▶ Đếm số in the middle · setting chips right
    const chips = (cls, list) => h('div', { class: 'chips ' + cls }, ...list.map((el) => (el.tagName === 'SELECT' ? ui.dropdown(el) : el)));
    const left = chips('left', [els.practice, els.sig, els.custom, els.sub, els.customN, els.swingSel, els.swingBox]);
    const right = chips('right', [els.follow, els.polySel, els.polySub, els.listen]), rightItems = [...right.children];
    els.bar = h('div', { class: 'ctl-bar' }, left, els.run, right);
    stage.append(els.bar);
    // wide screens: chips left · controls · chips right. Narrow: controls on top, ALL chips in one line under them
    const wide = matchMedia('(min-width: 1100px)');
    const arrange = () => { rightItems.forEach((el) => (wide.matches ? right : left).append(el)); if (els.fades) els.fades(); };
    wide.addEventListener('change', arrange); arrange();
    document.addEventListener('pointerdown', (e) => {
      if (!editing || e.target.closest('.custom-sig, .chips .num, .chip-extra, .dd, .menu')) return;
      editing = null; refresh();
    }, true);
    // fade the edge(s) of a chip group only where it actually has more to scroll to
    const fades = () => els.bar.querySelectorAll('.chips').forEach((c) => {
      const max = c.scrollWidth - c.clientWidth;
      c.classList.toggle('fade-l', max > 1 && c.scrollLeft > 1); c.classList.toggle('fade-r', max > 1 && c.scrollLeft < max - 1);
    });
    els.bar.querySelectorAll('.chips').forEach((c) => c.addEventListener('scroll', fades, { passive: true }));
    if (window.ResizeObserver) new ResizeObserver(fades).observe(els.bar);
    els.fades = fades;

    const chHolder = h('div', { class: 'ch-holder' });
    root.append(h('div', { class: 'metro' }, stage, transport, els.countStrip, chHolder));
    RT.challenge.mount(chHolder);
    RT.viz.attach(els.canvas);
    refresh();
    RT.bus.on('cfg', refresh);
    RT.engine.on('draw', onDraw);
    RT.engine.on('state', (r) => { if (!r) { clearCur(); els.stage.classList.remove('blind'); } });
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
    if (id === 'custom') editing = 'subN';
    RT.state.changed('subdiv');
  }
  function edit(what) { editing = what; refresh(); const f = { sig: els.cNum, subN: els.customN, swing: els.swing }[what]; if (f) f.focus(); }

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
    els.name.textContent = RT.util.tempoName(cfg.bpm);
    const sum = RT.practice.summary();
    const nOn = sum ? sum.split(' · ').length : 0;
    els.practiceText.textContent = nOn ? 'Luyện tập · ' + nOn : 'Luyện tập'; // details in the tooltip, keeps the row short
    els.practice.classList.toggle('active', !!sum);
    els.practice.dataset.tip = sum ? 'Luyện tập: ' + sum : 'Mở cài đặt luyện tập';
    const sig = cfg.num + '/' + cfg.den, preset = SIGS.includes(sig);
    els.sig.value = preset ? sig : 'other';
    els.custom.hidden = editing !== 'sig'; els.cNum.value = cfg.num; els.cDen.value = cfg.den;
    els.sig.querySelector('[value=other]').label = preset ? 'Khác…' : sig;
    els.sub.value = cfg.subdiv.id;
    els.customN.value = cfg.subdiv.n; els.customN.hidden = cfg.subdiv.id !== 'custom' || editing !== 'subN';
    els.sub.querySelector('[value=custom]').label = cfg.subdiv.id === 'custom' ? 'Chia ' + cfg.subdiv.n : 'Chia n';
    const swingId = Object.keys(RT.events.SWING_PRESETS).find((k) => Math.abs(RT.events.SWING_PRESETS[k] - cfg.swing.amount) < 0.05);
    els.swingSel.value = editing === 'swing' || !swingId ? 'custom' : swingId;
    els.swingSel.querySelector('[value=custom]').label = 'Swing ' + Math.round(cfg.swing.amount) + '%';
    els.swing.value = cfg.swing.amount;
    els.swingVal.textContent = (+cfg.swing.amount.toFixed(1)) + '%';
    const canSwing = RT.events.subCount(cfg) >= 2;
    // swing and follow-mute only mean something with a subdivision: hidden until then
    els.swingSel.hidden = els.follow.hidden = !canSwing;
    els.swingBox.hidden = !canSwing || editing !== 'swing';
    els.follow.setAttribute('aria-pressed', String(!!cfg.followBeatMute));
    els.voice.set(cfg.voice);
    const groups = RT.syllables.GROUPINGS[cfg.num] || [];
    const current = groups.includes(cfg.vocal.grouping) ? cfg.vocal.grouping : '';
    els.countStrip.hidden = !cfg.voice || groups.length === 0; // only when there is a grouping to choose (5+ beats)
    els.countOpts.replaceChildren(...[''].concat(groups).map((g) => h('button', { class: 'count-opt', role: 'radio', 'aria-checked': String(g === current), 'data-g': g,
      onclick: () => pickCount(g) }, spoken(g, Math.min(cfg.num, 12)))));
    els.countAccent.set(cfg.vocal.accent);
    els.polySub.hidden = els.listen.hidden = !cfg.poly.on;
    if (cfg.poly.on && !polyValid(cfg.poly.m, cfg.num)) { cfg.poly.m = defaultPoly(cfg.num); RT.state.save(); } // meter changed: pick a real cross-rhythm
    const choices = polyChoices(cfg.num);
    if (!choices.some(([m]) => m === cfg.poly.m)) choices.push([cfg.poly.m, cfg.poly.m + ' nốt trên ' + cfg.num + ' phách']); // e.g. from a shared link
    els.polySel.replaceChildren(opt('off', 'Tắt', 'Đa nhịp: tắt'), ...choices.map(([v, l]) => opt(v, l, 'Đa nhịp ' + v + ':' + cfg.num)));
    els.polySel.value = cfg.poly.on ? String(cfg.poly.m) : 'off'; els.polySub.value = String(cfg.poly.n || 1); els.listen.value = cfg.poly.listen;
    const mode = RT.viz.MODES.find(([id]) => id === cfg.viz) || RT.viz.MODES[0];
    els.modeBtn.innerHTML = icon(mode[0]);
    els.modeBtn.setAttribute('aria-label', 'Kiểu hiển thị: ' + mode[1] + '. Chạm để đổi');
    els.modeBtn.dataset.tip = 'Kiểu hiển thị: ' + mode[1];
    els.canvas.hidden = cfg.viz === 'pads';
    els.beats.classList.toggle('compact', cfg.viz !== 'pads');
    drawBeats();
    RT.viz.redraw();
    requestAnimationFrame(els.fades);
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
        h('span', { class: 'fill' }))));
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
    els.polyPads.replaceChildren(...(showPoly ? Array.from({ length: m }, (_, j) => h('div', { class: 'beat p' + (j === 0 ? ' l2' : ''), 'aria-hidden': 'true' }, h('span', { class: 'fill' }))) : []));
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
    if (ev.kind === 'beat') { // gap / random silence: hide the display so the player has to keep counting
      const blind = RT.events.isBlind(ev);
      els.stage.classList.toggle('blind', blind);
      if (blind) { clearCur(); return; }
    }
    if (els.stage.classList.contains('blind')) return; // subs / poly inside a blind beat stay hidden too
    if (ev.kind === 'poly') {
      if (els.curPoly) els.curPoly.classList.remove('cur');
      els.curPoly = els.polyPads.children[ev.pulse] || null;
      if (els.curPoly && ev.played) els.curPoly.classList.add('cur');
      return;
    }
    if (ev.kind === 'beat') {
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
