import { Icon } from '../ui/Icon';
import { useEffect, useRef, useState } from 'react';
import { usePitchListener } from '../audio/hooks';
import { getAudioContext, mic } from '../audio/mic';
import { midiName, type Song } from '../audio/notes';
import { playNote } from '../audio/synth';
import { MicGate, LevelMeter } from '../ui/MicButton';
import { useAnimationCanvas } from '../ui/useAnimationCanvas';
import { Keyboard } from './Keyboard';
import { type PianoCalibration, matchKey } from './calibration';
import { noteColor } from './highway';

export interface RecNote {
  midi: number;
  start: number; // seconds from recording start
  dur: number;
  vel: number; // 0..1
}

export interface Recording {
  id: string;
  name: string;
  createdAt: number;
  notes: RecNote[];
}

const STORE = 'kf.piano.recordings.v1';
export function loadRecs(): Recording[] {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '[]');
  } catch {
    return [];
  }
}
function saveRecs(r: Recording[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(r.slice(0, 30)));
  } catch {
    /* ignore */
  }
}

export function recordingToSong(r: Recording): Song {
  // 1 beat = 1 second at 60 bpm; snap to 1/8 beat so the highway looks tidy.
  const q = (x: number) => Math.max(0.125, Math.round(x * 8) / 8);
  return {
    id: `rec-${r.id}`,
    title: r.name,
    emoji: '🎙️',
    bpm: 60,
    level: 1,
    blurb: 'Your own recording',
    notes: r.notes.map((n) => ({
      midi: n.midi,
      beat: Math.round(n.start * 8) / 8,
      beats: q(n.dur),
      tag: n.midi < 60 ? 'L' : undefined,
    })),
  };
}

interface Props {
  cal: PianoCalibration;
  onLearn: (s: Song) => void;
  onRecordingsChanged?: (r: Recording[]) => void;
}

export function Recorder({ cal, onLearn, onRecordingsChanged }: Props) {
  const [recs, setRecs] = useState<Recording[]>(loadRecs);
  const [recording, setRecording] = useState(false);
  const [live, setLive] = useState<RecNote[]>([]);
  const [selected, setSelected] = useState<Recording | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [level, setLevel] = useState(0);
  const t0 = useRef(0);
  const cur = useRef<{
    midi: number;
    t0: number;
    peak: number;
    lastSeen: number;
    cand: number | null;
    candN: number;
  } | null>(null);
  const notesRef = useRef<RecNote[]>([]);
  const mediaRec = useRef<MediaRecorder | null>(null);
  const playStart = useRef(0);
  const stopFns = useRef<(() => void)[]>([]);
  const start = cal.startMidi;
  const end = start + 24;

  useEffect(() => onRecordingsChanged?.(recs), [recs]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = (t: number) => {
    const c = cur.current;
    if (!c) return;
    const dur = (Math.min(t, c.lastSeen + 60) - c.t0) / 1000;
    if (dur > 0.07) {
      notesRef.current.push({
        midi: c.midi,
        start: (c.t0 - t0.current) / 1000,
        dur,
        vel: Math.min(1, c.peak / (cal.refLevel * 2)),
      });
      setLive([...notesRef.current]);
    }
    cur.current = null;
  };

  usePitchListener((f) => {
    setLevel(f.rms);
    if (!recording) return;
    const key = f.freq ? (matchKey(cal, f.freq)?.midi ?? null) : null;
    const c = cur.current;
    if (f.onset && c) close(f.t);
    if (key === null) {
      if (cur.current && f.t - cur.current.lastSeen > 120) close(f.t);
      return;
    }
    if (!cur.current) {
      cur.current = { midi: key, t0: f.t, peak: f.rms, lastSeen: f.t, cand: null, candN: 0 };
      return;
    }
    const cc = cur.current;
    if (key === cc.midi) {
      cc.lastSeen = f.t;
      cc.peak = Math.max(cc.peak, f.rms);
      cc.cand = null;
    } else {
      // pitch changed without a clear attack (legato) - require 2 stable frames
      if (cc.cand === key) cc.candN++;
      else {
        cc.cand = key;
        cc.candN = 1;
      }
      if (cc.candN >= 2) {
        close(f.t);
        cur.current = { midi: key, t0: f.t, peak: f.rms, lastSeen: f.t, cand: null, candN: 0 };
      }
    }
  }, true);

  const startRec = async () => {
    await mic.start();
    notesRef.current = [];
    setLive([]);
    setSelected(null);
    setAudioUrl(null);
    t0.current = performance.now();
    cur.current = null;
    setRecording(true);
    if (mic.stream && typeof MediaRecorder !== 'undefined') {
      try {
        const mr = new MediaRecorder(mic.stream);
        const chunks: Blob[] = [];
        mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        mr.onstop = () => setAudioUrl(URL.createObjectURL(new Blob(chunks, { type: mr.mimeType })));
        mr.start();
        mediaRec.current = mr;
      } catch {
        mediaRec.current = null;
      }
    }
  };

  const stopRec = () => {
    close(performance.now());
    setRecording(false);
    mediaRec.current?.stop();
    mediaRec.current = null;
    if (!notesRef.current.length) return;
    // trim leading silence
    const first = notesRef.current[0].start;
    const notes = notesRef.current.map((n) => ({ ...n, start: n.start - first }));
    const rec: Recording = {
      id: Date.now().toString(36),
      name: `My song ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
      createdAt: Date.now(),
      notes,
    };
    const next = [rec, ...recs];
    setRecs(next);
    saveRecs(next);
    setSelected(rec);
  };

  const stopPlayback = () => {
    stopFns.current.forEach((f) => f());
    stopFns.current = [];
    setPlaying(false);
    setLit(new Set());
  };

  const play = (r: Recording) => {
    stopPlayback();
    const ctx = getAudioContext();
    const t = ctx.currentTime + 0.1;
    stopFns.current = r.notes.map((n) => playNote(n.midi, n.dur, 0.3 + n.vel * 0.7, 'keys', t + n.start));
    playStart.current = performance.now() + 100;
    setPlaying(true);
  };

  const shown = recording ? live : (selected?.notes ?? []);
  const duration = shown.reduce((m, n) => Math.max(m, n.start + n.dur), 0);

  const canvasRef = useAnimationCanvas((ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, w, h);
    const rows = end - start + 1;
    const rh = h / rows;
    for (let m = start; m <= end; m++) {
      if ([1, 3, 6, 8, 10].includes(m % 12)) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, (end - m) * rh, w, rh);
      }
    }
    const now = recording ? (performance.now() - t0.current) / 1000 : 0;
    const span = Math.max(4, recording ? now + 0.5 : duration + 0.3);
    const px = w / span;
    for (const n of shown) {
      if (n.midi < start || n.midi > end) continue;
      ctx.fillStyle = noteColor(n.midi);
      ctx.globalAlpha = 0.45 + n.vel * 0.55;
      ctx.beginPath();
      const rx = n.start * px,
        ry = (end - n.midi) * rh + 1,
        rw = Math.max(4, n.dur * px);
      if (ctx.roundRect) ctx.roundRect(rx, ry, rw, rh - 2, 4);
      else ctx.rect(rx, ry, rw, rh - 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (playing && selected) {
      const pt = (performance.now() - playStart.current) / 1000;
      ctx.fillStyle = '#fff';
      ctx.fillRect(pt * px, 0, 2, h);
      const on = new Set(selected.notes.filter((n) => pt >= n.start && pt < n.start + n.dur).map((n) => n.midi));
      if ([...on].join() !== [...lit].join()) setLit(on);
      if (pt > duration + 0.5) stopPlayback();
    }
  });

  return (
    <MicGate why="Recording listens to your piano and writes down the notes you play.">
      <div className="panel recorder">
        <div className="row wrap">
          {!recording ? (
            <button className="btn big rec" onClick={startRec}>
              ⏺ Record
            </button>
          ) : (
            <button className="btn big rec on" onClick={stopRec}>
              ⏹ Stop
            </button>
          )}
          <LevelMeter level={level} />
          {recording && <span className="pill">{live.length} notes heard</span>}
        </div>
        <p className="muted small">
          Play one note at a time (melodies work best). I'll turn what I hear into notes you can replay or learn on the
          highway.
        </p>
        <canvas ref={canvasRef} className="pianoroll" />
        <Keyboard start={start} end={end} pressed={lit} height={110} showLabels={false} />
        {selected && !recording && (
          <div className="row wrap">
            <input
              className="name-input"
              value={selected.name}
              onChange={(e) => {
                const r = { ...selected, name: e.target.value };
                setSelected(r);
                const next = recs.map((x) => (x.id === r.id ? r : x));
                setRecs(next);
                saveRecs(next);
              }}
            />
            {!playing ? (
              <button className="btn primary" onClick={() => play(selected)}>
                <Icon name="play" size={16} /> Play notes
              </button>
            ) : (
              <button className="btn" onClick={stopPlayback}>
                ⏹ Stop
              </button>
            )}
            {audioUrl && <audio src={audioUrl} controls className="rec-audio" />}
            <button className="btn" onClick={() => onLearn(recordingToSong(selected))}>
              🎮 Learn it
            </button>
            <span className="muted small">
              {selected.notes.length} notes:{' '}
              {selected.notes
                .slice(0, 8)
                .map((n) => midiName(n.midi))
                .join(' ')}
              {selected.notes.length > 8 ? ' …' : ''}
            </span>
          </div>
        )}
        {recs.length > 0 && (
          <div className="rec-list">
            <h3>Saved recordings</h3>
            {recs.map((r) => (
              <div key={r.id} className={`rec-item ${selected?.id === r.id ? 'on' : ''}`}>
                <button
                  className="link"
                  onClick={() => {
                    stopPlayback();
                    setSelected(r);
                    setAudioUrl(null);
                  }}
                >
                  🎙️ {r.name} <span className="muted small">({r.notes.length} notes)</span>
                </button>
                <button
                  className="btn small ghost"
                  onClick={() => {
                    const next = recs.filter((x) => x.id !== r.id);
                    setRecs(next);
                    saveRecs(next);
                    if (selected?.id === r.id) setSelected(null);
                  }}
                  aria-label="delete recording"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </MicGate>
  );
}
