import { useEffect, useState } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import { SkillCheckLayout } from '../../components/SkillCheckLayout';
import { SessionComplete } from './SessionComplete';
import { newSession, finishSession } from '../../lib/sessionStore';
import { rate } from '../../lib/metrics';
import type { DartThrow, SkillCheckMetrics, SkillCheckSession } from '../../types/domain';
import type { BoardHitResult } from '../../lib/dartboardGeometry';

const CRICKET_NUMBERS = new Set([20, 19, 18, 17, 16, 15, 25]);
const TOTAL_ROUNDS = 15;
const DARTS_PER_ROUND = 3;
const TOTAL_DARTS = TOTAL_ROUNDS * DARTS_PER_ROUND;

function replay(throws: DartThrow[]): { score: number; cricketHits: number } {
  let score = 0;
  let cricketHits = 0;
  for (const t of throws) {
    if (CRICKET_NUMBERS.has(t.segment)) {
      score += t.score;
      cricketHits += 1;
    }
  }
  return { score, cricketHits };
}

export function CricketCountUp() {
  const { player } = usePlayer();
  const [session, setSession] = useState<SkillCheckSession | null>(null);
  useEffect(() => {
    if (player && !session) setSession(newSession(player.id, 'cricket_count_up'));
  }, [player, session]);
  const [throws, setThrows] = useState<DartThrow[]>([]);
  const [metrics, setMetrics] = useState<SkillCheckMetrics | null>(null);

  if (!player || !session) return <p>読み込み中...</p>;

  const finished = throws.length >= TOTAL_DARTS;
  const round = Math.min(Math.floor(throws.length / DARTS_PER_ROUND) + 1, TOTAL_ROUNDS);
  const { score } = replay(throws);

  async function handleHit(hit: BoardHitResult) {
    if (finished) return;
    const t: DartThrow = { ...hit, source: 'manual', timestamp: new Date().toISOString() };
    const nextThrows = [...throws, t];
    setThrows(nextThrows);

    if (nextThrows.length >= TOTAL_DARTS) {
      const { score: finalScore, cricketHits: finalHits } = replay(nextThrows);
      const m: SkillCheckMetrics = {
        totalScore: finalScore,
        dartsThrown: nextThrows.length,
        avgScorePerRound: finalScore / TOTAL_ROUNDS,
        hitRate: rate(finalHits, TOTAL_DARTS),
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
      title="Cricket Count-up"
      instructions="20・19・18・17・16・15・ブルのみが得点対象です。15ラウンド(45投)で合計得点を競います"
      onHit={handleHit}
      throws={throws}
      onUndo={handleUndo}
      statsPanel={
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">合計スコア</div>
            <div className="stat-card-value">{score}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">ラウンド</div>
            <div className="stat-card-value">{round} / {TOTAL_ROUNDS}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">総投擲数</div>
            <div className="stat-card-value">{throws.length} / {TOTAL_DARTS}</div>
          </div>
        </div>
      }
    />
  );
}
