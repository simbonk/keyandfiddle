import { useEffect, useMemo, useRef, useState } from 'react';
import { finish, type RawNote } from '../audio/importScore';
import { midiName } from '../audio/notes';
import { playNote } from '../audio/synth';
import { type OmrNote, type OmrResult, noteMidi, recognize, toTimeline } from './omr';
import { saveScore, type StoredScore } from '../ui/importedSongs';

const KEYS = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
const keyLabel = (k: number) => (k === 0 ? 'no sharps or flats' : k > 0 ? `${k} sharp${k > 1 ? 's' : ''} ♯` : `${-k} flat${k < -1 ? 's' : ''} ♭`);
const LENGTHS: [number, string][] = [
  [0.25, '𝅘𝅥𝅯 ¼ beat'],
  [0.5, '♪ ½ beat'],
  [0.75, '♪. ¾ beat'],
  [1, '♩ 1 beat'],
  [1.5, '♩. 1½ beats'],
  [2, '𝅗𝅥 2 beats'],
  [3, '𝅗𝅥. 3 beats'],
  [4, '𝅝 4 beats'],
];

async function loadGray(file: File, width?: number): Promise<{ w: number; h: number; data: Uint8Array; url: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode().catch(() => {
    throw new Error("I couldn't open that picture. Try a screenshot (PNG or JPEG).");
  });
  // work at a size where a staff space is roughly 10-20 pixels
  let scale = 1;
  if (width) scale = width / img.naturalWidth;
  else if (img.naturalWidth > 2000) scale = 2000 / img.naturalWidth;
  else if (img.naturalWidth < 1300) scale = 1300 / img.naturalWidth;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
  return { w, h, data, url };
}

export function PhotoImport({ file, onDone, onCancel }: { file: File; onDone: (s: StoredScore) => void; onCancel: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [res, setRes] = useState<OmrResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  // notes switched off with a tap: kept on screen (dimmed) so a second tap brings them back
  const [off, setOff] = useState<Set<number>>(() => new Set());
  const press = useRef<{ id: number; timer: number; long: boolean } | null>(null);
  const [title, setTitle] = useState('My sheet music');
  const [bpm, setBpm] = useState(80);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let url = '';
    let dead = false;
    (async () => {
      try {
        const g = await loadGray(file);
        url = g.url;
        if (dead) return;
        setImg(g.url);
        await new Promise((r) => setTimeout(r, 30)); // let "reading" paint first
        let r = recognize(g);
        // small print (two pages side by side, a far-off photo): read again bigger
        if (r.space < 10 && g.w < 3200) {
          const big = await loadGray(file, Math.min(3200, Math.round((g.w * 13) / r.space)));
          URL.revokeObjectURL(big.url);
          try {
            const r2 = recognize(big);
            if (r2.notes.length >= r.notes.length * 0.8) r = r2;
          } catch {
            /* keep the first reading */
          }
        }
        if (!dead) setRes(r);
      } catch (e) {
        if (!dead) setErr((e as Error).message);
      }
    })();
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
      timers.current.forEach(clearTimeout);
    };
  }, [file]);

  const timeline = useMemo(() => (res ? toTimeline({ ...res, notes: res.notes.filter((n) => !off.has(n.id)) }) : []), [res, off]);
  const toggle = (id: number) =>
    setOff((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // tap = switch the note off/on, press and hold = fix it (pitch, sharp/flat, length)
  const downOn = (id: number) => {
    if (press.current) clearTimeout(press.current.timer);
    const p = { id, long: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      p.long = true;
      setOff((o) => {
        if (!o.has(id)) return o;
        const n = new Set(o);
        n.delete(id);
        return n;
      });
      setSel(id);
      navigator.vibrate?.(15);
    }, 450);
    press.current = p;
  };
  const upOn = (id: number) => {
    const p = press.current;
    press.current = null;
    if (!p || p.id !== id) return;
    clearTimeout(p.timer);
    if (!p.long) {
      toggle(id);
      if (sel === id) setSel(null);
    }
  };
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const selNote = res?.notes.find((n) => n.id === sel) ?? null;

  const update = (fn: (n: OmrNote) => void) => {
    if (!res || !selNote) return;
    const notes = res.notes.map((n) => (n.id === sel ? { ...n } : n));
    fn(notes.find((n) => n.id === sel)!);
    setRes({ ...res, notes });
  };

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlayingId(null);
  };
  const play = () => {
    stop();
    const spb = 60 / bpm;
    for (const n of timeline) {
      timers.current.push(
        window.setTimeout(() => {
          playNote(n.midi, Math.max(0.2, n.beats * spb), n.left ? 0.5 : 0.7);
          setPlayingId(n.id);
        }, n.beat * spb * 1000),
      );
    }
    const end = Math.max(0, ...timeline.map((n) => n.beat + n.beats));
    timers.current.push(window.setTimeout(() => setPlayingId(null), end * spb * 1000 + 300));
  };

  // add a note: put a finger on an empty spot, slide up/down to the right line or
  // space (the name shows as you go), lift to place it
  const [ghost, setGhost] = useState<OmrNote | null>(null);
  const ghostAt = (clientX: number, clientY: number, staff?: number, x0?: number): OmrNote | null => {
    if (!res) return null;
    const r = svgRef.current!.getBoundingClientRect();
    const x = x0 ?? ((clientX - r.left) / r.width) * res.w;
    const y = ((clientY - r.top) / r.height) * res.h;
    let si = staff ?? 0;
    if (staff === undefined) {
      let bd = Infinity;
      res.staves.forEach((s, i) => {
        if (x < s.x0 - s.space * 2 || x > s.x1 + s.space) return;
        const d = Math.abs(y - (s.lines[0] + s.lines[4]) / 2);
        if (d < bd) [bd, si] = [d, i];
      });
      // only on (or just above/below) a staff, so a stray tap in the margin does nothing
      if (bd > res.staves[si].space * 5) return null;
    }
    const st = res.staves[si];
    const step = Math.max(-8, Math.min(16, Math.round((st.lines[4] - y) / (st.space / 2))));
    // same length as the nearest note in that staff, so a run of eighths stays eighths
    const near = res.notes
      .filter((o) => o.staff === si && !o.grace && !off.has(o.id))
      .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    const id = Math.max(0, ...res.notes.map((n) => n.id)) + 1;
    return { id, x, y: st.lines[4] - (step * st.space) / 2, staff: si, step, filled: true, stem: true, beams: 0, dotted: false, beats: near?.beats ?? 1 };
  };
  // a quick swipe still scrolls the page; a finger that rests for a moment grabs a
  // new note, and a quick tap drops one right where it landed
  const pending = useRef<{ x: number; y: number; timer: number; moved: boolean } | null>(null);
  const ghostRef = useRef<OmrNote | null>(null);
  const setG = (g: OmrNote | null) => {
    ghostRef.current = g;
    setGhost(g);
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const stopScroll = (e: TouchEvent) => {
      if (ghostRef.current) e.preventDefault();
    };
    svg.addEventListener('touchmove', stopScroll, { passive: false });
    return () => svg.removeEventListener('touchmove', stopScroll);
  }, [res !== null]);
  const place = (g: OmrNote) => {
    if (!res) return;
    setRes({ ...res, notes: [...res.notes, g] });
    playNote(noteMidi(g, res.staves[g.staff], res.keySig), 0.4, 0.6);
  };
  const onSheetDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!res) return;
    if (sel !== null) {
      setSel(null);
      return;
    }
    if (!ghostAt(e.clientX, e.clientY)) return;
    const { clientX, clientY } = e;
    const p = { x: clientX, y: clientY, moved: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      if (pending.current !== p || p.moved) return;
      const g = ghostAt(clientX, clientY);
      if (!g) return;
      navigator.vibrate?.(15);
      playNote(noteMidi(g, res.staves[g.staff], res.keySig), 0.25, 0.4);
      setG(g);
    }, 220);
    pending.current = p;
  };
  const onSheetMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pending.current;
    if (p && !ghostRef.current) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) p.moved = true;
      return;
    }
    const gh = ghostRef.current;
    if (!gh || !res) return;
    const g = ghostAt(e.clientX, e.clientY, gh.staff, gh.x);
    if (g && g.step !== gh.step) {
      setG({ ...gh, step: g.step, y: g.y });
      playNote(noteMidi(g, res.staves[g.staff], res.keySig), 0.25, 0.4);
    }
  };
  const onSheetUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pending.current;
    pending.current = null;
    if (p) clearTimeout(p.timer);
    const gh = ghostRef.current;
    if (gh) {
      place(gh);
      setG(null);
    } else if (p && !p.moved) {
      const g = ghostAt(e.clientX, e.clientY);
      if (g) place(g);
    }
  };
  const onSheetCancel = () => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    setG(null);
  };

  const save = () => {
    if (!res) return;
    const raw: RawNote[] = timeline.map((n) => ({ midi: n.midi, beat: n.beat, beats: n.beats, part: 0, staff: n.left ? 2 : 1, voice: '1' }));
    try {
      const sc = finish({ title, bpm, notes: raw }, title);
      onDone(saveScore(sc));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (err)
    return (
      <div className="panel">
        <h2>📷 Reading your sheet music</h2>
        <div className="toast warn">{err}</div>
        <p className="muted small">Works best with a clear, straight screenshot of printed music (not handwriting).</p>
        <button className="btn" onClick={onCancel}>
          ◀ Back
        </button>
      </div>
    );

  const midiOf = (n: OmrNote) => (res ? noteMidi(n, res.staves[n.staff], res.keySig) : 0);

  return (
    <div className="panel photo-import">
      <div className="row wrap">
        <button className="btn small ghost" onClick={onCancel}>
          ◀ Cancel
        </button>
        <h2 style={{ margin: 0 }}>📷 Check the notes I found</h2>
      </div>
      {!res && <p>⏳ Reading the music…</p>}
      {res && (
        <>
          <p className="muted small">
            I found {res.notes.length} notes. <b>Tap a circle</b> to switch a wrong note off (tap again to bring it back).{' '}
            <b>Tap an empty spot</b> to add a note I missed, or <b>hold and slide up or down</b> to pick its pitch, then let go. <b>Press and hold</b> a circle to change its pitch,
            sharp/flat or length. Pink = right hand, blue = left hand.
          </p>
          <div className="row wrap pi-controls">
            <label className="field">
              Name
              <input className="name-input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              Key
              <select value={res.keySig} onChange={(e) => setRes({ ...res, keySig: +e.target.value })}>
                {KEYS.map((k) => (
                  <option key={k} value={k}>
                    {keyLabel(k)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Speed
              <select value={bpm} onChange={(e) => setBpm(+e.target.value)}>
                {[50, 60, 70, 80, 90, 100, 110, 120, 140].map((b) => (
                  <option key={b} value={b}>
                    {b} beats/min
                  </option>
                ))}
              </select>
            </label>
            {playingId === null ? (
              <button className="btn" onClick={play}>
                ▶ Hear it
              </button>
            ) : (
              <button className="btn" onClick={stop}>
                ⏹ Stop
              </button>
            )}
          </div>
          {selNote && (
            <div className="row wrap pi-edit">
              <b>{midiName(midiOf(selNote))}</b>
              <button className="btn small" onClick={() => update((n) => (n.step += 1))}>
                ▲ higher
              </button>
              <button className="btn small" onClick={() => update((n) => (n.step -= 1))}>
                ▼ lower
              </button>
              <select
                value={selNote.acc === undefined ? 'k' : String(selNote.acc)}
                onChange={(e) => update((n) => (n.acc = e.target.value === 'k' ? undefined : +e.target.value))}
              >
                <option value="k">as in key</option>
                <option value="1">♯ sharp</option>
                <option value="-1">♭ flat</option>
                <option value="0">♮ natural</option>
              </select>
              <select value={selNote.beats} onChange={(e) => update((n) => (n.beats = +e.target.value))}>
                {!LENGTHS.some(([b]) => b === selNote.beats) && <option value={selNote.beats}>{selNote.beats} beats</option>}
                {LENGTHS.map(([b, l]) => (
                  <option key={b} value={b}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                className="btn small"
                onClick={() => {
                  toggle(selNote.id);
                  setSel(null);
                }}
              >
                🚫 Switch off
              </button>
              <button className="btn small ghost" onClick={() => setSel(null)}>
                Done
              </button>
            </div>
          )}
        </>
      )}
      <div className="pi-sheet">
        {img && <img src={img} alt="Your sheet music" />}
        {res && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${res.w} ${res.h}`}
            preserveAspectRatio="none"
            onPointerDown={onSheetDown}
            onPointerMove={onSheetMove}
            onPointerUp={onSheetUp}
            onPointerCancel={onSheetCancel}
            className="adding"
          >
            {res.notes.map((n) => {
              // the lower staff of a pair is the left hand, whatever its clef
              const left = res.staves.some((s, i) => i < n.staff && s.system === res.staves[n.staff].system);
              const r = res.space * 0.75;
              const on = n.id === sel || n.id === playingId;
              const isOff = off.has(n.id);
              return (
                <g
                  key={n.id}
                  className={isOff ? 'pi-off' : ''}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    downOn(n.id);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    upOn(n.id);
                  }}
                  onPointerLeave={cancelPress}
                  onPointerCancel={cancelPress}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <ellipse
                    cx={n.x}
                    cy={n.y}
                    rx={r * 1.15}
                    ry={r}
                    className={`pi-dot ${left ? 'left' : 'right'} ${on ? 'on' : ''}`}
                    strokeWidth={Math.max(1.5, res.space * 0.18)}
                  />
                  <text x={n.x} y={n.y - r * 1.25} fontSize={res.space * 1.05} className="pi-label">
                    {midiName(midiOf(n)).replace(/-?\d+$/, '')}
                  </text>
                </g>
              );
            })}
            {ghost && (
              <g className="pi-ghost">
                <ellipse cx={ghost.x} cy={ghost.y} rx={res.space * 0.86} ry={res.space * 0.75} className="pi-dot on" strokeWidth={Math.max(1.5, res.space * 0.18)} />
                <text x={ghost.x} y={ghost.y - res.space * 1.3} fontSize={res.space * 1.6} className="pi-label">
                  {midiName(midiOf(ghost))}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>
      {res && (
        <div className="row">
          <button className="btn big primary" disabled={!res.notes.length} onClick={save}>
            ✅ Save song
          </button>
          <span className="muted small">
            {timeline.length} notes{off.size ? `, ${off.size} switched off` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
