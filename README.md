# Rhythm Lab

Metronome + timing trainer. Static files; for development there is no build: open `index.html` (works from `file://`).

| Tab | What |
|-----|------|
| Máy nhịp | BPM 1-500 (±1/±2/±5, type or tap it), time signatures (incl. 5/8, 7/16, custom n/d), subdivisions, swing, polyrhythm layer, one electronic click + optional spoken count, beat bars (tap: accent → normal → soft → mute), six displays |
| Luyện tập (panel on Máy nhịp) | Gap click (play N / silence M, by measures or beats), random mute (beats % / subdivisions %), tap challenge |
| Kiểm tra | The original 64-hit silent-gap timing test (8-beat count-in), results drawn on canvas |

## Log mode (dev only)
`?log=1` (dev only — no button in the UI). Records every scheduled event — *including silent ones with the reason* (`gap`, `randomBeat`, `beatMuted`, …) —
plus scheduling lead (`minLeadMs` must stay > 0), spacing and draw lag. `window.__rtlog`, Copy JSON / Download in the panel.

## Self-test
Local only (the runner and `js/selftest.js` are not committed): open `index.html?selftest=1` (or `=live`) and read `window.__selftest`.
The offline part renders the real `RT.voices.play()` through an `OfflineAudioContext`, detects onsets and checks them against the event
model within 2 ms, and checks that `played=false` events leave silence.

## Rulings
- BPM is the rate of the beat circles; the denominator is a label only (7/8 and 7/4 click the same).
- Swing delays the 2nd of each subdivision pair; presets 50 / 57.1 / 60 / 66.7 / 75 %.
- Vocal says 1…12 per beat; subdivisions and beats > 12 are click only.
- Vocal samples start `onsetOffset` before the beat so the *vowel* lands on the grid (offsets in `RT.voices.onsets`); the engine looks that far further ahead.
- When a word is still ringing at the next one (fast tempos) it is faded out over a few ms; log mode warns.
- Random mute is seeded (`cfg.seed`) and stateless, so a run is reproducible.

## Vocal (Pulse → Sound → Vocal)
The click always plays; the voice adds `1 2 3 4` on the beats. Subdivisions are click only.
**Count in groups** for odd meters (`2+2+3` → 7/8 says 1 2 1 2 1 2 3); "Accent groups" accents each group start.

## Voice samples
`tools/build-samples.py` turns `assets/voice-src/english_audio_pack/{1..12}.mp3` (one speaker) into `js/vocal-samples.js`
(mono 22 kHz FLAC, base64, trimmed, loudness-matched, onset measured). FLAC is lossless: it decodes to the same samples as the WAV
it replaced, so the measured onsets stay exact; lossy codecs would shift them by a browser-dependent encoder delay.
- Scheduling commits one event at a time, ~120 ms ahead, and computes the next beat from the tempo at that moment — edits are heard within ~120 ms (regression test in `?selftest=live`).

## Offline, build and hosting cost
"Add to Home Screen" installs it like an app; after the first online visit it runs without a network. Needs https (Vercel) —
`file://` and localhost run without the service worker.

The deployed site is not the source tree: Vercel runs `node tools/build.js` (see `vercel.json`), which writes `dist/`:
- `index.html` with the CSS and all own JS inline (1 request instead of ~20);
- voice samples and fonts under `a/` with the content hash in the name, served `immutable`;
- `sw.js` with the file list: cache-first without revalidation, and an update downloads only files whose hash changed.

Measured with headless Chrome against a server sending Vercel's headers: a new user costs 11 requests / ~250 KB (was 73 / 570 KB),
every later visit 1 request (was ~30), the first visit after a deploy 2. The host's request quota, not bandwidth, is the limit.

- Fonts: `tools/build-fonts.py` subsets Barlow to the characters the UI uses (one file per weight, list in `fonts/charset.txt`).
  The build fails if the UI gains a character that is not in that list — rerun the script then.
- A new version shows on the second launch after a deploy (the first one installs it in the background).
- Try the bundle locally: `node tools/build.js`, then open `dist/index.html`.
