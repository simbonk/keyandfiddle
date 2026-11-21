import { TopBarSlot } from '../ui/chrome';
import { MicBoostSelect } from '../ui/MicButton';
import { useState } from 'react';
import { ViolinLessons } from './ViolinLesson';
import { ViolinTuner } from './ViolinTuner';
import { TouchViolinTab, ViolinSounds } from './touch/TouchViolin';

// The touch violin comes first (the default, friendliest for beginners), then
// Songs on a real violin, Sounds and Settings.
type View = 'songs' | 'sounds' | 'touch' | 'settings';

export function ViolinTab() {
  const [view, setView] = useState<View>('touch');
  return (
    <div className="tab-body">
      <TopBarSlot>
        <nav className="subnav">
          <button className={view === 'touch' ? 'on' : ''} onClick={() => setView('touch')}>
            <span className="ico">📱</span>
            <span className="nm"> Touch violin</span>
          </button>
          <button className={view === 'songs' ? 'on' : ''} onClick={() => setView('songs')}>
            <span className="ico">🎻</span>
            <span className="nm"> Real violin</span>
          </button>
          <button className={view === 'sounds' ? 'on' : ''} onClick={() => setView('sounds')}>
            <span className="ico">🎤</span>
            <span className="nm"> Sounds</span>
          </button>
          <button className={view === 'settings' ? 'on' : ''} onClick={() => setView('settings')}>
            <span className="ico">⚙️</span>
            <span className="nm"> Settings</span>
          </button>
        </nav>
      </TopBarSlot>
      {view === 'songs' && <ViolinLessons />}
      {view === 'sounds' && <ViolinSounds />}
      {view === 'touch' && <TouchViolinTab />}
      {view === 'settings' && (
        <>
          <div className="panel slim settings-row">
            <b>⚙️ Settings</b>
            <MicBoostSelect />
            <span className="muted small">Tune your violin below before you play along with Songs.</span>
          </div>
          <ViolinTuner onDone={() => setView('songs')} />
        </>
      )}
    </div>
  );
}
