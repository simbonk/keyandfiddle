import { parseSong, type SongNote } from '../audio/notes';
import { JB_CHORUS, JB_VERSE_A, ODE } from '../piano/songs';

// ---------------------------------------------------------------- range

export interface VoiceRange {
  lo: number; // midi
  hi: number;
}

const KEY = 'kf.voice.range';
export const RANGE_PRESETS: { name: string; emoji: string; range: VoiceRange }[] = [
  { name: 'Kid', emoji: '🧒', range: { lo: 57, hi: 74 } }, // A3..D5
  { name: 'Higher grown-up', emoji: '🙋‍♀️', range: { lo: 55, hi: 72 } }, // G3..C5
  { name: 'Lower grown-up', emoji: '🙋‍♂️', range: { lo: 43, hi: 62 } }, // G2..D4
];

export function loadRange(): VoiceRange {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (r && r.hi - r.lo >= 5) return r;
  } catch {
    /* ignore */
  }
  return RANGE_PRESETS[0].range;
}
export function saveRange(r: VoiceRange) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}
export function hasSavedRange() {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

/**
 * Move a sung pitch to the octave nearest the target. Singing the right note
 * in a different octave (a dad singing a kid's song) still counts.
 */
export function foldToTarget(sung: number, target: number): number {
  const k = Math.round((sung - target) / 12);
  // only an octave slip (within 2 semitones of the target's octave) is folded;
  // otherwise keep the real pitch so "higher / lower" stays honest
  return k !== 0 && Math.abs(sung - 12 * k - target) <= 2 ? sung - 12 * k : sung;
}

/** Semitones to move a melody so it sits in the middle of the singer's range. */
export function fitShift(notes: { midi: number | null }[], r: VoiceRange): number {
  const ms = notes.filter((n) => n.midi !== null).map((n) => n.midi!);
  if (!ms.length) return 0;
  const lo = Math.min(...ms);
  const hi = Math.max(...ms);
  // already fits: keep the song in its usual key
  if (lo >= r.lo && hi <= r.hi) return 0;
  let shift = Math.round((r.lo + r.hi) / 2 - (lo + hi) / 2);
  // prefer keeping the whole song inside the range
  if (hi - lo <= r.hi - r.lo) {
    if (lo + shift < r.lo) shift = r.lo - lo;
    if (hi + shift > r.hi) shift = r.hi - hi;
  }
  return shift;
}

export const SOLFEGE = ['Do', 'Re', 'Mi', 'Fa', 'So', 'La', 'Ti', 'Do'];
export const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];

// ---------------------------------------------------------------- songs

export interface VoiceSong {
  id: string;
  title: string;
  emoji: string;
  bpm: number;
  level: 1 | 2 | 3;
  notes: (SongNote & { lyric: string })[];
}

/** notes in the usual "C4:1" notation, lyrics one token per note */
function song(id: string, title: string, emoji: string, bpm: number, level: 1 | 2 | 3, notes: string, lyrics: string): VoiceSong {
  const ns = parseSong(notes);
  const ly = lyrics.split(/\s+/).filter(Boolean);
  if (ly.length !== ns.length) throw new Error(`${id}: ${ns.length} notes but ${ly.length} lyrics`);
  return { id, title, emoji, bpm, level, notes: ns.map((n, i) => ({ ...n, lyric: ly[i] })) };
}

// All traditional / public domain.
export const VOICE_SONGS: VoiceSong[] = [
  song(
    'v-hot-cross',
    'Hot Cross Buns',
    '🥯',
    84,
    1,
    `E4:1 D4:1 C4:2 | E4:1 D4:1 C4:2 | C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 | E4:1 D4:1 C4:2`,
    `Hot cross buns, hot cross buns, one a pen- ny, two a pen- ny, hot cross buns!`,
  ),
  song(
    'v-mary',
    'Mary Had a Little Lamb',
    '🐑',
    96,
    1,
    `E4:1 D4:1 C4:1 D4:1 | E4:1 E4:1 E4:2 | D4:1 D4:1 D4:2 | E4:1 G4:1 G4:2 |
     E4:1 D4:1 C4:1 D4:1 | E4:1 E4:1 E4:1 E4:1 | D4:1 D4:1 E4:1 D4:1 | C4:4`,
    `Ma- ry had a lit- tle lamb, lit- tle lamb, lit- tle lamb, Ma- ry had a lit- tle lamb, its fleece was white as snow.`,
  ),
  song(
    'v-twinkle',
    'Twinkle Twinkle Little Star',
    '⭐',
    90,
    1,
    `C4:1 C4:1 G4:1 G4:1 | A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 | D4:1 D4:1 C4:2 |
     G4:1 G4:1 F4:1 F4:1 | E4:1 E4:1 D4:2 | G4:1 G4:1 F4:1 F4:1 | E4:1 E4:1 D4:2 |
     C4:1 C4:1 G4:1 G4:1 | A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 | D4:1 D4:1 C4:2`,
    `Twin- kle twin- kle lit- tle star, how I won- der what you are. Up a- bove the world so high, like a dia- mond in the sky. Twin- kle twin- kle lit- tle star, how I won- der what you are.`,
  ),
  song(
    'v-row',
    'Row, Row, Row Your Boat',
    '🚣',
    100,
    2,
    `C4:1.5 C4:1.5 | C4:1 D4:0.5 E4:1.5 | E4:1 D4:0.5 E4:1 F4:0.5 | G4:3 |
     C5:0.5 C5:0.5 C5:0.5 G4:0.5 G4:0.5 G4:0.5 | E4:0.5 E4:0.5 E4:0.5 C4:0.5 C4:0.5 C4:0.5 | G4:1 F4:0.5 E4:1 D4:0.5 | C4:3`,
    `Row, row, row your boat, gent- ly down the stream. Mer- ri- ly, mer- ri- ly, mer- ri- ly, mer- ri- ly, life is but a dream.`,
  ),
  song(
    'v-jacques',
    'Are You Sleeping (Frère Jacques)',
    '🔔',
    100,
    2,
    `C4:1 D4:1 E4:1 C4:1 | C4:1 D4:1 E4:1 C4:1 | E4:1 F4:1 G4:2 | E4:1 F4:1 G4:2 |
     G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:1 C4:1 | C4:1 G3:1 C4:2 | C4:1 G3:1 C4:2`,
    `Are you sleep- ing, are you sleep- ing, Broth- er John? Broth- er John? Morn- ing bells are ring- ing, morn- ing bells are ring- ing, ding, dang, dong! Ding, dang, dong!`,
  ),
  song(
    'v-birthday',
    'Happy Birthday',
    '🎂',
    96,
    2,
    `G3:0.75 G3:0.25 A3:1 G3:1 | C4:1 B3:2 | G3:0.75 G3:0.25 A3:1 G3:1 | D4:1 C4:2 |
     G3:0.75 G3:0.25 G4:1 E4:1 | C4:1 B3:1 A3:1 | F4:0.75 F4:0.25 E4:1 C4:1 | D4:1 C4:2`,
    `Hap- py birth- day to you, hap- py birth- day to you, hap- py birth- day, dear fri- end, hap- py birth- day to you!`,
  ),
  song(
    'v-jingle',
    'Jingle Bells',
    '🛷',
    112,
    2,
    JB_VERSE_A + ' ' + JB_CHORUS,
    `Dash- ing through the snow, in a one- horse o- pen sleigh, o'er the fields we go, laugh- ing all the way.
     Bells on bob- tail ring, mak- ing spir- its bright, what fun it is to ride and sing a sleigh- ing song to- night! Oh,
     Jin- gle bells, jin- gle bells, jin- gle all the way! Oh what fun it is to ride in a one- horse o- pen sleigh, hey!
     Jin- gle bells, jin- gle bells, jin- gle all the way! Oh what fun it is to ride in a one- horse o- pen sleigh!`,
  ),
  song('v-ode', 'Ode to Joy', '🎉', 96, 3, ODE, Array(62).fill('La').join(' ')),
  song(
    'v-scale-song',
    'Do-Re-Mi Ladder',
    '🪜',
    80,
    1,
    `C4:1 D4:1 E4:1 F4:1 | G4:1 A4:1 B4:1 C5:2 | C5:1 B4:1 A4:1 G4:1 | F4:1 E4:1 D4:1 C4:2`,
    `Do Re Mi Fa So La Ti Do! Do Ti La So Fa Mi Re Do!`,
  ),
];
