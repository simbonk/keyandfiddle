import { useRef } from 'react';
import { isBlackKey, midiName, pitchClassName } from '../audio/notes';

export interface KeyRect {
  midi: number;
  x: number; // 0..1 left edge
  w: number; // 0..1 width
  black: boolean;
}

/** Normalised key geometry, shared by the keyboard and the 3D note highway. */
export function keyLayout(start: number, end: number): KeyRect[] {
  const whites: number[] = [];
  for (let m = start; m <= end; m++) if (!isBlackKey(m)) whites.push(m);
  const ww = 1 / whites.length;
  const rects: KeyRect[] = [];
  let wi = 0;
  for (let m = start; m <= end; m++) {
    if (!isBlackKey(m)) {
      rects.push({ midi: m, x: wi * ww, w: ww, black: false });
      wi++;
    } else {
      const bw = ww * 0.62;
      rects.push({ midi: m, x: wi * ww - bw / 2, w: bw, black: true });
    }
  }
  return rects;
}

export interface KeyHighlight {
  color: string;
  label?: string;
}

/** A see-through "shadow" hand: where each finger rests, which ones play now. */
export interface ShadowHand {
  left: boolean;
  /** key under each finger, index 0 = finger 1 (thumb) */
  keys: number[];
  /** fingers (1..5) that play the current note(s) */
  active: number[];
}

interface Props {
  start: number;
  end: number;
  highlights?: Record<number, KeyHighlight>;
  pressed?: Set<number> | number | null;
  showLabels?: boolean;
  onPress?: (midi: number) => void;
  onRelease?: (midi: number) => void;
  height?: number | string;
  shadows?: ShadowHand[];
}

const FINGER_COLORS_LEFT = '#5ab0ff';

export function Keyboard({ start, end, highlights, pressed, showLabels = true, onPress, onRelease, height = 180, shadows }: Props) {
  const rects = keyLayout(start, end);
  const pointerKeys = useRef(new Map<number, number>());
  const isPressed = (m: number) => (pressed instanceof Set ? pressed.has(m) : pressed === m);

  const handleDown = (e: React.PointerEvent, midi: number) => {
    e.preventDefault();
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    pointerKeys.current.set(e.pointerId, midi);
    onPress?.(midi);
  };
  const handleEnter = (e: React.PointerEvent, midi: number) => {
    if (e.buttons === 0 && e.pointerType === 'mouse') return;
    const prev = pointerKeys.current.get(e.pointerId);
    if (prev === undefined || prev === midi) return;
    onRelease?.(prev);
    pointerKeys.current.set(e.pointerId, midi);
    onPress?.(midi);
  };
  const handleUp = (e: React.PointerEvent) => {
    const prev = pointerKeys.current.get(e.pointerId);
    if (prev !== undefined) onRelease?.(prev);
    pointerKeys.current.delete(e.pointerId);
  };

  return (
    <div className="keyboard" style={{ height }} onPointerUp={handleUp} onPointerCancel={handleUp} onPointerLeave={handleUp}>
      {[false, true].map((blackLayer) =>
        rects
          .filter((r) => r.black === blackLayer)
          .map((r) => {
            const hl = highlights?.[r.midi];
            const down = isPressed(r.midi);
            return (
              <div
                key={r.midi}
                className={`key ${r.black ? 'black' : 'white'} ${down ? 'down' : ''}`}
                style={{
                  left: `${r.x * 100}%`,
                  width: `${r.w * 100}%`,
                  ['--hl' as string]: hl?.color ?? 'transparent',
                }}
                onPointerDown={(e) => handleDown(e, r.midi)}
                onPointerEnter={(e) => handleEnter(e, r.midi)}
                aria-label={midiName(r.midi)}
                role="button"
              >
                {hl && <div className="key-glow" />}
                {hl?.label && <div className="key-badge">{hl.label}</div>}
                {showLabels && !r.black && (
                  <div className="key-label" style={r.midi === 60 ? { color: FINGER_COLORS_LEFT } : undefined}>
                    {pitchClassName(r.midi)}
                    {r.midi === 60 && <span className="mid-c">middle</span>}
                  </div>
                )}
              </div>
            );
          }),
      )}
      {shadows?.map((h) => {
        const byMidi = new Map(rects.map((r) => [r.midi, r]));
        return h.keys.map((m, i) => {
          const r = byMidi.get(m);
          if (!r) return null;
          const on = h.active.includes(i + 1);
          return (
            <div
              key={`${h.left ? 'L' : 'R'}${i}`}
              className={`finger-shadow ${h.left ? 'left' : 'right'} ${on ? 'on' : ''} ${r.black ? 'on-black' : ''}`}
              style={{ left: `${(r.x + r.w / 2) * 100}%`, ['--fw' as string]: `${r.w * (r.black ? 100 : 78)}%` }}
            >
              {i + 1}
            </div>
          );
        });
      })}
    </div>
  );
}
