import { applyHomography, type Homography } from './homography';

export interface LandingDetection {
  x: number;
  y: number;
  confidence: number;
}

const DIFF_THRESHOLD = 40;
const SAMPLE_STEP = 3; // sample every Nth pixel for speed
const MAX_BOARD_RADIUS = 1.08; // slight margin outside the double ring

/**
 * Diffs two same-size frames (before/after a throw), keeping only changed
 * pixels that project inside the calibrated board area, and returns the
 * intensity-weighted centroid in normalized board space. Returns null when
 * not enough signal is found (no new dart detected, or camera moved).
 */
export function detectLandingPoint(before: ImageData, after: ImageData, homography: Homography): LandingDetection | null {
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error('detectLandingPoint requires equal-sized frames');
  }
  const { width, height, data: a } = before;
  const { data: b } = after;

  let sumX = 0;
  let sumY = 0;
  let sumWeight = 0;
  let changedPixels = 0;

  for (let py = 0; py < height; py += SAMPLE_STEP) {
    for (let px = 0; px < width; px += SAMPLE_STEP) {
      const idx = (py * width + px) * 4;
      const grayA = 0.299 * a[idx] + 0.587 * a[idx + 1] + 0.114 * a[idx + 2];
      const grayB = 0.299 * b[idx] + 0.587 * b[idx + 1] + 0.114 * b[idx + 2];
      const diff = Math.abs(grayA - grayB);
      if (diff < DIFF_THRESHOLD) continue;

      const [bx, by] = applyHomography(homography, px, py);
      if (Math.hypot(bx, by) > MAX_BOARD_RADIUS) continue;

      changedPixels++;
      sumWeight += diff;
      sumX += bx * diff;
      sumY += by * diff;
    }
  }

  if (sumWeight === 0 || changedPixels < 4) return null;

  const totalSamples = Math.ceil(width / SAMPLE_STEP) * Math.ceil(height / SAMPLE_STEP);
  const confidence = Math.min(1, changedPixels / (totalSamples * 0.02));

  return { x: sumX / sumWeight, y: sumY / sumWeight, confidence };
}

/** Draws a video frame or image element into a canvas and returns its ImageData. */
export function captureFrame(source: CanvasImageSource, width: number, height: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}
