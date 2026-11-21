import { describe, expect, it } from 'vitest';
import { melodyLine, parseMidi } from '../audio/importScore';

function midiFile(notes: [number, number][]): Uint8Array {
  const ev: number[] = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]; // 120 bpm
  for (const [m, dur] of notes) ev.push(0, 0x90, m, 90, dur >> 7 | 0x80, dur & 0x7f, m, 0); // running-status note off
  ev.push(0, 0xff, 0x2f, 0);
  const len = ev.length;
  return new Uint8Array([
    ...'MThd'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0,
    ...'MTrk'.split('').map((c) => c.charCodeAt(0)), 0, 0, len >> 8, len & 0xff, ...ev,
  ]);
}

describe('sheet music import', () => {
  it('reads MIDI notes, timing and tempo', () => {
    const r = parseMidi(midiFile([[60, 480], [64, 960], [67, 240]]));
    expect(r.bpm).toBe(120);
    expect(r.notes.map((n) => [n.midi, n.beat, n.beats])).toEqual([[60, 0, 1], [64, 1, 2], [67, 3, 0.5]]);
  });
  it('makes a single violin-range melody line', () => {
    const raw = [
      { midi: 40, beat: 0, beats: 2, part: 0, staff: 1, voice: '1' },
      { midi: 43, beat: 0, beats: 1, part: 0, staff: 1, voice: '1' },
      { midi: 45, beat: 1, beats: 1, part: 0, staff: 1, voice: '1' },
    ];
    const m = melodyLine(raw);
    expect(m.map((n) => n.midi)).toEqual([55, 57]);
    expect(m[0].beats).toBe(1);
  });
});

import { type FingerNote, assignFingers } from '../piano/fingering';
import { PIANO_SONGS } from '../piano/songs';
describe('fingering', () => {
  it('five-finger position for a C-D-E-F-G run, thumb on C', () => {
    const ns: FingerNote[] = [60, 62, 64, 65, 67].map((m, i) => ({ midi: m, beat: i, left: false }));
    assignFingers(ns);
    expect(ns.map((n) => n.finger)).toEqual([1, 2, 3, 4, 5]);
  });
  it('left hand counts from the pinky', () => {
    const ns: FingerNote[] = [48, 50, 52, 53, 55].map((m, i) => ({ midi: m, beat: i, left: true }));
    assignFingers(ns);
    expect(ns.map((n) => n.finger)).toEqual([5, 4, 3, 2, 1]);
  });
  it('gives every note in every song a finger 1..5', () => {
    for (const s of PIANO_SONGS) {
      const ns: FingerNote[] = s.notes.map((n) => ({ midi: n.midi!, beat: n.beat, left: !!n.tag?.includes('L') }));
      assignFingers(ns);
      for (const n of ns) expect(n.finger! >= 1 && n.finger! <= 5).toBe(true);
    }
  });
});
