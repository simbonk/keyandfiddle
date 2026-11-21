// AudioWorklet that runs the four bowed strings of the touch violin.
import { ViolinModel } from './bowedString';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: unknown): void;

export interface StringMsg {
  i: number;
  freq?: number;
  /** jump to the pitch now (finger lands) instead of gliding */
  snap?: boolean;
  vel?: number;
  bowing?: boolean;
  pressure?: number;
  vib?: number;
}

class TouchViolinProcessor extends AudioWorkletProcessor {
  private model = new ViolinModel(sampleRate);
  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<StringMsg[]>) => {
      for (const m of e.data) {
        const s = this.model.strings[m.i];
        if (!s) continue;
        if (m.freq !== undefined) s.setFrequency(m.freq, m.snap);
        if (m.vel !== undefined) s.vTarget = m.vel;
        if (m.bowing !== undefined) s.bowing = m.bowing;
        if (m.pressure !== undefined) s.pressure = m.pressure;
        if (m.vib !== undefined) s.vibDepth = m.vib;
      }
    };
  }
  process(_in: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    this.model.render(out[0]);
    for (let c = 1; c < out.length; c++) out[c].set(out[0]);
    return true;
  }
}

registerProcessor('touch-violin', TouchViolinProcessor);
