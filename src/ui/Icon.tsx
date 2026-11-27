// Clean line icons for the app's own controls (tabs, buttons, menus).
// Emoji stay for songs and playful sound presets; chrome uses these.

const P: Record<string, React.ReactNode> = {
  songs: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  sounds: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  piano: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M7.5 5v14M12 5v14M16.5 5v14" />
      <path d="M6 5h3v7H6zM10.5 5h3v7h-3zM15 5h3v7h-3z" fill="currentColor" stroke="none" />
    </>
  ),
  violin: (
    <>
      <path d="M14.5 9.5c1.4-1.4 1.6-3.4.3-4.7s-3.3-1.1-4.7.3c-.9.9-1 2-1.9 2.9-.9.9-2.1.7-3.2 1.8-1.7 1.7-1.6 4.5.2 6.3l2.6 2.6c1.8 1.8 4.6 1.9 6.3.2 1.1-1.1.9-2.3 1.8-3.2.9-.9 2-1 2.9-1.9" />
      <path d="M13 11l8-8M19 2.5l2.5 2.5M9 12.5l2.5 2.5" />
    </>
  ),
  guitar: (
    <>
      <path d="M13.2 10.8c-1-1-2.6-.9-3.4.1-.5.6-.5 1.5-1.3 2-1 .6-2.3.2-3.3 1.2-1.5 1.5-1.2 4 .6 5.7s4.2 2.1 5.7.6c1-1 .6-2.3 1.2-3.3.5-.8 1.4-.8 2-1.3 1-.8 1.1-2.4.1-3.4z" />
      <path d="M12 12l8-8M18.5 2.5l3 3" />
      <circle cx="9.8" cy="14.2" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  chords: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="1.5" />
      <path d="M5 8h14M5 12.5h14M5 17h14M9.7 3.5v17M14.3 3.5v17" strokeWidth={1.2} />
      <circle cx="9.7" cy="10.2" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="14.3" cy="14.8" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  touch: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  real: (
    <>
      <path d="M12 3c-2 0-3 1.4-3 3 0 1.3.8 2 .8 3.2S8 11 8 13.5C8 17 9.8 21 12 21s4-4 4-7.5c0-2.5-1.8-3.1-1.8-4.3S15 7.3 15 6c0-1.6-1-3-3-3z" />
      <path d="M12 3v18M10.5 11.5h3" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
    </>
  ),
  wait: (
    <>
      <path d="M7 3h10M7 21h10M8 3c0 4.5 8 5.5 8 9s-8 4.5-8 9M16 3c0 4.5-8 5.5-8 9s8 4.5 8 9" />
    </>
  ),
  run: (
    <>
      <path d="M5 12h9M10 7l5 5-5 5" />
      <path d="M17 5v14" />
    </>
  ),
  listen: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="4.5" height="6.5" rx="1.5" />
      <rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5 10-11" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.3-2.5 4" />
      <circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  flip: (
    <>
      <path d="M4 9h13l-3.5-3.5M20 15H7l3.5 3.5" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  tuner: (
    <>
      <path d="M4 17a8 8 0 0 1 16 0" />
      <path d="M12 17l4-6" />
      <circle cx="12" cy="17" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  record: <circle cx="12" cy="12" r="6.5" fill="currentColor" />,
  camera: (
    <>
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h3l1.5-2.5h6L16.5 7h3A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  trash: <path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`ic ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}
