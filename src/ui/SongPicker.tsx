import { useRef, useState } from 'react';
import type { Song } from '../audio/notes';
import { PhotoImport } from '../omr/PhotoImport';
import { addScoreFile, isPicture, removeScore, scoreToSong, useImportedScores } from './importedSongs';

const LEVELS: { level: 1 | 2 | 3; name: string; emoji: string }[] = [
  { level: 1, name: 'Beginner', emoji: '🌱' },
  { level: 2, name: 'Intermediate', emoji: '🌿' },
  { level: 3, name: 'Advanced', emoji: '🌳' },
];

export function SongPicker({
  songs,
  onPick,
  intro,
  extraTitle = 'Your recordings',
  badge,
  instrument,
}: {
  songs: Song[];
  onPick: (s: Song) => void;
  intro?: React.ReactNode;
  extraTitle?: string;
  badge?: (s: Song) => string | null;
  /** Show "import sheet music" and the user's imported songs for this instrument. */
  instrument?: 'piano' | 'violin';
}) {
  const scores = useImportedScores();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (isPicture(f)) {
      setMsg(null);
      setPhoto(f);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const s = await addScoreFile(f);
      setMsg({ text: `Added “${s.title}” (${s.notes.length} notes). Tap it below to play.`, bad: false });
    } catch (e) {
      setMsg({ text: (e as Error).message || "I couldn't read that file.", bad: true });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const own = songs.filter((s) => s.id.startsWith('rec-'));
  const groups = LEVELS.map((l) => ({ ...l, songs: songs.filter((s) => s.level === l.level && !s.id.startsWith('rec-')) }));
  const card = (s: Song) => {
    const b = badge?.(s);
    return (
      <button key={s.id} className="song-card" onClick={() => onPick(s)}>
        <span className="song-emoji">{s.emoji}</span>
        <b>{s.title}</b>
        <span className="stars">
          {'★'.repeat(s.level)}
          {'☆'.repeat(3 - s.level)}
        </span>
        {s.blurb && <span className="muted small">{s.blurb}</span>}
        {b && <span className="song-badge">{b}</span>}
      </button>
    );
  };
  if (photo)
    return (
      <PhotoImport
        file={photo}
        onCancel={() => setPhoto(null)}
        onDone={(sc) => {
          setPhoto(null);
          setMsg({ text: `Added “${sc.title}” (${sc.notes.length} notes). Tap it below to play.`, bad: false });
        }}
      />
    );
  return (
    <div className="panel">
      <h2>Pick a song</h2>
      {intro}
      {groups
        .filter((g) => g.songs.length)
        .map((g) => (
          <section key={g.level} className="song-group">
            <h3>
              {g.emoji} {g.name}
            </h3>
            <div className="song-grid">{g.songs.map(card)}</div>
          </section>
        ))}
      {instrument && (
        <section className="song-group">
          <h3>📄 Your sheet music</h3>
          <div className="song-grid">
            {scores.map((sc) => {
              const song = scoreToSong(sc, instrument);
              return (
                <div key={sc.id} className="song-card-wrap">
                  {card(song)}
                  <button
                    className="song-del"
                    aria-label={`Remove ${sc.title}`}
                    onClick={() => {
                      if (window.confirm(`Remove “${sc.title}”?`)) removeScore(sc.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <button className="song-card import-card" disabled={busy} onClick={() => fileRef.current?.click()}>
              <span className="song-emoji">{busy ? '⏳' : '➕'}</span>
              <b>Import sheet music</b>
              <span className="muted small">A photo or screenshot of printed music, or a MusicXML / MIDI file</span>
            </button>
          </div>
          <input ref={fileRef} type="file" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          {msg && <div className={`toast ${msg.bad ? 'warn' : 'good'}`}>{msg.text}</div>}
          <p className="muted small">
            Photos and screenshots: I read printed music and show you what I found, so you can fix anything before
            saving. Clear, straight screenshots work best. MusicXML or MIDI files from a sheet music app are the most
            accurate. Everything stays on this device.
          </p>
        </section>
      )}
      {own.length > 0 && (
        <section className="song-group">
          <h3>🎙️ {extraTitle}</h3>
          <div className="song-grid">{own.map(card)}</div>
        </section>
      )}
    </div>
  );
}
