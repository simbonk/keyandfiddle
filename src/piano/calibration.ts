// Per-key calibration for an out-of-tune piano. We remember the frequency
// each key actually produces, and use it to work out which key was pressed.

import { centsBetween, freqToMidiFloat, midiToFreq } from '../audio/notes';

const KEY = 'kf.piano.calibration.v1';

export interface PianoCalibration {
  /** midi -> measured frequency (Hz) */
  keys: Record<number, number>;
  /** typical loudness (RMS) of a normal key press, used for soft/loud feedback */
  refLevel: number;
  /** first midi note on the on-screen keyboard (25 keys from here) */
  startMidi: number;
  updatedAt: number;
}

export const DEFAULT_CAL: PianoCalibration = { keys: {}, refLevel: 0.06, startMidi: 48, updatedAt: 0 };

export function loadCalibration(): PianoCalibration {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_CAL, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_CAL };
}

export function saveCalibration(c: PianoCalibration) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...c, updatedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function isCalibrated(c: PianoCalibration) {
  return Object.keys(c.keys).length > 0;
}

/** Cents offset of a measured key from equal temperament. */
export function keyOffsetCents(c: PianoCalibration, midi: number): number | null {
  const f = c.keys[midi];
  return f ? centsBetween(f, midiToFreq(midi)) : null;
}

/**
 * Expected frequency for a key: the measured one if we have it, otherwise
 * equal temperament shifted by an interpolation of nearby measured offsets
 * (so a "quick tune" of a few keys still works for the whole keyboard).
 */
export function expectedFreq(c: PianoCalibration, midi: number): number {
  if (c.keys[midi]) return c.keys[midi];
  const measured = Object.keys(c.keys)
    .map(Number)
    .sort((a, b) => a - b);
  if (!measured.length) return midiToFreq(midi);
  let lo: number | null = null;
  let hi: number | null = null;
  for (const m of measured) {
    if (m < midi) lo = m;
    if (m > midi && hi === null) hi = m;
  }
  let cents: number;
  if (lo !== null && hi !== null) {
    const a = keyOffsetCents(c, lo)!;
    const b = keyOffsetCents(c, hi)!;
    cents = a + ((b - a) * (midi - lo)) / (hi - lo);
  } else {
    cents = keyOffsetCents(c, (lo ?? hi)!)!;
  }
  return midiToFreq(midi) * Math.pow(2, cents / 1200);
}

/** Which key (midi) does this frequency belong to on *this* piano? */
export function matchKey(
  c: PianoCalibration,
  freq: number,
  range: [number, number] = [21, 108],
): { midi: number; cents: number } | null {
  if (!freq) return null;
  const guess = Math.round(freqToMidiFloat(freq));
  let best: { midi: number; cents: number } | null = null;
  for (let m = Math.max(range[0], guess - 2); m <= Math.min(range[1], guess + 2); m++) {
    const cents = centsBetween(freq, expectedFreq(c, m));
    if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { midi: m, cents };
  }
  if (!best || Math.abs(best.cents) > 60) return null;
  return best;
}

/**
 * Is this frequency the given key (or the same key an octave off, a common
 * pitch-detector slip on low piano notes)? Checked against both this piano's
 * calibrated pitch and standard tuning, so one badly measured key can't
 * make that key impossible to play.
 */
export function nearKey(c: PianoCalibration, freq: number, midi: number): boolean {
  // calibrated pitch: generous; standard pitch: tighter, so a flat neighbour can't sneak in
  const refs: [number, number][] = [
    [expectedFreq(c, midi), 50],
    [midiToFreq(midi), 30],
  ];
  for (const [ref, tol] of refs) {
    for (const oct of [0, -1, 1]) {
      if (Math.abs(centsBetween(freq, ref * Math.pow(2, oct))) < tol) return true;
    }
  }
  return false;
}
