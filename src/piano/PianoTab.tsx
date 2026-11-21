import { TopBarSlot } from '../ui/chrome';
import { useState } from 'react';
import type { Song } from '../audio/notes';
import { type PianoCalibration, isCalibrated, loadCalibration, saveCalibration } from './calibration';
import { PianoPlay } from './PianoPlay';
import { type Recording, Recorder, loadRecs, recordingToSong } from './Recorder';
import { TuneChart, TuningWizard } from './TuningWizard';
import { MicBoostSelect } from '../ui/MicButton';

type View = 'play' | 'record' | 'settings';

export function PianoTab() {
  const [cal, setCal] = useState<PianoCalibration>(loadCalibration);
  const [view, setView] = useState<View>(() => (isCalibrated(loadCalibration()) ? 'play' : 'settings'));
  const [skipped, setSkipped] = useState(false);
  const [learnSong, setLearnSong] = useState<Song | null>(null);
  const [recs, setRecs] = useState<Recording[]>(loadRecs);

  return (
    <div className="tab-body">
      <TopBarSlot>
        <nav className="subnav">
          {view !== 'play' && <button onClick={() => setView('play')}>◀ Songs</button>}
          <button
            className={view === 'settings' ? 'on' : ''}
            onClick={() => setView(view === 'settings' ? 'play' : 'settings')}
          >
            ⚙️ Settings
          </button>
        </nav>
      </TopBarSlot>

      {view === 'settings' && (
        <>
          <div className="panel slim settings-row">
            <b>⚙️ Settings</b>
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
          {!isCalibrated(cal) && (
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
