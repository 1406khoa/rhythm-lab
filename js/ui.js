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
  // icon-only round button; key: keyboard shortcut, named in the tooltip
  const PLAY = '<svg viewBox="0 0 24 24" width="34%" height="34%" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>';
  const STOP = '<svg viewBox="0 0 24 24" width="30%" height="30%" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>';
  function runButton(extraClass, key) {
    const b = h('button', { class: 'start ' + (extraClass || ''), onclick: () => RT.ui.toggleRun() });
    if (key) { b.dataset.key = key; b.setAttribute('aria-keyshortcuts', key); }
    runBtns.add(b);
    paintRun(b, RT.engine.running);
    return b;
  }
  function paintRun(b, running) {
    b.innerHTML = running ? STOP : PLAY;
    const name = running ? 'Dừng' : 'Bắt đầu';
    b.setAttribute('aria-label', name); b.dataset.tip = name + (b.dataset.key ? ' (' + b.dataset.key + ')' : '');
    b.classList.toggle('running', running);
  }
  RT.engine.on('state', (r) => runBtns.forEach((b) => paintRun(b, r)));

  // ---------- themed dropdown ----------
  // The native <select> keeps the value, change events and accessibility; only its popup is replaced.
  // The select gets pointer-events:none inside a wrapper that takes the clicks (so no native picker, also on iOS).
  let menu = null, menuSel = null, menuWrap = null, active = -1;
  function dropdown(sel) {
    const wrap = h('span', { class: 'dd', 'data-tip': '' }, sel); // tip text built on hover: '<name>: <full option text>'
    wrap.addEventListener('click', () => (menuSel === sel ? closeMenu() : openMenu(sel, wrap)));
    sel.setAttribute('aria-haspopup', 'listbox'); sel.setAttribute('aria-expanded', 'false');
    sel.addEventListener('mousedown', (e) => e.preventDefault()); // belt and braces: never the native popup
    sel.addEventListener('keydown', (e) => {
      if (menuSel !== sel && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); openMenu(sel, wrap); }
    });
    return wrap;
  }
  // keys while a menu is open, wherever focus is (opened by mouse, the select is never focused: no focus ring left behind)
  document.addEventListener('keydown', (e) => {
    if (!menu) return;
    const k = e.key, n = menuSel.options.length, nav = { ArrowDown: 1, ArrowUp: -1 };
    if (k in nav) active = (active + nav[k] + n) % n;
    else if (k === 'Home' || k === 'End') active = k === 'Home' ? 0 : n - 1;
    else if (k === 'Enter' || k === ' ') { choose(active); }
    else if (k === 'Escape') closeMenu();
    else { if (k === 'Tab') closeMenu(); return; }
    e.preventDefault(); e.stopPropagation(); // e.g. Space must not also start the metronome
    if (menu) paintActive();
  }, true);
  function openMenu(sel, wrap) {
    closeMenu();
    hideTip();
    menuSel = sel; menuWrap = wrap; active = sel.selectedIndex;
    menu = h('div', { class: 'menu', role: 'listbox', 'aria-label': sel.getAttribute('aria-label') || '' },
      [...sel.options].map((o, i) => h('div', { class: 'mi', role: 'option', 'aria-selected': String(i === sel.selectedIndex), onclick: () => choose(i) }, o.textContent)));
    menu.addEventListener('pointermove', (e) => { const it = e.target.closest('.mi'); if (it) { active = [...menu.children].indexOf(it); paintActive(true); } });
    document.body.append(menu);
    placeMenu(); paintActive();
    sel.setAttribute('aria-expanded', 'true'); wrap.classList.add('open');
    requestAnimationFrame(() => menu && menu.classList.add('in'));
  }
  function placeMenu() {
    const r = menuWrap.getBoundingClientRect(), gap = 6, pad = 8;
    menu.style.minWidth = r.width + 'px';
    const mh = Math.min(menu.scrollHeight, innerHeight * 0.5), mw = menu.offsetWidth;
    const below = innerHeight - r.bottom - gap - pad >= mh || r.top < innerHeight / 2;
    menu.style.maxHeight = Math.max(120, below ? innerHeight - r.bottom - gap - pad : r.top - gap - pad) + 'px';
    menu.style.left = Math.max(pad, Math.min(r.left, innerWidth - mw - pad)) + 'px';
    if (below) { menu.style.top = r.bottom + gap + 'px'; menu.style.bottom = ''; menu.classList.remove('up'); }
    else { menu.style.bottom = innerHeight - r.top + gap + 'px'; menu.style.top = ''; menu.classList.add('up'); }
  }
  function paintActive(fromPointer) {
    [...menu.children].forEach((it, i) => it.classList.toggle('act', i === active));
    const it = menu.children[active];
    if (it && !fromPointer) it.scrollIntoView({ block: 'nearest' });
  }
  function choose(i) {
    const sel = menuSel;
    closeMenu();
    if (i < 0 || !sel || i === sel.selectedIndex) return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function closeMenu() {
    if (!menu) return;
    const m = menu;
    m.classList.remove('in'); m.classList.add('out');
    setTimeout(() => m.remove(), 160);
    menuSel.setAttribute('aria-expanded', 'false'); menuWrap.classList.remove('open');
    menu = menuSel = menuWrap = null;
  }
  document.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target) && !menuWrap.contains(e.target)) closeMenu(); }, true);
  addEventListener('resize', closeMenu);
  addEventListener('scroll', (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);

  // ---------- themed tooltips: any element with data-tip (or a title, converted on first hover) ----------
  let tip = null, tipFor = null, tipT = 0;
  function hideTip() {
    clearTimeout(tipT); tipFor = null;
    if (tip) tip.classList.remove('in');
  }
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return; // touch has no hover: no tips
    const el = e.target.closest && e.target.closest('[data-tip],[title]');
    if (el === tipFor) return;
    hideTip();
    if (!el || menu) return;
    if (el.hasAttribute('title')) { el.dataset.tip = el.title; el.removeAttribute('title'); }
    tipFor = el;
    tipT = setTimeout(() => {
      const sel = el.classList.contains('dd') && el.querySelector('select'), o = sel && sel.options[sel.selectedIndex];
      const text = sel ? (o ? sel.getAttribute('aria-label') + ': ' + o.textContent : '') : el.dataset.tip;
      if (tipFor !== el || !el.isConnected || !text) return;
      if (!tip) { tip = h('div', { class: 'tip', role: 'tooltip' }); document.body.append(tip); }
      tip.textContent = text;
      const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight, up = r.top > th + 14;
      tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - 8)) + 'px';
      tip.style.top = (up ? r.top - th - 8 : r.bottom + 8) + 'px';
      tip.classList.toggle('below', !up);
      tip.classList.add('in');
    }, 400);
  });
  document.addEventListener('pointerout', (e) => { if (tipFor && !tipFor.contains(e.relatedTarget)) hideTip(); });
  document.addEventListener('pointerdown', hideTip, true);
  addEventListener('scroll', hideTip, true);

  RT.ui = {
    toast, toggle, seg, range, runButton, dropdown, closeMenu,
    toggleRun() {
      if (RT.engine.running || RT.engine.starting) RT.engine.stop();
      else RT.engine.start(RT.state.cfg).catch((e) => { console.error(e); toast('Không khởi động được âm thanh', 'err'); });
    },
    card(title, ...kids) { return h('div', { class: 'card' }, title ? h('div', { class: 'cap' }, title) : null, ...kids); },
  };
})();
