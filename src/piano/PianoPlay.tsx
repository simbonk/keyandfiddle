import { useEffect, useMemo, useRef, useState } from 'react';
import { usePitchListener } from '../audio/hooks';
import { mic } from '../audio/mic';
import { midiName, pitchClassName, songLengthBeats, type Song } from '../audio/notes';
import { playNote } from '../audio/synth';
import { FullscreenButton, usePlayingMode } from '../ui/chrome';
import { SongPicker } from '../ui/SongPicker';
import { useAnimationCanvas } from '../ui/useAnimationCanvas';
import { Keyboard, keyLayout, type KeyHighlight } from './Keyboard';
import { type PianoCalibration, matchKey, nearKey } from './calibration';
import { type Burst, type HwNote, drawHighway, laneCenter, noteColor } from './highway';
import { PIANO_SONGS, tagHas } from './songs';

type Mode = 'wait' | 'play' | 'demo';
type Hands = 'both' | 'right' | 'left';

interface Props {
  cal: PianoCalibration;
  extraSongs?: Song[];
  initialSong?: Song | null;
}

interface Hold {
  note: HwNote;
  t0: number;
  lastHeard: number;
  expectedMs: number;
  touch: boolean;
  reported: boolean;
}

export function PianoPlay({ cal, extraSongs = [], initialSong = null }: Props) {
  const [song, setSong] = useState<Song | null>(initialSong);
  const songs = [...PIANO_SONGS, ...extraSongs];
  useEffect(() => {
    if (initialSong) setSong(initialSong);
  }, [initialSong]);
  if (!song)
    return (
      <SongPicker
        songs={songs}
        onPick={setSong}
        badge={(s) => {
          const [a, b] = songRange(s, cal.startMidi);
          return b - a > 24 ? `🎹 ${Math.round((b - a) / 12)} octaves` : null;
        }}
      />
    );
  return <Game key={song.id} song={song} cal={cal} onExit={() => setSong(null)} />;
}

function Game({ song, cal, onExit }: { song: Song; cal: PianoCalibration; onExit: () => void }) {
  usePlayingMode(true);
  const [start, end] = useMemo(() => songRange(song, cal.startMidi), [song, cal.startMidi]);
  const keys = useMemo(() => keyLayout(start, end), [start, end]);
  const [mode, setMode] = useState<Mode>('wait');
  const [speed, setSpeed] = useState(1);
  const [hands, setHands] = useState<Hands>('both');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; tone: 'good' | 'warn' | 'info'; id: number } | null>(null);
  const [, force] = useState(0);
  const [touchDown, setTouchDown] = useState<Set<number>>(new Set());
  const [heard, setHeard] = useState<number | null>(null);

  const g = useRef({
    notes: [] as HwNote[],
    songBeat: -4,
    bursts: [] as Burst[],
    hold: null as Hold | null,
    lastOnsetT: 0,
    onsetPeak: 0,
    lastHitT: 0,
    hits: 0,
    misses: 0,
    wrong: 0,
    niceDyn: 0,
    streak: 0,
    bestStreak: 0,
    waiting: false,
    lastDemoIdx: -1,
    lastHeardKey: null as number | null,
    // re-arming for repeated notes (a key struck again while still ringing)
    armed: true,
    hitMidi: null as number | null,
    peakSinceHit: 0,
    minSinceArm: 1,
  });

  const outOfRange = song.notes.some((n) => n.midi !== null && (n.midi < start || n.midi > end));

  const reset = () => {
    const st = g.current;
    st.notes = song.notes
      .filter((n) => n.midi !== null && n.midi >= start && n.midi <= end)
      .filter((n) => (hands === 'both' ? true : hands === 'left' ? tagHas(n.tag, 'L') : !tagHas(n.tag, 'L')))
      .map((n) => ({
        midi: n.midi!,
        beat: n.beat,
        beats: n.beats,
        left: tagHas(n.tag, 'L'),
        dyn: tagHas(n.tag, 'f') ? 'f' : tagHas(n.tag, 'p') ? 'p' : null,
        state: 'pending',
        hitLevel: 0,
        holdFrac: 0,
      }));
    st.songBeat = -3;
    st.bursts = [];
    st.hold = null;
    st.hits = st.misses = st.wrong = st.niceDyn = st.streak = st.bestStreak = 0;
    st.lastHitT = performance.now();
    st.armed = true;
    st.hitMidi = null;
    st.lastDemoIdx = -1;
    setDone(false);
    force((x) => x + 1);
  };

  useEffect(reset, [song, hands, start, end]); // eslint-disable-line react-hooks/exhaustive-deps

  const beatMs = 60000 / (song.bpm * speed);

  const say = (text: string, tone: 'good' | 'warn' | 'info' = 'good') =>
    setFeedback({ text, tone, id: performance.now() });

  const pending = () => g.current.notes.find((n) => n.state === 'pending') ?? null;

  function finishHold(now: number) {
    const st = g.current;
    const h = st.hold;
    if (!h || h.reported) return;
    h.reported = true;
    const held = now - h.t0;
    h.note.holdFrac = Math.min(1, held / h.expectedMs);
    if (h.note.beats >= 1.5 && held < h.expectedMs * 0.55) say(`Hold ${pitchClassName(h.note.midi)} longer ⏳`, 'info');
    st.hold = null;
  }

  /** Returns the matched note's midi on a hit, else null. */
  function tryHit(midi: number, level: number, now: number, touch: boolean, freq = 0, quietIfWrong = false): number | null {
    const st = g.current;
    const p = pending();
    if (!p) return null;
    const window = mode === 'wait' ? 1.25 : 0.45;
    if (p.beat > st.songBeat + window) return null; // nothing due yet
    const group = st.notes.filter((n) => n.state === 'pending' && Math.abs(n.beat - p.beat) < 0.01);
    const match = group.find(
      (n) =>
        n.midi === midi ||
        (!touch && (Math.abs(n.midi - midi) === 12 || (freq > 0 && nearKey(cal, freq, n.midi)))),
    );
    if (!match) {
      // stay quiet for soft sounds (people talking in the room), only flag real wrong keys
      if (quietIfWrong || (!touch && level < cal.refLevel * 0.45)) return null;
      st.wrong++;
      st.streak = 0;
      say(`That was ${pitchClassName(midi)}. Look for ${pitchClassName(p.midi)} 👀`, 'warn');
      return null;
    }
    finishHold(now);
    const ratio = level / Math.max(0.005, cal.refLevel);
    group.forEach((n) => {
      n.state = 'hit';
      n.hitLevel = Math.min(2, ratio);
    });
    st.hits++;
    st.streak++;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    st.lastHitT = now;
    st.hold = {
      note: match,
      t0: now,
      lastHeard: now,
      expectedMs: match.beats * beatMs,
      touch,
      reported: false,
    };
    // loudness feedback
    let text: string | undefined;
    if (!touch && match.dyn === 'p') {
      if (ratio <= 1.1) {
        st.niceDyn++;
        text = 'soft 🌙';
      } else say('Try that one softer 🌙', 'info');
    } else if (!touch && match.dyn === 'f') {
      if (ratio >= 1.2) {
        st.niceDyn++;
        text = 'LOUD 💥';
      } else say('Play that one louder! 💪', 'info');
    } else if (st.streak > 0 && st.streak % 5 === 0) {
      say(`${st.streak} in a row! 🔥`);
    }
    st.bursts.push({
      x: laneCenter(keys, match.midi),
      color: noteColor(match.midi),
      t0: now,
      power: Math.min(1, ratio / 2),
      text,
    });
    if (st.bursts.length > 12) st.bursts.shift();
    // in play-along, jumping ahead to the note keeps the song tidy
    if (mode === 'wait' && st.songBeat < p.beat) st.songBeat = Math.max(st.songBeat, p.beat - 0.15);
    return match.midi;
  }

  usePitchListener((f) => {
    const st = g.current;
    if (f.onset) {
      st.lastOnsetT = f.t;
      st.onsetPeak = f.rms;
    } else if (f.t - st.lastOnsetT < 160) {
      st.onsetPeak = Math.max(st.onsetPeak, f.rms);
    }
    const key = f.freq ? matchKey(cal, f.freq) : null;
    const km = key?.midi ?? null;
    if (km !== st.lastHeardKey) {
      st.lastHeardKey = km;
      setHeard(km);
    }
    if (!running || mode === 'demo') return;
    if (st.hold && !st.hold.touch) {
      if (km !== null && (km === st.hold.note.midi || Math.abs(km - st.hold.note.midi) === 12) && f.rms > st.onsetPeak * 0.1) {
        st.hold.lastHeard = f.t;
        st.hold.note.holdFrac = Math.min(1, (f.t - st.hold.t0) / st.hold.expectedMs);
      } else if (f.t - st.hold.lastHeard > 180) {
        finishHold(st.hold.lastHeard);
      }
    }
    // Re-arm after a hit once the note dies down, stops, or changes. Then a fresh
    // rise in loudness counts as a new press even if no clean attack was seen
    // (iPad mics smooth attacks, and a repeated key is still ringing).
    if (!st.armed) {
      st.peakSinceHit = Math.max(st.peakSinceHit, f.rms);
      if (f.rms < st.peakSinceHit * 0.55 || km === null || km !== st.hitMidi) {
        st.armed = true;
        st.minSinceArm = f.rms;
      }
    } else st.minSinceArm = Math.min(st.minSinceArm, f.rms);
    if (!f.freq) return;
    const onsetFresh = st.lastOnsetT > st.lastHitT && f.t - st.lastOnsetT < 450;
    const rose = st.armed && f.rms > st.minSinceArm * 1.6 && f.rms > 0.008;
    const newKey = km !== null && km !== st.hitMidi;
    if (onsetFresh || rose || newKey) {
      const heardMidi = km ?? Math.round(f.midi);
      const hit = tryHit(heardMidi, Math.max(st.onsetPeak, f.rms), f.t, false, f.freq, !onsetFresh);
      if (hit !== null || onsetFresh) st.lastHitT = f.t; // consume this attack
      if (hit !== null) {
        st.armed = false;
        st.hitMidi = hit;
        st.peakSinceHit = f.rms;
      }
    }
  }, true);

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
      if (mode === 'play') {
        for (const n of st.notes) {
          if (n.state === 'pending' && n.beat < st.songBeat - 0.5) {
            n.state = 'missed';
            st.misses++;
            st.streak = 0;
          }
        }
      }
      if (mode === 'demo') {
        st.notes.forEach((n, i) => {
          if (i > st.lastDemoIdx && n.state === 'pending' && n.beat <= st.songBeat) {
            st.lastDemoIdx = i;
            n.state = 'hit';
            n.hitLevel = n.dyn === 'f' ? 1.6 : n.dyn === 'p' ? 0.4 : 1;
            n.holdFrac = 1;
            playNote(n.midi, (n.beats * beatMs) / 1000, n.dyn === 'f' ? 1 : n.dyn === 'p' ? 0.35 : 0.7);
            st.bursts.push({ x: laneCenter(keys, n.midi), color: noteColor(n.midi), t0: now, power: n.hitLevel / 2 });
          }
        });
      }
      const touchHold = st.hold;
      if (touchHold && touchHold.touch) touchHold.note.holdFrac = Math.min(1, (now - touchHold.t0) / touchHold.expectedMs);
      if (!pending() && st.songBeat > songLengthBeats(song.notes) + 1) {
        setRunning(false);
        setDone(true);
      }
    }
    st.waiting = waiting;
    drawHighway({
      ctx,
      w,
      h,
      keys,
      songBeat: st.songBeat,
      visibleBeats: 7 / Math.max(0.6, speed),
      notes: st.notes,
      current: pending(),
      waiting,
      bursts: st.bursts,
      now,
    });
  });

  // UI refresh for next-up panel / score (cheap, 6x per second)
  useEffect(() => {
    const id = window.setInterval(() => force((x) => x + 1), 160);
    return () => clearInterval(id);
  }, []);

  const st = g.current;
  const upcoming = st.notes.filter((n) => n.state === 'pending').slice(0, 4);
  const cur = upcoming[0];
  const highlights: Record<number, KeyHighlight> = {};
  if (upcoming[1] && upcoming[1].midi !== cur?.midi) highlights[upcoming[1].midi] = { color: 'rgba(255,255,255,0.35)', label: 'next' };
  if (cur) highlights[cur.midi] = { color: noteColor(cur.midi), label: cur.left ? 'L' : 'R' };

  const total = st.notes.length;
  const accuracy = total ? st.hits / total : 0;
  const stars = accuracy > 0.95 && st.wrong < 3 ? 3 : accuracy > 0.75 ? 2 : accuracy > 0.4 ? 1 : 0;

  const pressed = new Set(touchDown);
  if (heard !== null) pressed.add(heard);

  const startGame = async () => {
    if (mode !== 'demo' && mic.status !== 'running') await mic.start();
    if (done || !pending()) reset();
    setRunning(true);
  };

  return (
    <div className="game">
      <div className="game-bar">
        <button className="btn small ghost" onClick={onExit}>
          ◀<span className="lbl"> Songs</span>
        </button>
        <div className="game-title">
          {song.emoji} {song.title}
        </div>
        <div className="seg">
          {(['wait', 'play', 'demo'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setRunning(false); reset(); }}>
              {m === 'wait' ? '🐢' : m === 'play' ? '🏃' : '👂'}
              <span className="lbl">{m === 'wait' ? ' Wait for me' : m === 'play' ? ' Play along' : ' Listen'}</span>
            </button>
          ))}
        </div>
        <div className="seg">
          {(['both', 'right', 'left'] as Hands[]).map((hh) => (
            <button key={hh} className={hands === hh ? 'on' : ''} onClick={() => setHands(hh)}>
              {hh === 'both' ? '🙌' : hh === 'right' ? 'R' : 'L'}
            </button>
          ))}
        </div>
        <select value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="speed">
          <option value={0.5}>½×</option>
          <option value={0.75}>¾×</option>
          <option value={1}>1×</option>
        </select>
        <div className="score">
          ✅ {st.hits}/{total} {st.streak >= 3 && <span>🔥{st.streak}</span>}
        </div>
        <FullscreenButton />
      </div>

      <div className="highway-wrap">
        <canvas ref={canvasRef} className="highway" />
        <div className="next-panel">
          <div className="next-title">Coming up</div>
          {upcoming.length === 0 && <div className="muted">—</div>}
          {upcoming.map((n, i) => (
            <div key={i} className={`next-item ${i === 0 ? 'now' : ''}`} style={{ borderColor: noteColor(n.midi) }}>
              <span className="next-note" style={{ color: noteColor(n.midi) }}>
                {pitchClassName(n.midi)}
              </span>
              <span className="next-meta">
                {n.left ? 'L' : 'R'} {n.beats >= 2 ? '𝅗𝅥' : n.beats < 1 ? '♪' : '♩'}
                {n.dyn === 'f' ? ' 💥' : n.dyn === 'p' ? ' 🌙' : ''}
              </span>
            </div>
          ))}
        </div>
        {feedback && (
          <div key={feedback.id} className={`float-feedback ${feedback.tone}`}>
            {feedback.text}
          </div>
        )}
        {!running && !done && (
          <div className="overlay-center">
            {outOfRange && <p className="warn small">Some notes are outside your keyboard range and were skipped.</p>}
            <button className="btn big primary" onClick={startGame}>
              {st.songBeat > -3 ? '▶ Keep going' : mode === 'demo' ? '👂 Listen to it' : '▶ Start'}
            </button>
            <p className="muted small">
              {mode === 'wait'
                ? 'The notes wait for you. Play the glowing key on your piano.'
                : mode === 'play'
                  ? 'Keep up with the music! Notes keep moving.'
                  : 'Hear how the song goes first.'}
            </p>
          </div>
        )}
        {done && (
          <div className="overlay-center results">
            <div className="big-stars">{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</div>
            <h2>{stars === 3 ? 'Amazing!' : stars === 2 ? 'Great playing!' : stars === 1 ? 'Good start!' : 'Keep practising!'}</h2>
            <p>
              {st.hits} of {total} notes · best streak {st.bestStreak}
              {st.niceDyn > 0 ? ` · ${st.niceDyn} perfect louds & softs` : ''}
            </p>
            <div className="row">
              <button className="btn big primary" onClick={() => { reset(); setRunning(true); }}>
                Play again
              </button>
              <button className="btn" onClick={onExit}>
                Another song
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

      <Keyboard
        start={start}
        end={end}
        highlights={highlights}
        pressed={pressed}
        height="min(34dvh, 240px)"
        onPress={(m) => {
          playNote(m, 1.2, 0.7);
          setTouchDown((s) => new Set(s).add(m));
          if (running && mode !== 'demo') {
            const now = performance.now();
            tryHit(m, cal.refLevel, now, true);
            // the speaker will play this note too; don't let the mic count it twice
            g.current.lastHitT = now + 400;
          }
        }}
        onRelease={(m) => {
          setTouchDown((s) => {
            const n = new Set(s);
            n.delete(m);
            return n;
          });
          const h = g.current.hold;
          if (h && h.touch && h.note.midi === m) finishHold(performance.now());
        }}
      />
      <div className="heard-line muted small">{heard !== null ? `🎤 hearing ${midiName(heard)}` : '🎤 listening'}</div>
    </div>
  );
}

/**
 * Keyboard range for a song: the usual 2 octaves, widened to whole octaves
 * (C to C) when the song needs lower or higher keys.
 */
export function songRange(song: Song, base: number): [number, number] {
  const ms = song.notes.filter((n) => n.midi !== null).map((n) => n.midi!);
  if (!ms.length) return [base, base + 24];
  const lo = Math.min(...ms);
  const hi = Math.max(...ms);
  const start = Math.min(base, lo - (((lo % 12) + 12) % 12));
  const end = Math.max(base + 24, hi + ((12 - (hi % 12)) % 12));
  return [start, end];
}
