// Turn the user's own sheet music files (MusicXML, compressed .mxl, or MIDI)
// into notes the highways can play. Everything runs on the device.

import type { SongNote } from './notes';

export interface ImportedScore {
  title: string;
  bpm: number;
  /** All notes (both hands). tag "L" marks the left hand / lower staff. */
  notes: SongNote[];
  /** A single-line melody (top voice of the first part), for the violin. */
  melody: SongNote[];
}

export interface RawNote {
  midi: number;
  beat: number;
  beats: number;
  part: number;
  staff: number;
  voice: string;
}

const round = (x: number) => Math.round(x * 96) / 96;

export async function importScoreFile(name: string, data: ArrayBuffer): Promise<ImportedScore> {
  const bytes = new Uint8Array(data);
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'My song';
  // MIDI files start with "MThd", zip (.mxl) with "PK"
  if (bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64) {
    return finish(parseMidi(bytes), base);
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const xml = await mxlToXml(bytes);
    return finish(parseMusicXml(xml), base);
  }
  const text = new TextDecoder().decode(bytes);
  if (/<score-(partwise|timewise)/.test(text)) return finish(parseMusicXml(text), base);
  if (/^%PDF/.test(text)) {
    throw new Error(
      "That's a PDF, which I can't open yet. Take a screenshot of the page and import the picture instead, or save it as MusicXML or MIDI from a sheet music app.",
    );
  }
  throw new Error("I couldn't read that file. Try a photo or screenshot of the music, a MusicXML file (.musicxml, .xml, .mxl), or a MIDI file (.mid).");
}

export function finish(r: { title?: string; bpm: number; notes: RawNote[] }, fallback: string): ImportedScore {
  const raw = r.notes.filter((n) => n.beats > 0.01);
  if (!raw.length) throw new Error('I found no notes in that file.');
  const first = Math.min(...raw.map((n) => n.beat));
  // start the song on its first note (skip pickup rests), keep whole-beat alignment
  const shift = Math.floor(first);
  const multiStaff = raw.some((n) => n.staff > 1) || new Set(raw.map((n) => n.part)).size > 1;
  const notes: SongNote[] = raw
    .map((n) => {
      const left = multiStaff ? n.staff > 1 || n.part > 0 : n.midi < 60;
      return { midi: n.midi, beat: round(n.beat - shift), beats: round(n.beats), tag: left ? 'L' : undefined };
    })
    .sort((a, b) => a.beat - b.beat || b.midi! - a.midi!);
  return {
    title: (r.title || '').trim() || fallback,
    bpm: Math.min(240, Math.max(30, Math.round(r.bpm || 100))),
    notes,
    melody: melodyLine(raw, shift),
  };
}

/** Top line of the first part/staff, one note at a time, moved into violin first-position range. */
export function melodyLine(ns: RawNote[], shift = 0): SongNote[] {
  const parts = [...new Set(ns.map((n) => n.part))].sort((a, b) => a - b);
  let pool = ns.filter((n) => n.part === parts[0] && n.staff <= 1);
  if (!pool.length) pool = ns;
  const byBeat = new Map<number, RawNote>();
  for (const n of pool) {
    const k = round(n.beat);
    const cur = byBeat.get(k);
    if (!cur || n.midi > cur.midi) byBeat.set(k, n);
  }
  const line = [...byBeat.values()].sort((a, b) => a.beat - b.beat);
  const out: SongNote[] = [];
  for (let i = 0; i < line.length; i++) {
    const n = line[i];
    const next = line[i + 1];
    const beats = next ? Math.min(n.beats, next.beat - n.beat) : n.beats;
    out.push({ midi: n.midi, beat: round(n.beat - shift), beats: round(beats) });
  }
  // violin first position: G3 (55) .. B5 (83)
  const LO = 55;
  const HI = 83;
  const ms = out.map((n) => n.midi!);
  const lo = Math.min(...ms);
  const hi = Math.max(...ms);
  let t = 0;
  while (lo + t < LO && hi + t + 12 <= HI + 12) t += 12;
  while (hi + t > HI && lo + t - 12 >= LO) t -= 12;
  for (const n of out) {
    let m = n.midi! + t;
    while (m < LO) m += 12;
    while (m > HI) m -= 12;
    n.midi = m;
  }
  return out;
}

// ---------------- MusicXML ----------------

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function parseMusicXml(xml: string): { title?: string; bpm: number; notes: RawNote[] } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error("That MusicXML file looks damaged.");
  const kid = (el: Element, tag: string) => {
    for (const c of Array.from(el.children)) if (c.tagName === tag) return c;
    return null;
  };
  const txt = (el: Element | null | undefined) => el?.textContent?.trim() ?? '';
  const title =
    txt(doc.querySelector('work > work-title')) || txt(doc.querySelector('movement-title')) || undefined;
  let bpm = 0;
  const notes: RawNote[] = [];
  const open = new Map<string, RawNote>(); // tied notes waiting for their continuation
  const parts = Array.from(doc.getElementsByTagName('part'));
  parts.forEach((part, pi) => {
    let divisions = 1;
    let pos = 0; // in quarter notes
    let lastStart = 0;
    for (const measure of Array.from(part.children)) {
      if (measure.tagName !== 'measure') continue;
      const mStart = pos;
      let mEnd = pos;
      for (const el of Array.from(measure.children)) {
        switch (el.tagName) {
          case 'attributes': {
            const d = kid(el, 'divisions');
            if (d) divisions = Number(txt(d)) || divisions;
            break;
          }
          case 'sound': {
            const t = Number(el.getAttribute('tempo'));
            if (t && !bpm) bpm = t;
            break;
          }
          case 'direction': {
            const s = el.getElementsByTagName('sound')[0];
            const t = Number(s?.getAttribute('tempo'));
            if (t && !bpm) bpm = t;
            const pm = el.getElementsByTagName('per-minute')[0];
            const unit = txt(el.getElementsByTagName('beat-unit')[0]);
            if (pm && !bpm) {
              const mult: Record<string, number> = { half: 2, quarter: 1, eighth: 0.5, whole: 4 };
              bpm = Number(txt(pm)) * (mult[unit] ?? 1) * (el.getElementsByTagName('beat-unit-dot').length ? 1.5 : 1);
            }
            break;
          }
          case 'backup':
            pos -= Number(txt(kid(el, 'duration'))) / divisions;
            break;
          case 'forward':
            pos += Number(txt(kid(el, 'duration'))) / divisions;
            mEnd = Math.max(mEnd, pos);
            break;
          case 'note': {
            if (kid(el, 'grace') || kid(el, 'cue')) break;
            const dur = Number(txt(kid(el, 'duration'))) / divisions || 0;
            const isChord = !!kid(el, 'chord');
            const start = isChord ? lastStart : pos;
            if (!isChord) {
              lastStart = pos;
              pos += dur;
              mEnd = Math.max(mEnd, pos);
            }
            const pitch = kid(el, 'pitch');
            if (!pitch || kid(el, 'rest')) break;
            const midi =
              (Number(txt(kid(pitch, 'octave'))) + 1) * 12 +
              (STEP[txt(kid(pitch, 'step'))] ?? 0) +
              Math.round(Number(txt(kid(pitch, 'alter'))) || 0);
            const staff = Number(txt(kid(el, 'staff'))) || 1;
            const voice = txt(kid(el, 'voice')) || '1';
            const ties = Array.from(el.children).filter((c) => c.tagName === 'tie').map((c) => c.getAttribute('type'));
            const key = `${pi}/${staff}/${midi}`;
            const prev = open.get(key);
            if (ties.includes('stop') && prev && Math.abs(prev.beat + prev.beats - start) < 0.02) {
              prev.beats += dur;
              if (!ties.includes('start')) open.delete(key);
              break;
            }
            const n: RawNote = { midi, beat: start, beats: dur, part: pi, staff, voice };
            notes.push(n);
            if (ties.includes('start')) open.set(key, n);
            break;
          }
        }
      }
      pos = Math.max(mEnd, mStart);
    }
  });
  return { title, bpm: bpm || 100, notes };
}

// ---------------- compressed MusicXML (.mxl = zip) ----------------

export async function mxlToXml(z: Uint8Array): Promise<string> {
  const files = await unzip(z);
  const dec = (b: Uint8Array) => new TextDecoder().decode(b);
  const container = files.get('META-INF/container.xml');
  let path = container ? /full-path="([^"]+)"/.exec(dec(container))?.[1] : undefined;
  if (!path || !files.has(path)) path = [...files.keys()].find((k) => !k.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(k));
  if (!path) throw new Error('No music found inside that .mxl file.');
  return dec(files.get(path)!);
}

async function unzip(z: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  let eocd = -1;
  for (let i = z.length - 22; i >= Math.max(0, z.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('That .mxl file looks damaged.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(z.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    const lstart = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = z.subarray(lstart, lstart + csize);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflate(raw));
  }
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------- MIDI ----------------

export function parseMidi(b: Uint8Array): { title?: string; bpm: number; notes: RawNote[] } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const str = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (str(0, 4) !== 'MThd') throw new Error('Not a MIDI file.');
  const hlen = dv.getUint32(4);
  const ntracks = dv.getUint16(10);
  const div = dv.getUint16(12);
  if (div & 0x8000) throw new Error("This MIDI file uses a timing format I can't read.");
  let p = 8 + hlen;
  let bpm = 0;
  let title: string | undefined;
  const notes: RawNote[] = [];
  let noteTrack = 0;
  for (let t = 0; t < ntracks && p + 8 <= b.length; t++) {
    const len = dv.getUint32(p + 4);
    const isTrack = str(p, 4) === 'MTrk';
    let q = p + 8;
    const end = Math.min(b.length, q + len);
    p = q + len;
    if (!isTrack) continue;
    let tick = 0;
    let status = 0;
    const on = new Map<number, { tick: number }>();
    let found = 0;
    const vlq = () => {
      let v = 0;
      for (let k = 0; k < 4; k++) {
        const c = b[q++];
        v = (v << 7) | (c & 0x7f);
        if (!(c & 0x80)) break;
      }
      return v;
    };
    while (q < end) {
      tick += vlq();
      let s = b[q];
      if (s & 0x80) q++;
      else s = status;
      if (s === 0xff) {
        const type = b[q++];
        const l = vlq();
        if (type === 0x51 && !bpm) bpm = 60000000 / ((b[q] << 16) | (b[q + 1] << 8) | b[q + 2]);
        if (type === 0x03 && t === 0 && !title) title = new TextDecoder().decode(b.subarray(q, q + l));
        q += l;
        continue;
      }
      if (s === 0xf0 || s === 0xf7) {
        q += vlq();
        continue;
      }
      status = s;
      const kind = s & 0xf0;
      const ch = s & 0x0f;
      const d1 = b[q++];
      const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : b[q++];
      if (ch === 9) continue; // drums
      const key = (ch << 8) | d1;
      if (kind === 0x90 && d2 > 0) {
        if (!on.has(key)) on.set(key, { tick });
      } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
        const st = on.get(key);
        if (st) {
          on.delete(key);
          notes.push({ midi: d1, beat: st.tick / div, beats: (tick - st.tick) / div, part: noteTrack, staff: 1, voice: String(ch) });
          found++;
        }
      }
    }
    if (found) noteTrack++;
  }
  return { title, bpm: bpm || 100, notes };
}
