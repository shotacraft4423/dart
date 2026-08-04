import { v4 as uuid } from 'uuid';
import type { DartThrow, SkillCheckMetrics, SkillCheckSession, SkillCheckType } from '../types/domain';
import { skillCheckSessionRepo } from '../db/database';

export function newSession(
  playerId: string,
  type: SkillCheckType,
  config: Record<string, unknown> = {},
): SkillCheckSession {
  return {
    id: uuid(),
    playerId,
    type,
    startedAt: new Date().toISOString(),
    throws: [],
    config,
    metrics: {},
  };
}

export async function finishSession(
  session: SkillCheckSession,
  throws: DartThrow[],
  metrics: SkillCheckMetrics,
): Promise<void> {
  const finished: SkillCheckSession = {
    ...session,
    throws,
    metrics,
    finishedAt: new Date().toISOString(),
  };
  await skillCheckSessionRepo.put(finished);
}
