// Main-thread side of the touch violin's sound: loads the bowed-string
// worklet once, adds a little room reverb, and sends string updates. String
// updates go to the selected voice: the bowed-string model (violin, concert
// hall, fiddle, cello), a small synth (cat, ghost, robot), or a recorded sound.
import { noteOn, type Voice } from '../../audio/instruments';
import { getAudioContext } from '../../audio/mic';
import { freqToMidiFloat } from '../../audio/notes';
import { out } from '../../audio/output';
import processorUrl from './violinProcessor.ts?worker&url';
import type { StringMsg } from './violinProcessor';
import { MODEL_VOICES, type ViolinVoice, getViolinVoice, onViolinVoiceChange } from './voices';

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

// ---------- output bus: highpass -> tone -> dry + reverb ----------

interface Bus {
  input: AudioNode;
  tone: BiquadFilterNode;
  dry: GainNode;
  wet: GainNode;
}
let bus: Bus | null = null;
function ensureBus(): Bus {
  if (bus) return bus;
  const ctx = getAudioContext();
  // the body filter leaves a little rumble below the G string
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 150;
  const tone = ctx.createBiquadFilter();
  tone.type = 'peaking';
  tone.frequency.value = 3000;
  tone.Q.value = 0.8;
  tone.gain.value = 0;
  const dry = ctx.createGain();
  dry.gain.value = 2.2;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  const verb = ctx.createConvolver();
  verb.buffer = roomImpulse(ctx);
  hp.connect(tone);
  tone.connect(dry).connect(out());
  tone.connect(verb).connect(wet).connect(out());
  bus = { input: hp, tone, dry, wet };
  applyVoice();
  return bus;
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
    n.connect(ensureBus().input);
    node = n;
    resyncModel();
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

// ---------- what each string is doing (kept here so any voice can play it) ----------

interface StrState {
  freq: number;
  vel: number;
  bowing: boolean;
  pressure: number;
  vib: number;
  sounding: boolean;
  strokeFreq: number;
}
const strs: StrState[] = [0, 1, 2, 3].map(() => ({
  freq: 440,
  vel: 0,
  bowing: false,
  pressure: 0.5,
  vib: 0,
  sounding: false,
  strokeFreq: 0,
}));

let voice: ViolinVoice = getViolinVoice();
onViolinVoiceChange(() => {
  voice = getViolinVoice();
  applyVoice();
});

/** Model voices: transpose, vibrato and room per voice. */
function modelMsg(m: StringMsg): StringMsg {
  const r: StringMsg = { ...m };
  if (voice === 'cello' && r.freq !== undefined) r.freq = r.freq / 2;
  if (voice === 'concert' && r.vib !== undefined) r.vib = r.vib * 1.6;
  if (voice === 'fiddle' && r.vib !== undefined) r.vib = r.vib * 0.4;
  return r;
}

function resyncModel() {
  if (!node) return;
  const model = MODEL_VOICES.has(voice);
  node.port.postMessage(
    strs.map((s, i) =>
      model
        ? modelMsg({ i, freq: s.freq, snap: true, vel: s.vel, bowing: s.bowing, pressure: s.pressure, vib: s.vib })
        : { i, bowing: false, vel: 0 },
    ),
  );
}

function applyVoice() {
  // stop whatever the old voice was playing
  synths.forEach((s) => s?.stop());
  mineVoices.forEach((v) => v?.kill());
  mineVoices.fill(null);
  strs.forEach((s) => (s.sounding = false));
  resyncModel();
  if (!bus) return;
  const t = getAudioContext().currentTime;
  const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.05);
  const room = { violin: 0.5, concert: 1.25, fiddle: 0.12, cello: 0.6, cat: 0.35, ghost: 0.9, robot: 0.2 } as Record<
    string,
    number
  >;
  set(bus.wet.gain, room[voice] ?? 0.35);
  set(bus.tone.gain, voice === 'fiddle' ? 5 : voice === 'cello' ? -3 : voice === 'concert' ? 1.5 : 0);
}

export function sendStrings(msgs: StringMsg[]) {
  if (!msgs.length) return;
  for (const m of msgs) {
    const s = strs[m.i];
    if (!s) continue;
    if (m.freq !== undefined) s.freq = m.freq;
    if (m.vel !== undefined) s.vel = m.vel;
    if (m.bowing !== undefined) s.bowing = m.bowing;
    if (m.pressure !== undefined) s.pressure = m.pressure;
    if (m.vib !== undefined) s.vib = m.vib;
  }
  if (MODEL_VOICES.has(voice)) {
    if (node) node.port.postMessage(voice === 'violin' ? msgs : msgs.map(modelMsg));
    return;
  }
  ensureBus();
  const touched = new Set(msgs.map((m) => m.i));
  for (const i of touched) {
    const s = strs[i];
    if (!s) continue;
    const sounding = s.bowing && Math.abs(s.vel) > 0.012;
    // a new bow stroke, or a new note under the bow
    const fresh =
      sounding && (!s.sounding || Math.abs(12 * Math.log2(s.freq / (s.strokeFreq || s.freq))) > 0.4);
    if (fresh) s.strokeFreq = s.freq;
    s.sounding = sounding;
    const level = s.bowing ? Math.min(1, Math.abs(s.vel) / 0.12) : 0;
    if (voice.startsWith('mine:')) {
      if (fresh) {
        mineVoices[i]?.kill();
        mineVoices[i] = noteOn(Math.round(freqToMidiFloat(s.freq)), 0.5 + 0.5 * level, undefined, voice as `mine:${string}`);
      }
    } else {
      if (!synths[i]) synths[i] = new SynthString(voice as SynthKind);
      else if (synths[i]!.kind !== voice) {
        synths[i]!.stop();
        synths[i] = new SynthString(voice as SynthKind);
      }
      synths[i]!.set(s.freq, level, s.vib, fresh);
    }
  }
}

/** Lift the bow off every string (they ring on and fade). */
export function silence() {
  sendStrings([0, 1, 2, 3].map((i) => ({ i, bowing: false, vel: 0 })));
}

// ---------- recorded sounds: one note per bow stroke ----------

const mineVoices: (Voice | null)[] = [null, null, null, null];

// ---------- synth voices ----------

type SynthKind = 'cat' | 'ghost' | 'robot';
const synths: (SynthString | null)[] = [null, null, null, null];

class SynthString {
  private osc: OscillatorNode;
  private amp: GainNode;
  private lfo?: OscillatorNode;
  private lfoAmt?: GainNode;
  private f1?: BiquadFilterNode;
  private f2?: BiquadFilterNode;
  private meow?: GainNode;
  private dead = false;
  constructor(readonly kind: SynthKind) {
    const ctx = getAudioContext();
    const b = ensureBus();
    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    this.amp.connect(b.input);
    this.osc = ctx.createOscillator();
    if (kind === 'ghost') {
      // a theremin: pure tone, slow slides, wide wobble
      this.osc.type = 'sine';
      this.lfo = ctx.createOscillator();
      this.lfo.frequency.value = 5.2;
      this.lfoAmt = ctx.createGain();
      this.lfoAmt.gain.value = 0;
      this.lfo.connect(this.lfoAmt).connect(this.osc.frequency);
      this.lfo.start();
      this.osc.connect(this.amp);
    } else if (kind === 'robot') {
      this.osc.type = 'square';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      lp.Q.value = 5;
      this.osc.connect(lp).connect(this.amp);
    } else {
      // cat: a buzzy voice through two moving vowel formants ("mee-ow")
      this.osc.type = 'sawtooth';
      this.meow = ctx.createGain();
      this.meow.gain.value = 0;
      this.f1 = ctx.createBiquadFilter();
      this.f1.type = 'bandpass';
      this.f1.Q.value = 6;
      this.f1.frequency.value = 400;
      this.f2 = ctx.createBiquadFilter();
      this.f2.type = 'bandpass';
      this.f2.Q.value = 8;
      this.f2.frequency.value = 1800;
      const g2 = ctx.createGain();
      g2.gain.value = 0.6;
      this.osc.connect(this.f1).connect(this.meow);
      this.osc.connect(this.f2).connect(g2).connect(this.meow);
      this.meow.connect(this.amp);
    }
    this.osc.start();
  }

  set(freq: number, level: number, vib: number, fresh: boolean) {
    if (this.dead) return;
    const t = getAudioContext().currentTime;
    const peak = this.kind === 'robot' ? 0.11 : this.kind === 'ghost' ? 0.28 : 0.9;
    this.amp.gain.setTargetAtTime(level * peak, t, this.kind === 'ghost' ? 0.08 : level > 0 ? 0.02 : 0.06);
    if (this.kind === 'ghost') {
      this.osc.frequency.setTargetAtTime(freq, t, 0.07);
      this.lfoAmt!.gain.setTargetAtTime(freq * (0.012 + vib * 0.05), t, 0.2);
      return;
    }
    if (this.kind === 'robot') {
      this.osc.frequency.setValueAtTime(freq, t);
      return;
    }
    // cat
    this.osc.frequency.setTargetAtTime(freq, t, 0.01);
    if (!fresh) return;
    const d = this.osc.detune;
    const m = this.meow!.gain;
    const f1 = this.f1!.frequency;
    const f2 = this.f2!.frequency;
    for (const p of [d, m, f1, f2]) p.cancelScheduledValues(t);
    // pitch bends up and back down
    d.setValueAtTime(-120, t);
    d.linearRampToValueAtTime(90, t + 0.16);
    d.linearRampToValueAtTime(-60, t + 0.6);
    // "m" (quiet, closed) -> "ee" -> "ow"
    m.setValueAtTime(0.15, t);
    m.linearRampToValueAtTime(1, t + 0.07);
    m.setTargetAtTime(0.55, t + 0.35, 0.2);
    f1.setValueAtTime(280, t);
    f1.linearRampToValueAtTime(850, t + 0.2);
    f1.linearRampToValueAtTime(450, t + 0.6);
    f2.setValueAtTime(2600, t);
    f2.linearRampToValueAtTime(1300, t + 0.22);
    f2.linearRampToValueAtTime(800, t + 0.6);
  }

  stop() {
    if (this.dead) return;
    this.dead = true;
    const t = getAudioContext().currentTime;
    this.amp.gain.setTargetAtTime(0, t, 0.03);
    try {
      this.osc.stop(t + 0.3);
      this.lfo?.stop(t + 0.3);
    } catch {
      /* already stopped */
    }
    setTimeout(() => this.amp.disconnect(), 500);
  }
}

/** A short phrase on the A string so a voice can be heard when it is picked. */
export function previewVoice() {
  unlockAudio();
  const notes = [69, 73, 76, 81];
  const f = (m: number) => 440 * 2 ** ((m - 69) / 12);
  let k = 0;
  const step = () => {
    if (k < notes.length) {
      const dir = k % 2 ? -1 : 1;
      sendStrings([{ i: 2, freq: f(notes[k]), snap: true, bowing: true, vel: 0 }]);
      // ramp the bow speed up like a real stroke
      [0.05, 0.1, 0.12, 0.12, 0.11, 0.1].forEach((v, j) =>
        setTimeout(() => sendStrings([{ i: 2, vel: dir * v, bowing: true }]), 10 + j * 45),
      );
      k++;
      setTimeout(step, k === notes.length ? 700 : 330);
    } else silence();
  };
  // let the worklet load the first time
  loadViolin().then(() => setTimeout(step, 30));
}

/**
 * Bow one note in the chosen violin sound (used by "Listen" in Songs).
 * string: 0 = G .. 3 = E.
 */
export function playBowedNote(string: number, midi: number, seconds: number, down = true) {
  unlockAudio();
  const freq = 440 * 2 ** ((midi - 69) / 12);
  const dir = down ? 1 : -1;
  const i = Math.max(0, Math.min(3, string));
  sendStrings([{ i, freq, snap: true, bowing: true, vel: 0 }]);
  const ms = Math.max(120, seconds * 1000);
  const steps = [0.05, 0.1, 0.12];
  steps.forEach((v, j) => setTimeout(() => sendStrings([{ i, vel: dir * v, bowing: true }]), 10 + j * 40));
  // keep the bow moving for the whole note, then lift it
  const hold = setInterval(() => sendStrings([{ i, vel: dir * 0.11, bowing: true }]), 120);
  setTimeout(() => {
    clearInterval(hold);
    sendStrings([{ i, bowing: false, vel: 0 }]);
  }, ms - 30);
}
