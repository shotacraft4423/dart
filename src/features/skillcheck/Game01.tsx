import { useState } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import { SkillCheckLayout } from '../../components/SkillCheckLayout';
import { SessionComplete } from './SessionComplete';
import { newSession, finishSession } from '../../lib/sessionStore';
import type { DartThrow, SkillCheckMetrics, SkillCheckSession } from '../../types/domain';
import type { BoardHitResult } from '../../lib/dartboardGeometry';

interface Game01Config {
  startScore: 301 | 501;
  doubleOut: boolean;
}

function replay(throws: DartThrow[], config: Game01Config) {
  let remaining: number = config.startScore;
  let bustCount = 0;
  let turnThrows: DartThrow[] = [];
  let status: 'playing' | 'won' = 'playing';

  for (const t of throws) {
    if (status === 'won') break;
    const newRemaining = remaining - t.score;
    const isBust =
      newRemaining < 0 ||
      (config.doubleOut && newRemaining === 1) ||
      (newRemaining === 0 && config.doubleOut && t.multiplier !== 2);
    const isWin = newRemaining === 0 && !isBust;

    if (isBust) {
      bustCount++;
      turnThrows = [];
      continue;
    }
    if (isWin) {
      remaining = 0;
      status = 'won';
      continue;
    }
    remaining = newRemaining;
    turnThrows = [...turnThrows, t];
    if (turnThrows.length >= 3) turnThrows = [];
  }

  return { remaining, bustCount, turnThrows, status };
}

export function Game01() {
  const { player } = usePlayer();
  const [config, setConfig] = useState<Game01Config | null>(null);
  const [session, setSession] = useState<SkillCheckSession | null>(null);
  const [throws, setThrows] = useState<DartThrow[]>([]);
  const [metrics, setMetrics] = useState<SkillCheckMetrics | null>(null);

  if (!player) return <p>読み込み中...</p>;

  if (!config) {
    return (
      <div className="skillcheck-layout">
        <div className="skillcheck-header">
          <h2>01ゲーム(レーティング測定)</h2>
          <p className="skillcheck-instructions">開始スコアとルールを選んでください</p>
        </div>
        <div className="game01-setup">
          {[301, 501].map((s) => (
            <button
              key={s}
              className="btn-secondary"
              onClick={() => {
                const cfg: Game01Config = { startScore: s as 301 | 501, doubleOut: true };
                setConfig(cfg);
                setSession(newSession(player.id, 'game01', cfg as unknown as Record<string, unknown>));
              }}
            >
              {s} ダブルアウト
            </button>
          ))}
        </div>
      </div>
    );
  }

  const { remaining, bustCount, turnThrows, status } = replay(throws, config);

  async function handleHit(hit: BoardHitResult) {
    if (status !== 'playing' || !session) return;
    const t: DartThrow = { ...hit, source: 'manual', timestamp: new Date().toISOString() };
    const nextThrows = [...throws, t];
    setThrows(nextThrows);

    const next = replay(nextThrows, config!);
    if (next.status === 'won') {
      const m: SkillCheckMetrics = {
        dartsThrown: nextThrows.length,
        threeDartAverage: (config!.startScore / nextThrows.length) * 3,
        bustCount: next.bustCount,
        checkoutRate: 1,
      };
      setMetrics(m);
      await finishSession(session, nextThrows, m);
    }
  }

  function handleUndo() {
    setThrows((prev) => prev.slice(0, -1));
  }

  async function endEarly() {
    if (!session) return;
    const scored = config!.startScore - remaining;
    const m: SkillCheckMetrics = {
      dartsThrown: throws.length,
      threeDartAverage: throws.length > 0 ? (scored / throws.length) * 3 : 0,
      bustCount,
      checkoutRate: 0,
    };
    setMetrics(m);
    await finishSession(session, throws, m);
  }

  function restart() {
    window.location.reload();
  }

  if (metrics) {
    return <SessionComplete metrics={metrics} onRestart={restart} />;
  }

  return (
    <SkillCheckLayout
      title={`01ゲーム (${config.startScore})`}
      instructions={`残り: ${remaining} — ${config.doubleOut ? 'ダブルでフィニッシュしてください' : ''}`}
      onHit={handleHit}
      throws={throws}
      onUndo={handleUndo}
      statsPanel={
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">残りスコア</div>
            <div className="stat-card-value">{remaining}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">このターン</div>
            <div className="stat-card-value">{turnThrows.length} / 3本</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">バースト</div>
            <div className="stat-card-value">{bustCount}回</div>
          </div>
        </div>
      }
      footer={
        <button className="btn-secondary" onClick={endEarly}>
          ここで終了して記録する
        </button>
      }
    />
  );
}
