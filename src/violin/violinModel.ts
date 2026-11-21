// Turns body + hand landmarks into an estimated violin and bow, plus posture
// checks. MediaPipe doesn't know what a violin is, so we infer it from where
// the chin, left hand and right hand are (best effort, with a manual "pin").

import type { Pt, TrackFrame } from './tracking';

// Real violin proportions (mm), measured from the tail (chinrest end).
export const MM = {
  tailToBridge: 195,
  tailToNut: 523,
  nutToScroll: 70,
  bodyLen: 356,
  fingerboard: 270,
  bow: 750,
  stringSpanNut: 16,
  stringSpanBridge: 34,
};
const T_BRIDGE = MM.tailToBridge / MM.tailToNut; // 0.373
const T_FB_END = (MM.tailToNut - MM.fingerboard) / MM.tailToNut; // 0.484
export const T_SOUND_IDEAL = (T_BRIDGE + T_FB_END) / 2;

export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const len = (a: Pt) => Math.hypot(a.x, a.y);
export const norm = (a: Pt): Pt => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const mid = (a: Pt, b: Pt) => lerp(a, b, 0.5);

/** Map normalised video coords to screen pixels for an object-fit: cover (or contain) video. */
export function coverMap(vw: number, vh: number, cw: number, ch: number, contain = false) {
  const s = contain ? Math.min(cw / vw, ch / vh) : Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * s) / 2;
  const oy = (ch - vh * s) / 2;
  return (p: Pt): Pt => ({ x: ox + p.x * vw * s, y: oy + p.y * vh * s });
}

export interface ViolinGeom {
  tail: Pt;
  nut: Pt;
  bridge: Pt;
  scroll: Pt;
  u: Pt; // unit vector tail -> nut (screen)
  n: Pt; // unit perpendicular, points to the G-string side (screen up)
  axisLen: number; // projected tail -> nut length in px
  pxPerMm: number; // true scale (from body size), not foreshortened
  v3: [number, number, number]; // estimated 3D direction tail -> nut (x right, y up, z towards camera)
  source: 'tracked' | 'pinned' | 'ghost';
}

/** Shoulder width to violin (tail->nut) length. A 4/4 violin is ~523mm vs ~390mm shoulders; kids' sizes scale similarly. */
export const VIOLIN_PER_SHOULDER = 1.35;

export function makeGeom(tail: Pt, nut: Pt, source: ViolinGeom['source'], truePx?: number): ViolinGeom {
  const v = sub(nut, tail);
  const u = norm(v);
  let n = { x: u.y, y: -u.x };
  if (n.y > 0) n = mul(n, -1);
  const axisLen = len(v);
  const trueLen = Math.max(axisLen, truePx ?? axisLen);
  const pxPerMm = trueLen / MM.tailToNut;
  // foreshortening tells us how much the violin points towards the camera
  const c = Math.min(1, axisLen / trueLen);
  const sn = Math.sqrt(1 - c * c);
  const v3: [number, number, number] = [u.x * c, -u.y * c, sn];
  return {
    tail,
    nut,
    bridge: lerp(tail, nut, T_BRIDGE),
    scroll: add(nut, mul(u, MM.nutToScroll * (axisLen / MM.tailToNut))),
    u,
    n,
    axisLen,
    pxPerMm,
    v3,
    source,
  };
}

const STRING_TILT_DEG = [24, 8, -8, -24];

/**
 * Where a perfect bow should point on screen (frog -> tip) for a string:
 * perpendicular to the violin in 3D, tilted for the string, then projected.
 * Returns the 2D unit direction and how much of the bow's length is visible.
 */
export function idealBowDir(g: ViolinGeom, stringIdx: number): { d: Pt; visible: number } {
  const [vx, vy, vz] = g.v3;
  // b0 = v x up  (horizontal, perpendicular to the violin)
  let b0: [number, number, number] = [-vz, 0, vx];
  const bl = Math.hypot(...b0) || 1;
  b0 = [b0[0] / bl, b0[1] / bl, b0[2] / bl];
  // tip goes away from the bow hand (towards screen-left)
  if (b0[0] > 0) b0 = [-b0[0], -b0[1], -b0[2]];
  // w = v x b0, used to tilt around the violin axis for string crossings
  let w: [number, number, number] = [vy * b0[2] - vz * b0[1], vz * b0[0] - vx * b0[2], vx * b0[1] - vy * b0[0]];
  if (w[1] > 0) w = [-w[0], -w[1], -w[2]]; // positive tilt -> tip lower (G string: bow arm high)
  const si = Math.max(0, Math.min(3, stringIdx));
  const lo = Math.floor(si);
  const hi = Math.min(3, lo + 1);
  const tilt = STRING_TILT_DEG[lo] + (STRING_TILT_DEG[hi] - STRING_TILT_DEG[lo]) * (si - lo);
  const th = (tilt * Math.PI) / 180;
  const b = [b0[0] * Math.cos(th) + w[0] * Math.sin(th), b0[1] * Math.cos(th) + w[1] * Math.sin(th)];
  const visible = Math.hypot(b[0], b[1]);
  return { d: norm({ x: b[0], y: -b[1] }), visible };
}

/** Position on string `s` (0=G..3=E) at fraction f from nut (0) to bridge (1). Spacing exaggerated for visibility. */
export function stringPoint(g: ViolinGeom, s: number, f: number, exaggerate = 2.2): Pt {
  const base = lerp(g.nut, g.bridge, f);
  const span = (MM.stringSpanNut + (MM.stringSpanBridge - MM.stringSpanNut) * f) * g.pxPerMm * exaggerate;
  const off = (1.5 - s) * (span / 3);
  return add(base, mul(g.n, off));
}

export interface BodyFrame {
  origin: Pt;
  ex: Pt;
  ey: Pt;
  scale: number;
}

export function bodyFrame(pose: Pt[]): BodyFrame | null {
  const ls = pose[11];
  const rs = pose[12];
  if (!ls || !rs) return null;
  const origin = mid(ls, rs);
  const v = sub(ls, rs);
  const scale = len(v);
  if (scale < 5) return null;
  const ex = norm(v);
  return { origin, ex, ey: { x: -ex.y, y: ex.x }, scale };
}
export function toBody(f: BodyFrame, p: Pt): Pt {
  const d = sub(p, f.origin);
  return { x: dot(d, f.ex) / f.scale, y: dot(d, f.ey) / f.scale };
}
export function fromBody(f: BodyFrame, l: Pt): Pt {
  return add(f.origin, add(mul(f.ex, l.x * f.scale), mul(f.ey, l.y * f.scale)));
}

export interface Pin {
  tail: Pt; // body-frame coords
  scroll: Pt;
}

export interface BowGeom {
  frog: Pt;
  tip: Pt;
  d: Pt; // unit frog -> tip
  lenPx: number;
  contact: Pt | null; // where the bow crosses the violin's string axis
  contactT: number | null; // along the violin from tail (0) to nut (1)
  bowPos: number | null; // 0 = frog .. 1 = tip at the contact point
  angleErr: number | null; // degrees away from perpendicular to the strings
}

export interface Analysis {
  pose: Pt[] | null;
  left: Pt[] | null;
  right: Pt[] | null;
  violin: ViolinGeom | null;
  bow: BowGeom | null;
  checks: PostureCheck[];
}

export interface PostureCheck {
  id: string;
  label: string;
  ok: boolean | null; // null = can't tell
  tip: string;
}

function nearestHand(hands: Pt[][], p: Pt | undefined): number {
  if (!p) return -1;
  let best = -1;
  let bd = Infinity;
  hands.forEach((h, i) => {
    const d = len(sub(h[0], p));
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export class ViolinAnalyzer {
  private sm: { tail: Pt; nut: Pt } | null = null;
  private frogHist: { t: number; p: Pt }[] = [];
  bowDir: 'down' | 'up' | null = null;
  pin: Pin | null = null;

  analyze(frame: TrackFrame, map: (p: Pt) => Pt, ghost: boolean, targetString?: number): Analysis {
    const pose = frame.pose ? frame.pose.map(map) : null;
    const hands = frame.hands.map((h) => h.map(map));
    let leftIdx = -1;
    let rightIdx = -1;
    if (pose) {
      leftIdx = nearestHand(hands, pose[15]);
      rightIdx = nearestHand(
        hands.map((h, i) => (i === leftIdx ? [{ x: 1e9, y: 1e9 }] : h)),
        pose[16],
      );
      if (rightIdx === leftIdx) rightIdx = -1;
    } else if (hands.length) {
      // without a body, the hand further left on screen is the violin hand
      const sorted = hands.map((h, i) => [h[0].x, i] as const).sort((a, b) => a[0] - b[0]);
      leftIdx = sorted[0][1];
      rightIdx = sorted.length > 1 ? sorted[sorted.length - 1][1] : -1;
    }
    const left = leftIdx >= 0 ? hands[leftIdx] : null;
    const right = rightIdx >= 0 ? hands[rightIdx] : null;

    // --- violin ---
    let tail: Pt | null = null;
    let nut: Pt | null = null;
    let source: ViolinGeom['source'] = 'tracked';
    const bf = pose ? bodyFrame(pose) : null;
    if (this.pin && bf) {
      tail = fromBody(bf, this.pin.tail);
      const scroll = fromBody(bf, this.pin.scroll);
      nut = lerp(tail, scroll, MM.tailToNut / (MM.tailToNut + MM.nutToScroll));
      source = 'pinned';
    } else if (pose && bf) {
      const ls = pose[11];
      const nose = pose[0];
      tail = add(lerp(ls, nose, 0.42), { x: 0, y: bf.scale * 0.12 });
      if (left && !ghost) {
        nut = mid(left[5], left[2]);
        // a hand right next to the chin can't be holding the neck
        if (len(sub(nut, tail)) < bf.scale * 0.45) nut = null;
      }
      if (!nut) {
        // ghost: ideal hold, scroll out to the left and a little up, ~45 degrees towards the camera
        const dir = norm({ x: -0.92, y: -0.3 });
        nut = add(tail, mul(dir, bf.scale * VIOLIN_PER_SHOULDER * 0.72));
        source = 'ghost';
      }
    }
    let violin: ViolinGeom | null = null;
    if (tail && nut) {
      if (this.sm && source !== 'ghost') {
        this.sm = { tail: lerp(this.sm.tail, tail, 0.4), nut: lerp(this.sm.nut, nut, 0.4) };
      } else this.sm = { tail, nut };
      violin = makeGeom(this.sm.tail, this.sm.nut, source, bf ? bf.scale * VIOLIN_PER_SHOULDER : undefined);
    } else this.sm = null;

    // --- bow (from the right hand) ---
    let bow: BowGeom | null = null;
    if (right) {
      const frog = mid(right[9], right[4]);
      const d = norm(sub(right[5], right[17]));
      const pxPerMm = violin?.pxPerMm ?? (bf ? (bf.scale * VIOLIN_PER_SHOULDER) / MM.tailToNut : 0.5);
      let lenPx = MM.bow * pxPerMm;
      let contact: Pt | null = null;
      let contactT: number | null = null;
      let bowPos: number | null = null;
      let angleErr: number | null = null;
      if (violin) {
        // compare against the ideal bow for the string we're meant to play (middle strings if unknown)
        const ideal = idealBowDir(violin, targetString ?? 1.5);
        lenPx = MM.bow * pxPerMm * Math.max(0.35, ideal.visible);
        const hit = intersect(frog, d, violin.tail, violin.u);
        if (hit) {
          const along = hit.s; // px from frog
          contact = add(frog, mul(d, along));
          contactT = hit.t / violin.axisLen;
          if (along >= -20 && along <= lenPx * 1.1) bowPos = Math.max(0, Math.min(1, along / lenPx));
        }
        if (ideal.visible > 0.35) angleErr = (Math.acos(Math.max(-1, Math.min(1, dot(d, ideal.d)))) * 180) / Math.PI;
      }
      const tip = add(frog, mul(d, lenPx));
      bow = { frog, tip, d, lenPx, contact, contactT, bowPos, angleErr };
      this.trackBowDirection(frame.t, frog, d, pxPerMm);
    } else {
      this.frogHist = [];
      this.bowDir = null;
    }

    return { pose, left, right, violin, bow, checks: postureChecks(pose, left, violin, bow) };
  }

  private trackBowDirection(t: number, frog: Pt, d: Pt, pxPerMm: number) {
    this.frogHist.push({ t, p: frog });
    while (this.frogHist.length && t - this.frogHist[0].t > 220) this.frogHist.shift();
    if (this.frogHist.length < 3) return;
    const a = this.frogHist[0];
    const dt = (t - a.t) / 1000;
    if (dt <= 0) return;
    const v = dot(sub(frog, a.p), d) / dt / pxPerMm; // mm/s along the bow
    // hand moving away from the tip means the bow is travelling towards the tip: down bow
    if (v < -60) this.bowDir = 'down';
    else if (v > 60) this.bowDir = 'up';
    else if (Math.abs(v) < 15) this.bowDir = null;
  }

  pinFromTaps(pose: Pt[] | null, tail: Pt, scroll: Pt): boolean {
    const bf = pose ? bodyFrame(pose) : null;
    if (!bf) return false;
    this.pin = { tail: toBody(bf, tail), scroll: toBody(bf, scroll) };
    this.sm = null;
    return true;
  }
}

/** Intersect ray p + s*d with line q + t*u. Returns s and t (both in px). */
function intersect(p: Pt, d: Pt, q: Pt, u: Pt): { s: number; t: number } | null {
  const den = d.x * u.y - d.y * u.x;
  if (Math.abs(den) < 1e-6) return null;
  const w = sub(q, p);
  const s = (w.x * u.y - w.y * u.x) / den;
  const t = (w.x * d.y - w.y * d.x) / den;
  return { s, t };
}

function angleBetween(a: Pt, b: Pt) {
  return (Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))) * 180) / Math.PI;
}

export function postureChecks(pose: Pt[] | null, left: Pt[] | null, violin: ViolinGeom | null, bow: BowGeom | null): PostureCheck[] {
  const checks: PostureCheck[] = [];
  if (!pose) {
    return [{ id: 'see', label: 'Step back so I can see you', ok: false, tip: 'Make sure your head, shoulders and both hands are in the picture.' }];
  }
  const ls = pose[11];
  const rs = pose[12];
  const sw = len(sub(ls, rs));
  const nose = pose[0];
  const le = pose[13];
  const lw = pose[15];

  checks.push({
    id: 'shoulders',
    label: 'Shoulders relaxed',
    ok: Math.abs(ls.y - rs.y) < sw * 0.14,
    tip: ls.y < rs.y ? "Don't squeeze with your left shoulder. Let it drop." : 'Keep both shoulders level and relaxed.',
  });
  checks.push({
    id: 'chin',
    label: 'Chin on the chinrest',
    ok: len(sub(nose, ls)) < len(sub(nose, rs)) * 0.93,
    tip: 'Turn your head a little to the left and rest your jaw on the violin.',
  });
  checks.push({
    id: 'scroll',
    label: 'Scroll up high',
    ok: violin && violin.source !== 'ghost' ? violin.scroll.y < violin.tail.y + sw * 0.15 : null,
    tip: 'Point the scroll out to the left and keep it up, about as high as your nose.',
  });
  checks.push({
    id: 'elbow',
    label: 'Elbow under the violin',
    ok: lw && le && le.y > lw.y ? Math.abs(le.x - lw.x) < sw * 0.45 : null,
    tip: 'Swing your left elbow in, so it hangs under the middle of the violin.',
  });
  if (left) {
    const wristBend = angleBetween(sub(left[0], le ?? left[0]), sub(left[9], left[0]));
    checks.push({
      id: 'wrist',
      label: 'Straight wrist',
      ok: le ? wristBend < 40 : null,
      tip: 'Keep your left wrist straight. No pancake hand, no resting it on the neck!',
    });
  }
  if (bow && bow.angleErr !== null) {
    checks.push({
      id: 'bowangle',
      label: 'Bow straight across',
      ok: bow.angleErr < 18,
      tip: 'Keep the bow at a right angle to the strings, like a T.',
    });
  }
  if (bow && bow.contactT !== null) {
    const t = bow.contactT;
    checks.push({
      id: 'contact',
      label: 'Bow between bridge and fingerboard',
      ok: t > T_BRIDGE - 0.02 && t < T_FB_END + 0.04,
      tip: t <= T_BRIDGE ? 'Move the bow away from the bridge a little.' : 'Move the bow closer to the bridge (off the fingerboard).',
    });
  }
  return checks;
}
