// Small WebAudio synth for reference tones, on-screen keys and replays.
import { getAudioContext } from './mic';
import { midiToFreq } from './notes';
import { out } from './output';
import { noteOn } from './instruments';

/**
 * piano = the sampled grand (for tuning and reference tones),
 * keys = whichever keyboard sound the child picked (grand, organ, their own sneeze...),
 * synthPiano = the old built-in tone, used while samples load.
 */
export type Timbre = 'piano' | 'keys' | 'synthPiano' | 'violin' | 'beep';

/** Play a note now (or at `when` seconds on the audio clock). Returns stop fn. */
export function playNote(
  midiOrFreq: number,
  duration = 0.8,
  velocity = 0.8,
  timbre: Timbre = 'piano',
  when?: number,
  isFreq = false,
): () => void {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const t0 = when ?? ctx.currentTime;
  if ((timbre === 'piano' || timbre === 'keys') && !isFreq) {
    const v = noteOn(midiOrFreq, velocity, t0, timbre === 'piano' ? 'grand' : undefined);
    v.release(t0 + duration);
    return () => v.kill();
  }
  if (timbre === 'piano' || timbre === 'keys') timbre = 'synthPiano';
  const f = isFreq ? midiOrFreq : midiToFreq(midiOrFreq);
  const g = ctx.createGain();
  g.connect(out());
  const nodes: AudioScheduledSourceNode[] = [];

  if (timbre === 'synthPiano') {
    const partials = [1, 2, 3, 4, 5];
    const amps = [1, 0.45, 0.22, 0.12, 0.06];
    partials.forEach((p, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * p * (1 + 0.0004 * p * p); // slight inharmonicity
      const pg = ctx.createGain();
      pg.gain.value = amps[i];
      o.connect(pg).connect(g);
      nodes.push(o);
    });
    const peak = 0.25 * velocity;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t0 + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + Math.max(0.5, duration) + 0.6);
  } else if (timbre === 'violin') {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibGain = ctx.createGain();
    vibGain.gain.setValueAtTime(0, t0);
    vibGain.gain.linearRampToValueAtTime(f * 0.006, t0 + 0.35);
    vib.connect(vibGain).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(6000, f * 6);
    lp.Q.value = 1.2;
    o.connect(lp).connect(g);
    nodes.push(o, vib);
    const peak = 0.18 * velocity;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.08);
    g.gain.setValueAtTime(peak, t0 + Math.max(0.1, duration - 0.08));
    g.gain.linearRampToValueAtTime(0, t0 + duration + 0.05);
  } else {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(g);
    nodes.push(o);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.2 * velocity, t0 + 0.01);
    g.gain.setValueAtTime(0.2 * velocity, t0 + duration - 0.03);
    g.gain.linearRampToValueAtTime(0, t0 + duration);
  }
  const end = t0 + duration + 1.2;
  nodes.forEach((n) => {
    n.start(t0);
    n.stop(end);
  });
  return () => {
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + 0.05);
    nodes.forEach((n) => {
      try {
        n.stop(now + 0.06);
      } catch {
        /* already stopped */
      }
    });
  };
}

/** Short "ding" for success feedback. */
export function ding(good = true) {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  playNote(good ? 88 : 60, 0.12, 0.25, 'beep', t);
  if (good) playNote(93, 0.15, 0.2, 'beep', t + 0.08);
}
