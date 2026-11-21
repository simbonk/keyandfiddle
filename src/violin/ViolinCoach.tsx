import { useMemo, useRef, useState } from 'react';
import { usePitchState } from '../audio/hooks';
import { mic } from '../audio/mic';
import { centsBetween, midiName, midiToFreq } from '../audio/notes';
import { CameraStage } from './CameraStage';
import { drawBow, drawFingerTarget, drawGuideBow, drawHandDots, drawPose, drawViolin } from './overlay';
import { STRINGS, fingeringFor, type BowStroke } from './theory';
import { type Analysis, ViolinAnalyzer } from './violinModel';

const PRACTICE_NOTES = [55, 62, 69, 76, 71, 73, 74, 64, 66, 67, 78, 80];

export function ViolinCoach() {
  const analyzer = useMemo(() => new ViolinAnalyzer(), []);
  const [ghost, setGhost] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [note, setNote] = useState<number>(69);
  const [dir, setDir] = useState<'down' | 'up'>('down');
  const [a, setA] = useState<Analysis | null>(null);
  const lastUi = useRef(0);
  const fing = fingeringFor(note);
  const frame = usePitchState(true);

  const stroke: BowStroke = dir === 'down' ? { dir, from: 0.1, to: 0.9 } : { dir, from: 0.9, to: 0.1 };
  const cents = frame?.freq ? centsBetween(frame.freq, midiToFreq(note)) : null;
  const onNote = cents !== null && Math.abs(cents) < 50;

  const draw = (ctx: CanvasRenderingContext2D, an: Analysis | null, _w: number, _h: number, now: number) => {
    if (!an) return;
    drawPose(ctx, an);
    if (an.violin) {
      drawViolin(ctx, an.violin, fing?.string ?? null, now);
      drawFingerTarget(ctx, an.violin, fing, now, an.left ? [8, 12, 16, 20].map((i) => an.left![i]) : null);
      // guide bow loops along the stroke every 2.5 s
      drawGuideBow(ctx, an.violin, stroke, ((now / 2500) % 1), fing?.string ?? 2);
    }
    if (an.left) drawHandDots(ctx, an.left, '#ff9f1c');
    if (an.right) drawHandDots(ctx, an.right, '#2ec4f1');
    if (an.bow) {
      const okAngle = an.bow.angleErr === null ? null : an.bow.angleErr < 18;
      drawBow(ctx, an.bow, okAngle);
    }
  };

  const onAnalysis = (an: Analysis) => {
    const t = performance.now();
    if (t - lastUi.current > 200) {
      lastUi.current = t;
      setA(an);
    }
  };

  const checks = a?.checks ?? [];
  const okCount = checks.filter((c) => c.ok).length;
  const firstBad = checks.find((c) => c.ok === false);

  return (
    <div className="coach">
      <CameraStage
        draw={draw}
        onAnalysis={onAnalysis}
        ghost={ghost}
        analyzer={analyzer}
        targetString={fing?.string ?? null}
        pinning={pinning}
        onPinned={(ok) => {
          setPinning(false);
          setPinned(ok);
        }}
      >
        <div className="stage-tools">
          <button className={`btn small ${ghost ? 'primary' : ''}`} onClick={() => setGhost((g) => !g)}>
            👻 {ghost ? 'Showing how to hold' : 'Show me how to hold it'}
          </button>
          {!pinned ? (
            <button className={`btn small ${pinning ? 'primary' : ''}`} onClick={() => setPinning((p) => !p)}>
              📌 {pinning ? 'Cancel' : 'Pin my violin'}
            </button>
          ) : (
            <button
              className="btn small"
              onClick={() => {
                analyzer.pin = null;
                setPinned(false);
              }}
            >
              📌 Unpin
            </button>
          )}
        </div>
        {firstBad && <div className="coach-tip">💡 {firstBad.tip}</div>}
      </CameraStage>

      <aside className="coach-side">
        <h3>
          Posture {checks.length > 0 && <span className="pill">{okCount}/{checks.length}</span>}
        </h3>
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.id} className={c.ok === null ? 'unknown' : c.ok ? 'ok' : 'bad'}>
              <span>{c.ok === null ? '…' : c.ok ? '✅' : '🟠'}</span> {c.label}
            </li>
          ))}
          {!checks.length && <li className="unknown">Turn on the camera to start</li>}
        </ul>

        <h3>Bow</h3>
        <div className="bow-readout">
          <div className="bow-bar">
            <span className="bow-end">frog</span>
            <div className="bow-track">
              {a?.bow?.bowPos != null && <div className="bow-marker" style={{ left: `${a.bow.bowPos * 100}%` }} />}
            </div>
            <span className="bow-end">tip</span>
          </div>
          <div className="row center">
            <span className={`dir ${analyzer.bowDir === 'down' ? 'on' : ''}`}>⊓ pull</span>
            <span className={`dir ${analyzer.bowDir === 'up' ? 'on' : ''}`}>V push</span>
          </div>
          {a?.bow?.angleErr != null && (
            <div className="muted small">Bow angle: {a.bow.angleErr < 18 ? 'nice and straight ✓' : `${Math.round(a.bow.angleErr)}° off`}</div>
          )}
        </div>

        <h3>Try a note</h3>
        <div className="note-chips">
          {PRACTICE_NOTES.map((m) => {
            const f = fingeringFor(m)!;
            return (
              <button
                key={m}
                className={`chip ${m === note ? 'on' : ''}`}
                style={{ ['--c' as string]: STRINGS[f.string].color }}
                onClick={() => {
                  setNote(m);
                  mic.start();
                }}
              >
                {midiName(m).replace(/\d/, '')}
                <small>{f.finger === 0 ? 'open' : `${f.finger}`}</small>
              </button>
            );
          })}
        </div>
        <div className="row center">
          <button className={`btn small ${dir === 'down' ? 'primary' : ''}`} onClick={() => setDir('down')}>
            ⊓ down bow
          </button>
          <button className={`btn small ${dir === 'up' ? 'primary' : ''}`} onClick={() => setDir('up')}>
            V up bow
          </button>
        </div>
        {fing && <p className="small">{fing.label[0].toUpperCase() + fing.label.slice(1)}.</p>}
        <div className={`intonation ${onNote ? (Math.abs(cents!) < 15 ? 'good' : 'close') : ''}`}>
          {mic.status !== 'running'
            ? 'Tap a note to turn on listening'
            : !frame?.freq
              ? 'Play the note…'
              : onNote
                ? Math.abs(cents!) < 15
                  ? `🎯 ${midiName(note)} in tune!`
                  : cents! > 0
                    ? '↓ a little high: slide your finger back'
                    : '↑ a little low: slide your finger forward'
                : `I hear ${midiName(Math.round(69 + 12 * Math.log2(frame.freq / 440)))}`}
        </div>
      </aside>
    </div>
  );
}
