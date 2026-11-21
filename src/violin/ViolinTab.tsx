import { TopBarSlot } from '../ui/chrome';
import { MicBoostSelect } from '../ui/MicButton';
import { useState } from 'react';
import { ViolinLessons } from './ViolinLesson';
import { ViolinTuner } from './ViolinTuner';
import { TouchViolinTab, ViolinSounds } from './touch/TouchViolin';

// Same layout as the piano: Songs, Sounds, the touch violin, then Settings.
type View = 'songs' | 'sounds' | 'touch' | 'settings';

export function ViolinTab() {
  const [view, setView] = useState<View>('songs');
  return (
    <div className="tab-body">
      <TopBarSlot>
        <nav className="subnav">
          <button className={view === 'songs' ? 'on' : ''} onClick={() => setView('songs')}>
            🎵 Songs
          </button>
          <button className={view === 'sounds' ? 'on' : ''} onClick={() => setView('sounds')}>
            🎤 Sounds
          </button>
          <button className={view === 'touch' ? 'on' : ''} onClick={() => setView('touch')}>
            📱 Touch violin
          </button>
          <button className={view === 'settings' ? 'on' : ''} onClick={() => setView('settings')}>
            ⚙️<span className="lbl"> Settings</span>
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
