// Touch guitar: layout, touches and drawing.
//
// Everything here is drawn the way you see it IN THE MIRROR: the headstock on
// the left, the body on the right, the low E string on top. The neck is a
// real-size strip along the bottom edge of the screen (never more than a fifth
// of the screen tall), and the music falls down onto it from above. The play
// screen flips the whole picture left-to-right on the glass (CSS scaleX(-1)),
// so held against your chest facing a mirror, the mirror shows it the right way
// round, words included.
//
// The left hand presses frets (silent, like a real guitar); the right hand
// picks or strums in the body. Pressing alone never plays.
import { midiName, pitchClassName } from '../audio/notes';
import { FRETS, GSTRINGS, type ChordShape, type GuitarNote } from './theory';
import { pluck } from './pluck';

/** [name, scale length mm, nut width mm] */
export const GUITAR_SIZES: [string, number, number][] = [
  ['Full', 650, 43],
  ['3/4', 580, 42],
  ['1/2', 540, 40],
  ['1/4', 480, 38],
];

export interface GuitarLayout {
  w: number;
  h: number;
  /** where notes land: the top of the neck */
  landY: number;
  /** the neck strip */
  gTop: number;
  gBot: number;
  nutX: number;
  /** x of each fret wire, index 0 = the nut */
  fretXs: number[];
  /** end of the fretboard, start of the body (pick and strum here) */
  fbEnd: number;
  strumX: number;
  /** top of the body (taller than the neck) */
  bodyTop: number;
  spacing: number;
}

/** Real necks are tuned for curled fingertips; on flat glass chord shapes are
 * a stretch, so the strings sit closer together and the frets a bit shorter. */
export const NECK_SQUEEZE = 0.78;
export const FRET_SQUEEZE = 0.72;

/**
 * @param maxNeck the most the neck may take across the strings, in px (a fifth of the screen)
 * @param mm CSS px per mm of this screen
 */
export function guitarLayout(w: number, h: number, mm: number, size = 'Full', maxNeck = h / 5): GuitarLayout {
  const [, scale, nut] = GUITAR_SIZES.find((z) => z[0] === size) ?? GUITAR_SIZES[0];
  // across the strings: a little narrower than a real neck (fingers on glass
  // can't curl round the strings), and never more than a fifth of the screen
  const neckH = Math.max(60, Math.min(nut * NECK_SQUEEZE * mm + 8, maxNeck * 0.85, h * 0.35));
  const gBot = h - 2;
  const gTop = gBot - neckH;
  const nutX = Math.round(Math.max(48, Math.min(72, 14 * mm)));
  // along the neck: real fret spacing, squeezed if the screen is too short to
  // leave room to strum
  const minBody = Math.max(130, w * 0.18);
  const realLen = scale * (1 - 2 ** (-(FRETS + 0.35) / 12)) * mm;
  const k = Math.min(FRET_SQUEEZE, (w - nutX - minBody) / realLen);
  const fretXs = [nutX];
  for (let f = 1; f <= FRETS; f++) fretXs.push(nutX + scale * (1 - 2 ** (-f / 12)) * mm * k);
  const fbEnd = Math.round(nutX + realLen * k);
  const spacing = neckH / 6;
  const bodyTop = Math.max(h * 0.35, gTop - neckH * 1.4);
  return { w, h, landY: gTop - 2, gTop, gBot, nutX, fretXs, fbEnd, strumX: fbEnd + 4, bodyTop, spacing };
}

export const stringY = (L: GuitarLayout, i: number) => L.gTop + L.spacing * (i + 0.5);
/** centre of a fret's column (fret 0 = over the headstock) */
export const fretX = (L: GuitarLayout, f: number) => (f === 0 ? L.nutX / 2 : (L.fretXs[f - 1] + L.fretXs[f]) / 2);
export const fretW = (L: GuitarLayout, f: number) => (f === 0 ? L.nutX - 6 : L.fretXs[f] - L.fretXs[f - 1] - 6);

export interface PluckEvent {
  string: number;
  midi: number;
  t: number;
  /** one finger's swipe in the body: a strum is several strings in one gesture */
  gesture: number;
  /** picked toward the floor (low E → high e) */
  down: boolean;
}

type Touch =
  | { kind: 'fret'; string: number; fret: number; t: number }
  | { kind: 'strum'; lastY: number; gesture: number; startY: number };

export class GuitarState {
  L: GuitarLayout = guitarLayout(1, 1, 5);
  touches = new Map<number, Touch>();
  events: PluckEvent[] = [];
  /** a tap anywhere in the body picks the string your finger is on */
  easyPick = true;
  /** the string to pick when no finger is on a fret (the song's next note) */
  targetString: number | null = null;
  /** chord to play whatever the fingers do (easy chords) */
  forceChord: ChordShape | null = null;
  /** no sound or touches (real guitar mode, or the demo) */
  locked = false;
  shake: number[] = [0, 0, 0, 0, 0, 0];
  lastNote: { midi: number; string: number; t: number } | null = null;
  private gestureId = 0;

  fretOf(s: number): number {
    let f = 0;
    for (const t of this.touches.values()) if (t.kind === 'fret' && t.string === s) f = Math.max(f, t.fret);
    return f;
  }

  midiOf(s: number): number | null {
    if (this.forceChord) {
      const f = this.forceChord.frets[s];
      return f < 0 ? null : GSTRINGS[s].midi + f;
    }
    return GSTRINGS[s].midi + this.fretOf(s);
  }

  heldFrets(): number[] {
    return GSTRINGS.map((_, s) => this.fretOf(s));
  }

  /** the string of the most recently pressed fret */
  private fingered(): number | null {
    let best: { s: number; t: number } | null = null;
    for (const t of this.touches.values()) if (t.kind === 'fret' && (!best || t.t > best.t)) best = { s: t.string, t: t.t };
    return best?.s ?? null;
  }

  private nearestString(y: number): number {
    const L = this.L;
    return Math.max(0, Math.min(5, Math.round((y - L.gTop) / L.spacing - 0.5)));
  }

  private play(s: number, t: number, gesture: number, down: boolean, vel = 0.8) {
    const m = this.midiOf(s);
    if (m === null) return;
    pluck(s, m, vel);
    this.shake[s] = t;
    this.lastNote = { midi: m, string: s, t };
    this.events.push({ string: s, midi: m, t, gesture, down });
  }

  down(id: number, x: number, y: number, t: number) {
    if (this.locked) return;
    const L = this.L;
    if (x >= L.strumX) {
      if (y < L.bodyTop) return;
      const g = ++this.gestureId;
      this.touches.set(id, { kind: 'strum', lastY: y, gesture: g, startY: y });
      // right on a string: pick that string
      if (y >= L.gTop - 4) {
        const s = this.nearestString(y);
        if (Math.abs(y - stringY(L, s)) < L.spacing * 0.42) {
          this.play(s, t, g, true);
          return;
        }
      }
      // easy picking: a tap anywhere in the body picks the fingered string
      if (this.easyPick && !this.forceChord) {
        const s = this.fingered() ?? this.targetString;
        if (s !== null) this.play(s, t, g, true);
      }
      return;
    }
    // the neck: a little above the strip still counts (fingers come up from below)
    if (y < L.gTop - L.spacing) return;
    const s = this.nearestString(y);
    if (x < L.nutX) return; // the headstock: nothing to press
    let fret = FRETS;
    for (let f = 1; f <= FRETS; f++)
      if (x < L.fretXs[f]) {
        fret = f;
        break;
      }
    this.touches.set(id, { kind: 'fret', string: s, fret, t });
  }

  move(id: number, x: number, y: number, t: number) {
    const tc = this.touches.get(id);
    if (!tc || this.locked) return;
    const L = this.L;
    if (tc.kind === 'strum') {
      // pick every string the finger crosses
      const a = Math.min(tc.lastY, y);
      const b = Math.max(tc.lastY, y);
      const order: number[] = [];
      for (let s = 0; s < 6; s++) {
        const sy = stringY(L, s);
        if (sy > a && sy <= b) order.push(s);
      }
      const down = y > tc.lastY;
      if (!down) order.reverse();
      const speed = Math.abs(y - tc.lastY);
      for (const s of order) this.play(s, t, tc.gesture, down, Math.min(1, 0.5 + speed / 40));
      tc.lastY = y;
      return;
    }
    if (x < L.nutX || x >= L.strumX) return;
    const s = this.nearestString(y);
    let fret = FRETS;
    for (let f = 1; f <= FRETS; f++)
      if (x < L.fretXs[f]) {
        fret = f;
        break;
      }
    if (s !== tc.string || fret !== tc.fret) {
      tc.string = s;
      tc.fret = fret;
      tc.t = t;
    }
  }

  up(id: number) {
    this.touches.delete(id);
  }

  clear() {
    this.touches.clear();
    this.events = [];
  }

  /**
   * Which of a chord's dots have a finger near them. Forgiving: a touch one
   * string or one fret away still counts (no frets to feel on glass), but each
   * finger of the chord needs its own touch. A barre finger (same number on
   * several strings) is one finger.
   */
  chordDots(c: ChordShape): boolean[] {
    const frets = [...this.touches.values()].filter((t): t is Extract<Touch, { kind: 'fret' }> => t.kind === 'fret');
    const groups = new Map<number, number[]>();
    c.frets.forEach((f, s) => {
      if (f <= 0) return;
      const k = c.fingers[s] || 10 + s;
      groups.set(k, [...(groups.get(k) ?? []), s]);
    });
    const fingers = [...groups.values()];
    const near = (t: { string: number; fret: number }, s: number) =>
      Math.abs(t.string - s) <= 1 && Math.abs(t.fret - c.frets[s]) <= 1;
    const score = (t: { string: number; fret: number }, s: number) => Math.abs(t.string - s) + Math.abs(t.fret - c.frets[s]);
    // best matching of touches to fingers (at most 4 fingers, so try them all)
    let best: (number | null)[] = fingers.map(() => null);
    let bestN = -1;
    let bestCost = Infinity;
    const pick: (number | null)[] = [];
    const used = new Set<number>();
    const go = (i: number, n: number, cost: number) => {
      if (i === fingers.length) {
        if (n > bestN || (n === bestN && cost < bestCost)) {
          bestN = n;
          bestCost = cost;
          best = [...pick];
        }
        return;
      }
      pick[i] = null;
      go(i + 1, n, cost);
      frets.forEach((t, ti) => {
        if (used.has(ti)) return;
        const ss = fingers[i].filter((s) => near(t, s));
        if (!ss.length) return;
        used.add(ti);
        pick[i] = ti;
        go(i + 1, n + 1, cost + Math.min(...ss.map((s) => score(t, s))));
        used.delete(ti);
      });
      pick[i] = null;
    };
    go(0, 0, 0);
    const ok = c.frets.map(() => false);
    fingers.forEach((ss, i) => {
      if (best[i] !== null) for (const s of ss) ok[s] = true;
    });
    return ok;
  }

  /** Are the fingers (roughly) on this chord's dots? With 3 or more fingers, one may miss. */
  chordHeld(c: ChordShape): boolean {
    const dots = this.chordDots(c);
    const need = new Set<number>();
    const got = new Set<number>();
    c.frets.forEach((f, s) => {
      if (f <= 0) return;
      const k = c.fingers[s] || 10 + s;
      need.add(k);
      if (dots[s]) got.add(k);
    });
    if (!need.size) return true;
    return got.size >= (need.size >= 3 ? need.size - 1 : need.size);
  }
}

// ---------------------------------------------------------------------------
// Drawing

export interface FallingChord {
  beat: number;
  beats: number;
  chord: ChordShape | null;
  up: boolean;
  state: string;
}

export interface GuitarDraw {
  notes: (GuitarNote & { state?: string })[] | null;
  chords: FallingChord[] | null;
  songBeat: number;
  visibleBeats: number;
  current: GuitarNote | null;
  currentChord: FallingChord | null;
  waiting: boolean;
  names: boolean;
  /** show the fingers' dots as pressed (demo, or the real guitar has no touches) */
  ghost: boolean;
  /** true while a microphone is listening (real guitar) */
  listening: boolean;
}

const FONT = "'Baloo 2', ui-rounded, system-ui, sans-serif";

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 800) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string | null, stroke?: string, lw = 3) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

/** A pick/strum arrow: down = toward the floor (low E to high e). */
function arrow(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, down: boolean, color: string, lw = 5) {
  const [a, b] = down ? [y0, y1] : [y1, y0];
  const dir = down ? 1 : -1;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, a);
  ctx.lineTo(x, b);
  ctx.moveTo(x - 9, b - dir * 12);
  ctx.lineTo(x, b);
  ctx.lineTo(x + 9, b - dir * 12);
  ctx.stroke();
}

export function drawGuitar(ctx: CanvasRenderingContext2D, gs: GuitarState, d: GuitarDraw, now: number) {
  const L = gs.L;
  ctx.clearRect(0, 0, L.w, L.h);
  drawHighway(ctx, L, d, now);
  drawGuitarBody(ctx, gs, d, now);
}

function drawHighway(ctx: CanvasRenderingContext2D, L: GuitarLayout, d: GuitarDraw, now: number) {
  const top = 0;
  const bot = L.landY;
  const ppb = (bot - top) / d.visibleBeats;
  // lanes: one per fret, plus the open-string lane over the headstock
  for (let f = 0; f <= FRETS; f++) {
    const x = fretX(L, f);
    const lw = fretW(L, f);
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.06)');
    ctx.fillStyle = g;
    rr(ctx, x - lw / 2, top, lw, bot - top, 10);
    ctx.fill();
    text(ctx, f === 0 ? 'open' : `fret ${f}`, x, bot - 12, 13, 'rgba(255,255,255,0.3)', 700);
  }
  if (!d.notes && !d.chords) {
    text(ctx, 'Free play', (L.nutX + L.fbEnd) / 2, bot * 0.35, Math.min(44, bot * 0.12), 'rgba(255,255,255,0.18)');
    text(ctx, 'Press a fret, then pick or strum on the guitar body', (L.nutX + L.fbEnd) / 2, bot * 0.5, Math.min(22, bot * 0.06), 'rgba(255,255,255,0.3)', 700);
  }
  if (d.chords) {
    const x0 = L.nutX + 4;
    const x1 = L.fbEnd - 4;
    for (const c of d.chords) {
      const dy = (c.beat - d.songBeat) * ppb;
      if (dy > bot + 60 || c.beat + c.beats < d.songBeat - 0.5 || !c.chord) continue;
      const hgt = Math.max(34, c.beats * ppb - 8);
      const y1 = bot - dy;
      const y0 = y1 - hgt;
      const hit = c.state === 'hit';
      ctx.globalAlpha = hit ? 0.22 : 1;
      ctx.fillStyle = c.chord.color;
      rr(ctx, x0, y0, x1 - x0, hgt, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      const ay = y1 - Math.min(hgt, 64) / 2;
      if (hit) continue;
      const ty = y1 - Math.min(hgt, 64) / 2;
      text(ctx, c.chord.name, (x0 + x1) / 2, ty, Math.min(46, Math.max(22, hgt * 0.6)), '#1b1440');
      // which way to strum
      const ah = Math.min(22, hgt / 2 - 6);
      arrow(ctx, x1 - 36, ay - ah, ay + ah, !c.up, '#1b1440', 5);
      text(ctx, c.up ? 'up' : 'down', x1 - 80, ay + 1, 16, 'rgba(27,20,64,0.75)');
    }
  }
  if (d.notes) {
    for (const n of d.notes) {
      const dy = (n.beat - d.songBeat) * ppb;
      if (dy > bot + 60 || n.beat + n.beats < d.songBeat - 0.5) continue;
      const hit = n.state === 'hit';
      const x = fretX(L, n.fing.fret);
      const lw = fretW(L, n.fing.fret) - 4;
      const hgt = Math.max(34, n.beats * ppb - 6);
      const y1 = bot - dy;
      const y0 = y1 - hgt;
      const col = GSTRINGS[n.fing.string].color;
      ctx.globalAlpha = hit ? 0.22 : 1;
      ctx.fillStyle = col;
      rr(ctx, x - lw / 2, y0, lw, hgt, 12);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (hit) continue;
      // finger number in a dark circle, the string's name beside it
      const cy = y1 - Math.min(18, hgt / 2);
      const wide = lw > 64;
      const cx = wide ? x - 14 : x;
      circle(ctx, cx, cy, 14, '#1b1440');
      text(ctx, String(n.fing.finger), cx, cy + 1, 20, '#fff');
      if (wide) text(ctx, GSTRINGS[n.fing.string].name, x + 18, cy + 1, 22, '#1b1440');
      if (d.names && hgt > 52) text(ctx, pitchClassName(n.midi), x, cy - 28, 16, 'rgba(27,20,64,0.8)');
    }
  }
  // landing line
  ctx.fillStyle = d.waiting ? `rgba(255,214,10,${0.6 + 0.4 * Math.sin(now / 160)})` : 'rgba(255,255,255,0.45)';
  ctx.fillRect(0, bot - 2, L.w, 3);
}

function drawGuitarBody(ctx: CanvasRenderingContext2D, gs: GuitarState, d: GuitarDraw, now: number) {
  const L = gs.L;
  const { gTop, gBot, nutX, fbEnd } = L;
  const neckH = gBot - gTop;
  // body: taller than the neck, a soft rounded shape behind the strings
  const bx = L.strumX;
  const body = ctx.createLinearGradient(bx, 0, L.w, 0);
  body.addColorStop(0, '#c98a3c');
  body.addColorStop(1, '#a8682a');
  ctx.fillStyle = body;
  rr(ctx, bx, L.bodyTop, L.w - bx - 2, gBot - L.bodyTop, 26);
  ctx.fill();
  // the sound hole sits under the strings, all six running across it
  const hr = Math.max(neckH * 0.5 + 6, Math.min((L.w - bx) * 0.42, neckH * 0.6));
  const hx = bx + Math.min((L.w - bx) * 0.45, hr + 18);
  const hy = (gTop + gBot) / 2;
  ctx.save();
  rr(ctx, bx, L.bodyTop, L.w - bx - 2, gBot - L.bodyTop, 26);
  ctx.clip();
  circle(ctx, hx, hy, hr + 8, null, 'rgba(60,30,10,0.55)', 5);
  circle(ctx, hx, hy, hr, '#140b05');
  ctx.restore();
  // headstock and fretboard
  ctx.fillStyle = '#5a3416';
  rr(ctx, 2, gTop, nutX - 2, neckH, 10);
  ctx.fill();
  const fb = ctx.createLinearGradient(0, gTop, 0, gBot);
  fb.addColorStop(0, '#2a1a10');
  fb.addColorStop(1, '#1a0f08');
  ctx.fillStyle = fb;
  ctx.fillRect(nutX, gTop, fbEnd - nutX, neckH);
  for (const f of [3, 5]) if (f <= FRETS) circle(ctx, fretX(L, f), (gTop + gBot) / 2, Math.min(6, neckH * 0.05), 'rgba(255,255,255,0.2)');
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(nutX - 3, gTop, 5, neckH);
  ctx.fillStyle = 'rgba(200,200,210,0.75)';
  for (let f = 1; f <= FRETS; f++) ctx.fillRect(L.fretXs[f] - 1.5, gTop, 3, neckH);

  const held = d.ghost ? null : gs.heldFrets();
  const target = d.current;
  const chord = d.currentChord?.chord ?? null;

  if (d.names) {
    const fs = Math.max(9, Math.min(12, L.spacing * 0.42));
    for (let s = 0; s < 6; s++)
      for (let f = 1; f <= FRETS; f++)
        text(ctx, pitchClassName(GSTRINGS[s].midi + f), L.fretXs[f] - 13, stringY(L, s) - L.spacing * 0.28, fs, 'rgba(255,255,255,0.35)', 700);
  }

  // strings
  for (let s = 0; s < 6; s++) {
    const y = stringY(L, s);
    const age = (now - gs.shake[s]) / 1000;
    const amp = age < 0.6 ? Math.min(3, L.spacing * 0.15) * (1 - age / 0.6) : 0;
    ctx.strokeStyle = GSTRINGS[s].color;
    ctx.lineWidth = Math.max(1.2, (3.6 - s * 0.45) * Math.min(1, L.spacing / 26));
    ctx.beginPath();
    if (amp > 0) {
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const x = nutX + ((L.w - nutX) * i) / steps;
        const yy = y + amp * Math.sin((i / steps) * Math.PI) * Math.sin(now / 12 + s);
        if (i === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
    } else {
      ctx.moveTo(nutX, y);
      ctx.lineTo(L.w - 4, y);
    }
    ctx.stroke();
    text(ctx, GSTRINGS[s].name, nutX / 2, y + 1, Math.max(10, Math.min(20, L.spacing * 0.75)), GSTRINGS[s].color);
  }

  const dotR = Math.max(7, Math.min(16, L.spacing * 0.46));

  // chord: dots with finger numbers, ✕ over strings to skip, strum arrow on the body
  if (chord) {
    const dots = d.ghost ? null : gs.chordDots(chord);
    chord.frets.forEach((f, s) => {
      const y = stringY(L, s);
      if (f < 0) {
        ctx.fillStyle = 'rgba(20,10,5,0.85)';
        ctx.fillRect(2, y - L.spacing / 2 + 1, nutX - 6, L.spacing - 2);
        text(ctx, '✕', nutX / 2, y + 1, Math.max(10, L.spacing * 0.7), '#ff6b6b');
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(L.strumX, y - 2, L.w - L.strumX - 4, 4);
        return;
      }
      if (f === 0) return;
      const x = fretX(L, f) + (L.fretXs[f] - L.fretXs[f - 1]) * 0.22;
      const ok = d.ghost || dots![s];
      const pulse = ok ? 0 : 2 * Math.sin(now / 180);
      circle(ctx, x, y, dotR + 4 + pulse, null, chord.color, 3);
      circle(ctx, x, y, dotR, ok ? chord.color : 'rgba(255,255,255,0.95)');
      text(ctx, String(chord.fingers[s]), x, y + 1, dotR * 1.25, '#1b1440');
    });
    const ss = chord.frets.map((f, s) => (f >= 0 ? s : -1)).filter((s) => s >= 0);
    strumHint(ctx, L, ss, !d.currentChord!.up, chord.color, now);
  }

  // single note: the dot to press and the string to pick
  if (target) {
    const s = target.fing.string;
    const f = target.fing.fret;
    const y = stringY(L, s);
    const col = GSTRINGS[s].color;
    const x = f === 0 ? nutX / 2 : fretX(L, f) + (L.fretXs[f] - L.fretXs[f - 1]) * 0.22;
    const pulse = 2 * Math.sin(now / 160);
    circle(ctx, x, y, dotR + 5 + pulse, null, col, 3.5);
    if (f > 0) {
      circle(ctx, x, y, dotR, d.ghost || held![s] === f ? col : 'rgba(255,255,255,0.95)');
      text(ctx, String(target.fing.finger), x, y + 1, dotR * 1.25, '#1b1440');
    }
    pluckHint(ctx, L, s, col, now);
    // label above the neck
    const lbl = f === 0 ? `open ${GSTRINGS[s].name} string` : `${midiName(target.midi)} · finger ${target.fing.finger}, fret ${f}, ${GSTRINGS[s].name} string`;
    ctx.font = `800 16px ${FONT}`;
    const tw = ctx.measureText(lbl).width + 18;
    const lx = Math.min(fbEnd - tw / 2, Math.max(tw / 2 + 4, x));
    const ly = gTop - 18 - (d.chords ? 0 : 0);
    ctx.fillStyle = 'rgba(12,8,32,0.9)';
    rr(ctx, lx - tw / 2, ly - 13, tw, 26, 13);
    ctx.fill();
    text(ctx, lbl, lx, ly + 1, 16, col);
  }

  // fingers on the frets
  for (const t of gs.touches.values()) {
    if (t.kind !== 'fret') continue;
    const x = fretX(L, t.fret) + (L.fretXs[t.fret] - L.fretXs[t.fret - 1]) * 0.22;
    circle(ctx, x, stringY(L, t.string), dotR * 0.85, 'rgba(255,230,200,0.85)', GSTRINGS[t.string].color, 2.5);
  }

  // the note you just played, big, in the round hole
  const ln = gs.lastNote;
  if (ln && now - ln.t < 1200) {
    ctx.globalAlpha = 1 - (now - ln.t) / 1200;
    text(ctx, midiName(ln.midi), hx, hy, Math.min(48, hr * 0.7), GSTRINGS[ln.string].color);
    ctx.globalAlpha = 1;
  }
  if (d.listening) text(ctx, '🎤 listening', hx, L.bodyTop + 18, 15, 'rgba(255,255,255,0.75)', 700);
}

/** A guitar pick, point down (or up). */
function pick(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, down = true) {
  const k = down ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(x, y + k * r);
  ctx.quadraticCurveTo(x - r * 0.35, y + k * r * 0.2, x - r * 0.95, y - k * r * 0.45);
  ctx.quadraticCurveTo(x, y - k * r * 1.05, x + r * 0.95, y - k * r * 0.45);
  ctx.quadraticCurveTo(x + r * 0.35, y + k * r * 0.2, x, y + k * r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1b1440';
  ctx.stroke();
}

/** Single note: one string glows over the body and a pick flicks across it. */
function pluckHint(ctx: CanvasRenderingContext2D, L: GuitarLayout, s: number, col: string, now: number) {
  const y = stringY(L, s);
  const x0 = L.strumX + 6;
  const x1 = L.w - 8;
  ctx.globalAlpha = 0.55 + 0.3 * Math.sin(now / 150);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(5, L.spacing * 0.32);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // the pick comes down onto the string, flicks through it, and the string rings
  const px = x1 - Math.min(70, (x1 - x0) * 0.25);
  const ph = (now % 1100) / 1100;
  const r = Math.max(10, Math.min(16, L.spacing * 0.6));
  const py = y - L.spacing * 1.4 + ph * L.spacing * 1.9;
  ctx.globalAlpha = ph < 0.8 ? 1 : (1 - ph) / 0.2;
  pick(ctx, px, py, r, '#fff');
  ctx.globalAlpha = 1;
  if (ph > 0.72) {
    const t = (ph - 0.72) / 0.28;
    circle(ctx, px, y, 6 + t * 18, null, col, 3 * (1 - t));
  }
  text(ctx, `pluck ${GSTRINGS[s].name}`, px - r - 44, y - L.spacing * 0.95, 17, col);
}

/** Chord: a band across the strings to play, with a pick sweeping through them all. */
function strumHint(ctx: CanvasRenderingContext2D, L: GuitarLayout, ss: number[], down: boolean, col: string, now: number) {
  const ya = stringY(L, ss[0]) - L.spacing * 0.5;
  const yb = stringY(L, ss[ss.length - 1]) + L.spacing * 0.5;
  const x0 = L.strumX + 6;
  const x1 = L.w - 8;
  ctx.fillStyle = col + '38';
  rr(ctx, x0, ya, x1 - x0, yb - ya, 10);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = col;
  ctx.stroke();
  const px = x1 - Math.min(70, (x1 - x0) * 0.25);
  const ph = (now % 1000) / 1000;
  const from = down ? ya - 14 : yb + 14;
  const to = down ? yb + 14 : ya - 14;
  const py = from + (to - from) * Math.min(1, ph / 0.75);
  // motion trail
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px, from);
  ctx.lineTo(px, py);
  ctx.stroke();
  ctx.globalAlpha = ph < 0.85 ? 1 : (1 - ph) / 0.15;
  pick(ctx, px, py, Math.max(11, Math.min(17, L.spacing * 0.65)), '#fff', down);
  ctx.globalAlpha = 1;
  arrow(ctx, x0 + 26, ya + 6, yb - 6, down, col, 5);
  text(ctx, down ? 'strum ↓' : 'strum ↑', (x0 + x1) / 2, ya - 14, 20, col);
}
