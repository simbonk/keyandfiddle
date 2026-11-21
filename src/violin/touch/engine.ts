// Main-thread side of the touch violin's sound: loads the bowed-string
// worklet once, adds a little room reverb, and sends string updates.
import { getAudioContext } from '../../audio/mic';
import { out } from '../../audio/output';
import processorUrl from './violinProcessor.ts?worker&url';
import type { StringMsg } from './violinProcessor';

let node: AudioWorkletNode | null = null;
let loading: Promise<AudioWorkletNode | null> | null = null;

function roomImpulse(ctx: BaseAudioContext, seconds = 1.6) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      // darker as it decays, like a wooden room
      const k = 0.25 + 0.6 * t;
      lp += ((Math.random() * 2 - 1) - lp) * (1 - k);
      d[i] = lp * Math.pow(1 - t, 3.2) * (i < 200 ? i / 200 : 1);
    }
  }
  return ir;
}

/** Starts loading the violin (call early, e.g. when the screen mounts). */
export function loadViolin(): Promise<AudioWorkletNode | null> {
  if (node) return Promise.resolve(node);
  if (loading) return loading;
  const ctx = getAudioContext();
  // iPhone: play through the ring/silent switch, like a music app
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession && nav.audioSession.type === 'auto') nav.audioSession.type = 'playback';
  } catch {
    /* not supported */
  }
  loading = (async () => {
    if (!ctx.audioWorklet) return null;
    await ctx.audioWorklet.addModule(processorUrl);
    const n = new AudioWorkletNode(ctx, 'touch-violin', { numberOfInputs: 0, outputChannelCount: [1] });
    const dry = ctx.createGain();
    dry.gain.value = 2.2;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    const verb = ctx.createConvolver();
    verb.buffer = roomImpulse(ctx);
    // the body filter leaves a little rumble below the G string
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 150;
    n.connect(hp);
    hp.connect(dry).connect(out());
    hp.connect(verb).connect(wet).connect(out());
    node = n;
    return n;
  })().catch(() => {
    loading = null;
    return null;
  });
  return loading;
}

/** Wake the audio up from inside a touch (iPad needs a gesture). */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx.state !== 'running') ctx.resume().catch(() => undefined);
  loadViolin();
}

export function sendStrings(msgs: StringMsg[]) {
  if (node && msgs.length) node.port.postMessage(msgs);
}

/** Lift the bow off every string (they ring on and fade). */
export function silence() {
  sendStrings([0, 1, 2, 3].map((i) => ({ i, bowing: false, vel: 0 })));
}
