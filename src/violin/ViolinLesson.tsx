import { useEffect, useRef, useState } from 'react';
import { usePitchListener, usePitchState } from '../audio/hooks';
import { mic } from '../audio/mic';
import { centsBetween, freqToMidiFloat, midiName, midiToFreq, songLengthBeats, type Song } from '../audio/notes';
import { FullscreenButton, usePlayingMode } from '../ui/chrome';
import { SongPicker } from '../ui/SongPicker';
import { useAnimationCanvas } from '../ui/useAnimationCanvas';
import { BowMap, FingerboardMap } from './FingerboardMap';
import { TunerModal } from './ViolinTuner';
import { Icon } from '../ui/Icon';
import { VoiceSelect } from './touch/TouchViolin';
import { loadViolin, playBowedNote } from './touch/engine';
import { STRINGS, VIOLIN_SONGS, violinNotes, type Fingering } from './theory';
import { type VNoteState, drawViolinHighway } from './violinHighway';

export function ViolinLessons({ header }: { header?: React.ReactNode }) {
  const [song, setSong] = useState<Song | null>(null);
  if (!song) {
    return (
      <SongPicker
        songs={VIOLIN_SONGS}
        instrument="violin"
        onPick={setSong}
        intro={
          <>
            {header}
            <div className="banner">
              <span>Left track: string and finger · Right track: bow</span>
            </div>
          </>
        }
      />
    );
  }
  return <Lesson key={song.id} song={song} onExit={() => setSong(null)} />;
}

type Mode = 'wait' | 'demo';

function Lesson({ song, onExit }: { song: Song; onExit: () => void }) {
  usePlayingMode(true);
  const [mode, setMode] = useState<Mode>('wait');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [speed, setSpeed] = useState(0.75);
  const [tol, setTolState] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(TOL_KEY)) || 60;
    } catch {
      return 60;
    }
  });
  const setTol = (v: number) => {
    setTolState(v);
    try {
      localStorage.setItem(TOL_KEY, String(v));
    } catch {
      /* private mode */
    }
  };
  const [showOpts, setShowOpts] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [micErr, setMicErr] = useState<string | null>(null);
  useEffect(() => {
    loadViolin();
  }, []);
  const [feedback, setFeedback] = useState<{ text: string; tone: string; id: number } | null>(null);
  const [, force] = useState(0);

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
    /** when the last note was hit, and how long it was meant to last */
    hitT: 0,
    hitExpMs: 0,
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
      const nx = pending();
      // the next note is the same pitch: choppy bowing mustn't skip through the
      // repeats. Wait until most of the note has been played, then for a clear
      // new bow (a real break in the sound, or a fresh attack).
      const same = !!nx && nx.midi === st.lastMidi;
      if (!f.freq) {
        if (!st.lostSince) st.lostSince = f.t;
      } else st.lostSince = 0;
      const quiet = st.lostSince ? f.t - st.lostSince : 0;
      st.peakSinceHit = Math.max(st.peakSinceHit, f.rms);
      if (same) {
        const longEnough = f.t - st.hitT > Math.max(300, st.hitExpMs * 0.6);
        if (longEnough && (quiet > 120 || (f.onset && f.rms > st.peakSinceHit * 0.6))) st.armed = true;
      } else {
        if (quiet > 60) st.armed = true;
        if (f.onset || f.rms < st.peakSinceHit * 0.45 || (midi !== null && midi !== st.lastMidi)) st.armed = true;
      }
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
    if (Math.abs(cents) < tol && st.armed) {
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
        st.hitT = f.t;
        st.hitExpMs = p.beats * beatMs;
        st.hold = { note: p, t0: f.t, last: f.t, expMs: p.beats * beatMs, reported: false };
        if (p.quality === 'close') say(avg > 0 ? `${midiName(p.midi)}: a little high ↓` : `${midiName(p.midi)}: a little low ↑`, 'info');
        else if (st.hits % 4 === 0) say(['Lovely! 🎻', 'In tune! 🎯', 'Beautiful bowing ✨', 'Keep going! 🔥'][(st.hits / 4) % 4]);
        if (mode === 'wait' && st.songBeat < p.beat) st.songBeat = Math.max(st.songBeat, p.beat - 0.1);
      }
    } else if (Math.abs(cents) >= tol) {
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
            playBowedNote(n.fing.string, n.midi, (n.beats * beatMs) / 1000 - 0.03, n.bow.dir === 'down');
          }
        });
      }
      if (!pending() && st.songBeat > songLengthBeats(song.notes) + 1) {
        finishHold(now);
        setRunning(false);
        setDone(true);
      }
    }
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
      liveBowPos: null,
      liveBowDir: null,
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

  const total = st.notes.length;
  const stars = !total ? 0 : st.hits === total && st.inTune / total > 0.7 ? 3 : st.hits / total > 0.7 ? 2 : 1;

  const start = async () => {
    if (mode !== 'demo') {
      await mic.start().catch(() => undefined);
      if (mic.status === 'running') setMicErr(null);
      else {
        setMicErr(
          mic.status === 'denied'
            ? "The microphone is blocked. Allow it for this site (Settings app → Safari → Microphone), or use 👂 Listen."
            : `I couldn't start the microphone (${mic.error || 'no answer'}). Tap Start to try again, or use 👂 Listen.`,
        );
        return;
      }
    }
    if (done || !pending()) reset();
    setRunning(true);
  };

  return (
    <div className="lesson">
      <div className="game-bar">
        <button className="btn small ghost" onClick={onExit}>
          <Icon name="back" /><span className="lbl"> Songs</span>
        </button>
        <div className="game-title">
          {song.emoji} {song.title}
        </div>
        <div className="seg mode-seg">
          <button className={mode === 'wait' ? 'on' : ''} onClick={() => { setMode('wait'); setRunning(false); reset(); }}>
            <Icon name="wait" /><span className="lbl"> Wait</span>
          </button>
          <button className={mode === 'demo' ? 'on' : ''} onClick={() => { setMode('demo'); setRunning(false); reset(); }}>
            <Icon name="listen" /><span className="lbl"> Listen</span>
          </button>
        </div>
        <div className="score">
          <Icon name="check" size={16} /> {st.hits}/{total}
        </div>
        <div className="opts-wrap">
          <button
            className={`btn small ${showOpts ? 'primary' : 'ghost'}`}
            onClick={() => setShowOpts((o) => !o)}
            aria-expanded={showOpts}
          >
            <Icon name="settings" /><span className="lbl"> Options</span>
          </button>
          {showOpts && (
            <>
              <div className="opts-scrim" onClick={() => setShowOpts(false)} />
              <div className="opts-pop" role="dialog" aria-label="Song options">
                <div className="opt-row">
                  <span>Speed</span>
                  <div className="seg">
                    {[0.5, 0.75, 1].map((v) => (
                      <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>
                        {v === 0.5 ? '½×' : v === 0.75 ? '¾×' : '1×'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="opt-row">
                  <span>
                    How close counts
                    <span className="muted small tv-hint">Easy lets a slightly out-of-tune note count; go stricter as you get better</span>
                  </span>
                  <div className="seg">
                    {TOLS.map(([v, n]) => (
                      <button key={v} className={tol === v ? 'on' : ''} onClick={() => setTol(v)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="opt-row">
                  <span>Sound for Listen</span>
                  <VoiceSelect />
                </div>
                <div className="opt-row">
                  <span>Tune my violin</span>
                  <button
                    className="btn small"
                    onClick={() => {
                      setShowOpts(false);
                      setRunning(false);
                      setTuning(true);
                    }}
                  >
                    <Icon name="tuner" size={18} /> Tuner
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <FullscreenButton />
      </div>

      {tuning && <TunerModal onClose={() => setTuning(false)} onDone={() => setTuning(false)} />}
      <div className="lesson-body">
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
                {mode !== 'demo' && st.songBeat <= -3 && (
                  <p className="muted small">I'll ask to use the microphone so I can hear your violin.</p>
                )}
                {micErr && mode !== 'demo' && <div className="toast warn">{micErr}</div>}
                <button className="btn big primary" onClick={start}>
                  <Icon name={mode === 'demo' ? 'listen' : st.songBeat > -3 ? 'play' : 'sounds'} size={22} />{' '}
                  {st.songBeat > -3 ? 'Keep going' : mode === 'demo' ? 'Listen to it' : 'Start: turn on the mic'}
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
              <button className="btn small pause" onClick={() => setRunning(false)} aria-label="Pause">
                <Icon name="pause" />
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
            <div className="now-maps">
              <LiveFingerboard fing={arNote?.fing ?? null} next={next?.fing ?? null} midi={arNote?.midi ?? null} tol={tol} />
              <BowMap stroke={arNote?.bow ?? null} live={null} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const TOL_KEY = 'kf.violin.tol';
/** cents a note may be off and still count */
const TOLS: [number, string][] = [
  [30, 'Strict'],
  [60, 'Normal'],
  [100, 'Easy'],
];

/** The little fingerboard, with where the violin is heard on the target string. */
function LiveFingerboard({
  fing,
  next,
  midi,
  tol,
}: {
  fing: Fingering | null;
  next: Fingering | null;
  midi: number | null;
  tol: number;
}) {
  const f = usePitchState(true);
  let heard: { semis: number; name: string; ok: boolean } | null = null;
  if (fing && midi !== null && f?.freq) {
    const m = freqToMidiFloat(f.freq);
    const semis = m - STRINGS[fing.string].midi;
    // only notes that could be on this string (a little below open up to high on the board)
    if (semis > -3 && semis < 10)
      heard = { semis, name: midiName(Math.round(m)).replace(/\d/, ''), ok: Math.abs(m - midi) * 100 < tol };
  }
  return <FingerboardMap fing={fing} next={next} heard={heard} />;
}
