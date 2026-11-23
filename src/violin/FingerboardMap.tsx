import { FINGER_COLORS, STRINGS, stopFraction, type BowStroke, type Fingering } from './theory';

/**
 * Fingerboard as the player sees it, looking down the neck from the chin rest:
 * the scroll is far away (top), strings G D A E run left to right just like the
 * note lanes above, and fingers go down the board toward you.
 */
export function FingerboardMap({
  fing,
  next,
  heard,
}: {
  fing: Fingering | null;
  next?: Fingering | null;
  /** the note heard, as semitones above the target's open string (may be fractional) */
  heard?: { semis: number; name: string; ok: boolean } | null;
}) {
  const W = 190;
  const H = 200;
  const nutY = 30;
  const scale = (H - nutY - 12) / stopFraction(8); // show up to ~8 semitones
  const x = (s: number) => 40 + s * 37;
  const y = (semis: number) => nutY + stopFraction(semis) * scale;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fb-map" aria-label="fingerboard">
      <rect x={22} y={nutY} width={147} height={H - nutY - 4} rx={8} fill="#1b1b1b" />
      <rect x={22} y={nutY - 6} width={147} height={6} fill="#f2d7a8" />
      {[2, 4, 5, 7].map((s, i) => (
        <g key={s}>
          <line x1={24} x2={167} y1={y(s)} y2={y(s)} stroke="rgba(255,255,255,0.35)" strokeWidth={3} />
          <text x={12} y={y(s) + 4} textAnchor="middle" className="fb-tape">
            {i + 1}
          </text>
        </g>
      ))}
      {STRINGS.map((s, i) => (
        <g key={s.name}>
          <line x1={x(i)} x2={x(i)} y1={nutY} y2={H - 6} stroke={fing?.string === i ? s.color : '#bbb'} strokeWidth={fing?.string === i ? 3.5 : 1.5} />
          <text x={x(i)} y={16} textAnchor="middle" fill={s.color} className="fb-str">
            {s.name}
          </text>
        </g>
      ))}
      {next && next.finger > 0 && (
        <circle cx={x(next.string)} cy={y(next.semis) - 8} r={9} fill="none" stroke="rgba(255,255,255,0.6)" strokeDasharray="3 3" strokeWidth={2} />
      )}
      {fing &&
        (fing.finger === 0 ? (
          <g className="pulse">
            <rect x={x(fing.string) - 10} y={nutY + 4} width={20} height={H - nutY - 14} rx={10} fill="none" stroke={STRINGS[fing.string].color} strokeWidth={3} />
            <text x={W / 2 + 6} y={H - 14} textAnchor="middle" className="fb-open">
              open {STRINGS[fing.string].name}: no fingers!
            </text>
          </g>
        ) : (
          <g className="pulse">
            <circle cx={x(fing.string)} cy={y(fing.semis) - 8} r={12} fill={FINGER_COLORS[fing.finger]} />
            <text x={x(fing.string)} y={y(fing.semis) - 3} textAnchor="middle" className="fb-num">
              {fing.finger}
            </text>
          </g>
        ))}
      {fing && heard && <Heard fing={fing} heard={heard} x={x(fing.string)} y={y} top={nutY} bottom={H - 10} />}
    </svg>
  );
}

/** Where the violin is heard on the target string, and an arrow toward the target spot. */
function Heard({
  fing,
  heard,
  x,
  y,
  top,
  bottom,
}: {
  fing: Fingering;
  heard: { semis: number; name: string; ok: boolean };
  x: number;
  y: (semis: number) => number;
  top: number;
  bottom: number;
}) {
  const hy = Math.max(top + 2, Math.min(bottom, heard.semis <= 0 ? top + 2 : y(heard.semis) - 8));
  const ty = fing.finger === 0 ? top + 2 : y(fing.semis) - 8;
  const col = heard.ok ? '#52d273' : '#ffffff';
  const gap = ty - hy;
  const side = x > 95 ? -1 : 1; // label on the roomier side
  return (
    <g>
      {!heard.ok && Math.abs(gap) > 14 && (
        <g stroke="#ffd60a" strokeWidth={3} fill="#ffd60a" strokeLinecap="round">
          <line x1={x + side * 18} y1={hy} x2={x + side * 18} y2={ty - Math.sign(gap) * 6} />
          <path
            d={`M ${x + side * 18 - 6} ${ty - Math.sign(gap) * 10} L ${x + side * 18} ${ty - Math.sign(gap) * 2} L ${x + side * 18 + 6} ${ty - Math.sign(gap) * 10} Z`}
          />
        </g>
      )}
      <circle cx={x} cy={hy} r={10} fill="none" stroke={col} strokeWidth={3} />
      <text x={x + side * 30} y={hy + 4} textAnchor={side < 0 ? 'end' : 'start'} className="fb-heard" fill={col}>
        {heard.ok
          ? `${heard.name} ✓`
          : fing.finger === 0 && heard.semis > 0.5
            ? `${heard.name}: lift finger`
            : `${heard.name} ${gap > 0 ? '↓ down' : '↑ up'}`}
      </text>
    </g>
  );
}

/** Horizontal bow with the section to use highlighted. */
export function BowMap({ stroke, live }: { stroke: BowStroke | null; live: number | null }) {
  const W = 360;
  const x = (p: number) => 30 + p * (W - 60);
  return (
    <svg viewBox={`0 0 ${W} 60`} className="bow-map" aria-label="bow">
      <rect x={14} y={22} width={22} height={18} rx={4} fill="#222" />
      <rect x={30} y={26} width={W - 60} height={5} rx={2} fill="#7a4a22" />
      <rect x={30} y={33} width={W - 60} height={3} fill="#f5f0e6" />
      <text x={25} y={56} textAnchor="middle" className="fb-tape">frog</text>
      <text x={W - 30} y={56} textAnchor="middle" className="fb-tape">tip</text>
      {stroke && (
        <g>
          <rect
            x={x(Math.min(stroke.from, stroke.to))}
            y={18}
            width={Math.abs(stroke.to - stroke.from) * (W - 60)}
            height={24}
            rx={8}
            fill={stroke.dir === 'down' ? 'rgba(255,159,28,0.5)' : 'rgba(46,196,241,0.5)'}
          />
          <text x={W / 2} y={14} textAnchor="middle" className="fb-open">
            {stroke.dir === 'down' ? '⊓ pull (down bow) →' : '← V push (up bow)'}
          </text>
        </g>
      )}
      {live !== null && <polygon points={`${x(live) - 7},50 ${x(live) + 7},50 ${x(live)},40`} fill="#fff" />}
    </svg>
  );
}
