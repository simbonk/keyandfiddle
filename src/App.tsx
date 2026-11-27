import { useEffect, useMemo, useState } from 'react';
import { PianoTab } from './piano/PianoTab';
import { ChromeContext, FullscreenButton } from './ui/chrome';
import { Icon } from './ui/Icon';
import { ViolinTab } from './violin/ViolinTab';
import { GuitarTab } from './guitar/GuitarTab';

type Tab = 'piano' | 'violin' | 'guitar';
const TABS: Tab[] = ['piano', 'violin', 'guitar'];

const PHONE_Q = '(max-width: 600px) and (orientation: portrait)';
function usePhonePortrait() {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(PHONE_Q).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(PHONE_Q);
    const f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return on;
}

export function App() {
  const phone = usePhonePortrait();
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const t = localStorage.getItem('kf.tab') as Tab;
      return TABS.includes(t) ? t : 'piano';
    } catch {
      return 'piano';
    }
  });
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const chrome = useMemo(() => ({ slot, setPlaying }), [slot]);
  // the slot element changes when the phone turns; keep the ref current
  useEffect(() => setSlot((s) => (s && !s.isConnected ? null : s)), [phone]);

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
            <button
              role="tab"
              aria-selected={tab === 'piano'}
              className={tab === 'piano' ? 'on' : ''}
              onClick={() => pick('piano')}
            >
              <Icon name="piano" size={18} />
              <span className="lbl">Piano</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === 'violin'}
              className={tab === 'violin' ? 'on' : ''}
              onClick={() => pick('violin')}
            >
              <Icon name="violin" size={18} />
              <span className="lbl">Violin</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === 'guitar'}
              className={tab === 'guitar' ? 'on' : ''}
              onClick={() => pick('guitar')}
            >
              <Icon name="guitar" size={18} />
              <span className="lbl">Guitar</span>
            </button>
          </nav>
          {!phone && <div className="subnav-slot" ref={setSlot} />}
          <FullscreenButton className="btn small ghost fs-top" />
        </header>
        <main className="main">{tab === 'piano' ? <PianoTab /> : tab === 'violin' ? <ViolinTab /> : <GuitarTab />}</main>
        {phone && <nav className="tabbar" ref={setSlot} />}
      </div>
    </ChromeContext.Provider>
  );
}
