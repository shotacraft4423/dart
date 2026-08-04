// Pure, MediaPipe-independent analysis of a throwing motion captured as a
// short sequence of pose landmark frames. Kept separate from the camera/
// MediaPipe integration so it can be unit-tested with synthetic landmark
// data and reused if the pose source changes later.

export interface Vec2 {
  x: number;
  y: number;
}

/** One video frame's worth of tracked upper-body landmarks (normalized 0-1 image space). */
export interface PoseFrame {
  t: number; // ms since recording start
  leftShoulder: Vec2;
  rightShoulder: Vec2;
  leftElbow: Vec2;
  rightElbow: Vec2;
  leftWrist: Vec2;
  rightWrist: Vec2;
}

export type Arm = 'left' | 'right';

export interface ThrowFormMetrics {
  throwingArm: Arm;
  releaseFrameIndex: number;
  elbowAngleAtReleaseDeg: number;
  wristJerkIndex: number;
  shoulderSwayNormalized: number;
  frameCount: number;
}

export interface SessionConsistency {
  elbowAngleStdDeg: number;
  jerkIndexAvg: number;
  shoulderSwayAvg: number;
  stabilityScore: number; // 0-1, higher = more consistent/stable
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDeg(a: Vec2, b: Vec2, c: Vec2): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magA = Math.hypot(abx, aby);
  const magC = Math.hypot(cbx, cby);
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

function wrist(frame: PoseFrame, arm: Arm): Vec2 {
  return arm === 'right' ? frame.rightWrist : frame.leftWrist;
}
function elbow(frame: PoseFrame, arm: Arm): Vec2 {
  return arm === 'right' ? frame.rightElbow : frame.leftElbow;
}
function shoulder(frame: PoseFrame, arm: Arm): Vec2 {
  return arm === 'right' ? frame.rightShoulder : frame.leftShoulder;
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
  if (frames.length < 4) return null;
  const throwingArm = detectThrowingArm(frames);

  // Release ~= the frame with peak wrist speed.
  let releaseFrameIndex = 1;
  let peakSpeed = -Infinity;
  const speeds: number[] = [0];
  for (let i = 1; i < frames.length; i++) {
    const dt = Math.max(1, frames[i].t - frames[i - 1].t);
    const speed = dist(wrist(frames[i], throwingArm), wrist(frames[i - 1], throwingArm)) / dt;
    speeds.push(speed);
    if (speed > peakSpeed) {
      peakSpeed = speed;
      releaseFrameIndex = i;
    }
  }

  const releaseFrame = frames[releaseFrameIndex];
  const elbowAngleAtReleaseDeg = angleDeg(shoulder(releaseFrame, throwingArm), elbow(releaseFrame, throwingArm), wrist(releaseFrame, throwingArm));

  // Jerk index: mean absolute change in speed between consecutive samples,
  // normalized by peak speed so it's comparable across recordings/distances.
  let jerkSum = 0;
  for (let i = 1; i < speeds.length; i++) jerkSum += Math.abs(speeds[i] - speeds[i - 1]);
  const wristJerkIndex = peakSpeed > 0 ? jerkSum / speeds.length / peakSpeed : 0;

  // Shoulder sway: how much the non-throwing-side shoulder position drifts,
  // normalized by shoulder width so it's independent of distance to camera.
  const shoulderWidth = average(frames.map((f) => dist(f.leftShoulder, f.rightShoulder))) || 1;
  const stationaryArm: Arm = throwingArm === 'right' ? 'left' : 'right';
  const shoulderXs = frames.map((f) => shoulder(f, stationaryArm).x);
  const shoulderYs = frames.map((f) => shoulder(f, stationaryArm).y);
  const shoulderSwayNormalized = (stdev(shoulderXs) + stdev(shoulderYs)) / shoulderWidth;

  return {
    throwingArm,
    releaseFrameIndex,
    elbowAngleAtReleaseDeg,
    wristJerkIndex,
    shoulderSwayNormalized,
    frameCount: frames.length,
  };
}

export function computeSessionConsistency(throws: ThrowFormMetrics[]): SessionConsistency | null {
  if (throws.length === 0) return null;
  const elbowAngleStdDeg = stdev(throws.map((t) => t.elbowAngleAtReleaseDeg));
  const jerkIndexAvg = average(throws.map((t) => t.wristJerkIndex));
  const shoulderSwayAvg = average(throws.map((t) => t.shoulderSwayNormalized));

  // Heuristic 0-1 stability score: penalize release-angle spread, jerkiness, and shoulder sway.
  const angleScore = Math.max(0, 1 - elbowAngleStdDeg / 25);
  const jerkScore = Math.max(0, 1 - jerkIndexAvg / 0.6);
  const swayScore = Math.max(0, 1 - shoulderSwayAvg / 0.15);
  const stabilityScore = (angleScore + jerkScore + swayScore) / 3;

  return { elbowAngleStdDeg, jerkIndexAvg, shoulderSwayAvg, stabilityScore };
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
  if (consistency.shoulderSwayAvg > 0.12) {
    tips.push('投球中に上半身(軸)がブレる傾向があります。反対の肩を固定する意識を持つと安定します。');
  }
  if (tips.length === 0) {
    tips.push('フォームは安定しています。この調子を維持しましょう。');
  }
  return tips;
}
