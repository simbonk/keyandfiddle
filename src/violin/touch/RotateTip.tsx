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

export function RotateGraphic() {
  return (
    <svg viewBox="0 0 430 160" className="tv-tip-art" role="img" aria-label="Hold the iPad upright, turn on rotation lock, then turn it sideways">
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

      {/* 3. held like a violin: upright, USB-C toward the scroll, tilted a little.
          Left fingers curl over the right edge onto the strings, the chin rests on
          the bow end at the bottom, the other pinky bows in the bow area. */}
      <g transform="rotate(16 340 66)">
        <rect x={305} y={14} width={70} height={102} rx={10} fill="#0e0a24" stroke={INK} strokeWidth={2.5} />
        <rect x={310} y={19} width={60} height={92} rx={6} fill={SCREEN} />
        {/* USB-C on top */}
        <rect x={333} y={10} width={14} height={4} rx={2} fill={ACCENT} />
        {/* pegbox and fingerboard along the right edge */}
        <rect x={352} y={19} width={18} height={13} rx={3} fill="#8a4a1c" />
        <rect x={354} y={32} width={16} height={56} fill="#17140f" />
        {['#ff4d6d', '#ffd60a', '#2ec4f1', '#52d273'].map((c, i) => (
          <line key={c} x1={357 + i * 4} x2={357 + i * 4} y1={32} y2={110} stroke={c} strokeWidth={1.4} />
        ))}
        {/* bow area at the bottom */}
        <rect x={310} y={88} width={60} height={23} rx={4} fill="#8f4a17" />
        {/* a note sliding in toward the neck */}
        <path d="M318 76 L338 52" stroke={ACCENT} strokeWidth={7} strokeLinecap="round" />
        {/* left hand: palm past the edge, fingers curled over onto the strings */}
        <g>
          {[42, 51, 60, 69].map((y) => (
            <rect key={y} x={359} y={y - 2.6} width={30} height={5.2} rx={2.6} fill="#f2c9a0" stroke="#a5704a" strokeWidth={1} />
          ))}
          <ellipse cx={393} cy={56} rx={9} ry={17} fill="#f2c9a0" stroke="#a5704a" strokeWidth={1} />
        </g>
        {/* bowing pinky */}
        <circle cx={330} cy={99} r={4.5} fill="#f2c9a0" stroke="#a5704a" strokeWidth={1} />
        <path d="M321 92 l-3 -4 l-3 4 M321 106 l-3 4 l-3 -4 M318 89 v20" stroke={INK} strokeWidth={1.3} fill="none" opacity={0.8} />
        {/* chin on the bow end */}
        <path d="M322 131 a18 14 0 0 1 36 0 z" fill="#f2c9a0" stroke={INK} strokeWidth={1.8} />
        <path d="M333 126 q7 4 14 0" stroke="#5a3418" strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <text x={308} y={130} textAnchor="end" fill={MUTED} fontSize={9} fontWeight={800}>
          chin
        </text>
        <text x={302} y={102} textAnchor="end" fill={MUTED} fontSize={9} fontWeight={800}>
          bow
        </text>
        <text x={398} y={82} textAnchor="middle" fill={MUTED} fontSize={9} fontWeight={800}>
          fingers
        </text>
      </g>
      <text x={338} y={154} textAnchor="middle" fill={MUTED} fontSize={13} fontWeight={700}>
        3. Hold it like a violin
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
            <b>Hold it like a violin:</b> USB-C end away from you, tilted a little. Your left fingers curl over the edge
            onto the strings, your chin rests on the bow end, and your other pinky bows. The words turn to face you (change the angle in ⚙️ Options,
            Word angle). Upside down? Tap <b>↻ Flip</b>.
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
