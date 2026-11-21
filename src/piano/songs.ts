import { parseSong, type Song, type SongNote } from '../audio/notes';

// Tags: L = left hand, p = play softly, f = play loudly.
// All tunes are traditional / public domain.

// level: 1 = beginner, 2 = intermediate, 3 = advanced
export const PIANO_SONGS: Song[] = [
  // full-length arrangements are defined below and added at the end

  {
    id: 'hot-cross-buns',
    title: 'Hot Cross Buns',
    emoji: '🥯',
    bpm: 90,
    level: 1,
    blurb: 'Just three notes: E, D, C.',
    notes: parseSong(`
      E4:1 D4:1 C4:2 | E4:1 D4:1 C4:2 |
      C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 |
      E4:1 D4:1 C4:2`),
  },
  {
    id: 'mary',
    title: 'Mary Had a Little Lamb',
    emoji: '🐑',
    bpm: 100,
    level: 1,
    blurb: 'Right hand, thumb on middle C.',
    notes: parseSong(`
      E4:1 D4:1 C4:1 D4:1 | E4:1 E4:1 E4:2 | D4:1 D4:1 D4:2 | E4:1 G4:1 G4:2 |
      E4:1 D4:1 C4:1 D4:1 | E4:1 E4:1 E4:1 E4:1 | D4:1 D4:1 E4:1 D4:1 | C4:4`),
  },
  {
    id: 'twinkle',
    title: 'Twinkle Twinkle Little Star',
    emoji: '⭐',
    bpm: 96,
    level: 1,
    blurb: 'Soft at the start, loud in the middle!',
    notes: parseSong(`
      C4:1:p C4:1:p G4:1 G4:1 | A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 | D4:1 D4:1 C4:2 |
      G4:1:f G4:1:f F4:1:f F4:1:f | E4:1 E4:1 D4:2 | G4:1 G4:1 F4:1 F4:1 | E4:1 E4:1 D4:2 |
      C4:1:p C4:1:p G4:1 G4:1 | A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 | D4:1 D4:1 C4:2`),
  },
  {
    id: 'left-hand-walk',
    title: 'Left Hand Walk',
    emoji: '🚶',
    bpm: 84,
    level: 1,
    blurb: 'Warm up your left hand down low.',
    notes: parseSong(`
      C3:1:L D3:1:L E3:1:L F3:1:L | G3:2:L F3:1:L E3:1:L | D3:1:L E3:1:L D3:1:L C3:1:L | G3:2:L C3:2:L`),
  },
  {
    id: 'jingle-bells-chorus',
    title: 'Jingle Bells (chorus)',
    emoji: '🔔',
    bpm: 112,
    level: 2,
    blurb: 'Both hands: left hand answers the right.',
    notes: parseSong(`
      E4:1 E4:1 E4:2 | E4:1 E4:1 E4:2 | E4:1 G4:1 C4:1.5 D4:0.5 | E4:4:f |
      C3:1:L G3:1:L C3:2:L |
      F4:1 F4:1 F4:1.5 F4:0.5 | F4:1 E4:1 E4:1 E4:0.5 E4:0.5 | E4:1 D4:1 D4:1 E4:1 | D4:2 G4:2:f |
      G3:1:L B3:1:L G3:2:L`),
  },
  {
    id: 'happy-birthday',
    title: 'Happy Birthday',
    emoji: '🎂',
    bpm: 100,
    level: 2,
    notes: parseSong(`
      G3:0.75 G3:0.25 A3:1 G3:1 | C4:1 B3:2 | G3:0.75 G3:0.25 A3:1 G3:1 | D4:1 C4:2 |
      G3:0.75 G3:0.25 G4:1:f E4:1 | C4:1 B3:1 A3:1 | F4:0.75 F4:0.25 E4:1 C4:1 | D4:1 C4:2`),
  },
  {
    id: 'minuet-g',
    title: 'Minuet in G',
    emoji: '👑',
    bpm: 100,
    level: 2,
    blurb: 'Bach notebook classic. Needs keys up to G5, so the keyboard grows.',
    notes: parseSong(`
      D5:1+G3:2:L G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5:1+B3:3:L G4:1 G4:1 |
      E5:1+C4:3:L C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5:1+B3:3:L G4:1 G4:1 |
      C5:1+A3:3:L D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4:1+G3:3:L C5:0.5 B4:0.5 A4:0.5 G4:0.5 |
      F#4:1+D4:1:L G4:0.5 A4:0.5 B4:0.5 G4:0.5 | A4:3+D3:3:L |
      D5:1+G3:2:L G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5:1+B3:3:L G4:1 G4:1 |
      E5:1+C4:3:L C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5:1+B3:3:L G4:1 G4:1 |
      C5:1+A3:3:L D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4:1+G3:3:L C5:0.5 B4:0.5 A4:0.5 G4:0.5 |
      A4:1+D4:1:L B4:0.5 A4:0.5 G4:0.5 F#4:0.5 | G4:3:f+G3:3:L`),
  },
  {
    id: 'prelude-c',
    title: 'Prelude in C',
    emoji: '🌊',
    bpm: 70,
    level: 3,
    blurb: 'Bach. Rolling patterns: left hand starts each one, right hand ripples.',
    notes: parseSong(
      [
        ['C4', 'E4', 'G4', 'C5', 'E5'],
        ['C4', 'D4', 'A4', 'D5', 'F5'],
        ['B3', 'D4', 'G4', 'D5', 'F5'],
        ['C4', 'E4', 'G4', 'C5', 'E5'],
        ['C4', 'E4', 'A4', 'E5', 'A5'],
        ['C4', 'D4', 'F#4', 'A4', 'D5'],
        ['B3', 'D4', 'G4', 'D5', 'G5'],
        ['B3', 'C4', 'E4', 'G4', 'C5'],
      ]
        .map(([a, b, c, d, e]) => {
          const half = `${a}:0.5:L ${b}:0.5:L ${c}:0.5 ${d}:0.5 ${e}:0.5 ${c}:0.5 ${d}:0.5 ${e}:0.5`;
          return `${half} ${half}`;
        })
        .join(' | ') + ' | C4:4:L+C3:4:L',
    ),
  },
  {
    id: 'entertainer',
    title: 'The Entertainer',
    emoji: '🎩',
    bpm: 84,
    level: 3,
    blurb: 'Scott Joplin ragtime. Bouncy and quick!',
    notes: parseSong(`
      D4:0.5 D#4:0.5 | E4:0.5 C5:1 E4:0.5 C5:1 E4:0.5 C5:2.5:f+C3:1:L |
      C5:0.5 D5:0.5 D#5:0.5 E5:0.5 C5:0.5 D5:0.5 E5:1+G3:1:L B4:0.5 D5:1 C5:2+C3:1:L |
      D4:0.5 D#4:0.5 | E4:0.5 C5:1 E4:0.5 C5:1 E4:0.5 C5:2.5:f+C3:1:L |
      A4:0.5 G4:0.5 F#4:0.5 A4:0.5 C5:0.5 E5:1+D3:1:L D5:0.5 C5:0.5 A4:0.5 D5:3+G3:1:L`),
  },
  {
    id: 'turkish-march',
    title: 'Turkish March',
    emoji: '🥁',
    bpm: 76,
    level: 3,
    blurb: 'Mozart. Very fast wiggles up to high C. Try half speed first!',
    notes: parseSong(`
      B4:0.25 A4:0.25 G#4:0.25 A4:0.25 C5:1+A3:1:L | D5:0.25 C5:0.25 B4:0.25 C5:0.25 E5:1+A3:1:L |
      F5:0.25 E5:0.25 D#5:0.25 E5:0.25 B5:0.25 A5:0.25 G#5:0.25 A5:0.25 B5:0.25 A5:0.25 G#5:0.25 A5:0.25 C6:1:f+A3:1:L |
      A5:0.5 C6:0.5 | B5:0.5+E3:1:L A5:0.5 G5:0.5 A5:0.5 | B5:0.5+E3:1:L A5:0.5 G5:0.5 A5:0.5 |
      B5:0.5+E3:1:L A5:0.5 G5:0.5 F#5:0.5 | E5:1+E3:1:L`),
  },
];


// ---------------------------------------------------------------------------
// Arranging helper: a right-hand melody plus chord symbols per bar becomes a
// two-handed piece. Play just the right hand for the one-handed version.

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
type Style = 'root' | 'root5' | 'waltz' | 'block' | 'pulse';

/**
 * chords: bars separated by "|", chords in a bar separated by spaces (they
 * share the bar equally). "-" = left hand rests. Roots sit between G2 and F#3.
 */
function arrange(melody: string, chords: string, beatsPerBar: number, style: Style, pickup = 0): SongNote[] {
  const out = parseSong(melody);
  let t = pickup;
  for (const bar of chords.split('|')) {
    const cs = bar.trim().split(/\s+/).filter(Boolean);
    if (!cs.length) continue;
    const d = beatsPerBar / cs.length;
    for (const c of cs) {
      const m = /^([A-G])([#b]?)(m?)/.exec(c);
      if (m) {
        let pc = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
        pc = (pc + 12) % 12;
        const root = pc >= 7 ? 36 + pc : 48 + pc; // G2..F#3
        const third = root + (m[3] ? 3 : 4);
        const fifth = root + 7;
        const add = (midi: number, beat: number, beats: number) => out.push({ midi, beat, beats, tag: 'L' });
        if (style === 'root') add(root, t, d);
        else if (style === 'block') [root, third, fifth].forEach((x) => add(x, t, d));
        else if (style === 'root5') {
          if (d >= 2) {
            add(root, t, d / 2);
            add(fifth, t + d / 2, d / 2);
          } else add(root, t, d);
        } else if (style === 'pulse') {
          for (let b = 0; b < d; b++) add(b % 2 ? fifth : root, t + b, 1);
        } else {
          // waltz: bass note, then two light chords
          add(root, t, 1);
          for (let b = 1; b < d; b++) {
            add(third, t + b, 1);
            add(fifth, t + b, 1);
          }
        }
      }
      t += d;
    }
  }
  return out.sort((a, b) => a.beat - b.beat || (b.midi ?? 0) - (a.midi ?? 0));
}

const CANON_BASS = ['D3', 'A2', 'B2', 'F#2', 'G2', 'D2', 'G2', 'A2'];
/** Pachelbel's ground bass under each 16-beat melody variation. */
function canon(variations: string[]): SongNote[] {
  const out: SongNote[] = [];
  variations.forEach((v, i) => {
    for (const n of parseSong(v)) out.push({ ...n, beat: n.beat + i * 16 });
    CANON_BASS.forEach((b, j) => out.push(...parseSong(`${b}:2:L`).map((n) => ({ ...n, beat: i * 16 + j * 2 }))));
  });
  out.push(...parseSong('D5:4:f+A4:4+F#4:4+D3:4:L+D2:4:L').map((n) => ({ ...n, beat: n.beat + variations.length * 16 })));
  return out.sort((a, b) => a.beat - b.beat || (b.midi ?? 0) - (a.midi ?? 0));
}

const FE_A1 = `E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 |
  A2:0.5:L+A4:1 E3:0.5:L A3:0.5:L C4:0.5 E4:0.5 A4:0.5 |
  E2:0.5:L+B4:1 E3:0.5:L G#3:0.5:L E4:0.5 G#4:0.5 B4:0.5 |
  A2:0.5:L+C5:1 E3:0.5:L A3:0.5:L E4:0.5 E5:0.5 D#5:0.5 |
  E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 |
  A2:0.5:L+A4:1 E3:0.5:L A3:0.5:L C4:0.5 E4:0.5 A4:0.5 |
  E2:0.5:L+B4:1 E3:0.5:L G#3:0.5:L E4:0.5 C5:0.5 B4:0.5 |`;
const FE_END1 = `A2:0.5:L+A4:1 E3:0.5:L A3:0.5:L R:0.5 E5:0.5 D#5:0.5 |`;
const FE_END2 = `A2:0.5:L+A4:1 E3:0.5:L A3:0.5:L B4:0.5 C5:0.5 D5:0.5 |`;
const FE_B = `C3:0.5:L+E5:1.5 G3:0.5:L C4:0.5:L G4:0.5 F5:0.5 E5:0.5 |
  G2:0.5:L+D5:1.5 G3:0.5:L B3:0.5:L F4:0.5 E5:0.5 D5:0.5 |
  A2:0.5:L+C5:1.5 E3:0.5:L A3:0.5:L E4:0.5 D5:0.5 C5:0.5 |
  E2:0.5:L+B4:1 E3:0.5:L E4:0.5:L R:0.5 E4:0.5 E5:0.5 |
  R:1 E4:0.5 E5:0.5 R:0.5 D#5:0.5 | E5:0.5 R:1 D#5:0.5 E5:0.5 D#5:0.5 |`;

const JB_VERSE_A = `G4:1 E5:1 D5:1 C5:1 | G4:3 G4:0.5 G4:0.5 | G4:1 E5:1 D5:1 C5:1 | A4:4 |
  A4:1 F5:1 E5:1 D5:1 | B4:4 | G5:1 G5:1 F5:1 D5:1 | E5:4 |
  G4:1 E5:1 D5:1 C5:1 | G4:4 | G4:1 E5:1 D5:1 C5:1 | A4:3 A4:1 |
  A4:1 F5:1 E5:1 D5:1 | G5:1 G5:1 G5:1 G5:1 | A5:1 G5:1 F5:1 D5:1 | C5:2 G5:2 |`;
const JB_VERSE_C = 'C | C | C | F | F | G | G | C | C | C | C | F | F | G | G | C';
const JB_CHORUS = `E5:1 E5:1 E5:2 | E5:1 E5:1 E5:2 | E5:1 G5:1 C5:1.5 D5:0.5 | E5:4:f |
  F5:1 F5:1 F5:1.5 F5:0.5 | F5:1 E5:1 E5:1 E5:0.5 E5:0.5 | E5:1 D5:1 D5:1 E5:1 | D5:2 G5:2 |
  E5:1 E5:1 E5:2 | E5:1 E5:1 E5:2 | E5:1 G5:1 C5:1.5 D5:0.5 | E5:4:f |
  F5:1 F5:1 F5:1 F5:1 | F5:1 E5:1 E5:1 E5:0.5 E5:0.5 | G5:1 G5:1 F5:1 D5:1 | C5:4:f |`;
const JB_CHORUS_C = 'C | C | C | C | F | C | D G | G | C | C | C | C | F | C | G | C';

const GS_A = `A4:1 |
  C5:2 D5:1 | E5:1.5 F5:0.5 E5:1 | D5:2 B4:1 | G4:1.5 A4:0.5 B4:1 | C5:2 A4:1 | A4:1.5 G#4:0.5 A4:1 | B4:2 G#4:1 | E4:2 A4:1 |
  C5:2 D5:1 | E5:1.5 F5:0.5 E5:1 | D5:2 B4:1 | G4:1.5 A4:0.5 B4:1 | C5:1.5 B4:0.5 A4:1 | G#4:1.5 F#4:0.5 G#4:1 | A4:3 | A4:3 |`;
const GS_B = `G5:3:f | G5:1.5 F#5:0.5 E5:1 | D5:2 B4:1 | G4:1.5 A4:0.5 B4:1 | C5:2 A4:1 | A4:1.5 G#4:0.5 A4:1 | B4:2 G#4:1 | E4:3 |
  G5:3:f | G5:1.5 F#5:0.5 E5:1 | D5:2 B4:1 | G4:1.5 A4:0.5 B4:1 | C5:1.5 B4:0.5 A4:1 | G#4:1.5 F#4:0.5 G#4:1 | A4:3 | A4:3`;
const GS_CHORDS = `Am | C | G | Em | Am | E | E | Am |
  Am | C | G | Em | Am | E | E | Am | Am |
  C | Em | G | Em | Am | E | E | E |
  C | Em | G | Em | Am | E | E | Am | Am`;

const ODE = `E4:1:p E4:1:p F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | E4:1.5 D4:0.5 D4:2 |
  E4:1 E4:1 F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | D4:1.5 C4:0.5 C4:2 |
  D4:1 D4:1 E4:1 C4:1 | D4:1 E4:0.5 F4:0.5 E4:1 C4:1 | D4:1 E4:0.5 F4:0.5 E4:1 D4:1 | C4:1 D4:1 G3:2 |
  E4:1:f E4:1:f F4:1:f G4:1:f | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | D4:1.5 C4:0.5 C4:2`;
const ODE_CHORDS = `C | G | C | G | C | G | C | G C | G | G C | G C | G | C | G | C | G C`;

export const FULL_SONGS: Song[] = [
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    emoji: '🎉',
    bpm: 100,
    level: 2,
    blurb: 'Beethoven, the whole tune. Right hand alone, or add the left.',
    notes: arrange(ODE, ODE_CHORDS, 4, 'root5'),
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells (full)',
    emoji: '🔔',
    bpm: 120,
    level: 2,
    blurb: '"Dashing through the snow" and the chorus twice. Left hand keeps the beat.',
    notes: arrange(JB_VERSE_A + ' ' + JB_CHORUS, `${JB_VERSE_C} | ${JB_CHORUS_C}`, 4, 'root5'),
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves (full)',
    emoji: '🍃',
    bpm: 100,
    level: 2,
    blurb: 'Both verses and the "Greensleeves was all my joy" part. Left hand: a gentle waltz.',
    notes: arrange(GS_A + ' ' + GS_B, GS_CHORDS, 3, 'waltz', 1),
  },
  {
    id: 'fur-elise',
    title: 'Für Elise',
    emoji: '🎼',
    bpm: 84,
    level: 3,
    blurb: 'Beethoven: the famous part, the middle bit, and the famous part again.',
    notes: parseSong(
      `E5:0.5:p D#5:0.5:p | ${FE_A1} ${FE_END1} ${FE_A1} ${FE_END2} ${FE_B} ${FE_A1} A2:0.5:L+A4:3 E3:0.5:L A3:2:L`,
    ),
  },
  {
    id: 'canon-d',
    title: 'Canon in D (full)',
    emoji: '💒',
    bpm: 72,
    level: 3,
    blurb: 'Pachelbel. The left hand repeats the same 8 notes while the tune keeps changing on top.',
    notes: canon([
      'F#5:2:p E5:2:p D5:2:p C#5:2:p B4:2 A4:2 B4:2 C#5:2',
      'D5:2 C#5:2 B4:2 A4:2 G4:2 F#4:2 G4:2 E4:2',
      'D4:1 F#4:1 A4:1 G4:1 F#4:1 D4:1 F#4:1 E4:1 D4:1 B3:1 D4:1 A4:1 G4:1 B4:1 A4:1 G4:1',
      'F#4:1 D4:1 E4:1 C#5:1 D5:1 F#5:1 A5:1 A4:1 B4:1 G4:1 A4:1 F#4:1 D4:1 D5:1 D5:1.5 C#5:0.5',
      'D5:0.5 C#5:0.5 D5:0.5 D4:0.5 C#4:0.5 A4:0.5 E4:0.5 F#4:0.5 D4:0.5 D5:0.5 C#5:0.5 B4:0.5 C#5:0.5 F#5:0.5 A5:0.5 B5:0.5 ' +
        'G5:0.5 F#5:0.5 E5:0.5 G5:0.5 F#5:0.5 E5:0.5 D5:0.5 C#5:0.5 B4:0.5 A4:0.5 G4:0.5 F#4:0.5 E4:0.5 G4:0.5 F#4:0.5 E4:0.5',
      'D4:0.5 E4:0.5 F#4:0.5 G4:0.5 A4:0.5 E4:0.5 A4:0.5 G4:0.5 F#4:0.5 B4:0.5 A4:0.5 G4:0.5 A4:0.5 G4:0.5 F#4:0.5 E4:0.5 ' +
        'D4:0.5 B3:0.5 B4:0.5 C#5:0.5 D5:0.5 C#5:0.5 B4:0.5 A4:0.5 G4:0.5 F#4:0.5 E4:0.5 B4:0.5 A4:0.5 B4:0.5 A4:0.5 G4:0.5',
      'F#5:2:p E5:2:p D5:2:p C#5:2:p B4:2:p A4:2:p B4:2:p C#5:2:p',
    ]),
  },
];

export function tagHas(tag: string | undefined, ch: string) {
  return !!tag && tag.includes(ch);
}

PIANO_SONGS.push(...FULL_SONGS);
