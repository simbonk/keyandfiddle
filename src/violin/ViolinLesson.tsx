import { useEffect, useMemo, useRef, useState } from 'react';
import { usePitchListener } from '../audio/hooks';
import { mic } from '../audio/mic';
import { centsBetween, midiName, midiToFreq, songLengthBeats, type Song } from '../audio/notes';
import { playNote } from '../audio/synth';
import { useAnimationCanvas } from '../ui/useAnimationCanvas';
import { CameraStage } from './CameraStage';
import { BowMap, FingerboardMap } from './FingerboardMap';
import { drawBow, drawFingerTarget, drawGuideBow, drawHandDots, drawViolin } from './overlay';
import { STRINGS, VIOLIN_SONGS, violinNotes } from './theory';
import { type VNoteState, drawViolinHighway } from './violinHighway';
import { type Analysis, ViolinAnalyzer } from './violinModel';

export function ViolinLessons() {
  const [song, setSong] = useState<Song | null>(null);
  if (!song) {
    return (
      <div className="panel">
        <h2>Pick a tune</h2>
        <p className="muted">
          Two tracks come at you: the <b>left track</b> shows which string and which finger, the <b>right track</b> shows
          which part of the bow to use and which way to move it.
        </p>
        <div className="song-grid">
          {VIOLIN_SONGS.map((s) => (
            <button key={s.id} className="song-card" onClick={() => setSong(s)}>
              <span className="song-emoji">{s.emoji}</span>
              <b>{s.title}</b>
              <span className="stars">{'★'.repeat(s.level)}{'☆'.repeat(3 - s.level)}</span>
              {s.blurb && <span className="muted small">{s.blurb}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <Lesson key={song.id} song={song} onExit={() => setSong(null)} />;
}

type Mode = 'wait' | 'demo';

function Lesson({ song, onExit }: { song: Song; onExit: () => void }) {
  const analyzer = useMemo(() => new ViolinAnalyzer(), []);
  const [mode, setMode] = useState<Mode>('wait');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [camera, setCamera] = useState(true);
  const [speed, setSpeed] = useState(0.75);
  const [feedback, setFeedback] = useState<{ text: string; tone: string; id: number } | null>(null);
  const [, force] = useState(0);
  const analysis = useRef<Analysis | null>(null);

  const g = useRef({
    notes: [] as VNoteState[],
    songBeat: -3,
    armed: true,
    matchSince: 0,
    centsAcc: [] as number[],
    hold: null as null | { note: VNoteState; t0: number; last: number; expMs: number; reported: boolean },
    peakSinceHit: 0,
    lostSince: 0,
    lastMidi: null as number | null,
    hits: 0,
    inTune: 0,
    bowRight: 0,
    bowChecked: 0,
    demoIdx: -1,
    heardString: null as number | null,
  });

  const beatMs = 60000 / (song.bpm * speed);
  const say = (text: string, tone = 'good') => setFeedback({ text, tone, id: performance.now() });

  const reset = () => {
    const st = g.current;
    st.notes = violinNotes(song).map((n) => ({ ...n, state: 'pending', quality: null, holdFrac: 0 }));
    st.songBeat = -3;
    st.armed = true;
    st.hold = null;
    st.hits = st.inTune = st.bowRight = st.bowChecked = 0;
    st.demoIdx = -1;
    setDone(false);
    force((x) => x + 1);
  };
  useEffect(reset, [song]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = () => g.current.notes.find((n) => n.state === 'pending') ?? null;

  function finishHold(now: number) {
    const st = g.current;
    const h = st.hold;
    if (!h || h.reported) return;
    h.reported = true;
    const frac = (now - h.t0) / h.expMs;
    h.note.holdFrac = Math.min(1, frac);
    if (h.note.beats >= 1 && frac < 0.5) say('Keep the bow moving longer ⏳', 'info');
    st.hold = null;
  }

  usePitchListener((f) => {
    const st = g.current;
    const midi = f.freq ? Math.round(f.midi) : null;
    // which string lane is ringing (for the highway glow)
    if (midi !== null) {
      let s: number | null = null;
      for (let i = 3; i >= 0; i--) if (midi >= STRINGS[i].midi && s === null) s = i;
      st.heardString = s;
    } else st.heardString = null;

    if (!running || mode === 'demo') return;

    // re-arm for the next note after a bow change / silence / new pitch
    if (!st.armed) {
      if (!f.freq) {
        if (!st.lostSince) st.lostSince = f.t;
        if (f.t - st.lostSince > 60) st.armed = true;
      } else st.lostSince = 0;
      st.peakSinceHit = Math.max(st.peakSinceHit, f.rms);
      if (f.onset || f.rms < st.peakSinceHit * 0.45 || (midi !== null && midi !== st.lastMidi)) st.armed = true;
    }

    // hold tracking
    if (st.hold) {
      if (midi !== null && Math.abs(f.midi - st.hold.note.midi) < 0.6) {
        st.hold.last = f.t;
        st.hold.note.holdFrac = Math.min(1, (f.t - st.hold.t0) / st.hold.expMs);
      } else if (f.t - st.hold.last > 200) finishHold(st.hold.last);
    }

    const p = pending();
    if (!p || p.beat > st.songBeat + 1.25) {
      st.matchSince = 0;
      return;
    }
    if (midi === null) {
      st.matchSince = 0;
      st.centsAcc = [];
      return;
    }
    const cents = centsBetween(f.freq, midiToFreq(p.midi));
    if (Math.abs(cents) < 60 && st.armed) {
      if (!st.matchSince) {
        st.matchSince = f.t;
        st.centsAcc = [];
      }
      st.centsAcc.push(cents);
      if (f.t - st.matchSince > 130) {
        // HIT
        finishHold(f.t);
        const avg = st.centsAcc.reduce((a, b) => a + b, 0) / st.centsAcc.length;
        p.state = 'hit';
        p.quality = Math.abs(avg) < 20 ? 'good' : 'close';
        st.hits++;
        if (p.quality === 'good') st.inTune++;
        st.armed = false;
        st.peakSinceHit = f.rms;
        st.lastMidi = midi;
        st.matchSince = 0;
        st.hold = { note: p, t0: f.t, last: f.t, expMs: p.beats * beatMs, reported: false };
        const dir = analyzer.bowDir;
        if (dir) {
          st.bowChecked++;
          if (dir === p.bow.dir) st.bowRight++;
        }
        if (dir && dir !== p.bow.dir) say(p.bow.dir === 'down' ? 'That one is a pull ⊓ (down bow)' : 'That one is a push V (up bow)', 'info');
        else if (p.quality === 'close') say(avg > 0 ? `${midiName(p.midi)}: a little high ↓` : `${midiName(p.midi)}: a little low ↑`, 'info');
        else if (st.hits % 4 === 0) say(['Lovely! 🎻', 'In tune! 🎯', 'Beautiful bowing ✨', 'Keep going! 🔥'][(st.hits / 4) % 4]);
        if (mode === 'wait' && st.songBeat < p.beat) st.songBeat = Math.max(st.songBeat, p.beat - 0.1);
      }
    } else if (Math.abs(cents) >= 60) {
      st.matchSince = 0;
    }
  });

  const canvasRef = useAnimationCanvas((ctx, w, h, now, dt) => {
    const st = g.current;
    let waiting = false;
    if (running && !done) {
      st.songBeat += (dt * song.bpm * speed) / 60;
      const p = pending();
      if (mode === 'wait' && p && st.songBeat > p.beat) {
        st.songBeat = p.beat;
        waiting = true;
      }
      if (mode === 'demo') {
        st.notes.forEach((n, i) => {
          if (i > st.demoIdx && n.state === 'pending' && n.beat <= st.songBeat) {
            st.demoIdx = i;
            n.state = 'hit';
            n.quality = 'good';
            n.holdFrac = 1;
            playNote(n.midi, (n.beats * beatMs) / 1000 - 0.03, 0.8, 'violin');
          }
        });
      }
      if (!pending() && st.songBeat > songLengthBeats(song.notes) + 1) {
        finishHold(now);
        setRunning(false);
        setDone(true);
      }
    }
    const a = analysis.current;
    drawViolinHighway({
      ctx,
      w,
      h,
      songBeat: st.songBeat,
      visibleBeats: 6 / Math.max(0.5, speed),
      notes: st.notes,
      current: pending(),
      waiting,
      now,
      liveBowPos: a?.bow?.bowPos ?? null,
      liveBowDir: analyzer.bowDir,
      heardString: st.heardString,
    });
  });

  useEffect(() => {
    const id = window.setInterval(() => force((x) => x + 1), 180);
    return () => clearInterval(id);
  }, []);

  const st = g.current;
  const upcoming = st.notes.filter((n) => n.state === 'pending');
  const cur = upcoming[0] ?? null;
  const next = upcoming[1] ?? null;
  // the bow guide follows the note being held, else shows the start of the next one
  const holding = st.hold && !st.hold.reported ? st.hold.note : null;
  const arNote = holding ?? cur;

  const drawAR = (ctx: CanvasRenderingContext2D, a: Analysis | null, _w: number, _h: number, now: number) => {
    if (!a || !a.violin || !arNote) return;
    drawViolin(ctx, a.violin, arNote.fing.string, now);
    drawFingerTarget(ctx, a.violin, arNote.fing, now, a.left ? [8, 12, 16, 20].map((i) => a.left![i]) : null);
    const progress = holding ? Math.min(1, (performance.now() - (st.hold?.t0 ?? 0)) / (st.hold?.expMs ?? 1)) : 0;
    drawGuideBow(ctx, a.violin, arNote.bow, progress, arNote.fing.string);
    if (a.left) drawHandDots(ctx, a.left, '#ff9f1c');
    if (a.right) drawHandDots(ctx, a.right, '#2ec4f1');
    if (a.bow) drawBow(ctx, a.bow, a.bow.angleErr === null ? null : a.bow.angleErr < 18);
  };

  const total = st.notes.length;
  const stars = !total ? 0 : st.hits === total && st.inTune / total > 0.7 ? 3 : st.hits / total > 0.7 ? 2 : 1;

  const start = async () => {
    if (mode !== 'demo') await mic.start();
    if (done || !pending()) reset();
    setRunning(true);
  };

  return (
    <div className="lesson">
      <div className="game-bar">
        <button className="btn small ghost" onClick={onExit}>
          ◀ Tunes
        </button>
        <div className="game-title">
          {song.emoji} {song.title}
        </div>
        <div className="seg">
          <button className={mode === 'wait' ? 'on' : ''} onClick={() => { setMode('wait'); setRunning(false); reset(); }}>
            🐢 Wait for me
          </button>
          <button className={mode === 'demo' ? 'on' : ''} onClick={() => { setMode('demo'); setRunning(false); reset(); }}>
            👂 Listen
          </button>
        </div>
        <select value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="speed">
          <option value={0.5}>½ speed</option>
          <option value={0.75}>¾ speed</option>
          <option value={1}>full speed</option>
        </select>
        <button className={`btn small ${camera ? 'primary' : ''}`} onClick={() => setCamera((c) => !c)}>
          🪞 Mirror {camera ? 'on' : 'off'}
        </button>
        <div className="score">
          🎯 {st.hits}/{total}
        </div>
      </div>

      <div className={`lesson-body ${camera ? 'with-cam' : ''}`}>
        {camera && (
          <div className="lesson-cam">
            <CameraStage
              contain
              draw={drawAR}
              analyzer={analyzer}
              targetString={arNote?.fing.string ?? null}
              onAnalysis={(a) => (analysis.current = a)}
            />
          </div>
        )}
        <div className="lesson-track">
          <div className="highway-wrap">
            <canvas ref={canvasRef} className="highway" />
            {feedback && (
              <div key={feedback.id} className={`float-feedback ${feedback.tone}`}>
                {feedback.text}
              </div>
            )}
            {!running && !done && (
              <div className="overlay-center">
                <button className="btn big primary" onClick={start}>
                  {st.songBeat > -3 ? '▶ Keep going' : mode === 'demo' ? '👂 Listen to it' : '▶ Start'}
                </button>
                <p className="muted small">
                  {mode === 'wait' ? 'Each note waits until I hear it. Watch the finger AND the bow!' : 'Hear how it goes first.'}
                </p>
              </div>
            )}
            {done && (
              <div className="overlay-center results">
                <div className="big-stars">{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</div>
                <h2>{stars === 3 ? 'Bravo!' : 'Nice work!'}</h2>
                <p>
                  {st.inTune} of {total} notes in tune
                  {st.bowChecked > 0 ? ` · bow direction right ${st.bowRight}/${st.bowChecked}` : ''}
                </p>
                <div className="row">
                  <button className="btn big primary" onClick={() => { reset(); setRunning(true); }}>
                    Again
                  </button>
                  <button className="btn" onClick={onExit}>
                    Another tune
                  </button>
                </div>
              </div>
            )}
            {running && (
              <button className="btn small pause" onClick={() => setRunning(false)}>
                ⏸
              </button>
            )}
          </div>
          <div className="now-panel">
            <div className="now-label">
              {cur ? (
                <>
                  Now: <b style={{ color: STRINGS[cur.fing.string].color }}>{midiName(cur.midi)}</b> · {cur.fing.label}
                  {next && (
                    <span className="muted small">
                      {' '}
                      · next {midiName(next.midi)} ({next.bow.dir === 'down' ? '⊓' : 'V'})
                    </span>
                  )}
                </>
              ) : (
                'All done!'
              )}
            </div>
            <FingerboardMap fing={arNote?.fing ?? null} next={next?.fing ?? null} />
            <BowMap stroke={arNote?.bow ?? null} live={analysis.current?.bow?.bowPos ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}
