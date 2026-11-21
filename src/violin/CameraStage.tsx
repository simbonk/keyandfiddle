import { useEffect, useRef, useState } from 'react';
import { useAnimationCanvas } from '../ui/useAnimationCanvas';
import { Tracker, demoFrame, type Pt } from './tracking';
import { type Analysis, ViolinAnalyzer, coverMap } from './violinModel';

export type TrackStatus = 'off' | 'starting' | 'loading-ai' | 'running' | 'no-ai' | 'denied' | 'error';

interface Props {
  /** Draw on top of the mirrored camera. `a` is null when tracking isn't available. */
  draw: (ctx: CanvasRenderingContext2D, a: Analysis | null, w: number, h: number, now: number) => void;
  onAnalysis?: (a: Analysis) => void;
  ghost?: boolean;
  targetString?: number | null;
  analyzer: ViolinAnalyzer;
  pinning?: boolean;
  onPinned?: (ok: boolean) => void;
  children?: React.ReactNode;
  dim?: number;
  /** Show the whole camera frame (letterboxed) instead of filling the box. */
  contain?: boolean;
}

let sharedStream: MediaStream | null = null;
const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('arDemo');

export function CameraStage({ draw, onAnalysis, ghost = false, targetString, analyzer, pinning, onPinned, children, dim = 0, contain = false }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<TrackStatus>(sharedStream ? 'starting' : 'off');
  const tracker = useRef<Tracker | null>(null);
  const last = useRef<Analysis | null>(null);
  const lastDetect = useRef(0);
  const taps = useRef<Pt[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const map = useRef<(p: Pt) => Pt>((p) => p);

  const start = async () => {
    if (DEMO) {
      setStatus('running');
      return;
    }
    setStatus('starting');
    try {
      if (!sharedStream || !sharedStream.active) {
        sharedStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }
      const v = videoRef.current!;
      v.srcObject = sharedStream;
      await v.play().catch(() => undefined);
      setStatus('loading-ai');
      try {
        tracker.current = await Tracker.load();
        setStatus('running');
      } catch (e) {
        console.warn('tracking failed to load', e);
        setStatus('no-ai');
      }
    } catch (e) {
      const err = e as DOMException;
      setStatus(err?.name === 'NotAllowedError' ? 'denied' : 'error');
    }
  };

  // reattach if the camera was already granted in another view
  useEffect(() => {
    if (DEMO || (sharedStream && sharedStream.active)) start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    taps.current = [];
    setTapCount(0);
  }, [pinning]);

  const canvasRef = useAnimationCanvas((ctx, w, h, now) => {
    ctx.clearRect(0, 0, w, h);
    if (dim > 0) {
      ctx.fillStyle = `rgba(16,8,42,${dim})`;
      ctx.fillRect(0, 0, w, h);
    }
    const v = videoRef.current;
    if (DEMO && status === 'running') {
      map.current = coverMap(1280, 720, w, h, contain);
      ctx.fillStyle = '#2a2350';
      ctx.fillRect(0, 0, w, h);
      last.current = analyzer.analyze(demoFrame(now), map.current, ghost, targetString ?? undefined);
      onAnalysis?.(last.current);
    } else if (v && v.videoWidth) {
      // the video is mirrored with CSS, landmarks are mirrored in the tracker
      map.current = coverMap(v.videoWidth, v.videoHeight, w, h, contain);
      // ~25 detections per second is plenty and leaves CPU for audio
      if (tracker.current && status === 'running' && now - lastDetect.current > 38) {
        lastDetect.current = now;
        try {
          const f = tracker.current.detect(v);
          if (f) {
            last.current = analyzer.analyze(f, map.current, ghost, targetString ?? undefined);
            onAnalysis?.(last.current);
          }
        } catch (e) {
          console.warn(e);
        }
      }
    }
    draw(ctx, status === 'running' ? last.current : null, w, h, now);
    if (pinning) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = '800 24px "Baloo 2", system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(tapCount === 0 ? 'Tap where your CHIN rests on the violin' : 'Now tap the SCROLL (the curly end)', w / 2, 60);
      for (const t of taps.current) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd60a';
        ctx.fill();
      }
    }
  });

  const onTap = (e: React.PointerEvent) => {
    if (!pinning) return;
    const r = (e.target as HTMLElement).getBoundingClientRect();
    taps.current.push({ x: e.clientX - r.left, y: e.clientY - r.top });
    setTapCount(taps.current.length);
    if (taps.current.length === 2) {
      const ok = analyzer.pinFromTaps(last.current?.pose ?? null, taps.current[0], taps.current[1]);
      taps.current = [];
      setTapCount(0);
      onPinned?.(ok);
    }
  };

  return (
    <div className="camera-stage">
      <video ref={videoRef} className="camera-video" style={contain ? { objectFit: 'contain' } : undefined} playsInline muted />
      <canvas ref={canvasRef} className="camera-overlay" onPointerDown={onTap} />
      {status !== 'running' && (
        <div className={`camera-msg ${status === 'no-ai' || status === 'loading-ai' ? 'banner' : ''}`}>
          {status === 'off' && (
            <>
              <div className="gate-emoji">🪞</div>
              <p>The magic mirror uses your camera to see how you hold your violin. The video never leaves this device.</p>
              <button className="btn big primary" onClick={start}>
                Turn on camera
              </button>
            </>
          )}
          {status === 'starting' && <p>Starting camera…</p>}
          {status === 'loading-ai' && <p>Loading body tracking… (first time takes a few seconds)</p>}
          {status === 'no-ai' && <p className="small">Body tracking couldn't load, so guides are hidden. Check your internet connection.</p>}
          {status === 'denied' && <p className="warn">Camera is blocked. On iPad: Settings › Safari › Camera › Allow, then reload.</p>}
          {status === 'error' && <p className="warn">Couldn't start the camera.</p>}
        </div>
      )}
      {children}
    </div>
  );
}
