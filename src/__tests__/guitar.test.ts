import { describe, expect, it } from 'vitest';
import { PitchDetector } from '../audio/pitch';
import { renderPluck } from '../guitar/pluck';
import { CHORDS, CHORD_SONGS, GSTRINGS, chordOfTag, GUITAR_SONGS, guitarFingering, guitarNotes } from '../guitar/theory';
import { GuitarState } from '../guitar/instrument';

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
      const melody = s.notes.filter((n) => n.midi !== null && !n.tag?.includes('L') && !chordOfTag(n.tag).chord);
      const g = guitarNotes(s);
      expect(g.length, s.title).toBe(melody.length);
      for (const n of g) expect(n.fing.fret).toBeLessThanOrEqual(5);
    }
  });
  it('chord songs only use known chords', () => {
    for (const s of CHORD_SONGS) {
      expect(s.notes.length, s.title).toBeGreaterThan(3);
      for (const n of s.notes) expect(chordOfTag(n.tag).chord, `${s.title} ${n.tag}`).toBeTruthy();
    }
  });
});

describe('hearing chords', () => {
  // a fake chroma from the chord's own strings, with a few harmonics
  const chromaOf = (midis: (number | null)[]) => {
    const c = new Array(12).fill(0.001);
    for (const m of midis) if (m !== null) [0, 12, 19, 24].forEach((h, k) => (c[(m + h) % 12] += 1 / (k + 1)));
    return c;
  };
  it('hears each chord as itself', async () => {
    const { CHORDS, chordMidis, chordMatch } = await import('../guitar/theory');
    for (const c of Object.values(CHORDS)) {
      const r = chordMatch(chromaOf(chordMidis(c)), c);
      expect(r.share, c.name).toBeGreaterThan(0.85);
      expect(r.all, c.name).toBe(true);
    }
  });
  it('does not take C for A minor, or E for E minor', async () => {
    const { CHORDS, chordMidis, chordMatch } = await import('../guitar/theory');
    expect(chordMatch(chromaOf(chordMidis(CHORDS.C)), CHORDS.Am).all).toBe(false);
    const em = chordMatch(chromaOf(chordMidis(CHORDS.E)), CHORDS.Em);
    expect(em.share < 0.7 || !em.all).toBe(true);
  });
});

describe('songs with chords', () => {
  it('mix picked notes and strums', async () => {
    const { hasChords } = await import('../guitar/theory');
    const mixed = GUITAR_SONGS.filter(hasChords);
    expect(mixed.length).toBeGreaterThanOrEqual(5);
    for (const s of mixed) {
      const strums = s.notes.filter((n) => chordOfTag(n.tag).chord).length;
      expect(strums, s.title).toBeGreaterThan(1);
      expect(guitarNotes(s).length, s.title).toBeGreaterThan(strums);
    }
  });
});

describe('forgiving chord shapes', () => {
  const hold = (pts: [number, number][]) => {
    const gs = new GuitarState();
    pts.forEach(([string, fret], i) => gs.touches.set(i, { kind: 'fret', string, fret, t: i }));
    return gs;
  };
  it('counts fingers one string or fret off', () => {
    // C: A3 D2 B1 — each finger a little off
    expect(hold([[2, 3], [2, 2], [4, 2]]).chordHeld(CHORDS.C)).toBe(true);
  });
  it('lets one of three fingers miss, but not two', () => {
    expect(hold([[1, 3], [2, 2]]).chordHeld(CHORDS.C)).toBe(true);
    expect(hold([[1, 3]]).chordHeld(CHORDS.C)).toBe(false);
  });
  it('needs both fingers of a two-finger chord, one touch each', () => {
    expect(hold([[1, 2], [2, 2]]).chordHeld(CHORDS.Em)).toBe(true);
    expect(hold([[1, 2]]).chordHeld(CHORDS.Em)).toBe(false);
  });
  it('a finger far away does not count', () => {
    expect(hold([[5, 5], [4, 5]]).chordHeld(CHORDS.Em)).toBe(false);
  });
  it('a barre finger is one finger', () => {
    expect(hold([[2, 3], [3, 2], [5, 1]]).chordHeld(CHORDS.F)).toBe(true);
  });
});
