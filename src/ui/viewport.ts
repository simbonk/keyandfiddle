// Screen size and the bottom safe area for layout.
// On some iPhones a home-screen app's window stops short of the bottom of the
// screen (iOS keeps the area by the home indicator for itself). Then the
// home-indicator padding is already outside our window, so we drop it and
// let the bottom bars sit right at the bottom of what we can draw.

function standalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    !!nav.standalone ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches)
  );
}

/** true when the window ends above the bottom edge of the screen */
function shortWindow(): boolean {
  if (!standalone() || !/iPhone|iPod/.test(navigator.userAgent)) return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w > h) return false;
  const long = Math.max(screen.width, screen.height);
  return long - h > 20;
}

export function screenSize(): { w: number; h: number } {
  return { w: window.innerWidth, h: window.innerHeight };
}

let sabCache: number | null = null;
/** Height of the home indicator padding at the bottom of our window, in px. */
export function safeBottom(): number {
  if (sabCache !== null) return sabCache;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:var(--safe-b)';
  document.body.appendChild(d);
  sabCache = parseFloat(getComputedStyle(d).paddingBottom) || 0;
  d.remove();
  return sabCache;
}

/** Keep the short-window flag (html.vp-short) up to date. */
export function trackAppHeight() {
  const set = () => {
    sabCache = null;
    document.documentElement.classList.toggle('vp-short', shortWindow());
  };
  set();
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', () => setTimeout(set, 300));
}
