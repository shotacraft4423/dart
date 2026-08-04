import { useEffect, useState } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import { SkillCheckLayout } from '../../components/SkillCheckLayout';
import { SessionComplete } from './SessionComplete';
import { newSession, finishSession } from '../../lib/sessionStore';
import { rate } from '../../lib/metrics';
import type { DartThrow, SkillCheckMetrics, SkillCheckSession } from '../../types/domain';
import type { BoardHitResult } from '../../lib/dartboardGeometry';

const NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);
const DARTS_PER_NUMBER = 3;

function replay(throws: DartThrow[]) {
  let score = 27;
  let totalDoubleHits = 0;
  let numberIndex = 0;
  let dartsThisNumber = 0;
  let doubleHitsThisNumber = 0;

  for (const t of throws) {
    if (numberIndex >= NUMBERS.length) break;
    const target = NUMBERS[numberIndex];
    if (t.segment === target && t.multiplier === 2) doubleHitsThisNumber++;
    dartsThisNumber++;

    if (dartsThisNumber >= DARTS_PER_NUMBER) {
      score += doubleHitsThisNumber > 0 ? target * 2 * doubleHitsThisNumber : -target;
      totalDoubleHits += doubleHitsThisNumber;
      numberIndex++;
      dartsThisNumber = 0;
      doubleHitsThisNumber = 0;
    }
  }

  return { score, totalDoubleHits, numberIndex, dartsThisNumber, doubleHitsThisNumber };
}

export function Bobs27() {
  const { player } = usePlayer();
  const [session, setSession] = useState<SkillCheckSession | null>(null);
  useEffect(() => {
    if (player && !session) setSession(newSession(player.id, 'bobs_27'));
  }, [player, session]);
  const [throws, setThrows] = useState<DartThrow[]>([]);
  const [metrics, setMetrics] = useState<SkillCheckMetrics | null>(null);

  if (!player || !session) return <p>読み込み中...</p>;

  const { score, numberIndex, dartsThisNumber } = replay(throws);
  const finished = numberIndex >= NUMBERS.length;
  const target = NUMBERS[numberIndex];

  async function handleHit(hit: BoardHitResult) {
    if (finished) return;
    const t: DartThrow = { ...hit, source: 'manual', timestamp: new Date().toISOString() };
    const nextThrows = [...throws, t];
    setThrows(nextThrows);

    const next = replay(nextThrows);
    if (next.numberIndex >= NUMBERS.length) {
      const m: SkillCheckMetrics = {
        totalScore: next.score,
        dartsThrown: nextThrows.length,
        doubleSuccessRate: rate(next.totalDoubleHits, NUMBERS.length * DARTS_PER_NUMBER),
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
      title="Bob's 27"
      instructions={`現在のターゲット: ダブル${target} — 27点からスタートし、ダブルを外すと減点されます`}
      onHit={handleHit}
      highlightSegment={{ segment: target, multiplier: 2 }}
      throws={throws}
      onUndo={handleUndo}
      statsPanel={
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">スコア</div>
            <div className="stat-card-value">{score}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">進捗</div>
            <div className="stat-card-value">{numberIndex} / {NUMBERS.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">このターゲット</div>
            <div className="stat-card-value">{dartsThisNumber} / {DARTS_PER_NUMBER}本</div>
          </div>
        </div>
      }
    />
  );
}
