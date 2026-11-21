import { useEffect, useRef, useState } from 'react';
import { loadViolin, sendStrings, unlockAudio } from './touch/engine';
import { STRINGS } from './theory';
import { midiToFreq } from '../audio/notes';

const SEMIS = 8; // open string + 7 finger spots
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/** A small try-it violin: finger the strings on top, bow underneath. */
export function MiniViolin() {
  // finger presses per string: pointerId -> semitone
  const fingers = useRef<Map<number, { s: number; semis: number }>>(new Map());
  const bow = useRef<{ id: number; x: number; t: number; s: number; vel: number } | null>(null);
  const [held, setHeld] = useState<number[]>([0, 0, 0, 0]);
  const [bowStr, setBowStr] = useState<number | null>(null);
  const [bowDir, setBowDir] = useState(0);

  useEffect(() => {
    loadViolin();
    return () => sendStrings([0, 1, 2, 3].map((i) => ({ i, bowing: false, vel: 0 })));
  }, []);

  const semisOf = (s: number) => {
    let best = 0;
    fingers.current.forEach((f) => f.s === s && f.semis > best && (best = f.semis));
    return best;
  };

  const pushFingers = (s: number) => {
    const semis = semisOf(s);
    setHeld((h) => h.map((v, i) => (i === s ? semis : v)));
    sendStrings([{ i: s, freq: midiToFreq(STRINGS[s].midi + semis), snap: true }]);
  };

  const fingerAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = Math.max(0, Math.min(3, Math.floor(((e.clientY - r.top) / r.height) * 4)));
    const semis = Math.max(0, Math.min(SEMIS - 1, Math.floor(((e.clientX - r.left) / r.width) * SEMIS)));
    return { s, semis };
  };

  const onFingerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    unlockAudio();
    e.currentTarget.setPointerCapture(e.pointerId);
    const f = fingerAt(e);
    fingers.current.set(e.pointerId, f);
    pushFingers(f.s);
  };
  const onFingerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const old = fingers.current.get(e.pointerId);
    if (!old) return;
    const f = fingerAt(e);
    if (f.s === old.s && f.semis === old.semis) return;
    fingers.current.set(e.pointerId, f);
    pushFingers(old.s);
    if (f.s !== old.s) pushFingers(f.s);
  };
  const onFingerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const old = fingers.current.get(e.pointerId);
    fingers.current.delete(e.pointerId);
    if (old) pushFingers(old.s);
  };

  const laneOf = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(3, Math.floor(((e.clientY - r.top) / r.height) * 4)));
  };

  const onBowDown = (e: React.PointerEvent<HTMLDivElement>) => {
    unlockAudio();
    if (bow.current) return; // one bow at a time
    e.currentTarget.setPointerCapture(e.pointerId);
    const s = laneOf(e);
    bow.current = { id: e.pointerId, x: e.clientX, t: performance.now(), s, vel: 0 };
    setBowStr(s);
    sendStrings([{ i: s, freq: midiToFreq(STRINGS[s].midi + semisOf(s)), snap: true }]);
  };
  const onBowMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = bow.current;
    if (!b || b.id !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(8, now - b.t);
    const speed = (e.clientX - b.x) / dt; // px per ms
    const target = Math.max(-0.25, Math.min(0.25, speed * 0.18));
    b.vel = b.vel * 0.6 + target * 0.4;
    b.x = e.clientX;
    b.t = now;
    const s = laneOf(e);
    const msgs = [];
    if (s !== b.s) {
      msgs.push({ i: b.s, bowing: false, vel: 0 });
      msgs.push({ i: s, freq: midiToFreq(STRINGS[s].midi + semisOf(s)), snap: true });
      b.s = s;
      setBowStr(s);
    }
    msgs.push({ i: s, bowing: true, vel: b.vel, pressure: 0.5 });
    sendStrings(msgs);
    setBowDir(Math.abs(b.vel) < 0.01 ? 0 : Math.sign(b.vel));
  };
  const onBowUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = bow.current;
    if (!b || b.id !== e.pointerId) return;
    sendStrings([{ i: b.s, bowing: false, vel: 0 }]);
    bow.current = null;
    setBowStr(null);
    setBowDir(0);
  };

  // when the bow stops moving, let the sound die down
  useEffect(() => {
    const id = setInterval(() => {
      const b = bow.current;
      if (!b) return;
      if (performance.now() - b.t > 90 && Math.abs(b.vel) > 0.001) {
        b.vel *= 0.5;
        sendStrings([{ i: b.s, bowing: true, vel: b.vel }]);
        if (Math.abs(b.vel) < 0.01) setBowDir(0);
      }
    }, 60);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mini-violin">
      <div className="mv-label">Fingers: press a string 👇</div>
      <div
        className="mv-fingers"
        onPointerDown={onFingerDown}
        onPointerMove={onFingerMove}
        onPointerUp={onFingerUp}
        onPointerCancel={onFingerUp}
      >
        {STRINGS.map((st, i) => (
          <div className="mv-row" key={st.name}>
            <span className="mv-name" style={{ color: st.color }}>
              {st.name}
            </span>
            <div className="mv-string" style={{ background: st.color, height: 6 - i }} />
            {Array.from({ length: SEMIS - 1 }, (_, k) => (
              <span className="mv-fret" key={k} style={{ left: `${((k + 1) / SEMIS) * 100}%` }} />
            ))}
            {held[i] > 0 && (
              <span
                className="mv-dot"
                style={{ left: `${((held[i] + 0.5) / SEMIS) * 100}%`, borderColor: st.color }}
              >
                {NAMES[(STRINGS[i].midi + held[i]) % 12]}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mv-label">Bow: slide left and right 👇</div>
      <div
        className="mv-bow"
        onPointerDown={onBowDown}
        onPointerMove={onBowMove}
        onPointerUp={onBowUp}
        onPointerCancel={onBowUp}
      >
        {STRINGS.map((st, i) => (
          <div className={`mv-lane${bowStr === i ? ' on' : ''}`} key={st.name} style={{ borderColor: st.color }}>
            <span style={{ color: st.color }}>
              {st.name} {NAMES[(st.midi + held[i]) % 12] !== st.name ? `→ ${NAMES[(st.midi + held[i]) % 12]}` : ''}
            </span>
            {bowStr === i && <span className="mv-arrow">{bowDir > 0 ? '➡️' : bowDir < 0 ? '⬅️' : '✋'}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
