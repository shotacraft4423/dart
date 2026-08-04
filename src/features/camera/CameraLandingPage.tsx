import { useEffect, useRef, useState } from 'react';
import { DartBoard, type BoardMarker } from '../../components/DartBoard';
import { computeHomography, type Homography, type Point } from '../../lib/homography';
import { captureFrame, detectLandingPoint } from '../../lib/frameDiff';
import { resolveHit } from '../../lib/dartboardGeometry';

// The 4 outer-rim reference points used for calibration, in the same
// normalized board space DartBoard/resolveHit use (top/right/bottom/left of
// the double ring, assuming the board hangs in standard orientation).
const CALIBRATION_TARGETS: { label: string; point: Point }[] = [
  { label: '盤面の一番上(トリプル/ダブルの外周上端)', point: [0, -1] },
  { label: '盤面の一番右', point: [1, 0] },
  { label: '盤面の一番下', point: [0, 1] },
  { label: '盤面の一番左', point: [-1, 0] },
];

type CameraState = 'checking' | 'unavailable' | 'live';

interface DetectedThrow {
  x: number;
  y: number;
  segment: number;
  multiplier: 0 | 1 | 2 | 3;
  score: number;
  confidence: number;
}

export function CameraLandingPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [sourceMode, setSourceMode] = useState<'camera' | 'upload'>('camera');
  const [cameraState, setCameraState] = useState<CameraState>('checking');
  const [videoSize, setVideoSize] = useState({ width: 640, height: 480 });

  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);

  const [calibrationPoints, setCalibrationPoints] = useState<Point[]>([]);
  const [homography, setHomography] = useState<Homography | null>(null);
  const [baseline, setBaseline] = useState<ImageData | null>(null);
  const [throws, setThrows] = useState<DetectedThrow[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('');

  useEffect(() => {
    if (sourceMode !== 'camera') return;
    let cancelled = false;
    setCameraState('checking');
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setVideoSize({ width: videoRef.current!.videoWidth, height: videoRef.current!.videoHeight });
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
  }, [sourceMode]);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#ffd23f';
    calibrationPoints.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '16px sans-serif';
      ctx.fillText(String(i + 1), x + 10, y - 10);
    });
  }, [calibrationPoints, videoSize]);

  function resetCalibration() {
    setCalibrationPoints([]);
    setHomography(null);
    setBaseline(null);
    setThrows([]);
    setStatusMessage('');
  }

  function currentSourceElement(): CanvasImageSource | null {
    if (sourceMode === 'camera') return videoRef.current;
    return uploadedImage;
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (homography || calibrationPoints.length >= 4) return;
    const canvas = overlayRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * videoSize.width;
    const py = ((e.clientY - rect.top) / rect.height) * videoSize.height;
    const nextPoints: Point[] = [...calibrationPoints, [px, py]];
    setCalibrationPoints(nextPoints);

    if (nextPoints.length === 4) {
      const dst = CALIBRATION_TARGETS.map((t) => t.point);
      try {
        setHomography(computeHomography(nextPoints, dst));
        setStatusMessage('キャリブレーション完了。基準フレームを撮影してください。');
      } catch {
        setStatusMessage('キャリブレーションに失敗しました。4点をやり直してください。');
        setCalibrationPoints([]);
      }
    }
  }

  function captureBaseline() {
    const source = currentSourceElement();
    if (!source || !homography) return;
    setBaseline(captureFrame(source, videoSize.width, videoSize.height));
    setStatusMessage('基準フレームを撮影しました。ダーツを投げたら撮影・検出してください。');
  }

  function captureAndDetect() {
    const source = currentSourceElement();
    if (!source || !homography || !baseline) return;
    const after = captureFrame(source, videoSize.width, videoSize.height);
    const detection = detectLandingPoint(baseline, after, homography);
    if (!detection) {
      setStatusMessage('着弾を検出できませんでした。もう少しはっきり動きが出るように撮影してください。');
      return;
    }
    const hit = resolveHit(detection.x, detection.y);
    setThrows((prev) => [...prev, { ...hit, confidence: detection.confidence }]);
    setBaseline(after);
    setStatusMessage(`検出: ${hit.segment === 0 ? 'ミス' : `${hit.multiplier === 3 ? 'T' : hit.multiplier === 2 ? 'D' : 'S'}${hit.segment}`} (信頼度 ${Math.round(detection.confidence * 100)}%)`);
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const isFirstCalibrationImage = !homography;
    img.onload = () => {
      // Only the first (calibration) upload resets state and defines the
      // working resolution; later "after throw" uploads reuse the same
      // homography/baseline and get scaled to match by captureFrame.
      if (isFirstCalibrationImage) {
        setVideoSize({ width: img.naturalWidth, height: img.naturalHeight });
        resetCalibration();
      }
      setUploadedImage(img);
    };
    img.src = URL.createObjectURL(file);
  }

  const markers: BoardMarker[] = throws.map((t) => ({ x: t.x, y: t.y, color: '#2f6fed' }));
  const nextCalibrationLabel = CALIBRATION_TARGETS[calibrationPoints.length]?.label;

  return (
    <div className="page">
      <h2>カメラで着弾点解析</h2>
      <p className="page-lead">
        ボード全体が映るようにカメラ(またはアップロード画像)を設置し、外周の上下左右4点をキャリブレーションしてから、投擲前後の画像を比較して着弾位置を検出します。
      </p>

      <div className="camera-mode-toggle">
        <button className={sourceMode === 'camera' ? 'btn-primary' : 'btn-secondary'} onClick={() => { setSourceMode('camera'); resetCalibration(); }}>
          カメラを使う
        </button>
        <button className={sourceMode === 'upload' ? 'btn-primary' : 'btn-secondary'} onClick={() => { setSourceMode('upload'); resetCalibration(); }}>
          画像をアップロードして試す
        </button>
      </div>

      {sourceMode === 'camera' && cameraState === 'unavailable' && (
        <p className="camera-warning">カメラを利用できませんでした(権限が拒否されたか、非対応の環境です)。「画像をアップロードして試す」をご利用ください。</p>
      )}

      {sourceMode === 'upload' && (
        <div className="camera-upload-row">
          <label className="btn-secondary">
            {baseline ? '投げた後の画像をアップロード' : '基準画像をアップロード'}
            <input type="file" accept="image/*" onChange={handleUpload} hidden />
          </label>
        </div>
      )}

      <div className="camera-body">
        <div className="camera-preview" style={{ aspectRatio: `${videoSize.width} / ${videoSize.height}` }}>
          {sourceMode === 'camera' && <video ref={videoRef} autoPlay playsInline muted className="camera-video" />}
          {sourceMode === 'upload' && uploadedImage && (
            <img src={uploadedImage.src} alt="アップロード画像" className="camera-video" />
          )}
          <canvas
            ref={overlayRef}
            width={videoSize.width}
            height={videoSize.height}
            className="camera-overlay"
            onClick={handleOverlayClick}
          />
        </div>

        <div className="skillcheck-side">
          <div className="stat-card">
            <div className="stat-card-label">状態</div>
            <div className="stat-card-value" style={{ fontSize: 16 }}>
              {!homography
                ? calibrationPoints.length < 4
                  ? `キャリブレーション中(${calibrationPoints.length}/4)`
                  : 'キャリブレーション完了'
                : !baseline
                  ? '基準フレーム待ち'
                  : '検出可能'}
            </div>
            {!homography && nextCalibrationLabel && (
              <div className="stat-card-hint">次にクリック: {nextCalibrationLabel}</div>
            )}
          </div>

          <div className="camera-actions">
            {homography && (
              <button className="btn-secondary" onClick={captureBaseline}>
                基準フレームを撮影
              </button>
            )}
            {homography && baseline && (
              <button className="btn-primary" onClick={captureAndDetect}>
                {sourceMode === 'camera' ? '撮影して検出' : 'アップロード画像で検出'}
              </button>
            )}
            <button className="btn-secondary" onClick={resetCalibration}>
              キャリブレーションをやり直す
            </button>
          </div>

          {statusMessage && <p className="camera-status">{statusMessage}</p>}

          <div className="throw-log-panel">
            <h3>検出結果</h3>
            {throws.length === 0 ? (
              <p className="throw-log-empty">まだ検出結果がありません。</p>
            ) : (
              <ul className="throw-log">
                {[...throws].reverse().map((t, i) => (
                  <li key={i}>
                    {t.segment === 0 ? 'ミス' : `${t.multiplier === 3 ? 'T' : t.multiplier === 2 ? 'D' : 'S'}${t.segment} (${t.score})`}
                    {' '}
                    <span className="camera-confidence">信頼度{Math.round(t.confidence * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="skillcheck-board" style={{ maxWidth: 340 }}>
        <DartBoard markers={markers} disabled />
      </div>
    </div>
  );
}
