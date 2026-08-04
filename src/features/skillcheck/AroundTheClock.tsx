import { useEffect, useState } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import { SkillCheckLayout } from '../../components/SkillCheckLayout';
import { SessionComplete } from './SessionComplete';
import { newSession, finishSession } from '../../lib/sessionStore';
import { rate } from '../../lib/metrics';
import type { DartThrow, SkillCheckMetrics, SkillCheckSession } from '../../types/domain';
import type { BoardHitResult } from '../../lib/dartboardGeometry';

const TARGETS = [...Array.from({ length: 20 }, (_, i) => i + 1), 25];

function replay(throws: DartThrow[]) {
  let targetIndex = 0;
  let currentAttempts = 0;
  for (const t of throws) {
    if (targetIndex >= TARGETS.length) break;
    const target = TARGETS[targetIndex];
    if (t.segment === target && t.segment !== 0) {
      targetIndex++;
      currentAttempts = 0;
    } else {
      currentAttempts++;
    }
  }
  return { targetIndex, currentAttempts };
}

export function AroundTheClock() {
  const { player } = usePlayer();
  const [session, setSession] = useState<SkillCheckSession | null>(null);
  useEffect(() => {
    if (player && !session) setSession(newSession(player.id, 'around_the_clock'));
  }, [player, session]);
  const [throws, setThrows] = useState<DartThrow[]>([]);
  const [metrics, setMetrics] = useState<SkillCheckMetrics | null>(null);

  if (!player || !session) return <p>読み込み中...</p>;

  const { targetIndex, currentAttempts } = replay(throws);
  const target = TARGETS[targetIndex];
  const finished = targetIndex >= TARGETS.length;

  async function handleHit(hit: BoardHitResult) {
    if (finished) return;
    const t: DartThrow = { ...hit, source: 'manual', timestamp: new Date().toISOString() };
    const nextThrows = [...throws, t];
    setThrows(nextThrows);

    const next = replay(nextThrows);
    if (next.targetIndex >= TARGETS.length) {
      const m: SkillCheckMetrics = {
        dartsThrown: nextThrows.length,
        hitRate: rate(TARGETS.length, nextThrows.length),
      };
      setMetrics(m);
      await finishSession(session!, nextThrows, m);
    }
  }

  function handleUndo() {
    setThrows((prev) => prev.slice(0, -1));
  }

  function restart() {
    window.location.reload();
  }

  if (metrics) {
    return <SessionComplete metrics={metrics} onRestart={restart} />;
  }

  return (
    <SkillCheckLayout
      title="Around the Clock"
      instructions={`現在のターゲット: ${target === 25 ? 'ブル' : target} — 番号の順に1周狙いましょう(マルチプライヤーは問いません)`}
      onHit={handleHit}
      highlightSegment={{ segment: target }}
      throws={throws}
      onUndo={handleUndo}
      statsPanel={
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">進捗</div>
            <div className="stat-card-value">{targetIndex} / {TARGETS.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">総投擲数</div>
            <div className="stat-card-value">{throws.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">現ターゲット試投数</div>
            <div className="stat-card-value">{currentAttempts}</div>
          </div>
        </div>
      }
    />
  );
}
