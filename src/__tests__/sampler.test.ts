import { describe, expect, it } from 'vitest';
import { findRoot, shapeSample } from '../audio/sampler';

const sr = 48000;
function clip(fn: (t: number) => number, sec: number, lead = 0.3) {
  const x = new Float32Array(Math.round(sr * (sec + lead + 0.3)));
  const a = Math.round(lead * sr);
  for (let i = 0; i < sec * sr; i++) x[a + i] = fn(i / sr);
  return x;
}

describe('make-your-own sound', () => {
  it('trims silence, normalises and caps the length', () => {
    const y = shapeSample(clip((t) => 0.2 * Math.sin(2 * Math.PI * 300 * t), 4), sr)!;
    expect(y.length).toBeLessThanOrEqual(3 * sr + 1);
    let peak = 0;
    for (const v of y) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.85);
    expect(Math.abs(y[0])).toBeLessThan(0.05);
  });
  it('ignores silence', () => {
    expect(shapeSample(new Float32Array(sr), sr)).toBeNull();
  });
  it('plays a sung note in tune', () => {
    const y = shapeSample(clip((t) => 0.3 * Math.sin(2 * Math.PI * 440 * t), 0.8), sr)!;
    const r = findRoot(y, sr);
    expect(r.pitched).toBe(true);
    expect(r.root).toBeCloseTo(69, 0);
  });
  it('puts a cough or clap on middle C', () => {
    let s = 1;
    const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const y = shapeSample(clip((t) => noise() * Math.exp(-t * 6), 0.6), sr)!;
    expect(findRoot(y, sr)).toEqual({ root: 60, pitched: false });
  });
});
