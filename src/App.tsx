import { useMemo, useState } from 'react';
import { PianoTab } from './piano/PianoTab';
import { ChromeContext, FullscreenButton } from './ui/chrome';
import { ViolinTab } from './violin/ViolinTab';

type Tab = 'piano' | 'violin';

export function App() {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem('kf.tab') as Tab) || 'piano';
    } catch {
      return 'piano';
    }
  });
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const chrome = useMemo(() => ({ slot, setPlaying }), [slot]);

  const pick = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem('kf.tab', t);
    } catch {
      /* ignore */
    }
  };

  return (
    <ChromeContext.Provider value={chrome}>
      <div className={`app ${playing ? 'playing' : ''}`}>
        <header className="topbar">
          <div className="brand" aria-label="Key and Fiddle">
            <span className="brand-key">Key</span>
            <span className="brand-amp">&amp;</span>
            <span className="brand-fiddle">Fiddle</span>
          </div>
          <nav className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'piano'} className={tab === 'piano' ? 'on' : ''} onClick={() => pick('piano')}>
              🎹<span className="lbl"> Piano</span>
            </button>
            <button role="tab" aria-selected={tab === 'violin'} className={tab === 'violin' ? 'on' : ''} onClick={() => pick('violin')}>
              🎻<span className="lbl"> Violin</span>
            </button>
          </nav>
          <div className="subnav-slot" ref={setSlot} />
          <FullscreenButton className="btn small ghost fs-top" />
        </header>
        <main className="main">{tab === 'piano' ? <PianoTab /> : <ViolinTab />}</main>
      </div>
    </ChromeContext.Provider>
  );
}
