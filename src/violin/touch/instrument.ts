// The touch violin's playing surface: layout, multi-touch input and drawing.
//
// The iPad is held like a violin with the scroll on the left. The neck and
// the bow zone are drawn at real violin size along the top edge (or the bottom
// one), G string nearest the edge: the fingers curl over the edge onto the
// strings like they come over the G side of a violin. Finger spacing
// is what your hand will meet on a real violin. The left hand stops the
// strings on the neck and the right hand drags along the bow zone: pull right
// for a down bow, push left for an up bow. Where the bow hand is in the zone
// is which part of the bow touches the string (frog on the left, tip on the
// right). Songs come up from below (or down from above) straight onto the spot to press and the
// stretch of bow to use, like the piano's falling notes.

import { midiName, midiToFreq } from '../../audio/notes';
import { FINGER_COLORS, STRINGS, stopFraction, type BowDir, type BowStroke } from '../theory';
import type { VNoteState } from '../violinHighway';
import type { StringMsg } from './violinProcessor';

export const MAX_SEMIS = 8.4;
/** Vibrating string length of a full-size violin, nut to bridge. */
const SCALE_MM = 328;

/** Child violin sizes: name and string length relative to a full-size (4/4) violin. */
export const VIOLIN_SIZES: [string, number][] = [
  ['4/4', 1],
  ['3/4', 307 / 328],
  ['1/2', 287 / 328],
  ['1/4', 266 / 328],
  ['1/8', 240 / 328],
];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  w: number;
  h: number;
  /** CSS pixels per millimetre (after any squeeze to fit a small screen) */
  mm: number;
  x0: number;
  nutX: number;
  fbEnd: number;
  /** touches left of this are the left hand, right of it the bow */
  split: number;
  pad: Rect;
  /** centre line of the strings */
  yc: number;
  /** neck along the top edge (music below) or the bottom edge (music above) */
  top: boolean;
  /** direction from the landing line into the music area: +1 down, -1 up */
  d: 1 | -1;
  /** far end of the music area */
  far: number;
  /** half the neck's width at its widest, for touch filtering and labels */
  neckHalf: number;
  /** where falling notes land */
  strikeY: number;
  openX: number;
  stringY: (s: number, x: number) => number;
  semisX: (semis: number) => number;
  xToSemis: (x: number) => number;
  neckString: (x: number, y: number) => number;
  /** which bow lane a touch in the bow area is in */
  padString: (x: number, y: number) => number;
  /** x of a bow lane's centre line (s may be fractional, for lane edges) at height y */
  laneX: (s: number, y: number) => number;
  /** unit vector of a down bow in lane s (away from the edge, along the lane) */
  laneDir: (s: number) => { x: number; y: number };
  /** where the bow lanes start (just past the strings) and end */
  laneY0: number;
  laneY1: number;
  spacing: (x: number) => number;
}

/** CSS pixels per millimetre of the screen (best guess: browsers don't tell us the real size). */
export function screenPxPerMm(): number {
  if (typeof window === 'undefined') return 5.2;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (!coarse) return 96 / 25.4;
  const short = Math.min(screen.width, screen.height);
  if (short === 744) return 163 / 25.4; // iPad mini
  if (short >= 700) return 132 / 25.4; // every other iPad, Air included
  return 153 / 25.4; // phones
}

/**
 * @param mm CSS px per mm of the screen
 * @param big make the strings 1.5x further apart (easier for big fingers)
 * @param top neck along the top edge
 * @param size violin size as a fraction of full size (see VIOLIN_SIZES)
 */
export function violinLayout(w: number, h: number, mm: number, big = false, top = true, size = 1): Layout {
  mm *= size;
  let wm = (big ? 1.5 : 1) * mm; // across the strings
  // short screens (a phone on its side): leave room for the music
  const want = 4 + 7.6 * 3 + 6;
  if (want * wm > h * 0.3) wm = (h * 0.3) / want;
  const scrollLen = 24;
  const gapLen = 8;
  const neckLen = SCALE_MM * stopFraction(MAX_SEMIS + 0.25);
  const minPad = 55;
  // lengths along the strings are real size if they fit, else squeezed
  const k = Math.min(1, (w - 16) / ((scrollLen + neckLen + gapLen + minPad) * mm));
  const lm = mm * k;
  const x0 = 8;
  const nutX = x0 + scrollLen * lm;
  const semisX = (s: number) => nutX + SCALE_MM * stopFraction(Math.max(0, s)) * lm;
  const fbEnd = semisX(MAX_SEMIS + 0.25);
  const padX = fbEnd + gapLen * lm;
  // the bow zone is a column down the far end of the screen: bow up and down in it
  const pad = { x: padX, y: 0, w: w - 10 - padX, h };
  // string spacing: 6 mm at the nut widening to 7.6 mm (real is 5.5 -> 7)
  const padSp = 8.5 * wm;
  const spacing = (x: number) => {
    if (x >= padX) return padSp;
    const t = Math.max(0, Math.min(1, (x - nutX) / (fbEnd - nutX)));
    return (6 + 1.6 * t) * wm;
  };
  // G string hugs the edge the hand curls over (top, or bottom)
  const e = top ? 1 : -1;
  // flush with the screen edge: the hand curls over the edge straight onto it
  const gY = top ? 1.5 : h - 1.5;
  const stringY = (s: number, x: number) => {
    if (x > fbEnd && x < padX) {
      const t = (x - fbEnd) / (padX - fbEnd);
      return gY + e * s * (spacing(fbEnd) * (1 - t) + padSp * t);
    }
    return gY + e * s * spacing(x);
  };
  const full = stopFraction(MAX_SEMIS);
  const xToSemis = (x: number) => {
    const frac = Math.max(0, Math.min(full, (x - nutX) / (SCALE_MM * lm)));
    return -12 * Math.log2(1 - frac);
  };
  const nearest = (y: number, x: number) => {
    let best = 0;
    for (let s = 1; s < 4; s++) if (Math.abs(stringY(s, x) - y) < Math.abs(stringY(best, x) - y)) best = s;
    return best;
  };
  // Bow lanes fan out like a real bow arm: the bow leans a little more for
  // each lower string (E straight across, G tilted the most toward the neck).
  const laneY0 = gY + e * (3 * padSp + 12);
  const laneY1 = top ? h - 8 : 8;
  const FT = [0.5, 0.64, 0.77, 0.88]; // lane centres where the bow meets the strings
  const FB = [0.06, 0.33, 0.6, 0.88]; // ... and at the far end of the screen
  const fracOf = (arr: number[], sf: number) => {
    const i = Math.max(0, Math.min(2, Math.floor(sf)));
    return arr[i] + (arr[i + 1] - arr[i]) * (sf - i);
  };
  const laneX = (sf: number, y: number) => {
    const t = (y - laneY0) / (laneY1 - laneY0);
    return padX + pad.w * (fracOf(FT, sf) + (fracOf(FB, sf) - fracOf(FT, sf)) * t);
  };
  const laneDir = (st: number) => {
    const dx = laneX(st, laneY1) - laneX(st, laneY0);
    const dy = laneY1 - laneY0;
    const n = Math.hypot(dx, dy) || 1;
    return { x: dx / n, y: dy / n };
  };
  const padString = (x: number, y: number) => {
    const yy = top ? Math.max(laneY0, y) : Math.min(laneY0, y);
    let best = 0;
    for (let st = 1; st < 4; st++) if (Math.abs(laneX(st, yy) - x) < Math.abs(laneX(best, yy) - x)) best = st;
    return best;
  };
  const yc = gY + e * 1.5 * spacing(fbEnd);
  const neckHalf = 1.5 * spacing(fbEnd) + 4 * wm;
  const farString = gY + e * 3 * Math.max(padSp, spacing(fbEnd));
  return {
    w,
    h,
    mm: lm,
    x0,
    nutX,
    fbEnd,
    split: (fbEnd + padX) / 2,
    pad,
    yc,
    top,
    d: top ? 1 : -1,
    far: top ? h - 4 : 4,
    neckHalf,
    strikeY: farString + e * (4 * wm + 10),
    openX: (x0 + nutX) / 2,
    stringY,
    semisX,
    xToSemis,
    neckString: (x, y) => nearest(y, Math.max(nutX, Math.min(fbEnd, x))),
    padString,
    laneX,
    laneDir,
    laneY0,
    laneY1,
    spacing,
  };
}

export interface ViolinOptions {
  /** fingers snap to the nearest note (off = slide freely, play out of tune) */
  snap: boolean;
  /** the string your finger is on plays, wherever the bow is */
  easyBow: boolean;
  vibrato: boolean;
}

interface Finger {
  s: number;
  /** the neighbouring string when the finger sits well between two strings (the bow decides) */
  alt: number | null;
  semis: number;
  x: number;
  y: number;
  t: number;
}

interface Bow {
  id: number;
  x: number;
  y: number;
  lastT: number;
  lastMove: number;
  /** px/s, positive = down bow (away from the edge the neck is on) */
  speed: number;
  /** 0 frog .. 1 tip, from how far the bow has travelled */
  pos: number;
}

export interface Sounding {
  string: number;
  midi: number;
  /** -0.25..0.25 bow velocity sent to the model */
  vel: number;
  dir: BowDir | null;
  /** 0 frog .. 1 tip */
  bowPos: number;
}

interface StrOut {
  freq: number;
  bowing: boolean;
  vel: number;
  vib: number;
}

const DOWN = '#ff9f1c';
const UP = '#2ec4f1';

/** Multi-touch state of the violin, turned into string commands each frame. */
export class TouchViolinState {
  fingers = new Map<number, Finger>();
  bow: Bow | null = null;
  L: Layout = violinLayout(1000, 600, 5.2);
  opts: ViolinOptions = { snap: true, easyBow: true, vibrato: true };
  /** strings the demo is playing (overrides touch) */
  sent: StrOut[] = STRINGS.map((s) => ({ freq: midiToFreq(s.midi), bowing: false, vel: 0, vib: 0 }));
  private noteSince = 0;
  private notePitch = -1;
  lastDir: BowDir | null = null;
  /** time of the last bow change or bow landing: lets the same note be played again */
  strokeId = 0;
  activeString: number | null = null;
  lastBowPos = 0.1;

  down(id: number, x: number, y: number, t: number) {
    const L = this.L;
    if (x < L.split) {
      // ignore touches far above the neck (the music area)
      if (Math.abs(y - L.yc) < L.neckHalf + 14 * L.mm) this.fingers.set(id, this.finger(x, y, t));
    } else if (!this.bow) {
      this.bow = { id, x, y, lastT: t, lastMove: t, speed: 0, pos: this.lastBowPos };
      this.strokeId++;
    }
  }

  move(id: number, x: number, y: number, t: number) {
    const f = this.fingers.get(id);
    if (f) {
      const nf = this.finger(x, y, f.t);
      // keep "most recent" only when the finger lands on a new string
      if (nf.s !== f.s && nf.alt !== f.s) nf.t = t;
      this.fingers.set(id, nf);
      return;
    }
    const b = this.bow;
    if (!b || b.id !== id) return;
    const dt = Math.max(1, t - b.lastT);
    // the bow moves across the strings, along the lane it's in
    const u = this.L.laneDir(this.L.padString(x, y));
    const dy = (x - b.x) * u.x + (y - b.y) * u.y;
    const inst = (dy / dt) * 1000;
    b.speed += (inst - b.speed) * Math.min(1, dt / 45);
    // about 25 cm of travel from frog to tip (a little short of a real bow)
    b.pos = Math.max(0, Math.min(1, b.pos + dy / (this.L.mm * 250)));
    this.lastBowPos = b.pos;
    b.x = x;
    b.y = y;
    b.lastT = t;
    if (Math.abs(inst) > 20) b.lastMove = t;
    const dir: BowDir | null = Math.abs(b.speed) > this.L.mm * 6 ? (b.speed > 0 ? 'down' : 'up') : null;
    if (dir && dir !== this.lastDir) {
      if (this.lastDir) this.strokeId++;
      this.lastDir = dir;
    }
  }

  up(id: number) {
    this.fingers.delete(id);
    if (this.bow?.id === id) {
      this.bow = null;
      this.lastDir = null;
    }
  }

  clear() {
    this.fingers.clear();
    this.bow = null;
    this.lastDir = null;
  }

  private finger(x: number, y: number, t: number): Finger {
    const L = this.L;
    const s = L.neckString(x, y);
    let semis = Math.min(MAX_SEMIS, L.xToSemis(x));
    if (semis < 0.5) semis = 0; // on the scroll / at the nut: no note stopped
    // well off the string toward a neighbour: either string could be meant
    const xx = Math.max(L.nutX, Math.min(L.fbEnd, x));
    const off = y - L.stringY(s, xx);
    const sp = L.spacing(xx);
    let alt: number | null = null;
    if (Math.abs(off) > 0.22 * sp) {
      // string numbers grow away from the edge the G string hugs
      const toward = Math.sign(off) === (L.top ? 1 : -1) ? s + 1 : s - 1;
      if (toward >= 0 && toward < 4) alt = toward;
    }
    return { s, alt, semis, x, y, t };
  }

  /** The bow lane the bow is in, and whether it's clearly inside it (not near an edge). */
  bowLane(): { s: number; clear: boolean } | null {
    const b = this.bow;
    if (!b) return null;
    const L = this.L;
    const s = L.padString(b.x, b.y);
    const yy = L.top ? Math.max(L.laneY0, b.y) : Math.min(L.laneY0, b.y);
    const half = Math.abs(L.laneX(s + 0.5, yy) - L.laneX(s - 0.5, yy)) / 2 || 1;
    return { s, clear: Math.abs(b.x - L.laneX(s, yy)) < 0.6 * half };
  }

  /** The string a finger is on: between two strings, a bow clearly in one of their lanes picks it. */
  fingerString(f: Finger): number {
    if (f.alt === null) return f.s;
    const lane = this.bowLane();
    return lane && lane.clear && lane.s === f.alt ? f.alt : f.s;
  }

  /** Semitones stopped on string s (the finger nearest the bridge wins, like a real violin). */
  stopped(s: number): number {
    let best = 0;
    for (const f of this.fingers.values()) if (this.fingerString(f) === s && f.semis > best) best = f.semis;
    if (!best) return 0;
    return this.opts.snap ? Math.round(best) : best;
  }

  /** Which string the bow is playing. */
  bowString(): number | null {
    if (!this.bow) return null;
    if (this.opts.easyBow && this.fingers.size) {
      let last: Finger | null = null;
      // a finger on a string, or a touch on the scroll to pick an open string
      for (const f of this.fingers.values())
        if ((f.semis > 0 || f.x < this.L.nutX) && (!last || f.t > last.t)) last = f;
      if (last) return this.fingerString(last);
    }
    return this.L.padString(this.bow.x, this.bow.y);
  }

  /** What the player is sounding right now (null if the bow is still or off). */
  sounding(): Sounding | null {
    const s = this.activeString;
    const b = this.bow;
    if (s === null || !b) return null;
    const vel = this.sent[s].vel;
    if (Math.abs(vel) < 0.012) return null;
    return {
      string: s,
      midi: STRINGS[s].midi + this.stopped(s),
      vel,
      dir: vel > 0 ? 'down' : 'up',
      bowPos: b.pos,
    };
  }

  /** Advance one frame; returns the changes to send to the sound engine. */
  frame(now: number, dt: number): StringMsg[] {
    const b = this.bow;
    if (b && now - b.lastMove > 55) b.speed *= Math.exp(-dt / 0.05);
    const active = this.bowString();
    this.activeString = active;
    const msgs: StringMsg[] = [];
    for (let s = 0; s < 4; s++) {
      const semis = this.stopped(s);
      const freq = midiToFreq(STRINGS[s].midi + semis);
      let vel = 0;
      if (b && active === s) {
        const sp = Math.abs(b.speed) / this.L.mm; // mm per second, so it feels the same on any screen
        vel = sp < 4 ? 0 : Math.sign(b.speed) * 0.25 * (1 - Math.exp(-sp / 160));
      }
      const bowing = active === s;
      // a little vibrato once a stopped note has been held a moment
      let vib = 0;
      if (bowing && this.opts.vibrato && semis > 0 && Math.abs(vel) > 0.02) {
        const pitch = Math.round(semis * 4);
        if (pitch !== this.notePitch || s !== this.sentVibString) {
          this.notePitch = pitch;
          this.sentVibString = s;
          this.noteSince = now;
        }
        vib = 0.11 * Math.max(0, Math.min(1, (now - this.noteSince - 350) / 500));
      }
      const o = this.sent[s];
      const m: StringMsg = { i: s };
      let changed = false;
      if (Math.abs(o.freq - freq) > 0.01) {
        m.freq = freq;
        // a finger landing is instant; free sliding glides
        m.snap = this.opts.snap;
        o.freq = freq;
        changed = true;
      }
      if (o.bowing !== bowing) {
        m.bowing = bowing;
        o.bowing = bowing;
        changed = true;
      }
      if (Math.abs(o.vel - vel) > 0.001 || (bowing && vel !== 0)) {
        m.vel = vel;
        o.vel = vel;
        changed = true;
      }
      if (Math.abs(o.vib - vib) > 0.002) {
        m.vib = vib;
        o.vib = vib;
        changed = true;
      }
      if (changed) msgs.push(m);
    }
    return msgs;
  }
  private sentVibString = -1;
}

export interface FallingView {
  notes: VNoteState[];
  songBeat: number;
  visibleBeats: number;
  current: VNoteState | null;
  waiting: boolean;
}

export interface DrawTargets {
  /** the note to play now */
  target: { string: number; semis: number; finger: number; bow: BowStroke } | null;
  /** the demo's hand (listen mode) */
  ghost: { string: number; semis: number; bowPos: number; dir: BowDir } | null;
  /** bow progress through the target stroke (0..1) while the note is held */
  progress: number;
  /** falling notes (songs) */
  falling: FallingView | null;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const TAPES: [number, string][] = [
  [2, '1 pointer'],
  [4, '2 middle'],
  [5, '3 ring'],
  [7, '4 pinky'],
];
/** Violin finger numbers (left hand, thumb not counted; piano counts the thumb as 1). */
const FINGER_NAMES = ['', 'pointer', 'middle', 'ring', 'pinky'];
const FONT = '"Baloo 2", system-ui';

/** Width of the falling lane for a finger spot. */
function drawFalling(ctx: CanvasRenderingContext2D, L: Layout, f: FallingView, now: number) {
  const strike = L.strikeY;
  const far = L.far;
  const d = L.d;
  const lo = Math.min(strike, far);
  const span = Math.abs(far - strike);
  const right = L.pad.x - 6;
  // One track per string, in the string's colour, side by side like the
  // strings (E, A, D, G from left to right as the player sees them). The
  // tracks slant toward the scroll, the way a player holding the iPad like a
  // violin looks up the neck (they follow the word angle). Each note slides
  // down its string's track onto the landing line; the finger number on it
  // says where to press, and a dotted line leads to that spot.
  const phi = Math.min(0.96, Math.max(0, -readRot));
  // phones: the tracks run beside the strings, notes travel toward the bow end
  // and land just before it
  let ux = Math.sin(phi);
  let uy = d * Math.cos(phi);
  // across the tracks, toward the G string's side
  let vx = Math.cos(phi);
  let vy = -d * Math.sin(phi);
  const LANE = alongStrings ? Math.min(66, (span - 16) / 4) : 66;
  const W = Math.round(LANE * 0.82); // note thickness
  const r = Math.round(LANE * 0.32); // badge radius
  const off = (s: number) => (1.5 - s) * LANE;
  let cy = strike + d * Math.max(1.5 * LANE * Math.abs(vy) + 34, span * 0.22);
  let cx = L.x0 + 1.5 * LANE * vx + Math.min(190, (right - L.x0) * 0.2);
  if (alongStrings) {
    ux = -1;
    uy = 0;
    vx = 0;
    vy = -d;
    cy = strike + d * (span / 2);
    cx = right - 40;
  }
  const start = (s: number): [number, number] => [cx + vx * off(s), cy + vy * off(s)];
  const at = (s: number, t: number, across = 0): [number, number] => {
    const [px, py] = start(s);
    return [px + ux * t + vx * across, py + uy * t + vy * across];
  };
  // runway: as far as every track can go before leaving the music area
  const edgeY = d > 0 ? lo + span : lo;
  let trackLen = Infinity;
  for (let s = 0; s < 4; s++) {
    const [px, py] = start(s);
    if (ux > 0.01) trackLen = Math.min(trackLen, (right - W / 2 - px) / ux);
    if (ux < -0.01) trackLen = Math.min(trackLen, (px - L.x0) / -ux);
    if (Math.abs(uy) > 0.01) trackLen = Math.min(trackLen, (edgeY - py) / uy);
  }
  trackLen = Math.max(120, trackLen);
  const ppb = trackLen / f.visibleBeats;

  ctx.save();
  // only the music area: not over the bow column
  ctx.beginPath();
  ctx.rect(L.x0, lo, right - L.x0, span);
  ctx.clip();

  // the four tracks
  for (let s = 0; s < 4; s++) {
    const col = STRINGS[s].color;
    const q = [at(s, 0, -LANE / 2 + 3), at(s, 0, LANE / 2 - 3), at(s, trackLen * 2, LANE / 2 - 3), at(s, trackLen * 2, -LANE / 2 + 3)];
    ctx.beginPath();
    ctx.moveTo(...q[0]);
    for (const p of q.slice(1)) ctx.lineTo(...p);
    ctx.closePath();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(L.x0, lo, right - L.x0, span);
  ctx.clip();

  // beat ticks across the tracks
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  for (let bt = Math.ceil(f.songBeat); bt < f.songBeat + f.visibleBeats * 1.5; bt++) {
    const t = (bt - f.songBeat) * ppb;
    ctx.beginPath();
    ctx.moveTo(...at(3, t, -LANE / 2));
    ctx.lineTo(...at(0, t, LANE / 2));
    ctx.stroke();
  }

  const vis = f.notes.filter((n) => n.beat + n.beats > f.songBeat - 0.2 && n.beat < f.songBeat + f.visibleBeats * 1.6);
  for (const n of vis) {
    const isCur = f.current === n;
    let a = n.beat - f.songBeat;
    if (n.state === 'hit') a = Math.max(0, a);
    const b = n.beat + n.beats - f.songBeat - 0.06;
    if (b <= a) continue;
    const t0 = a * ppb;
    const t1 = Math.min(trackLen * 1.7, b * ppb);
    const s = n.fing.string;
    const col = STRINGS[s].color;
    ctx.globalAlpha = n.state === 'hit' ? 0.3 : 1;

    // ---- the note, sliding down its string's track ----
    const c = [at(s, t0, -W / 2), at(s, t0, W / 2), at(s, t1, W / 2), at(s, t1, -W / 2)];
    ctx.beginPath();
    ctx.moveTo(...c[0]);
    for (const q of c.slice(1)) ctx.lineTo(...q);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.fill();
    if (isCur) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    const len = t1 - t0;
    const badge = (t: number, fill: string, stroke: string, text: string, ink: string) => {
      const [bx, by] = at(s, t);
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = `800 ${Math.round(r * 1.35)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx, by + 1);
      ctx.textBaseline = 'alphabetic';
    };
    // finger number at the front, then the note name, then the bow sign
    const fg = n.fing.finger;
    if (len > r * 2 + 6 || n.state !== 'hit') {
      badge(t0 + r + 6, fg === 0 ? '#10082a' : FINGER_COLORS[fg], '#fff', fg === 0 ? 'O' : String(fg), fg === 0 ? '#fff' : '#10082a');
    }
    if (len > r * 4 + 14) {
      const [nx, ny] = at(s, t0 + r * 3 + 12);
      ctx.fillStyle = '#10082a';
      ctx.font = `800 ${Math.round(r * 1.3)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(midiName(n.midi).replace(/\d/, ''), nx, ny + 1);
      ctx.textBaseline = 'alphabetic';
    }
    if (len > r * 6 + 22) {
      const down = n.bow.dir === 'down';
      badge(t0 + r * 5 + 18, down ? DOWN : UP, '#10082a', down ? '⊓' : 'V', '#10082a');
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // landing line across the four tracks, and where each track's note is pressed
  const pulse = f.waiting ? 0.55 + 0.4 * Math.sin(now / 150) : 0.55;
  ctx.strokeStyle = f.waiting ? `rgba(255,214,10,${pulse})` : 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(...at(3, 0, -LANE / 2));
  ctx.lineTo(...at(0, 0, LANE / 2));
  ctx.stroke();
  ctx.lineCap = 'butt';
  const cur = f.current;
  for (let s = 0; s < 4; s++) {
    const [px, py] = at(s, 0);
    // string letter at the end of each track
    ctx.fillStyle = STRINGS[s].color;
    ctx.font = `800 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const [lx, ly] = at(s, -26);
    ctx.fillText(STRINGS[s].name, lx, ly);
    ctx.textBaseline = 'alphabetic';
    // the next note: a moving dotted line from its track to the spot to press
    if (cur && cur.state !== 'hit' && cur.fing.string === s) {
      const hx = cur.fing.semis === 0 ? L.openX : L.semisX(cur.fing.semis);
      const ty = L.stringY(s, Math.max(L.nutX, hx));
      ctx.save();
      ctx.strokeStyle = STRINGS[s].color;
      ctx.lineWidth = 4;
      ctx.setLineDash([8, 9]);
      ctx.lineDashOffset = -now / 25;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(hx, ty);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/**
 * Draw the violin. `mirror` puts the neck on the right (bow with the left
 * hand): everything is laid out as usual and flipped, except the text.
 */
export function drawTouchViolin(
  ctx: CanvasRenderingContext2D,
  st: TouchViolinState,
  t: DrawTargets,
  showNames: boolean,
  now: number,
  mirror = false,
  readAngle = 0,
  tracksAlongStrings = false,
  barInset = 0,
) {
  alongStrings = tracksAlongStrings;
  topInset = barInset;
  // text turns toward the scroll, to face a player looking down the neck
  readRot = (-readAngle * Math.PI) / 180;
  if (!mirror && !readRot) return drawViolinSurface(ctx, st, t, showNames, now);
  ctx.save();
  if (mirror) {
    ctx.translate(st.L.w, 0);
    ctx.scale(-1, 1);
  }
  const plain = ctx.fillText;
  ctx.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number) {
    this.save();
    this.translate(x, y);
    const a = this.textAlign;
    if (mirror) {
      this.scale(-1, 1);
      this.textAlign = a === 'left' ? 'right' : a === 'right' ? 'left' : a;
    }
    if (readRot) this.rotate(mirror ? -readRot : readRot);
    plain.call(this, text, 0, 0);
    this.textAlign = a;
    this.restore();
  } as typeof ctx.fillText;
  try {
    drawViolinSurface(ctx, st, t, showNames, now);
  } finally {
    delete (ctx as unknown as { fillText?: unknown }).fillText;
    ctx.restore();
  }
}

/** Rotation (radians, drawing coordinates) that text is drawn at; see drawTouchViolin. */
let readRot = 0;
/** note tracks run beside the strings (phones) instead of slanting across */
let alongStrings = false;
/** a bar of buttons covers this much of the scroll end of the music area */
let topInset = 0;

/** Run `draw` in a frame turned to the reading angle around (x, y); text inside is not turned again. */
function turned(ctx: CanvasRenderingContext2D, x: number, y: number, draw: () => void) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(readRot);
  const r = readRot;
  readRot = 0;
  try {
    draw();
  } finally {
    readRot = r;
    ctx.restore();
  }
}

/** Lines of text as one block turned to the reading angle, shrunk to fit a w x h box. */
function textBlock(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  lines: { text: string; font: (px: number) => string; px: number; color: string; dy: number }[],
  maxW = Infinity,
  maxH = Infinity,
) {
  let bw = 0;
  for (const l of lines) {
    ctx.font = l.font(l.px);
    bw = Math.max(bw, ctx.measureText(l.text).width);
  }
  const top = Math.min(...lines.map((l) => l.dy - l.px));
  const bot = Math.max(...lines.map((l) => l.dy + l.px * 0.3));
  const bh = bot - top;
  const c = Math.abs(Math.cos(readRot));
  const sn = Math.abs(Math.sin(readRot));
  const k = Math.min(1, maxW / (bw * c + bh * sn), maxH / (bw * sn + bh * c));
  turned(ctx, cx, cy, () => {
    ctx.textAlign = 'center';
    for (const l of lines) {
      ctx.font = l.font(Math.max(8, Math.round(l.px * k)));
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, 0, (l.dy - (top + bot) / 2) * k);
    }
  });
}

function drawViolinSurface(
  ctx: CanvasRenderingContext2D,
  st: TouchViolinState,
  t: DrawTargets,
  showNames: boolean,
  now: number,
) {
  const L = st.L;
  const { pad } = L;
  ctx.clearRect(0, 0, L.w, L.h);
  if (t.falling) drawFalling(ctx, L, t.falling, now);

  const sp0 = L.spacing(L.nutX);
  const sp1 = L.spacing(L.fbEnd);
  const e = L.d; // +1: neck on the top edge, strings go down from it
  // fingerboard edges: the outer edge sits just past the G string, at the screen edge
  const gNut = L.stringY(0, L.nutX);
  const gEnd = L.stringY(0, L.fbEnd);
  const edgeIn = (x: number, sp: number) => L.stringY(3, x) + e * sp * 0.7;
  const edgeOut = (y: number, sp: number) => y - e * sp * 0.6;

  // ---- bow column: the violin's belly, bowing up and down ----
  const bg = ctx.createLinearGradient(pad.x, 0, pad.x + pad.w, 0);
  bg.addColorStop(0, '#6e3510');
  bg.addColorStop(0.5, '#9a5018');
  bg.addColorStop(1, '#6e3510');
  ctx.fillStyle = bg;
  roundRect(ctx, pad.x, 2, pad.w, L.h - 4, 22);
  ctx.fill();
  // lanes, fanned like a bow arm: lean the bow toward a string by bowing in its lane
  ctx.save();
  roundRect(ctx, pad.x, 2, pad.w, L.h - 4, 22);
  ctx.clip();
  const tgtLane = t.target?.string ?? null;
  for (let s = 0; s < 4; s++) {
    const active = st.activeString === s && !!st.bow;
    const wanted = tgtLane === s;
    lanePath(ctx, L, s, 0.47);
    ctx.fillStyle = active ? 'rgba(255,255,255,0.18)' : wanted ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.16)';
    ctx.fill();
    ctx.strokeStyle = STRINGS[s].color;
    ctx.globalAlpha = active || wanted ? 0.9 : 0.35;
    ctx.lineWidth = active || wanted ? 3 : 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    const ly = L.top ? L.h - 18 : 32;
    ctx.fillStyle = STRINGS[s].color;
    ctx.font = `800 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(STRINGS[s].name, L.laneX(s, ly), ly);
  }
  ctx.restore();
  // bridge at the far end of the strings
  const brX = pad.x + pad.w - 6;
  const padTop = L.stringY(0, pad.x) - e * 10;
  const padBot = L.stringY(3, pad.x) + e * 10;
  ctx.fillStyle = '#ecd7ae';
  roundRect(ctx, brX - 4, Math.min(padTop, padBot), 8, Math.abs(padBot - padTop), 3);
  ctx.fill();

  // ---- scroll and pegbox ----
  const sg = ctx.createLinearGradient(L.x0, 0, L.nutX, 0);
  sg.addColorStop(0, '#5a2d0c');
  sg.addColorStop(1, '#8a4a1c');
  ctx.fillStyle = sg;
  const pTop = edgeOut(gNut, sp0) - e * 3;
  const pBot = edgeIn(L.nutX, sp0) + e * 3;
  roundRect(ctx, L.x0, Math.min(pTop, pBot), L.nutX - L.x0, Math.abs(pBot - pTop), 10);
  ctx.fill();

  // ---- fingerboard (tapers wider toward the body) ----
  ctx.fillStyle = '#17140f';
  ctx.beginPath();
  ctx.moveTo(L.nutX, edgeOut(gNut, sp0));
  ctx.lineTo(L.fbEnd + 6, edgeOut(gEnd, sp1));
  ctx.lineTo(L.fbEnd + 6, edgeIn(L.fbEnd, sp1));
  ctx.lineTo(L.nutX, edgeIn(L.nutX, sp0));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f2e3c4';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(L.nutX - 2, edgeOut(gNut, sp0));
  ctx.lineTo(L.nutX - 2, edgeIn(L.nutX, sp0));
  ctx.stroke();

  // tapes
  for (const [semis, label] of TAPES) {
    const x = L.semisX(semis);
    const sp = L.spacing(x);
    const y0 = edgeOut(L.stringY(0, x), sp);
    const y1 = edgeIn(x, sp);
    ctx.fillStyle = 'rgba(242,227,196,0.6)';
    ctx.fillRect(x - 1.5, Math.min(y0, y1), 3, Math.abs(y1 - y0));
    if (!t.falling) {
      const [num, name] = label.split(' ');
      const ly = y1 + e * 14 + (e > 0 ? 0 : 4);
      const col = 'rgba(242,227,196,0.9)';
      const off = readRot ? e * Math.abs(Math.sin(readRot)) * 16 : 0;
      textBlock(ctx, x, ly + e * 6 - 4 + off, [
        { text: num, font: (px) => `800 ${px}px ${FONT}`, px: 20, color: col, dy: e > 0 ? 0 : 18 },
        { text: name, font: (px) => `700 ${px}px ${FONT}`, px: 15, color: col, dy: e > 0 ? 18 : 0 },
      ]);
    }
  }

  // ---- strings ----
  const sounding = st.sounding();
  for (let s = 0; s < 4; s++) {
    const ringing = sounding?.string === s;
    const amp = ringing ? Math.min(1, Math.abs(sounding!.vel) / 0.18) : 0;
    const thick = 2.6 - s * 0.45;
    const path = (fromX: number) => {
      ctx.beginPath();
      ctx.moveTo(fromX, L.stringY(s, fromX));
      ctx.lineTo(L.fbEnd, L.stringY(s, L.fbEnd));
      ctx.lineTo(pad.x, L.stringY(s, pad.x));
      ctx.lineTo(brX, L.stringY(s, pad.x));
    };
    ctx.strokeStyle = STRINGS[s].color;
    ctx.globalAlpha = ringing ? 1 : 0.8;
    ctx.lineWidth = thick;
    path(L.nutX - 4);
    ctx.stroke();
    if (amp > 0) {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = thick + amp * 7;
      path(st.stopped(s) > 0 ? L.semisX(st.stopped(s)) : L.nutX);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // string name on the pegbox (touch it to pick an open string)
    ctx.fillStyle = STRINGS[s].color;
    ctx.font = `800 ${Math.round(Math.min(15, sp0 * 0.75))}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ny = L.stringY(s, L.nutX);
    ctx.fillText(STRINGS[s].name, L.openX, L.top ? Math.max(10, ny) : Math.min(L.h - 10, ny));
    ctx.textBaseline = 'alphabetic';
    if (showNames) {
      ctx.font = `800 ${Math.round(Math.max(11, Math.min(17, sp0 * 0.6)))}px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let k = 1; k <= 8; k++) {
        const x = L.semisX(k);
        ctx.fillText(midiName(STRINGS[s].midi + k).replace(/\d/, ''), x, L.stringY(s, x) + e * L.spacing(x) * 0.45 + 3);
      }
    }
  }

  // ---- target: finger spot and bow lane ----
  const tgt = t.target;
  if (tgt) {
    const col = STRINGS[tgt.string].color;
    // the whole string to play glows
    ctx.save();
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now / 200);
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(L.nutX, L.stringY(tgt.string, L.nutX));
    ctx.lineTo(L.fbEnd, L.stringY(tgt.string, L.fbEnd));
    ctx.lineTo(pad.x, L.stringY(tgt.string, pad.x));
    ctx.stroke();
    ctx.restore();
    const x = tgt.semis === 0 ? L.openX : L.semisX(tgt.semis);
    const y = L.stringY(tgt.string, Math.max(L.nutX, x));
    const r = Math.max(22, L.spacing(x) * 1.15);
    // ripples spreading out from the spot
    for (let k = 0; k < 2; k++) {
      const ph = ((now / 900 + k / 2) % 1);
      ctx.globalAlpha = 0.7 * (1 - ph);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r * (0.9 + ph * 1.3), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the spot itself: finger colour with the finger number, big
    const fillCol = tgt.finger === 0 ? '#10082a' : FINGER_COLORS[tgt.finger];
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + 0.08 * Math.sin(now / 150)), 0, Math.PI * 2);
    ctx.fillStyle = fillCol;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 4;
    ctx.strokeStyle = col;
    ctx.stroke();
    ctx.fillStyle = tgt.finger === 0 ? '#fff' : '#10082a';
    ctx.font = `800 ${Math.round(r * 1.1)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tgt.finger === 0 ? '0' : String(tgt.finger), x, y + 2);
    ctx.textBaseline = 'alphabetic';
    // a label just past the neck saying it in words
    const label =
      tgt.finger === 0
        ? `open ${STRINGS[tgt.string].name}: no finger`
        : `${FINGER_NAMES[tgt.finger]} finger (${tgt.finger}) on ${STRINGS[tgt.string].name}`;
    ctx.font = `800 24px ${FONT}`;
    const tw = ctx.measureText(label).width + 28;
    // turned, the pill reaches further along y and less along x
    const ext = { x: (tw / 2) * Math.abs(Math.cos(readRot)) + 19, y: (tw / 2) * Math.abs(Math.sin(readRot)) + 19 };
    const ly = edgeIn(Math.max(L.nutX, x), L.spacing(x)) + e * (19 + ext.y);
    const lx = Math.max(L.x0 + topInset + ext.x, x);
    turned(ctx, lx, ly, () => {
      ctx.fillStyle = col;
      roundRect(ctx, -tw / 2, -19, tw, 38, 19);
      ctx.fill();
      ctx.fillStyle = '#10082a';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 1);
      ctx.textBaseline = 'alphabetic';
    });
    // the lane to bow in: arrows marching the way to bow
    drawLaneArrows(ctx, L, tgt.string, tgt.bow.dir, now, 1);
  }

  // ---- demo ghost hand ----
  if (t.ghost) {
    const g = t.ghost;
    if (g.semis > 0) {
      const x = L.semisX(g.semis);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(x, L.stringY(g.string, x), L.spacing(x) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    drawBowStick(ctx, L, g.bowPos, g.string, g.dir, 0.75);
  }

  // ---- the player's fingers ----
  for (const f of st.fingers.values()) {
    const semis = st.opts.snap ? Math.round(f.semis) : f.semis;
    const x = semis > 0 ? L.semisX(semis) : f.x;
    const fs = st.fingerString(f);
    const y = L.stringY(fs, Math.max(L.nutX, x));
    const r = Math.max(11, L.spacing(x) * 0.65);
    ctx.fillStyle = semis > 0 ? '#ffe1c4' : 'rgba(255,225,196,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = STRINGS[fs].color;
    ctx.stroke();
    if (semis > 0) {
      // name beyond the neck, where the fingertip doesn't hide it
      const name = midiName(STRINGS[fs].midi + Math.round(semis)).replace(/\d/, '');
      ctx.font = `800 24px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(name, x, edgeIn(x, L.spacing(x)) + e * 26 + (e > 0 ? 0 : 8));
    }
  }

  // ---- the player's bow ----
  if (st.bow) {
    const s = st.activeString ?? L.padString(st.bow.x, st.bow.y);
    drawBowStick(ctx, L, st.bow.pos, s, st.lastDir, 1);
  }

  // ---- free play: what you're playing, big ----
  if (!t.falling) {
    const cx = (L.x0 + L.fbEnd) / 2;
    const areaH = Math.abs(L.far - L.strikeY);
    const cy = L.top ? (L.strikeY + L.h) / 2 : L.strikeY * 0.45;
    const maxW = (L.fbEnd - L.x0) * 0.92;
    const maxH = areaH * 0.85;
    const bold = (px: number) => `800 ${px}px ${FONT}`;
    const med = (px: number) => `700 ${px}px ${FONT}`;
    if (sounding) {
      textBlock(
        ctx,
        cx,
        cy,
        [
          { text: midiName(Math.round(sounding.midi)), font: bold, px: Math.round(Math.min(120, areaH * 0.35)), color: STRINGS[sounding.string].color, dy: 20 },
          { text: sounding.dir === 'down' ? '⊓ down bow' : 'V up bow', font: med, px: 20, color: 'rgba(255,255,255,0.7)', dy: 56 },
        ],
        maxW,
        maxH,
      );
    } else {
      const hi = 'rgba(255,255,255,0.75)';
      const lo = 'rgba(255,255,255,0.5)';
      textBlock(
        ctx,
        cx,
        cy,
        [
          { text: 'One hand: press the strings on the neck', font: bold, px: 22, color: hi, dy: -6 },
          { text: 'Other hand: bow up and down in the bow area ↕', font: bold, px: 22, color: hi, dy: 26 },
          { text: 'Pull away from the edge for a down bow, push back for an up bow', font: med, px: 16, color: lo, dy: 56 },
          { text: 'Touch a string name on the scroll to play that open string', font: med, px: 16, color: lo, dy: 80 },
        ],
        maxW,
        maxH,
      );
    }
  }
}

/** Outline of bow lane s (half = half-width in lanes). */
function lanePath(ctx: CanvasRenderingContext2D, L: Layout, s: number, half: number) {
  const y0 = L.laneY0;
  const y1 = L.laneY1;
  ctx.beginPath();
  ctx.moveTo(L.laneX(s - half, y0), y0);
  ctx.lineTo(L.laneX(s + half, y0), y0);
  ctx.lineTo(L.laneX(s + half, y1), y1);
  ctx.lineTo(L.laneX(s - half, y1), y1);
  ctx.closePath();
}

/** Big chevrons marching along a lane in the direction to bow. */
function drawLaneArrows(ctx: CanvasRenderingContext2D, L: Layout, s: number, dir: BowDir, now: number, alpha: number) {
  const u = L.laneDir(s);
  const sgn = dir === 'down' ? 1 : -1;
  const ux = u.x * sgn;
  const uy = u.y * sgn;
  const total = Math.abs(L.laneY1 - L.laneY0) / Math.abs(u.y);
  const gap = 70;
  const off = ((now / 6) % gap) * 1;
  const col = dir === 'down' ? DOWN : UP;
  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  lanePath(ctx, L, s, 0.47);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = col;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k * gap < total; k++) {
    // distance along the lane from where the stroke starts
    const dist = (k * gap + off) % total;
    const along = sgn > 0 ? dist : total - dist;
    const cxp = L.laneX(s, L.laneY0) + u.x * along;
    const cyp = L.laneY0 + u.y * along;
    const fade = Math.min(1, dist / 60, (total - dist) / 60);
    ctx.globalAlpha = alpha * Math.max(0, fade);
    const w = 20;
    const hx = -uy;
    const hy = ux; // perpendicular
    ctx.beginPath();
    ctx.moveTo(cxp - ux * 14 + hx * w, cyp - uy * 14 + hy * w);
    ctx.lineTo(cxp + ux * 6, cyp + uy * 6);
    ctx.lineTo(cxp - ux * 14 - hx * w, cyp - uy * 14 - hy * w);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.font = `800 18px ${FONT}`;
  ctx.textAlign = 'center';
  const my = (L.laneY0 + L.laneY1) / 2;
  const label = dir === 'down' ? '⊓ down bow' : 'V up bow';
  ctx.fillStyle = 'rgba(16,8,42,0.75)';
  const ex = 56 * Math.abs(Math.cos(readRot)) + 14 * Math.abs(Math.sin(readRot)) + 4;
  const mx = Math.max(L.pad.x + ex, Math.min(L.pad.x + L.pad.w - ex, L.laneX(s, my)));
  turned(ctx, mx, my, () => {
    roundRect(ctx, -56, -14, 112, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.textBaseline = 'alphabetic';
  });
  ctx.restore();
}

/**
 * The bow, seen from above: it lies along the lane of the string it leans
 * on, across the strings, and slides along its own length as you bow
 * (pos 0 = playing at the frog, 1 = at the tip).
 */
function drawBowStick(ctx: CanvasRenderingContext2D, L: Layout, pos: number, s: number, dir: BowDir | null, alpha: number) {
  const u = L.laneDir(s);
  const cy = L.stringY(s, L.pad.x);
  // where the lane's line meets the string
  const cx = L.laneX(s, L.laneY0) - (u.x / u.y) * (L.laneY0 - cy);
  const len = L.mm * 250;
  const frogD = 40 + pos * len; // frog distance from the contact, along the lane
  const fx = cx + u.x * frogD;
  const fy = cy + u.y * frogD;
  const tx = fx - u.x * len;
  const ty = fy - u.y * len;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  // stick a little to the side, hair on the strings
  ctx.strokeStyle = '#4a2208';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(tx + u.y * 9, ty - u.x * 9);
  ctx.lineTo(fx + u.y * 9, fy - u.x * 9);
  ctx.stroke();
  ctx.strokeStyle = '#f4ecdc';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(fx, fy);
  ctx.stroke();
  // frog (the end you hold)
  ctx.fillStyle = '#1a0c03';
  ctx.beginPath();
  ctx.arc(fx + u.y * 4, fy - u.x * 4, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dir === 'down' ? DOWN : dir === 'up' ? UP : '#fff';
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
