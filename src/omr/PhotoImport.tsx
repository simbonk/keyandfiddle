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

async function loadGray(file: File): Promise<{ w: number; h: number; data: Uint8Array; url: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode().catch(() => {
    throw new Error("I couldn't open that picture. Try a screenshot (PNG or JPEG).");
  });
  // work at a size where a staff space is roughly 10-20 pixels
  let scale = 1;
  if (img.naturalWidth > 2000) scale = 2000 / img.naturalWidth;
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
  const [adding, setAdding] = useState(false);
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
        const r = recognize(g);
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

  const timeline = useMemo(() => (res ? toTimeline(res) : []), [res]);
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

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!res || !adding) {
      setSel(null);
      return;
    }
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * res.w;
    const y = ((e.clientY - r.top) / r.height) * res.h;
    let si = 0;
    let bd = Infinity;
    res.staves.forEach((s, i) => {
      const d = Math.abs(y - (s.lines[0] + s.lines[4]) / 2);
      if (d < bd) [bd, si] = [d, i];
    });
    const st = res.staves[si];
    const step = Math.round((st.lines[4] - y) / (st.space / 2));
    const id = Math.max(0, ...res.notes.map((n) => n.id)) + 1;
    const n: OmrNote = { id, x, y: st.lines[4] - (step * st.space) / 2, staff: si, step, filled: true, stem: true, beams: 0, dotted: false, beats: 1 };
    setRes({ ...res, notes: [...res.notes, n] });
    setSel(id);
    setAdding(false);
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
            I found {res.notes.length} notes. Tap ▶ to hear them. Pink = right hand, blue = left hand. Tap a circle to fix
            it, or ➕ to add one I missed. Small grace notes are left out.
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
            <button className={`btn ${adding ? 'primary' : ''}`} onClick={() => setAdding((a) => !a)}>
              ➕ {adding ? 'Tap where the note goes' : 'Add a note'}
            </button>
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
                  setRes({ ...res, notes: res.notes.filter((n) => n.id !== sel) });
                  setSel(null);
                }}
              >
                🗑 Remove
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
            onClick={onSvgClick}
            className={adding ? 'adding' : ''}
          >
            {res.notes.map((n) => {
              const left = res.staves[n.staff].clef === 'bass' && res.staves.some((s, i) => i !== n.staff && s.system === res.staves[n.staff].system);
              const r = res.space * 0.75;
              const on = n.id === sel || n.id === playingId;
              return (
                <g
                  key={n.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAdding(false);
                    setSel(n.id);
                  }}
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
          </svg>
        )}
      </div>
      {res && (
        <div className="row">
          <button className="btn big primary" disabled={!res.notes.length} onClick={save}>
            ✅ Save song
          </button>
          <span className="muted small">{timeline.length} notes</span>
        </div>
      )}
    </div>
  );
}
