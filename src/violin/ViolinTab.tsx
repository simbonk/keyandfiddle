import { TopBarSlot } from '../ui/chrome';
import { useState } from 'react';
import { ViolinCoach } from './ViolinCoach';
import { ViolinLessons } from './ViolinLesson';
import { ViolinTuner } from './ViolinTuner';
import { TouchViolinTab } from './touch/TouchViolin';

type View = 'tune' | 'mirror' | 'lessons' | 'touch';

export function ViolinTab() {
  const [view, setView] = useState<View>('tune');
  return (
    <div className="tab-body">
      <TopBarSlot>
      <nav className="subnav">
        <button className={view === 'tune' ? 'on' : ''} onClick={() => setView('tune')}>
          🎚️ 1. Tune
        </button>
        <button className={view === 'mirror' ? 'on' : ''} onClick={() => setView('mirror')}>
          🪞 2. Magic mirror
        </button>
        <button className={view === 'lessons' ? 'on' : ''} onClick={() => setView('lessons')}>
          🎮 3. Play tunes
        </button>
        <button className={view === 'touch' ? 'on' : ''} onClick={() => setView('touch')}>
          📱 Touch violin
        </button>
      </nav>
      </TopBarSlot>
      {view === 'tune' && <ViolinTuner onDone={() => setView('mirror')} />}
      {view === 'mirror' && <ViolinCoach />}
      {view === 'lessons' && <ViolinLessons />}
      {view === 'touch' && <TouchViolinTab />}
    </div>
  );
}
