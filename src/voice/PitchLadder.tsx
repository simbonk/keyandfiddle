import { useRef } from 'react';
import { usePitchListener } from '../audio/hooks';
import { isBlackKey, midiName } from '../audio/notes';
import { useAnimationCanvas } from '../ui/useAnimationCanvas';
import { foldToTarget } from './voice';

export interface LadderTarget {
  midi: number;
  tol: number; // cents
  label?: string;
}

/**
 * A vertical note ladder with your singing drawn as a glowing line scrolling
 * to the left. The target note is a bright band. Low notes at the bottom.
 */
export function PitchLadder({
  lo,
  hi,
  target,
  fold = true,
  height = 'min(52dvh, 420px)',
}: {
  lo: number;
  hi: number;
  target: LadderTarget | null;
  fold?: boolean;
  height?: string;
}) {
  const trail = useRef<{ t: number; m: number | null }[]>([]);
  usePitchListener((f) => {
    let m: number | null = f.freq && f.rms > 0.004 ? f.midi : null;
    if (m !== null && fold && target) m = foldToTarget(m, target.midi);
    trail.current.push({ t: f.t, m });
    while (trail.current.length && trail.current[0].t < f.t - 5000) trail.current.shift();
  });

  const canvasRef = useAnimationCanvas((ctx, w, h, now) => {
    ctx.clearRect(0, 0, w, h);
    const top = hi + 2;
    const bot = lo - 2;
    const y = (m: number) => ((top - m) / (top - bot)) * h;
    const labelW = 46;
    // note lines
    ctx.font = '700 12px "Baloo 2", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let m = Math.ceil(bot); m <= top; m++) {
      const yy = y(m);
      const black = isBlackKey(m);
      ctx.fillStyle = black ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)';
      ctx.fillRect(labelW, yy - 0.5, w - labelW, 1);
      if (!black) {
        ctx.fillStyle = m % 12 === 0 ? '#ffcf33' : 'rgba(255,255,255,0.55)';
        ctx.textAlign = 'left';
        ctx.fillText(midiName(m), 6, yy);
      }
    }
    // target band
    if (target) {
      const band = Math.max(4, (target.tol / 100) * (h / (top - bot)) * 2);
      const ty = y(target.midi);
      ctx.fillStyle = 'rgba(82,210,115,0.22)';
      ctx.fillRect(labelW, ty - band / 2, w - labelW, band);
      ctx.fillStyle = '#52d273';
      ctx.fillRect(labelW, ty - 1.5, w - labelW, 3);
      ctx.textAlign = 'right';
      ctx.font = '800 18px "Baloo 2", system-ui, sans-serif';
      ctx.fillText(target.label ?? midiName(target.midi), w - 10, ty - band / 2 - 12);
    }
    // the singing line (newest at the right edge)
    const span = 4000;
    const x = (t: number) => w - 30 - ((now - t) / span) * (w - labelW - 40);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let prev: { t: number; m: number | null } | null = null;
    for (const p of trail.current) {
      if (p.m !== null && prev && prev.m !== null && p.t - prev.t < 120 && Math.abs(p.m - prev.m) < 1.5) {
        const good = target && Math.abs((p.m - target.midi) * 100) <= target.tol;
        ctx.strokeStyle = good ? '#52d273' : '#ff9f1c';
        ctx.beginPath();
        ctx.moveTo(x(prev.t), y(prev.m));
        ctx.lineTo(x(p.t), y(p.m));
        ctx.stroke();
      }
      prev = p;
    }
    // current voice dot
    const last = trail.current[trail.current.length - 1];
    if (last && last.m !== null && now - last.t < 200) {
      const good = target && Math.abs((last.m - target.midi) * 100) <= target.tol;
      ctx.fillStyle = good ? '#52d273' : '#ff9f1c';
      ctx.beginPath();
      ctx.arc(x(last.t), y(last.m), 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x(last.t), y(last.m), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  return <canvas ref={canvasRef} className="ladder" style={{ height }} />;
}
