// Guitar facts: strings, first-position fingering, chord shapes, and the songs.
import { parseSong, type Song, type SongNote } from '../audio/notes';
import { JB_CHORUS } from '../piano/songs';
import { VIOLIN_SONGS } from '../violin/theory';

export interface GuitarString {
  /** the name printed on the headstock ("e" is the thin high E) */
  name: string;
  midi: number;
  color: string;
}

/** Low E (thickest, nearest your chin) first, high e (thinnest) last. */
export const GSTRINGS: GuitarString[] = [
  { name: 'E', midi: 40, color: '#ff4d6d' },
  { name: 'A', midi: 45, color: '#ff9f1c' },
  { name: 'D', midi: 50, color: '#ffd60a' },
  { name: 'G', midi: 55, color: '#52d273' },
  { name: 'B', midi: 59, color: '#2ec4f1' },
  { name: 'e', midi: 64, color: '#c77dff' },
];

/** Frets drawn on the screen (first position plus one). */
export const FRETS = 5;

export interface GFingering {
  string: number;
  fret: number;
  /** which left-hand finger: 0 = open string, 1-4 = index..pinky (first position: finger = fret) */
  finger: number;
  label: string;
}

/** First-position fingering: the thinnest string that reaches it within frets 0-4 (fret 5 for top A). */
export function guitarFingering(midi: number): GFingering | null {
  for (const maxFret of [4, FRETS]) {
    for (let s = GSTRINGS.length - 1; s >= 0; s--) {
      const fret = midi - GSTRINGS[s].midi;
      if (fret >= 0 && fret <= maxFret) {
        const finger = Math.min(4, fret);
        return {
          string: s,
          fret,
          finger,
          label: fret === 0 ? `open ${GSTRINGS[s].name}` : `fret ${fret} on ${GSTRINGS[s].name}`,
        };
      }
    }
  }
  return null;
}

const LOW = 40;
const HIGH = 69; // A4: fret 5 on the high e
/** Move a melody by whole octaves so it sits on the guitar's first position. */
export function fitToGuitar(notes: SongNote[]): SongNote[] {
  const ms = notes.filter((n) => n.midi !== null).map((n) => n.midi!);
  if (!ms.length) return notes;
  const hi = Math.max(...ms);
  let best = 0;
  let bestScore = -Infinity;
  for (let k = -36; k <= 24; k += 12) {
    // fits best when nothing falls off, and sits high (melodies on the thin strings)
    const out = ms.filter((m) => m + k < LOW || m + k > HIGH).length;
    const score = -out * 100 - Math.abs(hi + k - 64);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return notes.map((n) => {
    if (n.midi === null) return n;
    let m = n.midi + best;
    while (m > HIGH) m -= 12;
    while (m < LOW) m += 12;
    return { ...n, midi: m };
  });
}

export interface GuitarNote extends SongNote {
  midi: number;
  fing: GFingering;
}

export function guitarNotes(song: Song): GuitarNote[] {
  const out: GuitarNote[] = [];
  for (const n of song.notes) {
    if (n.midi === null || n.tag?.includes('L')) continue;
    const f = guitarFingering(n.midi);
    if (f) out.push({ midi: n.midi, beat: n.beat, beats: n.beats, fing: f });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Chords

export interface ChordShape {
  name: string;
  /** fret per string, low E first; -1 = don't play this string */
  frets: number[];
  /** finger per string (1 index ... 4 pinky), 0 = none */
  fingers: number[];
  color: string;
  tip: string;
}

export const CHORDS: Record<string, ChordShape> = {
  Em: { name: 'Em', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], color: '#2ec4f1', tip: 'Just two fingers! Strum all six strings.' },
  E: { name: 'E', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], color: '#ff4d6d', tip: 'Like E minor, plus finger 1 on the G string.' },
  Am: { name: 'Am', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], color: '#c77dff', tip: 'The E shape moved over one string. Skip the low E.' },
  A: { name: 'A', frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], color: '#ff9f1c', tip: 'Three fingers in a row on fret 2. Skip the low E.' },
  D: { name: 'D', frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], color: '#ffd60a', tip: 'A little triangle. Strum only the top four strings.' },
  Dm: { name: 'Dm', frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], color: '#7b6cff', tip: 'Like D, but finger 1 drops to fret 1 on the high e.' },
  C: { name: 'C', frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], color: '#52d273', tip: 'A staircase: fingers 3, 2, 1. Skip the low E.' },
  G: { name: 'G', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], color: '#ff6fb5', tip: 'Fingers 2 and 1 on the low strings, 3 on the high e.' },
  E7: { name: 'E7', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], color: '#ff8fa3', tip: 'Like E with one finger lifted.' },
  A7: { name: 'A7', frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], color: '#ffb85c', tip: 'Like A with the middle finger lifted.' },
  D7: { name: 'D7', frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], color: '#ffe66d', tip: 'A little upside-down triangle.' },
  G7: { name: 'G7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], color: '#ff9ed0', tip: 'Like G, with finger 1 on fret 1 of the high e.' },
  F: { name: 'F', frets: [-1, -1, 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1], color: '#9be564', tip: 'Easy F: finger 1 lies across the B and high e strings.' },
};

export function chordMidis(c: ChordShape): (number | null)[] {
  return c.frets.map((f, i) => (f < 0 ? null : GSTRINGS[i].midi + f));
}

/**
 * A chord chart ("G | C D | G") becomes strums: one per 2 beats, so a
 * 4-beat bar of G is two strums of G. The chord name rides in the note's tag.
 */
export function chordChart(chart: string, beatsPerBar = 4, pickup = 0): SongNote[] {
  const out: SongNote[] = [];
  let t = pickup;
  for (const bar of chart.split('|')) {
    const cs = bar.trim().split(/\s+/).filter(Boolean);
    if (!cs.length) continue;
    const d = beatsPerBar / cs.length;
    for (const c of cs) {
      const shape = CHORDS[c];
      const strums = d >= 4 ? Math.round(d / 2) : 1;
      for (let k = 0; k < strums; k++) {
        // a new chord starts with a down strum; the same chord again comes back up
        if (shape)
          out.push({
            midi: GSTRINGS[shape.frets.findIndex((f) => f >= 0)].midi,
            beat: t + (k * d) / strums,
            beats: d / strums,
            tag: k % 2 ? `${c}^` : c,
          });
      }
      t += d;
    }
  }
  return out;
}

/** The chord and strum direction stored in a chord-song note's tag ("G" = down, "G^" = up). */
export function chordOfTag(tag?: string): { chord: ChordShape | null; up: boolean } {
  const up = !!tag?.endsWith('^');
  const name = up ? tag!.slice(0, -1) : (tag ?? '');
  return { chord: CHORDS[name] ?? null, up };
}

export function isChordSong(song: Song): boolean {
  return song.id.startsWith('chord-');
}

// ---------------------------------------------------------------------------
// Songs

/** Same tunes as the violin (bowing-only warm-ups left out), plus guitar starters. */
const FROM_VIOLIN = VIOLIN_SONGS.filter((s) => !['open-strings', 'pizza', 'four-strings'].includes(s.id)).map(
  (s): Song => ({ ...s, id: `g-${s.id}`, notes: fitToGuitar(s.notes), blurb: undefined }),
);

function melody(src: string): SongNote[] {
  return fitToGuitar(parseSong(src).filter((n) => !n.tag?.includes('L')));
}

const STARTERS: Song[] = [
  {
    id: 'g-open-rock',
    title: 'Open String Rock',
    emoji: '🤘',
    bpm: 84,
    level: 1,
    blurb: 'No fingers! Pluck each string from the fat low E to the thin high e.',
    notes: parseSong(`E2:1 E2:1 A2:1 A2:1 | D3:1 D3:1 G3:1 G3:1 | B3:1 B3:1 E4:2 | E4:1 B3:1 G3:1 D3:1 | A2:2 E2:2`),
  },
  {
    id: 'g-spider',
    title: 'Spider Walk',
    emoji: '🕷️',
    bpm: 72,
    level: 1,
    blurb: 'Fingers 1, 2, 3, 4 on frets 1 to 4, one string at a time.',
    notes: parseSong(`F4:1 F#4:1 G4:1 G#4:1 | C4:1 C#4:1 D4:1 D#4:1 | G#3:1 A3:1 A#3:1 B3:1 | E4:4`),
  },
  {
    id: 'g-row',
    title: 'Row, Row, Row Your Boat',
    emoji: '🚣',
    bpm: 100,
    level: 1,
    blurb: 'Gently down the stream, on the G, B and high e strings.',
    notes: melody(`C4:1.5 C4:1.5 | C4:1 D4:0.5 E4:1.5 | E4:1 D4:0.5 E4:1 F4:0.5 | G4:3 |
      C5:0.5 C5:0.5 C5:0.5 G4:0.5 G4:0.5 G4:0.5 | E4:0.5 E4:0.5 E4:0.5 C4:0.5 C4:0.5 C4:0.5 | G4:1 F4:0.5 E4:1 D4:0.5 | C4:3`),
  },
  {
    id: 'g-frere',
    title: 'Frère Jacques',
    emoji: '🔔',
    bpm: 96,
    level: 1,
    blurb: 'Are you sleeping, Brother John?',
    notes: melody(`C4:1 D4:1 E4:1 C4:1 | C4:1 D4:1 E4:1 C4:1 | E4:1 F4:1 G4:2 | E4:1 F4:1 G4:2 |
      G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 | C4:1 G3:1 C4:2 | C4:1 G3:1 C4:2`),
  },
  {
    id: 'g-london',
    title: 'London Bridge',
    emoji: '🌉',
    bpm: 100,
    level: 1,
    blurb: 'Falling down, falling down!',
    notes: melody(`G4:1.5 A4:0.5 G4:1 F4:1 | E4:1 F4:1 G4:2 | D4:1 E4:1 F4:2 | E4:1 F4:1 G4:2 |
      G4:1.5 A4:0.5 G4:1 F4:1 | E4:1 F4:1 G4:2 | D4:2 G4:2 | E4:1 C4:3`),
  },
  {
    id: 'g-macdonald',
    title: 'Old MacDonald',
    emoji: '🐄',
    bpm: 104,
    level: 2,
    blurb: 'E-I-E-I-O! In G, on the D, G and B strings.',
    notes: melody(`G4:1 G4:1 G4:1 D4:1 | E4:1 E4:1 D4:2 | B4:1 B4:1 A4:1 A4:1 | G4:3 D4:1 |
      G4:1 G4:1 G4:1 D4:1 | E4:1 E4:1 D4:2 | B4:1 B4:1 A4:1 A4:1 | G4:4`),
  },
  {
    id: 'g-jingle',
    title: 'Jingle Bells',
    emoji: '🛷',
    bpm: 112,
    level: 2,
    blurb: 'The chorus, twice. Lots of the open high e.',
    notes: melody(JB_CHORUS),
  },
  {
    id: 'g-birthday',
    title: 'Happy Birthday',
    emoji: '🎂',
    bpm: 96,
    level: 2,
    blurb: 'Play it at the next party!',
    notes: melody(`G3:0.75 G3:0.25 A3:1 G3:1 | C4:1 B3:2 | G3:0.75 G3:0.25 A3:1 G3:1 | D4:1 C4:2 |
      G3:0.75 G3:0.25 G4:1 E4:1 | C4:1 B3:1 A3:1 | F4:0.75 F4:0.25 E4:1 C4:1 | D4:1 C4:2`),
  },
];

export const GUITAR_SONGS: Song[] = [...STARTERS, ...FROM_VIOLIN];

// ---------------------------------------------------------------------------
// Chord practice

function chordSong(id: string, title: string, emoji: string, level: 1 | 2 | 3, bpm: number, chart: string, blurb: string, beatsPerBar = 4, pickup = 0): Song {
  return { id: `chord-${id}`, title, emoji, level, bpm, blurb, notes: chordChart(chart, beatsPerBar, pickup) };
}

const ONE = (c: string) => `${c} | ${c} | ${c} | ${c}`;

export const CHORD_SONGS: Song[] = [
  // one chord at a time
  chordSong('em', 'E minor', '🌙', 1, 70, ONE('Em'), CHORDS.Em.tip),
  chordSong('am', 'A minor', '🌧️', 1, 70, ONE('Am'), CHORDS.Am.tip),
  chordSong('e', 'E major', '☀️', 1, 70, ONE('E'), CHORDS.E.tip),
  chordSong('a', 'A major', '🍎', 1, 70, ONE('A'), CHORDS.A.tip),
  chordSong('d', 'D major', '🔺', 1, 70, ONE('D'), CHORDS.D.tip),
  chordSong('c', 'C major', '🪜', 1, 70, ONE('C'), CHORDS.C.tip),
  chordSong('g', 'G major', '🌟', 1, 70, ONE('G'), CHORDS.G.tip),
  chordSong('dm', 'D minor', '🌊', 1, 70, ONE('Dm'), CHORDS.Dm.tip),
  chordSong('e7', 'E7, A7, D7', '7️⃣', 1, 70, 'E7 | E7 | A7 | A7 | D7 | D7 | E7 | E7', 'Three "seven" chords, the blues family.'),
  chordSong('f', 'Easy F', '🍀', 1, 66, ONE('F'), CHORDS.F.tip),
  // changing chords
  chordSong('em-am', 'E minor ↔ A minor', '🔁', 2, 72, 'Em | Am | Em | Am | Em | Am | Em | Em', 'Same shape, just hop over one string.'),
  chordSong('e-a', 'E ↔ A', '🔁', 2, 72, 'E | A | E | A | E | A | E | E', 'Two of the three chords in a thousand rock songs.'),
  chordSong('a-d', 'A ↔ D', '🔁', 2, 72, 'A | D | A | D | A | D | A | A', 'Keep finger 1 close to the strings.'),
  chordSong('g-c-d', 'G, C and D', '🎸', 2, 76, 'G | C | D | G | G | C | D | G', 'The three-chord trick in G.'),
  chordSong('am-c-g', 'Am, C, G', '🎸', 2, 76, 'Am | C | G | Am | Am | C | G | Am', 'A minor-key loop.'),
  chordSong('am-dm-e', 'Am, Dm, E', '🌑', 2, 72, 'Am | Dm | E | Am | Am | Dm | E | Am', 'Spooky minor changes.'),
  // strum along
  chordSong('twinkle', 'Twinkle Twinkle (strum)', '⭐', 3, 84, 'G | C G | C G | D G | G C | G D | G C | G D | G | C G | C G | D G', 'G, C and D. Sing along while you strum!'),
  chordSong('birthday', 'Happy Birthday (strum)', '🎂', 3, 84, 'G | D | D | G | G | C | G D | G', 'A waltz: one strum per bar.', 3, 1),
  chordSong('susanna', 'Oh! Susanna (strum)', '🪕', 3, 90, 'D | D | D | A | D | D | A | D | G | D | A | D | D | A | D', 'D, A and G, verse and chorus.'),
  chordSong('yankee', 'Yankee Doodle (strum)', '🎩', 3, 96, 'G | D | G | D | G | C | D | G | C | G | C | G | C | G | D | G', 'G, C and D. Marching!'),
  chordSong('camptown', 'Camptown Races (strum)', '🐎', 3, 90, 'D | D | A | D | D | D | A | D | D | D | G | D | D | A | D', 'Doo-dah! D, A and G.'),
  chordSong('ode', 'Ode to Joy (strum)', '🎉', 3, 84, 'C | G | C | G | C | G | C | G C | G | G C | G C | G | C | G | C | G C', 'Just C and G, back and forth.'),
  chordSong('greensleeves', 'Greensleeves (strum)', '🍃', 3, 80, 'Am | C | G | Em | Am | E | E | Am | Am | C | G | Em | Am | E | E | Am', 'Am, C, G, Em and E. A waltz: one strum per bar.', 3, 1),
];

/**
 * How well a pitch-class energy profile (from the microphone) matches a chord:
 * the share of energy in the chord's notes, and whether every chord note is
 * actually there (so C is not mistaken for A minor).
 */
export function chordMatch(chroma: ArrayLike<number>, c: ChordShape): { share: number; all: boolean } {
  const pcs = new Set(chordMidis(c).filter((m): m is number => m !== null).map((m) => m % 12));
  let total = 0;
  let inChord = 0;
  let max = 0;
  for (let i = 0; i < 12; i++) {
    total += chroma[i];
    max = Math.max(max, chroma[i]);
    if (pcs.has(i)) inChord += chroma[i];
  }
  if (total <= 0) return { share: 0, all: false };
  const all = [...pcs].every((p) => chroma[p] >= max * 0.06);
  return { share: inChord / total, all };
}
