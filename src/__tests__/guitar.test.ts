import { describe, expect, it } from 'vitest';
import { PitchDetector } from '../audio/pitch';
import { renderPluck } from '../guitar/pluck';
import { CHORDS, CHORD_SONGS, GSTRINGS, GUITAR_SONGS, guitarFingering, guitarNotes } from '../guitar/theory';

const SR = 48000;

describe('plucked string', () => {
  for (const midi of [40, 45, 52, 59, 64, 69])
    it(`plucks ${midi} in tune`, () => {
      const f = 440 * 2 ** ((midi - 69) / 12);
      const buf = renderPluck(f, SR, 1);
      const r = new PitchDetector(4096, SR).detect(buf.slice(4800, 4800 + 4096));
      const cents = 1200 * Math.log2(r.freq / f);
      expect(Math.abs(cents)).toBeLessThan(15);
    });
});

describe('guitar fingering', () => {
  it('open strings are open', () => {
    GSTRINGS.forEach((s, i) => expect(guitarFingering(s.midi)).toMatchObject({ string: i, fret: 0 }));
  });
  it('C4 is fret 1 on the B string', () => {
    expect(guitarFingering(60)).toMatchObject({ string: 4, fret: 1 });
  });
  it('every song note lands on frets 0-5', () => {
    for (const s of GUITAR_SONGS) {
      const melody = s.notes.filter((n) => n.midi !== null && !n.tag?.includes('L'));
      const g = guitarNotes(s);
      expect(g.length, s.title).toBe(melody.length);
      for (const n of g) expect(n.fing.fret).toBeLessThanOrEqual(5);
    }
  });
  it('chord songs only use known chords', () => {
    for (const s of CHORD_SONGS) {
      expect(s.notes.length, s.title).toBeGreaterThan(3);
      for (const n of s.notes) expect(CHORDS[n.tag!], `${s.title} ${n.tag}`).toBeTruthy();
    }
  });
});
