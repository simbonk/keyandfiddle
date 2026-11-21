import { CANON_VARS, GS_A, GS_B, MINUET_A, MINUET_B, ODE } from '../piano/songs';
// Violin facts: strings, first-position fingering, bowing plan.
import { parseSong, type Song, type SongNote } from '../audio/notes';

export interface ViolinString {
  name: 'G' | 'D' | 'A' | 'E';
  midi: number;
  color: string;
  nickname: string;
}

export const STRINGS: ViolinString[] = [
  { name: 'G', midi: 55, color: '#52d273', nickname: 'the thickest, lowest string' },
  { name: 'D', midi: 62, color: '#2ec4f1', nickname: 'the second string' },
  { name: 'A', midi: 69, color: '#ffd60a', nickname: 'the third string' },
  { name: 'E', midi: 76, color: '#ff4d6d', nickname: 'the thinnest, highest string' },
];

export const FINGER_COLORS = ['#ffffff', '#ff9f1c', '#52d273', '#2ec4f1', '#e056fd'];

export interface Fingering {
  string: number; // index into STRINGS
  finger: 0 | 1 | 2 | 3 | 4; // 0 = open string
  semis: number; // semitones above the open string
  label: string; // e.g. "open A", "2 (high)"
}

/** First-position fingering. Prefers open strings and avoids the 4th finger. */
export function fingeringFor(midi: number): Fingering | null {
  for (let s = STRINGS.length - 1; s >= 0; s--) {
    const semis = midi - STRINGS[s].midi;
    if (semis >= 0 && semis <= 7) {
      // Prefer the next string up's open note over a 4th finger.
      if (semis === 7 && s < STRINGS.length - 1) continue;
      const map: Record<number, [0 | 1 | 2 | 3 | 4, string]> = {
        0: [0, 'open'],
        1: [1, 'low 1'],
        2: [1, '1'],
        3: [2, 'low 2'],
        4: [2, 'high 2'],
        5: [3, '3'],
        6: [3, 'high 3'],
        7: [4, '4'],
      };
      const [finger, name] = map[semis];
      return {
        string: s,
        finger,
        semis,
        label: finger === 0 ? `open ${STRINGS[s].name}` : `finger ${name} on ${STRINGS[s].name}`,
      };
    }
  }
  return null;
}

/** Where along the vibrating string (0 = nut, 1 = bridge) a semitone lands. */
export function stopFraction(semis: number): number {
  return 1 - Math.pow(2, -semis / 12);
}

export type BowDir = 'down' | 'up';

export interface BowStroke {
  dir: BowDir;
  from: number; // 0 = frog, 1 = tip
  to: number;
}

export interface ViolinNote extends SongNote {
  midi: number;
  fing: Fingering;
  bow: BowStroke;
}

/**
 * Plan bowing for a melody: alternate down/up (tags "n" = force down,
 * "v" = force up), and use more bow for longer notes, keeping the bow
 * position continuous between strokes.
 */
export function planBowing(notes: SongNote[]): ViolinNote[] {
  const out: ViolinNote[] = [];
  let pos = 0.15; // start near the frog
  let dir: BowDir = 'down';
  let prevEnd = -1;
  for (const n of notes) {
    if (n.midi === null) continue;
    const f = fingeringFor(n.midi);
    if (!f) continue;
    // after a rest, start a fresh down bow
    if (prevEnd >= 0 && n.beat - prevEnd > 0.6) {
      dir = 'down';
      pos = 0.15;
    }
    if (n.tag?.includes('n')) dir = 'down';
    if (n.tag?.includes('v')) dir = 'up';
    const amount = Math.max(0.18, Math.min(0.85, n.beats * 0.32));
    let from = pos;
    let to = dir === 'down' ? pos + amount : pos - amount;
    if (to > 0.97) {
      to = 0.97;
      from = to - amount;
    }
    if (to < 0.03) {
      to = 0.03;
      from = to + amount;
    }
    out.push({ ...n, midi: n.midi, fing: f, bow: { dir, from, to } });
    pos = to;
    dir = dir === 'down' ? 'up' : 'down';
    prevEnd = n.beat + n.beats;
  }
  return out;
}

/** Right-hand melody of a piano arrangement (left hand removed), optionally transposed. */
function melodyOf(src: string, shift = 0): SongNote[] {
  return parseSong(src)
    .filter((n) => !n.tag?.includes('L'))
    .map((n) => ({ midi: n.midi! + shift, beat: n.beat, beats: n.beats }));
}

// All melodies traditional / public domain, arranged for first position.
export const VIOLIN_SONGS: Song[] = [
  {
    id: 'open-strings',
    title: 'Open String Train',
    emoji: '🚂',
    bpm: 72,
    level: 1,
    blurb: 'No fingers yet! Just bow the A and E strings.',
    notes: parseSong(`A4:2 A4:2 | E5:2 E5:2 | A4:1 A4:1 E5:1 E5:1 | A4:4`),
  },
  {
    id: 'pizza',
    title: 'Pepperoni Pizza',
    emoji: '🍕',
    bpm: 80,
    level: 1,
    blurb: 'Short quick bows: pep-per-o-ni piz-za!',
    notes: parseSong(`A4:0.5 A4:0.5 A4:0.5 A4:0.5 A4:1 A4:1 | E5:0.5 E5:0.5 E5:0.5 E5:0.5 E5:1 E5:1 | D4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:1 D4:1 | A4:2`),
  },
  {
    id: 'four-strings',
    title: 'Hello, Four Strings',
    emoji: '👋',
    bpm: 66,
    level: 1,
    blurb: 'Visit every string: G, D, A, E.',
    notes: parseSong(`G3:2 D4:2 | A4:2 E5:2 | E5:2 A4:2 | D4:2 G3:2`),
  },
  {
    id: 'hot-cross-buns-v',
    title: 'Hot Cross Buns',
    emoji: '🥯',
    bpm: 80,
    level: 1,
    blurb: 'Fingers 2, 1 and open on the A string.',
    notes: parseSong(`C#5:1 B4:1 A4:2 | C#5:1 B4:1 A4:2 | A4:0.5 A4:0.5 A4:0.5 A4:0.5 B4:0.5 B4:0.5 B4:0.5 B4:0.5 | C#5:1 B4:1 A4:2`),
  },
  {
    id: 'mary-v',
    title: 'Mary Had a Little Lamb',
    emoji: '🐑',
    bpm: 84,
    level: 2,
    notes: parseSong(`C#5:1 B4:1 A4:1 B4:1 | C#5:1 C#5:1 C#5:2 | B4:1 B4:1 B4:2 | C#5:1 E5:1 E5:2 |
      C#5:1 B4:1 A4:1 B4:1 | C#5:1 C#5:1 C#5:1 C#5:1 | B4:1 B4:1 C#5:1 B4:1 | A4:4`),
  },
  {
    id: 'twinkle-v',
    title: 'Twinkle Twinkle Little Star',
    emoji: '⭐',
    bpm: 80,
    level: 2,
    blurb: 'The classic first violin song, in A major.',
    notes: parseSong(`A4:1 A4:1 E5:1 E5:1 | F#5:1 F#5:1 E5:2 | D5:1 D5:1 C#5:1 C#5:1 | B4:1 B4:1 A4:2 |
      E5:1 E5:1 D5:1 D5:1 | C#5:1 C#5:1 B4:2 | E5:1 E5:1 D5:1 D5:1 | C#5:1 C#5:1 B4:2 |
      A4:1 A4:1 E5:1 E5:1 | F#5:1 F#5:1 E5:2 | D5:1 D5:1 C#5:1 C#5:1 | B4:1 B4:1 A4:2`),
  },
  {
    id: 'lightly-row',
    title: 'Lightly Row',
    emoji: '🚣',
    bpm: 88,
    level: 2,
    notes: parseSong(`E5:1 C#5:1 C#5:2 | D5:1 B4:1 B4:2 | A4:1 B4:1 C#5:1 D5:1 | E5:1 E5:1 E5:2 |
      E5:1 C#5:1 C#5:2 | D5:1 B4:1 B4:2 | A4:1 C#5:1 E5:1 E5:1 | C#5:4 |
      B4:1 B4:1 B4:1 B4:1 | B4:1 C#5:1 D5:2 | C#5:1 C#5:1 C#5:1 C#5:1 | C#5:1 D5:1 E5:2 |
      E5:1 C#5:1 C#5:2 | D5:1 B4:1 B4:2 | A4:1 C#5:1 E5:1 E5:1 | A4:4`),
  },
  {
    id: 'ode-v',
    title: 'Ode to Joy',
    emoji: '🎉',
    bpm: 84,
    level: 3,
    blurb: 'The whole tune, on the D and A strings.',
    notes: melodyOf(ODE, 2),
  },
  {
    id: 'canon-v',
    title: 'Canon in D',
    emoji: '💒',
    bpm: 66,
    level: 3,
    blurb: 'Pachelbel, all the variations. Starts with slow whole bows, then gets busy.',
    notes: melodyOf(CANON_VARS.join(' ')),
  },
  {
    id: 'minuet-v',
    title: 'Minuet in G',
    emoji: '👑',
    bpm: 92,
    level: 3,
    blurb: 'Bach, both parts. Quick string crossings and a low 2 for C.',
    notes: [...melodyOf(MINUET_A), ...melodyOf(MINUET_B).map((n) => ({ ...n, beat: n.beat + 48 }))],
  },
  {
    id: 'greensleeves-v',
    title: 'Greensleeves',
    emoji: '🍃',
    bpm: 88,
    level: 3,
    blurb: 'Both parts. Minor key: low 1 for F on the E string, high 3 for G#.',
    notes: melodyOf(GS_A + ' ' + GS_B),
  },
];

export function violinNotes(song: Song): ViolinNote[] {
  return planBowing(song.notes);
}
