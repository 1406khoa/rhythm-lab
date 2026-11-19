/* Small shared widgets. Every control re-reads cfg through RT.state, nothing keeps its own copy. */
(function () {
  const RT = (window.RT = window.RT || {});
  const { h } = RT.util;

  let toastT = 0;
  function toast(msg, type) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.className = 'show ' + (type || '');
    clearTimeout(toastT);
    toastT = setTimeout(() => { el.className = ''; }, 2600);
  }

  function toggle(value, onChange, label) {
    const b = h('button', { class: 'tg', role: 'switch', 'aria-checked': String(!!value), 'aria-label': label || 'toggle' });
    b.addEventListener('click', () => { const v = b.getAttribute('aria-checked') !== 'true'; b.set(v); onChange(v); });
    b.set = (v) => b.setAttribute('aria-checked', String(!!v));
    return b;
  }

  function seg(options, value, onChange) { // options: [[value,label]]
    const root = h('div', { class: 'seg' });
    const btns = options.map(([v, label]) => {
      const b = h('button', { 'data-v': v, 'aria-pressed': String(v === value), onclick: () => { root.set(v); onChange(v); } }, label);
      root.append(b); return b;
    });
    root.set = (val) => btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(val))));
    return root;
  }

  function range(min, max, value, onInput, step) {
    const el = h('input', { type: 'range', min, max, step: step || 1, value });
    el.addEventListener('input', () => onInput(Number(el.value)));
    return el;
  }

  const runBtns = new Set();
  function runButton(extraClass) {
    const b = h('button', { class: 'start ' + (extraClass || ''), onclick: () => RT.ui.toggleRun() });
    runBtns.add(b);
    paintRun(b, RT.engine.running);
    return b;
  }
  function paintRun(b, running) {
    b.textContent = running ? '■ Dừng' : '▶ Bắt đầu';
    b.classList.toggle('running', running);
  }
  RT.engine.on('state', (r) => runBtns.forEach((b) => paintRun(b, r)));

  RT.ui = {
    toast, toggle, seg, range, runButton,
    toggleRun() {
      if (RT.engine.running || RT.engine.starting) RT.engine.stop();
      else RT.engine.start(RT.state.cfg).catch((e) => { console.error(e); toast('Không khởi động được âm thanh', 'err'); });
    },
    card(title, ...kids) { return h('div', { class: 'card' }, title ? h('div', { class: 'cap' }, title) : null, ...kids); },
  };
})();
