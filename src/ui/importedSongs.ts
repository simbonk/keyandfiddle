import { useSyncExternalStore } from 'react';
import type { Song } from '../audio/notes';
import { type ImportedScore, importScoreFile } from '../audio/importScore';

export interface StoredScore extends ImportedScore {
  id: string;
  createdAt: number;
}

const KEY = 'kf.imported.v1';
const listeners = new Set<() => void>();
let cache: StoredScore[] | null = null;

function load(): StoredScore[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    cache = [];
  }
  return cache!;
}
function save(list: StoredScore[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: keep for this visit */
  }
  listeners.forEach((l) => l());
}

export function useImportedScores(): StoredScore[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    load,
    load,
  );
}

export function saveScore(s: ImportedScore): StoredScore {
  const stored: StoredScore = { ...s, id: Math.random().toString(36).slice(2, 10), createdAt: Date.now() };
  save([stored, ...load()]);
  return stored;
}

export async function addScoreFile(file: File): Promise<StoredScore> {
  return saveScore(await importScoreFile(file.name, await file.arrayBuffer()));
}

export function isPicture(file: File) {
  return file.type.startsWith('image/') || /\.(png|jpe?g|heic|heif|webp|gif|bmp)$/i.test(file.name);
}

export function removeScore(id: string) {
  save(load().filter((s) => s.id !== id));
}

export function scoreToSong(s: StoredScore, instrument: 'piano' | 'violin'): Song {
  const notes = instrument === 'violin' ? s.melody : s.notes;
  const chords = new Set(notes.map((n) => n.beat)).size < notes.length;
  return {
    id: `imp-${s.id}`,
    title: s.title,
    emoji: '📄',
    bpm: s.bpm,
    level: chords || notes.length > 120 ? 3 : notes.length > 50 ? 2 : 1,
    blurb: 'From your sheet music',
    notes,
  };
}
