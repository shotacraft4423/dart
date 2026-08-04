import { Link } from 'react-router-dom';
import type { SkillCheckMetrics } from '../../types/domain';

// Rendered elsewhere (e.g. the grouping-test bias sentence), not as a raw stat card.
const HIDDEN_METRICS = new Set(['groupingBiasX', 'groupingBiasY']);

const METRIC_LABELS: Record<string, { label: string; format: (v: number) => string }> = {
  hitRate: { label: 'ヒット率', format: (v) => `${(v * 100).toFixed(1)}%` },
  dartsThrown: { label: '投擲数', format: (v) => `${v}本` },
  avgScorePerRound: { label: '平均スコア/ラウンド', format: (v) => v.toFixed(1) },
  doubleSuccessRate: { label: 'ダブル成功率', format: (v) => `${(v * 100).toFixed(1)}%` },
  tripleSuccessRate: { label: 'トリプル成功率', format: (v) => `${(v * 100).toFixed(1)}%` },
  groupingSpreadMm: { label: '着弾分散', format: (v) => `${v.toFixed(1)}mm` },
  threeDartAverage: { label: '3ダーツ平均', format: (v) => v.toFixed(1) },
  totalScore: { label: '合計スコア', format: (v) => `${v}` },
  checkoutRate: { label: 'フィニッシュ', format: (v) => (v >= 1 ? '成功' : '未達') },
  bustCount: { label: 'バースト回数', format: (v) => `${v}回` },
};

export function SessionComplete({ metrics, onRestart }: { metrics: SkillCheckMetrics; onRestart: () => void }) {
  const entries = Object.entries(metrics).filter(([k, v]) => v !== undefined && !HIDDEN_METRICS.has(k));
  return (
    <div className="session-complete">
      <h3>お疲れさまでした！結果を記録しました。</h3>
      <div className="stat-grid">
        {entries.map(([key, value]) => {
          const meta = METRIC_LABELS[key] ?? { label: key, format: (v: number) => v.toFixed(1) };
          return <div key={key} className="stat-card">
            <div className="stat-card-label">{meta.label}</div>
            <div className="stat-card-value">{meta.format(value as number)}</div>
          </div>;
        })}
      </div>
      <div className="session-complete-actions">
        <button className="btn-primary" onClick={onRestart}>もう一度挑戦</button>
        <Link className="btn-secondary" to="/history">履歴を見る</Link>
        <Link className="btn-secondary" to="/">ダッシュボードへ</Link>
      </div>
    </div>
  );
}
