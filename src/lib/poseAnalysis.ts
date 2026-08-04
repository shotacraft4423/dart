// Pure, MediaPipe-independent analysis of a throwing motion captured as a
// short sequence of pose landmark frames. Kept separate from the camera/
// MediaPipe integration so it can be unit-tested with synthetic landmark
// data and reused if the pose source changes later.
//
// Landmarks are expected in MediaPipe's "world" coordinate space (real-world
// meters, roughly hip-centered) rather than the raw image-space (x, y)
// projection. World coordinates are computed by MediaPipe from its 3D pose
// estimate and are largely invariant to camera position/angle, so an elbow
// angle or a sway distance means the same thing whether the camera is
// filming from the front, the side, or somewhere in between — a 2D
// image-space angle would instead change with viewing angle even for an
// identical real throw.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One video frame's worth of tracked landmarks, in world-space meters. */
export interface PoseFrame {
  t: number; // ms since recording start
  /** Lowest per-landmark detection confidence among the tracked joints this frame. */
  minVisibility: number;
  leftShoulder: Vec3;
  rightShoulder: Vec3;
  leftElbow: Vec3;
  rightElbow: Vec3;
  leftWrist: Vec3;
  rightWrist: Vec3;
  leftHip: Vec3;
  rightHip: Vec3;
}

export type Arm = 'left' | 'right';

export interface ThrowFormMetrics {
  throwingArm: Arm;
  releaseFrameIndex: number;
  elbowAngleAtReleaseDeg: number;
  wristJerkIndex: number;
  shoulderSwayMeters: number;
  hipSwayMeters: number;
  frameCount: number;
}

export interface SessionConsistency {
  elbowAngleStdDeg: number;
  jerkIndexAvg: number;
  shoulderSwayAvg: number;
  hipSwayAvg: number;
  stabilityScore: number; // 0-1, higher = more consistent/stable
}

// Frames where MediaPipe's confidence in the tracked joints drops below this
// are dropped before analysis rather than letting noisy/occluded estimates
// corrupt release-point detection or the sway/jerk math.
const MIN_VISIBILITY = 0.5;

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function angleDeg(a: Vec3, b: Vec3, c: Vec3): number {
  const abx = a.x - b.x, aby = a.y - b.y, abz = a.z - b.z;
  const cbx = c.x - b.x, cby = c.y - b.y, cbz = c.z - b.z;
  const dot = abx * cbx + aby * cby + abz * cbz;
  const magA = Math.hypot(abx, aby, abz);
  const magC = Math.hypot(cbx, cby, cbz);
  if (magA === 0 || magC === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magA * magC)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = average(values);
  return Math.sqrt(average(values.map((v) => (v - m) ** 2)));
}

/** Average distance of each sample from the centroid of all samples (3D spread). */
function spread3D(points: Vec3[]): number {
  if (points.length < 2) return 0;
  const mean: Vec3 = {
    x: average(points.map((p) => p.x)),
    y: average(points.map((p) => p.y)),
    z: average(points.map((p) => p.z)),
  };
  return average(points.map((p) => dist(p, mean)));
}

function wrist(frame: PoseFrame, arm: Arm): Vec3 {
  return arm === 'right' ? frame.rightWrist : frame.leftWrist;
}
function elbow(frame: PoseFrame, arm: Arm): Vec3 {
  return arm === 'right' ? frame.rightElbow : frame.leftElbow;
}
function shoulder(frame: PoseFrame, arm: Arm): Vec3 {
  return arm === 'right' ? frame.rightShoulder : frame.leftShoulder;
}
function hip(frame: PoseFrame, arm: Arm): Vec3 {
  return arm === 'right' ? frame.rightHip : frame.leftHip;
}

/** The wrist that moved the most during the window is assumed to be the throwing arm. */
function detectThrowingArm(frames: PoseFrame[]): Arm {
  let leftTravel = 0;
  let rightTravel = 0;
  for (let i = 1; i < frames.length; i++) {
    leftTravel += dist(frames[i].leftWrist, frames[i - 1].leftWrist);
    rightTravel += dist(frames[i].rightWrist, frames[i - 1].rightWrist);
  }
  return rightTravel >= leftTravel ? 'right' : 'left';
}

/**
 * Analyzes one throwing motion window. `frames` should span roughly the
 * takeback-through-follow-through of a single throw (a few hundred ms to a
 * couple seconds at typical webcam frame rates).
 */
export function computeThrowMetrics(frames: PoseFrame[]): ThrowFormMetrics | null {
  const reliable = frames.filter((f) => f.minVisibility >= MIN_VISIBILITY);
  if (reliable.length < 4) return null;
  const throwingArm = detectThrowingArm(reliable);

  // Release ~= the frame with peak wrist speed.
  let releaseFrameIndex = 1;
  let peakSpeed = -Infinity;
  const speeds: number[] = [0];
  for (let i = 1; i < reliable.length; i++) {
    const dt = Math.max(1, reliable[i].t - reliable[i - 1].t);
    const speed = dist(wrist(reliable[i], throwingArm), wrist(reliable[i - 1], throwingArm)) / dt;
    speeds.push(speed);
    if (speed > peakSpeed) {
      peakSpeed = speed;
      releaseFrameIndex = i;
    }
  }

  const releaseFrame = reliable[releaseFrameIndex];
  const elbowAngleAtReleaseDeg = angleDeg(shoulder(releaseFrame, throwingArm), elbow(releaseFrame, throwingArm), wrist(releaseFrame, throwingArm));

  // Jerk index: mean absolute change in speed between consecutive samples,
  // normalized by peak speed so it's comparable across recordings/distances.
  let jerkSum = 0;
  for (let i = 1; i < speeds.length; i++) jerkSum += Math.abs(speeds[i] - speeds[i - 1]);
  const wristJerkIndex = peakSpeed > 0 ? jerkSum / speeds.length / peakSpeed : 0;

  // Sway: how much the non-throwing-side shoulder/hip drift in world space
  // (meters) — a stable stance/upper body should barely move during a throw.
  const stationaryArm: Arm = throwingArm === 'right' ? 'left' : 'right';
  const shoulderSwayMeters = spread3D(reliable.map((f) => shoulder(f, stationaryArm)));
  const hipSwayMeters = spread3D(reliable.map((f) => hip(f, stationaryArm)));

  return {
    throwingArm,
    releaseFrameIndex,
    elbowAngleAtReleaseDeg,
    wristJerkIndex,
    shoulderSwayMeters,
    hipSwayMeters,
    frameCount: reliable.length,
  };
}

export function computeSessionConsistency(throws: ThrowFormMetrics[]): SessionConsistency | null {
  if (throws.length === 0) return null;
  const elbowAngleStdDeg = stdev(throws.map((t) => t.elbowAngleAtReleaseDeg));
  const jerkIndexAvg = average(throws.map((t) => t.wristJerkIndex));
  const shoulderSwayAvg = average(throws.map((t) => t.shoulderSwayMeters));
  const hipSwayAvg = average(throws.map((t) => t.hipSwayMeters));

  // Heuristic 0-1 stability score: penalize release-angle spread, jerkiness,
  // and shoulder/hip sway (world-space meters, so thresholds are absolute
  // physical distances rather than screen-relative fractions).
  const angleScore = Math.max(0, 1 - elbowAngleStdDeg / 25);
  const jerkScore = Math.max(0, 1 - jerkIndexAvg / 0.6);
  const shoulderScore = Math.max(0, 1 - shoulderSwayAvg / 0.05);
  const hipScore = Math.max(0, 1 - hipSwayAvg / 0.03);
  const stabilityScore = (angleScore + jerkScore + shoulderScore + hipScore) / 4;

  return { elbowAngleStdDeg, jerkIndexAvg, shoulderSwayAvg, hipSwayAvg, stabilityScore };
}

export function generateCoachingTips(throws: ThrowFormMetrics[], consistency: SessionConsistency | null): string[] {
  const tips: string[] = [];
  if (!consistency || throws.length === 0) return tips;

  if (throws.length < 3) {
    tips.push('記録が少ないため参考値です。3投以上記録すると精度が上がります。');
  }
  if (consistency.elbowAngleStdDeg > 15) {
    tips.push(`リリース時の肘の角度のばらつきが大きめです(標準偏差 ${consistency.elbowAngleStdDeg.toFixed(1)}°)。毎回同じ高さ・角度でリリースすることを意識しましょう。`);
  }
  if (consistency.jerkIndexAvg > 0.4) {
    tips.push('テイクバックからリリースまでの動きにぎこちなさが見られます。一定のリズムでゆっくり振る素振り練習が効果的です。');
  }
  if (consistency.shoulderSwayAvg > 0.04) {
    tips.push(`投球中に上半身(軸)がブレる傾向があります(平均${(consistency.shoulderSwayAvg * 100).toFixed(1)}cm)。反対の肩を固定する意識を持つと安定します。`);
  }
  if (consistency.hipSwayAvg > 0.025) {
    tips.push(`投球中に下半身(スタンス)が動いてしまっています(平均${(consistency.hipSwayAvg * 100).toFixed(1)}cm)。足の位置と体重移動を固定する意識を持ちましょう。`);
  }
  if (tips.length === 0) {
    tips.push('フォームは安定しています。この調子を維持しましょう。');
  }
  return tips;
}
