import { useState } from 'react';
import { PianoTab } from './piano/PianoTab';
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
  const pick = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem('kf.tab', t);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-key">Key</span>
          <span className="brand-amp">&amp;</span>
          <span className="brand-fiddle">Fiddle</span>
        </div>
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'piano'} className={tab === 'piano' ? 'on' : ''} onClick={() => pick('piano')}>
            🎹 Piano
          </button>
          <button role="tab" aria-selected={tab === 'violin'} className={tab === 'violin' ? 'on' : ''} onClick={() => pick('violin')}>
            🎻 Violin
          </button>
        </nav>
      </header>
      <main className="main">{tab === 'piano' ? <PianoTab /> : <ViolinTab />}</main>
    </div>
  );
}
