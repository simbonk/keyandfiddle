// In-browser body + hand tracking with MediaPipe Tasks (runs on-device; no
// video leaves the iPad). Loaded lazily the first time the camera opens.

import type { HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM = '/mediapipe/wasm';
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export interface Pt {
  x: number;
  y: number;
}

export interface TrackFrame {
  t: number;
  /** Landmarks are mirrored (x flipped) so they match the selfie mirror view. Normalised 0..1. */
  pose: Pt[] | null;
  hands: Pt[][];
}

let loading: Promise<Tracker> | null = null;

export class Tracker {
  private constructor(
    private hand: HandLandmarker,
    private pose: PoseLandmarker,
  ) {}
  private lastPose: Pt[] | null = null;
  private frameNo = 0;
  private lastTs = 0;

  static load(): Promise<Tracker> {
    if (!loading) {
      loading = (async () => {
        const vision = await import('@mediapipe/tasks-vision');
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
        const make = async (delegate: 'GPU' | 'CPU') =>
          Promise.all([
            vision.HandLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: HAND_MODEL, delegate },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.4,
              minHandPresenceConfidence: 0.4,
              minTrackingConfidence: 0.4,
            }),
            vision.PoseLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: POSE_MODEL, delegate },
              runningMode: 'VIDEO',
              numPoses: 1,
            }),
          ]);
        let pair: [HandLandmarker, PoseLandmarker];
        try {
          pair = await make('GPU');
        } catch {
          pair = await make('CPU');
        }
        return new Tracker(pair[0], pair[1]);
      })();
      loading.catch(() => {
        loading = null;
      });
    }
    return loading;
  }

  detect(video: HTMLVideoElement): TrackFrame | null {
    if (video.readyState < 2 || !video.videoWidth) return null;
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    this.frameNo++;
    const flip = (l: { x: number; y: number }) => ({ x: 1 - l.x, y: l.y });
    const hr = this.hand.detectForVideo(video, ts);
    // Pose every other frame keeps things smooth on iPads.
    if (this.frameNo % 2 === 0 || !this.lastPose) {
      const pr = this.pose.detectForVideo(video, ts);
      this.lastPose = pr.landmarks[0] ? pr.landmarks[0].map(flip) : null;
    }
    return {
      t: ts,
      pose: this.lastPose,
      hands: hr.landmarks.map((h) => h.map(flip)),
    };
  }
}

// ---------------------------------------------------------------------------
// Demo mode (?arDemo in the URL): a synthetic player so the AR overlays can be
// previewed and developed without a camera or a real violinist.

function fakeHand(wrist: Pt, dir: Pt, side: Pt, size: number): Pt[] {
  const p = (a: number, s: number): Pt => ({
    x: wrist.x + dir.x * a * size + side.x * s * size,
    y: wrist.y + dir.y * a * size + side.y * s * size,
  });
  const pts: Pt[] = [p(0, 0)];
  // thumb 1-4
  pts.push(p(0.3, 0.35), p(0.55, 0.55), p(0.75, 0.65), p(0.95, 0.7));
  // fingers: index(5-8), middle(9-12), ring(13-16), pinky(17-20)
  const offs = [0.32, 0.1, -0.12, -0.32];
  const lens = [1, 1.08, 1, 0.8];
  offs.forEach((o, i) => {
    for (let j = 0; j < 4; j++) pts.push(p(1 + j * 0.32 * lens[i], o * (1 - j * 0.05)));
  });
  return pts;
}

export function demoFrame(tMs: number): TrackFrame {
  const P = (x: number, y: number): Pt => ({ x, y });
  const pose: Pt[] = new Array(33).fill(null).map(() => P(0.5, 0.28));
  pose[0] = P(0.47, 0.3); // nose, turned towards the violin
  pose[7] = P(0.43, 0.29);
  pose[8] = P(0.56, 0.29);
  pose[11] = P(0.39, 0.5); // left shoulder (screen-left in the mirror)
  pose[12] = P(0.61, 0.5);
  pose[13] = P(0.33, 0.66); // left elbow under the violin
  pose[15] = P(0.24, 0.45); // left wrist up by the neck
  const phase = (Math.sin((tMs / 3000) * Math.PI * 2) + 1) / 2; // 0..1 bow travel
  const rw = P(0.6 + phase * 0.14, 0.58 + phase * 0.02);
  pose[14] = P(0.72 + phase * 0.05, 0.7);
  pose[16] = rw;
  const left = fakeHand(P(0.24, 0.45), { x: 0.25, y: -0.97 }, { x: -0.97, y: -0.25 }, 0.045);
  const right = fakeHand(rw, { x: -0.3, y: 0.95 }, { x: -0.95, y: -0.3 }, 0.04);
  return { t: tMs, pose, hands: [left, right] };
}
