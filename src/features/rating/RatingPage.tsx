import { useEffect, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { usePlayer } from '../../context/PlayerContext';
import { externalRatingRepo, skillCheckSessionRepo } from '../../db/database';
import { buildRatingHistory } from '../../lib/rating';
import { RatingChart } from '../../components/RatingChart';
import type { ExternalRatingEntry, RatingSnapshot } from '../../types/domain';

const SYSTEM_PRESETS = ['DARTSLIVE', 'BA'];

export function RatingPage() {
  const { player } = usePlayer();
  const [entries, setEntries] = useState<ExternalRatingEntry[]>([]);
  const [history, setHistory] = useState<RatingSnapshot[]>([]);
  const [system, setSystem] = useState(SYSTEM_PRESETS[0]);
  const [customSystem, setCustomSystem] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  async function reload(playerId: string) {
    const [e, sessions] = await Promise.all([
      externalRatingRepo.listByPlayer(playerId),
      skillCheckSessionRepo.listByPlayer(playerId),
    ]);
    setEntries(e.sort((a, b) => b.date.localeCompare(a.date)));
    setHistory(buildRatingHistory(playerId, sessions, e));
  }

  useEffect(() => {
    if (player) reload(player.id);
  }, [player]);

  if (!player) return <p>読み込み中...</p>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numValue = Number(value);
    if (!Number.isFinite(numValue)) return;
    const resolvedSystem = system === '__custom' ? customSystem.trim() : system;
    if (!resolvedSystem) return;

    await externalRatingRepo.put({
      id: uuid(),
      playerId: player!.id,
      system: resolvedSystem,
      value: numValue,
      date: new Date(date).toISOString(),
    });
    setValue('');
    await reload(player!.id);
  }

  async function handleDelete(id: string) {
    await externalRatingRepo.delete(id);
    await reload(player!.id);
  }

  const latestInternal = history.length > 0 ? history[history.length - 1].internalRating : null;

  return (
    <div className="page">
      <h2>レーティング管理</h2>
      <p className="page-lead">外部レーティング(DARTSLIVE・BA等)を手動入力し、スキルチェックから算出した内部レーティングと比較できます。</p>

      <div className="rating-summary">
        <div className="stat-card">
          <div className="stat-card-label">現在の内部レーティング</div>
          <div className="stat-card-value">{latestInternal !== null && latestInternal !== undefined ? latestInternal.toFixed(2) : '—'}</div>
          <div className="stat-card-hint">スキルチェックの結果から自動算出(参考値)</div>
        </div>
      </div>

      <section className="card">
        <h3>レーティング推移</h3>
        <RatingChart snapshots={history} />
      </section>

      <section className="card">
        <h3>外部レーティングを入力</h3>
        <form className="rating-form" onSubmit={handleSubmit}>
          <label>
            種別
            <select value={system} onChange={(e) => setSystem(e.target.value)}>
              {SYSTEM_PRESETS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="__custom">その他(自由入力)</option>
            </select>
          </label>
          {system === '__custom' && (
            <label>
              名称
              <input value={customSystem} onChange={(e) => setCustomSystem(e.target.value)} placeholder="例: 店舗ランキング" />
            </label>
          )}
          <label>
            数値
            <input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} required />
          </label>
          <label>
            日付
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <button type="submit" className="btn-primary">追加</button>
        </form>
      </section>

      <section className="card">
        <h3>入力履歴</h3>
        {entries.length === 0 ? (
          <p>まだ入力がありません。</p>
        ) : (
          <table className="rating-table">
            <thead>
              <tr><th>日付</th><th>種別</th><th>数値</th><th></th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.date).toLocaleDateString('ja-JP')}</td>
                  <td>{e.system}</td>
                  <td>{e.value}</td>
                  <td><button className="btn-link" onClick={() => handleDelete(e.id)}>削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
