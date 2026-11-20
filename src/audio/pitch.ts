// McLeod Pitch Method (MPM) pitch detector. Monophonic, robust for both
// piano (strong attack, inharmonic partials) and violin (rich harmonics).

export interface PitchResult {
  freq: number; // Hz, 0 when no pitch
  clarity: number; // 0..1, how periodic the signal is
  rms: number; // signal level, 0..1
}

export class PitchDetector {
  private nsdf: Float32Array;
  constructor(
    private size: number,
    private sampleRate: number,
    private minFreq = 50,
    private maxFreq = 2200,
  ) {
    this.nsdf = new Float32Array(size);
  }

  detect(buf: Float32Array): PitchResult {
    const n = Math.min(buf.length, this.size);
    let sumSq = 0;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += buf[i];
    mean /= n;
    for (let i = 0; i < n; i++) {
      const v = buf[i] - mean;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / n);
    if (rms < 0.004) return { freq: 0, clarity: 0, rms };

    const maxLag = Math.min(n - 1, Math.floor(this.sampleRate / this.minFreq));
    const minLag = Math.max(2, Math.floor(this.sampleRate / this.maxFreq));
    const nsdf = this.nsdf;

    // Normalised square difference function (time-domain; n is small enough).
    for (let tau = 0; tau <= maxLag; tau++) {
      let acf = 0;
      let m = 0;
      for (let i = 0; i < n - tau; i++) {
        const a = buf[i] - mean;
        const b = buf[i + tau] - mean;
        acf += a * b;
        m += a * a + b * b;
      }
      nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
    }

    // Peak picking: find key maxima between positive zero crossings.
    const peaks: number[] = [];
    let pos = 0;
    // skip the initial positive lobe
    while (pos < maxLag && nsdf[pos] > 0) pos++;
    while (pos < maxLag && nsdf[pos] <= 0) pos++;
    while (pos < maxLag) {
      let best = -1;
      let bestVal = -Infinity;
      while (pos < maxLag && nsdf[pos] > 0) {
        if (nsdf[pos] > bestVal) {
          bestVal = nsdf[pos];
          best = pos;
        }
        pos++;
      }
      if (best > 0 && best >= minLag) peaks.push(best);
      while (pos < maxLag && nsdf[pos] <= 0) pos++;
    }
    if (!peaks.length) return { freq: 0, clarity: 0, rms };

    let highest = 0;
    for (const p of peaks) highest = Math.max(highest, nsdf[p]);
    const threshold = 0.88 * highest;
    let chosen = peaks[0];
    for (const p of peaks) {
      if (nsdf[p] >= threshold) {
        chosen = p;
        break;
      }
    }

    // Parabolic interpolation around the chosen lag.
    const x0 = chosen > 0 ? nsdf[chosen - 1] : nsdf[chosen];
    const x1 = nsdf[chosen];
    const x2 = chosen + 1 <= maxLag ? nsdf[chosen + 1] : nsdf[chosen];
    const denom = x0 - 2 * x1 + x2;
    const shift = denom !== 0 ? (0.5 * (x0 - x2)) / denom : 0;
    const lag = chosen + shift;
    const clarity = Math.min(1, x1 - 0.25 * (x0 - x2) * shift);
    const freq = this.sampleRate / lag;
    if (freq < this.minFreq || freq > this.maxFreq) return { freq: 0, clarity: 0, rms };
    return { freq, clarity, rms };
  }
}
