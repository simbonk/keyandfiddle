import { parseSong, type Song } from '../audio/notes';

// Tags: L = left hand, p = play softly, f = play loudly.
// All tunes are traditional / public domain.

// level: 1 = beginner, 2 = intermediate, 3 = advanced
export const PIANO_SONGS: Song[] = [
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
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    emoji: '🎉',
    bpm: 100,
    level: 2,
    blurb: 'Beethoven! Starts gentle and gets big.',
    notes: parseSong(`
      E4:1:p E4:1:p F4:1 G4:1 | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | E4:1.5 D4:0.5 D4:2 |
      E4:1:f E4:1:f F4:1:f G4:1:f | G4:1 F4:1 E4:1 D4:1 | C4:1 C4:1 D4:1 E4:1 | D4:1.5 C4:0.5 C4:2`),
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
    id: 'jingle-bells',
    title: 'Jingle Bells',
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
    id: 'greensleeves',
    title: 'Greensleeves',
    emoji: '🍃',
    bpm: 96,
    level: 2,
    blurb: 'An old English tune with a lilt. Left hand on the first beat.',
    notes: parseSong(`
      A4:1 | C5:2+A3:3:L D5:1 | E5:1.5+C3:3:L F5:0.5 E5:1 | D5:2+G3:3:L B4:1 | G4:1.5+E3:3:L A4:0.5 B4:1 |
      C5:2+A3:3:L A4:1 | A4:1.5+E3:3:L G#4:0.5 A4:1 | B4:2+E3:3:L G#4:1 | E4:2+E3:3:L A4:1 |
      C5:2+A3:3:L D5:1 | E5:1.5+C3:3:L F5:0.5 E5:1 | D5:2+G3:3:L B4:1 | G4:1.5+E3:3:L A4:0.5 B4:1 |
      C5:1.5+A3:3:L B4:0.5 A4:1 | G#4:1.5+E3:3:L F#4:0.5 G#4:1 | A4:3+A3:3:L`),
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
    id: 'canon-d',
    title: 'Canon in D',
    emoji: '💒',
    bpm: 72,
    level: 3,
    blurb: 'Pachelbel. The low left hand repeats while the tune floats on top. Big keyboard!',
    notes: parseSong(`
      F#5:2:p+D3:2:L E5:2:p+A2:2:L D5:2:p+B2:2:L C#5:2:p+F#2:2:L B4:2+G2:2:L A4:2+D2:2:L B4:2+G2:2:L C#5:2+A2:2:L |
      D5:2+D3:2:L C#5:2+A2:2:L B4:2+B2:2:L A4:2+F#2:2:L G4:2+G2:2:L F#4:2+D2:2:L G4:2+G2:2:L E4:2+A2:2:L |
      D4:1+D3:2:L F#4:1 A4:1+A2:2:L G4:1 F#4:1+B2:2:L D4:1 F#4:1+F#2:2:L E4:1 |
      D4:1+G2:2:L B3:1 D4:1+D2:2:L A4:1 G4:1+G2:2:L B4:1 A4:1+A2:2:L G4:1 |
      F#4:1:f+D3:2:L D4:1 E4:1+A2:2:L C#5:1 D5:1+B2:2:L F#5:1 A5:1+F#2:2:L A4:1 |
      B4:1+G2:2:L G4:1 A4:1+D2:2:L F#4:1 D4:1+G2:2:L D5:1 D5:2+A2:2:L | D5:4:f+D3:4:L`),
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
  {
    id: 'fur-elise',
    title: 'Für Elise (opening)',
    emoji: '🎼',
    bpm: 80,
    level: 3,
    blurb: 'Beethoven again. Quick little wiggles!',
    notes: parseSong(`
      E4:0.5:p D#4:0.5:p E4:0.5:p D#4:0.5:p E4:0.5 B3:0.5 D4:0.5 C4:0.5 |
      A3:1.5 C3:0.5:L E3:0.5:L A3:0.5:L | B3:1.5 E3:0.5:L G#3:0.5:L B3:0.5:L |
      C4:1.5 E3:0.5:L E4:0.5:p D#4:0.5:p E4:0.5:p D#4:0.5:p E4:0.5 B3:0.5 D4:0.5 C4:0.5 | A3:2`),
  },
];

export function tagHas(tag: string | undefined, ch: string) {
  return !!tag && tag.includes(ch);
}
