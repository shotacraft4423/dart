import { Link } from 'react-router-dom';
import { SKILL_CHECK_META } from '../../lib/skillCheckMeta';

export function SkillCheckMenu() {
  return (
    <div className="page">
      <h2>スキルチェック</h2>
      <p className="page-lead">練習ルーティンを選んで実施してください。結果は自動で記録され、レーティングに反映されます。</p>
      <div className="template-grid">
        {Object.values(SKILL_CHECK_META).map((t) => (
          <Link key={t.path} to={t.path} className="template-card">
            <h3>{t.label}</h3>
            <p>{t.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
