/* What the voice says on each slot. Traditional counting only:
 *   beats say 1 2 3 4; every subdivision slot is a click.
 * Tokens: '1'..'12' (assets/voice-src/english_audio_pack). */
(function () {
  const RT = (window.RT = window.RT || {});

  const TOKENS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
  const GROUPINGS = {
    5: ['2+3', '3+2'], 6: ['3+3', '2+2+2'], 7: ['2+2+3', '3+2+2', '2+3+2'], 8: ['3+3+2', '2+3+3', '2+2+2+2'],
    9: ['3+3+3', '2+2+2+3'], 10: ['3+3+2+2', '2+3+2+3'], 11: ['3+3+3+2', '2+2+3+2+2'], 12: ['3+3+3+3', '4+4+4'],
  };
  const MAX_NUM = 12;

  // "2+2+3" -> [2,2,3] if it sums to num, else null
  function parseGrouping(str, num) {
    if (!str) return null;
    const g = String(str).split('+').map((x) => parseInt(x, 10));
    return g.length > 1 && g.every((x) => x >= 1) && g.reduce((a, b) => a + b, 0) === num ? g : null;
  }
  // beat index -> number to say (restarts at each group when a valid grouping is set)
  function beatLabel(grouping, num, beat) {
    const g = parseGrouping(grouping, num);
    if (!g) return beat + 1;
    let start = 0;
    for (const size of g) { if (beat < start + size) return beat - start + 1; start += size; }
    return beat + 1;
  }
  const groupStarts = (grouping, num) => { const g = parseGrouping(grouping, num); if (!g) return null; let s = 0; return g.map((x) => { const r = s; s += x; return r; }); };

  // token said on this beat, or null (beats above 12 just click)
  function voice(cfg, num, beat) {
    const label = beatLabel(cfg.vocal.grouping, num, beat);
    return label <= MAX_NUM ? String(label) : null;
  }

  RT.syllables = { TOKENS, GROUPINGS, parseGrouping, beatLabel, groupStarts, voice };
})();
