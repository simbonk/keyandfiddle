// Two-track note highway for violin: string lanes (which string + which
// finger) on the left, a bow lane (which part of the bow + direction) on the
// right. Both tracks scroll toward the player in sync.

import { FINGER_COLORS, STRINGS, type ViolinNote } from './theory';

export interface VNoteState extends ViolinNote {
  state: 'pending' | 'hit';
  quality: 'good' | 'close' | null;
  holdFrac: number;
}

export interface VHighwayView {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  songBeat: number;
  visibleBeats: number;
  notes: VNoteState[];
  current: VNoteState | null;
  waiting: boolean;
  now: number;
  liveBowPos: number | null;
  liveBowDir: 'down' | 'up' | null;
  heardString: number | null;
}

const DOWN = '#ff9f1c';
const UP = '#2ec4f1';

export function drawViolinHighway(v: VHighwayView) {
  const { ctx, w, h } = v;
  ctx.clearRect(0, 0, w, h);
  const strikeY = h - 34;
  const horizonY = 16;
  const k = 2.6;
  const gap = Math.max(14, w * 0.04);
  const fz = { x: 8, w: (w - gap - 16) * 0.56 };
  const bz = { x: fz.x + fz.w + gap, w: (w - gap - 16) * 0.44 };

  const zoneProj = (zone: { x: number; w: number }) => (xNorm: number, beatsAhead: number) => {
    const d = Math.max(-0.1, beatsAhead / v.visibleBeats);
    const s = 1 / (1 + d * k);
    const cx = zone.x + zone.w / 2;
    return { x: cx + (zone.x + xNorm * zone.w - cx) * s, y: horizonY + (strikeY - horizonY) * s, s };
  };
  const pf = zoneProj(fz);
  const pb = zoneProj(bz);

  const floor = (proj: ReturnType<typeof zoneProj>, tint: string) => {
    const a = proj(0, 0);
    const b = proj(1, 0);
    const c = proj(1, v.visibleBeats);
    const d = proj(0, v.visibleBeats);
    const g = ctx.createLinearGradient(0, horizonY, 0, strikeY);
    g.addColorStop(0, 'rgba(20,12,60,0)');
    g.addColorStop(1, tint);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
  };
  floor(pf, 'rgba(60,40,140,0.6)');
  floor(pb, 'rgba(40,90,120,0.55)');

  // string lanes
  for (let s = 0; s < 4; s++) {
    const xn = (s + 0.5) / 4;
    const a = pf(xn, 0);
    const b = pf(xn, v.visibleBeats);
    const heard = v.heardString === s;
    ctx.strokeStyle = STRINGS[s].color;
    ctx.globalAlpha = heard ? 0.95 : 0.45;
    ctx.lineWidth = heard ? 4 : 2 + (3 - s) * 0.6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = STRINGS[s].color;
    ctx.font = '800 18px "Baloo 2", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(STRINGS[s].name, a.x, strikeY + 24);
  }
  // bow lane guide lines: frog, middle, tip
  for (const xn of [0, 0.5, 1]) {
    const a = pb(xn, 0);
    const b = pb(xn, v.visibleBeats);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '700 13px "Baloo 2", system-ui';
  ctx.textAlign = 'left';
  ctx.fillText('frog', bz.x, strikeY + 24);
  ctx.textAlign = 'center';
  ctx.fillText('middle', bz.x + bz.w / 2, strikeY + 24);
  ctx.textAlign = 'right';
  ctx.fillText('tip', bz.x + bz.w, strikeY + 24);

  // beat lines
  for (let b = Math.ceil(v.songBeat); b < v.songBeat + v.visibleBeats; b++) {
    for (const proj of [pf, pb]) {
      const l = proj(0, b - v.songBeat);
      const r = proj(1, b - v.songBeat);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
    }
  }

  // strike lines
  const pulse = v.waiting ? 0.5 + 0.4 * Math.sin(v.now / 150) : 0.6;
  ctx.fillStyle = v.waiting ? `rgba(255,214,10,${pulse})` : 'rgba(255,255,255,0.6)';
  ctx.fillRect(fz.x, strikeY - 2, fz.w, 4);
  ctx.fillRect(bz.x, strikeY - 2, bz.w, 4);

  const vis = v.notes
    .filter((n) => n.beat + n.beats > v.songBeat - 0.3 && n.beat < v.songBeat + v.visibleBeats)
    .sort((a, b) => b.beat - a.beat);

  for (const n of vis) {
    const isCur = v.current === n;
    let z0 = n.beat - v.songBeat;
    const z1 = n.beat + n.beats - v.songBeat - 0.05;
    if (n.state === 'hit') z0 = Math.max(0, z0);
    if (z1 <= z0) continue;
    const alpha = n.state === 'hit' ? 0.35 : 1;

    // --- finger gem on the string lane ---
    const xn = (n.fing.string + 0.5) / 4;
    const half = 0.085;
    const a = pf(xn - half, z0);
    const b = pf(xn + half, z0);
    const c = pf(xn + half, z1);
    const d = pf(xn - half, z1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = STRINGS[n.fing.string].color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fill();
    if (isCur) {
      // cheap glow (canvas shadowBlur is very slow in iPad Safari)
      const a0 = ctx.globalAlpha;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#fff';
      ctx.globalAlpha = a0 * 0.25;
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.globalAlpha = a0 * 0.55;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = a0;
    }
    // finger number badge at the near end
    const r = 15 * a.s + 4;
    const cx = (a.x + b.x) / 2;
    const cy = a.y - r * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = n.fing.finger === 0 ? '#10082a' : FINGER_COLORS[n.fing.finger];
    ctx.fill();
    ctx.lineWidth = 3 * a.s;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.fillStyle = n.fing.finger === 0 ? '#fff' : '#10082a';
    ctx.font = `800 ${Math.round(r * 1.2)}px "Baloo 2", system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.fing.finger === 0 ? 'O' : String(n.fing.finger), cx, cy + 1);
    ctx.textBaseline = 'alphabetic';

    // --- bow stroke band on the bow lane ---
    const lo = Math.min(n.bow.from, n.bow.to);
    const hi = Math.max(n.bow.from, n.bow.to);
    const ba = pb(lo, z0);
    const bb = pb(hi, z0);
    const bc = pb(hi, z1);
    const bd = pb(lo, z1);
    const col = n.bow.dir === 'down' ? DOWN : UP;
    ctx.fillStyle = col;
    ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath();
    ctx.moveTo(ba.x, ba.y);
    ctx.lineTo(bb.x, bb.y);
    ctx.lineTo(bc.x, bc.y);
    ctx.lineTo(bd.x, bd.y);
    ctx.closePath();
    ctx.fill();
    // chevrons showing travel direction along the bow
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#10082a';
    ctx.lineWidth = 3 * ba.s;
    const steps = 3;
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1);
      const p = { x: ba.x + (bb.x - ba.x) * t, y: (ba.y + bc.y) / 2 + (ba.y - bc.y) * 0.25 };
      const s = 7 * ba.s;
      const dir = n.bow.dir === 'down' ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(p.x - s * dir, p.y - s);
      ctx.lineTo(p.x + s * dir, p.y);
      ctx.lineTo(p.x - s * dir, p.y + s);
      ctx.stroke();
    }
    // label
    if (ba.s > 0.5) {
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${Math.round(14 * ba.s + 3)}px "Baloo 2", system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(n.bow.dir === 'down' ? '⊓ pull' : 'V push', (ba.x + bb.x) / 2, ba.y - 4 * ba.s);
    }
    // hold progress
    if (n.state === 'hit' && n.holdFrac > 0) {
      ctx.globalAlpha = 1;
      const pos = n.bow.from + (n.bow.to - n.bow.from) * Math.min(1, n.holdFrac);
      const pp = pb(pos, 0);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(pp.x, strikeY, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // live bow position from the camera
  if (v.liveBowPos !== null) {
    const p = pb(v.liveBowPos, 0);
    ctx.fillStyle = v.liveBowDir === 'down' ? DOWN : v.liveBowDir === 'up' ? UP : '#fff';
    ctx.beginPath();
    ctx.moveTo(p.x, strikeY - 14);
    ctx.lineTo(p.x - 9, strikeY - 30);
    ctx.lineTo(p.x + 9, strikeY - 30);
    ctx.closePath();
    ctx.fill();
  }
}
