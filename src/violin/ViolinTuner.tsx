import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePitchListener, usePitchState } from '../audio/hooks';
import { centsBetween, freqToMidiFloat, midiName, midiToFreq } from '../audio/notes';
import { ding, playNote } from '../audio/synth';
import { LevelMeter, MicGate } from '../ui/MicButton';
import { STRINGS, stopFraction } from './theory';
import { VIOLIN_SIZES } from './touch/instrument';

const IN_TUNE = 6; // cents

export function ViolinTuner({ onDone }: { onDone?: () => void }) {
  // Auto by default: the iPad sits on a stand, so it works out which string is being bowed.
  const [sel, setSel] = useState<number | 'auto'>('auto');
  const lastString = useRef<number | null>(null);
  const [party, setParty] = useState<{ i: number; id: number; all: boolean } | null>(null);
  const lastParty = useRef<{ i: number; t: number }>({ i: -1, t: 0 });
  useEffect(() => {
    if (!party) return;
    const t = setTimeout(() => setParty(null), party.all ? 3200 : 2000);
    return () => clearTimeout(t);
  }, [party]);
  const [tuned, setTuned] = useState<boolean[]>([false, false, false, false]);
  const frame = usePitchState(true);
  const steadySince = useRef<number | null>(null);
  const smoothed = useRef<number | null>(null);
  // while "Hear" plays its note the mic would hear it too: ignore it until it's done
  const muteUntil = useRef(0);
  const muted = !!frame && frame.t < muteUntil.current;

  // which string are we listening to?
  // a bowed string is not always a perfectly clean tone, so accept a slightly rougher pitch too
  const heardFreq =
    frame && !muted
      ? frame.freq || (frame.rawFreq && frame.clarity >= 0.6 && frame.rms > 0.01 ? frame.rawFreq : 0)
      : 0;
  const detectedString = (() => {
    if (!heardFreq) return null;
    const m = freqToMidiFloat(heardFreq);
    let best = 0;
    STRINGS.forEach((s, i) => {
      if (Math.abs(s.midi - m) < Math.abs(STRINGS[best].midi - m)) best = i;
    });
    return Math.abs(STRINGS[best].midi - m) < 3.5 ? best : null;
  })();
  if (detectedString !== null) lastString.current = detectedString;
  // stay on the last string heard between bows, so the screen doesn't jump back to G
  const active = sel === 'auto' ? (detectedString ?? lastString.current ?? 0) : sel;
  const target = STRINGS[active];

  usePitchListener((f) => {
    const fq = f.t < muteUntil.current ? 0 : f.freq || (f.rawFreq && f.clarity >= 0.6 && f.rms > 0.01 ? f.rawFreq : 0);
    if (!fq) {
      steadySince.current = null;
      return;
    }
    const c = centsBetween(fq, midiToFreq(target.midi));
    if (Math.abs(c) > 300) return;
    smoothed.current = smoothed.current === null ? c : smoothed.current * 0.7 + c * 0.3;
    if (Math.abs(smoothed.current) < IN_TUNE) {
      if (steadySince.current === null) steadySince.current = f.t;
      else if (
        f.t - steadySince.current > 900 &&
        (!tuned[active] || (lastParty.current.i !== active && f.t - lastParty.current.t > 2500))
      ) {
        const nowTuned = tuned.map((v, i) => (i === active ? true : v));
        setTuned(nowTuned);
        lastParty.current = { i: active, t: f.t };
        setParty({ i: active, id: f.t, all: nowTuned.every(Boolean) });
        ding(true);
        // move on to the next untuned string automatically
        if (sel !== 'auto') {
          const next = [0, 1, 2, 3].find((i) => i !== active && !tuned[i]);
          if (next !== undefined) window.setTimeout(() => setSel(next), 900);
        }
      }
    } else steadySince.current = null;
  });

  // near the note: the smoothed reading; way off (up to an octave): the raw one, so
  // the needle still leans the right way and says which way to turn
  const raw = heardFreq ? centsBetween(heardFreq, midiToFreq(target.midi)) : null;
  const cents = raw === null || Math.abs(raw) > 1250 ? null : Math.abs(raw) < 300 ? (smoothed.current ?? raw) : raw;
  const angle = cents === null ? 0 : Math.max(-50, Math.min(50, cents)) * 1.6;
  const ok = cents !== null && Math.abs(cents) < IN_TUNE;
  const way = cents === null ? null : cents < -50 ? 'low' : cents > 50 ? 'high' : null;

  // what the child is playing right now, as a note name
  const heardMidi = heardFreq ? Math.round(freqToMidiFloat(heardFreq)) : null;
  const otherString = detectedString !== null && detectedString !== active ? STRINGS[detectedString] : null;
  const bowing = !!frame && frame.rms > 0.01;
  const dir: 'up' | 'down' | 'ok' | null = cents === null ? null : ok ? 'ok' : cents < 0 ? 'up' : 'down';

  const nextUntuned = [0, 1, 2, 3].find((i) => !tuned[i]);
  let advice =
    sel === 'auto'
      ? tuned.every(Boolean)
        ? 'All four strings are in tune! 🎉'
        : `Bow any string and I'll find it. ${nextUntuned !== undefined && tuned.some(Boolean) ? `Try the ${STRINGS[nextUntuned].name} string next.` : 'Start with the G string, the thickest one.'}`
      : `Bow the ${target.name} string, ${target.nickname}. Use long, smooth bows.`;
  if (cents !== null) {
    if (ok) advice = 'Perfect! Keep it there ✨';
    else if (cents < -50)
      advice = 'Too low. Turn the peg away from you (tighter) very slowly, or ask a grown-up to help.';
    else if (cents < 0) advice = 'A little low. Turn the fine tuner clockwise ↻ a tiny bit.';
    else if (cents > 50) advice = 'Too high. Turn the peg toward you (looser) very slowly.';
    else advice = 'A little high. Turn the fine tuner anticlockwise ↺ a tiny bit.';
  }

  return (
    <MicGate why="The tuner listens to your violin through the microphone.">
      <div className="panel tuner">
        {party && (
          <TunedParty key={party.id} name={STRINGS[party.i].name} color={STRINGS[party.i].color} all={party.all} />
        )}
        <div className="row wrap center">
          {STRINGS.map((s, i) => (
            <button
              key={s.name}
              className={`string-btn ${active === i ? 'on' : ''} ${tuned[i] ? 'done' : ''}`}
              style={{ ['--c' as string]: s.color }}
              onClick={() => setSel(i)}
            >
              <span className="string-name">{s.name}</span>
              {tuned[i] && <span className="tick">✓</span>}
            </button>
          ))}
          <button className={`btn small ${sel === 'auto' ? 'primary' : 'ghost'}`} onClick={() => setSel('auto')}>
            Auto
          </button>
        </div>

        <div className="tuner-main">
          <ViolinStringsArt active={active} />
          <div className="gauge-wrap">
            <svg viewBox="-110 -110 220 130" className="gauge">
              <path d="M -90 0 A 90 90 0 0 1 90 0" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="18" />
              <path d="M -16 -88.6 A 90 90 0 0 1 16 -88.6" fill="none" stroke="#52d273" strokeWidth="18" />
              {[-50, -25, 0, 25, 50].map((c) => {
                const a = ((c * 1.6 - 90) * Math.PI) / 180;
                return (
                  <line
                    key={c}
                    x1={Math.cos(a) * 72}
                    y1={Math.sin(a) * 72}
                    x2={Math.cos(a) * 100}
                    y2={Math.sin(a) * 100}
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth={c === 0 ? 3 : 1.5}
                  />
                );
              })}
              <text x="-98" y="16" className="gauge-txt">
                low
              </text>
              <text x="74" y="16" className="gauge-txt">
                high
              </text>
              <g style={{ transform: `rotate(${angle}deg)`, transition: 'transform 120ms linear' }}>
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="-86"
                  stroke={ok ? '#52d273' : cents === null ? '#888' : '#ffd60a'}
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </g>
              <circle r="9" fill="#fff" />
            </svg>
            <div className={`tuner-note ${ok ? 'ok' : ''}`} style={{ color: target.color }}>
              {target.name}
              <span className={`tuner-cents ${way ? 'way' : ''}`}>
                {cents === null
                  ? muted
                    ? 'Listen…'
                    : ''
                  : way === 'low'
                    ? 'Too low · tune up ⬆'
                    : way === 'high'
                      ? 'Too high · tune down ⬇'
                      : `${cents > 0 ? '+' : ''}${Math.round(cents)}¢`}
              </span>
            </div>
          </div>
        </div>

        <div className="tuner-steps">
          <div className={`tstep ${bowing ? 'on' : ''}`}>
            <div className="tstep-k">1 · Bow</div>
            <div className="tstep-big">
              <span className="bow-arrows">⟵ 🎻 ⟶</span>
            </div>
            <div className="tstep-v">
              {bowing
                ? `Good, keep bowing the ${target.name} string`
                : `Bow the ${target.name} string with long, smooth bows`}
            </div>
          </div>
          <div className="tstep">
            <div className="tstep-k">2 · You're playing</div>
            <div
              className="tstep-big"
              style={{ color: heardMidi !== null ? (ok ? 'var(--good)' : '#fff') : undefined }}
            >
              {heardMidi !== null ? midiName(heardMidi) : '—'}
            </div>
            <div className="tstep-v">
              {otherString && sel !== 'auto'
                ? `That sounds like the ${otherString.name} string. Aim for ${target.name}.`
                : `Aim for ${midiName(target.midi)}`}
            </div>
          </div>
          <div className={`tstep dir ${dir ?? ''}`}>
            <div className="tstep-k">3 · Turn</div>
            <div className="tstep-big">{dir === 'ok' ? '✅' : dir === 'up' ? '⬆️' : dir === 'down' ? '⬇️' : '…'}</div>
            <div className="tstep-v">
              {dir === 'ok'
                ? 'In tune! Stop turning'
                : dir === 'up'
                  ? 'Too low: tune UP (tighten)'
                  : dir === 'down'
                    ? 'Too high: tune DOWN (loosen)'
                    : 'Listening for your note…'}
            </div>
          </div>
        </div>

        <p className={`advice ${ok ? 'good' : ''}`}>{advice}</p>
        <div className="row wrap center">
          <LevelMeter level={frame?.rms ?? 0} />
          <button
            className="btn small"
            onClick={() => {
              muteUntil.current = performance.now() + 2600;
              steadySince.current = null;
              smoothed.current = null;
              playNote(target.midi, 2, 0.8, 'violin');
            }}
          >
            🔊 Hear {target.name}
          </button>
          {tuned.every(Boolean) && onDone && (
            <button className="btn primary" onClick={onDone}>
              All tuned! Next ▶
            </button>
          )}
        </div>
      </div>
    </MicGate>
  );
}

/** Cartoon violin head-on with the active string highlighted and a bow sweeping across it. */
export function ViolinStringsArt({ active }: { active: number }) {
  const xs = [-21, -7, 7, 21];
  return (
    <svg viewBox="-80 -150 160 300" className="violin-art" aria-hidden>
      <defs>
        <linearGradient id="wood" x1="0" x2="1">
          <stop offset="0" stopColor="#8a3d12" />
          <stop offset="0.5" stopColor="#c8692b" />
          <stop offset="1" stopColor="#8a3d12" />
        </linearGradient>
      </defs>
      <path
        d="M -60 30 C -60 0 -40 -10 -38 -20 C -36 -30 -55 -40 -55 -70 C -55 -95 -30 -100 0 -100 C 30 -100 55 -95 55 -70 C 55 -40 36 -30 38 -20 C 40 -10 60 0 60 30 C 60 70 35 85 0 85 C -35 85 -60 70 -60 30 Z"
        fill="url(#wood)"
        stroke="#4a1f08"
        strokeWidth="2"
      />
      <rect x="-14" y="-150" width="28" height="140" rx="6" fill="#1a1a1a" />
      <rect x="-26" y="28" width="52" height="5" rx="2" fill="#f2d7a8" />
      {xs.map((x, i) => (
        <line
          key={i}
          x1={x * 0.45}
          y1={-150}
          x2={x}
          y2={80}
          stroke={i === active ? STRINGS[i].color : '#ddd'}
          strokeWidth={i === active ? 3.5 - i * 0.4 : 1.6 - i * 0.2}
          className={i === active ? 'string-vibrate' : ''}
        />
      ))}
      <g className="bow-sweep">
        <rect x="-120" y="10" width="240" height="4" rx="2" fill="#5b3a1a" />
        <rect x="-120" y="14" width="240" height="2" fill="#f5f0e6" />
        <rect x="88" y="6" width="22" height="12" rx="3" fill="#222" />
      </g>
      <text x="0" y="122" textAnchor="middle" className="art-label">
        {STRINGS[active].name} string
      </text>
    </svg>
  );
}

/** Confetti and a big "perfect!" when a string is in tune. */
function TunedParty({ name, color, all }: { name: string; color: string; all: boolean }) {
  const bits = Array.from({ length: all ? 60 : 32 }, (_, i) => {
    const a = (i / (all ? 60 : 32)) * Math.PI * 2 + Math.random() * 0.4;
    const d = 140 + Math.random() * (all ? 260 : 180);
    return {
      x: Math.cos(a) * d,
      y: Math.sin(a) * d - 40,
      r: Math.random() * 720 - 360,
      c: ['#ffd60a', '#52d273', '#2ec4f1', '#ff4d6d', '#e056fd', '#ffffff'][i % 6],
      delay: Math.random() * 0.12,
    };
  });
  return (
    <div className="tuned-party" aria-live="polite">
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti"
          style={{
            background: b.c,
            ['--x' as string]: `${b.x}px`,
            ['--y' as string]: `${b.y}px`,
            ['--r' as string]: `${b.r}deg`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
      <div className="tuned-badge" style={{ borderColor: color }}>
        <div className="tuned-check">✓</div>
        <div>{all ? 'All strings tuned! 🎉' : `${name} is perfect!`}</div>
      </div>
    </div>
  );
}

/** The tuner in its own full-screen window (a sheet on bigger screens): strings, or finger tapes. */
export function TunerModal({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const [tab, setTab] = useState<'strings' | 'tapes'>('strings');
  return createPortal(
    <div className="tuner-scrim" onClick={onClose}>
      <div className="tuner-sheet" role="dialog" aria-label="Tuner" onClick={(e) => e.stopPropagation()}>
        <div className="tuner-head">
          <div className="seg">
            <button className={tab === 'strings' ? 'on' : ''} onClick={() => setTab('strings')}>
              Tune strings
            </button>
            <button className={tab === 'tapes' ? 'on' : ''} onClick={() => setTab('tapes')}>
              Finger tapes
            </button>
          </div>
          <button className="btn small ghost tuner-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {tab === 'strings' ? (
          <ViolinTuner
            onDone={
              onDone &&
              (() => {
                onDone();
                onClose();
              })
            }
          />
        ) : (
          <TapeGuide />
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Where beginner finger tapes go, measured from the nut, and a listening check for each. */
const TAPES = [
  { finger: 1, semis: 2, name: '1st finger', hint: 'pointer' },
  { finger: 2, semis: 4, name: '2nd finger', hint: 'middle (high 2)' },
  { finger: 3, semis: 5, name: '3rd finger', hint: 'ring' },
  { finger: 4, semis: 7, name: '4th finger', hint: 'pinky (optional)' },
];
const SCALE_MM = 328;
const TAPE_OK = 15; // cents: a tape this close is fine for a beginner

function TapeGuide() {
  const [size, setSize] = useState(() => {
    try {
      return (JSON.parse(localStorage.getItem('kf.tv.opts') || '{}').size as string) || '4/4';
    } catch {
      return '4/4';
    }
  });
  const [check, setCheck] = useState<number | null>(null);
  const k = VIOLIN_SIZES.find((z) => z[0] === size)?.[1] ?? 1;
  const mm = (semis: number) => SCALE_MM * k * stopFraction(semis);
  const inch = (v: number) => (v / 25.4).toFixed(2);

  return (
    <div className="panel tuner tapes">
      <p className="muted small" style={{ margin: 0 }}>
        Thin tape across the fingerboard shows where each finger goes. Tune the strings first, then measure from the
        nut (the little ridge where the strings leave the pegbox) toward the bridge.
      </p>
      <div className="opt-row">
        <b>Violin size</b>
        <div className="seg">
          {VIOLIN_SIZES.map(([n]) => (
            <button key={n} className={n === size ? 'on' : ''} onClick={() => setSize(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="tape-list">
        {TAPES.map((t, i) => (
          <div key={t.finger} className={`tape-row ${check === i ? 'on' : ''}`}>
            <span className="tape-dot" style={{ background: ['', '#ff9f1c', '#52d273', '#2ec4f1', '#e056fd'][t.finger] }}>
              {t.finger}
            </span>
            <span className="tape-name">
              <b>{t.name}</b>
              <span className="muted small"> {t.hint}</span>
            </span>
            <span className="tape-mm">
              <b>{Math.round(mm(t.semis))} mm</b>
              <span className="muted small"> {inch(mm(t.semis))} in</span>
            </span>
            <button className={`btn small ${check === i ? 'primary' : 'ghost'}`} onClick={() => setCheck(check === i ? null : i)}>
              Check
            </button>
          </div>
        ))}
      </div>
      {check !== null ? (
        <MicGate why="I listen to check each taped note.">
          <TapeCheck key={check} semis={TAPES[check].semis} finger={TAPES[check].finger} />
        </MicGate>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          Measure with a ruler, or press where the note sounds right and stick the tape just behind your fingertip.
          Then tap <b>Check</b> on a tape and play it on the A string: I'll tell you if the tape needs to move.
        </p>
      )}
    </div>
  );
}

/** Listen to a taped note on the A string and say which way to move the tape. */
function TapeCheck({ semis, finger }: { semis: number; finger: number }) {
  const frame = usePitchState(true);
  const muteUntil = useRef(0);
  const smoothed = useRef<number | null>(null);
  const [good, setGood] = useState(false);
  const target = STRINGS[2].midi + semis;
  const steady = useRef<number | null>(null);
  usePitchListener((f) => {
    const fq = f.t < muteUntil.current ? 0 : f.freq;
    if (!fq) {
      steady.current = null;
      return;
    }
    const c = centsBetween(fq, midiToFreq(target));
    if (Math.abs(c) > 150) return;
    smoothed.current = smoothed.current === null ? c : smoothed.current * 0.7 + c * 0.3;
    if (Math.abs(smoothed.current) < TAPE_OK) {
      if (steady.current === null) steady.current = f.t;
      else if (f.t - steady.current > 700 && !good) {
        setGood(true);
        ding(true);
      }
    } else steady.current = null;
  });
  const heard = frame && frame.t >= muteUntil.current && frame.freq ? centsBetween(frame.freq, midiToFreq(target)) : null;
  const near = heard !== null && Math.abs(heard) <= 150;
  const c = near ? (smoothed.current ?? heard) : null;
  const msg =
    heard === null
      ? `Press finger ${finger} right on its tape on the A string and bow.`
      : !near
        ? `That's ${midiName(Math.round(freqToMidiFloat(frame!.freq)))}. Aim for ${midiName(target)} on the A string.`
        : Math.abs(c!) < TAPE_OK
          ? 'Right on! This tape is in a good spot ✅'
          : c! > 0
            ? 'A bit high: move the tape a little toward the scroll (away from the bridge).'
            : 'A bit low: move the tape a little toward the bridge.';
  return (
    <div className={`tape-check ${good ? 'good' : ''}`}>
      <div className="tape-target">
        <span style={{ color: STRINGS[2].color }}>{midiName(target)}</span>
        <span className="muted small">
          {c === null ? 'listening…' : `${c > 0 ? '+' : ''}${Math.round(c)}¢`}
        </span>
      </div>
      <p className="advice">{msg}</p>
      <button
        className="btn small"
        onClick={() => {
          muteUntil.current = performance.now() + 2600;
          smoothed.current = null;
          playNote(target, 2, 0.8, 'violin');
        }}
      >
        🔊 Hear {midiName(target)}
      </button>
    </div>
  );
}
