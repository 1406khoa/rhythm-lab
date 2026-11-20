/* Test tab: the original "Precision Rhythm & Timing Analyzer" - 8-beat count-in, then 64 silent hits
 * recorded against the audio clock. Behaviour is unchanged; only the engine is shared now.
 * No chart / heavy work while recording - everything is computed after the last hit. */
(function () {
  const RT = (window.RT = window.RT || {});
  const { h, clamp } = RT.util;
  const T = (RT.test = { hits: 64, countIn: 8 });

  const cfg = Object.assign(RT.events.defaults(), { bpm: 60, test: { countIn: T.countIn, silent: true } });
  T.cfg = cfg;
  let state = 'idle'; // idle | countin | recording | completed
  let taps = [], grid = [], startT = 0, last = null;
  const $ = {};

  const HTML = `
  <div class="grid-test">
    <div class="stack">
      <div class="card">
        <div class="cap row">Thiết lập bài kiểm tra <span class="grow"></span><span class="mono dim">Nhịp 4/4</span></div>
        <div class="vrow"><label for="t-bpm" class="lbl">Nhịp độ (BPM)</label><input id="t-bpm" class="num wide" type="number" min="40" max="240" value="60"></div>
        <input id="t-slider" type="range" min="40" max="240" value="60" aria-label="Nhịp độ">
        <div class="pills" id="t-presets"></div>
        <div class="line"><div><b>Tắt click khi kiểm tra</b><small>Click chỉ có ở 8 phách đếm vào, sau đó bạn tự giữ nhịp</small></div><button id="t-silent" class="tg" role="switch" aria-checked="true" aria-label="Tắt click khi kiểm tra"></button></div>
        <div class="line"><div><b id="t-audio-label">Tiếng click đếm vào</b><small class="keys">Phím M</small></div><button id="t-audio" class="tg" role="switch" aria-checked="true" aria-label="Tiếng click đếm vào"></button></div>
        <div class="line"><span class="lbl">Vị trí</span><span id="t-beatctr" class="mono accent">Chưa bắt đầu</span></div>
        <div class="lights" id="t-lights"><i></i><i></i><i></i><i></i></div>
        <button id="t-start" class="start">▶ Bắt đầu kiểm tra</button>
        <button id="t-reset" class="btn">Làm lại</button>
      </div>
      <div class="card keys"><div class="cap">Phím tắt</div>
        <div class="line"><span>Gõ phách</span><kbd>Space</kbd></div>
        <div class="line"><span>Làm lại</span><kbd>R</kbd></div>
        <div class="line"><span>Bật/tắt tiếng click</span><kbd>M</kbd></div></div>
    </div>
    <div class="stack">
      <div id="t-arena" class="card arena" tabindex="0" role="button" aria-label="Vùng gõ phách">
        <div class="line"><span id="t-phase" class="dim">Sẵn sàng</span><b id="t-hits" class="mono accent">0/64 phách</b></div>
        <div class="bar-bg"><div id="t-progress"></div></div>
        <div id="t-big" class="big">–</div>
        <h2 id="t-instr">Chạm vào đây để bắt đầu</h2>
        <p id="t-sub" class="hint">8 phách đếm vào có click. Từ phách thứ 9 click tắt hẳn, bạn tự gõ đủ 64 phách theo đồng hồ nội tại.</p>
      </div>
      <div id="t-results" hidden>
        <div class="cap row">Kết quả <span class="grow"></span><b id="t-done" class="mono accent"></b></div>
        <div class="metrics" id="t-metrics"></div>
        <div class="card"><div class="cap">Bia bắn</div><small>Mỗi chấm là một cú gõ, đi theo chiều kim đồng hồ từ phách 1. Càng gần tâm càng đúng phách. Chấm đặc: trễ, chấm rỗng: sớm.</small><canvas id="t-target" class="target"></canvas></div>
        <div class="card"><div class="cap">Độ lệch từng phách so với phách chuẩn</div><small>Trong ±15 ms: đúng phách · ±15–35 ms: hơi sớm/trễ · ngoài ±35 ms: lệch rõ</small><div class="chart"><canvas id="t-c1"></canvas></div></div>
        <div class="card"><div class="cap">Khoảng cách giữa hai lần gõ liên tiếp</div><small>Đường đứt là khoảng cách chuẩn ở nhịp độ đã chọn</small><div class="chart"><canvas id="t-c2"></canvas></div></div>
        <div class="card"><div class="cap row">Dữ liệu cho AI phân tích <span class="grow"></span><button id="t-copy" class="btn sm">Sao chép</button></div>
          <textarea id="t-payload" readonly rows="8"></textarea></div>
      </div>
    </div>
  </div>`;
  const GRADE_VI = { 'Studio Pro (S)': 'S · Chuẩn phòng thu', 'Live Ready (A)': 'A · Đủ diễn live', 'Intermediate (B)': 'B · Khá', 'Amateur (C)': 'C · Cần luyện thêm' };

  function init(root) {
    root.innerHTML = HTML; // static template, no user input
    root.querySelectorAll('[id^="t-"]').forEach((e) => { $[e.id.slice(2)] = e; });
    [50, 60, 80, 100, 120].forEach((b) => $.presets.append(h('button', { class: 'pill sm', onclick: () => setBpm(b) }, b)));
    $.bpm.addEventListener('change', () => setBpm(Number($.bpm.value) || 60));
    $.slider.addEventListener('input', () => setBpm(Number($.slider.value)));
    $.silent.addEventListener('click', () => { const v = $.silent.getAttribute('aria-checked') !== 'true'; $.silent.setAttribute('aria-checked', String(v)); cfg.test.silent = v; });
    $.audio.addEventListener('click', toggleMute);
    $.start.addEventListener('click', () => (RT.engine.running ? stopRun() : startTest()));
    $.reset.addEventListener('click', reset);
    $.arena.addEventListener('click', hit);
    $.copy.addEventListener('click', () => ($.payload.value ? RT.copyText($.payload.value, 'Đã sao chép dữ liệu') : RT.ui.toast('Chưa có kết quả để sao chép', 'err')));
    RT.engine.on('schedule', onSchedule);
    RT.engine.on('draw', onDraw);
    RT.engine.on('state', (run) => { if (!run && RT.engine.cfg === cfg) { if (state !== 'completed') state = 'idle'; setStart(false); } });
    // the pictures are canvases: redraw them when the results change width (rotate, resize)
    if (window.ResizeObserver) new ResizeObserver(() => { if (last && !$.results.hidden) { drawTarget($.target, last.offsets); renderCharts(last); } }).observe($.results);
  }

  function setBpm(v) { cfg.bpm = clamp(Math.round(v), 40, 240); $.bpm.value = $.slider.value = cfg.bpm; }
  function toggleMute() {
    RT.engine.muted = !RT.engine.muted;
    $.audio.setAttribute('aria-checked', String(!RT.engine.muted));
    $['audio-label'].textContent = RT.engine.muted ? 'Đã tắt tiếng click' : 'Tiếng click đếm vào';
  }

  async function startTest() {
    taps = []; grid = []; last = null; state = 'countin';
    $.results.hidden = true;
    setStart(true);
    $.phase.textContent = 'Đếm vào (2 ô nhịp)';
    RT.log.note('test', { state: 'countin', bpm: cfg.bpm, silent: cfg.test.silent, hits: T.hits });
    await RT.engine.start(cfg);
  }
  function stopRun() { RT.engine.stop(); if (state !== 'completed') { state = 'idle'; } setStart(false); }
  function setStart(run) { $.start.textContent = run ? '■ Dừng' : '▶ Bắt đầu kiểm tra'; $.start.classList.toggle('running', run); }

  function onSchedule(ev, dur) {
    if (RT.engine.cfg !== cfg || state !== 'countin' || ev.kind !== 'beat' || ev.gIdx !== T.countIn) return;
    state = 'recording'; startT = ev.t;
    grid = Array.from({ length: T.hits }, (_, i) => startT + i * dur);
    RT.log.note('test', { state: 'recording', startT: +startT.toFixed(4), grid0: +grid[0].toFixed(4), gridN: +grid[T.hits - 1].toFixed(4) });
  }

  function onDraw(ev) {
    if (RT.engine.cfg !== cfg || RT.state.tab !== 'test' || ev.kind !== 'beat') return;
    const blind = RT.events.isBlind(ev); // silent test: lights and the bar/beat counter would give the timing away
    [...$.lights.children].forEach((l, i) => { l.className = !blind && i === ev.beat ? (ev.gIdx < T.countIn ? 'amber' : 'cyan') : ''; });
    if (ev.gIdx < T.countIn) {
      const n = ev.gIdx + 1;
      $.beatctr.textContent = 'Đếm vào ' + n + '/' + T.countIn;
      $.big.textContent = n; $.big.className = 'big amber';
      $.instr.textContent = 'Đếm vào ' + n + '/' + T.countIn;
      $.sub.textContent = 'Chuẩn bị, sau phách 8 là phách 1 của bài kiểm tra.';
    } else {
      const tb = ev.gIdx - T.countIn + 1;
      $.beatctr.textContent = blind ? 'Tự giữ nhịp…' : 'Ô nhịp ' + (Math.floor((tb - 1) / 4) + 1) + ', phách ' + (((tb - 1) % 4) + 1);
      if (state === 'recording' && taps.length < T.hits) {
        $.big.textContent = taps.length + ' / ' + T.hits; $.big.className = 'big';
        $.instr.textContent = cfg.test.silent ? 'Click đã tắt, hãy tự giữ nhịp' : 'Gõ theo click';
        $.sub.textContent = cfg.test.silent ? 'Gõ đủ ' + T.hits + ' phách theo đồng hồ nội tại.' : 'Đang ghi lại. Giữ nhịp đều.';
      }
    }
  }

  // CRITICAL PATH: keep this tiny. No charts or aggregation here.
  function hit() {
    RT.engine.ensureCtx();
    if (state === 'completed') return;
    if (!RT.engine.running) { startTest(); RT.ui.toast('Bắt đầu đếm vào 8 phách'); return; }
    if (state === 'countin') { RT.ui.toast('Đang đếm vào, hãy đợi tới phách 1', 'err'); return; }
    if (state !== 'recording') return;
    const t = RT.engine.now();
    taps.push(t);
    const n = taps.length;
    if (RT.log.on) RT.log.note('tap', { n, t: +t.toFixed(4), offsetMs: +((t - grid[n - 1]) * 1000).toFixed(2) });
    $.hits.textContent = n + '/' + T.hits + ' phách';
    $.big.textContent = n + ' / ' + T.hits;
    $.progress.style.width = (n / T.hits) * 100 + '%';
    $.arena.classList.remove('flash'); void $.arena.offsetWidth; $.arena.classList.add('flash');
    if (n >= T.hits) complete();
  }

  // pure: unit-testable without audio
  function analyze(tapT, gridT, bpm) {
    const target = (60 / bpm) * 1000, n = tapT.length;
    const offsets = tapT.map((t, i) => (t - gridT[i]) * 1000);
    const itis = [], freeze = tapT.reduce((c, t, i) => { if (!i) return c; const v = (t - tapT[i - 1]) * 1000; itis.push(v); return c + (v > target * 1.5 ? 1 : 0); }, 0);
    const mean = offsets.reduce((a, b) => a + b, 0) / n;
    const jitter = Math.sqrt(offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const k = Math.min(16, Math.floor(n / 2)), avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const drift = avg(offsets.slice(-k)) - avg(offsets.slice(0, k));
    const min = Math.min(...offsets), max = Math.max(...offsets);
    let grade = 'Amateur (C)';
    if (jitter < 15 && freeze === 0) grade = 'Studio Pro (S)';
    else if (jitter <= 35 && freeze <= 1) grade = 'Live Ready (A)';
    else if (jitter <= 55) grade = 'Intermediate (B)';
    return { offsets, itis, mean, jitter, drift, min, max, range: max - min, freeze, grade, target };
  }
  T.analyze = analyze;
  T._show = (a) => { last = a; showResults(a); }; // self-test hook: render results from given numbers

  function complete() {
    state = 'completed';
    stopRun(); state = 'completed';
    RT.log.note('test', { state: 'completed', hits: taps.length });
    const now = RT.engine.now();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => RT.voices.play(RT.engine.ctx, RT.engine.ctx.destination, { played: true, t: now + i * 0.08, level: 1, kind: 'beat', click: 'electronic', voice: null, tone: 'norm', _f: f }, RT.engine.muted));
    $.instr.textContent = 'Hoàn thành ' + T.hits + '/' + T.hits + ' phách';
    $.sub.textContent = 'Kết quả và biểu đồ ở bên dưới.';
    $.big.className = 'big green';
    last = analyze(taps, grid, cfg.bpm);
    showResults(last);
  }

  const fmt = (v, d = 1, sign) => (sign && v >= 0 ? '+' : '') + v.toFixed(d) + ' ms';
  function showResults(a) {
    $.results.hidden = false; $.done.textContent = taps.length + '/' + T.hits + ' phách';
    const m = [['Độ dao động (σ)', fmt(a.jitter), 'Càng nhỏ càng đều'], ['Lệch trung bình', fmt(a.mean, 1, 1), 'Âm là sớm, dương là trễ'], ['Trôi nhịp độ', fmt(a.drift, 1, 1), 'Cuối bài so với đầu bài'],
      ['Biên độ lệch', a.range.toFixed(0) + ' ms', 'Từ sớm nhất tới trễ nhất'], ['Số lần khựng', String(a.freeze), 'Khoảng gõ dài hơn 1,5 phách'], ['Xếp hạng', GRADE_VI[a.grade] || a.grade, 'Đồng hồ nội tại']];
    $.metrics.replaceChildren(...m.map(([t, v, s]) => h('div', { class: 'metric' }, h('small', {}, t), h('b', { class: 'mono' }, v), h('small', {}, s))));
    drawTarget($.target, a.offsets);
    renderCharts(a);
    $.payload.value = payload(a);
    setTimeout(() => $.results.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }

  // dartboard: radius = |offset| (rings at 15 / 35 / 60 ms), angle = hit order, filled = late, hollow = early
  function drawTarget(cv, offsets) {
    const css = getComputedStyle(document.documentElement), col = (n) => css.getPropertyValue(n).trim();
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 320, H = cv.clientHeight || 320;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.44, MAX = 80, rad = (ms) => (Math.min(Math.abs(ms), MAX) / MAX) * R;
    [[60, col('--hair')], [35, col('--warn')], [15, col('--ok')]].forEach(([ms, c]) => {
      g.beginPath(); g.arc(cx, cy, rad(ms), 0, Math.PI * 2); g.strokeStyle = c; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = col('--quiet'); g.font = '12px Barlow, sans-serif'; g.textAlign = 'left'; g.fillText(ms + ' ms', cx + rad(ms) * 0.72 + 4, cy - rad(ms) * 0.72);
    });
    g.beginPath(); g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy); g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6); g.strokeStyle = col('--ink'); g.lineWidth = 1.5; g.stroke();
    offsets.forEach((ms, i) => {
      const a = -Math.PI / 2 + (i / offsets.length) * Math.PI * 2, r = rad(ms), x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      const c = Math.abs(ms) <= 15 ? col('--ok') : Math.abs(ms) <= 35 ? col('--warn') : col('--led');
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2);
      if (ms >= 0) { g.fillStyle = c; g.fill(); } else { g.strokeStyle = c; g.lineWidth = 2; g.stroke(); }
    });
  }
  T.drawTarget = drawTarget;

  // A small themed chart on a canvas (replaces a 200 KB chart library used for just these two pictures):
  // y grid + ticks, x ticks, axis titles, dashed guide lines, then the series painted by o.paint.
  // ponytail: no hover tooltips; the exact values are in the "Dữ liệu cho AI phân tích" box below.
  function chart(cv, o) {
    const css = getComputedStyle(document.documentElement), col = (n) => css.getPropertyValue(n).trim();
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth || 600, H = cv.clientHeight || 240;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const L = 48, R = 8, T0 = 10, B = 40, pw = W - L - R, ph = H - T0 - B;
    const raw = (o.max - o.min) / 5, p10 = 10 ** Math.floor(Math.log10(raw)), m = raw / p10, step = (m <= 1.5 ? 1 : m <= 3 ? 2 : m <= 7 ? 5 : 10) * p10; // a round step, about 5-8 grid lines
    const y0 = Math.floor(o.min / step) * step, y1 = Math.ceil(o.max / step) * step;
    const X = (i) => L + ((i + 0.5) / o.n) * pw, Y = (v) => T0 + (1 - (v - y0) / (y1 - y0)) * ph;
    g.font = '11px Barlow, sans-serif'; g.fillStyle = col('--quiet'); g.strokeStyle = col('--hair'); g.lineWidth = 1; g.textBaseline = 'middle';
    g.textAlign = 'right';
    for (let v = y0; v <= y1 + step / 2; v += step) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(String(Math.round(v)), L - 8, Y(v)); }
    g.textAlign = 'center';
    const every = Math.max(1, Math.ceil(o.n / Math.floor(pw / o.tickW)));
    for (let i = 0; i < o.n; i += every) g.fillText(o.tick(i), X(i), T0 + ph + 12);
    g.font = '12px Barlow, sans-serif';
    g.fillText(o.xTitle, L + pw / 2, H - 8);
    g.save(); g.translate(11, T0 + ph / 2); g.rotate(-Math.PI / 2); g.fillText(o.yTitle, 0, 0); g.restore();
    for (const [v, color, dash, width] of o.guides) { g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = width || 1; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); }
    g.setLineDash([]);
    o.paint(g, X, Y, pw / o.n, col);
  }

  function renderCharts(a) {
    const css = getComputedStyle(document.documentElement), col = (n) => css.getPropertyValue(n).trim(), a40 = (n) => col(n) + '66'; // '66' = 40% alpha
    const band = (o) => (Math.abs(o) <= 15 ? '--ok' : Math.abs(o) <= 35 ? '--warn' : '--led');
    chart($.c1, { n: a.offsets.length, min: Math.min(-60, ...a.offsets), max: Math.max(60, ...a.offsets), xTitle: 'Phách', yTitle: 'Độ lệch (ms)', tick: (i) => String(i + 1), tickW: 26,
      guides: [[0, col('--ok'), [3, 3]], [15, a40('--ok'), [3, 3]], [-15, a40('--ok'), [3, 3]], [35, a40('--warn'), [3, 3]], [-35, a40('--warn'), [3, 3]]],
      paint(g, X, Y) {
        g.strokeStyle = col('--ink'); g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
        a.offsets.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
        a.offsets.forEach((v, i) => { g.fillStyle = col(band(v)); g.beginPath(); g.arc(X(i), Y(v), 4, 0, Math.PI * 2); g.fill(); });
      } });
    chart($.c2, { n: a.itis.length, min: Math.min(a.target - 100, ...a.itis), max: Math.max(a.target + 100, ...a.itis), xTitle: 'Cặp phách', yTitle: 'Khoảng cách (ms)', tick: (i) => i + 1 + '→' + (i + 2), tickW: 46,
      guides: [],
      paint(g, X, Y, w) {
        const base = Y(Math.min(a.target - 100, ...a.itis)), bw = Math.max(2, w * 0.7);
        g.fillStyle = a40('--ok'); g.strokeStyle = col('--ok'); g.lineWidth = 1;
        a.itis.forEach((v, i) => { const y = Y(v); g.beginPath(); g.rect(X(i) - bw / 2, Math.min(y, base), bw, Math.abs(base - y)); g.fill(); g.stroke(); });
        g.setLineDash([4, 4]); g.strokeStyle = col('--ink'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(0) - w / 2, Y(a.target)); g.lineTo(X(a.itis.length - 1) + w / 2, Y(a.target)); g.stroke(); g.setLineDash([]);
      } });
  }

  function payload(a) {
    const r2 = (v) => +v.toFixed(2), n = a.offsets.length;
    const dead = a.offsets.filter((o) => Math.abs(o) <= 15).length, pp = a.offsets.filter((o) => Math.abs(o) > 15 && Math.abs(o) <= 35).length;
    const trend = a.drift > 10 ? 'Slowing down / Dragging (Trôi trễ nhịp)' : a.drift < -10 ? 'Speeding up / Rushing (Trôi sớm nhịp)' : 'Stable Tempo Retention (Giữ Tempo đầm)';
    const obj = {
      testMetadata: { testName: '16-Bar (64 Hits) Silent Gap Training Test', timestamp: new Date().toISOString(), bpm: cfg.bpm, timeSignature: '4/4', countInBeats: T.countIn, silentGapMode: cfg.test.silent, totalHitsRecorded: n },
      summaryMetrics: { jitterStdDevMs: r2(a.jitter), meanOffsetMs: r2(a.mean), tempoDriftMs: r2(a.drift), driftTrend: trend, minOffsetMs: r2(a.min), maxOffsetMs: r2(a.max), offsetRangeMs: r2(a.range), freezeCount: a.freeze, ratingGrade: a.grade,
        distribution: { deadOn_0_15ms: dead, pushPull_15_35ms: pp, earlyLate_over_35ms: n - dead - pp, deadOnPercentage: +((dead / n) * 100).toFixed(1) } },
      rawOffsetArrayMs: a.offsets.map(r2), rawInterTapIntervalsMs: a.itis.map(r2),
    };
    if (RT.log.on) obj.engineLog = RT.log.summary();
    return '### 📊 AI DIAGNOSTIC PAYLOAD - 16-BAR SILENT GAP TEST (64 HITS)\n```json\n' + JSON.stringify(obj, null, 2) + '\n```';
  }

  function reset() {
    stopRun(); state = 'idle'; taps = []; grid = []; last = null;
    $.hits.textContent = '0/' + T.hits + ' phách'; $.progress.style.width = '0%'; $.phase.textContent = 'Sẵn sàng';
    $.big.textContent = '–'; $.big.className = 'big'; $.instr.textContent = 'Chạm vào đây để bắt đầu';
    $.sub.textContent = '8 phách đếm vào có click. Từ phách thứ 9 click tắt hẳn, bạn tự gõ đủ 64 phách theo đồng hồ nội tại.';
    $.beatctr.textContent = 'Chưa bắt đầu'; [...$.lights.children].forEach((l) => { l.className = ''; });
    $.results.hidden = true; $.payload.value = '';
    RT.ui.toast('Đã làm lại');
  }

  RT.tabs = RT.tabs || {};
  RT.tabs.test = { init, hit, reset, toggleMute, stop: () => { if (RT.engine.cfg === cfg && RT.engine.running) stopRun(); }, start: startTest, getState: () => state, getLast: () => last, getTaps: () => taps.slice(), getGrid: () => grid.slice() };
})();
