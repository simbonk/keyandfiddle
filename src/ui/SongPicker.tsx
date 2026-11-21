import type { Song } from '../audio/notes';

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
}: {
  songs: Song[];
  onPick: (s: Song) => void;
  intro?: React.ReactNode;
  extraTitle?: string;
  badge?: (s: Song) => string | null;
}) {
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
      {own.length > 0 && (
        <section className="song-group">
          <h3>🎙️ {extraTitle}</h3>
          <div className="song-grid">{own.map(card)}</div>
        </section>
      )}
    </div>
  );
}
