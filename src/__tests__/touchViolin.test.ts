import { describe, expect, it } from 'vitest';
import { PitchDetector } from '../audio/pitch';
import { ViolinModel } from '../violin/touch/bowedString';
import { TouchViolinState, violinLayout } from '../violin/touch/instrument';

const SR = 48000;
function bow(midi: number, vel: number) {
  const m = new ViolinModel(SR);
  const s = m.strings[0];
  s.setFrequency(440 * 2 ** ((midi - 69) / 12), true);
  s.bowing = true;
  s.vTarget = vel;
  const all = new Float32Array(128 * 190);
  const b = new Float32Array(128);
  for (let i = 0; i < all.length; i += 128) {
    m.render(b);
    all.set(b, i);
  }
  return new PitchDetector(4096, SR).detect(all.slice(all.length - 4096));
}

describe('bowed string model', () => {
  for (const midi of [55, 62, 69, 76, 83, 88])
    for (const vel of [0.04, 0.12, 0.25])
      it(`plays ${midi} in tune at bow speed ${vel}`, () => {
        const r = bow(midi, vel);
        const cents = 1200 * Math.log2(r.freq / (440 * 2 ** ((midi - 69) / 12)));
        expect(Math.abs(cents)).toBeLessThan(10);
        expect(r.rms).toBeGreaterThan(0.015);
      });
});

describe('touch violin input', () => {
  const mk = () => {
    const v = new TouchViolinState();
    v.L = violinLayout(1180, 760, 5.2);
    return v;
  };
  it('a finger on the A string tape 2 plays C#', () => {
    const v = mk();
    const L = v.L;
    v.down(1, L.semisX(4) + 3, L.stringY(2, L.semisX(4)) + 2, 0);
    expect(v.stopped(2)).toBe(4);
    expect(v.stopped(3)).toBe(0);
  });
  it('the G string hugs the top edge and the bow plays the lane it is in', () => {
    const v = mk();
    const L = v.L;
    expect(L.stringY(0, L.nutX)).toBeLessThan(L.stringY(3, L.nutX));
    expect(L.stringY(0, L.nutX)).toBeLessThan(30);
    v.down(2, L.laneX(1, 400), 400, 0);
    let t = 0;
    for (let i = 0; i < 15; i++) {
      v.move(2, L.laneX(1, 400 - i * 5), 400 - i * 5, (t += 16)); // toward the edge = up bow
      v.frame(t, 0.016);
    }
    expect(v.sounding()?.string).toBe(1);
    expect(v.sounding()?.dir).toBe('up');
  });
  const bowIn = (v: TouchViolinState, lane: number) => {
    const L = v.L;
    v.down(2, L.laneX(lane, 400), 400, 0);
    let t = 0;
    for (let i = 0; i < 15; i++) {
      v.move(2, L.laneX(lane, 400 - i * 5), 400 - i * 5, (t += 16));
      v.frame(t, 0.016);
    }
    return v.sounding();
  };
  it('a finger caught between two strings plays the one the bow is clearly in', () => {
    const v = mk();
    const L = v.L;
    const x = L.semisX(2);
    // 40% of the way from the D string toward the A string: nearest is D
    const y = L.stringY(1, x) + 0.4 * (L.stringY(2, x) - L.stringY(1, x));
    v.down(1, x, y, 0);
    const s = bowIn(v, 2);
    expect(s?.string).toBe(2);
    expect(s?.midi).toBe(69 + 2);
    const v2 = mk();
    v2.down(1, x, y, 0);
    expect(bowIn(v2, 1)?.string).toBe(1);
  });
  it('a finger right on its string ignores the bow lane', () => {
    const v = mk();
    const L = v.L;
    const x = L.semisX(2);
    v.down(1, x, L.stringY(1, x) + 1, 0);
    expect(bowIn(v, 2)?.string).toBe(1);
  });
  it('the finger nearest the bridge wins', () => {
    const v = mk();
    const L = v.L;
    v.down(1, L.semisX(2), L.stringY(1, L.semisX(2)), 0);
    v.down(2, L.semisX(5), L.stringY(1, L.semisX(5)), 0);
    expect(v.stopped(1)).toBe(5);
  });
  it('bowing right is a down bow, and easy bow plays the fingered string', () => {
    const v = mk();
    const L = v.L;
    v.down(1, L.semisX(2), L.stringY(0, L.semisX(2)), 0); // B on G string... semis 2 = A3
    v.down(2, L.laneX(3, 300), 300, 0); // bow in the E string's lane
    let t = 0;
    for (let i = 0; i < 20; i++) {
      t += 16;
      v.move(2, L.laneX(3, 300 + i * 4), 300 + i * 4, t); // away from the top edge = down bow
      v.frame(t, 0.016);
    }
    const s = v.sounding();
    expect(s?.string).toBe(0);
    expect(s?.midi).toBe(57);
    expect(s?.dir).toBe('down');
    v.opts.easyBow = false;
    v.frame(t, 0.016);
    expect(v.sounding()?.string).toBe(3);
  });
  it('a bow change starts a new stroke', () => {
    const v = mk();
    const L = v.L;
    v.down(2, L.laneX(2, 300), 300, 0);
    const s0 = v.strokeId;
    let t = 0;
    for (let i = 0; i < 10; i++) v.move(2, L.laneX(2, 300 + i * 10), 300 + i * 10, (t += 16));
    const s1 = v.strokeId;
    for (let i = 0; i < 10; i++) v.move(2, L.laneX(2, 390 - i * 10), 390 - i * 10, (t += 16));
    expect(v.strokeId).toBeGreaterThan(s1);
    expect(s1).toBeGreaterThanOrEqual(s0);
  });
});
