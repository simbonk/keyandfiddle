// Time-stretching (WSOLA: waveform-similarity overlap-add). Used to pitch a
// recorded sound up or down without changing how long it lasts: stretch it by
// the pitch ratio, then play it back that much faster (or slower).

/** Return `x` made `factor` times longer (factor > 1) or shorter, at the same pitch. */
export function stretch(x: Float32Array, factor: number, sampleRate: number): Float32Array {
  if (Math.abs(factor - 1) < 1e-3) return x.slice();
  // ~40 ms frames suit voices and claps; search ±10 ms for the best-matching splice
  const N = pow2(Math.round(sampleRate * 0.04));
  const Hs = N >> 1; // synthesis hop
  const Ha = Hs / factor; // analysis hop
  const tol = Math.round(sampleRate * 0.01);
  const outLen = Math.max(N, Math.ceil(x.length * factor));
  const out = new Float32Array(outLen + N);
  const norm = new Float32Array(outLen + N);
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const at = (i: number) => (i >= 0 && i < x.length ? x[i] : 0);

  let prev = 0; // analysis position actually used for the previous frame
  for (let k = 0; k * Hs < outLen; k++) {
    const nominal = Math.round(k * Ha);
    let best = nominal;
    if (k > 0) {
      // the natural continuation of the previous frame
      const want = prev + Hs;
      const score = (p: number, step: number) => {
        let s = 0;
        for (let i = 0; i < Hs; i += step) s += at(want + i) * at(p + i);
        return s;
      };
      // coarse search, then refine around the winner
      let bestScore = -Infinity;
      const lo = Math.max(-tol, -nominal);
      for (let d = lo; d <= tol; d += 4) {
        const sc = score(nominal + d, 8);
        if (sc > bestScore) {
          bestScore = sc;
          best = nominal + d;
        }
      }
      const c = best;
      bestScore = -Infinity;
      for (let p = Math.max(0, c - 3); p <= c + 3; p++) {
        const sc = score(p, 2);
        if (sc > bestScore) {
          bestScore = sc;
          best = p;
        }
      }
    }
    prev = best;
    const o = k * Hs;
    for (let i = 0; i < N; i++) {
      out[o + i] += at(best + i) * win[i];
      norm[o + i] += win[i];
    }
  }
  const y = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) y[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
  return y;
}

function pow2(n: number): number {
  let p = 256;
  while (p < n) p <<= 1;
  return p;
}
