import { useMemo, useRef, useState } from 'react';
import { usePitchListener } from '../audio/hooks';
import { midiName, pitchClassName } from '../audio/notes';
import { playNote } from '../audio/synth';
import { usePlayingMode } from '../ui/chrome';
import { useAnimationCanvas } from '../ui/useAnimationCanvas';
import { type VoiceRange, type VoiceSong, VOICE_SONGS, fitShift, foldToTarget } from './voice';

type Mode = 'wait' | 'play' | 'listen';
const LEVEL_NAME = ['', '🌱 Beginner', '🌿 Intermediate', '🌳 Advanced'];

export function SingAlong({ range }: { range: VoiceRange }) {
  const [song, setSong] = useState<VoiceSong | null>(null);
  if (!song)
    return (
      <div className="panel">
        <h2>🎤 Pick a song to sing</h2>
        <p className="muted small">
          Songs are moved up or down to fit your voice ({midiName(range.lo)} to {midiName(range.hi)}).
        </p>
        <div className="song-grid">
          {VOICE_SONGS.map((s) => (
            <button key={s.id} className="song-card" onClick={() => setSong(s)}>
              <span className="song-emoji">{s.emoji}</span>
              <b>{s.title}</b>
              <span className="muted small">{LEVEL_NAME[s.level]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  return <Sing key={song.id} song={song} range={range} onExit={() => setSong(null)} />;
}

interface Note {
  midi: number;
  beat: number;
  beats: number;
  lyric: string;
  onMs: number; // time sung on pitch
  state: 'pending' | 'hit' | 'missed';
}

function Sing({ song, range, onExit }: { song: VoiceSong; range: VoiceRange; onExit: () => void }) {
  usePlayingMode(true);
  const [mode, setMode] = useState<Mode>('wait');
  const [tol, setTol] = useState(40);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(false);
  const [shiftAdj, setShiftAdj] = useState(0);
  const [, force] = useState(0);
  const baseShift = useMemo(() => fitShift(song.notes, range), [song, range]);
  const shift = baseShift + shiftAdj;

  const st = useRef({ beat: -2, notes: [] as Note[], trail: [] as { beat: number; m: number | null }[], last: 0, done: false, played: -1 });
  const build = () => {
    st.current = {
      beat: -2,
      notes: song.notes.map((n) => ({ midi: n.midi! + shift, beat: n.beat, beats: n.beats, lyric: n.lyric, onMs: 0, state: 'pending' })),
      trail: [],
      last: 0,
      done: false,
      played: -1,
    };
  };
  const reset = () => {
    build();
    setRunning(false);
    force((x) => x + 1);
  };
  const lastShift = useRef<number | null>(null);
  if (lastShift.current !== shift) {
    lastShift.current = shift;
    build();
  }

  const current = () => st.current.notes.find((n) => n.state === 'pending') ?? null;

  usePitchListener((f) => {
    const s = st.current;
    const dt = s.last ? Math.min(60, f.t - s.last) : 0;
    s.last = f.t;
    if (!running || mode === 'listen') return;
    const m = f.freq && f.rms > 0.004 ? f.midi : null;
    // the note under the playhead (or the one we're waiting on)
    const n = s.notes.find((x) => x.state === 'pending' && x.beat <= s.beat + 0.05) ?? null;
    const sung = m !== null && n ? foldToTarget(m, n.midi) : m;
    s.trail.push({ beat: s.beat, m: sung });
    if (s.trail.length > 3000) s.trail.shift();
    if (n && sung !== null && Math.abs(sung - n.midi) * 100 <= tol) {
      n.onMs += dt;
      const need = Math.min(350, n.beats * (60000 / (song.bpm * speed)) * 0.4);
      if (n.onMs >= need) n.state = 'hit';
    }
  });

  const canvasRef = useAnimationCanvas((ctx, w, h, now, dt) => {
    const s = st.current;
    const beatMs = 60000 / (song.bpm * speed);
    if (running && !s.done) {
      let next = s.beat + (dt * 1000) / beatMs;
      if (mode === 'wait') {
        const c = current();
        if (c && next > c.beat + Math.min(c.beats * 0.6, 0.5)) next = c.beat + Math.min(c.beats * 0.6, 0.5);
      }
      s.beat = next;
      // notes that slid past without being sung
      for (const n of s.notes) if (n.state === 'pending' && mode !== 'wait' && s.beat > n.beat + n.beats) n.state = 'missed';
      // listen mode (and guide): play the melody
      if (mode === 'listen') {
        const idx = s.notes.findIndex((n, i) => i > s.played && n.beat <= s.beat);
        if (idx >= 0) {
          s.played = idx;
          playNote(s.notes[idx].midi, (s.notes[idx].beats * beatMs) / 1000, 0.7, 'beep');
          s.notes[idx].state = 'hit';
        }
      }
      const end = Math.max(...s.notes.map((n) => n.beat + n.beats));
      if (s.beat > end + 0.5) {
        s.done = true;
        setRunning(false);
        force((x) => x + 1);
      }
    }
    // --- draw: time runs right to left, playhead at 25%
    ctx.clearRect(0, 0, w, h);
    const ms = s.notes.map((n) => n.midi);
    const lo = Math.min(...ms) - 3;
    const hi = Math.max(...ms) + 3;
    const lyricH = 46;
    const y = (m: number) => 8 + ((hi - m) / (hi - lo)) * (h - lyricH - 16);
    const pxBeat = Math.max(60, Math.min(140, w / 9));
    const px = w * 0.25;
    const x = (b: number) => px + (b - s.beat) * pxBeat;
    // note lines
    ctx.font = '700 11px "Baloo 2", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (let m = Math.ceil(lo); m <= hi; m++) {
      ctx.fillStyle = m % 12 === 0 ? 'rgba(255,207,51,0.18)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y(m), w, 1);
    }
    // notes
    const bh = Math.max(10, (h - lyricH) / (hi - lo) * 0.8);
    for (const n of s.notes) {
      const x0 = x(n.beat);
      const x1 = x(n.beat + n.beats) - 3;
      if (x1 < 0 || x0 > w) continue;
      const cur = n === current();
      ctx.fillStyle = n.state === 'hit' ? '#52d273' : n.state === 'missed' ? 'rgba(255,90,90,0.45)' : cur ? '#ffcf33' : 'rgba(123,108,255,0.85)';
      roundRect(ctx, x0, y(n.midi) - bh / 2, Math.max(6, x1 - x0), bh, bh / 2);
      ctx.fill();
      // band showing how close counts
      if (cur) {
        const band = ((tol / 100) * (h - lyricH - 16)) / (hi - lo);
        ctx.fillStyle = 'rgba(255,207,51,0.12)';
        ctx.fillRect(Math.max(0, x0), y(n.midi) - band, Math.max(6, x1 - Math.max(0, x0)), band * 2);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(pitchClassName(n.midi), x0 + 4, y(n.midi) - bh / 2 - 8);
      // lyrics
      ctx.fillStyle = cur ? '#ffcf33' : n.state === 'hit' ? '#9ff0b4' : '#fff';
      ctx.font = `800 ${cur ? 22 : 18}px "Baloo 2", system-ui, sans-serif`;
      ctx.fillText(n.lyric, x0, h - lyricH / 2);
      ctx.font = '700 11px "Baloo 2", system-ui, sans-serif';
    }
    // your voice
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    let prev: { beat: number; m: number | null } | null = null;
    for (const p of s.trail) {
      if (prev && p.m !== null && prev.m !== null && Math.abs(p.m - prev.m) < 1.5 && p.beat - prev.beat < 0.3) {
        const xa = x(prev.beat);
        if (xa > -10) {
          ctx.strokeStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(xa, y(Math.max(lo, Math.min(hi, prev.m))));
          ctx.lineTo(x(p.beat), y(Math.max(lo, Math.min(hi, p.m))));
          ctx.stroke();
        }
      }
      prev = p;
    }
    // playhead
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(px - 1, 0, 2, h - lyricH);
    const last = s.trail[s.trail.length - 1];
    if (last && last.m !== null && now) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(px, y(Math.max(lo, Math.min(hi, last.m))), 9, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const s = st.current;
  const sung = s.notes.filter((n) => n.state === 'hit').length;
  const total = s.notes.length;
  const stars = sung / total > 0.9 ? 3 : sung / total > 0.7 ? 2 : sung / total > 0.4 ? 1 : 0;
  const start = () => {
    if (s.done || s.beat > -2) {
      if (s.done) reset();
    }
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
          {(['wait', 'play', 'listen'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); reset(); }}>
              {m === 'wait' ? '🐢' : m === 'play' ? '🏃' : '👂'}
              <span className="lbl">{m === 'wait' ? ' Wait for me' : m === 'play' ? ' Sing along' : ' Listen'}</span>
            </button>
          ))}
        </div>
        <select value={tol} onChange={(e) => setTol(+e.target.value)} aria-label="how close">
          <option value={60}>Easy</option>
          <option value={40}>Medium</option>
          <option value={20}>Pitch perfect</option>
        </select>
        <select value={speed} onChange={(e) => setSpeed(+e.target.value)} aria-label="speed">
          <option value={0.6}>slow</option>
          <option value={0.8}>¾×</option>
          <option value={1}>1×</option>
        </select>
        <div className="seg">
          <button onClick={() => setShiftAdj((x) => x - 1)} title="Lower key">
            ♭
          </button>
          <button onClick={() => setShiftAdj((x) => x + 1)} title="Higher key">
            ♯
          </button>
        </div>
        <div className="score">
          ✅ {sung}/{total}
        </div>
      </div>
      <div className="highway-wrap">
        <canvas ref={canvasRef} className="sing-canvas" />
        {!running && !s.done && (
          <div className="overlay-center">
            <button className="btn big primary" onClick={start}>
              {s.beat > -2 ? '▶ Keep going' : mode === 'listen' ? '👂 Listen to it' : '▶ Start'}
            </button>
            <p className="muted small">
              {mode === 'wait'
                ? 'The song waits until you sing each note. Watch your white line reach the yellow note!'
                : mode === 'play'
                  ? 'Sing along in time. Green notes = you were on pitch.'
                  : 'Hear the tune first.'}{' '}
              Starts on {midiName(s.notes[0]?.midi ?? 60)}.
            </p>
            <button className="btn small" onClick={() => playNote(s.notes[0].midi, 1, 0.7, 'beep')}>
              🔊 Starting note
            </button>
          </div>
        )}
        {s.done && (
          <div className="overlay-center results">
            <div className="big-stars">
              {'⭐'.repeat(stars)}
              {'☆'.repeat(3 - stars)}
            </div>
            <h2>{stars === 3 ? 'Pitch perfect!' : stars === 2 ? 'Great singing!' : stars === 1 ? 'Good start!' : 'Keep practising!'}</h2>
            <p>
              {sung} of {total} notes on pitch
            </p>
            <div className="row">
              <button className="btn big primary" onClick={() => { reset(); setRunning(true); }}>
                Sing again
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
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
