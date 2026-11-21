import { FINGER_COLORS, STRINGS, stopFraction, type BowStroke, type Fingering } from './theory';

/** Flat fingerboard picture: nut on the left, strings G (top) to E (bottom). */
export function FingerboardMap({ fing, next }: { fing: Fingering | null; next?: Fingering | null }) {
  const W = 360;
  const H = 110;
  const nutX = 34;
  const scale = (W - nutX - 10) / stopFraction(8); // show up to ~8 semitones
  const y = (s: number) => 20 + s * 23;
  const x = (semis: number) => nutX + stopFraction(semis) * scale;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fb-map" aria-label="fingerboard">
      <rect x={nutX} y={8} width={W - nutX - 6} height={H - 16} rx={8} fill="#1b1b1b" />
      <rect x={nutX - 6} y={8} width={6} height={H - 16} fill="#f2d7a8" />
      {[2, 4, 5, 7].map((s, i) => (
        <g key={s}>
          <line x1={x(s)} x2={x(s)} y1={10} y2={H - 10} stroke="rgba(255,255,255,0.35)" strokeWidth={3} />
          <text x={x(s)} y={H - 1} textAnchor="middle" className="fb-tape">
            {i + 1}
          </text>
        </g>
      ))}
      {STRINGS.map((s, i) => (
        <g key={s.name}>
          <line x1={nutX} x2={W - 6} y1={y(i)} y2={y(i)} stroke={fing?.string === i ? s.color : '#bbb'} strokeWidth={fing?.string === i ? 3.5 : 1.5} />
          <text x={12} y={y(i) + 5} textAnchor="middle" fill={s.color} className="fb-str">
            {s.name}
          </text>
        </g>
      ))}
      {next && next.finger > 0 && (
        <circle cx={x(next.semis) - 8} cy={y(next.string)} r={9} fill="none" stroke="rgba(255,255,255,0.6)" strokeDasharray="3 3" strokeWidth={2} />
      )}
      {fing &&
        (fing.finger === 0 ? (
          <g className="pulse">
            <rect x={nutX + 4} y={y(fing.string) - 9} width={W - nutX - 14} height={18} rx={9} fill="none" stroke={STRINGS[fing.string].color} strokeWidth={3} />
            <text x={W / 2} y={y(fing.string) + 5} textAnchor="middle" className="fb-open">
              open {STRINGS[fing.string].name}: no fingers!
            </text>
          </g>
        ) : (
          <g className="pulse">
            <circle cx={x(fing.semis) - 8} cy={y(fing.string)} r={12} fill={FINGER_COLORS[fing.finger]} />
            <text x={x(fing.semis) - 8} y={y(fing.string) + 5} textAnchor="middle" className="fb-num">
              {fing.finger}
            </text>
          </g>
        ))}
    </svg>
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
