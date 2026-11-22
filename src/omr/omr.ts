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
  /** tied to the next note of the same pitch (they play as one long note) */
  tie?: boolean;
  /** a small grace note, played quickly just before the next note */
  grace?: boolean;
}

export interface OmrRest {
  id: number;
  x: number;
  y: number;
  staff: number;
  /** length in beats; 0 = a whole-bar rest */
  beats: number;
}

export interface OmrResult {
  w: number;
  h: number;
  space: number;
  staves: Staff[];
  notes: OmrNote[];
  rests: OmrRest[];
  /** x of each barline, per system */
  bars: Record<number, number[]>;
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
  // every long horizontal run in every row (a picture can hold two pages side by side)
  const minRun = w * 0.12;
  const rows: { y: number; x0: number; x1: number }[][] = [];
  for (let y = 0; y < h; y++) {
    const segs: { y: number; x0: number; x1: number }[] = [];
    let run = 0;
    let gap = 0;
    let start = 0;
    const close = () => {
      if (run > minRun) segs.push({ y, x0: start, x1: start + run });
      run = 0;
      gap = 0;
    };
    for (let x = 0; x < w; x++) {
      if (b.d[y * w + x]) {
        if (run === 0) start = x;
        run += 1 + gap;
        gap = 0;
      } else if (run > 0 && gap < 2) gap++; // bridge tiny breaks
      else if (run > 0) close();
    }
    if (run > 0) close();
    rows.push(segs);
  }
  // stack runs from neighbouring rows that overlap into lines
  const lines: Line[] = [];
  let open: Line[] = [];
  for (let y = 0; y < h; y++) {
    const next: Line[] = [];
    for (const r of rows[y]) {
      const l = open.find((o) => o.y1 === y - 1 && Math.min(o.x1, r.x1) - Math.max(o.x0, r.x0) > (r.x1 - r.x0) * 0.5);
      if (l) {
        l.y1 = y;
        l.x0 = Math.min(l.x0, r.x0);
        l.x1 = Math.max(l.x1, r.x1);
        next.push(l);
      } else {
        const nl = { y0: y, y1: y, x0: r.x0, x1: r.x1 };
        lines.push(nl);
        next.push(nl);
      }
    }
    open = next;
  }
  // a line that isn't perfectly level can come out as two pieces a row
  // apart (one row's run started fresh), or broken where something crosses
  // it: join pieces at the same height that touch or nearly do
  lines.sort((a, c) => a.y0 - c.y0);
  for (let joined = true; joined; ) {
    joined = false;
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length && lines[j].y0 <= lines[i].y1 + 2; j++) {
        const a = lines[i];
        const c = lines[j];
        if (Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) <= -w * 0.02) continue;
        a.y1 = Math.max(a.y1, c.y1);
        a.x0 = Math.min(a.x0, c.x0);
        a.x1 = Math.max(a.x1, c.x1);
        lines.splice(j--, 1);
        joined = true;
      }
    }
  }
  // columns: lines that overlap sideways belong together
  const cols: Line[][] = [];
  for (const l of [...lines].sort((a, c) => a.x0 - c.x0)) {
    const c = cols.find((cl) => cl.some((o) => Math.min(o.x1, l.x1) - Math.max(o.x0, l.x0) > Math.min(o.x1 - o.x0, l.x1 - l.x0) * 0.5));
    if (c) c.push(l);
    else cols.push([l]);
  }
  cols.sort((a, c) => Math.min(...a.map((l) => l.x0)) - Math.min(...c.map((l) => l.x0)));
  const staves: Staff[] = [];
  const cy = (l: Line) => (l.y0 + l.y1) / 2;
  for (const col of cols) {
    const ln = col.sort((a, c) => a.y0 - c.y0);
    for (let i = 0; i + 4 < ln.length; ) {
      const g = [1, 2, 3, 4].map((k) => cy(ln[i + k]) - cy(ln[i + k - 1]));
      const m = g.reduce((a, c) => a + c, 0) / 4;
      const thick = Math.max(...ln.slice(i, i + 5).map((l) => l.y1 - l.y0 + 1));
      if (g.every((x) => x > m * 0.8 && x < m * 1.2) && m > thick * 2.5 && m > 4) {
        const ls = ln.slice(i, i + 5);
        staves.push({
          lines: ls.map(cy),
          x0: Math.min(...ls.map((l) => l.x0)),
          x1: Math.max(...ls.map((l) => l.x1)),
          space: m,
          clef: 'treble',
          system: 0,
        });
        // erase the staff lines where nothing crosses them
        // (a line in a photo wanders a pixel or two around its average
        // height, so follow the actual dark run in each column)
        const thin = Math.max(2, Math.round(Math.min(...ls.map((l) => l.y1 - l.y0 + 1))));
        // (and a piece of a line can be missing from the line found: follow it
        // out to the ends of the whole staff)
        const X0 = Math.min(...ls.map((l) => l.x0));
        const X1 = Math.max(...ls.map((l) => l.x1));
        for (const l of ls) {
          const half = (l.y1 - l.y0) / 2;
          for (const dir of [1, -1]) {
            let yc = Math.round((l.y0 + l.y1) / 2);
            const from = Math.round((l.x0 + l.x1) / 2);
            for (let x = from; dir > 0 ? x <= X1 : x >= X0; x += dir) {
              let y = -1;
              for (let d = 0; d <= thin + 1 && y < 0; d++) {
                if (b.at(x, yc + d)) y = yc + d;
                else if (b.at(x, yc - d)) y = yc - d;
              }
              if (y < 0) continue;
              let a = y;
              let c = y;
              while (b.at(x, a - 1) && y - a < m) a--;
              while (b.at(x, c + 1) && c - y < m) c++;
              if (c - a + 1 > thin + 1) {
                // something crosses the line here; keep it
                const y0 = Math.round(yc - half);
                const y1 = Math.round(yc + half);
                const above = b.at(x, y0 - 1) || b.at(x, y0 - 2);
                const below = b.at(x, y1 + 1) || b.at(x, y1 + 2);
                if (!(above && below)) for (let yy = y0; yy <= y1; yy++) b.d[yy * w + x] = 0;
                continue;
              }
              for (let yy = a; yy <= c; yy++) b.d[yy * w + x] = 0;
              yc = Math.round((a + c) / 2);
            }
          }
        }
        i += 5;
      } else i++;
    }
  }
  return staves;
}

/**
 * Treble or bass clef at the start of a staff. A treble clef reaches well above
 * and below the staff; a bass clef sits in its top three-quarters (with two dots).
 */
function readClef(b: Bin, st: Staff): 'treble' | 'bass' {
  const s = st.space;
  const comps = components(b, st.x0 + s * 0.2, st.lines[0] - s * 3, st.x0 + s * 4.5, st.lines[4] + s * 3).filter(
    (c) => c.maxx - c.minx > s * 1.0 && c.maxy - c.miny > s * 2,
  );
  if (!comps.length) return 'treble';
  const c = comps.sort((a, d) => a.minx - d.minx)[0];
  const tall = c.maxy - c.miny;
  if (tall > s * 4.6 || c.maxy > st.lines[4] + s * 0.6) return 'treble';
  return 'bass';
}

function groupSystems(b: Bin, staves: Staff[]) {
  let sys = 0;
  for (let i = 0; i < staves.length; i++) {
    const s = staves[i];
    const n = staves[i + 1];
    s.system = sys;
    s.clef = 'treble';
    let joined = false;
    const sameCol = n && Math.min(n.x1, s.x1) - Math.max(n.x0, s.x0) > (s.x1 - s.x0) * 0.5;
    if (n && sameCol && n.lines[0] - s.lines[4] > 0 && n.lines[0] - s.lines[4] < s.space * 12) {
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
    s.clef = readClef(b, s);
    if (joined) {
      n.system = sys;
      n.clef = readClef(b, n);
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

function nearestStaff(staves: Staff[], y: number, x?: number): number {
  let best = -1;
  let bd = Infinity;
  staves.forEach((s, i) => {
    if (x !== undefined && (x < s.x0 - s.space * 3 || x > s.x1 + s.space)) return;
    const mid = (s.lines[0] + s.lines[4]) / 2;
    const d = Math.abs(y - mid);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

function findStem(b: Bin, x: number, y: number, s: number, anyWidth = false) {
  // the longest stem on each side; then the shorter of the two valid ones, so a
  // chord note touching another voice's head doesn't borrow that voice's stem
  const up = stemDir(b, x, y, s, -1, anyWidth);
  const down = stemDir(b, x, y, s, 1, anyWidth);
  const ok = (st: typeof up) => st.len >= s * 2.3;
  if (ok(up) && ok(down)) return up.len <= down.len ? up : down;
  return ok(up) ? up : ok(down) ? down : up.len >= down.len ? up : down;
}

function stemDir(b: Bin, x: number, y: number, s: number, only: number, anyWidth = false) {
  let best = { len: 0, col: 0, col0: 0, end: 0, dir: only };
  for (const dir of [only]) {
    // stem up sits on the right of the head, stem down on the left
    const side = dir < 0 ? 1 : -1;
    for (let dx = 0.3 * s; dx <= 1.0 * s; dx += 1) {
      const col = Math.round(x + side * dx);
      let yy = Math.round(y);
      // start inside the head, walk away
      let len = 0;
      let miss = 0;
      // a hand-drawn stem (or one in a photo that isn't quite square on)
      // leans: follow it sideways a pixel at a time, a little at most
      let c = col;
      const path: number[] = [];
      // (a hand-drawn stem may start at the head's corner, past a little gap)
      while ((miss <= 1 || (len < s * 0.7 && miss < s * 0.35)) && yy > 0 && yy < b.h - 1) {
        yy += dir;
        if (!b.at(c, yy)) {
          // step onto the nearest ink a pixel or two over, then to the middle of the stroke
          let n = 0;
          for (const k of [1, -1, 2, -2, 3, -3]) if (!n && b.at(c + k, yy) && Math.abs(c + k - col) < 1 + len * 0.45) n = k;
          if (n) {
            let a = c + n;
            let z = c + n;
            while (b.at(a - 1, yy) && z - a < s * 0.5) a--;
            while (b.at(z + 1, yy) && z - a < s * 0.5) z++;
            c = z - a < s * 0.5 ? Math.round((a + z) / 2) : c + n;
          }
        }
        path.push(c);
        if (b.at(c, yy)) {
          len += 1 + miss;
          miss = 0;
        } else miss++;
      }
      const colAt = (d: number) => path[Math.max(0, Math.min(path.length - 1, Math.round(d) - 1))] ?? col;
      // must be thin (not a beam or head mass) a little away from the head
      // (in a chord the stem runs past other heads, so look along its length)
      let thin = anyWidth;
      for (let k = 1.0; k <= Math.max(1.0, len / s - 0.3) && !thin; k += 0.5) thin = b.hRun(colAt(s * k), y + dir * s * k) < s * 0.6;
      if (len > best.len && thin) best = { len, col: colAt(len), col0: colAt(s * 0.5), end: y + dir * len, dir };
    }
  }
  return best;
}

function countBeams(b: Bin, stem: { col: number; end: number; dir: number; len: number }, s: number) {
  let best = 0;
  const runs = (x: number) => {
    let count = 0;
    let inRun = 0;
    // walk from just past the stem's tip back toward the head
    const reach = Math.min(s * 3.0, Math.abs(stem.len) - s * 0.6);
    for (let k = 0; k <= reach; k++) {
      const y = stem.end - stem.dir * k + stem.dir * s * 0.6;
      if (b.at(x, y)) inRun++;
      else {
        if (inRun >= Math.max(2, s * 0.2)) count++;
        inRun = 0;
      }
    }
    if (inRun >= Math.max(2, s * 0.2)) count++;
    return count;
  };
  for (const side of [-1, 1]) {
    // a beam or flag crosses both sample columns; a stray mark usually only one
    const a = runs(stem.col + side * s * 0.55);
    const c = runs(stem.col + side * s * 1.0);
    best = Math.max(best, c === 0 ? 0 : a);
  }
  return Math.min(3, best);
}

function hasDot(b: Bin, x: number, y: number, s: number) {
  for (let dx = 0.95 * s; dx <= 1.9 * s; dx += 1) {
    for (const dy of [0, -0.2 * s, 0.2 * s, -0.5 * s, 0.5 * s]) {
      const cx = x + dx;
      const cy = y + dy;
      if (b.frac(cx, cy, s * 0.3, s * 0.3) > 0.75 && b.frac(cx, cy, s * 0.9, s * 0.9) < 0.3) {
        // a dot, not a thin barline or stem running through
        if (b.frac(cx, cy - s * 0.6, s * 0.3, s * 0.3) > 0.4 && b.frac(cx, cy + s * 0.6, s * 0.3, s * 0.3) > 0.4) continue;
        return true;
      }
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
      // (a hand-drawn whole note is a wider oval: its hole can be 1.6 spaces across)
      if (area < s * s * 0.08 || bw < s * 0.4 || bw > s * 1.7 || bh > s * 0.85 || bh < s * 0.2) continue;
      if (bw > s * 1.2 && bw < bh * 1.5) continue;
      const cx = sx / area;
      const cy = sy / area;
      const ring = b.frac(cx, cy, Math.max(s * 1.3, bw + s * 0.5), Math.max(s * 0.95, bh + s * 0.45));
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
  const clefEnd: number[] = [];
  const own: number[] = [];
  staves.forEach((st) => {
    const s = st.space;
    const top = st.lines[0] - s * 1.6;
    const bot = st.lines[4] + s * 1.6;
    const comps = components(b, st.x0 + s * 0.3, top, st.x0 + s * 16, bot);
    // the clef: a big blob right at the start
    const clefs = comps.filter((c) => c.minx < st.x0 + s * 2 && c.maxy - c.miny > s * 2.5 && c.maxx - c.minx > s * 1.2);
    let edge = clefs.length ? Math.max(...clefs.map((c) => c.maxx)) : st.x0 + s * 3;
    clefEnd.push(edge);
    // accidentals: count their vertical strokes (a sharp has two close together, a flat one)
    const strokes: number[] = [];
    let tallest = 0;
    for (let x = Math.round(edge + 1); x < st.x0 + s * 16; x++) {
      let run = 0;
      let best = 0;
      for (let y = Math.round(top); y <= bot; y++) {
        if (b.at(x, y)) best = Math.max(best, ++run);
        else run = 0;
      }
      if (best >= s * 2.0) {
        if (strokes.length && x - strokes[strokes.length - 1] > s * 1.05) break;
        if (!strokes.length && x - edge > s * 1.8) break;
        strokes.push(x);
        tallest = Math.max(tallest, best);
      } else if (strokes.length && x - strokes[strokes.length - 1] > s * 1.05) break;
    }
    // the time signature's digits are not accidentals
    // (stacked digits fill the whole staff height; a sharp or flat is shorter)
    if (strokes.length && (tallest > s * 3.6 || timeSigAt(b, [st], strokes[0] - s * 0.6, s))) strokes.length = 0;
    // merge neighbouring columns into strokes
    const cs: number[] = [];
    for (const x of strokes) if (!cs.length || x - cs[cs.length - 1] > 1.5) cs.push(x);
    else cs[cs.length - 1] = x;
    let count = 0;
    let flats = 0;
    let sure = true;
    // a single stroke is a flat only if it has a flat's bowl at its foot
    // (otherwise it's a broken-up sharp or a stray mark, and says nothing)
    if (cs.length === 1) {
      const x = cs[0];
      let foot = -1;
      for (let y = Math.round(bot); y >= top && foot < 0; y--) if (b.at(x, y) || b.at(x - 1, y)) foot = y;
      let bowl = 0;
      for (let dx = Math.round(s * 0.25); dx <= s * 0.7; dx++) for (let dy = 0; dy < s * 0.8; dy++) if (b.at(x + dx, foot - dy)) bowl++;
      if (foot < 0 || bowl < s * s * 0.45 * 0.8 * 0.15) {
        cs.length = 0;
        sure = false;
      }
    }
    // hand-copied music often has small sharps (under two spaces tall) the
    // stroke scan above misses: look at the shapes right after the clef
    if (!cs.length) {
      const pieces = comps
        .filter((c) => c.minx > edge - s * 0.2 && c.minx < st.x0 + s * 16)
        .sort((a, c) => a.minx - c.minx);
      let at = edge;
      let sharps = 0;
      for (const c of pieces) {
        if (c.minx - at > s * (sharps ? 1.0 : 1.8)) break;
        const ht = c.maxy - c.miny + 1;
        const wd = c.maxx - c.minx + 1;
        if (ht < s * 1.1 || ht > s * 2.8 || wd < s * 0.45 || wd > s * 2.0) break;
        // count its upright strokes: columns dark for most of its height
        const up: number[] = [];
        for (let x = c.minx; x <= c.maxx; x++) {
          let run = 0;
          let best = 0;
          for (let y = c.miny; y <= c.maxy; y++) {
            if (b.at(x, y)) best = Math.max(best, ++run);
            else run = 0;
          }
          if (best >= ht * 0.6 && (!up.length || x - up[up.length - 1] > 1.5)) up.push(x);
          else if (best >= ht * 0.6) up[up.length - 1] = x;
        }
        if (up.length !== 2 || up[1] - up[0] > s * 0.9) break;
        sharps++;
        at = c.maxx;
      }
      if (sharps) {
        count = Math.min(7, sharps);
        edge = at + s * 0.2;
        sure = true;
      }
    }
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
    own.push(v);
    if (sure) votes.set(v, (votes.get(v) ?? 0) + (st.system > 0 ? 2 : 1));
  });
  let key = 0;
  let bv = -1;
  for (const [k, v] of votes) if (v > bv || (v === bv && Math.abs(k) > Math.abs(key))) [key, bv] = [k, v];
  // every staff repeats the key signature, even where it didn't read cleanly
  // here (a faint sharp mustn't turn into a note)
  staves.forEach((st, i) => {
    if (key && own[i] !== key) start[i] = Math.max(start[i], clefEnd[i] + Math.abs(key) * st.space * 0.9 + st.space * 0.4);
  });
  return { key, start };
}


// ------------------------------------------------------------------ bars, rests, ties, accidentals

function findBars(b: Bin, staves: Staff[], sys: number, s: number): number[] {
  const sts = staves.filter((st) => st.system === sys);
  const x0 = Math.min(...sts.map((t) => t.x0));
  const x1 = Math.max(...sts.map((t) => t.x1));
  const cols: number[] = [];
  // a hand-drawn barline (or one in a photo) can lean a little: try a few slants
  const lean = Math.max(1, Math.round(s * 0.15));
  for (let x = Math.round(x0 + s * 0.5); x <= x1; x++) {
    let found = false;
    for (let t = 0; t <= lean * 2 && !found; t++) {
      const tilt = t % 2 ? (t + 1) / 2 : -t / 2; // 0, 1, -1, 2, -2, ...
      const full = sts.every((st) => {
        let dark = 0;
        const ya = Math.round(st.lines[0]);
        const yb = Math.round(st.lines[4]);
        for (let y = ya; y <= yb; y++) if (b.at(x + (tilt * (y - ya)) / Math.max(1, yb - ya), y)) dark++;
        return dark >= (yb - ya + 1) * 0.95;
      });
      // a barline is thin: not part of a big blob (chord, beam)
      const my = (sts[0].lines[1] + sts[0].lines[2]) / 2;
      const mx = x + (tilt * (my - sts[0].lines[0])) / Math.max(1, sts[0].lines[4] - sts[0].lines[0]);
      if (full && b.hRun(mx, my) < s * 0.9) found = true;
    }
    if (found) cols.push(x);
  }
  const bars: number[] = [];
  for (const x of cols) {
    const l = bars[bars.length - 1];
    if (l !== undefined && x - l < s * 1.2) bars[bars.length - 1] = x;
    else bars.push(x);
  }
  return bars;
}

function findRests(b: Bin, st: Staff, si: number, start: number, heads: { x: number; y: number }[], s: number): OmrRest[] {
  const out: OmrRest[] = [];
  const comps = components(b, start + s * 0.3, st.lines[0] - s * 0.4, st.x1, st.lines[4] + s * 0.4);
  for (const c of comps) {
    const w = c.maxx - c.minx + 1;
    const h = c.maxy - c.miny + 1;
    if (c.n < s * s * 0.15) continue;
    // anything touching a note head belongs to a note
    if (heads.some((hd) => hd.x >= c.minx - s * 0.7 && hd.x <= c.maxx + s * 0.7 && hd.y >= c.miny - s * 0.5 && hd.y <= c.maxy + s * 0.5)) continue;
    const fill = c.n / (w * h);
    const cx = (c.minx + c.maxx) / 2;
    const cy = (c.miny + c.maxy) / 2;
    let beats = -1;
    if (w > s * 0.8 && w < s * 1.8 && h > s * 0.25 && h < s * 0.8 && fill > 0.7) {
      if (Math.abs(c.miny - st.lines[1]) < s * 0.4) beats = 0; // whole-bar rest hangs from line 2
      else if (Math.abs(c.maxy - st.lines[2]) < s * 0.4) beats = 2; // half rest sits on the middle line
    } else if (h > s * 2.1 && h < s * 3.6 && w > s * 0.5 && w < s * 1.4 && fill < 0.65 && cy > st.lines[1] && cy < st.lines[3]) {
      beats = c.miny - st.lines[0] > s * 1.0 ? 0.25 : 1; // a 16th rest sits lower than a quarter rest
    } else if (h > s * 1.1 && h <= s * 2.1 && w > s * 0.45 && w < s * 1.4 && fill < 0.7 && cy > st.lines[0] && cy < st.lines[4]) {
      beats = 0.5; // eighth rest
    }
    if (beats < 0) continue;
    if (beats > 0 && (hasDot(b, c.maxx - s * 0.8, c.miny + s * 0.5, s) || hasDot(b, c.maxx - s * 0.8, cy, s))) beats *= 1.5;
    out.push({ id: 0, x: cx, y: cy, staff: si, beats });
  }
  return out;
}

/** time signature digits right after a barline (or the key): two stacked glyphs in every staff */
function timeSigAt(b: Bin, sts: Staff[], x: number, s: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const st of sts) {
    const comps = components(b, x, st.lines[0] - s * 0.3, x + s * 3, st.lines[4] + s * 0.3).filter((c) => c.n > s * s * 0.3);
    const top = comps.find((c) => Math.abs(c.miny - st.lines[0]) < s * 0.45 && Math.abs(c.maxy - st.lines[2]) < s * 0.5);
    const bot = comps.find((c) => Math.abs(c.miny - st.lines[2]) < s * 0.5 && Math.abs(c.maxy - st.lines[4]) < s * 0.45);
    if (!top || !bot || Math.abs(top.minx - bot.minx) > s * 0.8) {
      // the two digits can touch through the middle line and come out as one piece
      const both = comps.find(
        (c) =>
          Math.abs(c.miny - st.lines[0]) < s * 0.45 &&
          Math.abs(c.maxy - st.lines[4]) < s * 0.45 &&
          c.maxx - c.minx >= s * 1.2 &&
          c.maxx - c.minx <= s * 3 &&
          c.n >= s * s * 2.5,
      );
      if (!both) return null;
      lo = Math.min(lo, both.minx);
      hi = Math.max(hi, both.maxx);
      continue;
    }
    lo = Math.min(lo, top.minx, bot.minx);
    hi = Math.max(hi, top.maxx, bot.maxx);
  }
  return [lo, hi];
}

function hasLedgers(b: Bin, st: Staff, x: number, step: number, s: number): boolean {
  const need: number[] = [];
  if (step >= 10) for (let k = 10; k <= step; k += 2) need.push(k);
  if (step <= -2) for (let k = -2; k >= step; k -= 2) need.push(k);
  for (const k of need) {
    const y = st.lines[4] - (k * st.space) / 2;
    let ok = false;
    for (let dy = -2; dy <= 2 && !ok; dy++) {
      const run = Math.max(b.hRun(x - s * 0.8, y + dy), b.hRun(x + s * 0.8, y + dy), b.hRun(x, y + dy));
      if (run >= (k === step ? s * 1.5 : s * 1.2)) ok = true;
    }
    if (!ok) return false;
  }
  return true;
}

function strokesIn(b: Bin, x0: number, x1: number, y0: number, y1: number, minLen: number) {
  const out: { x: number; top: number; bot: number }[] = [];
  for (let x = Math.round(x0); x <= x1; x++) {
    let run = 0;
    let best = { len: 0, end: 0 };
    for (let y = Math.round(y0); y <= y1; y++) {
      if (b.at(x, y)) {
        run++;
        if (run > best.len) best = { len: run, end: y };
      } else run = 0;
    }
    if (best.len >= minLen) {
      const l = out[out.length - 1];
      const st = { x, top: best.end - best.len + 1, bot: best.end };
      if (l && x - l.x <= 1.5) {
        l.x = x;
        l.top = Math.min(l.top, st.top);
        l.bot = Math.max(l.bot, st.bot);
      } else out.push(st);
    }
  }
  return out;
}

function crossings(b: Bin, x: number, y0: number, y1: number, s: number) {
  let n = 0;
  let inRun = false;
  let len = 0;
  for (let y = Math.round(y0); y <= y1; y++) {
    if (b.at(x, y)) {
      if (!inRun) n++;
      inRun = true;
      if (++len > s * 0.7) return 99; // a solid block, not thin bars
    } else {
      inRun = false;
      len = 0;
    }
  }
  return n;
}

/** a sharp, flat or natural printed just left of a note head */
function accidentalFor(b: Bin, n: { x: number; y: number }, heads: { x: number; y: number }[], s: number): number | undefined {
  const strokes = strokesIn(b, n.x - s * 2.4, n.x - s * 0.8, n.y - s * 2.3, n.y + s * 2.1, s * 1.4).filter(
    // drop stems of other notes
    (k) => !heads.some((h) => h !== n && Math.abs(h.x - k.x) < s * 0.85 && h.y > k.top - s * 0.7 && h.y < k.bot + s * 0.7),
  );
  if (!strokes.length) return undefined;
  const near = strokes.slice(-2);
  if (near.length === 2 && near[1].x - near[0].x <= s * 0.8) {
    const [l, r] = near;
    const mid = (Math.min(l.top, r.top) + Math.max(l.bot, r.bot)) / 2;
    if (Math.abs(mid - n.y) > s * 0.8) return undefined;
    // sharps and naturals have two crossbars between their strokes (flags and stems don't)
    if (crossings(b, (l.x + r.x) / 2, n.y - s * 1.3, n.y + s * 1.3, s) !== 2) return undefined;
    if (l.top < r.top - s * 0.35 && l.bot < r.bot - s * 0.35) return 0; // natural: left stroke higher
    return 1;
  }
  const k = near[near.length - 1];
  if (Math.abs(k.bot - n.y) < s * 0.8 && k.top < n.y - s * 1.2) {
    // flat: a little bowl to the right of the stroke at the note's height
    const c = crossings(b, k.x + s * 0.35, n.y - s * 0.9, k.bot + 1, s);
    if (c >= 1 && c <= 2 && k.x + s * 0.35 < n.x - s * 0.5) return -1;
  }
  return undefined;
}

function findTies(b: Bin, notes: OmrNote[], s: number) {
  for (const n of notes) {
    const next = notes
      .filter((m) => m.staff === n.staff && m.step === n.step && m.x > n.x + s * 1.2 && m.x - n.x < s * 14)
      .sort((p, q) => p.x - q.x)[0];
    if (!next) continue;
    for (const side of [-1, 1]) {
      let hits = 0;
      let used = 0;
      let lastY: number | null = null;
      let smooth = true;
      for (let x = Math.round(n.x + s * 0.75); x <= next.x - s * 0.75; x++) {
        // the band just above or below the heads
        const ya = side < 0 ? n.y - s * 1.5 : n.y + s * 0.15;
        const yb = side < 0 ? n.y - s * 0.15 : n.y + s * 1.5;
        let tall = false;
        let found: number | null = null;
        let run = 0;
        for (let y = Math.round(ya); y <= yb; y++) {
          if (b.at(x, y)) {
            run++;
            if (run > s * 0.6) tall = true;
            if (found === null) found = y;
          } else run = 0;
        }
        if (tall) continue; // stem or barline crossing: ignore this column
        used++;
        if (found !== null) {
          hits++;
          if (lastY !== null && Math.abs(found - lastY) > Math.max(2, s * 0.3)) smooth = false;
          lastY = found;
        }
      }
      if (used >= 3 && hits >= used * 0.85 && smooth) {
        n.tie = true;
        break;
      }
    }
  }
}

/**
 * Paint dark borders (a screenshot of a page shown on a dark background, or the
 * table around a photographed sheet) white, so they don't skew the threshold
 * or look like ink.
 */
function whitenBorders(g: Gray): Gray {
  const { w, h } = g;
  const data = new Uint8Array(g.data);
  const dark = (i: number) => g.data[i] < 110;
  const colDark = (x: number) => {
    let n = 0;
    for (let y = 0; y < h; y++) if (dark(y * w + x)) n++;
    return n > h * 0.6;
  };
  const rowDark = (y: number) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (dark(y * w + x)) n++;
    return n > w * 0.6;
  };
  const paint = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = y0; y < y1; y++) data.fill(255, y * w + x0, y * w + x1);
  };
  for (let x = 0; x < w && colDark(x); x++) paint(x, x + 1, 0, h);
  for (let x = w - 1; x >= 0 && colDark(x); x--) paint(x, x + 1, 0, h);
  for (let y = 0; y < h && rowDark(y); y++) paint(0, w, y, y + 1);
  for (let y = h - 1; y >= 0 && rowDark(y); y--) paint(0, w, y, y + 1);
  return { w, h, data };
}

export function recognize(g0: Gray): OmrResult {
  const g = whitenBorders(g0);
  const thr = Math.min(200, otsu(g));
  const bin = new Uint8Array(g.w * g.h);
  for (let i = 0; i < bin.length; i++) bin[i] = g.data[i] <= thr ? 1 : 0;
  const b = new Bin(g.w, g.h, bin);
  const staves = findStaves(b);
  if (!staves.length) throw new Error("I couldn't find any music staves in that picture.");
  groupSystems(b, staves);
  b.integral();
  const ks = keySignature(b, staves);
  // the key signature ends at the same place in every staff of a system
  for (const sys of new Set(staves.map((t) => t.system))) {
    const idx = staves.map((t, i) => (t.system === sys ? i : -1)).filter((i) => i >= 0);
    const m = Math.max(...idx.map((i) => ks.start[i]));
    for (const i of idx) ks.start[i] = m;
  }
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
  const heads: { x: number; y: number; filled: boolean; grace?: boolean }[] = [];
  for (const c of cands) {
    if (heads.some((h) => Math.abs(h.x - c.x) < s * 0.9 && Math.abs(h.y - c.y) < s * 0.7)) continue;
    // reject long horizontal ink (beams, thick ledger clusters)
    if (b.hRun(c.x, c.y) > s * 2.6) continue;
    // a small head is a grace note, sorted out below
    if (b.frac(c.x, c.y, s * 1.2, s * 0.8) < 0.7) continue;
    heads.push({ x: c.x, y: c.y, filled: true });
  }
  // grace notes: small filled heads (about two thirds the size)
  const small: { x: number; y: number; f: number }[] = [];
  for (const st of staves) {
    const yA = Math.max(0, Math.round(st.lines[0] - s * 4));
    const yB = Math.min(g.h - 1, Math.round(st.lines[4] + s * 4));
    for (let y = yA; y <= yB; y++) {
      for (let x = Math.round(st.x0 + s * 1.5); x <= st.x1; x++) {
        if (!bin[y * g.w + x]) continue;
        const f = b.frac(x, y, s * 0.6, s * 0.4);
        if (f < 0.85) continue;
        small.push({ x, y, f });
      }
    }
  }
  small.sort((a, c) => c.f - a.f);
  const graces: { x: number; y: number }[] = [];
  for (const c of small) {
    if (heads.some((h) => Math.abs(h.x - c.x) < s * 1.2 && Math.abs(h.y - c.y) < s * 1.0)) continue;
    // where a barline crosses a staff line is not a head either
    // (or a lump on a stem): a long vertical line runs right through it
    let up = c.y;
    let dn = c.y;
    while (up > 0 && b.at(c.x, up - 1)) up--;
    while (dn < g.h - 1 && b.at(c.x, dn + 1)) dn++;
    if (dn - up > s * 2.2) continue;
    if (graces.some((h) => Math.abs(h.x - c.x) < s * 0.6 && Math.abs(h.y - c.y) < s * 0.5)) continue;
    if (b.hRun(c.x, c.y) > s * 1.6) continue;
    // small, not a full head: the ring around it is mostly paper
    if (b.frac(c.x, c.y, s * 1.2, s * 0.8) > 0.6) continue;
    graces.push({ x: c.x, y: c.y });
  }
  // a hollow head's thin rim can break up after thresholding and let its hole
  // leak out; look for holes with a slightly darker-leaning threshold
  const thrLoose = Math.min(235, thr + (255 - thr) * 0.2);
  const loose = new Uint8Array(g.w * g.h);
  for (let i = 0; i < loose.length; i++) loose[i] = g.data[i] <= thrLoose ? 1 : 0;
  const bl = new Bin(g.w, g.h, loose);
  bl.integral();
  for (const st of staves) {
    const yLo = st.lines[0] - s * 4;
    const yHi = st.lines[4] + s * 4;
    const strict = hollowHeads(b, s, yLo, yHi);
    // holes found only with the looser threshold must look like a whole note:
    // no stem and a wide, short outline
    const extra = hollowHeads(bl, s, yLo, yHi).filter((h) => {
      if (strict.some((o) => Math.abs(o.x - h.x) < s * 0.6 && Math.abs(o.y - h.y) < s * 0.6)) return false;
      if (findStem(b, h.x, h.y, s).len >= s * 1.5) return false;
      // a whole note's rim is thick at the sides and thin at top and bottom
      // (a gap between beams has thin stems at the sides and thick beams above and below)
      const rim = (dx: number, dy: number) => {
        let x = h.x;
        let y = h.y;
        let k = 0;
        while (k < s && !b.at(x, y)) (x += dx), (y += dy), k++;
        let t = 0;
        while (t < s && b.at(x, y)) (x += dx), (y += dy), t++;
        return { at: k, t };
      };
      const L = rim(-1, 0);
      const R = rim(1, 0);
      const U = rim(0, -1);
      const D = rim(0, 1);
      const side = Math.min(L.t, R.t);
      const width = L.at + L.t + R.at + R.t;
      return side >= s * 0.22 && side < s * 0.8 && Math.max(U.t, D.t) <= s * 0.3 && width >= s * 1.2 && width <= s * 2.4;
    });
    for (const h of [...strict, ...extra]) {
      if (h.x < st.x0 + s * 1.5 || h.x > st.x1) continue;
      if (heads.some((o) => Math.abs(o.x - h.x) < s * 0.9 && Math.abs(o.y - h.y) < s * 0.7)) continue;
      heads.push({ x: h.x, y: h.y, filled: false });
    }
  }
  // grace-note stems are thin and come out grey, so look for them more leniently
  const thrThin = Math.min(235, thr + (255 - thr) * 0.35);
  const thin = new Uint8Array(g.w * g.h);
  for (let i = 0; i < thin.length; i++) thin[i] = g.data[i] <= thrThin ? 1 : 0;
  const bt = new Bin(g.w, g.h, thin);
  bt.integral();
  // small blobs stacked in one column are digits or bits of a chord, not grace notes
  const lone = graces.filter((gh) => !graces.some((o) => o !== gh && Math.abs(o.x - gh.x) < s * 0.6 && Math.abs(o.y - gh.y) < s * 3));
  for (const gh of lone) heads.push({ x: gh.x, y: gh.y, filled: true, grace: true });

  // --- classify
  let notes: OmrNote[] = [];
  let id = 0;
  for (const h of heads) {
    const si = nearestStaff(staves, h.y, h.x);
    if (si < 0) continue;
    const st = staves[si];
    if (h.x <= ks.start[si]) continue;
    // the thick final barline looks like a stack of filled heads
    if (h.x > st.x1 - s * 1.2) continue;
    const stem = h.grace ? findStem(bt, h.x, h.y, s * 0.8, true) : findStem(b, h.x, h.y, s);
    const hasStem = stem.len >= s * (h.grace ? 1.2 : 2.3);
    // filled heads always have a stem; without one it's probably a clef/digit/text blob
    if (h.filled && !hasStem) continue;
    const step = Math.round((st.lines[4] - h.y) / (st.space / 2));
    if (Math.abs(step - 4) > 14) continue;
    // far above or below the staff a real note sits on ledger lines (text and tempo marks don't)
    if (!hasLedgers(b, st, h.x, step, s)) continue;
    const beams = h.filled && hasStem ? countBeams(b, stem, s) : 0;
    const n: OmrNote = {
      id: id++,
      x: h.x,
      y: h.y,
      staff: si,
      step,
      filled: h.filled,
      stem: hasStem,
      beams,
      dotted: !h.grace && hasDot(b, h.x, h.y, s),
      beats: 0,
    };
    n.beats = noteBeats(n);
    if (h.grace) {
      n.grace = true;
      n.beats = 0.125;
    }
    notes.push(n);
  }

  // a blob whose "stem" runs straight into another note's head is a bit of a
  // beam or flag at the far end of that note's stem, not a note
  {
    const ends = new Map<OmrNote, { col: number; end: number }>();
    for (const n of notes) if (n.stem && !n.grace) ends.set(n, findStem(b, n.x, n.y, s));
    const hits = (n: OmrNote, o: OmrNote) => {
      const e = ends.get(n);
      return !!e && o !== n && !o.grace && o.staff === n.staff && Math.abs(o.x - e.col) < s * 1.0 && Math.abs(o.y - e.end) < s * 0.8 && Math.abs(o.y - n.y) > s * 2;
    };
    // when two point at each other (the beam stub sits at the real note's
    // stem end too), the one further out from the staff is the stub
    const out = (n: OmrNote) => Math.abs(n.step - 4);
    notes = notes.filter((n) => !notes.some((o) => hits(n, o) && !(hits(o, n) && out(o) > out(n))));
  }

  // a "grace note" lying along a real note's stem or flag is part of that note
  {
    const spans = notes
      .filter((n) => !n.grace && n.stem)
      .map((n) => {
        const st = findStem(b, n.x, n.y, s);
        // (a hand-drawn stem leans, so take its column at the height asked about)
        const at = (y: number) => st.col0 + ((st.col - st.col0) * (y - n.y)) / (st.end - n.y || 1);
        return { at, y0: Math.min(n.y, st.end), y1: Math.max(n.y, st.end) };
      });
    notes = notes.filter(
      (n) =>
        !n.grace ||
        (!spans.some((p) => {
          if (n.y <= p.y0 - s * 0.5 || n.y >= p.y1 + s * 0.5) return false;
          if (Math.abs(p.at(n.y) - n.x) < s * 0.7) return true;
          // a short beam stub drawn out from the stem looks like a small head too
          let a = Math.round(n.x);
          let z = a;
          while (b.at(a - 1, n.y) && n.x - a < s * 2) a--;
          while (b.at(z + 1, n.y) && z - n.x < s * 2) z++;
          return Math.abs(p.at(n.y) - a) < s * 0.3 || Math.abs(p.at(n.y) - z) < s * 0.3;
        }) &&
          findStem(bt, n.x, n.y, s * 0.8, true).len <= s * 3.2),
    );
  }

  // --- barlines and time signatures (digits look like note heads)
  const bars: Record<number, number[]> = {};
  const tsSpans: [number, number, number][] = [];
  const systems = [...new Set(staves.map((t) => t.system))];
  for (const sys of systems) {
    const sts = staves.filter((t) => t.system === sys);
    const idx = staves.map((t, i) => (t.system === sys ? i : -1)).filter((i) => i >= 0);
    const bl = findBars(b, staves, sys, s).filter((x) => x > Math.max(...idx.map((i) => ks.start[i])) + s);
    bars[sys] = bl;
    for (const x of [Math.max(...idx.map((i) => ks.start[i])) - s * 0.3, ...bl.map((x) => x + s * 0.3)]) {
      const ts = timeSigAt(b, sts, x, s);
      if (ts) {
        notes = notes.filter((n) => !(idx.includes(n.staff) && n.x >= ts[0] - s * 0.5 && n.x <= ts[1] + s * 0.5));
        for (const i of idx) tsSpans.push([i, ts[0] - s * 0.5, ts[1] + s * 0.5]);
      }
    }
    // a "hollow head" hugging a barline is a gap between the bar and a stem
    notes = notes.filter((n) => n.filled || !idx.includes(n.staff) || !bl.some((x) => Math.abs(x - n.x) < s * 0.9));
  }

  // --- rests
  const rests: OmrRest[] = [];
  staves.forEach((st, si) => {
    const hs = notes.filter((n) => Math.abs(n.y - (st.lines[0] + st.lines[4]) / 2) < s * 9);
    for (const r of findRests(b, st, si, ks.start[si], hs, s)) {
      // the time signature's digits are not rests
      if (tsSpans.some(([i, a, z]) => i === si && r.x >= a && r.x <= z)) continue;
      const sysBars = bars[st.system] ?? [];
      if (sysBars.some((x) => Math.abs(x - r.x) < s * 0.6)) continue;
      r.id = id++;
      rests.push(r);
    }
  });

  // --- accidentals inside the bar (they last until the barline)
  const heads2 = notes.map((n) => ({ x: n.x, y: n.y }));
  notes.forEach((n, i) => {
    const a = accidentalFor(b, heads2[i], heads2, s);
    if (a !== undefined) n.acc = a;
  });
  // a flag or the end of a stem right by a note is not a rest
  for (let i = rests.length - 1; i >= 0; i--) {
    const r = rests[i];
    if (r.beats >= 1 || r.beats === 0) continue;
    if (notes.some((n) => n.staff === r.staff && n.stem && Math.abs(n.x - r.x) < s * 1.2 && Math.abs(n.y - r.y) < s * 4.5)) rests.splice(i, 1);
  }
  // a sharp, flat or natural just before a note is not a rest
  const withAcc = notes.filter((n) => n.acc !== undefined);
  for (let i = rests.length - 1; i >= 0; i--) {
    const r = rests[i];
    if (withAcc.some((n) => n.staff === r.staff && r.x < n.x - s * 0.4 && r.x > n.x - s * 2.8 && Math.abs(r.y - n.y) < s * 1.6))
      rests.splice(i, 1);
  }
  notes.sort((a, c) => a.staff - c.staff || a.x - c.x || c.step - a.step);
  const carried = new Map<string, number>();
  for (const n of notes) {
    const bl = bars[staves[n.staff].system] ?? [];
    const bar = bl.filter((x) => x < n.x).length;
    const key = `${n.staff}/${bar}/${n.step}`;
    if (n.acc !== undefined) carried.set(key, n.acc);
    else if (carried.has(key)) n.acc = carried.get(key);
  }

  findTies(b, notes, s);
  return { w: g.w, h: g.h, space: s, staves, notes, rests, bars, keySig: ks.key };
}

// ------------------------------------------------------------------ timing

export interface TimedNote {
  midi: number;
  beat: number;
  beats: number;
  left: boolean;
  id: number;
  tieOpen?: number;
}

/**
 * Line the notes up in time, bar by bar so one mistake can't push everything
 * after it out of step. In each staff, things at the same x start together and
 * the next thing starts when the shortest of them ends (rests count too).
 * A bar lasts as long as its longest staff.
 */
export function toTimeline(r: OmrResult): TimedNote[] {
  const out: TimedNote[] = [];
  const rests = r.rests ?? [];
  const systems = [...new Set(r.staves.map((s) => s.system))].sort((a, b) => a - b);
  let t = 0;
  let lastLen = 4;
  for (const sys of systems) {
    const idx = r.staves.map((s, i) => (s.system === sys ? i : -1)).filter((i) => i >= 0);
    const grand = idx.length > 1;
    const bars = [...(r.bars?.[sys] ?? [])].sort((a, b) => a - b);
    const edges = [-Infinity, ...bars, Infinity];
    for (let m = 0; m + 1 < edges.length; m++) {
      const inBar = (x: number) => x > edges[m] && x <= edges[m + 1];
      let len = 0;
      let fullRest = false;
      let any = false;
      const placed: { n: OmrNote; at: number }[] = [];
      for (const si of idx) {
        type Ev = { x: number; beats: number; note?: OmrNote };
        const evs: Ev[] = [
          ...r.notes.filter((n) => n.staff === si && inBar(n.x) && !n.grace).map((n) => ({ x: n.x, beats: n.beats, note: n })),
          ...rests.filter((q) => q.staff === si && inBar(q.x)).map((q) => ({ x: q.x, beats: q.beats })),
        ].sort((a, b) => a.x - b.x);
        if (!evs.length) continue;
        any = true;
        const cols: Ev[][] = [];
        for (const e of evs) {
          const c = cols[cols.length - 1];
          if (c && e.x - c[0].x < r.space * 0.6) c.push(e);
          else cols.push([e]);
        }
        let at = 0;
        for (const c of cols) {
          if (c.some((e) => !e.note && e.beats === 0)) fullRest = true;
          for (const e of c) if (e.note) placed.push({ n: e.note, at });
          const adv = c.filter((e) => e.beats > 0).map((e) => e.beats);
          at += adv.length ? Math.min(...adv) : 0;
        }
        len = Math.max(len, at);
        // grace notes squeeze in just before the next real note
        const main = placed.filter((p) => p.n.staff === si);
        const gs = r.notes.filter((n) => n.staff === si && inBar(n.x) && n.grace).sort((a, b) => b.x - a.x);
        for (const gn of gs) {
          const next = main.filter((p) => p.n.x > gn.x).sort((a, b) => a.n.x - b.n.x)[0];
          if (!next) continue;
          const before = placed.filter((p) => p.n.grace && p.n.staff === si && p.n.x > gn.x && p.n.x < next.n.x).length;
          placed.push({ n: gn, at: Math.max(0, next.at - 0.125 * (before + 1)) });
        }
      }
      if (!any) continue;
      if (len === 0 && fullRest) len = lastLen;
      if (len > 0) lastLen = len;
      // tied notes: the later piece only extends the earlier one
      const byStaff = new Map<OmrNote, TimedNote>();
      for (const p of placed.sort((a, b) => a.at - b.at || a.n.x - b.n.x)) {
        const st = r.staves[p.n.staff];
        const tn: TimedNote = { midi: noteMidi(p.n, st, r.keySig), beat: t + p.at, beats: p.n.beats, left: grand && p.n.staff === idx[idx.length - 1], id: p.n.id };
        byStaff.set(p.n, tn);
      }
      for (const p of placed) {
        const tn = byStaff.get(p.n)!;
        const prevTied = out.find((o) => o.tieOpen === p.n.staff * 1000 + p.n.step && Math.abs(o.beat + o.beats - tn.beat) < 0.05);
        if (prevTied) {
          prevTied.beats += tn.beats;
          if (!p.n.tie) delete prevTied.tieOpen;
          continue;
        }
        if (p.n.tie) tn.tieOpen = p.n.staff * 1000 + p.n.step;
        out.push(tn);
      }
      t += len;
    }
  }
  for (const o of out) delete o.tieOpen;
  return out.sort((a, b) => a.beat - b.beat || b.midi - a.midi);
}

// ------------------------------------------------------------------ straightening

/**
 * How far each part of the picture has to move up or down to make the staff
 * lines level. A phone photo of a book is rarely square on: the page is
 * tilted and bows towards the spine, often one way at the top and the other
 * way at the bottom, so a staff line can drift by half a staff space from one
 * end to the other. The staff finder can't follow that, and the pitch read
 * from a head's height would be off.
 *
 * The page is cut into bands of rows (each about one staff tall) and narrow
 * strips of columns; in each band, every strip's row-ink profile is matched
 * against the middle strip's. A straight scan gives 0 everywhere.
 */
export interface Warp {
  /** y of each band's centre */
  cy: number[];
  /** per band, the shift of every column */
  rows: Float32Array[];
  /** largest shift anywhere, in pixels */
  max: number;
}

/** A rough staff space: the commonest white gap between two dark pixels down a column, plus a line. */
function roughSpace(g: Gray, thr: number): number {
  const { w, h, data } = g;
  const gaps = new Array(Math.ceil(h / 8) + 1).fill(0);
  const runs = new Array(64).fill(0);
  for (let x = Math.round(w * 0.1); x < w * 0.9; x += 7) {
    let y = 0;
    let lastDark = -1;
    while (y < h) {
      if (data[y * w + x] <= thr) {
        const y0 = y;
        while (y < h && data[y * w + x] <= thr) y++;
        if (lastDark >= 0 && y0 - lastDark < gaps.length) gaps[y0 - lastDark]++;
        if (y - y0 < 64) runs[y - y0]++;
        lastDark = y;
      } else y++;
    }
  }
  const mode = (a: number[], from: number) => a.reduce((bi, v, i) => (i >= from && v > a[bi] ? i : bi), from);
  return mode(gaps, 3) + mode(runs, 1);
}

export function findWarp(g: Gray): Warp {
  const { w, h, data } = g;
  const thr = Math.min(200, otsu(g));
  const flat: Warp = { cy: [h / 2], rows: [new Float32Array(w)], max: 0 };
  const strip = Math.max(24, Math.round(w / 40));
  const n = Math.floor(w / strip);
  if (n < 5) return flat;
  const sp = Math.max(4, roughSpace(g, thr));
  // dark rows across each strip: long horizontal ink (staff lines) only, so
  // notes and words barely move it
  const prof: Float64Array[] = [];
  for (let k = 0; k < n; k++) {
    const p = new Float64Array(h);
    for (let y = 0; y < h; y++) {
      let c = 0;
      const row = y * w + k * strip;
      for (let x = 0; x < strip; x++) if (data[row + x] <= thr) c++;
      p[y] = c > strip * 0.6 ? c : 0;
    }
    prof.push(p);
  }
  const mid = n >> 1;
  const maxD = Math.max(3, Math.round(strip * 0.15)); // ~8 degrees per strip
  const bandH = Math.round(sp * 6);
  const cy: number[] = [];
  const rows: Float32Array[] = [];
  let max = 0;
  for (let c = bandH / 2; c < h + bandH / 2; c += bandH / 2) {
    const y0 = Math.max(0, Math.round(c - bandH / 2));
    const y1 = Math.min(h, Math.round(c + bandH / 2));
    const ink = (k: number) => {
      let s = 0;
      for (let y = y0; y < y1; y++) s += prof[k][y];
      return s;
    };
    // the band needs a few lines' worth of ink in the middle strip
    if (ink(mid) < strip * 0.6 * 3) continue;
    const ref = prof[mid];
    const match = (k: number, guess: number): number | null => {
      if (ink(k) < strip * 0.6 * 2) return null;
      const b = prof[k];
      const g0 = Math.round(guess);
      const sc: number[] = [];
      let best = 0;
      let bs = -1;
      for (let d = g0 - maxD; d <= g0 + maxD; d++) {
        let s = 0;
        for (let y = Math.max(y0, -d); y < y1 && y + d < h; y++) s += ref[y] * b[y + d];
        sc.push(s);
        if (s > bs) {
          bs = s;
          best = d;
        }
      }
      if (bs <= 0) return null;
      const i = best - (g0 - maxD);
      const l = sc[i - 1] ?? bs;
      const r = sc[i + 1] ?? bs;
      const den = l - 2 * bs + r;
      return best + (den < 0 ? (0.5 * (l - r)) / den : 0);
    };
    // walk out from the middle, searching near where the last strip landed,
    // so the lines are followed across the page even as they bow
    const off = new Float64Array(n);
    for (const dir of [1, -1]) {
      let prev = 0;
      let slope = 0;
      for (let k = mid + dir; k >= 0 && k < n; k += dir) {
        const m = match(k, prev + slope);
        // strips with too little staff (margins) carry on the slope around them
        const v = m ?? prev + slope;
        if (m !== null) slope = slope * 0.5 + (v - prev) * 0.5;
        off[k] = v;
        prev = v;
      }
    }
    const sm = off.map((_, k) => {
      let s = 0;
      let cnt = 0;
      for (let j = Math.max(0, k - 1); j <= Math.min(n - 1, k + 1); j++) {
        s += off[j];
        cnt++;
      }
      return s / cnt;
    });
    const row = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const f = (x - strip / 2) / strip;
      const k = Math.max(0, Math.min(n - 2, Math.floor(f)));
      const t = Math.max(-1, Math.min(2, f - k));
      row[x] = sm[k] + (sm[k + 1] - sm[k]) * t;
      max = Math.max(max, Math.abs(row[x]));
    }
    cy.push((y0 + y1) / 2);
    rows.push(row);
  }
  if (!rows.length) return flat;
  return { cy, rows, max };
}

/** Move each pixel up or down by the warp (1 or 4 bytes per pixel), white where nothing comes in. */
export function applyWarp(src: Uint8Array | Uint8ClampedArray, w: number, h: number, warp: Warp, ch = 1): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(src.length).fill(255);
  const { cy, rows } = warp;
  let bi = 0;
  for (let y = 0; y < h; y++) {
    while (bi + 1 < cy.length && cy[bi + 1] <= y) bi++;
    const a = rows[bi];
    const b = rows[Math.min(bi + 1, rows.length - 1)];
    const span = bi + 1 < cy.length ? cy[bi + 1] - cy[bi] : 1;
    const t = Math.max(0, Math.min(1, (y - cy[bi]) / span));
    for (let x = 0; x < w; x++) {
      const sy = y + a[x] + (b[x] - a[x]) * t;
      const y0 = Math.floor(sy);
      const f = sy - y0;
      if (y0 < 0 || y0 + 1 >= h) continue;
      const p = (y0 * w + x) * ch;
      const q = p + w * ch;
      const o = (y * w + x) * ch;
      for (let c = 0; c < ch; c++) out[o + c] = src[p + c] * (1 - f) + src[q + c] * f;
    }
  }
  return out;
}
