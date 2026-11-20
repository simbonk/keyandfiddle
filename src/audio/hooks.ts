import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { mic, type PitchFrame } from './mic';

export function useMicStatus() {
  return useSyncExternalStore(
    (cb) => mic.onStatus(cb),
    () => mic.status,
  );
}

/** Subscribe to every pitch frame (callback is kept fresh via ref, no re-renders). */
export function usePitchListener(cb: (f: PitchFrame) => void, enabled = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!enabled) return;
    return mic.subscribe((f) => ref.current(f));
  }, [enabled]);
}

/** Throttled pitch state for display (re-renders ~15x/second). */
export function usePitchState(enabled = true) {
  const [frame, setFrame] = useState<PitchFrame | null>(null);
  const last = useRef(0);
  usePitchListener((f) => {
    if (f.t - last.current > 66) {
      last.current = f.t;
      setFrame(f);
    }
  }, enabled);
  return frame;
}
