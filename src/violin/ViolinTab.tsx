import { TopBarSlot } from '../ui/chrome';
import { useState } from 'react';
import { ViolinLessons } from './ViolinLesson';
import { ViolinTuner } from './ViolinTuner';
import { TouchViolinTab } from './touch/TouchViolin';

type View = 'tune' | 'lessons' | 'touch';

export function ViolinTab() {
  const [view, setView] = useState<View>('tune');
  return (
    <div className="tab-body">
      <TopBarSlot>
      <nav className="subnav">
        <button className={view === 'tune' ? 'on' : ''} onClick={() => setView('tune')}>
          🎚️ 1. Tune
        </button>
        <button className={view === 'lessons' ? 'on' : ''} onClick={() => setView('lessons')}>
          🎮 2. Play tunes
        </button>
        <button className={view === 'touch' ? 'on' : ''} onClick={() => setView('touch')}>
          📱 Touch violin
        </button>
      </nav>
      </TopBarSlot>
      {view === 'tune' && <ViolinTuner onDone={() => setView('lessons')} />}
      {view === 'lessons' && <ViolinLessons />}
      {view === 'touch' && <TouchViolinTab />}
    </div>
  );
}
