// Which sound the touch violin makes: the bowed-string violin and a few
// variations of it, some silly synth voices, or one of the child's own
// recorded sounds (shared with the piano's "My sounds").
import { useSyncExternalStore } from 'react';
import { loadMySounds } from '../../audio/sampler';

export type BuiltInViolinVoice = 'violin' | 'concert' | 'fiddle' | 'cello' | 'cat' | 'ghost' | 'robot';
export type ViolinVoice = BuiltInViolinVoice | `mine:${string}`;

export const VIOLIN_VOICES: { id: BuiltInViolinVoice; name: string; emoji: string }[] = [
  { id: 'violin', name: 'Violin', emoji: '🎻' },
  { id: 'concert', name: 'Concert hall', emoji: '✨' },
  { id: 'fiddle', name: 'Country fiddle', emoji: '🤠' },
  { id: 'cello', name: 'Big cello', emoji: '🐻' },
  { id: 'cat', name: 'Meow cat', emoji: '🐱' },
  { id: 'ghost', name: 'Spooky ghost', emoji: '👻' },
  { id: 'robot', name: 'Robot', emoji: '🤖' },
];

/** Voices played by the bowed-string model (the rest are synthesised or recorded). */
export const MODEL_VOICES = new Set<string>(['violin', 'concert', 'fiddle', 'cello']);

const KEY = 'kf.tv.voice';
let current: ViolinVoice = (() => {
  try {
    const v = localStorage.getItem(KEY) as ViolinVoice | null;
    if (v && (v.startsWith('mine:') || VIOLIN_VOICES.some((x) => x.id === v))) return v;
  } catch {
    /* private mode */
  }
  return 'violin';
})();
if (current.startsWith('mine:')) loadMySounds();
const subs = new Set<() => void>();

export function getViolinVoice(): ViolinVoice {
  return current;
}
export function setViolinVoice(v: ViolinVoice) {
  if (v === current) return;
  current = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* private mode */
  }
  if (v.startsWith('mine:')) loadMySounds();
  subs.forEach((s) => s());
}
export function onViolinVoiceChange(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}
export function useViolinVoice(): ViolinVoice {
  return useSyncExternalStore(onViolinVoiceChange, getViolinVoice, getViolinVoice);
}
