import { describe, expect, it } from 'vitest';
import { PitchDetector } from '../audio/pitch';
import { midiName, parseSong } from '../audio/notes';
import { PIANO_SONGS } from '../piano/songs';
import { songRange } from '../piano/PianoPlay';
import { DEFAULT_CAL, expectedFreq, matchKey, nearKey } from '../piano/calibration';
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
  it('parses every piano song and fits it on at most 4 octaves', () => {
    for (const s of PIANO_SONGS) {
      expect(s.notes.length).toBeGreaterThan(4);
      const [lo, hi] = songRange(s, 48);
      expect(hi - lo).toBeLessThanOrEqual(48);
      for (const n of s.notes) {
        expect(n.midi!).toBeGreaterThanOrEqual(lo);
        expect(n.midi!).toBeLessThanOrEqual(hi);
      }
    }
  });
  it('keeps the normal 2 octaves for easy songs and widens for big ones', () => {
    const byId = (id: string) => PIANO_SONGS.find((s) => s.id === id)!;
    expect(songRange(byId('mary'), 48)).toEqual([48, 72]);
    expect(songRange(byId('canon-d'), 48)).toEqual([36, 84]);
    expect(songRange(byId('minuet-g'), 48)).toEqual([48, 84]);
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

describe('nearKey', () => {
  const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  it('accepts the key, its octave slips, and survives a badly measured key', () => {
    // G3 was mis-measured as if it were A3
    const cal = { ...DEFAULT_CAL, keys: { 55: et(57) } };
    expect(nearKey(cal, et(55), 55)).toBe(true); // real G3 still counts
    expect(nearKey(cal, et(67), 55)).toBe(true); // octave slip
    expect(nearKey(DEFAULT_CAL, et(56), 55)).toBe(false); // G#3 is not G3
  });
});


describe('onset detection', () => {
  it('catches a key struck again while it is still ringing', async () => {
    const { MicEngine } = await import('../audio/mic');
    const sr = 48000;
    const f = 196; // G3, as in Happy Birthday
    // two strikes 0.6 s apart; the second is as quiet as the ringing first note
    const total = sr * 1.4;
    const sig = new Float32Array(total);
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const strike = (t0: number, amp: number) => {
      for (let i = Math.floor(t0 * sr); i < total; i++) {
        const t = i / sr - t0;
        const env = amp * Math.exp(-t * 2.5) * Math.min(1, t * 400);
        const thump = t < 0.02 ? amp * 0.6 * rnd() * Math.exp(-t * 250) : 0; // hammer noise
        sig[i] += thump + env * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * 2 * f * t) + 0.3 * Math.sin(2 * Math.PI * 3 * f * t));
      }
    };
    strike(0.1, 0.3);
    strike(0.7, 0.07);
    const eng = new MicEngine() as unknown as { buf: Float32Array; detectOnset: (now: number, rms: number) => boolean };
    const hop = 960; // 20 ms tick
    const onsets: number[] = [];
    for (let end = 2048; end < total; end += hop) {
      eng.buf = sig.slice(end - 2048, end);
      let e = 0;
      for (const v of eng.buf) e += v * v;
      const now = (end / sr) * 1000;
      if (eng.detectOnset(now, Math.sqrt(e / 2048))) onsets.push(Math.round(now));
    }
    expect(onsets.some((t) => t >= 100 && t < 160)).toBe(true);
    expect(onsets.some((t) => t >= 700 && t < 760)).toBe(true);
    // and no stream of false onsets while the notes just ring
    expect(onsets.length).toBeLessThanOrEqual(4);
  });
});

describe('tuning wizard capture', async () => {
  const { analyzeCapture } = await import('../piano/captureKey');
  const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  const run = (gen: (t: number) => number, prevFreq = 0, ms = 1500) => {
    const frames: { t: number; freq: number; rms: number }[] = [];
    for (let t = 0; t <= ms; t += 20) {
      frames.push({ t, freq: gen(t), rms: 0.05 });
      const r = analyzeCapture(frames, 71, prevFreq, 0, t);
      if (r) return { ...r, t };
    }
    return null;
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const talk = () => (rnd() < 0.5 ? 0 : 110 + rnd() * 200); // random voice pitches
  it('hears B4 through background talking, even with octave slips', () => {
    const r = run((t) => (t < 500 ? talk() : t % 60 === 0 ? et(83) * 0.99 : rnd() < 0.3 ? talk() : et(71) * 0.99));
    expect(r?.kind).toBe('accept');
    expect(Math.abs(1200 * Math.log2(r!.kind === 'accept' ? r!.freq / (et(71) * 0.99) : 1))).toBeLessThan(5);
  });
  it('does not take the previous key still ringing as this key', () => {
    expect(run(() => et(70), et(70))).toBeNull();
  });
  it('flags a clearly different key', () => {
    expect(run(() => et(67))?.kind).toBe('mismatch');
  });
});
