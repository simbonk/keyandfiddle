// Guitar-Hero style 3D note highway for the piano, drawn on a 2D canvas with
// a simple perspective projection. Lanes line up with the keys underneath.

import type { KeyRect } from './Keyboard';

export interface HwNote {
  midi: number;
  beat: number;
  beats: number;
  left: boolean;
  dyn: 'p' | 'f' | null;
  state: 'pending' | 'hit' | 'missed';
  hitLevel: number; // 0..2 relative loudness when hit
  holdFrac: number; // 0..1 how much of the length was held
  finger?: number; // suggested finger, 1 = thumb
  handPos?: number;
}

export interface Burst {
  x: number;
  color: string;
  t0: number;
  power: number;
  text?: string;
}

// Rainbow per pitch class so kids can match colours to keys.
const PC_COLORS = ['#ff4d6d', '#ff4d6d', '#ff9f1c', '#ff9f1c', '#ffd60a', '#52d273', '#52d273', '#2ec4f1', '#2ec4f1', '#7b6cff', '#7b6cff', '#e056fd'];
export function noteColor(midi: number) {
  return PC_COLORS[((midi % 12) + 12) % 12];
}

export interface HighwayView {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  keys: KeyRect[];
  songBeat: number;
  visibleBeats: number;
  notes: HwNote[];
  current: HwNote | null;
  waiting: boolean;
  bursts: Burst[];
  now: number;
  showFingers?: boolean;
}

export function drawHighway(v: HighwayView) {
  const { ctx, w, h } = v;
  ctx.clearRect(0, 0, w, h);
  const strikeY = h - 8;
  const horizonY = h * 0.04;
  const k = 3.2; // perspective strength
  const cx = w / 2;
  const proj = (xNorm: number, beatsAhead: number) => {
    const d = Math.max(-0.08, beatsAhead / v.visibleBeats);
    const s = 1 / (1 + d * k);
    const y = horizonY + (strikeY - horizonY) * s;
    const x = cx + (xNorm * w - cx) * s;
    return { x, y, s };
  };

  // floor
  const g = ctx.createLinearGradient(0, horizonY, 0, strikeY);
  g.addColorStop(0, 'rgba(20,12,60,0)');
  g.addColorStop(1, 'rgba(60,40,140,0.55)');
  ctx.fillStyle = g;
  const fl = proj(0, v.visibleBeats);
  const fr = proj(1, v.visibleBeats);
  ctx.beginPath();
  ctx.moveTo(0, strikeY);
  ctx.lineTo(w, strikeY);
  ctx.lineTo(fr.x, fr.y);
  ctx.lineTo(fl.x, fl.y);
  ctx.closePath();
  ctx.fill();

  // lanes
  for (const key of v.keys) {
    if (key.black) continue;
    const a = proj(key.x, 0);
    const b = proj(key.x, v.visibleBeats);
    ctx.strokeStyle = key.midi % 12 === 0 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // beat lines
  const firstBeat = Math.ceil(v.songBeat);
  for (let b = firstBeat; b < v.songBeat + v.visibleBeats; b++) {
    const l = proj(0, b - v.songBeat);
    const r = proj(1, b - v.songBeat);
    ctx.strokeStyle = b % 4 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
  }

  // strike line
  ctx.fillStyle = v.waiting ? `rgba(255,214,10,${0.5 + 0.4 * Math.sin(v.now / 150)})` : 'rgba(255,255,255,0.6)';
  ctx.fillRect(0, strikeY - 2, w, 4);

  const keyByMidi = new Map(v.keys.map((kk) => [kk.midi, kk]));

  // notes, far to near so near ones paint on top
  const vis = v.notes
    .filter((n) => n.beat + n.beats > v.songBeat - 0.5 && n.beat < v.songBeat + v.visibleBeats)
    .sort((a, b) => b.beat - a.beat);
  for (const n of vis) {
    const key = keyByMidi.get(n.midi);
    if (!key) continue;
    const pad = key.w * 0.1;
    const x0 = key.x + pad;
    const x1 = key.x + key.w - pad;
    let z0 = n.beat - v.songBeat;
    const z1 = n.beat + n.beats - v.songBeat - 0.04;
    if (n.state === 'hit') z0 = Math.max(z0, 0);
    if (z1 <= z0) continue;
    const nl = proj(x0, z0);
    const nr = proj(x1, z0);
    const fl2 = proj(x0, z1);
    const fr2 = proj(x1, z1);
    const color = noteColor(n.midi);
    const isCur = v.current === n;
    let alpha = n.dyn === 'p' ? 0.55 : 1;
    if (n.state === 'missed') alpha = 0.25;
    if (n.state === 'hit') alpha = 0.35 + Math.min(0.65, n.hitLevel * 0.5);
    ctx.globalAlpha = alpha;
    // top face
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(nl.x, nl.y);
    ctx.lineTo(nr.x, nr.y);
    ctx.lineTo(fr2.x, fr2.y);
    ctx.lineTo(fl2.x, fl2.y);
    ctx.closePath();
    ctx.fill();
    if (n.dyn === 'f' || isCur) {
      // cheap glow: a soft wide outline (canvas shadowBlur is very slow in iPad Safari)
      const a0 = ctx.globalAlpha;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = isCur ? '#fff' : color;
      ctx.globalAlpha = a0 * 0.25;
      ctx.lineWidth = isCur ? 14 : 10;
      ctx.stroke();
      ctx.globalAlpha = a0 * 0.5;
      ctx.lineWidth = isCur ? 6 : 4;
      ctx.stroke();
      ctx.globalAlpha = a0;
    }
    // left hand notes get a striped look
    if (n.left) {
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2 * nl.s;
      ctx.setLineDash([6 * nl.s, 6 * nl.s]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // front face (thickness gives the 3D block look)
    const th = 12 * nl.s;
    ctx.fillStyle = shade(color, -0.35);
    ctx.fillRect(nl.x, nl.y, nr.x - nl.x, th);
    // hold progress
    if (n.state === 'hit' && n.holdFrac > 0) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(nl.x, nl.y + th - 3, (nr.x - nl.x) * Math.min(1, n.holdFrac), 3);
    }
    ctx.globalAlpha = 1;
    // label on the near face
    if (nl.s > 0.45 && n.state !== 'hit') {
      ctx.fillStyle = '#10082a';
      ctx.font = `800 ${Math.round(15 * nl.s + 4)}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const label = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n.midi % 12];
      ctx.fillText(label + (n.dyn === 'f' ? '!' : n.dyn === 'p' ? '·' : ''), (nl.x + nr.x) / 2, nl.y - 2);
      if (v.showFingers && n.finger) {
        // finger number in a little circle, higher up on the block
        const r = 7 * nl.s + 3;
        const fx = (nl.x + nr.x) / 2;
        const fy = nl.y - 2 - (15 * nl.s + 4) - r - 2;
        if (fy - r > fl2.y) {
          ctx.fillStyle = 'rgba(16,8,42,0.85)';
          ctx.beginPath();
          ctx.arc(fx, fy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `800 ${Math.round(r * 1.4)}px "Baloo 2", system-ui, sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.fillText(String(n.finger), fx, fy + 1);
        }
      }
    }
  }

  // hit bursts
  for (const b of v.bursts) {
    const age = (v.now - b.t0) / 600;
    if (age > 1) continue;
    const r = 20 + age * 60 * (0.6 + b.power);
    ctx.globalAlpha = (1 - age) * Math.min(1, 0.4 + b.power * 0.6);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 4 + b.power * 4;
    ctx.beginPath();
    ctx.arc(b.x * w, strikeY, r, Math.PI, 2 * Math.PI);
    ctx.stroke();
    if (b.text) {
      ctx.fillStyle = '#fff';
      ctx.font = `800 22px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(b.text, b.x * w, strikeY - 30 - age * 40);
    }
    ctx.globalAlpha = 1;
  }
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + c * amt)));
  const r = f(n >> 16);
  const gg = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${gg},${b})`;
}

export function laneCenter(keys: KeyRect[], midi: number) {
  const k = keys.find((kk) => kk.midi === midi);
  return k ? k.x + k.w / 2 : 0.5;
}

