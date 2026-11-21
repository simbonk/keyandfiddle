import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Lets screens put their sub-menu into the slim top bar, and lets play
// screens hide the top bar entirely so the game gets the whole screen.

interface Chrome {
  slot: HTMLElement | null;
  setPlaying: (on: boolean) => void;
}

export const ChromeContext = createContext<Chrome>({ slot: null, setPlaying: () => undefined });

/** Render children into the top bar's sub-menu slot. */
export function TopBarSlot({ children }: { children: React.ReactNode }) {
  const { slot } = useContext(ChromeContext);
  return slot ? createPortal(children, slot) : null;
}

/** While mounted (and `on`), the app hides its top bar so play uses the full screen. */
export function usePlayingMode(on = true) {
  const { setPlaying } = useContext(ChromeContext);
  useEffect(() => {
    if (!on) return;
    setPlaying(true);
    return () => setPlaying(false);
  }, [on, setPlaying]);
}

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

export function fullscreenSupported() {
  const el = document.documentElement as FsEl;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

/** Real full screen where the browser allows it (iPad, Android, desktop). iPhone Safari doesn't; use Add to Home Screen there. */
export function FullscreenButton({ className = 'btn small ghost' }: { className?: string }) {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => {
      const d = document as FsDoc;
      setFs(!!(d.fullscreenElement || d.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      document.removeEventListener('webkitfullscreenchange', on);
    };
  }, []);
  if (!fullscreenSupported()) return null;
  const toggle = () => {
    const d = document as FsDoc;
    const el = document.documentElement as FsEl;
    if (fs) (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  };
  return (
    <button className={className} onClick={toggle} aria-label={fs ? 'Exit full screen' : 'Full screen'} title="Full screen">
      {fs ? '⤡' : '⛶'}
    </button>
  );
}
