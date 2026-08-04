import type { ExternalRatingEntry, RatingSnapshot, SkillCheckSession, SkillCheckType } from '../types/domain';

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

/**
 * Builds the rating-over-time series directly from current sessions/external
 * ratings rather than a persisted log, so deleting a session or a rating
 * entry immediately and correctly disappears from the chart too instead of
 * leaving a stale historical point behind.
 */
export function buildRatingHistory(
  playerId: string,
  sessions: SkillCheckSession[],
  externalRatings: ExternalRatingEntry[],
): RatingSnapshot[] {
  const finishedSessions = [...sessions]
    .filter((s): s is SkillCheckSession & { finishedAt: string } => Boolean(s.finishedAt))
    .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt));
  const sortedExternal = [...externalRatings].sort((a, b) => a.date.localeCompare(b.date));

  const eventDates = [...new Set([...finishedSessions.map((s) => s.finishedAt), ...sortedExternal.map((e) => e.date)])].sort(
    (a, b) => a.localeCompare(b),
  );

  return eventDates.map((date, i) => {
    const sessionsUpToDate = finishedSessions.filter((s) => s.finishedAt <= date);
    const externalUpToDate = sortedExternal.filter((e) => e.date <= date);
    const latestBySystem = new Map<string, number>();
    for (const entry of externalUpToDate) latestBySystem.set(entry.system, entry.value);

    return {
      id: `derived-${i}`,
      playerId,
      date,
      internalRating: computeInternalRating(sessionsUpToDate),
      externalRatings: [...latestBySystem.entries()].map(([system, value]) => ({ system, value })),
    };
  });
}
