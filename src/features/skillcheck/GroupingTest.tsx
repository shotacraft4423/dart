import { useState } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import { SkillCheckLayout } from '../../components/SkillCheckLayout';
import { SessionComplete } from './SessionComplete';
import { newSession, finishSession } from '../../lib/sessionStore';
import { average, rate } from '../../lib/metrics';
import { segmentCenter } from '../../lib/dartboardGeometry';
import type { DartThrow, SkillCheckMetrics, SkillCheckSession } from '../../types/domain';
import type { BoardHitResult } from '../../lib/dartboardGeometry';

const BOARD_RADIUS_MM = 170;
const DART_COUNT = 9;

const TARGET_OPTIONS: { label: string; segment: number; multiplier: 0 | 1 | 2 | 3 }[] = [
  { label: 'トリプル20', segment: 20, multiplier: 3 },
  { label: 'トリプル19', segment: 19, multiplier: 3 },
  { label: 'ダブル20', segment: 20, multiplier: 2 },
  { label: 'ブルズアイ', segment: 25, multiplier: 2 },
];

export function GroupingTest() {
  const { player } = usePlayer();
  const [target, setTarget] = useState<typeof TARGET_OPTIONS[number] | null>(null);
  const [session, setSession] = useState<SkillCheckSession | null>(null);
  const [throws, setThrows] = useState<DartThrow[]>([]);
  const [metrics, setMetrics] = useState<SkillCheckMetrics | null>(null);

  if (!player) return <p>読み込み中...</p>;

  if (!target) {
    return (
      <div className="skillcheck-layout">
        <div className="skillcheck-header">
          <h2>グルーピングテスト</h2>
          <p className="skillcheck-instructions">狙うエリアを選んでください（{DART_COUNT}本投げます）</p>
        </div>
        <div className="game01-setup">
          {TARGET_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              className="btn-secondary"
              onClick={() => {
                setTarget(opt);
                setSession(newSession(player.id, 'grouping', { target: opt, dartCount: DART_COUNT }));
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const finished = throws.length >= DART_COUNT;

  async function handleHit(hit: BoardHitResult) {
    if (finished || !session || !target) return;
    const t: DartThrow = { ...hit, source: 'manual', timestamp: new Date().toISOString() };
    const nextThrows = [...throws, t];
    setThrows(nextThrows);

    if (nextThrows.length >= DART_COUNT) {
      const withCoords = nextThrows.filter((x) => x.x !== undefined && x.y !== undefined);
      const meanX = average(withCoords.map((x) => x.x!));
      const meanY = average(withCoords.map((x) => x.y!));
      const spread =
        average(withCoords.map((x) => Math.hypot(x.x! - meanX, x.y! - meanY))) * BOARD_RADIUS_MM;
      const center = segmentCenter(target.segment, target.multiplier);
      const hits = nextThrows.filter((x) => x.segment === target.segment && x.multiplier === target.multiplier);

      const m: SkillCheckMetrics = {
        dartsThrown: nextThrows.length,
        hitRate: rate(hits.length, nextThrows.length),
        groupingSpreadMm: spread,
        groupingBiasX: (meanX - center.x) * BOARD_RADIUS_MM,
        groupingBiasY: (meanY - center.y) * BOARD_RADIUS_MM,
      };
      setMetrics(m);
      await finishSession(session, nextThrows, m);
    }
  }

  function restart() {
    window.location.reload();
  }

  function handleUndo() {
    setThrows((prev) => prev.slice(0, -1));
  }

  if (metrics) {
    const biasX = metrics.groupingBiasX ?? 0;
    const biasY = metrics.groupingBiasY ?? 0;
    const horizontal = Math.abs(biasX) < 3 ? '' : biasX > 0 ? '右寄り' : '左寄り';
    const vertical = Math.abs(biasY) < 3 ? '' : biasY > 0 ? '下寄り' : '上寄り';
    const bias = [vertical, horizontal].filter(Boolean).join('・') || '偏りなし';
    return (
      <div>
        <SessionComplete metrics={metrics} onRestart={restart} />
        <p className="grouping-bias">着弾の傾向: {bias}</p>
      </div>
    );
  }

  return (
    <SkillCheckLayout
      title="グルーピングテスト"
      instructions={`${TARGET_OPTIONS.find((o) => o.segment === target.segment && o.multiplier === target.multiplier)?.label} を狙って${DART_COUNT}本投げてください`}
      onHit={handleHit}
      highlightSegment={target}
      markers={throws.map((t) => ({ x: t.x ?? 0, y: t.y ?? 0 }))}
      throws={throws}
      onUndo={handleUndo}
      statsPanel={
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">投擲数</div>
            <div className="stat-card-value">{throws.length} / {DART_COUNT}</div>
          </div>
        </div>
      }
    />
  );
}
