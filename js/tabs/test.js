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
  let taps = [], grid = [], startT = 0, charts = {}, last = null;
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
    [...$.lights.children].forEach((l, i) => { l.className = i === ev.beat ? (ev.gIdx < T.countIn ? 'amber' : 'cyan') : ''; });
    if (ev.gIdx < T.countIn) {
      const n = ev.gIdx + 1;
      $.beatctr.textContent = 'Đếm vào ' + n + '/' + T.countIn;
      $.big.textContent = n; $.big.className = 'big amber';
      $.instr.textContent = 'Đếm vào ' + n + '/' + T.countIn;
      $.sub.textContent = 'Chuẩn bị, sau phách 8 là phách 1 của bài kiểm tra.';
    } else {
      const tb = ev.gIdx - T.countIn + 1;
      $.beatctr.textContent = 'Ô nhịp ' + (Math.floor((tb - 1) / 4) + 1) + ', phách ' + (((tb - 1) % 4) + 1);
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
    renderCharts(a);
    $.payload.value = payload(a);
    setTimeout(() => $.results.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }

  function renderCharts(a) {
    if (typeof Chart === 'undefined') return;
    Object.values(charts).forEach((c) => c.destroy());
    const labels = a.offsets.map((_, i) => i + 1);
    const axis = (title, x) => ({ title: { display: true, text: title, color: '#7f8db0' }, ticks: { color: '#7f8db0', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.05)' }, ...x });
    const line = (v, c) => ({ data: Array(labels.length).fill(v), borderColor: c, borderDash: [3, 3], borderWidth: 1, pointRadius: 0 });
    charts.c1 = new Chart($.c1.getContext('2d'), { type: 'line', data: { labels, datasets: [{
      data: a.offsets.map((v) => +v.toFixed(1)), borderColor: '#4f8cff', borderWidth: 2, tension: 0.15, pointRadius: 4,
      pointBackgroundColor: a.offsets.map((o) => (Math.abs(o) <= 15 ? '#2fbf86' : Math.abs(o) <= 35 ? '#e8a33a' : '#e5566d')) },
      line(0, '#2fbf86'), line(15, 'rgba(47,191,134,.4)'), line(-15, 'rgba(47,191,134,.4)'), line(35, 'rgba(232,163,58,.4)'), line(-35, 'rgba(232,163,58,.4)')] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: axis('Phách'), y: axis('Độ lệch (ms)', { suggestedMin: -60, suggestedMax: 60 }) } } });
    charts.c2 = new Chart($.c2.getContext('2d'), { type: 'bar', data: { labels: a.itis.map((_, i) => i + 1 + '→' + (i + 2)), datasets: [{ data: a.itis.map((v) => +v.toFixed(1)), backgroundColor: 'rgba(47,191,134,.4)', borderColor: '#2fbf86', borderWidth: 1 },
      { type: 'line', data: Array(a.itis.length).fill(a.target), borderColor: '#4f8cff', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: axis('Cặp phách'), y: axis('Khoảng cách (ms)', { suggestedMin: a.target - 100, suggestedMax: a.target + 100 }) } } });
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
    Object.values(charts).forEach((c) => c.destroy()); charts = {};
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
