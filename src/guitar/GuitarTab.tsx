import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePitchListener, useMicStatus } from '../audio/hooks';
import { mic } from '../audio/mic';
import { midiName, songLengthBeats, type Song } from '../audio/notes';
import { SoundLab, useMySounds } from '../piano/SoundLab';
import { FullscreenButton, TopBarSlot, usePlayingMode } from '../ui/chrome';
import { Icon } from '../ui/Icon';
import { MicBoostSelect } from '../ui/MicButton';
import { PlayOn } from '../ui/PlayOn';
import { SongPicker } from '../ui/SongPicker';
import { useAnimationCanvas } from '../ui/useAnimationCanvas';
import { screenPxPerMm } from '../violin/touch/instrument';
import { GUITAR_SIZES, GuitarState, drawGuitar, guitarLayout, type FallingChord } from './instrument';
import {
  GUITAR_VOICES,
  type GuitarVoice,
  pluck,
  previewGuitar,
  setGuitarVoice,
  silenceGuitar,
  strum,
  unlockGuitar,
  useGuitarVoice,
} from './pluck';
import {
  CHORDS,
  CHORD_SONGS,
  GSTRINGS,
  GUITAR_SONGS,
  chordMatch,
  chordMidis,
  chordOfTag,
  guitarNotes,
  isChordSong,
  type ChordShape,
  type GuitarNote,
} from './theory';

// The guitar tab: songs (single notes) and chords, played on the touch
// guitar or on a real guitar (the microphone listens). The touch guitar is
// made to be held against your chest facing a mirror, so its play screen is
// drawn back to front and reads right in the mirror.

type View = 'songs' | 'chords' | 'sounds' | 'settings';
type On = 'touch' | 'real';

const OPTS_KEY = 'kf.gt.opts';
const ON_KEY = 'kf.gt.on';
interface GuitarOpts {
  mirror: boolean;
  size: string;
  /** a tap anywhere on the body picks the string your finger is on */
  easyPick: boolean;
  easyChords: boolean;
  names: boolean;
  tipSeen: boolean;
}
function loadOpts(): GuitarOpts {
  const def: GuitarOpts = { mirror: true, size: 'Full', easyPick: true, easyChords: false, names: false, tipSeen: false };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(OPTS_KEY) || '{}') };
  } catch {
    return def;
  }
}
type SetOpts = React.Dispatch<React.SetStateAction<GuitarOpts>>;

export function GuitarTab() {
  const [view, setView] = useState<View>('songs');
  const [song, setSong] = useState<Song | null | 'free'>(null);
  const [tip, setTip] = useState(false);
  const [opts, setOpts] = useState<GuitarOpts>(loadOpts);
  useEffect(() => {
    try {
      localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
    } catch {
      /* ignore */
    }
  }, [opts]);
  const [on, setOnState] = useState<On>(() => {
    try {
      return localStorage.getItem(ON_KEY) === 'real' ? 'real' : 'touch';
    } catch {
      return 'touch';
    }
  });
  const setOn = (v: On) => {
    setOnState(v);
    try {
      localStorage.setItem(ON_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const pick = (v: View) => {
    setView(v);
    setSong(null);
  };
  const exit = () => setSong(null);
  const play =
    song === 'free' ? (
      <GuitarPlay song={null} input="touch" onExit={exit} opts={opts} setOpts={setOpts} />
    ) : song ? (
      <GuitarPlay key={song.id + on} song={song} input={on} onExit={exit} opts={opts} setOpts={setOpts} />
    ) : null;
  const header = (
    <>
      <PlayOn value={on} onChange={setOn} real="My guitar" />
      {on === 'touch' ? (
        <div className="banner gt-banner">
          <span>🪞 Works best sitting in front of a mirror, holding the iPad against your chest like a guitar, screen facing the mirror.</span>
          <button className="btn small ghost" onClick={() => setTip(true)}>
            <Icon name="help" size={16} /> How
          </button>
        </div>
      ) : (
        <div className="banner gt-banner">
          <span>🎤 Prop the iPad up where you can see it and play your guitar. I listen and wait for each note.</span>
        </div>
      )}
      {tip && <MirrorTip onDone={() => setTip(false)} />}
    </>
  );
  return (
    <div className="tab-body">
      <TopBarSlot>
        <nav className="subnav">
          {(
            [
              ['songs', 'songs', 'Songs'],
              ['chords', 'chords', 'Chords'],
              ['sounds', 'sounds', 'Sounds'],
              ['settings', 'settings', 'Settings'],
            ] as const
          ).map(([v, ic, nm]) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => pick(v)}>
              <Icon name={ic} className="ico" />
              <span className="nm">{nm}</span>
            </button>
          ))}
        </nav>
      </TopBarSlot>
      {play}
      {!play && view === 'songs' && (
        <SongPicker
          songs={GUITAR_SONGS}
          onPick={setSong}
          intro={
            <>
              {header}
              {on === 'touch' && (
                <div className="song-grid">
                  <button className="song-card" onClick={() => setSong('free')}>
                    <span className="song-emoji">🎸</span>
                    <b>Free play</b>
                    <span className="muted small">Just play! Every string, frets 1 to 5.</span>
                  </button>
                </div>
              )}
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
              {header}
              <p className="muted gt-chord-intro">
                🌱 Learn one chord at a time · 🌿 switch between chords · 🌳 strum along to whole songs. Put your fingers
                on the dots, then strum the way the arrow points.
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
      {!play && view === 'sounds' && <GuitarSounds />}
      {!play && view === 'settings' && (
        <div className="settings-page">
          <div className="panel slim settings-list">
            <b>Touch guitar</b>
            <SizeRow opts={opts} setOpts={setOpts} />
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
          <div className="panel slim settings-list">
            <b>Microphone (my guitar)</b>
            <div className="opt-row">
              <span>
                Mic boost
                <span className="muted small tv-hint">Turn up if I can't hear a quiet guitar</span>
              </span>
              <MicBoostSelect bare />
            </div>
          </div>
          {tip && <MirrorTip onDone={() => setTip(false)} />}
        </div>
      )}
    </div>
  );
}

/** Pick the guitar's sound, or record your own (the guitar's Sounds tab). */
function GuitarSounds() {
  const voice = useGuitarVoice();
  return (
    <div className="lesson">
      <SoundLab
        keys={false}
        title="Pick how your guitar sounds"
        builtIns={GUITAR_VOICES}
        value={voice}
        fallback="acoustic"
        onSelect={(id) => setGuitarVoice(id as GuitarVoice)}
        onPreview={(id) => previewGuitar(id as GuitarVoice)}
        recordHint="Tap the red button, then meow, sing, say hello or make any noise! Every string you pick plays it, at the note you finger."
      />
    </div>
  );
}

function VoiceSelect() {
  const voice = useGuitarVoice();
  const mine = useMySounds();
  return (
    <select
      value={voice}
      aria-label="guitar sound"
      onChange={(e) => {
        setGuitarVoice(e.target.value as GuitarVoice);
        previewGuitar();
      }}
    >
      {GUITAR_VOICES.map((v) => (
        <option key={v.id} value={v.id}>
          {v.emoji} {v.name}
        </option>
      ))}
      {mine.map((m) => (
        <option key={m.id} value={`mine:${m.id}`}>
          {m.emoji} {m.name}
        </option>
      ))}
    </select>
  );
}

function SizeRow({ opts, setOpts }: { opts: GuitarOpts; setOpts: SetOpts }) {
  return (
    <div className="opt-row">
      <span>
        Guitar size
        <span className="muted small tv-hint">Smaller guitars have closer frets, for smaller hands</span>
      </span>
      <div className="seg">
        {GUITAR_SIZES.map(([name]) => (
          <button key={name} className={opts.size === name ? 'on' : ''} onClick={() => setOpts((o) => ({ ...o, size: name }))}>
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function GuitarToggles({ opts, setOpts }: { opts: GuitarOpts; setOpts: SetOpts }) {
  const set = (o: Partial<GuitarOpts>) => setOpts((cur) => ({ ...cur, ...o }));
  return (
    <>
      <Toggle
        label="Mirror"
        hint="Drawn back to front so it reads right in a mirror. Off: play looking at the screen"
        on={opts.mirror}
        set={(v) => set({ mirror: v })}
      />
      <Toggle
        label="Easy picking"
        hint="Tap anywhere on the guitar body to pick the string your finger is on"
        on={opts.easyPick}
        set={(v) => set({ easyPick: v })}
      />
      <Toggle label="Easy chords" hint="Any strum plays the right chord" on={opts.easyChords} set={(v) => set({ easyChords: v })} />
      <Toggle label="Note names" hint="Show note names on the frets" on={opts.names} set={(v) => set({ names: v })} />
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
  up: boolean;
}

function GuitarPlay({
  song,
  input,
  onExit,
  opts,
  setOpts,
}: {
  song: Song | null;
  input: On;
  onExit: () => void;
  opts: GuitarOpts;
  setOpts: SetOpts;
}) {
  usePlayingMode(true);
  const gs = useMemo(() => new GuitarState(), []);
  // for automated checks in development
  if (import.meta.env.DEV) (window as unknown as { __guitar: GuitarState }).__guitar = gs;
  const real = input === 'real';
  const mirrored = opts.mirror && !real;
  const micStatus = useMicStatus();
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
    dirRight: 0,
    demoIdx: -1,
    demo: null as NoteSt | null,
    strums: new Map<number, { strings: Set<number>; down: boolean }>(),
    judged: new Set<number>(),
    hintAt: 0,
    // microphone (real guitar)
    match: 0,
    lastHit: { t: 0, midi: -1 },
    onsetAt: 0,
    listen: null as null | { t0: number; acc: Float32Array },
  });

  const reset = () => {
    const st = g.current;
    if (!song) st.notes = [];
    else if (chordMode)
      st.notes = song.notes.map((n) => {
        const { chord, up } = chordOfTag(n.tag);
        const s = chord ? chord.frets.findIndex((f) => f >= 0) : 0;
        return { midi: n.midi ?? 40, beat: n.beat, beats: n.beats, fing: { string: s, fret: 0, finger: 0, label: '' }, state: 'pending', chord, up };
      });
    else st.notes = guitarNotes(song).map((n) => ({ ...n, state: 'pending', chord: null, up: false }));
    st.songBeat = -3;
    st.hits = st.misses = st.dirRight = 0;
    st.demoIdx = -1;
    st.demo = null;
    st.strums.clear();
    st.judged.clear();
    st.listen = null;
    st.match = 0;
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
    const key = `${w}x${h}${opts.size}`;
    if (layoutKey.current !== key) {
      gs.L = guitarLayout(w, h, screenPxPerMm(), opts.size, window.innerHeight / 5);
      layoutKey.current = key;
    }
    const cur = pending();
    gs.easyPick = opts.easyPick;
    gs.locked = real || demoing;
    gs.targetString = song && !chordMode && cur && mode === 'wait' ? cur.fing.string : null;
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
    if (song && running && mode === 'wait' && !real) score();
    gs.events = [];

    const p = pending();
    const tgt = song && !done ? (mode === 'demo' ? st.demo : p) : null;
    const fall = (n: NoteSt): FallingChord => ({ beat: n.beat, beats: n.beats, chord: n.chord, up: n.up, state: n.state });
    drawGuitar(
      ctx,
      gs,
      {
        notes: song && !chordMode ? st.notes : null,
        chords: chordMode ? st.notes.map(fall) : null,
        songBeat: st.songBeat,
        visibleBeats: 4 / Math.max(0.5, speed),
        current: tgt && !chordMode ? tgt : null,
        currentChord: tgt && chordMode ? fall(tgt) : null,
        waiting,
        names: opts.names,
        ghost: mode === 'demo' || real,
        listening: real && running && mode === 'wait' && micStatus === 'running',
      },
      now,
    );
  });
  const layoutKey = useRef('');

  function runDemo(now: number) {
    const st = g.current;
    st.notes.forEach((n, i) => {
      if (i > st.demoIdx && n.state === 'pending' && n.beat <= st.songBeat) {
        st.demoIdx = i;
        n.state = 'hit';
        st.demo = n;
        if (n.chord) {
          strum(chordMidis(n.chord), 0.75, !n.up);
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
    if (st.hits % 5 !== 0) setFeedback(null);
    else say(['Rock on! 🎸', 'Nice! ✨', 'Keep going! 🔥', 'You sound great! 🌟'][(st.hits / 5) % 4]);
  }
  function hint(text: string, now = performance.now()) {
    const st = g.current;
    if (now - st.hintAt < 2500) return;
    st.hintAt = now;
    say(text, 'info');
  }
  const fretHint = (p: NoteSt) =>
    p.fing.fret === 0
      ? `Pick the open ${GSTRINGS[p.fing.string].name} string 👉`
      : `Finger ${p.fing.finger} on fret ${p.fing.fret} of the ${GSTRINGS[p.fing.string].name} string, then pick 👉`;

  /** touch guitar: judge the picks and strums since the last frame */
  function score() {
    const st = g.current;
    for (const ev of gs.events) {
      const p = pending();
      if (!p || p.beat > st.songBeat + 1) return;
      if (p.chord) {
        const sg = st.strums.get(ev.gesture) ?? { strings: new Set<number>(), down: ev.down };
        sg.strings.add(ev.string);
        // the swipe's direction (the first string may have been a plain tap)
        if (sg.strings.size > 1) sg.down = ev.down;
        st.strums.set(ev.gesture, sg);
        const need = Math.min(3, p.chord.frets.filter((f) => f >= 0).length);
        if (sg.strings.size >= need && !st.judged.has(ev.gesture)) {
          st.judged.add(ev.gesture);
          if (opts.easyChords || gs.chordHeld(p.chord)) {
            const rightWay = sg.down === !p.up;
            if (rightWay) st.dirRight++;
            hit(p);
            if (!rightWay) say(p.up ? 'That one strums up ↑' : 'That one strums down ↓', 'info');
          } else {
            st.misses++;
            const wrong = p.chord.frets.findIndex((f, s) => f > 0 && gs.fretOf(s) !== f);
            say(
              wrong >= 0
                ? `Finger ${p.chord.fingers[wrong]} on the ${GSTRINGS[wrong].name} string, fret ${p.chord.frets[wrong]} 👉`
                : 'Fingers on the dots, then strum',
              'info',
            );
          }
        }
      } else if (ev.midi === p.midi) {
        st.dirRight++;
        hit(p);
      } else {
        st.misses++;
        hint(fretHint(p));
      }
    }
    if (st.strums.size > 50) {
      st.strums.clear();
      st.judged.clear();
    }
  }

  // real guitar: the microphone
  usePitchListener(
    (f) => {
      const st = g.current;
      const p = pending();
      if (f.onset) st.onsetAt = f.t;
      if (!p || p.beat > st.songBeat + 1) return;
      if (p.chord) {
        // a strum: gather the sound for a moment after it starts, then compare
        if (f.onset && !st.listen && f.rms > 0.01) st.listen = { t0: f.t, acc: new Float32Array(12) };
        const l = st.listen;
        if (!l) return;
        const c = mic.chroma();
        if (c && f.t - l.t0 > 40) for (let i = 0; i < 12; i++) l.acc[i] += c[i];
        if (f.t - l.t0 > 380) {
          st.listen = null;
          const m = chordMatch(l.acc, p.chord);
          if (m.share > 0.58 && m.all) {
            st.dirRight++;
            hit(p);
          } else {
            st.misses++;
            hint(`Not quite ${p.chord.name} yet. Check your fingers on the dots 👉`, f.t);
          }
        }
        return;
      }
      if (!isFinite(f.midi)) {
        st.match = 0;
        return;
      }
      const off = Math.min(Math.abs(f.midi - p.midi), Math.abs(f.midi - p.midi - 12), Math.abs(f.midi - p.midi + 12));
      // the same note again needs a fresh pick
      const fresh = st.onsetAt > st.lastHit.t || Math.round(f.midi) % 12 !== st.lastHit.midi % 12;
      if (off < 0.5 && fresh) {
        if (!st.match) st.match = f.t;
        if (f.t - st.match > 60) {
          st.match = 0;
          st.lastHit = { t: f.t, midi: Math.round(f.midi) };
          st.dirRight++;
          hit(p);
        }
      } else {
        st.match = 0;
        if (off >= 0.5 && f.clarity > 0.9 && f.rms > 0.02 && st.onsetAt > st.lastHit.t) hint(fretHint(p), f.t);
      }
    },
    real && running && mode === 'wait',
  );

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
  const local = (cx: number, cy: number, r: DOMRect): [number, number] => [mirrored ? r.right - cx : cx - r.left, cy - r.top];
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    unlockGuitar();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const [x, y] = local(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    gs.down(e.pointerId, x, y, performance.now());
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
  const dirOk = total ? st.dirRight / total : 1;
  const stars = missRate < 0.2 && dirOk > 0.8 ? 3 : missRate < 0.6 ? 2 : 1;
  const start = () => {
    unlockGuitar();
    if (real && mode === 'wait') mic.start().catch(() => undefined);
    if (done || !pending()) reset();
    gs.clear();
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    silenceGuitar();
  };
  const ln = gs.lastNote;
  const playingNow = ln && performance.now() - ln.t < 1500 ? midiName(ln.midi) : null;
  const micProblem = real && mode === 'wait' && (micStatus === 'denied' || micStatus === 'error');

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
      {!real && (
        <button className="btn small ghost" onClick={() => setOpts((o) => ({ ...o, tipSeen: false }))} aria-label="How to hold it">
          <Icon name="help" />
          <span className="lbl"> Help</span>
        </button>
      )}
      <FullscreenButton />
    </div>
  );

  const startText =
    mode === 'demo'
      ? 'Watch the dots and hear how it goes.'
      : real
        ? chordMode
          ? 'Each chord waits for you. Make the chord on your guitar and strum. I listen.'
          : 'Each note waits for you. Play it on your guitar: finger on the dot, then pick. I listen.'
        : chordMode
          ? 'Each chord waits for you. Fingers on the dots, then strum across the guitar body the way the arrow points.'
          : opts.easyPick
            ? 'Each note waits for you. Press the glowing dot, then tap the guitar body to pick that string.'
            : 'Each note waits for you. Press the glowing dot, then pick that string on the guitar body.';

  return (
    <div className="lesson gt-play touch-violin">
      <div className={`gt-frame ${mirrored ? 'gt-mirror' : ''}`}>
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
                  {st.songBeat > -3 ? 'Keep going' : mode === 'demo' ? 'Listen to it' : real ? 'Start listening' : 'Start'}
                </button>
                <p className="muted small">{startText}</p>
                {mirrored && <p className="muted small">🪞 Back to front on purpose: it reads right in the mirror.</p>}
              </div>
            </div>
          )}
          {micProblem && (
            <div className="overlay-center gt-over">
              <div className="tv-turn">
                <p>{micStatus === 'denied' ? 'The microphone is blocked. On iPad: Settings › Safari › Microphone › Allow, then reload.' : mic.error}</p>
                <button className="btn big primary" onClick={() => mic.start().catch(() => undefined)}>
                  🎤 Turn on microphone
                </button>
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
                      {chordMode && !real ? ` · strum direction right ${st.dirRight}/${total}` : ''}
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
        </div>
      </div>
      {showOpts &&
        createPortal(
          <div className="tv-opts-layer" onClick={(e) => e.target === e.currentTarget && setShowOpts(false)}>
            <div className="opts-pop tv-opts-float" style={{ transform: 'translate(-50%, -50%)' }} role="dialog" aria-label="Guitar options">
              <div className="opt-row">
                <span>Sound</span>
                <VoiceSelect />
              </div>
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
              {real ? (
                <>
                  <div className="opt-row">
                    <span>Mic boost</span>
                    <MicBoostSelect bare />
                  </div>
                  <Toggle label="Note names" on={opts.names} set={(v) => setOpts((o) => ({ ...o, names: v }))} />
                </>
              ) : (
                <>
                  <SizeRow opts={opts} setOpts={setOpts} />
                  <GuitarToggles opts={opts} setOpts={setOpts} />
                </>
              )}
              <button className="btn small primary tv-opts-done" onClick={() => setShowOpts(false)}>
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
      {!real && !opts.tipSeen && <MirrorTip onDone={() => setOpts((o) => ({ ...o, tipSeen: true }))} />}
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
            <b>Hold the iPad sideways against your chest like a guitar,</b> with the screen facing the mirror. The neck runs
            along the bottom edge: your left fingers curl up from underneath onto the frets, your right hand picks and strums
            on the guitar body at the other end.
          </li>
          <li>
            <b>Press, then pick.</b> Pressing a fret makes no sound on its own, just like a real guitar. Pick or strum on
            the body the way the arrow points.
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
      <rect x={250} y={10} width={90} height={150} rx={8} fill="#2b2064" stroke="#b9b0e0" strokeWidth={3} />
      <path d="M262 30 l22 -14 M262 52 l40 -26" stroke="rgba(255,255,255,0.35)" strokeWidth={3} strokeLinecap="round" />
      <text x={295} y={152} textAnchor="middle" fontSize={13} fontWeight={800} fill="#b9b0e0">
        mirror
      </text>
      <path d="M40 150 v-60 M40 112 h56 v38" stroke="#8a5a2b" strokeWidth={6} strokeLinecap="round" fill="none" />
      <circle cx={70} cy={40} r={16} fill="#f2c9a0" />
      <path d="M66 58 L62 108 L110 108 L112 150" stroke="#7b6cff" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x={82} y={66} width={9} height={52} rx={3} fill="#0e0a24" stroke="#f6f3ff" strokeWidth={2} />
      <rect x={91} y={70} width={3} height={44} fill="#ffcf33" />
      <path d="M66 66 Q86 84 92 78" stroke="#f2c9a0" strokeWidth={7} strokeLinecap="round" fill="none" />
      <path d="M68 74 Q84 104 94 104" stroke="#f2c9a0" strokeWidth={7} strokeLinecap="round" fill="none" />
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
