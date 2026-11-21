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
  padString: (x: number) => number;
  padLaneX: (s: number) => number;
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
  const gY = top ? 3 * wm + 1 : h - 3 * wm - 1;
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
    // in the bow column, which string the bow leans on: G nearest the neck
    padString: (x) => Math.max(0, Math.min(3, Math.floor(((x - padX) / pad.w) * 4))),
    padLaneX: (st) => padX + ((st + 0.5) / 4) * pad.w,
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
      if (nf.s !== f.s) nf.t = t;
      this.fingers.set(id, nf);
      return;
    }
    const b = this.bow;
    if (!b || b.id !== id) return;
    const dt = Math.max(1, t - b.lastT);
    // the bow moves across the strings: toward / away from the edge
    const dy = (y - b.y) * this.L.d;
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
    return { s, semis, x, y, t };
  }

  /** Semitones stopped on string s (the finger nearest the bridge wins, like a real violin). */
  stopped(s: number): number {
    let best = 0;
    for (const f of this.fingers.values()) if (f.s === s && f.semis > best) best = f.semis;
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
      if (last) return last.s;
    }
    return this.L.padString(this.bow.x);
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
  [2, '1'],
  [4, '2'],
  [5, '3'],
  [7, '4'],
];
const FONT = '"Baloo 2", system-ui';

/** Width of the falling lane for a finger spot. */
function gemWidth(L: Layout, semis: number) {
  if (semis === 0) return Math.min(52, (L.nutX - L.x0) * 0.8);
  return Math.max(24, Math.min(56, (L.semisX(semis + 0.5) - L.semisX(semis - 0.5)) * 0.92));
}

function drawFalling(ctx: CanvasRenderingContext2D, L: Layout, f: FallingView, now: number) {
  const strike = L.strikeY;
  const far = L.far;
  const d = L.d;
  const ppb = Math.abs(far - strike) / f.visibleBeats;
  const yAt = (beatsAhead: number) => strike + d * beatsAhead * ppb;
  const lo = Math.min(strike, far);
  const span = Math.abs(far - strike);

  // lane guides: open strings over the scroll, finger tapes, frog/middle/tip
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, L.openX - gemWidth(L, 0) / 2, lo, gemWidth(L, 0), span, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (const [s] of TAPES) {
    ctx.beginPath();
    ctx.moveTo(L.semisX(s), far);
    ctx.lineTo(L.semisX(s), strike);
    ctx.stroke();
  }
  // bow column lanes: which string the bow leans on
  for (let st = 1; st < 4; st++) {
    const x = L.pad.x + (st / 4) * L.pad.w;
    ctx.beginPath();
    ctx.moveTo(x, far);
    ctx.lineTo(x, strike);
    ctx.stroke();
  }
  // beat lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let b = Math.ceil(f.songBeat); b < f.songBeat + f.visibleBeats; b++) {
    const y = yAt(b - f.songBeat);
    ctx.beginPath();
    ctx.moveTo(L.x0, y);
    ctx.lineTo(L.w - 8, y);
    ctx.stroke();
  }
  // landing line
  const pulse = f.waiting ? 0.55 + 0.4 * Math.sin(now / 150) : 0.55;
  ctx.fillStyle = f.waiting ? `rgba(255,214,10,${pulse})` : 'rgba(255,255,255,0.5)';
  ctx.fillRect(L.x0, strike - 2, L.fbEnd - L.x0, 4);
  ctx.fillRect(L.pad.x, strike - 2, L.pad.w, 4);

  const vis = f.notes.filter((n) => n.beat + n.beats > f.songBeat - 0.2 && n.beat < f.songBeat + f.visibleBeats);
  for (const n of vis) {
    const isCur = f.current === n;
    let a = n.beat - f.songBeat;
    if (n.state === 'hit') a = Math.max(0, a);
    const b = n.beat + n.beats - f.songBeat - 0.06;
    if (b <= a) continue;
    const y0 = yAt(a);
    const y1 = d > 0 ? Math.min(far, yAt(b)) : Math.max(far, yAt(b));
    const gy = Math.min(y0, y1);
    const gh = Math.abs(y0 - y1);
    ctx.globalAlpha = n.state === 'hit' ? 0.3 : 1;

    // ---- finger gem, falling onto its spot on the neck ----
    const semis = n.fing.semis;
    const x = semis === 0 ? L.openX : L.semisX(semis);
    const gw = gemWidth(L, semis);
    ctx.fillStyle = STRINGS[n.fing.string].color;
    roundRect(ctx, x - gw / 2, gy, gw, gh, 10);
    ctx.fill();
    if (isCur) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    // badge: finger number and string
    const r = Math.min(gw * 0.42, 17);
    const cy = y0 + d * (r + 4);
    if (gh > r * 2 + 6 || n.state !== 'hit') {
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = n.fing.finger === 0 ? '#10082a' : FINGER_COLORS[n.fing.finger];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = n.fing.finger === 0 ? '#fff' : '#10082a';
      ctx.font = `800 ${Math.round(r * 1.2)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.fing.finger === 0 ? 'O' : String(n.fing.finger), x, cy + 1);
      if (gh > r * 4 + 10) {
        ctx.fillStyle = '#10082a';
        ctx.font = `800 ${Math.round(r * 1.1)}px ${FONT}`;
        ctx.fillText(STRINGS[n.fing.string].name, x, cy + d * (r * 2 + 2));
      }
      ctx.textBaseline = 'alphabetic';
    }

    // ---- bow gem, in the bow column lane of its string ----
    const down = n.bow.dir === 'down';
    const lw = L.pad.w / 4;
    const bx = L.padLaneX(n.fing.string);
    ctx.fillStyle = down ? DOWN : UP;
    roundRect(ctx, bx - lw * 0.42, gy, lw * 0.84, gh, 10);
    ctx.fill();
    if (isCur) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    // arrow: a down bow pulls away from the edge, an up bow pushes back toward it
    const ad = down ? d : -d;
    const len = Math.min(gh - 12, 40);
    if (len > 10) {
      const ym = gy + gh / 2;
      ctx.strokeStyle = '#10082a';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, ym - (ad * len) / 2);
      ctx.lineTo(bx, ym + (ad * len) / 2);
      ctx.moveTo(bx - 8, ym + (ad * len) / 2 - ad * 9);
      ctx.lineTo(bx, ym + (ad * len) / 2);
      ctx.lineTo(bx + 8, ym + (ad * len) / 2 - ad * 9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
) {
  if (!mirror) return drawViolinSurface(ctx, st, t, showNames, now);
  ctx.save();
  ctx.translate(st.L.w, 0);
  ctx.scale(-1, 1);
  const plain = ctx.fillText;
  ctx.fillText = function (this: CanvasRenderingContext2D, text: string, x: number, y: number) {
    this.save();
    this.translate(x, y);
    this.scale(-1, 1);
    const a = this.textAlign;
    this.textAlign = a === 'left' ? 'right' : a === 'right' ? 'left' : a;
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
  // lanes: lean the bow toward a string by bowing in its lane
  for (let s = 0; s < 4; s++) {
    const x = L.padLaneX(s);
    const active = st.activeString === s && !!st.bow;
    ctx.fillStyle = active ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    roundRect(ctx, x - pad.w / 8 + 3, 6, pad.w / 4 - 6, L.h - 12, 14);
    ctx.fill();
    ctx.fillStyle = STRINGS[s].color;
    ctx.font = `800 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(STRINGS[s].name, x, L.top ? L.h - 16 : 30);
  }
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
      ctx.fillStyle = 'rgba(242,227,196,0.9)';
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y1 + e * 14 + (e > 0 ? 0 : 4));
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
    ctx.fillText(STRINGS[s].name, L.openX, L.stringY(s, L.nutX) + 1);
    ctx.textBaseline = 'alphabetic';
    if (showNames) {
      ctx.font = `700 ${Math.round(Math.max(9, Math.min(12, sp0 * 0.42)))}px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let k = 1; k <= 8; k++) {
        const x = L.semisX(k);
        ctx.fillText(midiName(STRINGS[s].midi + k).replace(/\d/, ''), x, L.stringY(s, x) + e * L.spacing(x) * 0.45 + 3);
      }
    }
  }

  // ---- target: finger spot and bow lane ----
  const tgt = t.target;
  if (tgt) {
    const pulse = 1 + 0.15 * Math.sin(now / 160);
    if (tgt.semis === 0) {
      const y = L.stringY(tgt.string, L.nutX);
      ctx.strokeStyle = STRINGS[tgt.string].color;
      ctx.lineWidth = 3;
      roundRect(ctx, L.x0 + 2, y - sp0 * 0.5 * pulse, L.nutX - L.x0 - 4, sp0 * pulse, sp0 * 0.5);
      ctx.stroke();
    } else {
      const x = L.semisX(tgt.semis);
      const y = L.stringY(tgt.string, x);
      const r = L.spacing(x) * 0.75 * pulse;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = FINGER_COLORS[tgt.finger];
      ctx.globalAlpha = 0.45;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // the lane to bow in, with a big arrow
    const lx = L.padLaneX(tgt.string);
    const lw = pad.w / 4;
    const y0 = L.stringY(3, pad.x) + e * 24;
    const y1 = L.top ? L.h - 36 : 36;
    ctx.globalAlpha = 0.3 + 0.15 * Math.sin(now / 180);
    ctx.fillStyle = tgt.bow.dir === 'down' ? DOWN : UP;
    roundRect(ctx, lx - lw / 2 + 3, Math.min(y0, y1), lw - 6, Math.abs(y1 - y0), 14);
    ctx.fill();
    ctx.globalAlpha = 1;
    const ad = (tgt.bow.dir === 'down' ? 1 : -1) * e;
    const ym = (y0 + y1) / 2;
    const len = Math.min(140, Math.abs(y1 - y0) * 0.6);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lx, ym - (ad * len) / 2);
    ctx.lineTo(lx, ym + (ad * len) / 2);
    ctx.moveTo(lx - 14, ym + (ad * len) / 2 - ad * 16);
    ctx.lineTo(lx, ym + (ad * len) / 2);
    ctx.lineTo(lx + 14, ym + (ad * len) / 2 - ad * 16);
    ctx.stroke();
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
    drawBowStick(ctx, L, L.padLaneX(g.string), g.bowPos, g.string, g.dir, 0.75);
  }

  // ---- the player's fingers ----
  for (const f of st.fingers.values()) {
    const semis = st.opts.snap ? Math.round(f.semis) : f.semis;
    const x = semis > 0 ? L.semisX(semis) : f.x;
    const y = L.stringY(f.s, Math.max(L.nutX, x));
    const r = Math.max(11, L.spacing(x) * 0.65);
    ctx.fillStyle = semis > 0 ? '#ffe1c4' : 'rgba(255,225,196,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = STRINGS[f.s].color;
    ctx.stroke();
    if (semis > 0) {
      // name beyond the neck, where the fingertip doesn't hide it
      const name = midiName(STRINGS[f.s].midi + Math.round(semis)).replace(/\d/, '');
      ctx.font = `800 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(name, x, edgeIn(x, L.spacing(x)) + e * 18 + (e > 0 ? 0 : 6));
    }
  }

  // ---- the player's bow ----
  if (st.bow) {
    const s = st.activeString ?? L.padString(st.bow.x);
    drawBowStick(ctx, L, L.padLaneX(s), st.bow.pos, s, st.lastDir, 1);
  }

  // ---- free play: what you're playing, big ----
  if (!t.falling) {
    const cx = (L.x0 + L.fbEnd) / 2;
    const cy = L.top ? (L.strikeY + L.h) / 2 - 20 : L.strikeY * 0.45;
    ctx.textAlign = 'center';
    if (sounding) {
      ctx.fillStyle = STRINGS[sounding.string].color;
      ctx.font = `800 ${Math.round(Math.min(120, Math.abs(L.far - L.strikeY) * 0.35))}px ${FONT}`;
      ctx.fillText(midiName(Math.round(sounding.midi)), cx, cy + 20);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `700 20px ${FONT}`;
      ctx.fillText(sounding.dir === 'down' ? '⊓ down bow' : 'V up bow', cx, cy + 56);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `800 22px ${FONT}`;
      ctx.fillText('One hand: press the strings on the neck', cx, cy - 6);
      ctx.fillText('Other hand: bow up and down in the bow area ↕', cx, cy + 26);
      ctx.font = `700 16px ${FONT}`;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('Pull away from the edge for a down bow, push back for an up bow', cx, cy + 56);
      ctx.fillText('Touch a string name on the scroll to play that open string', cx, cy + 80);
    }
  }
}

/**
 * The bow, seen from above: its hair crosses the strings at a right angle in
 * the lane of the string it leans on, and slides along its own length as you
 * bow (pos 0 = playing at the frog, 1 = at the tip).
 */
function drawBowStick(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  x: number,
  pos: number,
  s: number,
  dir: BowDir | null,
  alpha: number,
) {
  const e = L.d;
  const contact = L.stringY(s, L.pad.x);
  const len = L.mm * 250; // drawn bow length (the column only shows part of it)
  // at the frog the frog end sits just past the strings; at the tip it has slid past
  const frogY = contact + e * (40 + pos * len);
  const tipY = frogY - e * len;
  const yA = Math.max(0, Math.min(L.h, Math.min(frogY, tipY)));
  const yB = Math.max(0, Math.min(L.h, Math.max(frogY, tipY)));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#4a2208';
  roundRect(ctx, x + 6, yA, 5, yB - yA, 2.5);
  ctx.fill();
  ctx.fillStyle = '#f4ecdc';
  roundRect(ctx, x - 4, yA, 9, yB - yA, 3);
  ctx.fill();
  // frog (the end you hold), when it's on screen
  if (frogY > 0 && frogY < L.h) {
    ctx.fillStyle = '#1a0c03';
    roundRect(ctx, x - 7, frogY - 12, 20, 24, 5);
    ctx.fill();
  }
  ctx.fillStyle = dir === 'down' ? DOWN : dir === 'up' ? UP : '#fff';
  ctx.beginPath();
  ctx.arc(x, contact, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
