import { Link } from 'react-router-dom';

const TEMPLATES = [
  {
    path: '/skillcheck/around-the-clock',
    title: 'Around the Clock',
    description: '1〜20を順に狙い、ヒット率と所要投擲数を測定します',
  },
  {
    path: '/skillcheck/bobs-27',
    title: "Bob's 27",
    description: 'ダブルのみを使った27点チャレンジ。ダブル成功率を測定します',
  },
  {
    path: '/skillcheck/cricket-count-up',
    title: 'Cricket Count-up',
    description: '15ラウンドのクリケットナンバーで合計得点を競います',
  },
  {
    path: '/skillcheck/game01',
    title: '01ゲーム (301/501)',
    description: '3ダーツ平均やバースト数からレーティングを測定します',
  },
  {
    path: '/skillcheck/grouping',
    title: 'グルーピングテスト',
    description: '同じエリアへの連続投擲で着弾のばらつき・偏りを計測します',
  },
];

export function SkillCheckMenu() {
  return (
    <div className="page">
      <h2>スキルチェック</h2>
      <p className="page-lead">練習ルーティンを選んで実施してください。結果は自動で記録され、レーティングに反映されます。</p>
      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <Link key={t.path} to={t.path} className="template-card">
            <h3>{t.title}</h3>
            <p>{t.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
