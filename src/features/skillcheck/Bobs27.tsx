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

export function Bobs27() {
  const { player } = usePlayer();
  const [session, setSession] = useState<SkillCheckSession | null>(null);
  useEffect(() => {
    if (player && !session) setSession(newSession(player.id, 'bobs_27'));
  }, [player, session]);
  const [throws, setThrows] = useState<DartThrow[]>([]);
  const [numberIndex, setNumberIndex] = useState(0);
  const [dartsThisNumber, setDartsThisNumber] = useState(0);
  const [doubleHitsThisNumber, setDoubleHitsThisNumber] = useState(0);
  const [score, setScore] = useState(27);
  const [totalDoubleHits, setTotalDoubleHits] = useState(0);
  const [metrics, setMetrics] = useState<SkillCheckMetrics | null>(null);

  if (!player || !session) return <p>読み込み中...</p>;

  const finished = numberIndex >= NUMBERS.length;
  const target = NUMBERS[numberIndex];

  async function handleHit(hit: BoardHitResult) {
    if (finished) return;
    const t: DartThrow = { ...hit, source: 'manual', timestamp: new Date().toISOString() };
    const nextThrows = [...throws, t];
    setThrows(nextThrows);

    const isDoubleHit = hit.segment === target && hit.multiplier === 2;
    const nextDoubleHits = doubleHitsThisNumber + (isDoubleHit ? 1 : 0);
    const nextDartsThisNumber = dartsThisNumber + 1;

    if (nextDartsThisNumber < DARTS_PER_NUMBER) {
      setDartsThisNumber(nextDartsThisNumber);
      setDoubleHitsThisNumber(nextDoubleHits);
      return;
    }

    const nextScore = nextDoubleHits > 0 ? score + target * 2 * nextDoubleHits : score - target;
    const nextTotalDoubleHits = totalDoubleHits + nextDoubleHits;
    setScore(nextScore);
    setTotalDoubleHits(nextTotalDoubleHits);
    setDartsThisNumber(0);
    setDoubleHitsThisNumber(0);
    const nextIndex = numberIndex + 1;
    setNumberIndex(nextIndex);

    if (nextIndex >= NUMBERS.length) {
      const m: SkillCheckMetrics = {
        totalScore: nextScore,
        dartsThrown: nextThrows.length,
        doubleSuccessRate: rate(nextTotalDoubleHits, NUMBERS.length * DARTS_PER_NUMBER),
      };
      setMetrics(m);
      await finishSession(session!, nextThrows, m);
    }
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
