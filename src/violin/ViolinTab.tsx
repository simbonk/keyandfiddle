import { TopBarSlot } from '../ui/chrome';
import { Icon } from '../ui/Icon';
import { MicBoostSelect } from '../ui/MicButton';
import { PlayOn } from '../ui/PlayOn';
import { useState } from 'react';
import { ViolinLessons } from './ViolinLesson';
import { TunerModal } from './ViolinTuner';
import { TouchViolinSettings, TouchViolinTab, ViolinSounds } from './touch/TouchViolin';

// Same three tabs as the piano. Songs starts on the touch violin (friendliest
// for beginners); a Touch | Real switch at the top moves to a real violin.
type View = 'songs' | 'sounds' | 'settings';
type On = 'touch' | 'real';
const ON_KEY = 'kf.violin.on';

export function ViolinTab() {
  const [view, setView] = useState<View>('songs');
  const [tuner, setTuner] = useState(false);
  const [on, setOnState] = useState<On>(() => {
    try {
      return localStorage.getItem(ON_KEY) === 'real' ? 'real' : 'touch';
    } catch {
      return 'touch';
    }
  });
  const setOn = (v: On) => {
    setOnState(v);
    try {
      localStorage.setItem(ON_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const header = <PlayOn value={on} onChange={setOn} real="My violin" />;
  return (
    <div className="tab-body">
      <TopBarSlot>
        <nav className="subnav">
          <button className={view === 'songs' ? 'on' : ''} onClick={() => setView('songs')}>
            <Icon name="songs" className="ico" />
            <span className="nm">Songs</span>
          </button>
          <button className={view === 'sounds' ? 'on' : ''} onClick={() => setView('sounds')}>
            <Icon name="sounds" className="ico" />
            <span className="nm">Sounds</span>
          </button>
          <button className={view === 'settings' ? 'on' : ''} onClick={() => setView('settings')}>
            <Icon name="settings" className="ico" />
            <span className="nm">Settings</span>
          </button>
        </nav>
      </TopBarSlot>
      {view === 'songs' && (on === 'touch' ? <TouchViolinTab header={header} /> : <ViolinLessons header={header} />)}
      {view === 'sounds' && <ViolinSounds />}
      {view === 'settings' && (
        <div className="settings-page">
          <div className="panel slim settings-list">
            <b>Microphone</b>
            <div className="opt-row">
              <span>
                Mic boost
                <span className="muted small tv-hint">Turn up if I can't hear a quiet violin</span>
              </span>
              <MicBoostSelect bare />
            </div>
          </div>
          <TouchViolinSettings />
          <div className="panel slim settings-list">
            <div className="opt-row">
              <span>
                <b>Tuner</b>
                <span className="muted small tv-hint">Tune your strings, and place and check finger tapes</span>
              </span>
              <button className="btn primary" onClick={() => setTuner(true)}>
                <Icon name="tuner" size={18} /> Tune my violin
              </button>
            </div>
          </div>
          {tuner && (
            <TunerModal
              onClose={() => setTuner(false)}
              onDone={() => {
                setOn('real');
                setView('songs');
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
