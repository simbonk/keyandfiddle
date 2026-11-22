import { Icon } from '../ui/Icon';
import { useEffect, useRef, useState } from 'react';
import { noteOn } from '../audio/instruments';
import { type MySound, saveMySound } from '../audio/sampler';

/**
 * Shows the recorded sound as a wave. Drag the yellow handles to cut off the
 * start or end; the cut-off parts stay saved, so dragging back undoes it.
 */
export function SampleEditor({
  sound,
  onDelete,
  askName = false,
}: {
  sound: MySound;
  onDelete: () => void;
  /** Just recorded: put the cursor in the name box so they can name it straight away. */
  askName?: boolean;
}) {
  const [name, setName] = useState(sound.name);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => setName(sound.name), [sound.id, sound.name]);
  useEffect(() => {
    if (askName) {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [askName, sound.id]);
  const saveName = () => {
    const n = name.trim().slice(0, 24);
    if (!n) return setName(sound.name);
    if (n !== sound.name) saveMySound({ ...sound, name: n });
  };
  const canvas = useRef<HTMLCanvasElement>(null);
  const len = sound.data.length;
  const [a, setA] = useState(sound.trimStart ?? 0);
  const [b, setB] = useState(sound.trimEnd ?? len);
  const drag = useRef<'a' | 'b' | null>(null);
  const minLen = Math.round(sound.rate * 0.05);

  useEffect(() => {
    setA(sound.trimStart ?? 0);
    setB(sound.trimEnd ?? len);
  }, [sound.id, sound.trimStart, sound.trimEnd, len]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, h);
    const xa = (a / len) * w;
    const xb = (b / len) * w;
    g.fillStyle = 'rgba(255, 207, 51, 0.12)';
    g.fillRect(xa, 0, xb - xa, h);
    const per = len / w;
    for (let x = 0; x < w; x++) {
      let lo = 0;
      let hi = 0;
      const i0 = Math.floor(x * per);
      const i1 = Math.min(len, Math.floor((x + 1) * per));
      for (let i = i0; i < i1; i++) {
        const v = sound.data[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const inside = x >= xa && x <= xb;
      g.fillStyle = inside ? '#ffcf33' : 'rgba(255,255,255,0.22)';
      g.fillRect(x, h / 2 - hi * (h / 2 - 4), 1, Math.max(1, (hi - lo) * (h / 2 - 4)));
    }
    for (const x0 of [xa, xb]) {
      const x = Math.max(9, Math.min(w - 9, x0));
      g.fillStyle = '#ffcf33';
      g.fillRect(x - 2, 0, 4, h);
      g.beginPath();
      if (g.roundRect) g.roundRect(x - 9, h / 2 - 16, 18, 32, 6);
      else g.rect(x - 9, h / 2 - 16, 18, 32);
      g.fill();
    }
  }, [a, b, len, sound.data]);

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * len);
  };
  const play = () => {
    const v = noteOn(sound.root, 0.8, undefined, `mine:${sound.id}`);
    void v;
  };

  return (
    <div className="sample-editor">
      <label className="name-row">
        <span>✏️ Name</span>
        <input
          ref={nameRef}
          value={name}
          maxLength={24}
          placeholder="Give it a name"
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </label>
      <div className="muted small sample-editor-help">✂️ Drag the yellow handles to trim your sound</div>
      <canvas
        ref={canvas}
        className="wave"
        onPointerDown={(e) => {
          const p = pos(e);
          drag.current = Math.abs(p - a) < Math.abs(p - b) ? 'a' : 'b';
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          if (drag.current === 'a') setA(Math.min(p, b - minLen));
          else setB(Math.max(p, a + minLen));
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const p = pos(e);
          if (drag.current === 'a') setA(Math.max(0, Math.min(p, b - minLen)));
          else setB(Math.min(len, Math.max(p, a + minLen)));
        }}
        onPointerUp={async () => {
          if (!drag.current) return;
          drag.current = null;
          await saveMySound({ ...sound, trimStart: a, trimEnd: b });
          play();
        }}
        onPointerCancel={() => (drag.current = null)}
      />
      <div className="sample-editor-actions">
        <button className="btn small" onClick={play}>
          <Icon name="play" size={16} /> Hear it
        </button>
        <button className="btn small ghost" onClick={onDelete}>
          🗑 Delete
        </button>
      </div>
    </div>
  );
}
