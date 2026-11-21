// Shared output bus: everything the app plays goes through one gain + limiter.
import { getAudioContext } from './mic';

let master: GainNode | null = null;
export function out(): GainNode {
  const ctx = getAudioContext();
  if (!master) {
    master = ctx.createGain();
    master.gain.value = 0.5;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  return master;
}
