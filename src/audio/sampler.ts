// "Make your own sound": record one short sound from the mic (a cough, a clap,
// a sung note) and keep it on this device so it can be played across the keyboard.
import { getAudioContext, mic } from './mic';
import { freqToMidiFloat } from './notes';
import { PitchDetector } from './pitch';

export interface MySound {
  id: string;
  name: string;
  emoji: string;
  /** Pitch (fractional midi) the sound plays at unchanged. Middle C for claps and coughs. */
  root: number;
  /** True when we heard a clear note (singing, humming, whistling). */
  pitched: boolean;
  rate: number;
  /** The whole recording, so a trim can always be undone. */
  data: Float32Array;
  /** Part that plays, in samples (defaults to all of it). */
  trimStart?: number;
  trimEnd?: number;
  created: number;
}

export const MAX_MY_SOUNDS = 6;
export const MAX_SAMPLE_SEC = 3;
export const SOUND_EMOJIS = ['🤧', '😮‍💨', '👏', '🎤', '🐶', '🐱', '🦆', '🐸', '🐷', '🦁', '🤖', '👻', '💥', '🥁', '😂', '🍕'];

// ---------- storage (IndexedDB: localStorage is too small for audio) ----------

const DB = 'keyandfiddle-sounds';
const STORE = 'sounds';
let dbP: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbP) {
    dbP = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbP.catch(() => (dbP = null));
  }
  return dbP;
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(r.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

let sounds: MySound[] = [];
let loaded: Promise<MySound[]> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function onMySoundsChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
export function mySounds(): MySound[] {
  return sounds;
}
export function loadMySounds(): Promise<MySound[]> {
  if (!loaded) {
    loaded = tx<MySound[]>('readonly', (s) => s.getAll() as IDBRequest<MySound[]>)
      .then((all) => {
        sounds = all.sort((a, b) => a.created - b.created);
        emit();
        return sounds;
      })
      .catch(() => {
        loaded = null;
        return sounds;
      });
  }
  return loaded;
}
export async function saveMySound(s: MySound) {
  await tx('readwrite', (st) => st.put(s));
  bufCache.delete(s.id);
  sounds = [...sounds.filter((x) => x.id !== s.id), s].sort((a, b) => a.created - b.created);
  emit();
}
export async function deleteMySound(id: string) {
  await tx('readwrite', (st) => st.delete(id));
  sounds = sounds.filter((x) => x.id !== id);
  bufCache.delete(id);
  emit();
}

const bufCache = new Map<string, AudioBuffer>();
/** Audio buffer for a saved sound, or null if it isn't loaded (yet). */
export function mySoundBuffer(id: string): { buf: AudioBuffer; root: number } | null {
  const s = sounds.find((x) => x.id === id);
  if (!s) {
    loadMySounds();
    return null;
  }
  let b = bufCache.get(id);
  if (!b) {
    const ctx = getAudioContext();
    const part = trimmed(s);
    b = ctx.createBuffer(1, part.length, s.rate);
    b.getChannelData(0).set(part);
    bufCache.set(id, b);
  }
  return { buf: b, root: s.root };
}

/** The part of a sound that plays, with tiny fades so trimmed edges don't click. */
export function trimmed(s: MySound): Float32Array {
  const a = Math.max(0, Math.min(s.data.length - 1, s.trimStart ?? 0));
  const b = Math.max(a + 1, Math.min(s.data.length, s.trimEnd ?? s.data.length));
  const y = s.data.slice(a, b);
  const f = Math.min(Math.round(s.rate * 0.005), y.length >> 2);
  for (let i = 0; i < f; i++) {
    y[i] *= i / f;
    y[y.length - 1 - i] *= i / f;
  }
  return y;
}

// ---------- recording ----------

export type RecordOutcome = { ok: true; sound: MySound } | { ok: false; reason: 'quiet' | 'denied' | 'error' };

export interface RecordHandle {
  /** Stop early (keeps what was heard so far). */
  stop(): void;
  done: Promise<RecordOutcome>;
}

/**
 * Listen until the child makes a sound, keep up to two seconds of it, and stop
 * by itself once it goes quiet again. Must be started from a tap on iOS.
 */
export function recordSound(onLevel: (level: number, heard: boolean) => void): RecordHandle {
  let stopNow = () => undefined as void;
  const done = (async (): Promise<RecordOutcome> => {
    const ctx = getAudioContext();
    await ctx.resume().catch(() => undefined);
    let stream = mic.stream;
    let own = false;
    if (!stream || !stream.active) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // auto gain on: iPad mics are much quieter than iPhone ones
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        });
        own = true;
      } catch (e) {
        const n = (e as DOMException)?.name;
        return { ok: false, reason: n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : 'error' };
      }
    }
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(proc);
    proc.connect(mute).connect(ctx.destination);

    const sr = ctx.sampleRate;
    const chunks: Float32Array[] = [];
    let total = 0;
    let startedAt = -1; // sample index where the sound began
    let quietFor = 0;
    let noise = 0.002;

    const result = await new Promise<Float32Array | null>((resolve) => {
      let finished = false;
      const finish = (ok: boolean) => {
        if (finished) return;
        finished = true;
        if (!ok || startedAt < 0) return resolve(null);
        const all = new Float32Array(total);
        let o = 0;
        for (const c of chunks) {
          all.set(c, o);
          o += c.length;
        }
        resolve(all);
      };
      stopNow = () => finish(true);
      proc.onaudioprocess = (e) => {
        const x = e.inputBuffer.getChannelData(0);
        const c = new Float32Array(x);
        let sq = 0;
        for (let i = 0; i < c.length; i++) sq += c[i] * c[i];
        const rms = Math.sqrt(sq / c.length);
        const heard = startedAt >= 0;
        if (!heard) {
          // keep a short pre-roll only, so the start of the sound isn't clipped
          chunks.push(c);
          total += c.length;
          while (chunks.length > 8) total -= chunks.shift()!.length;
          if (rms > Math.max(0.008, noise * 4)) startedAt = total - c.length;
          else noise = noise * 0.9 + rms * 0.1;
        } else {
          chunks.push(c);
          total += c.length;
          // Only stop by itself after a real pause, so a whole word or phrase
          // ("hello!") is kept, not just its first syllable.
          quietFor = rms < Math.max(0.004, noise * 1.8) ? quietFor + c.length : 0;
          const soFar = total - startedAt;
          if ((quietFor > sr * 0.8 && soFar > sr * 0.8) || soFar > sr * MAX_SAMPLE_SEC) finish(true);
        }
        onLevel(Math.min(1, Math.sqrt(rms) * 3), startedAt >= 0);
      };
      // give up if nothing is heard for a while
      setTimeout(() => finish(true), 10000);
    });

    proc.onaudioprocess = null;
    src.disconnect();
    proc.disconnect();
    if (own) stream.getTracks().forEach((t) => t.stop());
    if (!result) return { ok: false, reason: 'quiet' };
    const shaped = shapeSample(result, sr);
    if (!shaped) return { ok: false, reason: 'quiet' };
    const { root, pitched } = findRoot(shaped, sr);
    const n = sounds.length;
    const sound: MySound = {
      id: `s${Date.now().toString(36)}`,
      name: `Sound ${n + 1}`,
      emoji: pitched ? '🎤' : SOUND_EMOJIS[n % 3 === 0 ? 0 : n % 3 === 1 ? 2 : 1],
      root,
      pitched,
      rate: sr,
      data: shaped,
      created: Date.now(),
    };
    return { ok: true, sound };
  })().catch((): RecordOutcome => ({ ok: false, reason: 'error' }));
  return { stop: () => stopNow(), done };
}

/** Trim silence, cap the length, make it loud and click-free. */
export function shapeSample(x: Float32Array, sr: number): Float32Array | null {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak < 0.006) return null;
  let a = 0;
  while (a < x.length && Math.abs(x[a]) < peak * 0.05) a++;
  a = Math.max(0, a - Math.round(sr * 0.03));
  let b = x.length - 1;
  while (b > a && Math.abs(x[b]) < peak * 0.015) b--;
  b = Math.min(x.length, b + Math.round(sr * 0.15), a + Math.round(sr * MAX_SAMPLE_SEC));
  if (b - a < sr * 0.03) return null;
  const y = x.slice(a, b);
  const g = 0.9 / peak;
  const fin = Math.round(sr * 0.002);
  const fout = Math.min(Math.round(sr * 0.03), y.length >> 2);
  for (let i = 0; i < y.length; i++) {
    let v = y[i] * g;
    if (i < fin) v *= i / fin;
    const r = y.length - 1 - i;
    if (r < fout) v *= r / fout;
    y[i] = v;
  }
  return y;
}

/**
 * If the sound is a clear note (singing, humming), use its real pitch so the
 * keyboard plays in tune. Otherwise (cough, clap, sneeze) it plays as-is on middle C.
 */
export function findRoot(y: Float32Array, sr: number): { root: number; pitched: boolean } {
  const N = 2048;
  const det = new PitchDetector(N, sr, 70, 1500);
  const found: number[] = [];
  let windows = 0;
  for (let i = 0; i + N <= y.length; i += N >> 1) {
    windows++;
    const r = det.detect(y.subarray(i, i + N));
    if (r.freq > 0 && r.clarity > 0.9) found.push(freqToMidiFloat(r.freq));
  }
  if (windows === 0 || found.length < Math.max(3, windows * 0.5)) return { root: 60, pitched: false };
  found.sort((p, q) => p - q);
  let root = found[found.length >> 1];
  while (root < 48) root += 12;
  while (root > 76) root -= 12;
  return { root, pitched: true };
}
