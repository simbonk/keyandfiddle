import { useEffect, useRef, useState } from 'react';
import { usePitchListener } from '../audio/hooks';
import { midiName } from '../audio/notes';
import { playNote } from '../audio/synth';
import { TopBarSlot } from '../ui/chrome';
import { LevelMeter, MicGate } from '../ui/MicButton';
import { PitchLadder } from './PitchLadder';
import { SingAlong } from './SingAlong';
import { MAJOR, RANGE_PRESETS, SOLFEGE, type VoiceRange, foldToTarget, hasSavedRange, loadRange, saveRange } from './voice';

type View = 'range' | 'match' | 'scales' | 'songs';

export const LEVELS = [
  { name: 'Easy', tol: 50 },
  { name: 'Medium', tol: 30 },
  { name: 'Pitch perfect', tol: 15 },
];

export function VoiceTab() {
  const [range, setRange] = useState<VoiceRange>(loadRange);
  const [view, setView] = useState<View>(() => (hasSavedRange() ? 'match' : 'range'));
  const [level, setLevel] = useState(1);
  const tol = LEVELS[level].tol;
  return (
    <div className="tab-body">
      <TopBarSlot>
        <nav className="subnav">
          <button className={view === 'range' ? 'on' : ''} onClick={() => setView('range')}>
            🎚️ My voice
          </button>
          <button className={view === 'match' ? 'on' : ''} onClick={() => setView('match')}>
            🎯 Match the note
          </button>
          <button className={view === 'scales' ? 'on' : ''} onClick={() => setView('scales')}>
            🪜 Do-Re-Mi
          </button>
          <button className={view === 'songs' ? 'on' : ''} onClick={() => setView('songs')}>
            🎤 Sing songs
          </button>
        </nav>
      </TopBarSlot>
      {view !== 'range' && view !== 'songs' && (
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <div className="seg">
            {LEVELS.map((l, i) => (
              <button key={l.name} className={level === i ? 'on' : ''} onClick={() => setLevel(i)}>
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <MicGate why="To hear you sing I need the microphone. Nothing is recorded or sent anywhere.">
        {view === 'range' && (
          <RangeFinder
            range={range}
            onDone={(r) => {
              setRange(r);
              saveRange(r);
              setView('match');
            }}
          />
        )}
        {view === 'match' && <MatchNote range={range} tol={tol} />}
        {view === 'scales' && <Scales range={range} tol={tol} />}
        {view === 'songs' && <SingAlong range={range} />}
      </MicGate>
    </div>
  );
}

/** Tracks how long the singer has held the target, and which way to move. */
function useHold(target: number | null, tol: number, needMs: number, onDone: () => void) {
  const [state, setState] = useState<{ prog: number; cents: number | null }>({ prog: 0, cents: null });
  const acc = useRef(0);
  const last = useRef(0);
  const done = useRef(false);
  const lastUi = useRef(0);
  useEffect(() => {
    acc.current = 0;
    done.current = false;
    setState({ prog: 0, cents: null });
  }, [target, tol]);
  usePitchListener((f) => {
    if (target === null || done.current) return;
    const dt = last.current ? Math.min(60, f.t - last.current) : 0;
    last.current = f.t;
    let cents: number | null = null;
    if (f.freq && f.rms > 0.004) {
      cents = (foldToTarget(f.midi, target) - target) * 100;
      if (Math.abs(cents) <= tol) acc.current += dt;
      else acc.current = Math.max(0, acc.current - dt * 0.5);
    } else acc.current = Math.max(0, acc.current - dt * 0.25);
    if (acc.current >= needMs) {
      done.current = true;
      onDone();
    }
    if (f.t - lastUi.current > 80) {
      lastUi.current = f.t;
      setState({ prog: Math.min(1, acc.current / needMs), cents });
    }
  });
  return state;
}

function Hint({ cents, tol }: { cents: number | null; tol: number }) {
  if (cents === null) return <div className="voice-hint muted">Sing "ooo" or "laaa" 🎶</div>;
  if (Math.abs(cents) <= tol) return <div className="voice-hint good">Right on it! Hold it… ✨</div>;
  return cents < 0 ? (
    <div className="voice-hint up">⬆ A bit higher{cents < -150 ? ' (much higher)' : ''}</div>
  ) : (
    <div className="voice-hint down">⬇ A bit lower{cents > 150 ? ' (much lower)' : ''}</div>
  );
}

// ---------------------------------------------------------------- range

function RangeFinder({ range, onDone }: { range: VoiceRange; onDone: (r: VoiceRange) => void }) {
  const [step, setStep] = useState<'intro' | 'low' | 'high' | 'done'>('intro');
  const [found, setFound] = useState<VoiceRange>(range);
  const samples = useRef<number[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [rms, setRms] = useState(0);
  const lastUi = useRef(0);
  usePitchListener((f) => {
    if (f.t - lastUi.current > 80) {
      lastUi.current = f.t;
      setNow(f.freq ? f.midi : null);
      setRms(f.rms);
    }
    if ((step === 'low' || step === 'high') && f.freq && f.rms > 0.006) samples.current.push(f.midi);
  });
  const finishStep = () => {
    const s = [...samples.current].sort((a, b) => a - b);
    samples.current = [];
    if (s.length < 8) return; // didn't hear enough, stay on this step
    if (step === 'low') {
      setFound((r) => ({ ...r, lo: Math.round(s[Math.floor(s.length * 0.1)]) + 1 }));
      setStep('high');
    } else {
      setFound((r) => ({ ...r, hi: Math.max(r.lo + 7, Math.round(s[Math.floor(s.length * 0.9)]) - 1) }));
      setStep('done');
    }
  };
  return (
    <div className="panel wizard">
      <h2>🎚️ Find your voice</h2>
      {step === 'intro' && (
        <>
          <p>Everyone's voice is different. I'll fit the songs and games to the notes that are comfy for you.</p>
          <div className="choice-grid">
            {RANGE_PRESETS.map((p) => (
              <button key={p.name} className="choice" onClick={() => onDone(p.range)}>
                <span className="choice-emoji">{p.emoji}</span>
                <b>{p.name}</b>
                <span>
                  {midiName(p.range.lo)} to {midiName(p.range.hi)}
                </span>
              </button>
            ))}
            <button className="choice" onClick={() => setStep('low')}>
              <span className="choice-emoji">🎤</span>
              <b>Measure my voice</b>
              <span>Sing low, then high. 30 seconds</span>
            </button>
          </div>
          <p className="muted small">
            Right now: {midiName(range.lo)} to {midiName(range.hi)}
          </p>
        </>
      )}
      {(step === 'low' || step === 'high') && (
        <>
          <p>
            {step === 'low'
              ? 'Sing "ahh" and slide down to the lowest note that still feels comfy. Hold it, then tap Done.'
              : 'Now slide up to the highest note that still feels easy (no squeaking!). Hold it, then tap Done.'}
          </p>
          <div className="big-note" style={{ fontSize: 56, textAlign: 'center' }}>
            {now !== null ? midiName(Math.round(now)) : '…'}
          </div>
          <LevelMeter level={rms} />
          <div className="row">
            <button className="btn big primary" onClick={finishStep}>
              Done ✓
            </button>
            <button className="btn ghost" onClick={() => setStep('intro')}>
              Cancel
            </button>
          </div>
        </>
      )}
      {step === 'done' && (
        <>
          <p>
            Your comfy notes: <b>{midiName(found.lo)}</b> to <b>{midiName(found.hi)}</b>. Songs will be moved to fit.
          </p>
          <div className="row">
            <button className="btn big primary" onClick={() => onDone(found)}>
              Let's sing! 🎤
            </button>
            <button className="btn" onClick={() => setStep('low')}>
              Try again
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- match

function pickNote(r: VoiceRange, prev: number | null) {
  // white keys only for the first rounds feel friendlier; any note in range
  let m = prev ?? r.lo;
  for (let i = 0; i < 20 && (m === prev || m < r.lo || m > r.hi); i++) {
    const base = prev ?? Math.round((r.lo + r.hi) / 2);
    m = base + Math.round((Math.random() - 0.5) * Math.min(14, r.hi - r.lo));
  }
  return Math.max(r.lo, Math.min(r.hi, m));
}

function MatchNote({ range, tol }: { range: VoiceRange; tol: number }) {
  const [target, setTarget] = useState(() => pickNote(range, null));
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);
  const hold = useHold(won ? null : target, tol, 1000, () => {
    setWon(true);
    setScore((s) => s + 1);
    playNote(target + 12, 0.15, 0.4, 'beep');
    window.setTimeout(() => next(), 1200);
  });
  const play = (m = target) => playNote(m, 1.4, 0.8, 'beep');
  const next = () => {
    const t = pickNote(range, target);
    setTarget(t);
    setWon(false);
    window.setTimeout(() => play(t), 150);
  };
  useEffect(() => {
    play();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="panel">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>🎯 Sing this note: {midiName(target)}</h2>
        <span className="pill">⭐ {score}</span>
      </div>
      <PitchLadder lo={range.lo} hi={range.hi} target={{ midi: target, tol }} />
      {won ? <div className="voice-hint good">🎉 Perfect match!</div> : <Hint cents={hold.cents} tol={tol} />}
      <div className="hold-bar">
        <div style={{ width: `${(won ? 1 : hold.prog) * 100}%` }} />
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => play()}>
          🔊 Hear it again
        </button>
        <button className="btn ghost" onClick={next}>
          New note ▶
        </button>
      </div>
      <p className="muted small">
        Listen, then sing the same note and hold it until the bar fills. Any octave counts, so grown-ups can play too.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- scales

function Scales({ range, tol }: { range: VoiceRange; tol: number }) {
  const fitsRoot = Math.max(range.lo, Math.min(range.hi - 12, 60));
  const [root, setRoot] = useState(fitsRoot);
  const [i, setI] = useState(0);
  const [guide, setGuide] = useState(true);
  const seq = [...MAJOR, ...[...MAJOR].reverse().slice(1)];
  const names = [...SOLFEGE, ...[...SOLFEGE].reverse().slice(1)];
  const done = i >= seq.length;
  const target = done ? null : root + seq[i];
  useHold(target, tol, 600, () => setI((x) => x + 1));
  useEffect(() => {
    if (target !== null && guide) playNote(target, 0.9, 0.7, 'beep');
  }, [i, root]); // eslint-disable-line react-hooks/exhaustive-deps
  const roots: number[] = [];
  for (let m = range.lo; m <= range.hi - 12; m++) roots.push(m);
  if (!roots.length) roots.push(range.lo);
  return (
    <div className="panel">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>🪜 Climb the Do-Re-Mi ladder</h2>
        <label className="field">
          Start on
          <select
            value={root}
            onChange={(e) => {
              setRoot(+e.target.value);
              setI(0);
            }}
          >
            {roots.map((m) => (
              <option key={m} value={m}>
                {midiName(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="solfege-row">
        {names.map((n, k) => (
          <span key={k} className={k < i ? 'done' : k === i ? 'now' : ''}>
            {n}
          </span>
        ))}
      </div>
      <PitchLadder
        lo={Math.min(range.lo, root)}
        hi={Math.max(range.hi, root + 12)}
        target={target === null ? null : { midi: target, tol, label: names[i] }}
      />
      {done ? (
        <div className="voice-hint good">🏆 You climbed the whole ladder!</div>
      ) : (
        <div className="voice-hint">
          Sing <b>{names[i]}</b> ({midiName(target!)})
        </div>
      )}
      <div className="row wrap">
        <button className="btn primary" onClick={() => target !== null && playNote(target, 0.9, 0.7, 'beep')}>
          🔊 Hear it
        </button>
        <button className="btn" onClick={() => setI(0)}>
          ↺ Start again
        </button>
        <label className="row small">
          <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} /> Play each note for me
        </label>
      </div>
    </div>
  );
}
