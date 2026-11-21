import { TopBarSlot } from '../ui/chrome';
import { useState } from 'react';
import type { Song } from '../audio/notes';
import { type PianoCalibration, isCalibrated, loadCalibration, saveCalibration } from './calibration';
import { InputModeChoice, PianoPlay, loadInputMode } from './PianoPlay';
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

  return (
    <div className="tab-body">
      <TopBarSlot>
        <nav className="subnav">
          <button className={view === 'play' || view === 'record' ? 'on' : ''} onClick={() => setView('play')}>
            <span className="ico">🎵</span>
            <span className="nm"> Songs</span>
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

      {view === 'sounds' && <SoundLab />}
      {view === 'settings' && (
        <>
          <div className="panel slim settings-row">
            <b>⚙️ Settings</b>
            <InputModeChoice />
            <MicBoostSelect />
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
          {!isCalibrated(cal) && loadInputMode() === 'mic' && (
            <div className="hint">
              Tip:{' '}
              <button className="link" onClick={() => setView('settings')}>
                tune in to your piano
              </button>{' '}
              (in ⚙️ Settings) first so I can hear it properly. You can also tap the keys on screen.
            </div>
          )}
          <PianoPlay
            cal={cal}
            extraSongs={recs.map(recordingToSong)}
            initialSong={learnSong}
            onRecord={() => setView('record')}
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
