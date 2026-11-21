// Keeps the screen on while Key & Fiddle is open (kids play with both hands
// and shouldn't have the iPad dim or lock mid-song).
//
// Uses the Screen Wake Lock API where it works, re-taking the lock whenever
// the page becomes visible again (the browser drops it when you switch
// away). Where it's missing or refused (older iOS, some home-screen apps),
// falls back to a tiny silent looping video, which also keeps iOS awake.

type WakeLockSentinelLike = { released: boolean; release: () => Promise<void>; addEventListener: (t: 'release', cb: () => void) => void };
type WakeLockNav = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };

let lock: WakeLockSentinelLike | null = null;
let video: HTMLVideoElement | null = null;
let started = false;

async function requestLock(): Promise<boolean> {
  const nav = navigator as WakeLockNav;
  if (!nav.wakeLock) return false;
  try {
    lock = await nav.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
    return true;
  } catch {
    return false;
  }
}

function startVideoFallback() {
  if (!video) {
    video = document.createElement('video');
    video.src = '/keepawake.mp4';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.setAttribute('aria-hidden', 'true');
    Object.assign(video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' });
    document.body.appendChild(video);
  }
  video.play().catch(() => undefined);
}

async function ensureAwake() {
  if (document.visibilityState !== 'visible') return;
  if (lock && !lock.released) return;
  const ok = await requestLock();
  if (!ok) startVideoFallback();
}

/** Call once at startup. Takes effect on the first tap (browsers require a user gesture). */
export function keepScreenAwake() {
  if (started || typeof document === 'undefined') return;
  started = true;
  const onGesture = () => {
    ensureAwake();
  };
  // every tap re-checks cheaply, so a lock lost for any reason comes back
  document.addEventListener('pointerdown', onGesture, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ensureAwake();
  });
  ensureAwake();
}
