// Ring boundaries used to translate a click position into a segment/ring so
// the on-screen board can double as both a manual scorer and (in later
// phases) a stand-in for detected landing coordinates from camera analysis.
//
// These are deliberately NOT to-scale with a real board: a real double/
// triple ring is only ~4.7% of the board radius wide, which is too thin to
// click or tap reliably on screen. The bands below are widened for
// usability (this is a scoring input, not an aim-precision test) while
// staying visually plausible and keeping every boundary monotonically
// increasing from center to rim.

export const SEGMENT_ORDER = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const;

export const RADIUS_RATIO = {
  bullseye: 0.07,
  outerBull: 0.16,
  tripleInner: 0.5,
  tripleOuter: 0.62,
  doubleInner: 0.84,
  doubleOuter: 1,
};

export interface BoardHitResult {
  segment: number;
  multiplier: 0 | 1 | 2 | 3;
  score: number;
  x: number;
  y: number;
}

/**
 * Resolve a click into a dart hit.
 * @param x normalized x in [-1, 1], 0 = board center
 * @param y normalized y in [-1, 1], 0 = board center, -1 = top
 */
export function resolveHit(x: number, y: number): BoardHitResult {
  const r = Math.sqrt(x * x + y * y);

  if (r > RADIUS_RATIO.doubleOuter) {
    return { segment: 0, multiplier: 0, score: 0, x, y };
  }
  if (r <= RADIUS_RATIO.bullseye) {
    return { segment: 25, multiplier: 2, score: 50, x, y };
  }
  if (r <= RADIUS_RATIO.outerBull) {
    return { segment: 25, multiplier: 1, score: 25, x, y };
  }

  const angleDeg = (Math.atan2(x, -y) * 180) / Math.PI;
  const normalized = (angleDeg + 360) % 360;
  const index = Math.floor((normalized + 9) / 18) % 20;
  const segment = SEGMENT_ORDER[index];

  let multiplier: 0 | 1 | 2 | 3 = 1;
  if (r > RADIUS_RATIO.tripleInner && r <= RADIUS_RATIO.tripleOuter) {
    multiplier = 3;
  } else if (r > RADIUS_RATIO.doubleInner && r <= RADIUS_RATIO.doubleOuter) {
    multiplier = 2;
  }

  return { segment, multiplier, score: segment * multiplier, x, y };
}

/** Center point (angle, mid-radius) for a given segment+multiplier, used to draw target markers. */
export function segmentCenter(segment: number, multiplier: 0 | 1 | 2 | 3): { x: number; y: number } {
  if (segment === 25) {
    const r = multiplier === 2 ? RADIUS_RATIO.bullseye / 2 : (RADIUS_RATIO.bullseye + RADIUS_RATIO.outerBull) / 2;
    return { x: 0, y: -r };
  }
  const index = SEGMENT_ORDER.indexOf(segment as (typeof SEGMENT_ORDER)[number]);
  const angleDeg = index * 18;
  const angleRad = (angleDeg * Math.PI) / 180;
  let r: number;
  if (multiplier === 3) {
    r = (RADIUS_RATIO.tripleInner + RADIUS_RATIO.tripleOuter) / 2;
  } else if (multiplier === 2) {
    r = (RADIUS_RATIO.doubleInner + RADIUS_RATIO.doubleOuter) / 2;
  } else {
    r = (RADIUS_RATIO.outerBull + RADIUS_RATIO.tripleInner) / 2;
  }
  return { x: r * Math.sin(angleRad), y: -r * Math.cos(angleRad) };
}
