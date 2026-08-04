import type { SkillCheckSession, SkillCheckType } from '../types/domain';
import { SKILL_CHECK_META } from './skillCheckMeta';

export type WeaknessCategory =
  | 'no_data'
  | 'double_accuracy'
  | 'main_number_accuracy'
  | 'grouping_bias'
  | 'grouping_consistency'
  | 'clock_consistency'
  | 'checkout_stability';

export interface WeaknessFinding {
  category: WeaknessCategory;
  severity: number; // 0-1, higher = more urgent
  headline: string;
  detail: string;
}

export interface DrillSuggestion {
  category: WeaknessCategory;
  title: string;
  reason: string;
  skillCheckType: SkillCheckType;
  path: string;
  targetHint: string;
}

function finishedSessionsOfType(sessions: SkillCheckSession[], type: SkillCheckType): SkillCheckSession[] {
  return sessions.filter((s) => s.type === type && s.finishedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/**
 * Compares the latest session's metric against the previous one of the same
 * type to decide whether to raise the bar or focus on repeating a stable
 * result. Falls back to "aim to match" when there's no prior session to
 * compare against.
 */
function nextTargetForRate(sessions: SkillCheckSession[], type: SkillCheckType, metricKey: string): { current: number; target: number; improving: boolean } | null {
  const history = finishedSessionsOfType(sessions, type);
  const latest = history[0];
  const current = latest?.metrics[metricKey];
  if (current === undefined) return null;
  const previous = history[1]?.metrics[metricKey];
  const improving = previous !== undefined && current > previous;
  const target = improving ? Math.min(1, current + 0.05) : Math.min(1, current + 0.02);
  return { current, target, improving };
}

export function analyzeWeaknesses(sessions: SkillCheckSession[]): WeaknessFinding[] {
  if (sessions.filter((s) => s.finishedAt).length === 0) {
    return [
      {
        category: 'no_data',
        severity: 1,
        headline: 'まだ記録がありません',
        detail: 'まずは Around the Clock で基礎の命中力を測定しましょう',
      },
    ];
  }

  const findings: WeaknessFinding[] = [];

  const bobs27 = finishedSessionsOfType(sessions, 'bobs_27')[0];
  if (bobs27?.metrics.doubleSuccessRate !== undefined && bobs27.metrics.doubleSuccessRate < 0.5) {
    findings.push({
      category: 'double_accuracy',
      severity: 0.5 - bobs27.metrics.doubleSuccessRate + 0.5,
      headline: 'ダブルの精度が低め',
      detail: `直近のBob's 27でダブル成功率 ${formatPercent(bobs27.metrics.doubleSuccessRate)}(目安50%未満)`,
    });
  }

  const game01 = finishedSessionsOfType(sessions, 'game01')[0];
  if (game01?.metrics.bustCount !== undefined && game01.metrics.bustCount >= 2) {
    findings.push({
      category: 'checkout_stability',
      severity: Math.min(1, 0.4 + game01.metrics.bustCount * 0.1),
      headline: 'フィニッシュ前のバーストが多い',
      detail: `直近の01ゲームでバースト ${game01.metrics.bustCount}回`,
    });
  }

  const grouping = finishedSessionsOfType(sessions, 'grouping')[0];
  if (grouping) {
    const biasX = grouping.metrics.groupingBiasX ?? 0;
    const biasY = grouping.metrics.groupingBiasY ?? 0;
    const biasMag = Math.hypot(biasX, biasY);
    if (biasMag > 15) {
      const vertical = Math.abs(biasY) < 3 ? '' : biasY > 0 ? '下' : '上';
      const horizontal = Math.abs(biasX) < 3 ? '' : biasX > 0 ? '右' : '左';
      const direction = [vertical, horizontal].filter(Boolean).join('・') || '中心以外';
      findings.push({
        category: 'grouping_bias',
        severity: Math.min(1, biasMag / 40),
        headline: `着弾が${direction}に偏りがち`,
        detail: `直近のグルーピングテストで中心から平均${biasMag.toFixed(0)}mmずれ(${direction}寄り)`,
      });
    }
    if (grouping.metrics.groupingSpreadMm !== undefined && grouping.metrics.groupingSpreadMm > 35) {
      findings.push({
        category: 'grouping_consistency',
        severity: Math.min(1, grouping.metrics.groupingSpreadMm / 80),
        headline: 'グルーピングのばらつきが大きい',
        detail: `直近のグルーピングテストで着弾分散 ${grouping.metrics.groupingSpreadMm.toFixed(0)}mm`,
      });
    }
  }

  const clock = finishedSessionsOfType(sessions, 'around_the_clock')[0];
  if (clock?.metrics.dartsThrown !== undefined && clock.metrics.dartsThrown > 21 * 1.8) {
    findings.push({
      category: 'clock_consistency',
      severity: Math.min(1, clock.metrics.dartsThrown / (21 * 3)),
      headline: '狙ったナンバーへの安定性が低め',
      detail: `直近のAround the Clockで1周に${clock.metrics.dartsThrown}投(目安21投)`,
    });
  }

  const cricket = finishedSessionsOfType(sessions, 'cricket_count_up')[0];
  if (cricket?.metrics.avgScorePerRound !== undefined && cricket.metrics.avgScorePerRound < 25) {
    findings.push({
      category: 'main_number_accuracy',
      severity: Math.min(1, (25 - cricket.metrics.avgScorePerRound) / 25),
      headline: '主要ナンバーへの命中率が低め',
      detail: `直近のCricket Count-upで平均${cricket.metrics.avgScorePerRound.toFixed(1)}点/ラウンド(目安25点未満)`,
    });
  }

  return findings.sort((a, b) => b.severity - a.severity);
}

function buildDrill(category: WeaknessCategory, sessions: SkillCheckSession[]): DrillSuggestion {
  switch (category) {
    case 'double_accuracy': {
      const t = nextTargetForRate(sessions, 'bobs_27', 'doubleSuccessRate');
      return {
        category,
        title: 'ダブル集中ドリル',
        reason: 'Bob\'s 27でダブルの成功率が伸び悩んでいます。ダブルだけを繰り返し狙って精度を上げましょう。',
        skillCheckType: 'bobs_27',
        path: SKILL_CHECK_META.bobs_27.path,
        targetHint: t ? `目標: ダブル成功率 ${formatPercent(t.target)}以上(前回 ${formatPercent(t.current)})` : '目標: ダブル成功率 50%以上',
      };
    }
    case 'main_number_accuracy': {
      const t = nextTargetForRate(sessions, 'cricket_count_up', 'hitRate');
      return {
        category,
        title: 'クリケットナンバー集中練習',
        reason: '20・19・18等の主要ナンバーへの命中率が低めです。Cricket Count-upで狙ったナンバーへの集中力を鍛えましょう。',
        skillCheckType: 'cricket_count_up',
        path: SKILL_CHECK_META.cricket_count_up.path,
        targetHint: t ? `目標: ヒット率 ${formatPercent(t.target)}以上(前回 ${formatPercent(t.current)})` : '目標: 平均25点/ラウンド以上',
      };
    }
    case 'grouping_bias':
      return {
        category,
        title: '偏り修正グルーピングドリル',
        reason: '着弾が特定方向に偏る傾向があります。同じ的を狙い続けて、フォームのブレを意識的に修正しましょう。',
        skillCheckType: 'grouping',
        path: SKILL_CHECK_META.grouping.path,
        targetHint: '目標: 中心からのズレを前回より小さく',
      };
    case 'grouping_consistency':
      return {
        category,
        title: '固定フォーム・グルーピングドリル',
        reason: '着弾のばらつきが大きめです。素振りでフォームを固定してから、同じ的への連続投擲で安定性を高めましょう。',
        skillCheckType: 'grouping',
        path: SKILL_CHECK_META.grouping.path,
        targetHint: '目標: 着弾分散を前回より縮小',
      };
    case 'clock_consistency': {
      const t = nextTargetForRate(sessions, 'around_the_clock', 'hitRate');
      return {
        category,
        title: 'Around the Clock 基礎反復',
        reason: '狙ったナンバーに当てるまでの投擲数が多めです。基礎の命中力を反復して鍛えましょう。',
        skillCheckType: 'around_the_clock',
        path: SKILL_CHECK_META.around_the_clock.path,
        targetHint: t ? `目標: ヒット率 ${formatPercent(t.target)}以上(前回 ${formatPercent(t.current)})` : '目標: 21投以内で1周',
      };
    }
    case 'checkout_stability':
      return {
        category,
        title: 'フィニッシュ安定化ドリル',
        reason: 'バーストが多く発生しています。01ゲームを繰り返し、フィニッシュ前の残りスコア管理とダブルの精度を磨きましょう。',
        skillCheckType: 'game01',
        path: SKILL_CHECK_META.game01.path,
        targetHint: '目標: バースト0回でフィニッシュ',
      };
    case 'no_data':
    default:
      return {
        category: 'no_data',
        title: 'Around the Clock で基礎チェック',
        reason: 'まだ記録がありません。まずは基礎の命中力を測定しましょう。',
        skillCheckType: 'around_the_clock',
        path: SKILL_CHECK_META.around_the_clock.path,
        targetHint: '目標: 1周を完走する',
      };
  }
}

const ALL_TYPES: SkillCheckType[] = ['around_the_clock', 'bobs_27', 'cricket_count_up', 'game01', 'grouping'];

/** Fills remaining slots with whichever template hasn't been played most recently, to keep practice well-rounded. */
function leastRecentlyPlayedTypes(sessions: SkillCheckSession[]): SkillCheckType[] {
  const lastPlayed = new Map<SkillCheckType, string>();
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    const existing = lastPlayed.get(s.type);
    if (!existing || s.startedAt > existing) lastPlayed.set(s.type, s.startedAt);
  }
  return [...ALL_TYPES].sort((a, b) => (lastPlayed.get(a) ?? '').localeCompare(lastPlayed.get(b) ?? ''));
}

const MAX_MENU_ITEMS = 3;

/** Deterministic "today's menu": worst weaknesses first, filled out with variety when there aren't enough. */
export function buildDailyMenu(sessions: SkillCheckSession[]): DrillSuggestion[] {
  const weaknesses = analyzeWeaknesses(sessions);
  const menu: DrillSuggestion[] = [];
  const usedCategories = new Set<WeaknessCategory>();
  const usedTypes = new Set<SkillCheckType>();

  for (const w of weaknesses) {
    if (menu.length >= MAX_MENU_ITEMS) break;
    if (usedCategories.has(w.category)) continue;
    const drill = buildDrill(w.category, sessions);
    if (usedTypes.has(drill.skillCheckType)) continue;
    menu.push(drill);
    usedCategories.add(w.category);
    usedTypes.add(drill.skillCheckType);
  }

  if (menu.length < MAX_MENU_ITEMS && !usedCategories.has('no_data')) {
    for (const type of leastRecentlyPlayedTypes(sessions)) {
      if (menu.length >= MAX_MENU_ITEMS) break;
      if (usedTypes.has(type)) continue;
      menu.push({
        category: 'no_data',
        title: `${SKILL_CHECK_META[type].label} で幅を広げる`,
        reason: '大きな弱点は見つかっていません。他の種目もバランスよく続けましょう。',
        skillCheckType: type,
        path: SKILL_CHECK_META[type].path,
        targetHint: '目標: 自己ベストの更新',
      });
      usedTypes.add(type);
    }
  }

  return menu;
}
