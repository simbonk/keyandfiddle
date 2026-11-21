import { TopBarSlot } from '../ui/chrome';
import { useState } from 'react';
import type { Song } from '../audio/notes';
import { type PianoCalibration, isCalibrated, loadCalibration, saveCalibration } from './calibration';
import { type InputMode, PianoPlay, loadInputMode, saveInputMode } from './PianoPlay';
import { Icon } from '../ui/Icon';
import { PlayOn } from '../ui/PlayOn';
import { type Recording, Recorder, loadRecs, recordingToSong } from './Recorder';
import { TuneChart, TuningWizard } from './TuningWizard';
import { MicBoostSelect } from '../ui/MicButton';
import { SoundLab } from './SoundLab';

type View = 'play' | 'sounds' | 'record' | 'settings';

export function PianoTab() {
  const [cal, setCal] = useState<PianoCalibration>(loadCalibration);
  const [view, setView] = useState<View>(() =>
    isCalibrated(loadCalibration()) || loadInputMode() === 'tap' ? 'play' : 'settings',
  );
  const [skipped, setSkipped] = useState(false);
  const [learnSong, setLearnSong] = useState<Song | null>(null);
  const [recs, setRecs] = useState<Recording[]>(loadRecs);
  const [input, setInputState] = useState<InputMode>(loadInputMode);
  const setInput = (m: InputMode) => {
    setInputState(m);
    saveInputMode(m);
  };
  const header = (
    <>
      <PlayOn value={input === 'tap' ? 'touch' : 'real'} onChange={(v) => setInput(v === 'touch' ? 'tap' : 'mic')} real="My piano" />
      {input === 'mic' && !isCalibrated(cal) && (
        <div className="banner">
          <span>Tune in to your piano first so I can hear it</span>
          <button className="btn small primary" onClick={() => setView('settings')}>
            Tune in
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="tab-body">
      <TopBarSlot>
        <nav className="subnav">
          <button className={view === 'play' || view === 'record' ? 'on' : ''} onClick={() => setView('play')}>
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

      {view === 'sounds' && <SoundLab />}
      {view === 'settings' && (
        <>
          <div className="panel slim settings-list">
            <b>Microphone</b>
            <div className="opt-row">
              <span>
                Mic boost
                <span className="muted small tv-hint">Turn up if I can't hear a quiet piano</span>
              </span>
              <MicBoostSelect bare />
            </div>
          </div>
          {isCalibrated(cal) && (
            <div className="panel slim">
              <b>Your piano right now</b>
              <TuneChart cal={cal} start={cal.startMidi} />
            </div>
          )}
          <TuningWizard
            cal={cal}
            onDone={(c) => {
              setCal(c);
              setView('play');
            }}
            onCancel={
              !skipped
                ? () => {
                    setSkipped(true);
                    const c = { ...cal };
                    saveCalibration(c);
                    setView('play');
                  }
                : undefined
            }
          />
        </>
      )}
      {view === 'play' && (
        <>
          <PianoPlay
            cal={cal}
            extraSongs={recs.map(recordingToSong)}
            initialSong={learnSong}
            onRecord={() => setView('record')}
            header={header}
          />
        </>
      )}
      {view === 'record' && (
        <Recorder
          cal={cal}
          onRecordingsChanged={setRecs}
          onLearn={(s) => {
            setLearnSong(s);
            setView('play');
          }}
        />
      )}
    </div>
  );
}
