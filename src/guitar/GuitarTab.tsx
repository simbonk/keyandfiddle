import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { midiName, songLengthBeats, type Song } from '../audio/notes';
import { FullscreenButton, TopBarSlot, usePlayingMode } from '../ui/chrome';
import { Icon } from '../ui/Icon';
import { SongPicker } from '../ui/SongPicker';
import { useAnimationCanvas } from '../ui/useAnimationCanvas';
import { GuitarState, dampAll, drawGuitar, guitarLayout } from './instrument';
import { pluck, silenceGuitar, strum, unlockGuitar } from './pluck';
import {
  CHORDS,
  CHORD_SONGS,
  GSTRINGS,
  GUITAR_SONGS,
  chordMidis,
  guitarNotes,
  isChordSong,
  type ChordShape,
  type GuitarNote,
} from './theory';

// The guitar tab: songs (single notes) and chords, played on the touch
// guitar. It is made to be held against your chest facing a mirror, so the
// play screen is drawn back to front and reads right in the mirror.

type View = 'songs' | 'chords' | 'settings';

const OPTS_KEY = 'kf.gt.opts';
interface GuitarOpts {
  mirror: boolean;
  easyPluck: boolean;
  easyChords: boolean;
  names: boolean;
  tipSeen: boolean;
}
function loadOpts(): GuitarOpts {
  const def: GuitarOpts = { mirror: true, easyPluck: true, easyChords: false, names: true, tipSeen: false };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') };
  } catch {
    return def;
  }
}
function useOpts() {
  const [opts, setOpts] = useState<GuitarOpts>(loadOpts);
  useEffect(() => {
    try {
      localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
    } catch {
      /* ignore */
    }
  }, [opts]);
  return [opts, setOpts] as const;
}

export function GuitarTab() {
  const [view, setView] = useState<View>('songs');
  const [song, setSong] = useState<Song | null | 'free'>(null);
  const [tip, setTip] = useState(false);
  const [opts, setOpts] = useOpts();
  const pick = (v: View) => {
    setView(v);
    setSong(null);
  };
  const play =
    song === 'free' ? (
      <GuitarPlay song={null} onExit={() => setSong(null)} opts={opts} setOpts={setOpts} />
    ) : song ? (
      <GuitarPlay key={song.id} song={song} onExit={() => setSong(null)} opts={opts} setOpts={setOpts} />
    ) : null;
  const banner = (
    <>
      <div className="banner gt-banner">
        <span>🪞 Works best sitting in front of a mirror, holding the iPad against your chest like a guitar, screen facing the mirror.</span>
        <button className="btn small ghost" onClick={() => setTip(true)}>
          <Icon name="help" size={16} /> How
        </button>
      </div>
      {tip && <MirrorTip onDone={() => setTip(false)} />}
    </>
  );
  return (
    <div className="tab-body">
      <TopBarSlot>
        <nav className="subnav">
          <button className={view === 'songs' ? 'on' : ''} onClick={() => pick('songs')}>
            <Icon name="songs" className="ico" />
            <span className="nm">Songs</span>
          </button>
          <button className={view === 'chords' ? 'on' : ''} onClick={() => pick('chords')}>
            <Icon name="chords" className="ico" />
            <span className="nm">Chords</span>
          </button>
          <button className={view === 'settings' ? 'on' : ''} onClick={() => pick('settings')}>
            <Icon name="settings" className="ico" />
            <span className="nm">Settings</span>
          </button>
        </nav>
      </TopBarSlot>
      {play}
      {!play && view === 'songs' && (
        <SongPicker
          songs={GUITAR_SONGS}
          onPick={setSong}
          intro={
            <>
              {banner}
              <div className="song-grid">
                <button className="song-card" onClick={() => setSong('free')}>
                  <span className="song-emoji">🎸</span>
                  <b>Free play</b>
                  <span className="muted small">Just play! Every string, frets 1 to 5.</span>
                </button>
              </div>
            </>
          }
        />
      )}
      {!play && view === 'chords' && (
        <SongPicker
          songs={CHORD_SONGS}
          onPick={setSong}
          intro={
            <>
              {banner}
              <p className="muted gt-chord-intro">
                🌱 Learn one chord at a time · 🌿 switch between chords · 🌳 strum along to whole songs. Put your fingers
                on the dots, then strum down across the round hole.
              </p>
              <div className="gt-chord-chart">
                {Object.values(CHORDS).map((c) => (
                  <ChordBox key={c.name} c={c} />
                ))}
              </div>
            </>
          }
        />
      )}
      {!play && view === 'settings' && (
        <div className="settings-page">
          <div className="panel slim settings-list">
            <b>Touch guitar</b>
            <GuitarToggles opts={opts} setOpts={setOpts} />
            <div className="opt-row">
              <span>
                How to hold it
                <span className="muted small tv-hint">Sitting in front of a mirror</span>
              </span>
              <button className="btn small ghost" onClick={() => setTip(true)}>
                <Icon name="help" size={16} /> Show me
              </button>
            </div>
          </div>
          {tip && <MirrorTip onDone={() => setTip(false)} />}
        </div>
      )}
    </div>
  );
}

function GuitarToggles({ opts, setOpts, inGame }: { opts: GuitarOpts; setOpts: React.Dispatch<React.SetStateAction<GuitarOpts>>; inGame?: boolean }) {
  const set = (o: Partial<GuitarOpts>) => setOpts((cur) => ({ ...cur, ...o }));
  return (
    <>
      <Toggle
        label="Mirror"
        hint="Drawn back to front so it reads right in a mirror. Off: play looking at the screen"
        on={opts.mirror}
        set={(v) => set({ mirror: v })}
      />
      <Toggle label="Easy pluck" hint="Pressing a fret plays the note, no strum needed" on={opts.easyPluck} set={(v) => set({ easyPluck: v })} />
      <Toggle label="Easy chords" hint="Any strum plays the right chord" on={opts.easyChords} set={(v) => set({ easyChords: v })} />
      <Toggle label="Note names" hint={inGame ? undefined : 'Show note names on the frets'} on={opts.names} set={(v) => set({ names: v })} />
    </>
  );
}

/** A small chord diagram (as on a chord chart: low E on the left, frets going down). */
function ChordBox({ c }: { c: ChordShape }) {
  const W = 84;
  const H = 104;
  const x0 = 14;
  const dx = (W - 2 * x0) / 5;
  const y0 = 30;
  const dy = 17;
  return (
    <div className="gt-chord-box">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-label={`${c.name} chord`}>
        <text x={W / 2} y={13} textAnchor="middle" fontSize={15} fontWeight={800} fill={c.color}>
          {c.name}
        </text>
        <rect x={x0 - 1} y={y0 - 3} width={5 * dx + 2} height={3} fill="#efe6d2" />
        {[0, 1, 2, 3, 4].map((f) => (
          <line key={f} x1={x0} x2={x0 + 5 * dx} y1={y0 + f * dy} y2={y0 + f * dy} stroke="rgba(255,255,255,0.35)" />
        ))}
        {GSTRINGS.map((s, i) => (
          <line key={s.name} x1={x0 + i * dx} x2={x0 + i * dx} y1={y0} y2={y0 + 4 * dy} stroke={s.color} strokeWidth={1.5} />
        ))}
        {c.frets.map((f, i) =>
          f < 0 ? (
            <text key={i} x={x0 + i * dx} y={y0 - 7} textAnchor="middle" fontSize={10} fill="#ff6b6b">
              ✕
            </text>
          ) : f === 0 ? (
            <circle key={i} cx={x0 + i * dx} cy={y0 - 10} r={3.5} fill="none" stroke="#fff" strokeWidth={1.3} />
          ) : (
            <g key={i}>
              <circle cx={x0 + i * dx} cy={y0 + (f - 0.5) * dy} r={6.5} fill={c.color} />
              <text x={x0 + i * dx} y={y0 + (f - 0.5) * dy + 3.5} textAnchor="middle" fontSize={10} fontWeight={800} fill="#1b1440">
                {c.fingers[i]}
              </text>
            </g>
          ),
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Mode = 'wait' | 'demo';
interface NoteSt extends GuitarNote {
  state: 'pending' | 'hit';
  chord: ChordShape | null;
}

function GuitarPlay({
  song,
  onExit,
  opts,
  setOpts,
}: {
  song: Song | null;
  onExit: () => void;
  opts: GuitarOpts;
  setOpts: React.Dispatch<React.SetStateAction<GuitarOpts>>;
}) {
  usePlayingMode(true);
  const gs = useMemo(() => new GuitarState(), []);
  const [showOpts, setShowOpts] = useState(false);
  const [mode, setMode] = useState<Mode>('wait');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [speed, setSpeed] = useState(0.75);
  const [feedback, setFeedback] = useState<{ text: string; tone: string; id: number } | null>(null);
  const [, force] = useState(0);
  const chordMode = !!song && isChordSong(song);
  const say = (text: string, tone = 'good') => setFeedback({ text, tone, id: performance.now() });

  const bpm = song?.bpm ?? 80;
  const g = useRef({
    notes: [] as NoteSt[],
    songBeat: -3,
    hits: 0,
    misses: 0,
    demoIdx: -1,
    demo: null as NoteSt | null,
    strums: new Map<number, Set<number>>(),
    judged: new Set<number>(),
    wrongAt: 0,
  });

  const reset = () => {
    const st = g.current;
    if (!song) st.notes = [];
    else if (chordMode)
      st.notes = song.notes.map((n) => {
        const c = CHORDS[n.tag ?? ''] ?? null;
        const s = c ? c.frets.findIndex((f) => f >= 0) : 0;
        return { midi: n.midi ?? 40, beat: n.beat, beats: n.beats, fing: { string: s, fret: 0, finger: 0, label: '' }, state: 'pending', chord: c };
      });
    else st.notes = guitarNotes(song).map((n) => ({ ...n, state: 'pending', chord: null }));
    st.songBeat = -3;
    st.hits = st.misses = 0;
    st.demoIdx = -1;
    st.demo = null;
    st.strums.clear();
    st.judged.clear();
    setDone(false);
    silenceGuitar();
    gs.clear();
    force((x) => x + 1);
  };
  useEffect(reset, [song]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => silenceGuitar(), []);
  useEffect(() => {
    const id = window.setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);

  const pending = () => g.current.notes.find((n) => n.state === 'pending') ?? null;
  const demoing = mode === 'demo' && running;

  const canvasRef = useAnimationCanvas((ctx, w, h, now, dt) => {
    const st = g.current;
    if (gs.L.w !== w || gs.L.h !== h) gs.L = guitarLayout(w, h);
    const cur = pending();
    gs.easyPluck = opts.easyPluck && !chordMode;
    gs.forceChord = chordMode && opts.easyChords && cur?.chord && mode === 'wait' ? cur.chord : null;

    let waiting = false;
    if (song && running && !done) {
      st.songBeat += (dt * bpm * speed) / 60;
      const p = pending();
      if (mode === 'wait' && p && st.songBeat > p.beat) {
        st.songBeat = p.beat;
        waiting = true;
      }
      if (mode === 'demo') runDemo(now);
      if (!pending() && st.songBeat > songLengthBeats(song.notes) + 1) {
        setRunning(false);
        setDone(true);
      }
    }
    if (song && running && mode === 'wait') score(now);
    gs.events = [];

    const p = pending();
    const showDemo = mode === 'demo' ? st.demo : null;
    const tgt = song && !done ? (showDemo ?? (mode === 'wait' ? p : null)) : null;
    drawGuitar(
      ctx,
      gs,
      {
        notes: song && !chordMode ? st.notes : null,
        chords: chordMode ? st.notes.map((n) => ({ beat: n.beat, beats: n.beats, tag: n.chord?.name, state: n.state })) : null,
        songBeat: st.songBeat,
        visibleBeats: 4 / Math.max(0.5, speed),
        current: tgt && !chordMode ? tgt : null,
        currentChord: tgt && chordMode ? tgt.chord : null,
        waiting,
        names: opts.names,
        demo: mode === 'demo',
      },
      now,
    );
  });

  function runDemo(now: number) {
    const st = g.current;
    st.notes.forEach((n, i) => {
      if (i > st.demoIdx && n.state === 'pending' && n.beat <= st.songBeat) {
        st.demoIdx = i;
        n.state = 'hit';
        st.demo = n;
        if (n.chord) {
          strum(chordMidis(n.chord), 0.75);
          n.chord.frets.forEach((f, s) => f >= 0 && (gs.shake[s] = now));
        } else {
          pluck(n.fing.string, n.midi, 0.8);
          gs.shake[n.fing.string] = now;
          gs.lastNote = { midi: n.midi, string: n.fing.string, t: now };
        }
      }
    });
  }

  function hit(p: NoteSt) {
    const st = g.current;
    p.state = 'hit';
    st.hits++;
    if (st.songBeat < p.beat) st.songBeat = Math.max(st.songBeat, p.beat - 0.1);
    if (st.hits % 5 === 0) say(['Rock on! 🎸', 'Nice! ✨', 'Keep going! 🔥', 'You sound great! 🌟'][(st.hits / 5) % 4]);
  }

  function score(now: number) {
    const st = g.current;
    for (const ev of gs.events) {
      const p = pending();
      if (!p || p.beat > st.songBeat + 1) return;
      if (p.chord) {
        const set = st.strums.get(ev.gesture) ?? new Set<number>();
        set.add(ev.string);
        st.strums.set(ev.gesture, set);
        const need = Math.min(3, p.chord.frets.filter((f) => f >= 0).length);
        if (set.size >= need && !st.judged.has(ev.gesture)) {
          st.judged.add(ev.gesture);
          if (opts.easyChords || gs.chordHeld(p.chord)) hit(p);
          else {
            st.misses++;
            const wrong = p.chord.frets.findIndex((f, s) => f > 0 && gs.fretOf(s) !== f);
            say(
              wrong >= 0
                ? `Finger ${p.chord.fingers[wrong]} on the ${GSTRINGS[wrong].name} string, fret ${p.chord.frets[wrong]} 👉`
                : 'Fingers on the dots, then strum ⬇',
              'info',
            );
          }
        }
      } else if (ev.midi === p.midi) hit(p);
      else {
        st.misses++;
        if (now - st.wrongAt > 2500) {
          st.wrongAt = now;
          say(`Try ${p.fing.label} 👉`, 'info');
        }
      }
    }
    // don't let old strums pile up
    if (st.strums.size > 50) {
      st.strums.clear();
      st.judged.clear();
    }
  }

  // ---------- touches (mirrored on the glass: flip x back) ----------
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => {
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('touchmove', stop);
    };
  }, [canvasRef]);
  const local = (cx: number, cy: number, r: DOMRect): [number, number] => [
    opts.mirror ? r.right - cx : cx - r.left,
    cy - r.top,
  ];
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    unlockGuitar();
    if (demoing) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const [x, y] = local(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    gs.down(e.pointerId, x, y, performance.now());
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (demoing) return;
    const r = e.currentTarget.getBoundingClientRect();
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const c of evs.length > 1 ? evs : [e.nativeEvent]) {
      const [x, y] = local(c.clientX, c.clientY, r);
      gs.move(e.pointerId, x, y, performance.now());
    }
  };
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => gs.up(e.pointerId);

  const st = g.current;
  const total = st.notes.length;
  const missRate = total ? st.misses / total : 0;
  const stars = missRate < 0.2 ? 3 : missRate < 0.6 ? 2 : 1;
  const start = () => {
    unlockGuitar();
    if (done || !pending()) reset();
    gs.clear();
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    dampAll();
  };
  const cur = pending();
  const ln = gs.lastNote;
  const playingNow = ln && performance.now() - ln.t < 1500 ? midiName(ln.midi) : null;

  const bar = (
    <div className="game-bar">
      <button className="btn small ghost back" onClick={onExit} aria-label="Songs">
        <Icon name="back" />
        <span className="lbl"> Songs</span>
      </button>
      <div className="game-title">{song ? `${song.emoji} ${song.title}` : '🎸 Free play'}</div>
      <div className="bar-feedback">
        {feedback && !done ? (
          <span key={feedback.id} className={`fb-pill ${feedback.tone}`}>
            {feedback.text}
          </span>
        ) : playingNow && ln ? (
          <span className="tv-playing" style={{ color: GSTRINGS[ln.string].color }}>
            {playingNow}
          </span>
        ) : null}
      </div>
      {song && (
        <>
          <div className="seg mode-seg">
            <button
              className={mode === 'wait' ? 'on' : ''}
              onClick={() => {
                setMode('wait');
                setRunning(false);
                reset();
              }}
            >
              <Icon name="wait" />
              <span className="lbl"> Wait</span>
            </button>
            <button
              className={mode === 'demo' ? 'on' : ''}
              onClick={() => {
                setMode('demo');
                setRunning(false);
                reset();
              }}
            >
              <Icon name="listen" />
              <span className="lbl"> Listen</span>
            </button>
          </div>
          <div className="score">
            <Icon name="check" size={16} /> {st.hits}/{total}
          </div>
        </>
      )}
      {running && (
        <button className="btn small ghost" aria-label="Pause" onClick={stop}>
          <Icon name="pause" />
          <span className="lbl"> Pause</span>
        </button>
      )}
      <button className={`btn small ${showOpts ? 'primary' : 'ghost'}`} onClick={() => setShowOpts((o) => !o)} aria-label="Options">
        <Icon name="settings" />
        <span className="lbl"> Options</span>
      </button>
      <button className="btn small ghost" onClick={() => setOpts((o) => ({ ...o, tipSeen: false }))} aria-label="How to hold it">
        <Icon name="help" />
        <span className="lbl"> Help</span>
      </button>
      <FullscreenButton />
    </div>
  );

  return (
    <div className="lesson gt-play touch-violin">
      <div className={`gt-frame ${opts.mirror ? 'gt-mirror' : ''}`}>
        {bar}
        <div className="tv-surface gt-surface">
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onLostPointerCapture={onUp}
            onContextMenu={(e) => e.preventDefault()}
          />
          {song && !running && !done && (
            <div className="overlay-center gt-over">
              <div className="tv-turn">
                <button className="btn big primary" onClick={start}>
                  <Icon name={mode === 'demo' ? 'listen' : 'play'} size={22} />{' '}
                  {st.songBeat > -3 ? 'Keep going' : mode === 'demo' ? 'Listen to it' : 'Start'}
                </button>
                <p className="muted small">
                  {mode === 'demo'
                    ? 'Watch the dots and hear how it goes.'
                    : chordMode
                      ? 'Each chord waits for you. Put your fingers on the dots, then strum down across the round hole.'
                      : opts.easyPluck
                        ? 'Each note waits for you. Press the glowing dot (or pluck the open string by its name).'
                        : 'Each note waits for you. Press the glowing dot, then pluck that string in the round hole.'}
                </p>
                {opts.mirror && <p className="muted small">🪞 Back to front on purpose: it reads right in the mirror.</p>}
              </div>
            </div>
          )}
          {done && (
            <div className="overlay-center results gt-over">
              <div className="tv-turn">
                {mode === 'wait' ? (
                  <>
                    <div className="big-stars">
                      {'⭐'.repeat(stars)}
                      {'☆'.repeat(3 - stars)}
                    </div>
                    <h2>{stars === 3 ? 'Rock star!' : 'Nice work!'}</h2>
                    <p>
                      All {total} {chordMode ? 'chords' : 'notes'} played
                      {st.misses ? ` · ${st.misses} tries that missed` : ' · no misses'}
                    </p>
                  </>
                ) : (
                  <h2>That's how it goes! Now you try 🎸</h2>
                )}
                <div className="row">
                  {mode === 'demo' ? (
                    <button
                      className="btn big primary"
                      onClick={() => {
                        setMode('wait');
                        reset();
                      }}
                    >
                      🎸 My turn
                    </button>
                  ) : (
                    <button
                      className="btn big primary"
                      onClick={() => {
                        reset();
                        setRunning(true);
                      }}
                    >
                      Again
                    </button>
                  )}
                  <button className="btn" onClick={onExit}>
                    Another song
                  </button>
                </div>
              </div>
            </div>
          )}
          {cur && running && mode === 'wait' && chordMode && cur.chord && (
            <div className="gt-now" style={{ color: cur.chord.color }}>
              {cur.chord.name}
              <span className="muted small"> {cur.chord.tip}</span>
            </div>
          )}
        </div>
      </div>
      {showOpts &&
        createPortal(
          <div className="tv-opts-layer" onClick={(e) => e.target === e.currentTarget && setShowOpts(false)}>
            <div className="opts-pop tv-opts-float" style={{ transform: 'translate(-50%, -50%)' }} role="dialog" aria-label="Guitar options">
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
              <GuitarToggles opts={opts} setOpts={setOpts} inGame />
              <button className="btn small primary tv-opts-done" onClick={() => setShowOpts(false)}>
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
      {!opts.tipSeen && <MirrorTip onDone={() => setOpts((o) => ({ ...o, tipSeen: true }))} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** How to hold it: sitting, iPad against the chest, screen toward a mirror. */
export function MirrorTip({ onDone }: { onDone: () => void }) {
  return (
    <div className="tv-tip-scrim">
      <div className="tv-tip panel" role="dialog" aria-label="How to hold the iPad">
        <h2>🪞 Play it in a mirror</h2>
        <MirrorGraphic />
        <ol className="tv-tip-steps">
          <li>
            <b>Sit on a chair facing a mirror.</b>
          </li>
          <li>
            <b>Hold the iPad sideways against your chest like a guitar,</b> with the screen facing the mirror. Your left hand
            reaches round to the frets on the neck, your right hand strums over the round hole.
          </li>
          <li>
            <b>Watch the mirror, not the screen.</b> Everything is drawn back to front on purpose, so in the mirror the
            words read the right way and the dots line up with your real fingers.
          </li>
        </ol>
        <p className="muted small">No mirror? Turn off Mirror in Options to play looking straight at the screen.</p>
        <button className="btn big primary" onClick={onDone}>
          Got it
        </button>
      </div>
    </div>
  );
}

function MirrorGraphic() {
  return (
    <svg viewBox="0 0 360 170" className="tv-tip-art" role="img" aria-label="Sit facing a mirror with the iPad against your chest, screen toward the mirror">
      {/* mirror */}
      <rect x={250} y={10} width={90} height={150} rx={8} fill="#2b2064" stroke="#b9b0e0" strokeWidth={3} />
      <path d="M262 30 l22 -14 M262 52 l40 -26" stroke="rgba(255,255,255,0.35)" strokeWidth={3} strokeLinecap="round" />
      <text x={295} y={152} textAnchor="middle" fontSize={13} fontWeight={800} fill="#b9b0e0">
        mirror
      </text>
      {/* chair */}
      <path d="M40 150 v-60 M40 112 h56 v38" stroke="#8a5a2b" strokeWidth={6} strokeLinecap="round" fill="none" />
      {/* person, side view, facing right */}
      <circle cx={70} cy={40} r={16} fill="#f2c9a0" />
      <path d="M66 58 L62 108 L110 108 L112 150" stroke="#7b6cff" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* iPad against the chest, screen toward the mirror */}
      <rect x={82} y={66} width={9} height={52} rx={3} fill="#0e0a24" stroke="#f6f3ff" strokeWidth={2} />
      <rect x={91} y={70} width={3} height={44} fill="#ffcf33" />
      {/* arms */}
      <path d="M66 66 Q86 84 92 78" stroke="#f2c9a0" strokeWidth={7} strokeLinecap="round" fill="none" />
      <path d="M68 74 Q84 104 94 104" stroke="#f2c9a0" strokeWidth={7} strokeLinecap="round" fill="none" />
      {/* line of sight */}
      <path d="M86 38 L248 60" stroke="#ffcf33" strokeWidth={2} strokeDasharray="5 5" />
      <path d="M100 92 L248 92" stroke="#52d273" strokeWidth={2} strokeDasharray="5 5" />
      <path d="M240 86 l8 6 l-8 6" stroke="#52d273" strokeWidth={2} fill="none" />
      <text x={170} y={110} textAnchor="middle" fontSize={11} fontWeight={700} fill="#52d273">
        screen faces the mirror
      </text>
      <text x={160} y={36} textAnchor="middle" fontSize={11} fontWeight={700} fill="#ffcf33">
        you watch the mirror
      </text>
    </svg>
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
