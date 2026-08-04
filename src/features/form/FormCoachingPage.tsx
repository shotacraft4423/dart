import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { usePlayer } from '../../context/PlayerContext';
import { formSessionRepo } from '../../db/database';
import {
  computeThrowMetrics,
  computeSessionConsistency,
  generateCoachingTips,
  type PoseFrame,
  type ThrowFormMetrics,
} from '../../lib/poseAnalysis';
import type { FormAnalysisSession } from '../../types/domain';

// Both the WASM runtime and the pose model are served locally (see
// public/mediapipe/) rather than from Google's CDN, so form analysis works
// fully offline after the initial page load and doesn't depend on external
// CDN availability. Using the "full" tier (not "lite") for better landmark
// accuracy — worth the larger download for a coaching tool that isn't
// latency-critical.
const MODEL_URL = '/mediapipe/models/pose_landmarker_full.task';
const WASM_BASE_URL = '/mediapipe/wasm';

// BlazePose 33-point indices. Shoulders/elbows/wrists/hips feed the actual
// form analysis (in 3D world coordinates); knees/ankles are drawn for a
// complete full-body skeleton but aren't otherwise analyzed.
const LM = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const ANALYZED_LANDMARKS = [
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftElbow,
  LM.rightElbow,
  LM.leftWrist,
  LM.rightWrist,
  LM.leftHip,
  LM.rightHip,
] as const;

const SKELETON_LINKS: [keyof typeof LM, keyof typeof LM][] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

type CameraState = 'checking' | 'unavailable' | 'live';
type PoseLoadState = 'loading' | 'ready' | 'error';

export function FormCoachingPage() {
  const { player } = usePlayer();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const framesRef = useRef<PoseFrame[]>([]);
  const recordingStartRef = useRef(0);

  const [cameraState, setCameraState] = useState<CameraState>('checking');
  const [poseLoadState, setPoseLoadState] = useState<PoseLoadState>('loading');
  const [poseError, setPoseError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [throws, setThrows] = useState<ThrowFormMetrics[]>([]);
  const [lastThrowNote, setLastThrowNote] = useState('');
  const [saved, setSaved] = useState(false);

  // Camera setup. A wider/taller ideal resolution than a typical webcam
  // default helps keep enough resolution on each joint once the user backs
  // up far enough for the whole body (needed now that hips are tracked) to
  // fit in frame.
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (overlayRef.current && videoRef.current) {
              overlayRef.current.width = videoRef.current.videoWidth;
              overlayRef.current.height = videoRef.current.videoHeight;
            }
            setCameraState('live');
          };
        }
      })
      .catch(() => {
        if (!cancelled) setCameraState('unavailable');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Pose model setup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        let landmarker: PoseLandmarker;
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        } catch {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numPoses: 1,
          });
        }
        if (cancelled) {
          landmarker.close();
          return;
        }
        poseLandmarkerRef.current = landmarker;
        setPoseLoadState('ready');
      } catch (err) {
        if (!cancelled) {
          setPoseLoadState('error');
          setPoseError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      poseLandmarkerRef.current?.close();
      poseLandmarkerRef.current = null;
    };
  }, []);

  // Detection + skeleton-draw loop
  useEffect(() => {
    if (cameraState !== 'live' || poseLoadState !== 'ready') return;

    const loop = () => {
      const video = videoRef.current;
      const landmarker = poseLandmarkerRef.current;
      const canvas = overlayRef.current;
      if (video && landmarker && canvas && video.readyState >= 2) {
        const result: PoseLandmarkerResult = landmarker.detectForVideo(video, performance.now());
        drawSkeleton(canvas, result);

        // Image-space landmarks drive the on-screen skeleton (they align
        // with video pixels); world landmarks (real-world meters, roughly
        // hip-centered) drive the actual analysis below since they stay
        // consistent regardless of the camera's viewing angle.
        const lm2d = result.landmarks[0];
        const world = result.worldLandmarks[0];
        if (recordingRef.current && lm2d && world) {
          const minVisibility = Math.min(...ANALYZED_LANDMARKS.map((i) => lm2d[i]?.visibility ?? 0));
          framesRef.current.push({
            t: performance.now() - recordingStartRef.current,
            minVisibility,
            leftShoulder: world[LM.leftShoulder],
            rightShoulder: world[LM.rightShoulder],
            leftElbow: world[LM.leftElbow],
            rightElbow: world[LM.rightElbow],
            leftWrist: world[LM.leftWrist],
            rightWrist: world[LM.rightWrist],
            leftHip: world[LM.leftHip],
            rightHip: world[LM.rightHip],
          });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cameraState, poseLoadState]);

  function drawSkeleton(canvas: HTMLCanvasElement, result: PoseLandmarkerResult) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const lm = result.landmarks[0];
    if (!lm) return;

    ctx.strokeStyle = '#2f6fed';
    ctx.lineWidth = 3;
    for (const [a, b] of SKELETON_LINKS) {
      const pa = lm[LM[a]];
      const pb = lm[LM[b]];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height);
      ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd23f';
    for (const key of Object.values(LM)) {
      const p = lm[key];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function toggleRecording() {
    if (!isRecording) {
      framesRef.current = [];
      recordingStartRef.current = performance.now();
      recordingRef.current = true;
      setIsRecording(true);
      setLastThrowNote('');
    } else {
      recordingRef.current = false;
      setIsRecording(false);
      const metrics = computeThrowMetrics(framesRef.current);
      if (!metrics) {
        setLastThrowNote(
          '記録が短すぎるか、体の一部が映っていない/隠れているため解析できませんでした。全身がカメラに映る位置でテイクバックからフォロースルーまで記録してください。',
        );
        return;
      }
      setThrows((prev) => [...prev, metrics]);
      setLastThrowNote(
        `記録完了(${metrics.throwingArm === 'right' ? '右腕' : '左腕'}、リリース時肘角度 ${metrics.elbowAngleAtReleaseDeg.toFixed(0)}°)`,
      );
    }
  }

  const consistency = computeSessionConsistency(throws);
  const tips = generateCoachingTips(throws, consistency);

  async function saveSession() {
    if (!player || throws.length === 0) return;
    const session: FormAnalysisSession = {
      id: crypto.randomUUID(),
      playerId: player.id,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      throws: throws.map((t) => ({
        throwingArm: t.throwingArm,
        elbowAngleAtReleaseDeg: t.elbowAngleAtReleaseDeg,
        wristJerkIndex: t.wristJerkIndex,
        shoulderSwayMeters: t.shoulderSwayMeters,
        hipSwayMeters: t.hipSwayMeters,
      })),
      consistency: consistency ?? undefined,
      tips,
    };
    await formSessionRepo.put(session);
    setSaved(true);
  }

  return (
    <div className="page">
      <h2>フォーム解析・コーチング</h2>
      <p className="page-lead">
        全身(肩から腰)がカメラに映る位置に立ち、「記録開始」→投球→「記録終了」を繰り返してください。MediaPipeの3D姿勢推定(ワールド座標)を使って解析するため、正面・横・斜めなどカメラの角度が変わっても、肘の角度や体のブレは同じ基準で評価されます。リリース時の肘の角度・動きの滑らかさ・上半身/下半身のブレから安定性を評価します。映像はブラウザ内でのみ処理され、保存されるのは数値の要約のみです。
      </p>

      {cameraState === 'unavailable' && <p className="camera-warning">カメラを利用できませんでした(権限が拒否されたか、非対応の環境です)。</p>}
      {poseLoadState === 'error' && (
        <p className="camera-warning">姿勢推定モデルの読み込みに失敗しました({poseError})。ネットワーク環境をご確認ください。</p>
      )}

      <div className="camera-body">
        <div className="camera-preview" style={{ aspectRatio: '4 / 3' }}>
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
          <canvas ref={overlayRef} className="camera-overlay" style={{ pointerEvents: 'none' }} />
        </div>

        <div className="skillcheck-side">
          <div className="stat-card">
            <div className="stat-card-label">状態</div>
            <div className="stat-card-value" style={{ fontSize: 16 }}>
              {cameraState !== 'live' ? 'カメラ準備中...' : poseLoadState !== 'ready' ? 'モデル読み込み中...' : isRecording ? '記録中...' : '記録可能'}
            </div>
          </div>

          <div className="camera-actions">
            <button
              className={isRecording ? 'btn-primary' : 'btn-secondary'}
              onClick={toggleRecording}
              disabled={cameraState !== 'live' || poseLoadState !== 'ready'}
            >
              {isRecording ? 'この投球の記録を終了' : '投球の記録を開始'}
            </button>
            <button className="btn-secondary" onClick={saveSession} disabled={throws.length === 0 || saved}>
              {saved ? '保存済み' : `セッションを保存(${throws.length}投)`}
            </button>
          </div>

          {lastThrowNote && <p className="camera-status">{lastThrowNote}</p>}

          {throws.length > 0 && (
            <div className="throw-log-panel">
              <h3>コーチングTips</h3>
              <ul className="throw-log">
                {tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
              {consistency && (
                <p className="camera-confidence" style={{ marginTop: 8 }}>
                  安定性スコア: {(consistency.stabilityScore * 100).toFixed(0)}%
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
