// The real screen size for layout. On iPhone home-screen apps (with the
// translucent status bar) iOS can report a window that stops short of the
// bottom of the screen, which leaves an empty strip under the bottom bar.
// There we use the full screen height instead.

function standalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    !!nav.standalone ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches)
  );
}

export function screenSize(): { w: number; h: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!standalone() || !/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) return { w, h };
  const long = Math.max(screen.width, screen.height);
  const short = Math.min(screen.width, screen.height);
  const sw = w > h ? long : short;
  const sh = w > h ? short : long;
  // only when the width matches the screen and the height is a little short
  if (Math.abs(sw - w) <= 2 && sh > h && sh - h <= 140) return { w, h: sh };
  return { w, h };
}

let sabCache: number | null = null;
/** Height of the home indicator area at the bottom of the screen, in px. */
export function safeBottom(): number {
  if (sabCache !== null) return sabCache;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom)';
  document.body.appendChild(d);
  sabCache = parseFloat(getComputedStyle(d).paddingBottom) || 0;
  d.remove();
  return sabCache;
}

/** Keep --app-h (the app's full height) up to date. */
export function trackAppHeight() {
  const set = () => {
    sabCache = null;
    document.documentElement.style.setProperty('--app-h', `${screenSize().h}px`);
  };
  set();
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', () => setTimeout(set, 300));
}
