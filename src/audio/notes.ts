// Note / frequency helpers shared by the piano and violin.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidiFloat(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

export function midiName(midi: number): string {
  const n = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${n}${octave}`;
}

/** Name without octave, kid-friendly (e.g. "C#"). */
export function pitchClassName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

/** Parse "C4", "F#3", "Bb4" into a MIDI number. */
export function parseNote(s: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s.trim());
  if (!m) throw new Error(`Bad note: ${s}`);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[m[1].toUpperCase()];
  if (m[2] === '#') pc += 1;
  if (m[2] === 'b') pc -= 1;
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}

/** Cents between two frequencies (positive when f is sharp of ref). */
export function centsBetween(f: number, ref: number): number {
  return 1200 * Math.log2(f / ref);
}

export interface SongNote {
  /** MIDI note number, or null for a rest. */
  midi: number | null;
  /** Start time in beats. */
  beat: number;
  /** Length in beats. */
  beats: number;
  /** Optional per-note annotation (e.g. "L" for left hand on piano, or "^"/"v" bow on violin). */
  tag?: string;
}

export interface Song {
  id: string;
  title: string;
  emoji: string;
  bpm: number;
  level: 1 | 2 | 3;
  notes: SongNote[];
  blurb?: string;
}

/**
 * Tiny song notation: space separated tokens "NOTE:BEATS[:TAG]".
 * "R:1" is a rest. "|" bar lines are ignored. Example: "C4:1 D4:1 E4:2 | R:1 G4:1:L"
 * Tokens joined with "+" start at the same beat (chords), e.g. "C3:2:L+E4:1".
 */
export function parseSong(src: string): SongNote[] {
  const out: SongNote[] = [];
  let beat = 0;
  for (const raw of src.split(/\s+/)) {
    const tok = raw.trim();
    if (!tok || tok === '|') continue;
    let step = 0;
    for (const part of tok.split('+')) {
      const [n, b, tag] = part.split(':');
      const beats = b ? parseFloat(b) : 1;
      const midi = n === 'R' ? null : parseNote(n);
      if (midi !== null) out.push({ midi, beat, beats, tag });
      // The melody (first part of a chord token) decides how far we advance.
      if (step === 0) step = beats;
    }
    beat += step;
  }
  return out;
}

export function songLengthBeats(notes: SongNote[]): number {
  return notes.reduce((m, n) => Math.max(m, n.beat + n.beats), 0);
}
