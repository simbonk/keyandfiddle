import { Icon } from './Icon';

/** "Play on: Touch | Real" switch shown at the top of a song list. */
export function PlayOn({
  value,
  onChange,
  real,
}: {
  value: 'touch' | 'real';
  onChange: (v: 'touch' | 'real') => void;
  /** name of the real instrument, e.g. "My piano" */
  real: string;
}) {
  return (
    <div className="play-on">
      <span className="muted small">Play on</span>
      <div className="seg" role="radiogroup" aria-label="Play on">
        <button role="radio" aria-checked={value === 'touch'} className={value === 'touch' ? 'on' : ''} onClick={() => onChange('touch')}>
          <Icon name="touch" size={18} /> Touch screen
        </button>
        <button role="radio" aria-checked={value === 'real'} className={value === 'real' ? 'on' : ''} onClick={() => onChange('real')}>
          <Icon name="real" size={18} /> {real}
        </button>
      </div>
    </div>
  );
}
