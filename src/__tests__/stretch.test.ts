import { describe, expect, it } from 'vitest';
import { stretch } from '../audio/stretch';
import { PitchDetector } from '../audio/pitch';

const sr = 48000;
const tone = (f: number, sec: number) =>
  Float32Array.from({ length: sr * sec }, (_, i) => 0.5 * Math.sin((2 * Math.PI * f * i) / sr));
/** play back `x` `rate` times faster (linear interpolation), like an AudioBufferSourceNode */
const resample = (x: Float32Array, rate: number) =>
  Float32Array.from({ length: Math.floor(x.length / rate) }, (_, i) => {
    const p = i * rate;
    const a = Math.floor(p);
    return x[a] + (x[Math.min(x.length - 1, a + 1)] - x[a]) * (p - a);
  });
const pitchOf = (x: Float32Array) =>
  new PitchDetector(2048, sr, 60, 2000).detect(x.subarray(x.length / 2 - 1024, x.length / 2 + 1024)).freq;

describe('same speed on every key', () => {
  it('stretching keeps the pitch and changes the length', () => {
    const y = stretch(tone(300, 1), 1.5, sr);
    expect(y.length / sr).toBeCloseTo(1.5, 1);
    expect(pitchOf(y)).toBeCloseTo(300, -1);
  });
  for (const semis of [12, 7, -5, -12]) {
    it(`shifting ${semis} semitones keeps the length`, () => {
      const r = 2 ** (semis / 12);
      const out = resample(stretch(tone(300, 1), r, sr), r);
      expect(out.length / sr).toBeCloseTo(1, 1);
      expect(pitchOf(out) / (300 * r)).toBeCloseTo(1, 1);
    });
  }
  it('is quick enough to make a key on the fly', () => {
    const t = performance.now();
    stretch(tone(300, 3), 2, sr);
    expect(performance.now() - t).toBeLessThan(400);
  });
});
