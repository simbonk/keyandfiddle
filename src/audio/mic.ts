// Shared microphone engine. One getUserMedia stream + analyser for the whole
// app; components subscribe to pitch frames.

import { PitchDetector } from './pitch';
import { freqToMidiFloat } from './notes';

export interface PitchFrame {
  t: number; // performance.now() ms
  freq: number; // Hz (0 = none)
  midi: number; // fractional midi (NaN when no pitch)
  clarity: number;
  /** Pitch estimate even when the tone is not very clean (beating strings, noise); 0 = none. */
  rawFreq: number;
  rms: number;
  /** Smoothed loudness envelope (slow). */
  level: number;
  /** True on the frame where a new attack (key press / bow change) was detected. */
  onset: boolean;
}

type Listener = (f: PitchFrame) => void;

export class MicEngine {
  ctx: AudioContext | null = null;
  stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> = new Float32Array(2048);
  private detector: PitchDetector | null = null;
  private listeners = new Set<Listener>();
  private raf = 0;
  private slowLevel = 0;
  private fastPrev = 0;
  private lastOnset = 0;
  private noiseFloor = 0.002;
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

  /**
   * Attack detection that also works for a key struck again while it is still
   * ringing. Compares the newest half of the buffer (~21 ms, longer than the
   * 20 ms analysis tick so no attack slips between ticks) with the half before,
   * both in overall energy and in "brightness" (first-difference energy):
   * a hammer or bow change adds a burst of high frequencies even when the
   * overall level barely moves.
   */
  private detectOnset(now: number, rms: number): boolean {
    const b = this.buf;
    const n = b.length;
    const blk = n >> 1;
    const seg = (end: number) => {
      let e = 0;
      let hf = 0;
      for (let i = end - blk + 1; i < end; i++) {
        e += b[i] * b[i];
        const d = b[i] - b[i - 1];
        hf += d * d;
      }
      return { e: e / blk, hf: hf / blk };
    };
    const newest = seg(n);
    const before = seg(n - blk);
    // track the quiet-room level so thresholds adapt to the mic
    this.noiseFloor = Math.min(Math.max(this.noiseFloor * 1.0015, 0.0015), Math.max(rms, 0.0015));
    const floorE = Math.max(1.2e-4, (this.noiseFloor * 4) ** 2);
    const energyJump = newest.e > before.e * 1.7 && newest.e > floorE;
    const brightJump = newest.hf > before.hf * 2.4 && newest.e > floorE * 0.6;
    const rising = rms > this.fastPrev * 1.5 && rms > 0.01;
    this.fastPrev = rms * 0.6 + this.fastPrev * 0.4;
    if ((energyJump || brightJump || rising) && now - this.lastOnset > 90) {
      this.lastOnset = now;
      return true;
    }
    return false;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private loop = () => {
    // A timer rather than requestAnimationFrame: rAF gets throttled or skipped
    // while the page is busy drawing, which made notes register late on iPads.
    if (!this.raf) this.raf = window.setInterval(this.tick, 20);
  };

  private tick = () => {
    const now = performance.now();
    if (!this.analyser || !this.detector) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const r = this.detector.detect(this.buf);
    const rms = r.rms;
    this.slowLevel = this.slowLevel * 0.9 + rms * 0.1;
    const onset = this.detectOnset(now, rms);
    const hasPitch = r.freq > 0 && r.clarity >= this.clarityGate;
    const frame: PitchFrame = {
      t: now,
      freq: hasPitch ? r.freq : 0,
      midi: hasPitch ? freqToMidiFloat(r.freq) : NaN,
      clarity: r.clarity,
      rawFreq: r.freq,
      rms,
      level: this.slowLevel,
      onset,
    };
    this.listeners.forEach((l) => l(frame));
  };

  stop() {
    clearInterval(this.raf);
    this.raf = 0;
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
