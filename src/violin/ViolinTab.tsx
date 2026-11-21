import { TopBarSlot } from '../ui/chrome';
import { useState } from 'react';
import { ViolinLessons } from './ViolinLesson';
import { ViolinTuner } from './ViolinTuner';
import { TouchViolinTab } from './touch/TouchViolin';

// Same layout as the piano: Songs, the touch instrument, then Settings.
type View = 'songs' | 'touch' | 'settings';

export function ViolinTab() {
  const [view, setView] = useState<View>('songs');
  return (
    <div className="tab-body">
      <TopBarSlot>
        <nav className="subnav">
          <button className={view === 'songs' ? 'on' : ''} onClick={() => setView('songs')}>
            🎵 Songs
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
      {view === 'touch' && <TouchViolinTab />}
      {view === 'settings' && (
        <>
          <div className="panel slim settings-row">
            <b>⚙️ Settings</b>
            <span className="muted small">Tune your violin here before you play along with Songs.</span>
          </div>
          <ViolinTuner onDone={() => setView('songs')} />
        </>
      )}
    </div>
  );
}
