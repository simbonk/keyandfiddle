// Touch guitar sound: Karplus-Strong plucked strings rendered once per note
// into small buffers, then played through a warm body filter and a little room.
import { getAudioContext } from '../audio/mic';
import { midiToFreq } from '../audio/notes';
import { out } from '../audio/output';

const SECONDS = 3.2;
const cache = new Map<number, AudioBuffer>();

/** Render one plucked note (exported for tests). */
export function renderPluck(freq: number, sr: number, seconds = SECONDS, seed = 1): Float32Array {
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  const period = sr / freq;
  const N = Math.floor(period);
  const frac = period - N;
  // allpass tuning for the fractional part of the delay
  const c = (1 - frac) / (1 + frac);
  const line = new Float32Array(N + 1);
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 * 2 - 1;
  };
  // pick a bit away from the bridge: a softened noise burst
  let lp = 0;
  for (let i = 0; i <= N; i++) {
    lp += (rnd() - lp) * 0.55;
    line[i] = lp;
  }
  let mean = 0;
  for (let i = 0; i <= N; i++) mean += line[i];
  mean /= N + 1;
  for (let i = 0; i <= N; i++) line[i] -= mean;
  // longer sustain for low strings, like a real guitar
  const decay = Math.min(0.9985, 0.993 + 0.0055 * Math.min(1, 110 / freq));
  let idx = 0;
  let prev = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < n; i++) {
    const a = line[idx];
    const nextIdx = idx + 1 > N ? 0 : idx + 1;
    const b = line[nextIdx];
    const avg = decay * 0.5 * (a + b);
    // fractional delay
    const y = c * avg + apX - c * apY;
    apX = avg;
    apY = y;
    line[idx] = y;
    idx = nextIdx;
    out[i] = a * 0.9 + prev * 0.1;
    prev = a;
  }
  // gentle fade at the end
  const fade = Math.floor(sr * 0.25);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return out;
}

function bufferFor(midi: number): AudioBuffer {
  const key = Math.round(midi * 10);
  let b = cache.get(key);
  if (b) return b;
  const ctx = getAudioContext();
  b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * SECONDS), ctx.sampleRate);
  b.copyToChannel(renderPluck(midiToFreq(midi), ctx.sampleRate, SECONDS, (key % 17) + 3) as Float32Array<ArrayBuffer>, 0);
  cache.set(key, b);
  return b;
}

let body: AudioNode | null = null;
function bus(): AudioNode {
  if (body) return body;
  const ctx = getAudioContext();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 70;
  const res = ctx.createBiquadFilter();
  res.type = 'peaking';
  res.frequency.value = 110;
  res.Q.value = 1.2;
  res.gain.value = 5;
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = 5200;
  const g = ctx.createGain();
  g.gain.value = 1.4;
  hp.connect(res).connect(top).connect(g).connect(out());
  body = hp;
  return body;
}

/** What is ringing on each string, so a new pluck (or a fret change) stops the old note. */
const ringing: ({ src: AudioBufferSourceNode; g: GainNode } | null)[] = [null, null, null, null, null, null];

export function unlockGuitar() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
}

/** Pluck string `i` at `midi`. `delay` in seconds (for strums). */
export function pluck(i: number, midi: number, vel = 0.8, delay = 0) {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime + delay;
  damp(i, t);
  const src = ctx.createBufferSource();
  src.buffer = bufferFor(midi);
  const g = ctx.createGain();
  g.gain.value = 0.25 + 0.55 * vel;
  src.connect(g).connect(bus());
  src.start(t);
  const r = { src, g };
  ringing[i] = r;
  src.onended = () => {
    if (ringing[i] === r) ringing[i] = null;
  };
}

/** Stop string `i` (a finger lifted or a new note on the same string). */
export function damp(i: number, at?: number) {
  const r = ringing[i];
  if (!r) return;
  const ctx = getAudioContext();
  const t = at ?? ctx.currentTime;
  try {
    r.g.gain.setTargetAtTime(0, t, 0.02);
    r.src.stop(t + 0.15);
  } catch {
    /* already stopped */
  }
  ringing[i] = null;
}

export function silenceGuitar() {
  for (let i = 0; i < ringing.length; i++) damp(i);
}

/** Strum a chord (null strings are skipped), low to high, ~18 ms apart. */
export function strum(midis: (number | null)[], vel = 0.8, down = true) {
  const order = midis.map((m, i) => [m, i] as const).filter(([m]) => m !== null);
  if (!down) order.reverse();
  order.forEach(([m, i], k) => pluck(i, m!, vel, k * 0.018));
}
