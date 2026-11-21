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
    let pos: number | null = null;
    groups.forEach((g, gi) => {
      const ws = g.map((n) => whiteIndex(n.midi));
      const lo = Math.min(...ws);
      const hi = Math.max(...ws);
      const fits = (p: number) => lo >= p && hi <= p + 4;
      if (pos === null || !fits(pos)) {
        const ahead = groups.slice(gi + 1, gi + 1 + LOOKAHEAD).flat().map((n) => whiteIndex(n.midi));
        let best = Math.floor(lo);
        let bestScore = -Infinity;
        for (let p = Math.ceil(hi - 4); p <= Math.floor(lo); p++) {
          let score = 0;
          for (let i = 0; i < ahead.length; i++) {
            if (ahead[i] >= p && ahead[i] <= p + 4) score += 10 - i * 0.5;
            else break; // only count the run of notes the hand can reach without moving
          }
          if (pos !== null) score -= Math.abs(p - pos) * 0.3;
          // a thumb on a black key is awkward
          const thumb = left ? p + 4 : p;
          if (ws.some((w) => w === thumb && w % 1)) score -= 3;
          if (score > bestScore) {
            bestScore = score;
            best = p;
          }
        }
        pos = best;
      }
      for (const n of g) {
        // a black key sits between two white keys: use the finger on its thumb side
        const raw = whiteIndex(n.midi) - pos;
        const off = left ? Math.ceil(raw) : Math.floor(raw);
        n.finger = Math.min(5, Math.max(1, left ? 5 - off : off + 1));
        n.handPos = pos;
      }
    });
  }
}

/** Five fingertip keys for a hand position, index 0 = finger 1. */
export function handKeys(pos: number, left: boolean): number[] {
  const out: number[] = [];
  for (let f = 1; f <= 5; f++) out.push(whiteMidi(left ? pos + 5 - f : pos + f - 1));
  return out;
}
