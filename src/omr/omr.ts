// Best-effort optical music recognition for clean, printed (engraved) sheet
// music such as a screenshot of a PDF. It finds staves, note heads, stems,
// beams and dots, reads pitch from the head's height on the staff and rhythm
// from the note's shape. Rests, ties and accidentals inside a bar are not read:
// the review screen lets the player fix anything it gets wrong.
//
// No imports on purpose: this runs on plain pixel arrays (browser or tests).

export interface Gray {
  w: number;
  h: number;
  /** 0 = black, 255 = white, one byte per pixel */
  data: Uint8Array;
}

export interface Staff {
  lines: number[]; // y of the 5 lines, top to bottom
  x0: number;
  x1: number;
  space: number;
  clef: 'treble' | 'bass';
  system: number;
}

export interface OmrNote {
  id: number;
  x: number;
  y: number;
  staff: number;
  /** half-spaces above the staff's bottom line (0 = on the bottom line) */
  step: number;
  filled: boolean;
  stem: boolean;
  beams: number;
  dotted: boolean;
  /** forced accidental (+1 sharp, -1 flat, 0 natural), undefined = follow the key */
  acc?: number;
  /** note length in beats (quarter = 1) */
  beats: number;
}

export interface OmrResult {
  w: number;
  h: number;
  space: number;
  staves: Staff[];
  notes: OmrNote[];
  /** + sharps / - flats */
  keySig: number;
}

// ------------------------------------------------------------------ helpers

function otsu(g: Gray): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;
  const total = g.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > best) {
      best = v;
      thr = t;
    }
  }
  return thr;
}

class Bin {
  w: number;
  h: number;
  d: Uint8Array;
  ii: Int32Array | null = null;
  constructor(w: number, h: number, d: Uint8Array) {
    this.w = w;
    this.h = h;
    this.d = d;
  }
  at(x: number, y: number) {
    x = Math.round(x);
    y = Math.round(y);
    return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : 0;
  }
  integral() {
    const { w, h, d } = this;
    const ii = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += d[y * w + x];
        ii[(y + 1) * (w + 1) + x + 1] = ii[y * (w + 1) + x + 1] + row;
      }
    }
    this.ii = ii;
  }
  /** fraction of dark pixels in a rectangle centred on (cx, cy) */
  frac(cx: number, cy: number, rw: number, rh: number) {
    const ii = this.ii!;
    const W = this.w + 1;
    const x0 = Math.max(0, Math.round(cx - rw / 2));
    const x1 = Math.min(this.w, Math.round(cx + rw / 2));
    const y0 = Math.max(0, Math.round(cy - rh / 2));
    const y1 = Math.min(this.h, Math.round(cy + rh / 2));
    const area = (x1 - x0) * (y1 - y0);
    if (area <= 0) return 0;
    return (ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0]) / area;
  }
  hRun(x: number, y: number) {
    if (!this.at(x, y)) return 0;
    let a = x;
    let b = x;
    while (a > 0 && this.at(a - 1, y)) a--;
    while (b < this.w - 1 && this.at(b + 1, y)) b++;
    return b - a + 1;
  }
}

// ------------------------------------------------------------------ staves

function findStaves(b: Bin): Staff[] {
  const { w, h } = b;
  interface Line {
    y0: number;
    y1: number;
    x0: number;
    x1: number;
  }
  const rows: { y: number; x0: number; x1: number }[] = [];
  for (let y = 0; y < h; y++) {
    let best = 0;
    let bx = 0;
    let run = 0;
    let gap = 0;
    let start = 0;
    for (let x = 0; x < w; x++) {
      if (b.d[y * w + x]) {
        if (run === 0) start = x;
        run += 1 + gap;
        gap = 0;
        if (run > best) {
          best = run;
          bx = start;
        }
      } else if (run > 0 && gap < 2) gap++; // bridge tiny breaks
      else {
        run = 0;
        gap = 0;
      }
    }
    if (best > w * 0.3) rows.push({ y, x0: bx, x1: bx + best });
  }
  const lines: Line[] = [];
  for (const r of rows) {
    const l = lines[lines.length - 1];
    if (l && r.y === l.y1 + 1) {
      l.y1 = r.y;
      l.x0 = Math.min(l.x0, r.x0);
      l.x1 = Math.max(l.x1, r.x1);
    } else lines.push({ y0: r.y, y1: r.y, x0: r.x0, x1: r.x1 });
  }
  const staves: Staff[] = [];
  const cy = (l: Line) => (l.y0 + l.y1) / 2;
  for (let i = 0; i + 4 < lines.length; ) {
    const g = [1, 2, 3, 4].map((k) => cy(lines[i + k]) - cy(lines[i + k - 1]));
    const m = g.reduce((a, c) => a + c, 0) / 4;
    const thick = Math.max(...lines.slice(i, i + 5).map((l) => l.y1 - l.y0 + 1));
    if (g.every((x) => x > m * 0.8 && x < m * 1.2) && m > thick * 2.5 && m > 4) {
      const ls = lines.slice(i, i + 5);
      staves.push({
        lines: ls.map(cy),
        x0: Math.min(...ls.map((l) => l.x0)),
        x1: Math.max(...ls.map((l) => l.x1)),
        space: m,
        clef: 'treble',
        system: 0,
      });
      // erase the staff lines where nothing crosses them
      for (const l of ls) {
        for (let x = l.x0; x <= l.x1; x++) {
          const above = b.at(x, l.y0 - 1) || b.at(x, l.y0 - 2);
          const below = b.at(x, l.y1 + 1) || b.at(x, l.y1 + 2);
          if (!(above && below)) for (let y = l.y0; y <= l.y1; y++) b.d[y * w + x] = 0;
        }
      }
      i += 5;
    } else i++;
  }
  return staves;
}

function groupSystems(b: Bin, staves: Staff[]) {
  let sys = 0;
  for (let i = 0; i < staves.length; i++) {
    const s = staves[i];
    const n = staves[i + 1];
    s.system = sys;
    s.clef = 'treble';
    let joined = false;
    if (n && n.lines[0] - s.lines[4] < s.space * 12) {
      // a line on the left joining both staves (system barline or brace)
      const y0 = Math.round(s.lines[0]);
      const y1 = Math.round(n.lines[4]);
      const xl = Math.min(s.x0, n.x0);
      for (let x = Math.round(xl - s.space * 2.5); x <= xl + s.space * 0.6 && !joined; x++) {
        let dark = 0;
        for (let y = y0; y <= y1; y++) if (b.at(x, y) || b.at(x + 1, y)) dark++;
        if (dark > (y1 - y0) * 0.9) joined = true;
      }
    }
    if (joined) {
      // a grand staff: treble on top, bass below
      n.system = sys;
      n.clef = 'bass';
      i++;
    }
    sys++;
  }
}

// ------------------------------------------------------------------ notes

const STEP_NAMES = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3]; // B E A D G C F

/** MIDI note for a head, from staff position, clef, key signature and any accidental. */
export function noteMidi(n: OmrNote, staff: Staff, keySig: number): number {
  const base = staff.clef === 'treble' ? 4 * 7 + 2 : 2 * 7 + 4; // E4 or G2 on the bottom line
  const d = base + n.step;
  const oct = Math.floor(d / 7);
  const letter = ((d % 7) + 7) % 7;
  let midi = (oct + 1) * 12 + STEP_NAMES[letter];
  if (n.acc !== undefined) return midi + n.acc;
  if (keySig > 0 && SHARP_ORDER.slice(0, keySig).includes(letter)) midi++;
  if (keySig < 0 && FLAT_ORDER.slice(0, -keySig).includes(letter)) midi--;
  return midi;
}

export function noteBeats(n: Pick<OmrNote, 'filled' | 'stem' | 'beams' | 'dotted'>): number {
  let b = n.filled ? 1 / 2 ** Math.min(3, n.beams) : n.stem ? 2 : 4;
  if (n.dotted) b *= 1.5;
  return b;
}

function nearestStaff(staves: Staff[], y: number): number {
  let best = -1;
  let bd = Infinity;
  staves.forEach((s, i) => {
    const mid = (s.lines[0] + s.lines[4]) / 2;
    const d = Math.abs(y - mid);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function findStem(b: Bin, x: number, y: number, s: number) {
  let best = { len: 0, col: 0, end: 0, dir: 0 };
  for (const dir of [-1, 1]) {
    // stem up sits on the right of the head, stem down on the left
    const side = dir < 0 ? 1 : -1;
    for (let dx = 0.3 * s; dx <= 0.85 * s; dx += 1) {
      const col = Math.round(x + side * dx);
      let yy = Math.round(y);
      // start inside the head, walk away
      let len = 0;
      let miss = 0;
      while (miss <= 1 && yy > 0 && yy < b.h - 1) {
        yy += dir;
        if (b.at(col, yy)) {
          len += 1 + miss;
          miss = 0;
        } else miss++;
      }
      // must be thin (not a beam or head mass) a little away from the head
      const probe = y + dir * s * 1.6;
      if (len > best.len && b.hRun(col, probe) < s * 0.6) best = { len, col, end: y + dir * len, dir };
    }
  }
  return best;
}

function countBeams(b: Bin, stem: { col: number; end: number; dir: number }, s: number) {
  let best = 0;
  for (const side of [-1, 1]) {
    const x = stem.col + side * s * 0.75;
    let count = 0;
    let inRun = 0;
    // walk from the stem's tip back toward the head
    for (let k = 0; k <= s * 3.2; k++) {
      const y = stem.end - stem.dir * k + stem.dir * s * 0.6;
      if (b.at(x, y)) inRun++;
      else {
        if (inRun >= Math.max(2, s * 0.22)) count++;
        inRun = 0;
      }
    }
    if (inRun >= Math.max(2, s * 0.22)) count++;
    best = Math.max(best, count);
  }
  return Math.min(3, best);
}

function hasDot(b: Bin, x: number, y: number, s: number) {
  for (let dx = 0.95 * s; dx <= 1.9 * s; dx += 1) {
    for (const dy of [0, -0.5 * s, 0.5 * s]) {
      const cx = x + dx;
      const cy = y + dy;
      if (b.frac(cx, cy, s * 0.3, s * 0.3) > 0.75 && b.frac(cx, cy, s * 0.9, s * 0.9) < 0.3) return true;
    }
  }
  return false;
}

/** white holes enclosed by dark pixels: centres of hollow (half / whole) note heads */
function hollowHeads(b: Bin, s: number, yLo: number, yHi: number): { x: number; y: number }[] {
  const { w, h, d } = b;
  const label = new Int32Array(w * h);
  const out: { x: number; y: number }[] = [];
  const stack: number[] = [];
  const y0 = Math.max(1, Math.floor(yLo));
  const y1 = Math.min(h - 2, Math.ceil(yHi));
  const maxArea = s * s * 1.2;
  let id = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (d[i] || label[i]) continue;
      // flood fill this white region; it is "open" if it grows big, reaches the
      // band's edge, or runs into a region filled earlier
      id++;
      let area = 0;
      let minx = x;
      let maxx = x;
      let miny = y;
      let maxy = y;
      let sx = 0;
      let sy = 0;
      let open = false;
      stack.length = 0;
      stack.push(i);
      label[i] = id;
      while (stack.length) {
        const j = stack.pop()!;
        const jx = j % w;
        const jy = (j - jx) / w;
        area++;
        sx += jx;
        sy += jy;
        if (jx < minx) minx = jx;
        if (jx > maxx) maxx = jx;
        if (jy < miny) miny = jy;
        if (jy > maxy) maxy = jy;
        if (area > maxArea || jx <= 0 || jy <= y0 || jx >= w - 1 || jy >= y1) open = true;
        if (open && area > maxArea * 4) break;
        for (const k of [j - 1, j + 1, j - w, j + w]) {
          if (d[k]) continue;
          if (!label[k]) {
            label[k] = id;
            stack.push(k);
          } else if (label[k] !== id) open = true;
        }
      }
      if (open) continue;
      const bw = maxx - minx + 1;
      const bh = maxy - miny + 1;
      if (area < s * s * 0.08 || bw < s * 0.4 || bw > s * 1.2 || bh > s * 0.85 || bh < s * 0.2) continue;
      const cx = sx / area;
      const cy = sy / area;
      const ring = b.frac(cx, cy, s * 1.3, s * 0.95);
      if (ring < 0.3 || ring > 0.85) continue;
      out.push({ x: cx, y: cy });
    }
  }
  return out;
}

interface Comp {
  minx: number;
  maxx: number;
  miny: number;
  maxy: number;
  n: number;
  sy: number;
}

/** 8-connected ink blobs inside a rectangle */
function components(b: Bin, X0: number, Y0: number, X1: number, Y1: number): Comp[] {
  X0 = Math.max(0, Math.round(X0));
  Y0 = Math.max(0, Math.round(Y0));
  X1 = Math.min(b.w - 1, Math.round(X1));
  Y1 = Math.min(b.h - 1, Math.round(Y1));
  const W = X1 - X0 + 1;
  const H = Y1 - Y0 + 1;
  if (W <= 0 || H <= 0) return [];
  const seen = new Uint8Array(W * H);
  const out: Comp[] = [];
  const stack: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (seen[y * W + x] || !b.d[(y + Y0) * b.w + x + X0]) continue;
      const c: Comp = { minx: Infinity, maxx: -Infinity, miny: Infinity, maxy: -Infinity, n: 0, sy: 0 };
      stack.push(y * W + x);
      seen[y * W + x] = 1;
      while (stack.length) {
        const j = stack.pop()!;
        const jx = j % W;
        const jy = (j - jx) / W;
        c.n++;
        c.sy += jy + Y0;
        c.minx = Math.min(c.minx, jx + X0);
        c.maxx = Math.max(c.maxx, jx + X0);
        c.miny = Math.min(c.miny, jy + Y0);
        c.maxy = Math.max(c.maxy, jy + Y0);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = jx + dx;
            const ny = jy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const k = ny * W + nx;
            if (!seen[k] && b.d[(ny + Y0) * b.w + nx + X0]) {
              seen[k] = 1;
              stack.push(k);
            }
          }
      }
      out.push(c);
    }
  return out;
}

/**
 * Reads the clef and key signature at the start of each staff. Returns the
 * key (+sharps / -flats, by vote) and, per staff, where the music starts.
 */
function keySignature(b: Bin, staves: Staff[]): { key: number; start: number[] } {
  const votes = new Map<number, number>();
  const start: number[] = [];
  staves.forEach((st) => {
    const s = st.space;
    const top = st.lines[0] - s * 1.6;
    const bot = st.lines[4] + s * 1.6;
    const comps = components(b, st.x0 + s * 0.3, top, st.x0 + s * 16, bot);
    // the clef: a big blob right at the start
    const clefs = comps.filter((c) => c.minx < st.x0 + s * 2 && c.maxy - c.miny > s * 2.5 && c.maxx - c.minx > s * 1.2);
    let edge = clefs.length ? Math.max(...clefs.map((c) => c.maxx)) : st.x0 + s * 3;
    // accidentals: count their vertical strokes (a sharp has two close together, a flat one)
    const strokes: number[] = [];
    for (let x = Math.round(edge + 1); x < st.x0 + s * 16; x++) {
      let run = 0;
      let best = 0;
      for (let y = Math.round(top); y <= bot; y++) {
        if (b.at(x, y)) best = Math.max(best, ++run);
        else run = 0;
      }
      if (best >= s * 1.3) {
        if (strokes.length && x - strokes[strokes.length - 1] > s * 1.05) break;
        if (!strokes.length && x - edge > s * 1.8) break;
        strokes.push(x);
      } else if (strokes.length && x - strokes[strokes.length - 1] > s * 1.05) break;
    }
    // merge neighbouring columns into strokes
    const cs: number[] = [];
    for (const x of strokes) if (!cs.length || x - cs[cs.length - 1] > 1.5) cs.push(x);
    else cs[cs.length - 1] = x;
    let count = 0;
    let flats = 0;
    if (cs.length) {
      const gaps = cs.slice(1).map((x, i) => x - cs[i]);
      const mean = gaps.length ? gaps.reduce((p, q) => p + q, 0) / gaps.length : s;
      if (mean < s * 0.75 && cs.length >= 2) count = Math.round(cs.length / 2);
      else {
        count = cs.length;
        flats = count;
      }
      count = Math.min(7, count);
      edge = cs[cs.length - 1] + s * 0.2;
    }
    start.push(edge + s * 0.4);
    const v = flats > count / 2 ? -count : count;
    votes.set(v, (votes.get(v) ?? 0) + (st.system > 0 ? 2 : 1));
  });
  let key = 0;
  let bv = -1;
  for (const [k, v] of votes) if (v > bv || (v === bv && Math.abs(k) > Math.abs(key))) [key, bv] = [k, v];
  return { key, start };
}

export function recognize(g: Gray): OmrResult {
  const thr = Math.min(200, otsu(g));
  const bin = new Uint8Array(g.w * g.h);
  for (let i = 0; i < bin.length; i++) bin[i] = g.data[i] <= thr ? 1 : 0;
  const b = new Bin(g.w, g.h, bin);
  const staves = findStaves(b);
  if (!staves.length) throw new Error("I couldn't find any music staves in that picture.");
  groupSystems(b, staves);
  b.integral();
  const ks = keySignature(b, staves);
  const s = staves.map((x) => x.space).sort((a, c) => a - c)[staves.length >> 1];

  // --- filled heads
  const cands: { x: number; y: number; f: number }[] = [];
  const hw = s * 1.0;
  const hh = s * 0.62;
  for (const st of staves) {
    const yA = Math.max(0, Math.round(st.lines[0] - s * 5));
    const yB = Math.min(g.h - 1, Math.round(st.lines[4] + s * 5));
    for (let y = yA; y <= yB; y++) {
      for (let x = Math.round(st.x0 + s * 1.5); x <= st.x1; x++) {
        if (!bin[y * g.w + x]) continue;
        const f = b.frac(x, y, hw, hh);
        if (f < 0.8) continue;
        cands.push({ x, y, f });
      }
    }
  }
  cands.sort((a, c) => c.f - a.f);
  const heads: { x: number; y: number; filled: boolean }[] = [];
  for (const c of cands) {
    if (heads.some((h) => Math.abs(h.x - c.x) < s * 0.9 && Math.abs(h.y - c.y) < s * 0.7)) continue;
    // reject long horizontal ink (beams, thick ledger clusters)
    if (b.hRun(c.x, c.y) > s * 2.6) continue;
    heads.push({ x: c.x, y: c.y, filled: true });
  }
  for (const st of staves) {
    for (const h of hollowHeads(b, s, st.lines[0] - s * 4, st.lines[4] + s * 4)) {
      if (h.x < st.x0 + s * 1.5) continue;
      if (heads.some((o) => Math.abs(o.x - h.x) < s * 0.9 && Math.abs(o.y - h.y) < s * 0.7)) continue;
      heads.push({ x: h.x, y: h.y, filled: false });
    }
  }

  // --- classify
  const notes: OmrNote[] = [];
  let id = 0;
  for (const h of heads) {
    const si = nearestStaff(staves, h.y);
    const st = staves[si];
    const stem = findStem(b, h.x, h.y, s);
    const hasStem = stem.len >= s * 2.3;
    // filled heads always have a stem; without one it's probably a clef/digit/text blob
    if (h.filled && !hasStem) continue;
    const beams = h.filled && hasStem ? countBeams(b, stem, s) : 0;
    const step = Math.round((st.lines[4] - h.y) / (st.space / 2));
    if (Math.abs(step - 4) > 14) continue;
    const n: OmrNote = {
      id: id++,
      x: h.x,
      y: h.y,
      staff: si,
      step,
      filled: h.filled,
      stem: hasStem,
      beams,
      dotted: hasDot(b, h.x, h.y, s),
      beats: 0,
    };
    n.beats = noteBeats(n);
    notes.push(n);
  }
  notes.sort((a, c) => a.staff - c.staff || a.x - c.x || c.step - a.step);

  return { w: g.w, h: g.h, space: s, staves, notes: notes.filter((n) => n.x > ks.start[n.staff]), keySig: ks.key };
}

// ------------------------------------------------------------------ timing

export interface TimedNote {
  midi: number;
  beat: number;
  beats: number;
  left: boolean;
  id: number;
}

/**
 * Line the notes up in time: heads at the same x across a system's staves
 * start together; each column lasts as long as its shortest new note.
 */
export function toTimeline(r: OmrResult): TimedNote[] {
  const out: TimedNote[] = [];
  const systems = [...new Set(r.staves.map((s) => s.system))].sort((a, b) => a - b);
  let t = 0;
  for (const sys of systems) {
    const sts = r.staves.map((s, i) => ({ s, i })).filter((o) => o.s.system === sys);
    const ns = r.notes.filter((n) => sts.some((o) => o.i === n.staff)).sort((a, b) => a.x - b.x);
    const cols: OmrNote[][] = [];
    for (const n of ns) {
      const c = cols[cols.length - 1];
      if (c && n.x - c[0].x < r.space * 0.9) c.push(n);
      else cols.push([n]);
    }
    for (const c of cols) {
      for (const n of c) {
        const st = r.staves[n.staff];
        const left = st.clef === 'bass' && sts.length > 1;
        out.push({ midi: noteMidi(n, st, r.keySig), beat: t, beats: n.beats, left, id: n.id });
      }
      t += Math.min(...c.map((n) => n.beats));
    }
  }
  return out;
}
