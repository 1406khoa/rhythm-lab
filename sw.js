/* Offline support, built so that opening the app costs the host (almost) nothing.
 *
 * - Everything is answered from this device's cache, with no revalidation: a repeat visit makes ONE request
 *   (the browser's own check for a newer sw.js) instead of one per file.
 * - A new deploy = a new sw.js (tools/build.js writes the three constants below). On install it copies every
 *   file whose content hash did not change from the previous cache and downloads only the rest, so an update
 *   costs a user 2 requests (sw.js + index.html), not the whole app again.
 * - The new version shows on the next launch (the open page keeps the files it started with).
 *
 * Unbuilt (FILES empty, e.g. the source tree on localhost) this worker does nothing. */
const BUILD = 'dev';
const FILES = {};      // url -> content hash ('' = the hash is already in the file name, see a/ in the build output)
const PRECACHE = [];   // downloaded at install; other FILES (icons) are cached the first time something asks for them

const CACHE = 'rl-' + BUILD;
const key = (u) => new URL(u + (FILES[u] ? '?v=' + FILES[u] : ''), self.registration.scope).href;

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await Promise.all(Object.keys(FILES).map(async (u) => {
    const had = await caches.match(key(u)); // same url + same hash in an older cache = same bytes
    if (had) return cache.put(key(u), had);
    if (!PRECACHE.includes(u)) return;
    // hashed names never change, so the copy the page just loaded (HTTP cache) is good; the others are revalidated
    const res = await fetch(new Request(u, { cache: FILES[u] ? 'no-cache' : 'default' }));
    if (!res.ok) throw new Error('precache failed: ' + u + ' ' + res.status); // install fails, the old version keeps serving
    return cache.put(key(u), res);
  }));
  await self.skipWaiting();
})()));

self.addEventListener('activate', (e) => e.waitUntil(caches.keys()
  .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('rl-') && k !== CACHE) || k.startsWith('rhythm-lab-')).map((k) => caches.delete(k))))
  .then(() => self.clients.claim())));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  const u = req.mode === 'navigate' ? './' : url.pathname.slice(scope.length); // any page URL (?log=1, #...) opens the cached app
  if (!(u in FILES)) return; // not ours: plain network
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(key(u));
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(key(u), res.clone());
    return res;
  }));
});
