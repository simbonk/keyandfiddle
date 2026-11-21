// Physical model of a bowed violin string (digital waveguide with a
// stick-slip bow friction table), after Smith / STK's "Bowed" model with
// Esteban Maestre's violin body filter. Pure DSP, no Web Audio, so it runs
// in the AudioWorklet and in unit tests alike.
//
// The bow excites the string at a point between the bridge and the stopping
// finger. Bow speed sets loudness, bow pressure sets the friction curve, and
// because the string keeps ringing after the bow lifts, string crossings,
// bow changes and open strings sound like a real instrument.

class DelayL {
  private buf: Float32Array;
  private w = 0;
  private d = 10;
  last = 0;
  constructor(max: number) {
    this.buf = new Float32Array(Math.ceil(max) + 4);
  }
  setDelay(d: number) {
    this.d = Math.max(1, Math.min(this.buf.length - 2, d));
  }
  tick(x: number) {
    const n = this.buf.length;
    this.buf[this.w] = x;
    let r = this.w - this.d;
    if (r < 0) r += n;
    const i = Math.floor(r);
    const f = r - i;
    const a = this.buf[i];
    const b = this.buf[i + 1 === n ? 0 : i + 1];
    // reading "behind" the write head: interpolate between i and i+1
    this.last = a + (b - a) * f;
    this.w = this.w + 1 === n ? 0 : this.w + 1;
    return this.last;
  }
  clear() {
    this.buf.fill(0);
    this.last = 0;
  }
}

class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(
    private b0: number,
    private b1: number,
    private b2: number,
    private a1: number,
    private a2: number,
  ) {}
  tick(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** The violin body: a cascade of resonances (Maestre's fit, used by STK). */
export class ViolinBody {
  private f = [
    new Biquad(1.0, 1.5667, 0.3133, -0.5509, -0.3925),
    new Biquad(1.0, -1.9537, 0.9542, -1.6357, 0.8697),
    new Biquad(1.0, -1.6683, 0.8852, -1.7674, 0.8735),
    new Biquad(1.0, -1.8585, 0.9653, -1.8498, 0.9516),
    new Biquad(1.0, -1.9299, 0.9621, -1.9354, 0.959),
    new Biquad(1.0, -1.98, 0.9888, -1.9867, 0.9923),
  ];
  tick(x: number) {
    for (const b of this.f) x = b.tick(x);
    return 0.1248 * x;
  }
}

/** Fraction of the string between bridge and bow (the "contact point"). */
const BETA = 0.127;

export class BowedString {
  private neck: DelayL;
  private bridge: DelayL;
  private filtY = 0;
  private pole: number;
  private base = 100;
  private freq = 440;
  private targetFreq = 440;
  /** current bow velocity (smoothed) and its target */
  private v = 0;
  vTarget = 0;
  /** 0..1 bow pressure; friction slope 5 (light) .. 1 (heavy) like STK */
  pressure = 0.5;
  private slope = 3;
  bowing = false;
  /** vibrato depth in semitones and rate in Hz */
  vibDepth = 0;
  vibRate = 5.6;
  private vibPhase = 0;
  private noise = 12345;
  private lastOut = 0;

  constructor(private sr: number) {
    const max = sr / 50;
    this.neck = new DelayL(max);
    this.bridge = new DelayL(max * 0.5);
    this.pole = 0.75 - (0.2 * 22050) / sr;
    this.setFrequency(440, true);
  }

  setFrequency(f: number, now = false) {
    this.targetFreq = Math.max(60, Math.min(4000, f));
    if (now) {
      this.freq = this.targetFreq;
      this.applyDelay(0);
    }
  }

  private applyDelay(vib: number) {
    // -4 compensates the delay of the string loss filter and the bow junction
    this.base = this.sr / (this.freq * Math.pow(2, vib / 12)) - 3.6;
    this.bridge.setDelay(this.base * BETA);
    this.neck.setDelay(this.base * (1 - BETA));
  }

  /** Render one block, adding into `out`. */
  render(out: Float32Array, n = out.length) {
    const sr = this.sr;
    // glide pitch quickly (a finger landing, not a slide) and smooth the bow
    const kf = 1 - Math.exp(-n / (sr * 0.006));
    this.freq += (this.targetFreq - this.freq) * kf;
    // Schelleng: a faster bow needs more weight or the string jumps to a
    // harmonic. Kids just drag, so the "arm weight" follows bow speed, and
    // `pressure` only nudges it.
    const pEff = 0.3 + 3.5 * Math.abs(this.v) + (this.pressure - 0.5) * 0.2;
    this.slope = 5 - 4 * Math.max(0, Math.min(1, pEff));
    const kv = 1 - Math.exp(-1 / (sr * 0.012));
    const vibInc = (2 * Math.PI * this.vibRate) / sr;
    // a released string rings on; the bow on a still string damps it
    const loss = this.bowing ? 0.95 : 0.985;
    const b0 = (1 - this.pole) * loss;
    const a1 = -this.pole;
    const slope = this.slope;
    let v = this.v;
    const vt = this.bowing ? Math.max(-0.25, Math.min(0.25, this.vTarget)) : 0;
    for (let i = 0; i < n; i++) {
      if (this.vibDepth > 0 && (i & 15) === 0) {
        this.vibPhase += vibInc * 16;
        if (this.vibPhase > 2 * Math.PI) this.vibPhase -= 2 * Math.PI;
        this.applyDelay(this.vibDepth * Math.sin(this.vibPhase));
      } else if (i === 0 && this.vibDepth <= 0) this.applyDelay(0);
      v += (vt - v) * kv;
      // bow hair is not perfectly smooth: a whisper of rosin noise
      this.noise = (this.noise * 1664525 + 1013904223) >>> 0;
      const hair = v * (1 + ((this.noise / 4294967296) - 0.5) * 0.12);
      // string loss filter at the bridge (one-pole lowpass)
      this.filtY = b0 * this.bridge.last - a1 * this.filtY;
      const bridgeRefl = -this.filtY;
      const nutRefl = -this.neck.last;
      const stringV = bridgeRefl + nutRefl;
      let newV = 0;
      if (this.bowing) {
        const dv = hair - stringV;
        let s = Math.abs((dv + 0.001) * slope) + 0.75;
        s = Math.pow(s, -4);
        if (s < 0.01) s = 0.01;
        else if (s > 0.98) s = 0.98;
        newV = dv * s;
      }
      this.neck.tick(bridgeRefl + newV);
      this.bridge.tick(nutRefl + newV);
      out[i] += this.bridge.last;
    }
    this.v = v;
    this.lastOut = this.bridge.last;
    if (!Number.isFinite(this.lastOut)) this.reset();
  }

  reset() {
    this.neck.clear();
    this.bridge.clear();
    this.filtY = 0;
    this.v = 0;
  }
}

/** Four strings + one body, as the worklet runs it. */
export class ViolinModel {
  strings: BowedString[];
  body = new ViolinBody();
  private mix: Float32Array;
  gain = 1;
  constructor(sr: number) {
    this.strings = [0, 1, 2, 3].map(() => new BowedString(sr));
    this.mix = new Float32Array(128);
  }
  render(out: Float32Array) {
    const n = out.length;
    if (this.mix.length < n) this.mix = new Float32Array(n);
    const m = this.mix;
    m.fill(0, 0, n);
    for (const s of this.strings) s.render(m, n);
    for (let i = 0; i < n; i++) out[i] = this.body.tick(m[i]) * this.gain;
  }
}
