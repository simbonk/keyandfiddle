import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  SOUNDS,
  type SoundId,
  type Voice,
  noteOn,
  preloadSound,
  setSound,
  useKeyboardSound,
} from '../audio/instruments';
import { getAudioContext } from '../audio/mic';
import {
  MAX_MY_SOUNDS,
  type MySound,
  SOUND_EMOJIS,
  deleteMySound,
  loadMySounds,
  mySounds,
  onMySoundsChange,
  recordSound,
  saveMySound,
} from '../audio/sampler';
import { Keyboard } from './Keyboard';
import { SampleEditor } from './SampleEditor';

export function useMySounds(): MySound[] {
  useEffect(() => {
    loadMySounds();
  }, []);
  return useSyncExternalStore(onMySoundsChange, mySounds, mySounds);
}

/** A little C-E-G-C run so you hear a sound as soon as you pick it. */
function preview(id: SoundId) {
  const t = getAudioContext().currentTime + 0.05;
  [60, 64, 67, 72].forEach((m, i) => {
    const v = noteOn(m, 0.7, t + i * 0.13, id);
    v.release(t + i * 0.13 + (i === 3 ? 0.6 : 0.2));
  });
}

type RecState = 'idle' | 'listening' | 'hearing' | 'quiet' | 'denied' | 'error';

/** Pick a keyboard sound, make your own from the mic (with a keyboard to try it). */
export function SoundLab({ keys = true }: { keys?: boolean }) {
  const sound = useKeyboardSound();
  const mine = useMySounds();
  const [rec, setRec] = useState<RecState>('idle');
  const [level, setLevel] = useState(0);
  const recHandle = useRef<ReturnType<typeof recordSound> | null>(null);
  const [undo, setUndo] = useState<{ sound: MySound; wasSelected: boolean } | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);
  const remove = (m: MySound) => {
    const wasSelected = sound === `mine:${m.id}`;
    if (wasSelected) setSound('grand');
    deleteMySound(m.id);
    setUndo({ sound: m, wasSelected });
  };
  const restore = async () => {
    if (!undo) return;
    await saveMySound(undo.sound);
    if (undo.wasSelected) setSound(`mine:${undo.sound.id}`);
    setUndo(null);
  };

  useEffect(() => () => recHandle.current?.stop(), []);

  const pick = (id: SoundId) => {
    setSound(id);
    preloadSound(id).then(() => preview(id));
  };

  const startRec = async () => {
    if (recHandle.current) {
      recHandle.current.stop();
      return;
    }
    setRec('listening');
    setLevel(0);
    const h = recordSound((l, heard) => {
      setLevel(l);
      if (heard) setRec('hearing');
    });
    recHandle.current = h;
    const r = await h.done;
    recHandle.current = null;
    setLevel(0);
    if (!r.ok) {
      setRec(r.reason);
      return;
    }
    try {
      await saveMySound(r.sound);
    } catch {
      setRec('error');
      return;
    }
    setRec('idle');
    setSound(`mine:${r.sound.id}`);
    preview(`mine:${r.sound.id}`);
  };

  const full = mine.length >= MAX_MY_SOUNDS;
  const recording = rec === 'listening' || rec === 'hearing';

  return (
    <div className="sound-lab">
      <div className="panel slim">
        <b>Pick how your keys sound</b>
        <div className="sound-grid">
          {SOUNDS.map((s) => (
            <button key={s.id} className={`sound-card ${sound === s.id ? 'on' : ''}`} onClick={() => pick(s.id)}>
              <span className="sound-emoji">{s.emoji}</span>
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel slim sampler">
        <div className="sampler-head">
          <button
            className={`rec-big ${recording ? 'on' : ''}`}
            disabled={full && !recording}
            onClick={startRec}
            style={{ ['--lvl' as string]: String(level) }}
            aria-label={recording ? 'Stop recording' : 'Record a sound'}
          >
            {recording ? (rec === 'hearing' ? '👂' : '🎤') : '🔴'}
          </button>
          <div>
            <b>Make your own sound</b>
            <p className="muted small">
              {rec === 'listening'
                ? 'Go! Say or make your sound now…'
                : rec === 'hearing'
                  ? 'Recording… tap again when you are done.'
                  : rec === 'quiet'
                    ? "I didn't hear anything. Tap the button and try a bit louder!"
                    : rec === 'denied'
                      ? 'The microphone is blocked. Allow it in the browser settings, then try again.'
                      : rec === 'error'
                        ? 'Something went wrong with the microphone. Try again?'
                        : full
                          ? `You have ${MAX_MY_SOUNDS} sounds. Pick one and tap 🗑 Delete to make room.`
                          : 'Tap the red button, then say hello, cough, clap, sneeze or sing! It turns into a whole keyboard.'}
            </p>
          </div>
        </div>
        {mine.length > 0 && (
          <div className="sound-grid">
            {mine.map((m) => {
              const id: SoundId = `mine:${m.id}`;
              return (
                <div key={m.id} className={`sound-card mine ${sound === id ? 'on' : ''}`}>
                  <button className="sound-pick" onClick={() => pick(id)}>
                    <span
                      className="sound-emoji"
                      title="Tap to change the picture"
                      onClick={(e) => {
                        if (sound !== id) return;
                        e.stopPropagation();
                        const i = SOUND_EMOJIS.indexOf(m.emoji);
                        saveMySound({
                          ...m,
                          emoji: SOUND_EMOJIS[(i + 1) % SOUND_EMOJIS.length],
                        });
                      }}
                    >
                      {m.emoji}
                    </span>
                    <span>{m.name}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {(() => {
          const sel = mine.find((m) => sound === `mine:${m.id}`);
          return sel ? <SampleEditor sound={sel} onDelete={() => remove(sel)} /> : null;
        })()}
        {undo && (
          <div className="toast undo-toast">
            🗑 Deleted {undo.sound.emoji} {undo.sound.name}
            <button className="btn small" onClick={restore}>
              ↩ Undo
            </button>
          </div>
        )}
        {mine.length > 0 && <p className="muted small tip">Tip: tap the picture on your chosen sound to change it.</p>}
      </div>

      {keys && <FreeKeys />}
    </div>
  );
}

/** A keyboard to play freely with the chosen sound, with octave buttons. */
export function FreeKeys({ height = 'min(34dvh, 240px)', header }: { height?: string; header?: React.ReactNode }) {
  const sound = useKeyboardSound();
  const [octave, setOctave] = useState(48);
  const [down, setDown] = useState<Set<number>>(new Set());
  const voices = useRef(new Map<number, Voice>());
  useEffect(() => {
    preloadSound(sound, octave, octave + 24);
  }, [sound, octave]);
  return (
    <div className="freeplay">
      <div className="row octave-row">
        <button className="btn small ghost" disabled={octave <= 24} onClick={() => setOctave((o) => o - 12)}>
          ◀ Lower
        </button>
        {header ?? <span className="muted small">Play anything!</span>}
        <button className="btn small ghost" disabled={octave >= 72} onClick={() => setOctave((o) => o + 12)}>
          Higher ▶
        </button>
      </div>
      <Keyboard
        start={octave}
        end={octave + 24}
        pressed={down}
        height={height}
        onPress={(m) => {
          voices.current.get(m)?.kill();
          voices.current.set(m, noteOn(m, 0.75));
          setDown((s) => new Set(s).add(m));
        }}
        onRelease={(m) => {
          voices.current.get(m)?.release();
          voices.current.delete(m);
          setDown((s) => {
            const n = new Set(s);
            n.delete(m);
            return n;
          });
        }}
      />
    </div>
  );
}

/** Compact sound chooser for the song screen. */
export function SoundSelect() {
  const sound = useKeyboardSound();
  const mine = useMySounds();
  return (
    <select
      value={sound}
      aria-label="keyboard sound"
      onChange={(e) => {
        const id = e.target.value as SoundId;
        setSound(id);
        preloadSound(id);
      }}
    >
      {SOUNDS.map((s) => (
        <option key={s.id} value={s.id}>
          {s.emoji} {s.name}
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
