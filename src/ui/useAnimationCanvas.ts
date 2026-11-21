import { useEffect, useRef } from 'react';

/**
 * Sizes a canvas to its CSS box (with devicePixelRatio) and calls `draw`
 * every animation frame. `draw` is read through a ref so it can close over
 * fresh state without restarting the loop.
 */
export function useAnimationCanvas(
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, now: number, dt: number) => void,
  active = true,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let cw = 0;
    let ch = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const rect = canvas.getBoundingClientRect();
      // keep the backing store under ~2.5M pixels so big iPads stay smooth
      let dpr = Math.min(window.devicePixelRatio || 1, 2);
      const area = rect.width * rect.height;
      if (area > 0) dpr = Math.max(1, Math.min(dpr, Math.sqrt(2_500_000 / area)));
      if (rect.width !== cw || rect.height !== ch) {
        cw = rect.width;
        ch = rect.height;
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      drawRef.current(ctx, cw, ch, now, dt);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return canvasRef;
}
