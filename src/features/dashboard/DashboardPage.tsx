import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlayer } from '../../context/PlayerContext';
import { skillCheckSessionRepo, ratingSnapshotRepo } from '../../db/database';
import { RatingChart } from '../../components/RatingChart';
import { boardAdapterRegistry } from '../../adapters/boardAdapter';
import { buildDailyMenu, type DrillSuggestion } from '../../lib/recommendation';
import type { RatingSnapshot, SkillCheckSession } from '../../types/domain';

export function DashboardPage() {
  const { player } = usePlayer();
  const [snapshots, setSnapshots] = useState<RatingSnapshot[]>([]);
  const [recentSessions, setRecentSessions] = useState<SkillCheckSession[]>([]);
  const [dailyMenu, setDailyMenu] = useState<DrillSuggestion[]>([]);

  useEffect(() => {
    if (!player) return;
    (async () => {
      const [s, sessions] = await Promise.all([
        ratingSnapshotRepo.listByPlayer(player.id),
        skillCheckSessionRepo.listByPlayer(player.id),
      ]);
      setSnapshots(s);
      setRecentSessions(sessions.slice(0, 5));
      setDailyMenu(buildDailyMenu(sessions));
    })();
  }, [player]);

  if (!player) return <p>読み込み中...</p>;

  const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  return (
    <div className="page">
      <h2>ようこそ、{player.name}さん</h2>
      <p className="page-lead">今日の練習を記録して、フォームとスコアの成長を可視化しましょう。</p>

      <div className="dashboard-cards">
        <div className="stat-card">
          <div className="stat-card-label">内部レーティング</div>
          <div className="stat-card-value">{latest?.internalRating?.toFixed(2) ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">記録済みセッション数</div>
          <div className="stat-card-value">{recentSessions.length > 0 ? recentSessions.length : 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">ボード接続</div>
          <div className="stat-card-value">手動入力モード</div>
          <div className="stat-card-hint">
            対応予定: {boardAdapterRegistry.filter((a) => a.id !== 'manual').map((a) => a.displayName).join(' / ')}
          </div>
        </div>
      </div>

      <section className="card">
        <h3>今日の練習メニュー</h3>
        {dailyMenu.length === 0 ? (
          <p className="page-lead">読み込み中...</p>
        ) : (
          <div className="menu-list">
            {dailyMenu.map((drill) => (
              <Link key={drill.skillCheckType} to={drill.path} className="menu-item">
                <div className="menu-item-title">{drill.title}</div>
                <p className="menu-item-reason">{drill.reason}</p>
                <div className="menu-item-target">{drill.targetHint}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3>レーティング推移</h3>
        <RatingChart snapshots={snapshots} />
      </section>

      <section className="card">
        <h3>クイックスタート</h3>
        <div className="quick-links">
          <Link to="/skillcheck" className="btn-primary">スキルチェックを始める</Link>
          <Link to="/rating" className="btn-secondary">レーティングを入力</Link>
          <Link to="/history" className="btn-secondary">履歴を見る</Link>
          <Link to="/camera" className="btn-secondary">カメラで着弾点解析</Link>
        </div>
      </section>

      {recentSessions.length > 0 && (
        <section className="card">
          <h3>最近の記録</h3>
          <ul className="recent-list">
            {recentSessions.map((s) => (
              <li key={s.id}>
                {new Date(s.startedAt).toLocaleDateString('ja-JP')} — {s.type}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
