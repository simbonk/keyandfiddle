// Touch guitar: layout, touches and drawing.
//
// Everything here is drawn the way you see it IN THE MIRROR: the headstock on
// the left, the round hole on the right, the low E string on top. The play
// screen then flips the whole picture left-to-right on the glass (CSS
// scaleX(-1)), so held against your chest facing a mirror, the mirror shows it
// the right way round, words included.
import { midiName, pitchClassName } from '../audio/notes';
import { CHORDS, FRETS, GSTRINGS, type ChordShape, type GuitarNote } from './theory';
import { damp, pluck } from './pluck';

export interface GuitarLayout {
  w: number;
  h: number;
  /** bottom of the falling-notes area: where notes land */
  landY: number;
  /** guitar neck area, top and bottom */
  gTop: number;
  gBot: number;
  nutX: number;
  /** end of the fretboard, start of the strumming area */
  fbEnd: number;
  cellW: number;
  strumX: number;
  spacing: number;
}

export function guitarLayout(w: number, h: number): GuitarLayout {
  const hw = Math.max(110, Math.round(h * 0.38));
  const landY = hw;
  const gTop = landY + 6;
  const gBot = h - 4;
  const nutX = Math.round(Math.max(58, Math.min(120, w * 0.09)));
  const fbEnd = Math.round(w * 0.7);
  const cellW = (fbEnd - nutX) / FRETS;
  const spacing = (gBot - gTop) / 6;
  return { w, h, landY, gTop, gBot, nutX, fbEnd, cellW, strumX: fbEnd + 6, spacing };
}

export const stringY = (L: GuitarLayout, i: number) => L.gTop + L.spacing * (i + 0.5);
/** centre of a fret's column (fret 0 = the headstock) */
export const fretX = (L: GuitarLayout, f: number) => (f === 0 ? L.nutX / 2 : L.nutX + (f - 0.5) * L.cellW);
export const fretW = (L: GuitarLayout, f: number) => (f === 0 ? L.nutX - 8 : L.cellW - 10);

export interface PluckEvent {
  string: number;
  midi: number;
  t: number;
  /** from a swipe in the strumming area (several strings at once) */
  gesture: number;
}

type Touch =
  | { kind: 'fret'; string: number; fret: number }
  | { kind: 'strum'; lastY: number; gesture: number }
  | { kind: 'open'; string: number };

export class GuitarState {
  L: GuitarLayout = guitarLayout(1, 1);
  touches = new Map<number, Touch>();
  events: PluckEvent[] = [];
  /** tapping a fret plays it (no strumming hand needed) */
  easyPluck = true;
  /** chord to play whatever the fingers do (easy chords) */
  forceChord: ChordShape | null = null;
  /** recent plucks, for drawing the strings shaking */
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

  private nearestString(y: number): number {
    const L = this.L;
    return Math.max(0, Math.min(5, Math.round((y - L.gTop) / L.spacing - 0.5)));
  }

  private play(s: number, t: number, gesture: number, vel = 0.8) {
    const m = this.midiOf(s);
    if (m === null) return;
    pluck(s, m, vel);
    this.shake[s] = t;
    this.lastNote = { midi: m, string: s, t };
    this.events.push({ string: s, midi: m, t, gesture });
  }

  down(id: number, x: number, y: number, t: number) {
    const L = this.L;
    if (y < L.gTop - 4) return;
    const s = this.nearestString(y);
    if (x >= L.strumX) {
      const g = ++this.gestureId;
      this.touches.set(id, { kind: 'strum', lastY: y, gesture: g });
      if (Math.abs(y - stringY(L, s)) < L.spacing * 0.42) this.play(s, t, g);
      return;
    }
    if (x < L.nutX) {
      this.touches.set(id, { kind: 'open', string: s });
      // the headstock plucks the open string
      if (!this.forceChord) {
        pluck(s, GSTRINGS[s].midi, 0.8);
        this.shake[s] = t;
        this.lastNote = { midi: GSTRINGS[s].midi, string: s, t };
        this.events.push({ string: s, midi: GSTRINGS[s].midi, t, gesture: ++this.gestureId });
      }
      return;
    }
    const fret = Math.max(1, Math.min(FRETS, Math.ceil((Math.min(x, L.fbEnd - 1) - L.nutX) / L.cellW)));
    this.touches.set(id, { kind: 'fret', string: s, fret });
    if (this.easyPluck && !this.forceChord) this.play(s, t, ++this.gestureId);
  }

  move(id: number, x: number, y: number, t: number) {
    const tc = this.touches.get(id);
    if (!tc) return;
    const L = this.L;
    if (tc.kind === 'strum') {
      // pluck every string the finger crosses
      const a = Math.min(tc.lastY, y);
      const b = Math.max(tc.lastY, y);
      const order: number[] = [];
      for (let s = 0; s < 6; s++) {
        const sy = stringY(L, s);
        if (sy > a && sy <= b) order.push(s);
      }
      if (y < tc.lastY) order.reverse();
      const speed = Math.abs(y - tc.lastY);
      for (const s of order) this.play(s, t, tc.gesture, Math.min(1, 0.5 + speed / 60));
      tc.lastY = y;
      return;
    }
    if (tc.kind === 'fret') {
      if (x < L.nutX || x >= L.strumX) return;
      const s = this.nearestString(y);
      const fret = Math.max(1, Math.min(FRETS, Math.ceil((Math.min(x, L.fbEnd - 1) - L.nutX) / L.cellW)));
      if (s !== tc.string || fret !== tc.fret) {
        tc.string = s;
        tc.fret = fret;
        if (this.easyPluck && !this.forceChord) this.play(s, t, ++this.gestureId);
      }
    }
  }

  up(id: number) {
    this.touches.delete(id);
  }

  clear() {
    this.touches.clear();
    this.events = [];
  }

  /** Are the fingers on this chord's dots? */
  chordHeld(c: ChordShape): boolean {
    return c.frets.every((f, s) => f <= 0 || this.fretOf(s) === f);
  }
}

// ---------------------------------------------------------------------------
// Drawing

export interface GuitarDraw {
  notes: GuitarNote[] | null;
  /** chord strums (the chord name is the tag) */
  chords: { beat: number; beats: number; tag?: string; state: string }[] | null;
  songBeat: number;
  visibleBeats: number;
  current: GuitarNote | null;
  currentChord: ChordShape | null;
  waiting: boolean;
  names: boolean;
  demo: boolean;
}

const FONT = "'Baloo 2', ui-rounded, system-ui, sans-serif";

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, weight = 800) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string, lw = 3) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function drawGuitar(ctx: CanvasRenderingContext2D, gs: GuitarState, d: GuitarDraw, now: number) {
  const L = gs.L;
  ctx.clearRect(0, 0, L.w, L.h);
  drawHighway(ctx, L, d, now);
  drawNeck(ctx, gs, d, now);
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
    g.addColorStop(1, f === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.05)');
    ctx.fillStyle = g;
    rr(ctx, x - lw / 2, top, lw, bot - top, 10);
    ctx.fill();
  }
  // chords: wide bars across the whole neck
  const chordLane = { x0: L.nutX + 4, x1: L.fbEnd - 4 };
  if (!d.notes && !d.chords) {
    text(ctx, 'Free play', (L.nutX + L.fbEnd) / 2, bot * 0.35, Math.min(40, bot * 0.22), 'rgba(255,255,255,0.18)');
    text(ctx, 'Press the frets · pluck or strum in the round hole', (L.nutX + L.fbEnd) / 2, bot * 0.62, Math.min(22, bot * 0.12), 'rgba(255,255,255,0.28)', 700);
  }
  if (d.chords) {
    for (const c of d.chords) {
      const dy = (c.beat - d.songBeat) * ppb;
      if (dy > bot + 40 || c.beat + c.beats < d.songBeat - 0.5) continue;
      const shape = CHORDS[c.tag ?? ''];
      if (!shape) continue;
      const hgt = Math.max(30, c.beats * ppb - 8);
      const y1 = bot - dy;
      const y0 = y1 - hgt;
      const hit = c.state === 'hit';
      ctx.globalAlpha = hit ? 0.25 : 1;
      ctx.fillStyle = shape.color;
      rr(ctx, chordLane.x0, Math.max(top - 40, y0), chordLane.x1 - chordLane.x0, Math.min(hgt, y1 - (top - 40)), 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!hit) {
        text(ctx, shape.name, (chordLane.x0 + chordLane.x1) / 2, y1 - Math.min(hgt, 60) / 2, Math.min(44, Math.max(22, hgt * 0.6)), '#1b1440');
        text(ctx, '⬇ strum', chordLane.x1 - 70, y1 - Math.min(hgt, 60) / 2, 18, 'rgba(27,20,64,0.75)');
      }
    }
  }
  if (d.notes) {
    for (const n of d.notes) {
      const dy = (n.beat - d.songBeat) * ppb;
      if (dy > bot + 40 || n.beat + n.beats < d.songBeat - 0.5) continue;
      const st = (n as GuitarNote & { state?: string }).state;
      const hit = st === 'hit';
      const x = fretX(L, n.fing.fret);
      const lw = fretW(L, n.fing.fret) - 6;
      const hgt = Math.max(30, n.beats * ppb - 6);
      const y1 = bot - dy;
      const y0 = y1 - hgt;
      const col = GSTRINGS[n.fing.string].color;
      ctx.globalAlpha = hit ? 0.22 : 1;
      ctx.fillStyle = col;
      rr(ctx, x - lw / 2, y0, lw, hgt, 12);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (hit) continue;
      // fret number in a dark circle, the string's name beside it
      const cy = y1 - Math.min(18, hgt / 2);
      const wide = lw > 70;
      const cx = wide ? x - 14 : x;
      circle(ctx, cx, cy, 14, '#1b1440');
      text(ctx, String(n.fing.fret), cx, cy + 1, 20, '#fff');
      if (wide) text(ctx, GSTRINGS[n.fing.string].name, x + 18, cy + 1, 22, '#1b1440');
      if (d.names && hgt > 50) text(ctx, pitchClassName(n.midi), x, cy - 28, 16, 'rgba(27,20,64,0.8)');
    }
  }
  // landing line
  ctx.fillStyle = d.waiting ? `rgba(255,214,10,${0.6 + 0.4 * Math.sin(now / 160)})` : 'rgba(255,255,255,0.5)';
  ctx.fillRect(0, bot - 2, L.fbEnd, 3);
}

function drawNeck(ctx: CanvasRenderingContext2D, gs: GuitarState, d: GuitarDraw, now: number) {
  const L = gs.L;
  const { gTop, gBot, nutX, fbEnd } = L;
  // headstock
  ctx.fillStyle = '#5a3416';
  rr(ctx, 2, gTop, nutX - 2, gBot - gTop, 16);
  ctx.fill();
  // fretboard
  const fb = ctx.createLinearGradient(0, gTop, 0, gBot);
  fb.addColorStop(0, '#2a1a10');
  fb.addColorStop(1, '#1a0f08');
  ctx.fillStyle = fb;
  ctx.fillRect(nutX, gTop, fbEnd - nutX, gBot - gTop);
  // body + round hole (strumming area)
  const bx = L.strumX;
  const body = ctx.createLinearGradient(bx, 0, L.w, 0);
  body.addColorStop(0, '#c98a3c');
  body.addColorStop(1, '#a8682a');
  ctx.fillStyle = body;
  rr(ctx, bx, gTop, L.w - bx - 2, gBot - gTop, 22);
  ctx.fill();
  const hr = Math.min((L.w - bx) * 0.36, (gBot - gTop) * 0.4);
  const hx = bx + Math.min((L.w - bx) * 0.42, hr + 30);
  const hy = (gTop + gBot) / 2;
  circle(ctx, hx, hy, hr + 10, 'rgba(0,0,0,0)', 'rgba(60,30,10,0.55)', 6);
  circle(ctx, hx, hy, hr, '#140b05');
  // inlay dots at frets 3 and 5
  for (const f of [3, 5]) if (f <= FRETS) circle(ctx, fretX(L, f), hy, 8, 'rgba(255,255,255,0.18)');
  // nut and frets
  ctx.fillStyle = '#efe6d2';
  ctx.fillRect(nutX - 4, gTop, 6, gBot - gTop);
  ctx.fillStyle = 'rgba(200,200,210,0.7)';
  for (let f = 1; f <= FRETS; f++) ctx.fillRect(nutX + f * L.cellW - 1.5, gTop, 3, gBot - gTop);
  // fret numbers along the top edge of the neck
  for (let f = 1; f <= FRETS; f++) text(ctx, String(f), fretX(L, f), gTop + 10, 13, 'rgba(255,255,255,0.35)');

  const held = gs.heldFrets();
  const target = d.current;
  const chord = d.currentChord;

  // note names on every fret (faint)
  if (d.names) {
    for (let s = 0; s < 6; s++)
      for (let f = 1; f <= FRETS; f++)
        text(ctx, pitchClassName(GSTRINGS[s].midi + f), fretX(L, f) - L.cellW * 0.28, stringY(L, s) - L.spacing * 0.27, 12, 'rgba(255,255,255,0.32)', 700);
  }

  // target string glow
  const glowStrings = new Set<number>();
  if (target) glowStrings.add(target.fing.string);
  if (chord) chord.frets.forEach((f, s) => f >= 0 && glowStrings.add(s));
  for (const s of glowStrings) {
    const y = stringY(L, s);
    ctx.fillStyle = GSTRINGS[s].color + '33';
    rr(ctx, L.strumX + 4, y - L.spacing * 0.36, L.w - L.strumX - 10, L.spacing * 0.72, 12);
    ctx.fill();
  }

  // strings
  for (let s = 0; s < 6; s++) {
    const y = stringY(L, s);
    const age = (now - gs.shake[s]) / 1000;
    const amp = age < 0.6 ? 3 * (1 - age / 0.6) : 0;
    const thick = 4.2 - s * 0.55;
    ctx.strokeStyle = GSTRINGS[s].color;
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = thick;
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
    ctx.globalAlpha = 1;
    // string name on the headstock (tap it for the open string)
    circle(ctx, nutX / 2, y, Math.min(19, L.spacing * 0.36), '#2b170a', GSTRINGS[s].color, 2.5);
    text(ctx, GSTRINGS[s].name, nutX / 2, y + 1, Math.min(22, L.spacing * 0.4), GSTRINGS[s].color);
  }

  // chord shape: dots with finger numbers, X over strings to skip
  if (chord) {
    chord.frets.forEach((f, s) => {
      const y = stringY(L, s);
      if (f < 0) {
        circle(ctx, nutX / 2, y, Math.min(19, L.spacing * 0.36), 'rgba(20,10,5,0.85)');
        text(ctx, '✕', nutX / 2, y + 1, Math.min(24, L.spacing * 0.42), '#ff6b6b');
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(L.strumX + 4, y - 3, L.w - L.strumX - 10, 6);
        return;
      }
      if (f === 0) return;
      const x = fretX(L, f);
      const ok = held[s] === f;
      const r = Math.min(26, L.spacing * 0.42, L.cellW * 0.3);
      const pulse = ok ? 0 : 3 * Math.sin(now / 180);
      circle(ctx, x, y, r + 8 + pulse, 'rgba(0,0,0,0)', chord.color, 3);
      circle(ctx, x, y, r, ok ? chord.color : 'rgba(255,255,255,0.92)');
      text(ctx, String(chord.fingers[s]), x, y + 1, r * 1.1, '#1b1440');
    });
  }

  // single-note target
  if (target) {
    const s = target.fing.string;
    const f = target.fing.fret;
    const y = stringY(L, s);
    const x = fretX(L, f);
    const col = GSTRINGS[s].color;
    const r = Math.min(26, L.spacing * 0.42, f === 0 ? nutX * 0.4 : L.cellW * 0.3);
    const pulse = 3 * Math.sin(now / 160);
    circle(ctx, x, y, r + 9 + pulse, 'rgba(0,0,0,0)', col, 4);
    if (f > 0) {
      circle(ctx, x, y, r, held[s] === f ? col : 'rgba(255,255,255,0.95)');
      text(ctx, String(target.fing.finger), x, y + 1, r * 1.1, '#1b1440');
    }
    // the label beside the dot
    const lbl = f === 0 ? `open ${GSTRINGS[s].name}` : `${midiName(target.midi)}`;
    ctx.font = `800 16px ${FONT}`;
    const tw = ctx.measureText(lbl).width + 16;
    const lx = Math.min(fbEnd - tw / 2 - 4, Math.max(nutX + tw / 2 + 4, x + (f === 0 ? nutX * 0.5 + tw / 2 : 0)));
    const ly = y + (s >= 4 ? -r - 20 : r + 20);
    ctx.fillStyle = 'rgba(12,8,32,0.85)';
    rr(ctx, lx - tw / 2, ly - 12, tw, 24, 12);
    ctx.fill();
    text(ctx, lbl, lx, ly + 1, 16, col);
    // pluck hint in the round hole
    text(ctx, d.demo ? '' : '← pluck', L.w - 54, y - L.spacing * 0.28, 15, col);
  }

  // fingers on the frets
  for (const t of gs.touches.values()) {
    if (t.kind !== 'fret') continue;
    const x = fretX(L, t.fret);
    const y = stringY(L, t.string);
    circle(ctx, x, y, Math.min(20, L.spacing * 0.34), 'rgba(255,230,200,0.85)', GSTRINGS[t.string].color, 3);
  }

  // the note you just played, big, in the free space of the round hole area
  const ln = gs.lastNote;
  if (ln && now - ln.t < 1200) {
    ctx.globalAlpha = 1 - (now - ln.t) / 1200;
    text(ctx, midiName(ln.midi), hx, hy, Math.min(54, hr * 0.7), GSTRINGS[ln.string].color);
    ctx.globalAlpha = 1;
  }

  // strum arrow for the current chord
  if (chord && !d.demo) {
    const ss = chord.frets.map((f, s) => (f >= 0 ? s : -1)).filter((s) => s >= 0);
    const y0 = stringY(L, ss[0]) - 10;
    const y1 = stringY(L, ss[ss.length - 1]) + 10;
    const ax = L.w - 34;
    ctx.strokeStyle = chord.color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, y0);
    ctx.lineTo(ax, y1);
    ctx.moveTo(ax - 10, y1 - 14);
    ctx.lineTo(ax, y1);
    ctx.lineTo(ax + 10, y1 - 14);
    ctx.stroke();
  }
}

/** Lift every finger's note (used when the song stops). */
export function dampAll() {
  for (let i = 0; i < 6; i++) damp(i);
}
