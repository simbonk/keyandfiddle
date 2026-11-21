// Decides when the tuning wizard has clearly heard the key it asked for.
//
// It doesn't depend on catching the moment the key was struck (talking in
// the room or a previous key still ringing used to swallow that moment, and
// the wizard would sit there "listening" forever). Instead it watches the
// recent stream of pitches and waits for a steady tone near the target key.

import { centsBetween, freqToMidiFloat } from '../audio/notes';

export interface CapFrame {
  t: number;
  freq: number; // 0 = no pitch
  rms: number;
}

export type CaptureResult = { kind: 'accept'; freq: number; peak: number } | { kind: 'mismatch'; freq: number } | null;

/** Fold a frequency into the octave nearest the target (pitch detectors often slip an octave). */
export function foldToTarget(freq: number, target: number): { freq: number; diff: number } {
  let f = freq;
  let diff = freqToMidiFloat(f) - target;
  while (diff > 6) {
    f /= 2;
    diff -= 12;
  }
  while (diff < -6) {
    f *= 2;
    diff += 12;
  }
  return { freq: f, diff };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * @param frames recent frames, oldest first
 * @param target midi of the key we asked for
 * @param prevFreq measured frequency of the previous key (it may still be ringing), or 0
 * @param stepStart when this key's step started (ms)
 */
export function analyzeCapture(frames: CapFrame[], target: number, prevFreq: number, stepStart: number, now: number): CaptureResult {
  const recent = frames.filter((f) => f.t > now - 450 && f.t > stepStart + 150 && f.freq > 0);
  const near: { freq: number; rms: number }[] = [];
  for (const f of recent) {
    const { freq, diff } = foldToTarget(f.freq, target);
    if (Math.abs(diff) > 0.65) continue;
    // ignore the previous key still ringing
    if (prevFreq && Math.abs(centsBetween(freq, foldToTarget(prevFreq, target).freq)) < 35) continue;
    near.push({ freq, rms: f.rms });
  }
  if (near.length >= 8) {
    const m = median(near.map((n) => n.freq));
    const steady = near.filter((n) => Math.abs(centsBetween(n.freq, m)) < 25);
    if (steady.length >= 8) {
      return { kind: 'accept', freq: median(steady.map((n) => n.freq)), peak: Math.max(...near.map((n) => n.rms)) };
    }
  }
  // A long, steady, loud tone on a clearly different key: probably the wrong key.
  const long = frames.filter((f) => f.t > now - 700 && f.t > stepStart + 600 && f.freq > 0);
  if (long.length >= 25) {
    const folded = long.map((f) => foldToTarget(f.freq, target));
    const m = median(folded.map((x) => x.diff));
    const steady = folded.filter((x) => Math.abs(x.diff - m) < 0.3);
    const prevDiff = prevFreq ? foldToTarget(prevFreq, target).diff : 99;
    if (steady.length >= 22 && Math.abs(m) >= 1 && Math.abs(m - prevDiff) > 0.4) {
      return { kind: 'mismatch', freq: median(steady.map((x) => x.freq)) };
    }
  }
  return null;
}
