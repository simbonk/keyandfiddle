// "Upright, rotation lock, then sideways" tip for the touch violin, with a
// small three-step picture: the iPad upright, the Rotation Lock button, and
// the iPad turned sideways like a violin.

const INK = '#f6f3ff';
const MUTED = '#b9b0e0';
const SCREEN = '#2b2064';
const ACCENT = '#ffcf33';

function Ipad({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="#0e0a24" stroke={INK} strokeWidth={2.5} />
      <rect x={x + 5} y={y + 5} width={w - 10} height={h - 10} rx={6} fill={SCREEN} />
      {children}
    </g>
  );
}

function Strings({ x, y, len, gap }: { x: number; y: number; len: number; gap: number }) {
  const cols = ['#52d273', '#2ec4f1', '#ffd60a', '#ff4d6d'];
  return (
    <g>
      {cols.map((c, i) => (
        <line key={c} x1={x} x2={x + len} y1={y + i * gap} y2={y + i * gap} stroke={c} strokeWidth={1.6} />
      ))}
    </g>
  );
}

export function RotateGraphic() {
  return (
    <svg viewBox="0 0 420 150" className="tv-tip-art" role="img" aria-label="Hold the iPad upright, turn on rotation lock, then turn it sideways">
      {/* 1. upright */}
      <Ipad x={22} y={14} w={74} h={102} />
      {/* USB-C port on top, top button at the bottom (upside down) */}
      <rect x={52} y={10} width={14} height={4} rx={2} fill={ACCENT} />
      <rect x={70} y={116} width={14} height={3.5} rx={1.75} fill={MUTED} />
      <text x={59} y={6} textAnchor="middle" fill={ACCENT} fontSize={9} fontWeight={800}>
        USB-C
      </text>
      <text x={59} y={142} textAnchor="middle" fill={MUTED} fontSize={13} fontWeight={700}>
        1. Port on top
      </text>

      {/* arrow */}
      <path d="M108 65 h26" stroke={MUTED} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M128 58 l8 7 l-8 7" fill="none" stroke={MUTED} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* 2. rotation lock: the Control Center button */}
      <g>
        <rect x={150} y={30} width={70} height={70} rx={20} fill="#e9e6f5" />
        {/* circular arrow around a padlock, like the iPad button */}
        <path d="M185 46 a19 19 0 1 1 -17.5 11.5" fill="none" stroke="#e0425f" strokeWidth={4} strokeLinecap="round" />
        <path d="M163 52 l5 7 l6 -6" fill="none" stroke="#e0425f" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <rect x={176} y={63} width={18} height={14} rx={3} fill="#e0425f" />
        <path d="M179.5 63 v-4 a5.5 5.5 0 0 1 11 0 v4" fill="none" stroke="#e0425f" strokeWidth={3} />
      </g>
      <text x={185} y={142} textAnchor="middle" fill={MUTED} fontSize={13} fontWeight={700}>
        2. Rotation Lock
      </text>

      {/* arrow with a turn */}
      <path d="M232 65 h22" stroke={MUTED} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M248 58 l8 7 l-8 7" fill="none" stroke={MUTED} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* 3. sideways like a violin */}
      <Ipad x={272} y={26} w={128} h={86}>
        <rect x={278} y={31} width={14} height={20} rx={3} fill="#8a4a1c" />
        <rect x={292} y={31} width={66} height={20} fill="#17140f" />
        <Strings x={292} y={33} len={100} gap={5.4} />
        <rect x={362} y={31} width={33} height={76} rx={5} fill="#8f4a17" opacity={0.85} />
        <path d="M374 62 l-6 30 M380 62 l-2 30 M386 62 l2 30" stroke={ACCENT} strokeWidth={1.6} opacity={0.8} />
      </Ipad>
      <path d="M392 18 a30 30 0 0 0 -34 -6" fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" />
      <path d="M362 6 l-5 6 l7 3" fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={336} y={142} textAnchor="middle" fill={MUTED} fontSize={13} fontWeight={700}>
        3. Turn it sideways
      </text>
    </svg>
  );
}

export function RotateTip({ portrait, onDone }: { portrait: boolean; onDone: () => void }) {
  return (
    <div className="tv-tip-scrim">
      <div className="tv-tip panel" role="dialog" aria-label="How to hold the iPad">
        <h2>🎻 Hold it like a violin</h2>
        <RotateGraphic />
        <ol className="tv-tip-steps">
          <li>
            <b>Hold the iPad upright with the USB-C port at the top</b> (upside down), so your hand stays off the
            top button. Wait for the screen to turn the right way up{portrait ? ' ✓' : '.'}
          </li>
          <li>
            <b>Turn on Rotation Lock:</b> swipe down from the top-right corner and tap the 🔒 button, so the screen
            stops turning.
          </li>
          <li>
            <b>Turn the iPad sideways.</b> The violin is drawn sideways for you, with the strings right at the edge
            your fingers curl over. Upside down? Tap <b>↻ Flip</b>.
          </li>
        </ol>
        {!portrait && (
          <p className="muted small">
            Right now the screen is sideways, so it may flip while you play. Turn the iPad upright (port on top)
            first, lock it, then turn it back.
          </p>
        )}
        <button className="btn big primary" onClick={onDone}>
          Got it
        </button>
      </div>
    </div>
  );
}
