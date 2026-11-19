# Rhythm Lab

Metronome + timing trainer. Static files, no build: open `index.html` (works from `file://`).

| Tab | What |
|-----|------|
| Pulse | BPM 1-500, tap tempo, time signatures (incl. 5/8, 7/16, custom n/d), subdivisions, swing, follow-beat-mute, one electronic click + optional spoken count, beat circles (click: accent → normal → mute) |
| Practice | Gap click (play N / silence M, by measures or beats), random mute (beats % / subdivisions %), keep screen awake |
| Forms | Chain bars with their own time signature, undo/redo, select/duplicate/delete, save to device, share by link (`#f=`) |
| Test | The original 64-hit silent-gap timing test (8-beat count-in), unchanged behaviour |

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
(mono 22 kHz WAV, base64, trimmed, loudness-matched, onset measured).
- Scheduling commits one event at a time, ~120 ms ahead, and computes the next beat from the tempo at that moment — edits are heard within ~120 ms (regression test in `?selftest=live`).
