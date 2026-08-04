// Core domain model. Designed so Phase 2 (board BLE), Phase 3 (landing-point
// camera analysis) and Phase 4 (form analysis) can attach data without
// reshaping what already exists here.

export type ThrowSource =
  | 'manual'
  | 'board:granboard'
  | 'board:unicorn-eclipse'
  | 'board:dartslive-home'
  | 'board:phoenix'
  | 'camera';

/** A single dart landing. `segment` is 1-20, 25 (bull), or 0 (miss/off board). */
export interface DartThrow {
  segment: number;
  multiplier: 0 | 1 | 2 | 3;
  score: number;
  /** Normalized landing coordinates, -1..1, center = (0,0). Undefined if unknown. */
  x?: number;
  y?: number;
  source: ThrowSource;
  timestamp: string;
}

export type SkillCheckType =
  | 'around_the_clock'
  | 'bobs_27'
  | 'cricket_count_up'
  | 'game01'
  | 'grouping';

export interface SkillCheckMetrics {
  hitRate?: number;
  avgScorePerRound?: number;
  doubleSuccessRate?: number;
  tripleSuccessRate?: number;
  groupingSpreadMm?: number;
  groupingBiasX?: number;
  groupingBiasY?: number;
  threeDartAverage?: number;
  totalScore?: number;
  dartsThrown?: number;
  checkoutRate?: number;
  bustCount?: number;
  [key: string]: number | undefined;
}

export interface SkillCheckSession {
  id: string;
  playerId: string;
  type: SkillCheckType;
  startedAt: string;
  finishedAt?: string;
  throws: DartThrow[];
  config: Record<string, unknown>;
  metrics: SkillCheckMetrics;
  /** Placeholder link for Phase 3/4 camera analysis results. */
  cameraAnalysisRef?: string;
}

export interface Player {
  id: string;
  name: string;
  createdAt: string;
}

/** Manually entered external rating, e.g. DARTSLIVE / BA. */
export interface ExternalRatingEntry {
  id: string;
  playerId: string;
  system: string;
  value: number;
  date: string;
  note?: string;
}

export interface RatingSnapshot {
  id: string;
  playerId: string;
  date: string;
  internalRating: number | null;
  externalRatings: { system: string; value: number }[];
}

/** Per-throw form metrics derived from 3D pose landmarks (world-space
 * meters, camera-angle-invariant). Raw video/landmark frames are never
 * persisted, only these small numeric summaries. */
export interface FormThrowRecord {
  throwingArm: 'left' | 'right';
  elbowAngleAtReleaseDeg: number;
  wristJerkIndex: number;
  shoulderSwayMeters: number;
  hipSwayMeters: number;
}

export interface FormAnalysisSession {
  id: string;
  playerId: string;
  startedAt: string;
  finishedAt?: string;
  throws: FormThrowRecord[];
  consistency?: {
    elbowAngleStdDeg: number;
    jerkIndexAvg: number;
    shoulderSwayAvg: number;
    hipSwayAvg: number;
    stabilityScore: number;
  };
  tips: string[];
}
