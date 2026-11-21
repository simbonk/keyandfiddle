import { TopBarSlot } from '../ui/chrome';
import { useState } from 'react';
import type { Song } from '../audio/notes';
import { type PianoCalibration, isCalibrated, loadCalibration, saveCalibration } from './calibration';
import { PianoPlay } from './PianoPlay';
import { type Recording, Recorder, loadRecs, recordingToSong } from './Recorder';
import { SoundLab } from './SoundLab';
import { TuneChart, TuningWizard } from './TuningWizard';

type View = 'play' | 'sounds' | 'record' | 'tune';

export function PianoTab() {
  const [cal, setCal] = useState<PianoCalibration>(loadCalibration);
  const [view, setView] = useState<View>(() => (isCalibrated(loadCalibration()) ? 'play' : 'tune'));
  const [skipped, setSkipped] = useState(false);
  const [learnSong, setLearnSong] = useState<Song | null>(null);
  const [recs, setRecs] = useState<Recording[]>(loadRecs);

  return (
    <div className="tab-body">
      <TopBarSlot>
      <nav className="subnav">
        <button className={view === 'play' ? 'on' : ''} onClick={() => setView('play')}>
          🎮 Play songs
        </button>
        <button className={view === 'sounds' ? 'on' : ''} onClick={() => setView('sounds')}>
          🎹 Sounds
        </button>
        <button className={view === 'record' ? 'on' : ''} onClick={() => setView('record')}>
          🎙️ Record
        </button>
        <button className={view === 'tune' ? 'on' : ''} onClick={() => setView('tune')}>
          🎛️ Tune to my piano
        </button>
      </nav>
      </TopBarSlot>

      {view === 'tune' && (
        <>
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
              Tip: <button className="link" onClick={() => setView('tune')}>tune in to your piano</button> first so I can
              hear it properly. You can also tap the keys on screen.
            </div>
          )}
          <PianoPlay cal={cal} extraSongs={recs.map(recordingToSong)} initialSong={learnSong} />
        </>
      )}
      {view === 'sounds' && <SoundLab />}
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
