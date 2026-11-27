// Touch guitar sound: Karplus-Strong plucked strings rendered once per note
// into small buffers, then played through a body/amp chain for the chosen
// guitar (acoustic, classical, electric, rock, banjo), or the child's own
// recorded sound (shared with the piano's "My sounds").
import { useSyncExternalStore } from 'react';
import { noteOn, type Voice } from '../audio/instruments';
import { getAudioContext } from '../audio/mic';
import { midiToFreq } from '../audio/notes';
import { out } from '../audio/output';
import { loadMySounds } from '../audio/sampler';

export type BuiltInGuitarVoice = 'acoustic' | 'classical' | 'electric' | 'rock' | 'banjo';
export type GuitarVoice = BuiltInGuitarVoice | `mine:${string}`;

export const GUITAR_VOICES: { id: BuiltInGuitarVoice; name: string; emoji: string }[] = [
  { id: 'acoustic', name: 'Acoustic', emoji: '🎸' },
  { id: 'classical', name: 'Classical (nylon)', emoji: '🌹' },
  { id: 'electric', name: 'Electric', emoji: '⚡' },
  { id: 'rock', name: 'Rock (distortion)', emoji: '🤘' },
  { id: 'banjo', name: 'Banjo', emoji: '🪕' },
];

interface Tone {
  /** 0 = soft thumb, 1 = sharp pick */
  bright: number;
  /** how long it rings (0-1) */
  sustain: number;
  seconds: number;
}
const TONES: Record<BuiltInGuitarVoice, Tone> = {
  acoustic: { bright: 0.55, sustain: 0.6, seconds: 3.2 },
  classical: { bright: 0.28, sustain: 0.45, seconds: 2.8 },
  electric: { bright: 0.6, sustain: 0.85, seconds: 4 },
  rock: { bright: 0.75, sustain: 0.95, seconds: 4 },
  banjo: { bright: 0.92, sustain: 0.05, seconds: 1.6 },
};

// ---------- which guitar (remembered on this device) ----------

const KEY = 'kf.gt.voice';
let current: GuitarVoice = (() => {
  try {
    const v = localStorage.getItem(KEY) as GuitarVoice | null;
    if (v && (v.startsWith('mine:') || v in TONES)) return v;
  } catch {
    /* private mode */
  }
  return 'acoustic';
})();
if (current.startsWith('mine:')) loadMySounds();
const subs = new Set<() => void>();
export function getGuitarVoice(): GuitarVoice {
  return current;
}
export function setGuitarVoice(v: GuitarVoice) {
  if (v === current) return;
  current = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* private mode */
  }
  if (v.startsWith('mine:')) loadMySounds();
  subs.forEach((s) => s());
}
function onVoice(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}
export function useGuitarVoice(): GuitarVoice {
  return useSyncExternalStore(onVoice, getGuitarVoice, getGuitarVoice);
}

// ---------- the plucked string ----------

/** Render one plucked note (exported for tests). */
export function renderPluck(freq: number, sr: number, seconds = 3.2, seed = 1, bright = 0.55, sustain = 0.6): Float32Array {
  const n = Math.floor(sr * seconds);
  const res = new Float32Array(n);
  const period = sr / freq;
  const N = Math.floor(period);
  const frac = period - N;
  // allpass tuning for the fractional part of the delay
  const c = (1 - frac) / (1 + frac);
  const line = new Float32Array(N + 1);
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return (s / 233280) * 2 - 1;
  };
  // the pluck: a noise burst, softened for a thumb or nylon string
  let lp = 0;
  const soft = 0.15 + 0.8 * bright;
  for (let i = 0; i <= N; i++) {
    lp += (rnd() - lp) * soft;
    line[i] = lp;
  }
  let mean = 0;
  for (let i = 0; i <= N; i++) mean += line[i];
  mean /= N + 1;
  for (let i = 0; i <= N; i++) line[i] -= mean;
  // low strings ring longer, like a real guitar
  const base = 0.985 + 0.0135 * sustain;
  const decay = Math.min(0.99965, base + (1 - base) * 0.5 * Math.min(1, 110 / freq));
  let idx = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < n; i++) {
    const a = line[idx];
    const nextIdx = idx + 1 > N ? 0 : idx + 1;
    const avg = decay * 0.5 * (a + line[nextIdx]);
    const y = c * avg + apX - c * apY;
    apX = avg;
    apY = y;
    line[idx] = y;
    idx = nextIdx;
    res[i] = a * 0.9 + prev * 0.1;
    prev = a;
  }
  const fade = Math.floor(sr * 0.25);
  for (let i = 0; i < fade; i++) res[n - 1 - i] *= i / fade;
  return res;
}

const cache = new Map<string, AudioBuffer>();
function bufferFor(midi: number, v: BuiltInGuitarVoice): AudioBuffer {
  const key = `${v}:${Math.round(midi * 10)}`;
  let b = cache.get(key);
  if (b) return b;
  const ctx = getAudioContext();
  const t = TONES[v];
  b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * t.seconds), ctx.sampleRate);
  const data = renderPluck(midiToFreq(midi), ctx.sampleRate, t.seconds, (Math.round(midi) % 17) + 3, t.bright, t.sustain);
  b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  cache.set(key, b);
  return b;
}

function driveCurve(k: number) {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

const buses = new Map<BuiltInGuitarVoice, AudioNode>();
/** Body, amp or speaker for each guitar. */
function bus(v: BuiltInGuitarVoice): AudioNode {
  const have = buses.get(v);
  if (have) return have;
  const ctx = getAudioContext();
  const f = (type: BiquadFilterType, freq: number, q = 0.7, gain = 0) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = freq;
    b.Q.value = q;
    b.gain.value = gain;
    return b;
  };
  const chain: AudioNode[] = [];
  let level = 1.4;
  if (v === 'acoustic') chain.push(f('highpass', 70), f('peaking', 110, 1.2, 5), f('peaking', 2500, 0.8, 2), f('lowpass', 6000));
  else if (v === 'classical') chain.push(f('highpass', 70), f('peaking', 100, 1, 6), f('lowpass', 3200));
  else if (v === 'banjo') chain.push(f('highpass', 180), f('peaking', 1100, 1.4, 7), f('lowpass', 7000));
  else if (v === 'electric') {
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(1.6);
    chain.push(f('highpass', 80), ws, f('peaking', 900, 0.8, 3), f('lowpass', 4500));
  } else {
    const pre = ctx.createGain();
    pre.gain.value = 6;
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(8);
    ws.oversample = '2x';
    chain.push(f('highpass', 120), pre, ws, f('peaking', 800, 0.7, 4), f('lowpass', 3000), f('lowpass', 5000));
    level = 0.45;
  }
  const g = ctx.createGain();
  g.gain.value = level;
  chain.push(g);
  for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  g.connect(out());
  buses.set(v, chain[0]);
  return chain[0];
}

/** What is ringing on each string, so a new pluck stops the old note. */
const ringing: (Voice | null)[] = [null, null, null, null, null, null];

export function unlockGuitar() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
}

/** Pluck string `i` at `midi`. `delay` in seconds (for strums). */
export function pluck(i: number, midi: number, vel = 0.8, delay = 0, voice: GuitarVoice = current) {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime + delay;
  damp(i, t);
  if (voice.startsWith('mine:')) {
    ringing[i] = noteOn(midi, vel, t, voice as `mine:${string}`);
    return;
  }
  const v = voice as BuiltInGuitarVoice;
  const src = ctx.createBufferSource();
  src.buffer = bufferFor(midi, v);
  const g = ctx.createGain();
  g.gain.value = 0.25 + 0.55 * vel;
  src.connect(g).connect(bus(v));
  src.start(t);
  let dead = false;
  const r: Voice = {
    release: () => undefined,
    kill: () => {
      if (dead) return;
      dead = true;
      const now = Math.max(t, ctx.currentTime);
      try {
        g.gain.setTargetAtTime(0, now, 0.02);
        src.stop(now + 0.15);
      } catch {
        /* already stopped */
      }
    },
  };
  ringing[i] = r;
  src.onended = () => {
    dead = true;
    if (ringing[i] === r) ringing[i] = null;
  };
}

/** Stop string `i` (a new note on the same string). */
export function damp(i: number, at?: number) {
  const r = ringing[i];
  if (!r) return;
  void at;
  r.kill();
  ringing[i] = null;
}

export function silenceGuitar() {
  for (let i = 0; i < ringing.length; i++) damp(i);
}

/** Strum a chord (null strings are skipped), low to high for a down strum, ~18 ms apart. */
export function strum(midis: (number | null)[], vel = 0.8, down = true) {
  const order = midis.map((m, i) => [m, i] as const).filter(([m]) => m !== null);
  if (!down) order.reverse();
  order.forEach(([m, i], k) => pluck(i, m!, vel, k * 0.018));
}

/** A G chord, to hear a guitar sound when you pick it. */
export function previewGuitar(v: GuitarVoice = current) {
  unlockGuitar();
  [43, 47, 50, 55, 59, 67].forEach((m, i) => pluck(i, m, 0.75, i * 0.03, v));
}
