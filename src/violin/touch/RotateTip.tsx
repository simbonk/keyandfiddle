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
          Left fingers curl over the right edge onto the strings, the bottom left corner rests on
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
        {/* left hand, as it really holds it: the hand wraps the right edge from
            behind, the fingers curl over onto the strings, the thumb stays behind */}
        <g>
          <path d="M392 36 C384 30 368 24 352 26" stroke="#f2c9a0" strokeWidth={7} strokeLinecap="round" fill="none" opacity={0.3} />
          <path d="M392 36 C384 30 368 24 352 26" stroke={INK} strokeWidth={1} strokeDasharray="2 2.5" fill="none" opacity={0.7} />
          <path
            d="M402 34 C394 31 380 35.6 365 36 A4.5 4.5 0 0 0 365 45 L368 45.2 L364 45.2 A4.8 4.8 0 0 0 364 54.8 L367 55 L365.5 55 A4.5 4.5 0 0 0 365.5 64 L368.5 64 L367 64 A4 4 0 0 0 367 72 C375 73 382 76 386 86 L407 86 C410 70 410 45 402 34 Z"
            fill="#f2c9a0"
            stroke="#b07a52"
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
          <path
            d="M367 45.2 C373 45.4 378 46 382 47.5 M366 55 C372 55.2 377 56 381 57.5 M367.5 64 C373 64.3 377 65 380 66.5"
            stroke="#b07a52"
            strokeWidth={1}
            fill="none"
            strokeLinecap="round"
          />
        </g>
        {/* bowing pinky */}
        <circle cx={330} cy={99} r={4.5} fill="#f2c9a0" stroke="#a5704a" strokeWidth={1} />
        <path d="M321 92 l-3 -4 l-3 4 M321 106 l-3 4 l-3 -4 M318 89 v20" stroke={INK} strokeWidth={1.3} fill="none" opacity={0.8} />
        {/* the bottom left corner rests against your chest */}
        <path d="M284 132 Q306 114 330 130" fill="none" stroke="#f2c9a0" strokeWidth={7} strokeLinecap="round" opacity={0.6} />
        <circle cx={306} cy={116} r={5} fill="none" stroke={ACCENT} strokeWidth={2} />
        <text x={281} y={130} textAnchor="end" fill={MUTED} fontSize={9} fontWeight={800}>
          chest
        </text>
        <text x={302} y={102} textAnchor="end" fill={MUTED} fontSize={9} fontWeight={800}>
          bow
        </text>
        <text x={396} y={92} textAnchor="middle" fill={MUTED} fontSize={9} fontWeight={800}>
          left hand
        </text>
        <text x={403} y={27} textAnchor="middle" fill={MUTED} fontSize={7} fontWeight={700}>
          thumb behind
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
            onto the strings, the bottom left corner rests against your chest, and your other pinky bows. The words turn to face you (change the angle in ⚙️ Options,
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
