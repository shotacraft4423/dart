import type { SkillCheckType } from '../types/domain';

export const SKILL_CHECK_META: Record<SkillCheckType, { label: string; path: string; description: string }> = {
  around_the_clock: {
    label: 'Around the Clock',
    path: '/skillcheck/around-the-clock',
    description: '1〜20を順に狙い、ヒット率と所要投擲数を測定します',
  },
  bobs_27: {
    label: "Bob's 27",
    path: '/skillcheck/bobs-27',
    description: 'ダブルのみを使った27点チャレンジ。ダブル成功率を測定します',
  },
  cricket_count_up: {
    label: 'Cricket Count-up',
    path: '/skillcheck/cricket-count-up',
    description: '15ラウンドのクリケットナンバーで合計得点を競います',
  },
  game01: {
    label: '01ゲーム (301/501)',
    path: '/skillcheck/game01',
    description: '3ダーツ平均やバースト数からレーティングを測定します',
  },
  grouping: {
    label: 'グルーピングテスト',
    path: '/skillcheck/grouping',
    description: '同じエリアへの連続投擲で着弾のばらつき・偏りを計測します',
  },
};
