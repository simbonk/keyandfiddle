// Keyboard sounds: a sampled grand piano, a few synthesised keyboards, and
// the child's own recorded sounds. Every note is a "voice" that sounds until
// it is released (key lifted), like a real keyboard.
import { useSyncExternalStore } from 'react';
import { getAudioContext } from './mic';
import { midiToFreq } from './notes';
import { out } from './output';
import { loadMySounds, mySoundBuffer } from './sampler';
import { playNote } from './synth';

export type BuiltInSound = 'grand' | 'epiano' | 'organ' | 'synth' | 'chip' | 'musicbox';
/** A built-in sound, or `mine:<id>` for a recorded one. */
export type SoundId = BuiltInSound | `mine:${string}`;

export interface SoundInfo {
  id: BuiltInSound;
  name: string;
  emoji: string;
}

export const SOUNDS: SoundInfo[] = [
  { id: 'grand', name: 'Grand piano', emoji: '🎹' },
  { id: 'epiano', name: 'Dreamy keys', emoji: '✨' },
  { id: 'organ', name: 'Organ', emoji: '⛪' },
  { id: 'synth', name: 'Space synth', emoji: '🚀' },
  { id: 'chip', name: '8-bit robot', emoji: '🤖' },
  { id: 'musicbox', name: 'Music box', emoji: '🎁' },
];

// ---------- which sound is selected (remembered on this device) ----------

const KEY = 'kf.sound';
let current: SoundId = (() => {
  try {
    return (localStorage.getItem(KEY) as SoundId) || 'grand';
  } catch {
    return 'grand';
  }
})();
if (current.startsWith('mine:')) loadMySounds();
const subs = new Set<() => void>();

export function getSound(): SoundId {
  return current;
}
export function setSound(id: SoundId) {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode */
  }
  subs.forEach((s) => s());
}
export function useKeyboardSound(): SoundId {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    getSound,
    getSound,
  );
}

// ---------- voices ----------

export interface Voice {
  /** Let go of the key now, or at `at` seconds on the audio clock. */
  release(at?: number): void;
}

type Param = AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };

function voice(env: GainNode, nodes: AudioScheduledSourceNode[], t0: number, releaseTau: number, maxLen: number): Voice {
  const ctx = getAudioContext();
  const stopAll = (t: number) =>
    nodes.forEach((n) => {
      try {
        n.stop(t);
      } catch {
        /* already stopped */
      }
    });
  nodes.forEach((n) => n.start(t0));
  stopAll(t0 + maxLen);
  let releasedAt = Infinity;
  return {
    release(at?: number) {
      const t = Math.max(at ?? ctx.currentTime, t0 + 0.01, ctx.currentTime);
      if (t >= releasedAt) return;
      releasedAt = t;
      const p = env.gain as Param;
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
      else {
        p.cancelScheduledValues(t);
        if (t <= ctx.currentTime + 0.001) p.setValueAtTime(p.value, t);
      }
      p.setTargetAtTime(0, t, releaseTau);
      stopAll(t + releaseTau * 7);
    },
  };
}

/** Start a note with the selected keyboard sound (or `sound`). */
export function noteOn(midi: number, velocity = 0.8, when?: number, sound: SoundId = current): Voice {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const t0 = when ?? ctx.currentTime;
  const v = Math.max(0.05, Math.min(1, velocity));
  if (sound.startsWith('mine:')) return mine(sound.slice(5), midi, v, t0);
  switch (sound) {
    case 'epiano':
      return epiano(midi, v, t0);
    case 'organ':
      return organ(midi, t0);
    case 'synth':
      return synth(midi, v, t0);
    case 'chip':
      return chip(midi, v, t0);
    case 'musicbox':
      return musicBox(midi, v, t0);
    default:
      return grand(midi, v, t0);
  }
}

function envGain(): GainNode {
  const g = getAudioContext().createGain();
  g.gain.value = 0;
  g.connect(out());
  return g;
}
function osc(type: OscillatorType, freq: number): OscillatorNode {
  const o = getAudioContext().createOscillator();
  o.type = type;
  o.frequency.value = freq;
  return o;
}
function gain(value: number): GainNode {
  const g = getAudioContext().createGain();
  g.gain.value = value;
  return g;
}

// ---------- grand piano: Salamander Grand Piano samples (CC-BY 3.0, Alexander Holm) ----------
// Four samples per octave (C, D#, F#, A), each loaded only when a nearby key is first needed.

const SAMPLE_NAMES = ['C', 'Ds', 'Fs', 'A'];
const SAMPLE_LO = 24; // C1
const SAMPLE_HI = 108; // C8
interface PianoSample {
  buf: AudioBuffer;
  offset: number;
}
const pianoBufs = new Map<number, PianoSample>();
const pianoLoading = new Map<number, Promise<void>>();

function sampleRoot(midi: number): number {
  const m = Math.max(SAMPLE_LO, Math.min(SAMPLE_HI, midi));
  return Math.min(SAMPLE_HI, Math.round(m / 3) * 3);
}
function sampleUrl(root: number): string {
  const octave = Math.floor(root / 12) - 1;
  return `${import.meta.env.BASE_URL}samples/piano/${SAMPLE_NAMES[(root % 12) / 3]}${octave}.mp3`;
}
function loadPianoSample(root: number): Promise<void> {
  let p = pianoLoading.get(root);
  if (!p) {
    p = fetch(sampleUrl(root))
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      })
      .then((ab) => getAudioContext().decodeAudioData(ab))
      .then((buf) => {
        // skip the mp3 encoder's silent lead-in so keys respond instantly
        const d = buf.getChannelData(0);
        let i = 0;
        while (i < d.length && Math.abs(d[i]) < 0.004) i++;
        pianoBufs.set(root, { buf, offset: Math.max(0, i / buf.sampleRate - 0.001) });
      })
      .catch(() => {
        pianoLoading.delete(root);
      });
    pianoLoading.set(root, p);
  }
  return p;
}

/** Fetch what a sound needs for keys lo..hi ahead of time (only the grand piano needs files). */
export function preloadSound(sound: SoundId, lo = 48, hi = 84): Promise<void> {
  if (sound.startsWith('mine:')) return loadMySounds().then(() => undefined);
  if (sound !== 'grand') return Promise.resolve();
  const roots = new Set<number>();
  for (let m = lo; m <= hi; m++) roots.add(sampleRoot(m));
  return Promise.all([...roots].map(loadPianoSample)).then(() => undefined);
}

function grand(midi: number, v: number, t0: number): Voice {
  const root = sampleRoot(midi);
  const s = pianoBufs.get(root);
  if (!s) {
    loadPianoSample(root);
    // until the sample arrives, use the simple built-in tone
    const stop = playNote(midi, 4, v, 'synthPiano', t0);
    return { release: () => stop() };
  }
  const ctx = getAudioContext();
  const src = ctx.createBufferSource();
  src.buffer = s.buf;
  src.playbackRate.value = 2 ** ((midi - root) / 12);
  // soft notes are darker as well as quieter, like a real hammer
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1500 + 14000 * v * v;
  const g = envGain();
  g.gain.setValueAtTime(1.3 * v ** 1.2, t0);
  src.connect(lp).connect(g);
  const len = (s.buf.duration - s.offset) / src.playbackRate.value;
  const vc = voice(g, [], t0, 0.09, len);
  src.start(t0, s.offset);
  src.stop(t0 + len + 0.05);
  return {
    release(at?: number) {
      vc.release(at);
      const t = Math.max(at ?? ctx.currentTime, t0 + 0.01);
      try {
        src.stop(Math.min(t + 0.7, t0 + len + 0.05));
      } catch {
        /* already stopped */
      }
    },
  };
}

// ---------- electric piano: two-operator FM with a bell-like "tine" ----------

function epiano(midi: number, v: number, t0: number): Voice {
  const f = midiToFreq(midi);
  const c = osc('sine', f);
  const m1 = osc('sine', f);
  const m1g = gain(0);
  m1g.gain.setValueAtTime(f * (0.6 + 2.2 * v), t0);
  m1g.gain.setTargetAtTime(f * 0.25, t0, 0.35);
  m1.connect(m1g).connect(c.frequency);
  const nodes: AudioScheduledSourceNode[] = [c, m1];
  if (f * 14 < 16000) {
    const m2 = osc('sine', f * 14);
    const m2g = gain(0);
    m2g.gain.setValueAtTime(f * 1.4 * v, t0);
    m2g.gain.setTargetAtTime(0, t0, 0.025);
    m2.connect(m2g).connect(c.frequency);
    nodes.push(m2);
  }
  // gentle "suitcase" tremolo
  const trem = gain(0.85);
  const lfo = osc('sine', 4.6);
  const lfoG = gain(0.15);
  lfo.connect(lfoG).connect(trem.gain);
  nodes.push(lfo);
  const g = envGain();
  c.connect(trem).connect(g);
  const peak = 0.45 * v;
  const tau = Math.max(0.5, Math.min(2.4, 2.4 - (midi - 48) * 0.035));
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
  g.gain.setTargetAtTime(0, t0 + 0.004, tau);
  return voice(g, nodes, t0, 0.09, tau * 6);
}

// ---------- organ: drawbars plus a little Leslie wobble, sustains while held ----------

const DRAWBARS: [number, number][] = [
  [0.5, 0.55],
  [1, 1],
  [1.5, 0.45],
  [2, 0.6],
  [3, 0.3],
  [4, 0.3],
  [6, 0.12],
];
let clickBuf: AudioBuffer | null = null;

function organ(midi: number, t0: number): Voice {
  const ctx = getAudioContext();
  const f = midiToFreq(midi);
  const g = envGain();
  const sum = gain(0.11);
  sum.connect(g);
  const lfo = osc('sine', 6.3);
  const depth = gain(9); // cents
  lfo.connect(depth);
  const nodes: AudioScheduledSourceNode[] = [lfo];
  for (const [r, a] of DRAWBARS) {
    if (f * r > 12000) continue;
    const o = osc('sine', f * r);
    depth.connect(o.detune);
    o.connect(gain(a)).connect(sum);
    nodes.push(o);
  }
  // key click
  if (!clickBuf) {
    clickBuf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.012), ctx.sampleRate);
    const d = clickBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  }
  const click = ctx.createBufferSource();
  click.buffer = clickBuf;
  click.connect(gain(0.06)).connect(g);
  nodes.push(click);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(1, t0 + 0.008);
  return voice(g, nodes, t0, 0.035, 30);
}

// ---------- space synth: detuned saws through a resonant filter sweep ----------

function synth(midi: number, v: number, t0: number): Voice {
  const ctx = getAudioContext();
  const f = midiToFreq(midi);
  const a = osc('sawtooth', f);
  a.detune.value = -9;
  const b = osc('sawtooth', f);
  b.detune.value = 9;
  const sub = osc('square', f / 2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 7;
  lp.frequency.setValueAtTime(Math.min(16000, f * (4 + 12 * v)), t0);
  lp.frequency.setTargetAtTime(Math.min(12000, f * 2.5), t0 + 0.01, 0.25);
  a.connect(lp);
  b.connect(lp);
  sub.connect(gain(0.35)).connect(lp);
  const g = envGain();
  lp.connect(g);
  const peak = 0.11 + 0.06 * v;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  g.gain.setTargetAtTime(peak * 0.7, t0 + 0.012, 0.3);
  return voice(g, [a, b, sub], t0, 0.2, 30);
}

// ---------- 8-bit robot: square wave with a video-game "blip" on the attack ----------

function chip(midi: number, v: number, t0: number): Voice {
  const f = midiToFreq(midi);
  const o = osc('square', f * 2);
  o.frequency.setValueAtTime(f * 2, t0);
  o.frequency.setValueAtTime(f, t0 + 0.045);
  const vib = osc('sine', 6);
  const vibG = gain(0);
  vibG.gain.setValueAtTime(0, t0);
  vibG.gain.linearRampToValueAtTime(18, t0 + 0.45);
  vib.connect(vibG).connect(o.detune);
  const g = envGain();
  o.connect(g);
  const peak = 0.07 + 0.05 * v;
  g.gain.setValueAtTime(peak, t0);
  g.gain.setTargetAtTime(peak * 0.7, t0 + 0.05, 0.15);
  return voice(g, [o, vib], t0, 0.025, 30);
}

// ---------- music box: bright bell an octave up that keeps ringing after you let go ----------

function musicBox(midi: number, v: number, t0: number): Voice {
  const f = midiToFreq(midi) * 2;
  const g = envGain();
  const nodes: AudioScheduledSourceNode[] = [];
  for (const [r, a, tau] of [
    [1, 1, 1],
    [3, 0.18, 0.35],
    [5.4, 0.12, 0.15],
  ]) {
    if (f * r > 16000) continue;
    const o = osc('sine', f * r);
    const pg = gain(0);
    pg.gain.setValueAtTime(a, t0);
    pg.gain.setTargetAtTime(0, t0, tau);
    o.connect(pg).connect(g);
    nodes.push(o);
  }
  const tau = Math.max(0.35, 1.1 - (midi - 60) * 0.02);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.4 * v, t0 + 0.002);
  g.gain.setTargetAtTime(0, t0 + 0.002, tau);
  return voice(g, nodes, t0, tau * 0.6, tau * 6);
}

// ---------- the child's own sound, pitched up and down across the keys ----------

function mine(id: string, midi: number, v: number, t0: number): Voice {
  const s = mySoundBuffer(id);
  if (!s) return grand(midi, v, t0);
  const ctx = getAudioContext();
  const src = ctx.createBufferSource();
  src.buffer = s.buf;
  src.playbackRate.value = Math.max(0.0625, Math.min(16, 2 ** ((midi - s.root) / 12)));
  const g = envGain();
  src.connect(g);
  const peak = 0.35 + 0.35 * v;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.003);
  const len = s.buf.duration / src.playbackRate.value;
  return voice(g, [src], t0, 0.06, len + 0.02);
}
