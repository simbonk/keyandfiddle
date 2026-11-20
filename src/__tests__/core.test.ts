import { describe, expect, it } from 'vitest';
import { PitchDetector } from '../audio/pitch';
import { midiName, parseSong } from '../audio/notes';
import { PIANO_SONGS } from '../piano/songs';
import { DEFAULT_CAL, expectedFreq, matchKey } from '../piano/calibration';
import { VIOLIN_SONGS, fingeringFor, violinNotes } from '../violin/theory';

function tone(f: number, sr = 48000, n = 2048) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    b[i] = 0.3 * Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(2 * Math.PI * f * 2.002 * t) + 0.1 * Math.sin(2 * Math.PI * f * 3.005 * t);
  }
  return b;
}

describe('pitch detector', () => {
  it.each([130.81, 196, 261.63, 440, 659.25, 987.77])('detects %f Hz within 10 cents', (f) => {
    const r = new PitchDetector(2048, 48000, 60, 2100).detect(tone(f));
    expect(Math.abs(1200 * Math.log2(r.freq / f))).toBeLessThan(10);
  });
  it('reports silence', () => {
    expect(new PitchDetector(2048, 48000).detect(new Float32Array(2048)).freq).toBe(0);
  });
});

describe('songs', () => {
  it('parses every piano song inside the default 2 octaves', () => {
    for (const s of PIANO_SONGS) {
      expect(s.notes.length).toBeGreaterThan(4);
      for (const n of s.notes) {
        expect(n.midi).not.toBeNull();
        expect(n.midi!).toBeGreaterThanOrEqual(48);
        expect(n.midi!).toBeLessThanOrEqual(72);
      }
    }
  });
  it('parses chords and rests', () => {
    const n = parseSong('C4:1 R:1 E4:2+C3:2:L');
    expect(n.map((x) => [x.midi, x.beat])).toEqual([
      [60, 0],
      [64, 2],
      [48, 2],
    ]);
  });
  it('fingers every violin song in first position with alternating bows', () => {
    for (const s of VIOLIN_SONGS) {
      const v = violinNotes(s);
      expect(v.length).toBe(s.notes.length);
      for (const n of v) {
        expect(n.bow.from).toBeGreaterThanOrEqual(0);
        expect(n.bow.to).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('violin fingering', () => {
  it.each([
    [55, 'open G'],
    [62, 'open D'],
    [69, 'open A'],
    [76, 'open E'],
    [71, 'finger 1 on A'],
    [73, 'finger high 2 on A'],
    [74, 'finger 3 on A'],
    [66, 'finger high 2 on D'],
    [78, 'finger 1 on E'],
  ])('%s -> %s', (m, label) => {
    expect(fingeringFor(m)?.label).toBe(label);
  });
});

describe('piano calibration', () => {
  it('matches keys on an out-of-tune piano', () => {
    // a piano that is ~40 cents flat everywhere, measured on two keys only
    const flat = (m: number) => 440 * Math.pow(2, (m - 69) / 12) * Math.pow(2, -40 / 1200);
    const cal = { ...DEFAULT_CAL, keys: { 48: flat(48), 72: flat(72) } };
    expect(Math.abs(1200 * Math.log2(expectedFreq(cal, 60) / flat(60)))).toBeLessThan(1);
    for (let m = 48; m <= 72; m++) expect(matchKey(cal, flat(m))?.midi).toBe(m);
    // without calibration a 40-cent-flat C#4 is still C#4, but 60-cent-flat would be misread
    expect(midiName(matchKey(DEFAULT_CAL, flat(61))!.midi)).toBe('C#4');
  });
});
