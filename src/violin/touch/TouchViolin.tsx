import { useEffect, useMemo, useRef, useState } from 'react';
import { midiName, midiToFreq, songLengthBeats, type Song } from '../../audio/notes';
import { FullscreenButton, usePlayingMode } from '../../ui/chrome';
import { SongPicker } from '../../ui/SongPicker';
import { useAnimationCanvas } from '../../ui/useAnimationCanvas';
import { STRINGS, VIOLIN_SONGS, violinNotes } from '../theory';
import type { VNoteState } from '../violinHighway';
import { RotateTip } from './RotateTip';
import { loadViolin, sendStrings, silence, unlockAudio } from './engine';
import { type DrawTargets, type ViolinOptions, TouchViolinState, VIOLIN_SIZES, drawTouchViolin, screenPxPerMm, violinLayout } from './instrument';
import type { StringMsg } from './violinProcessor';

/** The "Touch violin" screen: free play or a song, played on the iPad held like a violin. */
export function TouchViolinTab() {
  const [song, setSong] = useState<Song | null | 'free'>(null);
  useEffect(() => {
    loadViolin();
  }, []);
  if (song === 'free') return <TouchViolinPlay song={null} onExit={() => setSong(null)} />;
  if (song) return <TouchViolinPlay key={song.id} song={song} onExit={() => setSong(null)} />;
  return (
    <SongPicker
      songs={VIOLIN_SONGS}
      instrument="violin"
      onPick={setSong}
      intro={
        <>
          <p className="muted">
            No violin needed, great for the car. Hold the iPad sideways like a violin: one hand curls over the edge to press
            the strings on the neck, the other bows up and down across the strings in the bow area. Pull away from
            the edge for a down bow, push back toward it for an up bow. Faster bowing plays louder. In ⚙️ Options you can put the neck on either side
            and either edge, and pick a smaller violin for smaller hands.
          </p>
          <div className="song-grid">
            <button className="song-card" onClick={() => setSong('free')}>
              <span className="song-emoji">🎻</span>
              <b>Free play</b>
              <span className="muted small">Just play! Every note on the four strings.</span>
            </button>
          </div>
        </>
      }
    />
  );
}

const OPTS_KEY = 'kf.tv.opts';
interface StoredOpts extends ViolinOptions {
  names: boolean;
  /** strings further apart than a real violin */
  big: boolean;
  /** neck along the top edge (fingers curl over it), music below */
  neckTop: boolean;
  /** violin size, e.g. '1/2' */
  size: string;
  /** neck on the right, bow with the left hand */
  neckRight: boolean;
  /** portrait screen held sideways: which way the violin is drawn */
  turn: 'cw' | 'ccw';
  /** the "upright, rotation lock, sideways" tip has been seen */
  tipSeen: boolean;
}
function loadOpts(): StoredOpts {
  const def: StoredOpts = { snap: true, easyBow: true, vibrato: true, names: false, big: false, neckTop: true, size: '4/4', neckRight: false, turn: 'cw', tipSeen: false };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') };
  } catch {
    return def;
  }
}

type Mode = 'wait' | 'demo';

function TouchViolinPlay({ song, onExit }: { song: Song | null; onExit: () => void }) {
  usePlayingMode(true);
  const vs = useMemo(() => new TouchViolinState(), []);
  const [opts, setOpts] = useState<StoredOpts>(loadOpts);
  const [showOpts, setShowOpts] = useState(false);
  const [mode, setMode] = useState<Mode>('wait');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [speed, setSpeed] = useState(0.75);
  const [feedback, setFeedback] = useState<{ text: string; tone: string; id: number } | null>(null);
  const [, force] = useState(0);
  vs.opts = opts;

  useEffect(() => {
    try {
      localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
    } catch {
      /* ignore */
    }
  }, [opts]);
  useEffect(() => () => silence(), []);

  // Portrait screen (rotation locked) held sideways: draw the whole violin
  // screen turned a quarter, so it never jumps when the iPad tilts.
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  const portrait = vp.h > vp.w;
  const rot: 'none' | 'cw' | 'ccw' = portrait ? opts.turn : 'none';
  const frame: React.CSSProperties =
    rot === 'none'
      ? {}
      : {
          width: vp.h,
          height: vp.w,
          transform: rot === 'cw' ? `translateX(${vp.w}px) rotate(90deg)` : `translateY(${vp.h}px) rotate(-90deg)`,
        };

  const bpm = song?.bpm ?? 80;
  const beatMs = 60000 / (bpm * speed);
  const say = (text: string, tone = 'good') => setFeedback({ text, tone, id: performance.now() });

  const g = useRef({
    notes: [] as VNoteState[],
    songBeat: -3,
    matchSince: 0,
    lastHit: { stroke: -1, midi: -1 },
    hold: null as null | { note: VNoteState; t0: number; last: number; expMs: number },
    hits: 0,
    bowRight: 0,
    demoIdx: -1,
    demo: null as null | { note: VNoteState; start: number },
  });

  const reset = () => {
    const st = g.current;
    st.notes = song ? violinNotes(song).map((n) => ({ ...n, state: 'pending', quality: null, holdFrac: 0 })) : [];
    st.songBeat = -3;
    st.hold = null;
    st.hits = st.bowRight = 0;
    st.demoIdx = -1;
    st.demo = null;
    st.lastHit = { stroke: -1, midi: -1 };
    setDone(false);
    silence();
    force((x) => x + 1);
  };
  useEffect(reset, [song]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = () => g.current.notes.find((n) => n.state === 'pending') ?? null;
  const demoing = mode === 'demo' && running;

  // ---------------- per-frame: sound, scoring, drawing ----------------
  const surfaceRef = useAnimationCanvas((ctx, w, h, now, dt) => {
    const st = g.current;
    const key = `${opts.big}${opts.neckTop}${opts.size}`;
    if (vs.L.w !== w || vs.L.h !== h || layoutKey.current !== key) {
      vs.L = violinLayout(w, h, screenPxPerMm(), opts.big, opts.neckTop, VIOLIN_SIZES.find((z) => z[0] === opts.size)?.[1] ?? 1);
      layoutKey.current = key;
    }
    let waiting = false;
    let ghost: DrawTargets['ghost'] = null;

    if (song && running && !done) {
      st.songBeat += (dt * bpm * speed) / 60;
      const p = pending();
      if (mode === 'wait' && p && st.songBeat > p.beat) {
        st.songBeat = p.beat;
        waiting = true;
      }
      if (mode === 'demo') ghost = runDemo(now);
      if (!pending() && st.songBeat > songLengthBeats(song.notes) + 1) {
        st.hold = null;
        silence();
        setRunning(false);
        setDone(true);
      }
    }

    if (!demoing) {
      const msgs = vs.frame(now, dt);
      sendStrings(msgs);
      if (song && running && mode === 'wait') score(now);
    }

    const cur = pending();
    const holding = st.hold?.note ?? null;
    const tn = song && !done && mode === 'wait' ? (holding ?? cur) : null;
    drawTouchViolin(
      ctx,
      vs,
      {
        target: tn ? { string: tn.fing.string, semis: tn.fing.semis, finger: tn.fing.finger, bow: tn.bow } : null,
        ghost,
        progress: holding && st.hold ? Math.min(1, (now - st.hold.t0) / st.hold.expMs) : 0,
        falling: song
          ? { notes: st.notes, songBeat: st.songBeat, visibleBeats: 4 / Math.max(0.5, speed), current: cur, waiting }
          : null,
      },
      opts.names,
      now,
      opts.neckRight,
    );
  });

  function runDemo(now: number): DrawTargets['ghost'] {
    const st = g.current;
    st.notes.forEach((n, i) => {
      if (i > st.demoIdx && n.state === 'pending' && n.beat <= st.songBeat) {
        st.demoIdx = i;
        n.state = 'hit';
        n.quality = 'good';
        n.holdFrac = 1;
        const prev = st.demo?.note;
        const msgs: StringMsg[] = [];
        if (prev && prev.fing.string !== n.fing.string) msgs.push({ i: prev.fing.string, bowing: false, vel: 0 });
        const long = n.beats * beatMs > 700;
        msgs.push({
          i: n.fing.string,
          freq: midiToFreq(n.midi),
          snap: true,
          bowing: true,
          vel: (n.bow.dir === 'down' ? 1 : -1) * (0.1 + 0.05 * Math.abs(n.bow.to - n.bow.from)),
          vib: long && n.fing.semis > 0 ? 0.09 : 0,
        });
        sendStrings(msgs);
        st.demo = { note: n, start: now };
      }
    });
    const d = st.demo;
    if (!d) return null;
    const n = d.note;
    const frac = Math.min(1, (st.songBeat - n.beat) / n.beats);
    if (st.songBeat > n.beat + n.beats - 0.06) {
      const next = st.notes[st.demoIdx + 1];
      // lift the bow only if there is a gap before the next note
      if (!next || next.beat > n.beat + n.beats + 0.05) {
        sendStrings([{ i: n.fing.string, vel: 0, bowing: false }]);
      }
    }
    return {
      string: n.fing.string,
      semis: n.fing.semis,
      bowPos: n.bow.from + (n.bow.to - n.bow.from) * frac,
      dir: n.bow.dir,
    };
  }

  function finishHold(now: number) {
    const st = g.current;
    const h = st.hold;
    if (!h) return;
    const frac = (now - h.t0) / h.expMs;
    h.note.holdFrac = Math.min(1, frac);
    if (h.note.beats >= 1.5 && frac < 0.5) say('Keep bowing a bit longer ⏳', 'info');
    st.hold = null;
  }

  function score(now: number) {
    const st = g.current;
    const snd = vs.sounding();
    if (st.hold) {
      if (snd && Math.abs(snd.midi - st.hold.note.midi) < 0.4) {
        st.hold.last = now;
        st.hold.note.holdFrac = Math.min(1, (now - st.hold.t0) / st.hold.expMs);
        if (st.hold.note.holdFrac >= 1) st.hold = null;
      } else if (now - st.hold.last > 250) finishHold(st.hold.last);
    }
    const p = pending();
    if (!p || p.beat > st.songBeat + 1.0 || !snd) {
      st.matchSince = 0;
      wrongSince.current = 0;
      return;
    }
    const fresh = vs.strokeId !== st.lastHit.stroke || Math.round(snd.midi) !== st.lastHit.midi;
    if (Math.abs(snd.midi - p.midi) < 0.4 && fresh) {
      if (!st.matchSince) st.matchSince = now;
      if (now - st.matchSince > 70) {
        finishHold(now);
        p.state = 'hit';
        p.quality = 'good';
        st.hits++;
        st.matchSince = 0;
        st.lastHit = { stroke: vs.strokeId, midi: Math.round(snd.midi) };
        st.hold = { note: p, t0: now, last: now, expMs: p.beats * beatMs };
        if (snd.dir === p.bow.dir) st.bowRight++;
        if (snd.dir && snd.dir !== p.bow.dir)
          say(p.bow.dir === 'down' ? 'That one is a pull ⊓ (down bow)' : 'That one is a push V (up bow)', 'info');
        else if (st.hits % 4 === 0) say(['Lovely! 🎻', 'Beautiful bowing ✨', 'Keep going! 🔥', 'You sound great! 🌟'][(st.hits / 4) % 4]);
        if (st.songBeat < p.beat) st.songBeat = Math.max(st.songBeat, p.beat - 0.1);
      }
    } else {
      st.matchSince = 0;
      // a wrong note bowed for a while gets a gentle hint (not too often)
      const holdingIt = st.hold && Math.abs(snd.midi - st.hold.note.midi) < 0.4;
      if (Math.abs(snd.midi - p.midi) >= 0.4 && !holdingIt) {
        if (!wrongSince.current) wrongSince.current = now;
        if (now - wrongSince.current > 1200 && now - lastHint.current > 4000) {
          lastHint.current = now;
          say(`Try ${p.fing.label} 👉`, 'info');
        }
        return;
      }
    }
    wrongSince.current = 0;
  }
  const wrongSince = useRef(0);
  const lastHint = useRef(0);

  const layoutKey = useRef('');

  useEffect(() => {
    const id = window.setInterval(() => force((x) => x + 1), 200);
    return () => clearInterval(id);
  }, []);

  // ---------------- touch ----------------
  // iPad Safari: no magnifier, text selection or double-tap zoom while playing
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => {
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('touchmove', stop);
    };
  }, [surfaceRef]);
  /** screen point -> the violin's own (unrotated) canvas coordinates */
  const local = (cx: number, cy: number, r: DOMRect): [number, number] => {
    if (rot === 'cw') return [cy - r.top, r.right - cx];
    if (rot === 'ccw') return [r.bottom - cy, cx - r.left];
    return [cx - r.left, cy - r.top];
  };
  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => local(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  // neck on the right: the violin is drawn mirrored, so mirror the touches too
  const fx = (x: number) => (opts.neckRight ? vs.L.w - x : x);
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    unlockAudio();
    if (demoing) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const [x, y] = pt(e);
    vs.down(e.pointerId, fx(x), y, e.timeStamp);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (demoing) return;
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const r = e.currentTarget.getBoundingClientRect();
    const list = evs.length > 1 ? evs : [e.nativeEvent];
    for (const c of list) {
      const [x, y] = local(c.clientX, c.clientY, r);
      vs.move(e.pointerId, fx(x), y, c.timeStamp);
    }
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => vs.up(e.pointerId);

  const st = g.current;
  const total = st.notes.length;
  const stars = !total ? 0 : st.bowRight / total > 0.8 ? 3 : st.bowRight / total > 0.5 ? 2 : 1;
  const cur = pending();
  const snd = vs.sounding();

  const start = () => {
    unlockAudio();
    if (done || !pending()) reset();
    vs.clear();
    setRunning(true);
  };
  const setOpt = (k: keyof StoredOpts, v: boolean) => setOpts((o) => ({ ...o, [k]: v }));

  const playing = snd
    ? `${midiName(Math.round(snd.midi))}${Math.abs(snd.midi - Math.round(snd.midi)) > 0.08 ? (snd.midi > Math.round(snd.midi) ? ' ↑' : ' ↓') : ''}`
    : null;

  return (
    <div className={`lesson touch-violin tv-full ${opts.neckTop ? 'neck-top' : ''} ${rot !== 'none' ? 'tv-turned' : ''}`} style={frame}>
      <div className="game-bar">
        <button className="btn small ghost back" onClick={onExit}>
          ◀<span className="lbl"> Songs</span>
        </button>
        <div className="game-title">{song ? `${song.emoji} ${song.title}` : '🎻 Free play'}</div>
        <div className="bar-feedback">
          {feedback ? (
            <span key={feedback.id} className={`fb-pill ${feedback.tone}`}>
              {feedback.text}
            </span>
          ) : playing ? (
            <span className="tv-playing" style={{ color: STRINGS[snd!.string].color }}>
              {playing}
            </span>
          ) : null}
        </div>
        {song && (
          <>
            <div className="seg mode-seg">
              <button className={mode === 'wait' ? 'on' : ''} onClick={() => { setMode('wait'); setRunning(false); reset(); }}>
                🐢<span className="lbl"> Play</span>
              </button>
              <button className={mode === 'demo' ? 'on' : ''} onClick={() => { setMode('demo'); setRunning(false); reset(); }}>
                👂<span className="lbl"> Listen</span>
              </button>
            </div>
            <div className="score">
              🎯 {st.hits}/{total}
            </div>
          </>
        )}
        <div className="opts-wrap">
          <button className={`btn small ${showOpts ? 'primary' : 'ghost'}`} onClick={() => setShowOpts((o) => !o)} aria-expanded={showOpts}>
            ⚙️<span className="lbl"> Options</span>
          </button>
          {showOpts && (
            <>
              <div className="opts-scrim" onClick={() => setShowOpts(false)} />
              <div className="opts-pop" role="dialog" aria-label="Violin options">
                {song && (
                  <div className="opt-row">
                    <span>Speed</span>
                    <div className="seg">
                      {[0.5, 0.75, 1].map((s) => (
                        <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
                          {s === 0.5 ? '½×' : s === 0.75 ? '¾×' : '1×'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Toggle label="Fingers snap to notes" hint="Off: slide anywhere, like a real violin" on={opts.snap} set={(v) => setOpt('snap', v)} />
                <Toggle label="Easy bow" hint="The string your finger is on plays, wherever you bow" on={opts.easyBow} set={(v) => setOpt('easyBow', v)} />
                <Toggle label="Vibrato" hint="A little wobble on long notes" on={opts.vibrato} set={(v) => setOpt('vibrato', v)} />
                <Toggle label="Note names" on={opts.names} set={(v) => setOpt('names', v)} />
                <Toggle
                  label="Left-handed (neck on the right)"
                  hint="Bow with your left hand, like a left-handed violin"
                  on={opts.neckRight}
                  set={(v) => setOpt('neckRight', v)}
                />
                <Toggle
                  label="Neck along the top edge"
                  hint="Fingers curl over the top of the iPad. Off: bottom edge"
                  on={opts.neckTop}
                  set={(v) => setOpt('neckTop', v)}
                />
                <div className="opt-row">
                  <span>
                    Violin size
                    <span className="muted small tv-hint">Smaller violins have closer fingers, for smaller hands</span>
                  </span>
                  <div className="seg">
                    {VIOLIN_SIZES.map(([name]) => (
                      <button key={name} className={opts.size === name ? 'on' : ''} onClick={() => setOpts((o) => ({ ...o, size: name }))}>
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                <Toggle label="Wider strings" hint="Strings further apart, for bigger fingertips" on={opts.big} set={(v) => setOpt('big', v)} />
              </div>
            </>
          )}
        </div>
        {portrait && (
          <button className="btn small ghost" onClick={() => setOpts((o) => ({ ...o, turn: o.turn === 'cw' ? 'ccw' : 'cw' }))}>
            ↻<span className="lbl"> Flip</span>
          </button>
        )}
        <button className="btn small ghost" onClick={() => setOpts((o) => ({ ...o, tipSeen: false }))} aria-label="How to hold it">
          ?
        </button>
        <FullscreenButton />
      </div>

      <div className="tv-surface">
        <canvas
          ref={surfaceRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onLostPointerCapture={onUp}
          onContextMenu={(e) => e.preventDefault()}
        />
        {song && (
        <div
          className="tv-over"
          style={opts.neckTop ? { top: vs.L.strikeY, bottom: 0 } : { top: 0, height: Math.max(120, vs.L.strikeY) }}
        >
          {!running && !done && (
            <div className="overlay-center">
              <button className="btn big primary" onClick={start}>
                {st.songBeat > -3 ? '▶ Keep going' : mode === 'demo' ? '👂 Listen to it' : '▶ Start'}
              </button>
              <p className="muted small">
                {mode === 'wait'
                  ? 'Each note waits for you. Press the glowing spot and bow the way the arrow points.'
                  : 'Watch the ghost hand and hear how it goes.'}
              </p>
            </div>
          )}
          {done && (
            <div className="overlay-center results">
              {mode === 'wait' ? (
                <>
                  <div className="big-stars">
                    {'⭐'.repeat(stars)}
                    {'☆'.repeat(3 - stars)}
                  </div>
                  <h2>{stars === 3 ? 'Bravo!' : 'Nice work!'}</h2>
                </>
              ) : (
                <h2>That's how it goes! Now you try 🎻</h2>
              )}
              {mode === 'wait' && (
                <p>
                  All {total} notes played · bow direction right {st.bowRight}/{total}
                </p>
              )}
              <div className="row">
                {mode === 'demo' ? (
                  <button className="btn big primary" onClick={() => { setMode('wait'); reset(); }}>
                    🎻 My turn
                  </button>
                ) : (
                  <button className="btn big primary" onClick={() => { reset(); setRunning(true); }}>
                    Again
                  </button>
                )}
                <button className="btn" onClick={onExit}>
                  Another song
                </button>
              </div>
            </div>
          )}
          {running && (
            <button className="btn small pause" onClick={() => { setRunning(false); silence(); }}>
              ⏸
            </button>
          )}
          {cur && mode === 'wait' && (
            <div className="tv-now">
              <b style={{ color: STRINGS[cur.fing.string].color }}>{midiName(cur.midi)}</b> · {cur.fing.label} ·{' '}
              {cur.bow.dir === 'down' ? '⊓ pull' : 'V push'}
            </div>
          )}
        </div>
      )}
      </div>
      {!opts.tipSeen && <RotateTip portrait={portrait} onDone={() => setOpts((o) => ({ ...o, tipSeen: true }))} />}
    </div>
  );
}

function Toggle({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="opt-row">
      <span>
        {label}
        {hint && <span className="muted small tv-hint">{hint}</span>}
      </span>
      <button className={`btn small ${on ? 'primary' : 'ghost'}`} onClick={() => set(!on)} aria-pressed={on}>
        {on ? 'On' : 'Off'}
      </button>
    </div>
  );
}
