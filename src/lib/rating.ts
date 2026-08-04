import type { SkillCheckSession, SkillCheckType } from '../types/domain';
import { skillCheckSessionRepo, externalRatingRepo, ratingSnapshotRepo } from '../db/database';
import { v4 as uuid } from 'uuid';

function latestOfType(sessions: SkillCheckSession[], type: SkillCheckType): SkillCheckSession | undefined {
  return sessions.find((s) => s.type === type && s.finishedAt);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Internal rating (1.00-20.00, loosely comparable in spirit to DARTSLIVE's
 * scale) blended from whichever skill-check categories the player has
 * completed at least once. Missing categories simply drop out of the
 * weighted average rather than dragging the score down, since a player may
 * not have run every template yet.
 */
export function computeInternalRating(sessions: SkillCheckSession[]): number | null {
  const components: { weight: number; score: number }[] = [];

  const game01 = latestOfType(sessions, 'game01');
  if (game01?.metrics.threeDartAverage !== undefined) {
    components.push({ weight: 0.4, score: clamp01((game01.metrics.threeDartAverage - 20) / 80) });
  }

  const bobs27 = latestOfType(sessions, 'bobs_27');
  if (bobs27?.metrics.doubleSuccessRate !== undefined) {
    components.push({ weight: 0.2, score: clamp01(bobs27.metrics.doubleSuccessRate) });
  }

  const cricket = latestOfType(sessions, 'cricket_count_up');
  if (cricket?.metrics.avgScorePerRound !== undefined) {
    components.push({ weight: 0.15, score: clamp01(cricket.metrics.avgScorePerRound / 90) });
  }

  const clock = latestOfType(sessions, 'around_the_clock');
  if (clock?.metrics.dartsThrown) {
    components.push({ weight: 0.15, score: clamp01(20 / clock.metrics.dartsThrown) });
  }

  const grouping = latestOfType(sessions, 'grouping');
  if (grouping?.metrics.groupingSpreadMm !== undefined) {
    components.push({ weight: 0.1, score: clamp01(1 - grouping.metrics.groupingSpreadMm / 100) });
  }

  if (components.length === 0) return null;

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weightedScore = components.reduce((sum, c) => sum + (c.weight / totalWeight) * c.score, 0);
  return Math.round((1 + weightedScore * 19) * 100) / 100;
}

export async function refreshRatingSnapshot(playerId: string): Promise<void> {
  const [sessions, externalRatings] = await Promise.all([
    skillCheckSessionRepo.listByPlayer(playerId),
    externalRatingRepo.listByPlayer(playerId),
  ]);

  const internalRating = computeInternalRating(sessions);

  const latestBySystem = new Map<string, number>();
  for (const entry of [...externalRatings].sort((a, b) => a.date.localeCompare(b.date))) {
    latestBySystem.set(entry.system, entry.value);
  }

  await ratingSnapshotRepo.put({
    id: uuid(),
    playerId,
    date: new Date().toISOString(),
    internalRating,
    externalRatings: [...latestBySystem.entries()].map(([system, value]) => ({ system, value })),
  });
}
