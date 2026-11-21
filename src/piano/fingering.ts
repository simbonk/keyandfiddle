// Simple piano fingering: keep each hand in a five-finger position and move it
// only when a note falls outside, choosing the new spot that fits the most of
// the notes coming next. Fingers are numbered the piano way: 1 = thumb, 5 = pinky.

const WHITE_IDX = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6];
const WHITE_PC = [0, 2, 4, 5, 7, 9, 11];

/** Position along the white keys (black keys sit halfway between). */
export function whiteIndex(midi: number): number {
  return Math.floor(midi / 12) * 7 + WHITE_IDX[midi % 12];
}
export function whiteMidi(w: number): number {
  return Math.floor(w / 7) * 12 + WHITE_PC[((w % 7) + 7) % 7];
}

export interface FingerNote {
  midi: number;
  beat: number;
  left: boolean;
  /** 1..5 */
  finger?: number;
  /** white index under the hand's lowest finger (thumb for right hand, pinky for left) */
  handPos?: number;
}

const LOOKAHEAD = 10;
/** A stretched hand (reaching a sixth) costs about one extra group of notes. */
const STRETCH_COST = 12;

// Finger for each key distance from the thumb (in white keys).
const NORMAL = [1, 2, 3, 4, 5];
// A stretched hand covers six white keys: one key in the middle is skipped.
const STRETCHES = [
  [1, 0, 2, 3, 4, 5], // wide between thumb and 2
  [1, 2, 3, 4, 0, 5], // wide between 4 and 5
  [1, 2, 3, 0, 4, 5],
  [1, 2, 0, 3, 4, 5],
];

export function assignFingers(notes: FingerNote[]) {
  for (const left of [false, true]) {
    const hand = notes.filter((n) => n.left === left).sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    // group chords
    const groups: FingerNote[][] = [];
    for (const n of hand) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(g[0].beat - n.beat) < 0.01) g.push(n);
      else groups.push([n]);
    }
    const W = groups.map((g) => g.map((n) => whiteIndex(n.midi)));
    // distance from the thumb, in white keys
    const dist = (w: number, p: number, width: number) => (left ? p + width - w : w - p);
    const inside = (gi: number, p: number, width: number) => W[gi].every((w) => w >= p && w <= p + width);
    // how many of the coming groups (this one first) a hand reaches without moving
    const run = (p: number, width: number, gi: number) => {
      let i = gi;
      while (i < Math.min(groups.length, gi + 1 + LOOKAHEAD) && inside(i, p, width)) i++;
      return i;
    };
    const reach = (p: number, width: number, gi: number) => {
      let score = 0;
      for (let i = gi; i < run(p, width, gi); i++) score += 10 - (i - gi) * 0.5;
      return score;
    };
    /** finger map for a stretched hand: skip a key nobody in the run plays */
    const stretchMap = (p: number, gi: number) => {
      const used = new Set<number>();
      for (let i = gi; i < run(p, 5, gi); i++)
        for (const w of W[i]) {
          const d = dist(w, p, 5);
          used.add(Math.floor(d));
          if (d % 1) used.add(Math.ceil(d));
        }
      return STRETCHES.find((m) => m.every((f, d) => f || !used.has(d))) ?? null;
    };
    type Pos = { p: number; width: number; map: number[] };
    const choose = (gi: number, from: Pos | null, lo: number, hi: number): Pos => {
      let best: Pos = { p: Math.floor(lo), width: 4, map: NORMAL };
      let bestScore = -Infinity;
      // Stretch only for jumpy figures (broken chords) where a normal hand
      // can't even get through the next three notes without moving.
      let run4 = 0;
      for (let p = Math.ceil(hi - 4); p <= Math.floor(lo); p++) run4 = Math.max(run4, run(p, 4, gi) - gi);
      for (const width of run4 >= 3 ? [4] : [4, 5]) {
        for (let p = Math.ceil(hi - width); p <= Math.floor(lo); p++) {
          const map = width === 4 ? NORMAL : stretchMap(p, gi);
          if (!map) continue;
          let score = reach(p, width, gi) - (width === 5 ? STRETCH_COST : 0);
          if (from) score -= Math.abs(p - from.p) * 0.3;
          // a thumb on a black key is awkward
          const thumb = left ? p + width : p;
          if (W[gi].some((w) => w === thumb && w % 1)) score -= 3;
          if (score > bestScore) {
            bestScore = score;
            best = { p, width, map };
          }
        }
      }
      return best;
    };

    // fits: inside the hand, and no note lands on the key a stretch skips
    const fits = (gi: number, P: Pos) =>
      inside(gi, P.p, P.width) &&
      W[gi].every((w) => {
        const d = dist(w, P.p, P.width);
        return P.map[Math.floor(d)] || P.map[Math.ceil(d)];
      });
    // a black key sits between two white keys: use the finger on its thumb side
    const fingerAt = (midi: number, P: Pos) => {
      const d = dist(whiteIndex(midi), P.p, P.width);
      const f = P.map[Math.max(0, Math.min(P.width, Math.floor(d)))] || P.map[Math.min(P.width, Math.ceil(d))];
      return Math.min(5, Math.max(1, f || 1));
    };
    let pos: Pos | null = null;
    groups.forEach((g, gi) => {
      const lo = Math.min(...W[gi]);
      const hi = Math.max(...W[gi]);
      if (pos === null || !fits(gi, pos)) pos = choose(gi, pos, lo, hi);
      // Get ready early: if the very next notes won't fit where the hand is,
      // but a spot fits these notes and the next ones, move there now (left
      // hand G-D then C-G: play C with 5, so G is the thumb, not a jump).
      else if (gi + 1 < groups.length && !fits(gi + 1, pos)) {
        const nlo = Math.min(lo, ...W[gi + 1]);
        const nhi = Math.max(hi, ...W[gi + 1]);
        const c = choose(gi, pos, nlo, nhi);
        // never the same finger as the note just before on a different key
        const prev = gi > 0 && groups[gi - 1].length === 1 && g.length === 1 ? groups[gi - 1][0] : null;
        const clash = prev && prev.midi !== g[0].midi && prev.finger === fingerAt(g[0].midi, c);
        if (c.width === 4 && fits(gi, c) && fits(gi + 1, c) && !clash) pos = c;
      }
      const P: Pos = pos;
      for (const n of g) {
        n.finger = fingerAt(n.midi, P);
        n.handPos = P.p;
      }
    });
    // A black key between two fingers: if the note next to it already uses that
    // finger for a different key, use the other neighbour (F# then G: 3 then 2).
    const seq = groups.filter((g) => g.length === 1).map((g) => g[0]);
    seq.forEach((n, k) => {
      if (whiteIndex(n.midi) % 1 === 0) return;
      const near = [seq[k - 1], seq[k + 1]].filter((m) => m && m.midi !== n.midi && m.handPos === n.handPos);
      if (!near.some((m) => m.finger === n.finger)) return;
      const alt = n.finger! + 1;
      if (alt <= 5 && !near.some((m) => m.finger === alt)) n.finger = alt;
    });
  }
}

/** Five fingertip keys for a hand position, index 0 = finger 1. */
export function handKeys(pos: number, left: boolean): number[] {
  const out: number[] = [];
  for (let f = 1; f <= 5; f++) out.push(whiteMidi(left ? pos + 5 - f : pos + f - 1));
  return out;
}
