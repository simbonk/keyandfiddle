import { describe, expect, it } from 'vitest';
import { applyWarp, findWarp, noteMidi, recognize } from '../omr/omr';

// A staff drawn on a page that bows like a phone photo of a book: a tilt plus
// a curve, so each line drifts by about half a staff space end to end.
function bowedStaff(bend: number) {
  const w = 1400;
  const h = 360;
  const sp = 16;
  const data = new Uint8Array(w * h).fill(235);
  const drift = (x: number) => bend * (((x - w / 2) / (w / 2)) * 0.6 + ((x - w / 2) / (w / 2)) ** 2 * 0.4);
  const ink = (x: number, y: number) => {
    const X = Math.round(x);
    const Y = Math.round(y + drift(x));
    if (X >= 0 && Y >= 0 && X < w && Y < h) data[Y * w + X] = 20;
  };
  const top = 140;
  for (let i = 0; i < 5; i++) for (let x = 60; x < 1340; x++) for (let t = 0; t < 2; t++) ink(x, top + i * sp + t);
  // clef-ish mark and the final barline
  for (let y = top - 20; y < top + 4 * sp + 20; y++) for (let t = 0; t < 4; t++) ink(80 + t, y);
  for (let y = top; y <= top + 4 * sp; y++) for (let t = 0; t < 5; t++) ink(1335 + t, y);
  // quarter notes walking up from G4 (step 2) to D5 (step 6), stems up
  const steps = [2, 3, 4, 5, 6, 5, 4, 3, 2];
  steps.forEach((st, i) => {
    const cx = 200 + i * 120;
    const cy = top + 4 * sp - (st * sp) / 2;
    for (let dy = -7; dy <= 7; dy++) for (let dx = -9; dx <= 9; dx++) if ((dx / 9) ** 2 + (dy / 7) ** 2 <= 1) ink(cx + dx, cy + dy);
    for (let y = cy - 3.3 * sp; y <= cy; y++) for (let t = 0; t < 2; t++) ink(cx + 8 + t, y);
  });
  return { g: { w, h, data }, steps };
}

describe('photo reader', () => {
  it('leaves a straight scan alone', () => {
    const { g } = bowedStaff(0);
    expect(findWarp(g).max).toBeLessThan(1);
  });
  it('levels a tilted, curved page and reads its notes', () => {
    const { g, steps } = bowedStaff(14);
    const warp = findWarp(g);
    expect(warp.max).toBeGreaterThan(5);
    const flat = { ...g, data: new Uint8Array(applyWarp(g.data, g.w, g.h, warp)) };
    const r = recognize(flat);
    expect(r.staves.length).toBe(1);
    const names = r.notes.sort((a, b) => a.x - b.x).map((n) => noteMidi(n, r.staves[0], 0));
    const want = steps.map((s) => [64, 65, 67, 69, 71, 72, 74][s]);
    expect(names).toEqual(want);
  });
});
