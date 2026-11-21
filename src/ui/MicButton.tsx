import { useState } from 'react';
import { MIC_BOOSTS, mic } from '../audio/mic';
import { useMicStatus } from '../audio/hooks';

/** Shows a big friendly "turn on the microphone" button until the mic is running. */
export function MicGate({ children, why }: { children: React.ReactNode; why?: string }) {
  const status = useMicStatus();
  if (status === 'running') return <>{children}</>;
  return (
    <div className="gate">
      <div className="gate-emoji">🎤</div>
      <h2>Let's listen!</h2>
      <p>{why ?? 'Key & Fiddle needs your microphone to hear you play.'}</p>
      <button className="btn big primary" onClick={() => mic.start()} disabled={status === 'starting'}>
        {status === 'starting' ? 'Asking…' : 'Turn on microphone'}
      </button>
      {status === 'denied' && (
        <p className="warn">
          The microphone is blocked. On iPad: Settings › Safari › Microphone › Allow, then reload this page.
        </p>
      )}
      {status === 'error' && (
        <p className="warn">
          {mic.error.startsWith('The microphone') ? mic.error : `Couldn't start the microphone: ${mic.error}`}
        </p>
      )}
    </div>
  );
}

export function LevelMeter({ level }: { level: number }) {
  const pct = Math.min(100, Math.sqrt(level) * 260);
  return (
    <div className="meter" aria-label="sound level">
      <div className="meter-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Mic sensitivity: iPad mics are quiet, so they start boosted. */
export function MicBoostSelect({ bare = false }: { bare?: boolean }) {
  const [boost, setBoost] = useState(mic.boost);
  const select = (
    <select
      value={boost}
      onChange={(e) => {
        mic.setBoost(Number(e.target.value));
        setBoost(mic.boost);
      }}
      aria-label="microphone boost"
    >
      {MIC_BOOSTS.map((b) => (
        <option key={b} value={b}>
          {b === 1 ? 'Off' : `${b}×`}
        </option>
      ))}
    </select>
  );
  if (bare) return select;
  return <label className="mic-boost muted small">🎤 Mic boost {select}</label>;
}
