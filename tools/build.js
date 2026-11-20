#!/usr/bin/env node
/* Builds the deployable site into dist/ (Vercel runs this: see vercel.json). No dependencies.
 *
 * The source tree stays as it is for development (many small files, open index.html or serve the folder).
 * The build only repackages it so one user costs the host as few requests as possible:
 *   - index.html carries the CSS and all own JS inline            -> 1 request instead of ~20
 *   - voice samples + fonts get content-hashed names under a/     -> cached "immutable", never asked for again
 *   - sw.js gets the file list + hashes                           -> cache-first, updates download only what changed
 * Measured (headless Chrome against a server with Vercel's headers): first visit 73 -> 11 requests,
 * repeat visit 30 -> 1, visit after a deploy -> 2.
 *
 * Usage: node tools/build.js [outDir]        then open dist/index.html to try the bundle */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..'), OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const read = (f) => fs.readFileSync(path.join(ROOT, f));
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
const fail = (msg) => { console.error('build failed: ' + msg); process.exit(1); };
if ((ROOT + path.sep).startsWith(OUT + path.sep)) fail('refusing to build into ' + OUT + ' (it would wipe the project)');

// ---- 1. every character the UI shows must be in the subset fonts (or known to come from a system font)
const TEXT_FILES = ['index.html', 'js', 'js/core', 'js/tabs', 'css/app.css', 'manifest.webmanifest']; // same list as tools/build-fonts.py
const texts = TEXT_FILES.flatMap((f) => (fs.statSync(path.join(ROOT, f)).isDirectory()
  ? fs.readdirSync(path.join(ROOT, f)).filter((n) => n.endsWith('.js') && !/selftest|vocal-samples/.test(n)).map((n) => f + '/' + n) : [f]));
const [, inFont, system] = read('fonts/charset.txt').toString().split('\n');
const allowed = new Set([...inFont, ...system]);
const unknown = [...new Set(texts.flatMap((f) => [...read(f).toString()]))].filter((c) => c.codePointAt(0) > 0x7e && !allowed.has(c));
if (unknown.length) fail('characters not in the fonts: ' + unknown.join(' ') + '  -> run tools/build-fonts.py (see its header)');

// ---- 2. assets with the content hash in the name
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'a'), { recursive: true });
const FILES = {}; // url -> content hash ('' when the hash is in the name)
const asset = (name, buf) => {
  const ext = path.extname(name), url = 'a/' + path.basename(name, ext) + '.' + hash(buf) + ext;
  fs.writeFileSync(path.join(OUT, url), buf); FILES[url] = ''; return url;
};
const copy = (f) => { const buf = read(f); fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true }); fs.writeFileSync(path.join(OUT, f), buf); FILES[f] = hash(buf); };

let html = read('index.html').toString();
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const VOICE = 'js/vocal-samples.js'; // big and never changes with the code: its own cacheable file
if (!scripts.includes(VOICE)) fail('index.html no longer loads ' + VOICE);
const js = scripts.filter((s) => s !== VOICE).map((s) => read(s).toString()).join('\n;\n');
if (/<\/script/i.test(js)) fail('a script contains "</script", it cannot be inlined');
const fontCss = read('css/fonts.css').toString().replace(/url\(\.\.\/fonts\/([^)]+)\)/g, (_, f) => 'url(' + asset(f, read('fonts/' + f)) + ')');
const css = fontCss + read('css/app.css').toString();
if (/<\/style/i.test(css)) fail('the CSS contains "</style", it cannot be inlined');
const voiceUrl = asset('voice.js', read(VOICE));

// ---- 3. index.html: CSS + JS inline, favicon inline
const swap = (from, to) => { if (!html.includes(from)) fail('index.html: expected ' + from); html = html.replace(from, () => to); };
html = html.replace(/[ \t]*<script src="[^"]+"><\/script>\n?/g, '');
swap('  <link rel="stylesheet" href="css/fonts.css">\n', '');
swap('<link rel="stylesheet" href="css/app.css">', '<style>\n' + css + '</style>');
swap('href="favicon.svg"', 'href="data:image/svg+xml,' + encodeURIComponent(read('favicon.svg').toString()) + '"');
swap('</body>', '<script src="' + voiceUrl + '"></script>\n<script>\n' + js + '\n</script>\n</body>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
FILES['./'] = hash(Buffer.from(html));
['manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'].forEach(copy);

// ---- 4. the service worker with this build's file list
const PRECACHE = Object.keys(FILES).filter((u) => u === './' || u.startsWith('a/') || u === 'manifest.webmanifest');
const BUILD = hash(Buffer.from(JSON.stringify(FILES)));
let sw = read('sw.js').toString();
const set = (name, value) => { const re = new RegExp('^const ' + name + ' = [^;]*;', 'm'); if (!re.test(sw)) fail('sw.js: no "const ' + name + '"'); sw = sw.replace(re, () => 'const ' + name + ' = ' + JSON.stringify(value) + ';'); };
set('BUILD', BUILD); set('FILES', FILES); set('PRECACHE', PRECACHE);
fs.writeFileSync(path.join(OUT, 'sw.js'), sw);

// ---- 5. self-check: everything the page and the worker point at exists in the output
const refs = [...html.matchAll(/(?:src|href)="((?:a|icons)\/[^"]+|manifest\.webmanifest)"/g)].map((m) => m[1]).concat([...css.matchAll(/url\((a\/[^)]+)\)/g)].map((m) => m[1]), Object.keys(FILES).filter((u) => u !== './'));
const missing = [...new Set(refs)].filter((u) => !fs.existsSync(path.join(OUT, u)));
if (missing.length) fail('missing in the output: ' + missing.join(', '));
if (/<script src="js\//.test(html) || /href="css\//.test(html)) fail('index.html still points at source files');

const kb = (f) => (require('zlib').brotliCompressSync(fs.readFileSync(path.join(OUT, f))).length / 1024).toFixed(1);
const total = Object.keys(FILES).filter((u) => PRECACHE.includes(u)).reduce((s, u) => s + (/\.woff2$/.test(u) ? fs.statSync(path.join(OUT, u)).size / 1024 : +kb(u === './' ? 'index.html' : u)), 0);
console.log(`built ${path.relative(ROOT, OUT) || OUT}  build ${BUILD}  index.html ${kb('index.html')} KB  voice ${kb(voiceUrl)} KB  precache ${PRECACHE.length} files, ~${total.toFixed(0)} KB`);
