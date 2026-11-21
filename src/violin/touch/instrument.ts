// The touch violin's playing surface: layout, multi-touch input and drawing.
//
// The iPad is held like a violin with the scroll on the left. The left hand
// stops the strings on the neck (E on top, G at the bottom, like a violin
// turned on its side), and the right hand drags across the bow zone: pull
// right for a down bow, push left for an up bow. Where the bow hand is in the
// zone is which part of the bow touches the string (frog on the left, tip on
// the right), so it lines up with the bow track of the song highway.

import { midiName, midiToFreq } from '../../audio/notes';
import { FINGER_COLORS, STRINGS, stopFraction, type BowDir, type BowStroke } from '../theory';
import type { StringMsg } from './violinProcessor';

export const MAX_SEMIS = 8.4;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  w: number;
  h: number;
  neck: Rect;
  pad: Rect;
  nutX: number;
  fbEnd: number;
  laneH: number;
  laneY: (s: number) => number;
  semisX: (semis: number) => number;
  xToSemis: (x: number) => number;
  yToString: (y: number) => number;
}

/** Same split as the song highway (left 56% strings, right 44% bow), so the tracks sit over the instrument. */
export function violinLayout(w: number, h: number): Layout {
  const gap = Math.max(14, w * 0.04);
  const neck = { x: 8, y: 6, w: (w - gap - 16) * 0.56, h: h - 12 };
  const pad = { x: neck.x + neck.w + gap, y: 6, w: (w - gap - 16) * 0.44, h: h - 12 };
  const scrollW = Math.min(76, Math.max(44, neck.w * 0.1));
  const nutX = neck.x + scrollW;
  const fbEnd = neck.x + neck.w - 2;
  const laneH = neck.h / 4;
  const full = stopFraction(MAX_SEMIS);
  const semisX = (semis: number) => nutX + (stopFraction(Math.max(0, semis)) / full) * (fbEnd - nutX);
  const xToSemis = (x: number) => {
    const frac = Math.max(0, Math.min(1, (x - nutX) / (fbEnd - nutX))) * full;
    return -12 * Math.log2(1 - frac);
  };
  // E (index 3) on top, G (0) at the bottom
  const laneY = (s: number) => neck.y + laneH * (3 - s + 0.5);
  const yToString = (y: number) => Math.max(0, Math.min(3, 3 - Math.floor((y - neck.y) / laneH)));
  return { w, h, neck, pad, nutX, fbEnd, laneH, laneY, semisX, xToSemis, yToString };
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
  /** px/s, positive = down bow (to the right) */
  speed: number;
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
  L: Layout = violinLayout(1000, 600);
  opts: ViolinOptions = { snap: true, easyBow: true, vibrato: true };
  /** strings the demo is playing (overrides touch) */
  sent: StrOut[] = STRINGS.map((s) => ({ freq: midiToFreq(s.midi), bowing: false, vel: 0, vib: 0 }));
  private noteSince = 0;
  private notePitch = -1;
  lastDir: BowDir | null = null;
  /** time of the last bow change or bow landing: lets the same note be played again */
  strokeId = 0;
  activeString: number | null = null;

  down(id: number, x: number, y: number, t: number) {
    const L = this.L;
    if (x < L.pad.x - 6) {
      this.fingers.set(id, this.finger(x, y, t));
    } else if (!this.bow) {
      this.bow = { id, x, y, lastT: t, lastMove: t, speed: 0 };
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
    const inst = ((x - b.x) / dt) * 1000;
    b.speed += (inst - b.speed) * Math.min(1, dt / 45);
    b.x = x;
    b.y = y;
    b.lastT = t;
    if (Math.abs(inst) > 20) b.lastMove = t;
    const dir: BowDir | null = Math.abs(b.speed) > this.L.pad.w * 0.04 ? (b.speed > 0 ? 'down' : 'up') : null;
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
    const s = L.yToString(y);
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
      for (const f of this.fingers.values()) if (f.semis > 0 && (!last || f.t > last.t)) last = f;
      if (last) return last.s;
    }
    return this.L.yToString(this.bow.y);
  }

  /** What the player is sounding right now (null if the bow is still or off). */
  sounding(): Sounding | null {
    const s = this.activeString;
    const b = this.bow;
    if (s === null || !b) return null;
    const vel = this.sent[s].vel;
    if (Math.abs(vel) < 0.02) return null;
    return {
      string: s,
      midi: STRINGS[s].midi + this.stopped(s),
      vel,
      dir: vel > 0 ? 'down' : 'up',
      bowPos: Math.max(0, Math.min(1, (b.x - this.L.pad.x) / this.L.pad.w)),
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
        const sp = Math.abs(b.speed) / this.L.pad.w; // bow widths per second
        vel = sp < 0.04 ? 0 : Math.sign(b.speed) * 0.25 * (1 - Math.exp(-sp * 0.9));
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

export interface DrawTargets {
  /** the note to play now */
  target: { string: number; semis: number; finger: number; bow: BowStroke } | null;
  /** the demo's hand (listen mode) */
  ghost: { string: number; semis: number; bowPos: number; dir: BowDir } | null;
  /** bow progress through the target stroke (0..1) while the note is held */
  progress: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

export function drawTouchViolin(
  ctx: CanvasRenderingContext2D,
  st: TouchViolinState,
  t: DrawTargets,
  showNames: boolean,
  now: number,
) {
  const L = st.L;
  const { neck, pad } = L;
  ctx.clearRect(0, 0, L.w, L.h);
  const small = L.laneH < 70;

  // ---- scroll and pegbox ----
  const sg = ctx.createLinearGradient(neck.x, 0, L.nutX, 0);
  sg.addColorStop(0, '#5a2d0c');
  sg.addColorStop(1, '#8a4a1c');
  ctx.fillStyle = sg;
  roundRect(ctx, neck.x, neck.y + neck.h * 0.06, L.nutX - neck.x, neck.h * 0.88, 18);
  ctx.fill();
  // ---- fingerboard ----
  const fg = ctx.createLinearGradient(0, neck.y, 0, neck.y + neck.h);
  fg.addColorStop(0, '#26221f');
  fg.addColorStop(0.5, '#141210');
  fg.addColorStop(1, '#26221f');
  ctx.fillStyle = fg;
  roundRect(ctx, L.nutX, neck.y, L.fbEnd - L.nutX, neck.h, 10);
  ctx.fill();
  // nut
  ctx.fillStyle = '#f2e3c4';
  ctx.fillRect(L.nutX - 5, neck.y, 6, neck.h);

  // ---- bow zone: the violin's belly up to the bridge ----
  const bg = ctx.createLinearGradient(pad.x, 0, pad.x + pad.w, 0);
  bg.addColorStop(0, '#6e3510');
  bg.addColorStop(0.5, '#8f4a17');
  bg.addColorStop(1, '#743a12');
  ctx.fillStyle = bg;
  roundRect(ctx, pad.x, pad.y, pad.w, pad.h, 22);
  ctx.fill();
  // wood grain
  ctx.strokeStyle = 'rgba(60,20,0,0.12)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 14; i++) {
    const y = pad.y + (pad.h * i) / 14 + Math.sin(i * 7.1) * 4;
    ctx.beginPath();
    ctx.moveTo(pad.x + 10, y);
    ctx.bezierCurveTo(pad.x + pad.w * 0.3, y + 6, pad.x + pad.w * 0.7, y - 6, pad.x + pad.w - 10, y);
    ctx.stroke();
  }
  // bridge
  const brX = pad.x + pad.w - 16;
  ctx.fillStyle = '#ecd7ae';
  roundRect(ctx, brX, pad.y + pad.h * 0.04, 9, pad.h * 0.92, 4);
  ctx.fill();
  ctx.font = `700 ${small ? 11 : 13}px "Baloo 2", system-ui`;
  ctx.fillStyle = 'rgba(255,240,220,0.8)';
  ctx.textAlign = 'left';
  ctx.fillText('frog', pad.x + 10, pad.y + pad.h - 8);
  ctx.textAlign = 'right';
  ctx.fillText('tip', brX - 6, pad.y + pad.h - 8);

  // ---- open string / bow target in the bow zone ----
  const tgt = t.target;
  if (tgt) {
    const y = L.laneY(tgt.string);
    const lo = pad.x + Math.min(tgt.bow.from, tgt.bow.to) * pad.w;
    const hi = pad.x + Math.max(tgt.bow.from, tgt.bow.to) * pad.w;
    const col = tgt.bow.dir === 'down' ? DOWN : UP;
    const pulse = 0.6 + 0.2 * Math.sin(now / 180);
    roundRect(ctx, lo, y - L.laneH * 0.36, hi - lo, L.laneH * 0.72, 14);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    // arrow along the stroke
    const dir = tgt.bow.dir === 'down' ? 1 : -1;
    const ax0 = dir > 0 ? lo + 14 : hi - 14;
    const ax1 = dir > 0 ? hi - 14 : lo + 14;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = small ? 3 : 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax0, y);
    ctx.lineTo(ax1, y);
    ctx.moveTo(ax1, y);
    ctx.lineTo(ax1 - dir * 14, y - 12);
    ctx.moveTo(ax1, y);
    ctx.lineTo(ax1 - dir * 14, y + 12);
    ctx.stroke();
    if (t.progress > 0) {
      const px = pad.x + (tgt.bow.from + (tgt.bow.to - tgt.bow.from) * t.progress) * pad.w;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = `800 ${small ? 13 : 17}px "Baloo 2", system-ui`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(tgt.bow.dir === 'down' ? '⊓ pull →' : '← push V', (lo + hi) / 2, y - L.laneH * 0.36 - 4);
  }

  // ---- tapes and note names on the fingerboard ----
  for (const [semis, label] of TAPES) {
    const x = L.semisX(semis);
    ctx.fillStyle = 'rgba(242,227,196,0.55)';
    ctx.fillRect(x - 2, neck.y + 4, 4, neck.h - 8);
    ctx.fillStyle = 'rgba(242,227,196,0.9)';
    ctx.font = `800 ${small ? 11 : 14}px "Baloo 2", system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, neck.y + (small ? 13 : 17));
  }

  // ---- strings ----
  const sounding = st.sounding();
  for (let s = 0; s < 4; s++) {
    const y = L.laneY(s);
    const thick = 4.2 - s * 0.8;
    const ringing = sounding?.string === s;
    const amp = ringing ? Math.min(1, Math.abs(sounding!.vel) / 0.18) : 0;
    const stopX = st.stopped(s) > 0 ? L.semisX(st.stopped(s)) : L.nutX;
    // fingerboard part, nut to bridge (the bow zone continues it)
    ctx.strokeStyle = STRINGS[s].color;
    ctx.globalAlpha = ringing ? 1 : 0.75;
    ctx.lineWidth = thick;
    ctx.beginPath();
    ctx.moveTo(L.nutX - 4, y);
    ctx.lineTo(L.fbEnd, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad.x, y);
    ctx.lineTo(brX + 4, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (amp > 0) {
      // vibrating blur between the finger and the bridge
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = thick + amp * 12;
      ctx.beginPath();
      ctx.moveTo(stopX, y);
      ctx.lineTo(L.fbEnd, y);
      ctx.moveTo(pad.x, y);
      ctx.lineTo(brX, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // peg + string name on the scroll
    ctx.fillStyle = '#2a1405';
    ctx.beginPath();
    ctx.arc((neck.x + L.nutX) / 2, y, Math.min(20, L.laneH * 0.3), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = STRINGS[s].color;
    ctx.font = `800 ${small ? 16 : 22}px "Baloo 2", system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(STRINGS[s].name, (neck.x + L.nutX) / 2, y + 1);
    ctx.textBaseline = 'alphabetic';
    if (showNames) {
      ctx.font = `700 ${small ? 10 : 13}px "Baloo 2", system-ui`;
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      for (let k = 1; k <= 8; k++) {
        const name = midiName(STRINGS[s].midi + k).replace(/\d/, '');
        ctx.fillText(name, L.semisX(k), y - L.laneH * 0.22);
      }
    }
  }

  // ---- target finger ----
  if (tgt) {
    const y = L.laneY(tgt.string);
    const pulse = 1 + 0.12 * Math.sin(now / 160);
    if (tgt.semis === 0) {
      // open string: glow along the string
      ctx.strokeStyle = STRINGS[tgt.string].color;
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now / 180);
      ctx.lineWidth = L.laneH * 0.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(L.nutX + 20, y);
      ctx.lineTo(L.fbEnd - 20, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${small ? 14 : 18}px "Baloo 2", system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(`open ${STRINGS[tgt.string].name}: no fingers`, (L.nutX + L.fbEnd) / 2, y - L.laneH * 0.3);
    } else {
      const x = L.semisX(tgt.semis);
      const r = Math.min(30, L.laneH * 0.36) * pulse;
      ctx.lineWidth = 5;
      ctx.strokeStyle = FINGER_COLORS[tgt.finger];
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = FINGER_COLORS[tgt.finger];
      ctx.globalAlpha = 0.3;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(r * 0.9)}px "Baloo 2", system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(tgt.finger), x, y + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ---- demo ghost hand ----
  if (t.ghost) {
    const g = t.ghost;
    const y = L.laneY(g.string);
    if (g.semis > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(L.semisX(g.semis), y, Math.min(22, L.laneH * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }
    drawBowStick(ctx, L, pad.x + g.bowPos * pad.w, g.string, g.dir, 0.75);
  }

  // ---- the player's fingers ----
  for (const f of st.fingers.values()) {
    const y = L.laneY(f.s);
    const semis = st.opts.snap ? Math.round(f.semis) : f.semis;
    const x = semis > 0 ? L.semisX(semis) : f.x;
    const r = Math.min(26, L.laneH * 0.32);
    ctx.fillStyle = semis > 0 ? '#ffe1c4' : 'rgba(255,225,196,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = STRINGS[f.s].color;
    ctx.stroke();
    if (semis > 0) {
      ctx.fillStyle = '#3a1a00';
      ctx.font = `800 ${Math.round(r * 0.7)}px "Baloo 2", system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(midiName(STRINGS[f.s].midi + Math.round(semis)).replace(/\d/, ''), x, y + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ---- the player's bow ----
  if (st.bow) {
    const s = st.activeString ?? L.yToString(st.bow.y);
    drawBowStick(ctx, L, st.bow.x, s, st.lastDir, 1);
  } else if (!tgt && !t.ghost) {
    ctx.fillStyle = 'rgba(255,240,220,0.85)';
    ctx.font = `800 ${small ? 15 : 20}px "Baloo 2", system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('↔ drag here to bow', pad.x + pad.w / 2, pad.y + (small ? 18 : 26));
  }
}

/** A bow seen from above: hair crossing all the strings at x, tilted toward the string it plays. */
function drawBowStick(ctx: CanvasRenderingContext2D, L: Layout, x: number, s: number, dir: BowDir | null, alpha: number) {
  const { pad } = L;
  const y = L.laneY(s);
  const tilt = (s - 1.5) * 0.06; // the bow leans to reach the outer strings
  const top = pad.y + 4;
  const bot = pad.y + pad.h - 4;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(tilt);
  // stick
  ctx.fillStyle = '#4a2208';
  roundRect(ctx, 7, top - y, 6, bot - top, 3);
  ctx.fill();
  // hair
  ctx.fillStyle = '#f4ecdc';
  roundRect(ctx, -5, top - y + 6, 10, bot - top - 12, 4);
  ctx.fill();
  ctx.restore();
  // contact glow on the string
  ctx.globalAlpha = alpha;
  ctx.fillStyle = dir === 'down' ? DOWN : dir === 'up' ? UP : '#fff';
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
