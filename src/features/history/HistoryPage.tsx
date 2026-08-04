import { useEffect, useState } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import { skillCheckSessionRepo } from '../../db/database';
import { refreshRatingSnapshot } from '../../lib/rating';
import type { SkillCheckSession, SkillCheckType } from '../../types/domain';

const TYPE_LABELS: Record<SkillCheckType, string> = {
  around_the_clock: 'Around the Clock',
  bobs_27: "Bob's 27",
  cricket_count_up: 'Cricket Count-up',
  game01: '01ゲーム',
  grouping: 'グルーピングテスト',
};

function summarize(session: SkillCheckSession): string {
  const m = session.metrics;
  const parts: string[] = [];
  if (m.hitRate !== undefined) parts.push(`ヒット率 ${(m.hitRate * 100).toFixed(0)}%`);
  if (m.threeDartAverage !== undefined) parts.push(`平均 ${m.threeDartAverage.toFixed(1)}`);
  if (m.totalScore !== undefined) parts.push(`スコア ${m.totalScore}`);
  if (m.doubleSuccessRate !== undefined) parts.push(`ダブル成功率 ${(m.doubleSuccessRate * 100).toFixed(0)}%`);
  if (m.groupingSpreadMm !== undefined) parts.push(`分散 ${m.groupingSpreadMm.toFixed(1)}mm`);
  return parts.join(' / ') || '-';
}

export function HistoryPage() {
  const { player } = usePlayer();
  const [sessions, setSessions] = useState<SkillCheckSession[]>([]);

  async function reload(playerId: string) {
    setSessions(await skillCheckSessionRepo.listByPlayer(playerId));
  }

  useEffect(() => {
    if (player) reload(player.id);
  }, [player]);

  if (!player) return <p>読み込み中...</p>;

  async function handleDelete(id: string) {
    await skillCheckSessionRepo.delete(id);
    await refreshRatingSnapshot(player!.id);
    await reload(player!.id);
  }

  return (
    <div className="page">
      <h2>練習履歴</h2>
      {sessions.length === 0 ? (
        <p>まだ記録がありません。スキルチェックを実施してみましょう。</p>
      ) : (
        <table className="rating-table">
          <thead>
            <tr><th>日時</th><th>種目</th><th>結果</th><th></th></tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.startedAt).toLocaleString('ja-JP')}</td>
                <td>{TYPE_LABELS[s.type]}</td>
                <td>{summarize(s)}</td>
                <td><button className="btn-link" onClick={() => handleDelete(s.id)}>削除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
