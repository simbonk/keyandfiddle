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
