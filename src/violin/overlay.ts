// Canvas drawing for the AR mirror: violin outline, finger targets, bows.
import { STRINGS, FINGER_COLORS, stopFraction, type BowStroke, type Fingering } from './theory';
import { type Analysis, type BowGeom, type ViolinGeom, MM, T_SOUND_IDEAL, add, idealBowDir, lerp, mul, stringPoint, sub, len } from './violinModel';
import type { Pt } from './tracking';

// [t along tail->nut, half width in mm] for the violin body outline
const OUTLINE: [number, number][] = [
  [0, 0],
  [0.01, 70],
  [0.06, 100],
  [0.14, 102],
  [0.22, 90],
  [0.3, 58],
  [0.36, 55],
  [0.42, 62],
  [0.52, 82],
  [0.6, 80],
  [0.66, 55],
  [0.68, 22],
];

function local(g: ViolinGeom, t: number, offMm: number): Pt {
  const base = lerp(g.tail, g.nut, t);
  return add(base, mul(g.n, offMm * g.pxPerMm));
}

export function drawViolin(ctx: CanvasRenderingContext2D, g: ViolinGeom, highlightString: number | null, now: number) {
  const ghost = g.source === 'ghost';
  ctx.save();
  if (ghost) ctx.setLineDash([8, 6]);
  // body
  ctx.beginPath();
  OUTLINE.forEach(([t, w], i) => {
    const p = local(g, t, w);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  for (let i = OUTLINE.length - 1; i >= 0; i--) {
    const [t, w] = OUTLINE[i];
    const p = local(g, t, -w);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = ghost ? 'rgba(255,214,10,0.10)' : 'rgba(200,105,43,0.22)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = ghost ? 'rgba(255,214,10,0.9)' : 'rgba(255,190,120,0.85)';
  ctx.stroke();

  // fingerboard
  const fbEnd = 1 - MM.fingerboard / MM.tailToNut;
  const quad = [local(g, 1, 12), local(g, 1, -12), local(g, fbEnd, -21), local(g, fbEnd, 21)];
  ctx.beginPath();
  quad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(20,20,20,0.45)';
  ctx.fill();

  // scroll
  ctx.beginPath();
  ctx.arc(g.scroll.x, g.scroll.y, 16 * g.pxPerMm, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // bridge
  const b1 = local(g, 1 - (MM.tailToNut - MM.tailToBridge) / MM.tailToNut, 26);
  const b2 = local(g, 1 - (MM.tailToNut - MM.tailToBridge) / MM.tailToNut, -26);
  ctx.strokeStyle = '#f2d7a8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(b1.x, b1.y);
  ctx.lineTo(b2.x, b2.y);
  ctx.stroke();

  // strings (nut -> a little past the bridge)
  for (let s = 0; s < 4; s++) {
    const a = stringPoint(g, s, 0);
    const b = stringPoint(g, s, 1.12);
    const hl = highlightString === s;
    ctx.strokeStyle = hl ? STRINGS[s].color : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = hl ? 3 + Math.sin(now / 60) * 0.8 : 1.2;
    if (hl) {
      ctx.shadowColor = STRINGS[s].color;
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // string letter by the scroll
    const lbl = add(stringPoint(g, s, -0.05), mul(g.n, (1.5 - s) * 4));
    ctx.fillStyle = STRINGS[s].color;
    ctx.font = '800 14px "Baloo 2", system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(STRINGS[s].name, lbl.x, lbl.y);
  }
  if (ghost) {
    const c = lerp(g.tail, g.nut, 0.5);
    ctx.fillStyle = 'rgba(255,214,10,0.95)';
    ctx.font = '800 18px "Baloo 2", system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('hold your violin here', c.x, c.y - 70 * g.pxPerMm);
  }
  ctx.restore();
}

/** Tape markers plus the glowing target for the current note. */
export function drawFingerTarget(ctx: CanvasRenderingContext2D, g: ViolinGeom, f: Fingering | null, now: number, fingertips: Pt[] | null) {
  // tapes like a beginner's violin: 1, high 2, 3
  for (const semis of [2, 4, 5]) {
    const a = stringPoint(g, 0, stopFraction(semis));
    const b = stringPoint(g, 3, stopFraction(semis));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (!f) return null;
  if (f.finger === 0) {
    const p = stringPoint(g, f.string, 0.25);
    bubble(ctx, p, '0', STRINGS[f.string].color, now, 'open');
    return null;
  }
  const p = stringPoint(g, f.string, stopFraction(f.semis));
  const r = 12 + Math.sin(now / 160) * 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = FINGER_COLORS[f.finger];
  ctx.shadowColor = FINGER_COLORS[f.finger];
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#10082a';
  ctx.font = '800 16px "Baloo 2", system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(f.finger), p.x, p.y + 1);
  // label off to the side
  const lp = add(p, mul(g.n, 34));
  ctx.fillStyle = '#fff';
  ctx.font = '700 14px "Baloo 2", system-ui';
  ctx.fillText(f.label, lp.x, lp.y);

  // is a fingertip near the target?
  if (fingertips) {
    const d = Math.min(...fingertips.map((t) => len(sub(t, p))));
    return d / (g.pxPerMm * 10); // distance in cm
  }
  return null;
}

function bubble(ctx: CanvasRenderingContext2D, p: Pt, txt: string, color: string, now: number, sub2: string) {
  const r = 13 + Math.sin(now / 160) * 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '800 15px "Baloo 2", system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, p.x, p.y);
  ctx.font = '700 13px "Baloo 2", system-ui';
  ctx.fillText(sub2, p.x, p.y - r - 10);
}

export function drawHandDots(ctx: CanvasRenderingContext2D, hand: Pt[], color: string) {
  const bones = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [5, 9, 10, 11, 12],
    [9, 13, 14, 15, 16],
    [13, 17, 18, 19, 20],
    [0, 17],
  ];
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  for (const b of bones) {
    ctx.beginPath();
    b.forEach((i, k) => (k ? ctx.lineTo(hand[i].x, hand[i].y) : ctx.moveTo(hand[i].x, hand[i].y)));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const i of [4, 8, 12, 16, 20]) {
    ctx.beginPath();
    ctx.arc(hand[i].x, hand[i].y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/** The bow we think you're holding. */
export function drawBow(ctx: CanvasRenderingContext2D, bow: BowGeom, good: boolean | null) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = good === null ? 'rgba(255,255,255,0.8)' : good ? '#52d273' : '#ff9f1c';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(bow.frog.x, bow.frog.y);
  ctx.lineTo(bow.tip.x, bow.tip.y);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(245,240,230,0.6)';
  ctx.lineWidth = 2;
  const off = { x: -bow.d.y * 6, y: bow.d.x * 6 };
  ctx.beginPath();
  ctx.moveTo(bow.frog.x + off.x, bow.frog.y + off.y);
  ctx.lineTo(bow.tip.x + off.x * 0.3, bow.tip.y + off.y * 0.3);
  ctx.stroke();
  if (bow.contact) {
    ctx.beginPath();
    ctx.arc(bow.contact.x, bow.contact.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.restore();
}

/**
 * The bow you *should* be using for this note: a ghost bow crossing the
 * string at the sounding point, sliding along the planned stroke.
 */
export function drawGuideBow(ctx: CanvasRenderingContext2D, g: ViolinGeom, stroke: BowStroke, progress: number, stringIdx: number) {
  // sounding point: halfway between the bridge and the end of the fingerboard
  const fFromNut = (1 - T_SOUND_IDEAL) / (1 - MM.tailToBridge / MM.tailToNut);
  const contact = stringPoint(g, stringIdx, fFromNut);
  const ideal = idealBowDir(g, stringIdx);
  const d = ideal.d;
  const bowLen = MM.bow * g.pxPerMm * Math.max(0.35, ideal.visible);
  const pos = stroke.from + (stroke.to - stroke.from) * Math.max(0, Math.min(1, progress));
  const frog = sub(contact, mul(d, pos * bowLen));
  const tip = add(frog, mul(d, bowLen));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = 'rgba(82,210,115,0.6)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(frog.x, frog.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();
  ctx.setLineDash([]);
  // the part of the bow this note uses
  const segFrom = add(frog, mul(d, Math.min(stroke.from, stroke.to) * bowLen));
  const segTo = add(frog, mul(d, Math.max(stroke.from, stroke.to) * bowLen));
  ctx.strokeStyle = 'rgba(82,210,115,0.35)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(segFrom.x, segFrom.y);
  ctx.lineTo(segTo.x, segTo.y);
  ctx.stroke();
  // frog block
  ctx.fillStyle = '#222';
  ctx.fillRect(frog.x - 8, frog.y - 6, 16, 12);
  // hand movement arrow at the frog: a down bow moves the hand away from the violin
  const handDir = stroke.dir === 'down' ? mul(d, -1) : d;
  const ah = add(frog, mul(handDir, 60));
  arrow(ctx, frog, ah, '#52d273');
  ctx.fillStyle = '#fff';
  ctx.font = '800 16px "Baloo 2", system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(stroke.dir === 'down' ? '⊓ pull (down bow)' : 'V push (up bow)', ah.x, ah.y + 24);
  ctx.restore();
}

function arrow(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string) {
  const d = sub(b, a);
  const l = len(d) || 1;
  const u = { x: d.x / l, y: d.y / l };
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(b.x + u.x * 10, b.y + u.y * 10);
  ctx.lineTo(b.x - u.y * 9 - u.x * 6, b.y + u.x * 9 - u.y * 6);
  ctx.lineTo(b.x + u.y * 9 - u.x * 6, b.y - u.x * 9 - u.y * 6);
  ctx.closePath();
  ctx.fill();
}

export function drawPose(ctx: CanvasRenderingContext2D, a: Analysis) {
  if (!a.pose) return;
  const p = a.pose;
  const lines = [
    [11, 12],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
  ];
  ctx.strokeStyle = 'rgba(123,108,255,0.55)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (const [i, j] of lines) {
    if (!p[i] || !p[j]) continue;
    ctx.beginPath();
    ctx.moveTo(p[i].x, p[i].y);
    ctx.lineTo(p[j].x, p[j].y);
    ctx.stroke();
  }
}
