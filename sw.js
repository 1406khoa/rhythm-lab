/* Offline support: the first online visit stores the whole app; after that it opens without a network.
 * Strategy: serve from cache at once, refresh the cached copy in the background (stale-while-revalidate),
 * so a new deploy shows up on the next launch. Bump VERSION only to force-drop old caches. */
const VERSION = 'v1';
const CACHE = 'rhythm-lab-' + VERSION;
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "favicon.svg",
  "css/app.css",
  "css/fonts.css",
  "js/app.js",
  "js/logpanel.js",
  "js/ui.js",
  "js/vocal-samples.js",
  "js/tabs/forms.js",
  "js/tabs/practice.js",
  "js/tabs/pulse.js",
  "js/tabs/test.js",
  "js/challenge.js",
  "js/core/engine.js",
  "js/core/events.js",
  "js/core/log.js",
  "js/core/state.js",
  "js/core/syllables.js",
  "js/core/util.js",
  "js/core/voices.js",
  "js/vendor/chart.umd.min.js",
  "js/viz.js",
  "fonts/barlow-400-latin-ext.woff2",
  "fonts/barlow-400-latin.woff2",
  "fonts/barlow-400-vietnamese.woff2",
  "fonts/barlow-500-latin-ext.woff2",
  "fonts/barlow-500-latin.woff2",
  "fonts/barlow-500-vietnamese.woff2",
  "fonts/barlow-600-latin-ext.woff2",
  "fonts/barlow-600-latin.woff2",
  "fonts/barlow-600-vietnamese.woff2",
  "fonts/barlow-condensed-500-latin-ext.woff2",
  "fonts/barlow-condensed-500-latin.woff2",
  "fonts/barlow-condensed-500-vietnamese.woff2",
  "fonts/barlow-condensed-600-latin-ext.woff2",
  "fonts/barlow-condensed-600-latin.woff2",
  "fonts/barlow-condensed-600-vietnamese.woff2",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rhythm-lab-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const key = req.mode === 'navigate' ? './' : req; // any page URL (?log=1, #f=...) opens the cached app
    const hit = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => { if (res.ok) cache.put(key, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(fresh); return hit; }
    return (await fresh) || new Response('Offline', { status: 503, statusText: 'Offline' });
  }));
});
