import { useRef, useState } from 'react';
import { usePitchListener, usePitchState } from '../audio/hooks';
import { centsBetween, freqToMidiFloat, midiName, midiToFreq } from '../audio/notes';
import { playNote } from '../audio/synth';
import { LevelMeter, MicGate } from '../ui/MicButton';
import { STRINGS } from './theory';

const IN_TUNE = 6; // cents

export function ViolinTuner({ onDone }: { onDone?: () => void }) {
  const [sel, setSel] = useState<number | 'auto'>(0);
  const [tuned, setTuned] = useState<boolean[]>([false, false, false, false]);
  const frame = usePitchState(true);
  const steadySince = useRef<number | null>(null);
  const smoothed = useRef<number | null>(null);

  // which string are we listening to?
  const detectedString = (() => {
    if (!frame?.freq) return null;
    const m = freqToMidiFloat(frame.freq);
    let best = 0;
    STRINGS.forEach((s, i) => {
      if (Math.abs(s.midi - m) < Math.abs(STRINGS[best].midi - m)) best = i;
    });
    return Math.abs(STRINGS[best].midi - m) < 3.5 ? best : null;
  })();
  const active = sel === 'auto' ? (detectedString ?? 0) : sel;
  const target = STRINGS[active];

  usePitchListener((f) => {
    if (!f.freq) {
      steadySince.current = null;
      return;
    }
    const c = centsBetween(f.freq, midiToFreq(target.midi));
    if (Math.abs(c) > 300) return;
    smoothed.current = smoothed.current === null ? c : smoothed.current * 0.7 + c * 0.3;
    if (Math.abs(smoothed.current) < IN_TUNE) {
      if (steadySince.current === null) steadySince.current = f.t;
      else if (f.t - steadySince.current > 900 && !tuned[active]) {
        setTuned((t) => t.map((v, i) => (i === active ? true : v)));
        // move on to the next untuned string automatically
        if (sel !== 'auto') {
          const next = [0, 1, 2, 3].find((i) => i !== active && !tuned[i]);
          if (next !== undefined) window.setTimeout(() => setSel(next), 900);
        }
      }
    } else steadySince.current = null;
  });

  const cents =
    frame?.freq && Math.abs(centsBetween(frame.freq, midiToFreq(target.midi))) < 300 ? (smoothed.current ?? 0) : null;
  const angle = cents === null ? 0 : Math.max(-50, Math.min(50, cents)) * 1.6;
  const ok = cents !== null && Math.abs(cents) < IN_TUNE;

  // what the child is playing right now, as a note name
  const heardMidi = frame?.freq ? Math.round(freqToMidiFloat(frame.freq)) : null;
  const otherString = detectedString !== null && detectedString !== active ? STRINGS[detectedString] : null;
  const bowing = !!frame && frame.rms > 0.01;
  const dir: 'up' | 'down' | 'ok' | null = cents === null ? null : ok ? 'ok' : cents < 0 ? 'up' : 'down';

  let advice = `Bow the ${target.name} string, ${target.nickname}. Use long, smooth bows.`;
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
              <span className="tuner-cents">
                {cents === null ? '' : `${cents > 0 ? '+' : ''}${Math.round(cents)}¢`}
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
          <button className="btn small" onClick={() => playNote(target.midi, 2, 0.8, 'violin')}>
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
