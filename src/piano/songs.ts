import { parseSong, type Song } from '../audio/notes';

// Tags: L = left hand, p = play softly, f = play loudly.
// All tunes are traditional / public domain.

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
