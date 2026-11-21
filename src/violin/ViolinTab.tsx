import { TopBarSlot } from '../ui/chrome';
import { useState } from 'react';
import { ViolinCoach } from './ViolinCoach';
import { ViolinLessons } from './ViolinLesson';
import { ViolinTuner } from './ViolinTuner';

type View = 'tune' | 'mirror' | 'lessons';

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
      </nav>
      </TopBarSlot>
      {view === 'tune' && <ViolinTuner onDone={() => setView('mirror')} />}
      {view === 'mirror' && <ViolinCoach />}
      {view === 'lessons' && <ViolinLessons />}
    </div>
  );
}
