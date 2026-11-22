import { Icon } from "../ui/Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { finish, type RawNote } from "../audio/importScore";
import { midiName } from "../audio/notes";
import { playNote } from "../audio/synth";
import {
  type OmrNote,
  type OmrResult,
  applyWarp,
  findWarp,
  noteMidi,
  recognize,
  toTimeline,
} from "./omr";
import { isPicture, saveScore, type StoredScore } from "../ui/importedSongs";

const KEYS = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7];
const keyLabel = (k: number) =>
  k === 0
    ? "no sharps or flats"
    : k > 0
      ? `${k} sharp${k > 1 ? "s" : ""} ♯`
      : `${-k} flat${k < -1 ? "s" : ""} ♭`;
const LENGTHS: [number, string][] = [
  [0.25, "𝅘𝅥𝅯 ¼ beat"],
  [0.5, "♪ ½ beat"],
  [0.75, "♪. ¾ beat"],
  [1, "♩ 1 beat"],
  [1.5, "♩. 1½ beats"],
  [2, "𝅗𝅥 2 beats"],
  [3, "𝅗𝅥. 3 beats"],
  [4, "𝅝 4 beats"],
];

async function loadGray(
  file: File,
  width?: number,
): Promise<{ w: number; h: number; data: Uint8Array; url: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode().catch(() => {
    throw new Error(
      "I couldn't open that picture. Try a screenshot (PNG or JPEG).",
    );
  });
  // work at a size where a staff space is roughly 10-20 pixels
  let scale = 1;
  if (width) scale = width / img.naturalWidth;
  else if (img.naturalWidth > 2000) scale = 2000 / img.naturalWidth;
  else if (img.naturalWidth < 1300) scale = 1300 / img.naturalWidth;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const px = id.data;
  let data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++)
    data[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
  // a photo of a book page is usually a little tilted and curved: level the
  // staff lines first, and show the levelled picture so the notes line up
  const warp = findWarp({ w, h, data });
  if (warp.max <= 1) return { w, h, data, url };
  data = new Uint8Array(applyWarp(data, w, h, warp));
  ctx.putImageData(new ImageData(applyWarp(px, w, h, warp, 4), w, h), 0, 0);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
  if (!blob) return { w, h, data, url };
  URL.revokeObjectURL(url);
  return { w, h, data, url: URL.createObjectURL(blob) };
}

export const MAX_PAGES = 5;

/** Read one picture, trying again at a bigger size when the print is small. */
async function readPage(file: File): Promise<{ img: string; res: OmrResult }> {
  const g = await loadGray(file);
  await new Promise((r) => setTimeout(r, 30)); // let "reading" paint first
  let r: OmrResult;
  try {
    r = recognize(g);
  } catch (e) {
    URL.revokeObjectURL(g.url);
    throw e;
  }
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
  return { img: g.url, res: r };
}

interface Page {
  key: number;
  file: File;
  img: string | null;
  res: OmrResult | null;
  err: string | null;
  /** notes switched off with a tap: kept on screen (dimmed) so a second tap brings them back */
  off: Set<number>;
}
const NO_OFF = new Set<number>();
let pageKey = 0;
const newPage = (file: File): Page => ({ key: ++pageKey, file, img: null, res: null, err: null, off: new Set() });

export function PhotoImport({
  files,
  onDone,
  onCancel,
}: {
  files: File[];
  onDone: (s: StoredScore) => void;
  onCancel: () => void;
}) {
  const [pages, setPages] = useState<Page[]>(() => files.slice(0, MAX_PAGES).map(newPage));
  const [pi, setPi] = useState(0);
  const page = pages[pi] as Page | undefined;
  const img = page?.img ?? null;
  const res = page?.res ?? null;
  const off = page?.off ?? NO_OFF;
  const setPage = (i: number, fn: (p: Page) => Page) => setPages((ps) => ps.map((p, k) => (k === i ? fn(p) : p)));
  const setRes = (r: OmrResult) => setPage(pi, (p) => ({ ...p, res: r }));
  const setOff = (v: Set<number> | ((o: Set<number>) => Set<number>)) =>
    setPage(pi, (p) => ({ ...p, off: typeof v === "function" ? v(p.off) : v }));
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const press = useRef<{ id: number; timer: number; long: boolean } | null>(
    null,
  );
  const [title, setTitle] = useState("My sheet music");
  const [bpm, setBpm] = useState(80);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  // read the pages one at a time, in order
  const reading = useRef<number | null>(null);
  useEffect(() => {
    const next = pages.find((p) => !p.res && !p.err);
    if (!next || reading.current !== null) return;
    reading.current = next.key;
    readPage(next.file)
      .then(({ img, res }) => setPages((ps) => ps.map((p) => (p.key === next.key ? { ...p, img, res } : p))))
      .catch((e) => setPages((ps) => ps.map((p) => (p.key === next.key ? { ...p, err: (e as Error).message } : p))))
      .finally(() => {
        reading.current = null;
        setPages((ps) => [...ps]); // look for the next page
      });
  }, [pages]);
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  useEffect(
    () => () => {
      pagesRef.current.forEach((p) => p.img && URL.revokeObjectURL(p.img));
      timers.current.forEach(clearTimeout);
    },
    [],
  );
  const addPages = (fs: File[]) => {
    const room = MAX_PAGES - pages.length;
    const add = fs.filter(isPicture).slice(0, room).map(newPage);
    if (!add.length) return;
    setPages((ps) => [...ps, ...add]);
    setPi(pages.length);
    setSel(null);
  };
  const movePage = (d: -1 | 1) => {
    const j = pi + d;
    if (j < 0 || j >= pages.length) return;
    setPages((ps) => {
      const n = [...ps];
      [n[pi], n[j]] = [n[j], n[pi]];
      return n;
    });
    setPi(j);
  };
  const removePage = () => {
    if (pages.length < 2) return;
    const p = pages[pi];
    if (p.img) URL.revokeObjectURL(p.img);
    setPages((ps) => ps.filter((_, k) => k !== pi));
    setPi(Math.max(0, pi - 1));
    setSel(null);
    setUndo([]);
    setRedo([]);
  };

  // undo / redo: every change saves what was there before
  type Snap = { key: number; res: OmrResult; off: Set<number> };
  const [undoStack, setUndo] = useState<Snap[]>([]);
  const [help, setHelp] = useState(false);
  const [redoStack, setRedo] = useState<Snap[]>([]);
  const snap = () => {
    if (!res) return;
    setUndo((u) => [...u.slice(-99), { key: page!.key, res, off }]);
    setRedo([]);
  };
  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    const i = pages.findIndex((p) => p.key === last.key);
    if (i < 0) return;
    const cur = pages[i];
    setRedo((r) => [...r, { key: cur.key, res: cur.res!, off: cur.off }]);
    setUndo((u) => u.slice(0, -1));
    setPage(i, (p) => ({ ...p, res: last.res, off: last.off }));
    setPi(i);
    setSel(null);
  };
  const redo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    const i = pages.findIndex((p) => p.key === next.key);
    if (i < 0) return;
    const cur = pages[i];
    setUndo((u) => [...u, { key: cur.key, res: cur.res!, off: cur.off }]);
    setRedo((r) => r.slice(0, -1));
    setPage(i, (p) => ({ ...p, res: next.res, off: next.off }));
    setPi(i);
    setSel(null);
  };

  // zoom: pinch on the music, or the − / + buttons
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const zoomTo = (z: number, cx?: number, cy?: number) => {
    const el = scrollerRef.current;
    const nz = Math.max(1, Math.min(5, z));
    if (!el) return;
    const r = el.getBoundingClientRect();
    // keep the point under the fingers (or the middle) in place
    const px = (cx ?? r.left + r.width / 2) - r.left;
    const py = (cy ?? r.top + r.height / 2) - r.top;
    const k = nz / zoomRef.current;
    const sl = (el.scrollLeft + px) * k - px;
    const st = (el.scrollTop + py) * k - py;
    zoomRef.current = nz;
    setZoom(nz);
    requestAnimationFrame(() => {
      el.scrollLeft = sl;
      el.scrollTop = st;
    });
  };
  const pinch = useRef<{ d: number; z: number } | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const dist = (e: TouchEvent) =>
      Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch.current = { d: dist(e), z: zoomRef.current };
        onSheetCancelRef.current();
        cancelPressRef.current();
      }
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return;
      e.preventDefault();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomTo((pinch.current.z * dist(e)) / pinch.current.d, cx, cy);
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch.current = null;
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [img]);

  const timeline = useMemo(
    () =>
      res
        ? toTimeline({ ...res, notes: res.notes.filter((n) => !off.has(n.id)) })
        : [],
    [res, off],
  );
  const toggle = (id: number) => {
    snap();
    setOff((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  // tap = switch the note off/on, press and hold = fix it (pitch, sharp/flat, length)
  const downOn = (id: number) => {
    if (press.current) clearTimeout(press.current.timer);
    const p = { id, long: false, timer: 0 };
    p.timer = window.setTimeout(() => {
      p.long = true;
      if (pinch.current) return;
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
    if (!p.long && !pinch.current) {
      toggle(id);
      if (sel === id) setSel(null);
    }
  };
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };
  const cancelPressRef = useRef(cancelPress);
  cancelPressRef.current = cancelPress;
  const selNote = res?.notes.find((n) => n.id === sel) ?? null;

  const update = (fn: (n: OmrNote) => void) => {
    if (!res || !selNote) return;
    const notes = res.notes.map((n) => (n.id === sel ? { ...n } : n));
    fn(notes.find((n) => n.id === sel)!);
    snap();
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
        window.setTimeout(
          () => {
            playNote(n.midi, Math.max(0.2, n.beats * spb), n.left ? 0.5 : 0.7);
            setPlayingId(n.id);
          },
          n.beat * spb * 1000,
        ),
      );
    }
    const end = Math.max(0, ...timeline.map((n) => n.beat + n.beats));
    timers.current.push(
      window.setTimeout(() => setPlayingId(null), end * spb * 1000 + 300),
    );
  };

  // add a note: put a finger on an empty spot, slide up/down to the right line or
  // space (the name shows as you go), lift to place it
  const [ghost, setGhost] = useState<OmrNote | null>(null);
  const ghostAt = (
    clientX: number,
    clientY: number,
    staff?: number,
    x0?: number,
  ): OmrNote | null => {
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
    const step = Math.max(
      -8,
      Math.min(16, Math.round((st.lines[4] - y) / (st.space / 2))),
    );
    // same length as the nearest note in that staff, so a run of eighths stays eighths
    const near = res.notes
      .filter((o) => o.staff === si && !o.grace && !off.has(o.id))
      .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    const id = Math.max(0, ...res.notes.map((n) => n.id)) + 1;
    return {
      id,
      x,
      y: st.lines[4] - (step * st.space) / 2,
      staff: si,
      step,
      filled: true,
      stem: true,
      beams: 0,
      dotted: false,
      beats: near?.beats ?? 1,
    };
  };
  // a quick swipe still scrolls the page; a finger that rests for a moment grabs a
  // new note, and a quick tap drops one right where it landed
  const pending = useRef<{
    x: number;
    y: number;
    timer: number;
    moved: boolean;
  } | null>(null);
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
    svg.addEventListener("touchmove", stopScroll, { passive: false });
    return () => svg.removeEventListener("touchmove", stopScroll);
  }, [res !== null]);
  const place = (g: OmrNote) => {
    if (!res) return;
    snap();
    setRes({ ...res, notes: [...res.notes, g] });
    playNote(noteMidi(g, res.staves[g.staff], res.keySig), 0.4, 0.6);
  };
  const onSheetDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!res) return;
    if (!e.isPrimary || pinch.current) {
      onSheetCancel();
      return;
    }
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
  const onSheetCancelRef = useRef(onSheetCancel);
  onSheetCancelRef.current = onSheetCancel;

  const save = () => {
    if (!pages.some((p) => p.res)) return;
    // pages play one after another
    const all: typeof timeline = [];
    let at = 0;
    for (const p of pages) {
      if (!p.res) continue;
      const tl = toTimeline({ ...p.res, notes: p.res.notes.filter((n) => !p.off.has(n.id)) });
      for (const n of tl) all.push({ ...n, beat: n.beat + at });
      at += Math.max(0, ...tl.map((n) => n.beat + n.beats));
    }
    const raw: RawNote[] = all.map((n) => ({
      midi: n.midi,
      beat: n.beat,
      beats: n.beats,
      part: 0,
      staff: n.left ? 2 : 1,
      voice: "1",
    }));
    try {
      const sc = finish({ title, bpm, notes: raw }, title);
      onDone(saveScore(sc));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (err || (pages.length === 1 && page?.err))
    return (
      <div className="panel">
        <h2>Reading your sheet music</h2>
        <div className="toast warn">{err ?? page?.err}</div>
        <p className="muted small">
          Works best with a clear, straight screenshot of printed music (not
          handwriting).
        </p>
        <button className="btn" onClick={onCancel}>
          <Icon name="back" /> Back
        </button>
      </div>
    );

  const midiOf = (n: OmrNote) =>
    res ? noteMidi(n, res.staves[n.staff], res.keySig) : 0;

  return (
    <div className="panel photo-import">
      <div className="pi-head">
        <button className="btn small ghost" onClick={onCancel} aria-label="Cancel">
          <Icon name="back" /> Cancel
        </button>
        <h2>
          Check the notes
          {res && <span className="pi-count">{timeline.length} notes{off.size ? ` · ${off.size} off` : ""}</span>}
        </h2>
        {res && (
          <button
            className="btn primary pi-save"
            disabled={!res.notes.length || pages.some((p) => !p.res && !p.err)}
            onClick={save}
          >
            <Icon name="check" size={18} /> Save
          </button>
        )}
      </div>
      <div className="row wrap pi-pages">
        {pages.map((p, i) => (
          <button
            key={p.key}
            className={`btn small ${i === pi ? "primary" : "ghost"}`}
            onClick={() => {
              setPi(i);
              setSel(null);
            }}
          >
            {p.err ? "⚠️ " : p.res ? "" : "… "}Page {i + 1}
          </button>
        ))}
        {pages.length > 1 && (
          <>
            <button className="btn small" disabled={pi === 0} onClick={() => movePage(-1)} aria-label="Move page earlier">
              <Icon name="back" size={16} /> Move
            </button>
            <button className="btn small" disabled={pi === pages.length - 1} onClick={() => movePage(1)} aria-label="Move page later">
              Move ▶
            </button>
            <button className="btn small" onClick={removePage}>
              <Icon name="trash" size={16} /> Remove page
            </button>
          </>
        )}
        {pages.length < MAX_PAGES && (
          <button className="btn small" onClick={() => addRef.current?.click()}>
            <Icon name="plus" size={16} /> Add a page
          </button>
        )}
        <input
          ref={addRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addPages([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {page?.err && <div className="toast warn">Page {pi + 1}: {page.err}</div>}
      {!res && !page?.err && <p className="muted">Reading page {pi + 1}…</p>}
      {res && (
        <>
          <div className="pi-legend">
            <span><i className="pi-key r" /> Right hand</span>
            <span><i className="pi-key l" /> Left hand</span>
            <button className="btn small ghost" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
              <Icon name="help" size={16} /> How to fix notes
            </button>
          </div>
          {help && (
            <ul className="pi-helplist muted small">
              <li><b>Tap a circle</b> to switch a wrong note off. Tap again to bring it back.</li>
              <li><b>Tap an empty spot</b> to add a note I missed, or <b>hold and slide</b> up or down to pick its pitch.</li>
              <li><b>Press and hold a circle</b> to change its pitch, sharp or flat, or length.</li>
              <li><b>Pinch</b> the music to zoom.</li>
            </ul>
          )}
          <div className="row wrap pi-tools">
            <button
              className="btn small"
              disabled={!undoStack.length}
              onClick={undo}
            >
              <Icon name="undo" size={18} /> Undo
            </button>
            <button
              className="btn small"
              disabled={!redoStack.length}
              onClick={redo}
            >
              <Icon name="redo" size={18} /> Redo
            </button>
            <span className="pi-zoom-btns">
              <button
                className="btn small"
                disabled={zoom <= 1}
                onClick={() => zoomTo(zoomRef.current / 1.5)}
                aria-label="Zoom out"
              >
                <Icon name="minus" size={18} />
              </button>
              <span className="muted small">{Math.round(zoom * 100)}%</span>
              <button
                className="btn small"
                disabled={zoom >= 5}
                onClick={() => zoomTo(zoomRef.current * 1.5)}
                aria-label="Zoom in"
              >
                <Icon name="plus" size={18} />
              </button>
            </span>
          </div>
          <div className="row wrap pi-controls">
            <label className="field">
              Name
              <input
                className="name-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="field">
              Key
              <select
                value={res.keySig}
                onChange={(e) => {
                  snap();
                  setRes({ ...res, keySig: +e.target.value });
                }}
              >
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
                <Icon name="play" size={16} /> Hear it
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
              <button
                className="btn small"
                onClick={() => update((n) => (n.step += 1))}
              >
                ▲ higher
              </button>
              <button
                className="btn small"
                onClick={() => update((n) => (n.step -= 1))}
              >
                ▼ lower
              </button>
              <select
                value={selNote.acc === undefined ? "k" : String(selNote.acc)}
                onChange={(e) =>
                  update(
                    (n) =>
                      (n.acc =
                        e.target.value === "k" ? undefined : +e.target.value),
                  )
                }
              >
                <option value="k">as in key</option>
                <option value="1">♯ sharp</option>
                <option value="-1">♭ flat</option>
                <option value="0">♮ natural</option>
              </select>
              <select
                value={selNote.beats}
                onChange={(e) => update((n) => (n.beats = +e.target.value))}
              >
                {!LENGTHS.some(([b]) => b === selNote.beats) && (
                  <option value={selNote.beats}>{selNote.beats} beats</option>
                )}
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
      <div className="pi-scroller" ref={scrollerRef}>
        <div className="pi-sheet" style={{ width: `${zoom * 100}%` }}>
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
                const left = res.staves.some(
                  (s, i) =>
                    i < n.staff && s.system === res.staves[n.staff].system,
                );
                const r = res.space * 0.75;
                const on = n.id === sel || n.id === playingId;
                const isOff = off.has(n.id);
                return (
                  <g
                    key={n.id}
                    className={isOff ? "pi-off" : ""}
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
                      className={`pi-dot ${left ? "left" : "right"} ${on ? "on" : ""}`}
                      strokeWidth={Math.max(1.5, res.space * 0.18)}
                    />
                    <text
                      x={n.x}
                      y={n.y - r * 1.25}
                      fontSize={res.space * 1.05}
                      className="pi-label"
                    >
                      {midiName(midiOf(n)).replace(/-?\d+$/, "")}
                    </text>
                  </g>
                );
              })}
              {ghost && (
                <g className="pi-ghost">
                  <ellipse
                    cx={ghost.x}
                    cy={ghost.y}
                    rx={res.space * 0.86}
                    ry={res.space * 0.75}
                    className="pi-dot on"
                    strokeWidth={Math.max(1.5, res.space * 0.18)}
                  />
                  <text
                    x={ghost.x}
                    y={ghost.y - res.space * 1.3}
                    fontSize={res.space * 1.6}
                    className="pi-label"
                  >
                    {midiName(midiOf(ghost))}
                  </text>
                </g>
              )}
            </svg>
          )}
        </div>
      </div>
      {res && pages.some((p) => !p.res && !p.err) && (
        <p className="muted small">Still reading the other pages…</p>
      )}
    </div>
  );
}
