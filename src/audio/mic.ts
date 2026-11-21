// Shared microphone engine. One getUserMedia stream + analyser for the whole
// app; components subscribe to pitch frames.

import { PitchDetector } from './pitch';
import { freqToMidiFloat } from './notes';

export interface PitchFrame {
  t: number; // performance.now() ms
  freq: number; // Hz (0 = none)
  midi: number; // fractional midi (NaN when no pitch)
  clarity: number;
  rms: number;
  /** Smoothed loudness envelope (slow). */
  level: number;
  /** True on the frame where a new attack (key press / bow change) was detected. */
  onset: boolean;
}

type Listener = (f: PitchFrame) => void;

class MicEngine {
  ctx: AudioContext | null = null;
  stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> = new Float32Array(2048);
  private detector: PitchDetector | null = null;
  private listeners = new Set<Listener>();
  private raf = 0;
  private lastAnalysis = 0;
  private slowLevel = 0;
  private fastPrev = 0;
  private lastOnset = 0;
  private starting: Promise<void> | null = null;
  status: 'idle' | 'starting' | 'running' | 'denied' | 'error' = 'idle';
  error = '';
  private statusListeners = new Set<() => void>();
  /** Minimum clarity required to report a pitch. */
  clarityGate = 0.8;

  onStatus(cb: () => void) {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }
  private setStatus(s: MicEngine['status'], err = '') {
    this.status = s;
    this.error = err;
    this.statusListeners.forEach((l) => l());
  }

  /** Must be called from a user gesture on iOS. */
  start(): Promise<void> {
    if (this.status === 'running') {
      this.ctx?.resume();
      return Promise.resolve();
    }
    if (this.starting) return this.starting;
    this.setStatus('starting');
    this.starting = (async () => {
      try {
        const ctx = getAudioContext();
        await ctx.resume();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
        src.connect(analyser);
        this.ctx = ctx;
        this.stream = stream;
        this.analyser = analyser;
        this.buf = new Float32Array(analyser.fftSize);
        this.detector = new PitchDetector(analyser.fftSize, ctx.sampleRate, 60, 2100);
        this.setStatus('running');
        this.loop();
      } catch (e) {
        const err = e as DOMException;
        if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
          this.setStatus('denied', 'Microphone permission was blocked.');
        } else {
          this.setStatus('error', String(err?.message ?? e));
        }
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    // ~45 analyses per second keeps the CPU cool on iPads.
    if (now - this.lastAnalysis < 22) return;
    this.lastAnalysis = now;
    if (!this.analyser || !this.detector) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const r = this.detector.detect(this.buf);
    const rms = r.rms;
    this.slowLevel = this.slowLevel * 0.9 + rms * 0.1;
    // Onset: fast rise relative to the recent floor.
    const rising = rms > this.fastPrev * 1.6 && rms > 0.012;
    const jump = rms > this.slowLevel * 2.2 && rms > 0.015;
    let onset = false;
    if ((rising || jump) && now - this.lastOnset > 110) {
      onset = true;
      this.lastOnset = now;
    }
    this.fastPrev = rms * 0.6 + this.fastPrev * 0.4;
    const hasPitch = r.freq > 0 && r.clarity >= this.clarityGate;
    const frame: PitchFrame = {
      t: now,
      freq: hasPitch ? r.freq : 0,
      midi: hasPitch ? freqToMidiFloat(r.freq) : NaN,
      clarity: r.clarity,
      rms,
      level: this.slowLevel,
      onset,
    };
    this.listeners.forEach((l) => l(frame));
  };

  stop() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.setStatus('idle');
  }
}

let sharedCtx: AudioContext | null = null;
export function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctor({ latencyHint: 'interactive' });
  }
  return sharedCtx;
}

export const mic = new MicEngine();
