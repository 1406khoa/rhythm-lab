/* Shared helpers: namespace, tempo names, deterministic RNG, tiny DOM builder, pub/sub. */
(function () {
  const RT = (window.RT = window.RT || {});

  const TEMPO_NAMES = [[40, 'Grave'], [60, 'Largo'], [66, 'Larghetto'], [76, 'Adagio'], [108, 'Andante'],
    [120, 'Moderato'], [156, 'Allegro'], [176, 'Vivace'], [200, 'Presto'], [Infinity, 'Prestissimo']];

  // lowbias32 mix -> [0,1). Stateless so buildEvents stays pure and replayable from (seed, position).
  function rand01(seed, a, b, c) {
    let h = (seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b) ^ Math.imul(c + 13, 0xc2b2ae35)) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }

  function bus() {
    const m = {};
    return {
      on: (e, f) => ((m[e] = m[e] || []).push(f), f),
      off: (e, f) => { m[e] = (m[e] || []).filter((x) => x !== f); },
      emit: (e, ...a) => (m[e] || []).slice().forEach((f) => f(...a)),
    };
  }

  RT.util = {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    tempoName(bpm) { return TEMPO_NAMES.find(([max]) => bpm < max)[1]; },
    rand01, h, bus,
    store: {
      get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    },
  };
  RT.bus = bus();
})();
