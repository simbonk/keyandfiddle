import { useEffect, useMemo, useRef, useState } from 'react';
import { usePitchListener, usePitchState } from '../audio/hooks';
import { centsBetween, freqToMidiFloat, isBlackKey, midiName, midiToFreq } from '../audio/notes';
import { playNote } from '../audio/synth';
import { LevelMeter, MicGate } from '../ui/MicButton';
import { Keyboard } from './Keyboard';
import { type CapFrame, analyzeCapture } from './captureKey';
import { type PianoCalibration, keyOffsetCents, saveCalibration } from './calibration';

type Mode = 'quick' | 'full';

interface Props {
  cal: PianoCalibration;
  onDone: (c: PianoCalibration) => void;
  onCancel?: () => void;
}

function keysFor(mode: Mode, start: number): number[] {
  const end = start + 24;
  if (mode === 'quick') return [start, start + 7, start + 12, start + 19, end];
  const out: number[] = [];
  for (let m = start; m <= end; m++) out.push(m);
  return out;
}

export function TuningWizard({ cal, onDone, onCancel }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [startMidi, setStartMidi] = useState(cal.startMidi);
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState<PianoCalibration>(() => ({ ...cal, keys: { ...cal.keys } }));
  const [result, setResult] = useState<{ midi: number; freq: number; cents: number; level: number } | null>(null);
  const [mismatch, setMismatch] = useState<{ heard: number; freq: number } | null>(null);
  const levels = useRef<number[]>([]);
  const frames = useRef<CapFrame[]>([]);
  const stepStart = useRef(0);
  const frame = usePitchState(mode !== null);

  const keys = useMemo(() => (mode ? keysFor(mode, startMidi) : []), [mode, startMidi]);
  const target = keys[idx];
  const finished = mode !== null && idx >= keys.length;

  usePitchListener((f) => {
    if (!mode || finished || result || mismatch) return;
    const buf = frames.current;
    buf.push({ t: f.t, freq: f.freq, rms: f.rms });
    while (buf.length && buf[0].t < f.t - 900) buf.shift();
    const prev = keys[idx - 1];
    const r = analyzeCapture(buf, target, prev !== undefined ? draft.keys[prev] ?? 0 : 0, stepStart.current, f.t);
    if (!r) return;
    frames.current = [];
    if (r.kind === 'accept') accept(r.freq, r.peak);
    else setMismatch({ heard: Math.round(freqToMidiFloat(r.freq)), freq: r.freq });
  }, mode !== null);

  // each new key starts a fresh listening window
  useEffect(() => {
    stepStart.current = performance.now();
    frames.current = [];
  }, [idx, mode, mismatch]);

  function accept(freq: number, peak: number) {
    const cents = centsBetween(freq, midiToFreq(target));
    levels.current.push(peak);
    setDraft((d) => ({ ...d, keys: { ...d.keys, [target]: freq } }));
    setResult({ midi: target, freq, cents, level: peak });
    setMismatch(null);
    window.setTimeout(() => {
      setResult(null);
      setIdx((i) => i + 1);
    }, 1300);
  }

  function finish() {
    const lv = levels.current.length
      ? [...levels.current].sort((a, b) => a - b)[Math.floor(levels.current.length / 2)]
      : draft.refLevel;
    const done = { ...draft, startMidi, refLevel: lv };
    saveCalibration(done);
    onDone(done);
  }

  if (!mode) {
    return (
      <div className="panel wizard">
        <h2>🎹 Let's tune in to your piano</h2>
        <p>
          Every piano sounds a little different, especially older ones. I'll ask you to press some keys, listen
          carefully, and remember exactly how <em>your</em> piano sounds. You only have to do this once.
        </p>
        <div className="row wrap">
          <label className="field">
            Lowest key on screen
            <select value={startMidi} onChange={(e) => setStartMidi(+e.target.value)}>
              <option value={36}>C2 (low)</option>
              <option value={48}>C3 (normal)</option>
              <option value={60}>C4 middle C (high)</option>
            </select>
          </label>
        </div>
        <div className="choice-grid">
          <button className="choice" onClick={() => setMode('quick')}>
            <span className="choice-emoji">⚡</span>
            <b>Quick tune</b>
            <span>5 keys, about 1 minute</span>
          </button>
          <button className="choice" onClick={() => setMode('full')}>
            <span className="choice-emoji">🎯</span>
            <b>Every key</b>
            <span>All 25 keys, best for very out-of-tune pianos</span>
          </button>
        </div>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            Skip for now
          </button>
        )}
      </div>
    );
  }

  if (finished) {
    const offs = Object.keys(draft.keys)
      .map(Number)
      .filter((m) => m >= startMidi && m <= startMidi + 24)
      .map((m) => keyOffsetCents(draft, m)!);
    const avg = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0;
    return (
      <div className="panel wizard">
        <h2>🎉 All tuned in!</h2>
        <p>
          {Math.abs(avg) < 10
            ? 'Your piano is nicely in tune.'
            : `Your piano is about ${Math.abs(Math.round(avg))} cents ${avg < 0 ? 'flat (lower)' : 'sharp (higher)'} than a brand new one. No problem, I'll listen for how it really sounds.`}
        </p>
        <TuneChart cal={draft} start={startMidi} />
        <div className="row">
          <button className="btn big primary" onClick={finish}>
            Let's play! ▶
          </button>
          <button
            className="btn"
            onClick={() => {
              setIdx(0);
              setMode(null);
            }}
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  const cents = frame?.freq ? centsBetween(frame.freq, midiToFreq(target)) : null;

  return (
    <MicGate why="To tune in to your piano I need to hear it through the microphone.">
      <div className="panel wizard">
        <div className="wizard-top">
          <span className="pill">
            Key {idx + 1} of {keys.length}
          </span>
          <button className="btn small ghost" onClick={() => playNote(target, 1.2)}>
            🔊 hear it
          </button>
        </div>
        <h2>
          Press <span className="big-note">{midiName(target)}</span> {isBlackKey(target) ? '(black key)' : ''} and let it
          ring
        </h2>
        <Keyboard
          start={startMidi}
          end={startMidi + 24}
          highlights={{ [target]: { color: '#ffcf33', label: '👇' } }}
          pressed={frame?.freq ? Math.round(freqToMidiFloat(frame.freq)) : null}
          height={150}
        />
        <div className="listen-row">
          <LevelMeter level={frame?.rms ?? 0} />
          <span className="muted">
            {frame?.freq ? `hearing ${midiName(Math.round(freqToMidiFloat(frame.freq)))}` : 'listening…'}
            {cents !== null && Math.abs(cents) < 150 ? ` (${cents > 0 ? '+' : ''}${Math.round(cents)}¢)` : ''}
          </span>
        </div>
        {result && (
          <div className="toast good">
            ✅ Got it! {midiName(result.midi)} is{' '}
            {Math.abs(result.cents) < 8
              ? 'right in tune'
              : `${Math.abs(Math.round(result.cents))} cents ${result.cents < 0 ? 'low' : 'high'}`}
            . Remembered.
          </div>
        )}
        {mismatch && (
          <div className="toast warn">
            Hmm, that sounded like <b>{midiName(mismatch.heard)}</b>. Did you press {midiName(target)}?
            <div className="row">
              <button className="btn small" onClick={() => setMismatch(null)}>
                Try again
              </button>
              <button className="btn small" onClick={() => accept(mismatch.freq, 0.05)}>
                That was {midiName(target)}, keep it
              </button>
            </div>
          </div>
        )}
        <div className="row">
          <button className="btn ghost" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>
            ◀ Back
          </button>
          <button className="btn ghost" onClick={() => setIdx((i) => i + 1)}>
            Skip key ▶
          </button>
        </div>
      </div>
    </MicGate>
  );
}

export function TuneChart({ cal, start }: { cal: PianoCalibration; start: number }) {
  const bars = [];
  for (let m = start; m <= start + 24; m++) {
    const c = keyOffsetCents(cal, m);
    const h = c === null ? 0 : Math.min(50, Math.abs(c));
    bars.push(
      <div key={m} className="tc-col" title={`${midiName(m)}: ${c === null ? 'not measured' : Math.round(c) + '¢'}`}>
        <div className="tc-up">{c !== null && c > 0 && <div className="tc-bar sharp" style={{ height: `${h * 2}%` }} />}</div>
        <div className="tc-down">{c !== null && c <= 0 && <div className="tc-bar flat" style={{ height: `${h * 2}%` }} />}</div>
        <div className="tc-label">{isBlackKey(m) ? '' : midiName(m).replace(/\d/, '')}</div>
      </div>,
    );
  }
  return (
    <div className="tune-chart">
      <div className="tc-legend">
        <span className="sharp-dot" /> higher than normal <span className="flat-dot" /> lower than normal
      </div>
      <div className="tc-cols">{bars}</div>
    </div>
  );
}
