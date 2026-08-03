import type { DartThrow } from '../types/domain';

function label(t: DartThrow): string {
  if (t.segment === 0) return 'ミス';
  if (t.segment === 25) return t.multiplier === 2 ? 'ブル (50)' : 'アウターブル (25)';
  const prefix = t.multiplier === 3 ? 'T' : t.multiplier === 2 ? 'D' : 'S';
  return `${prefix}${t.segment} (${t.score})`;
}

export function ThrowLog({ throws }: { throws: DartThrow[] }) {
  if (throws.length === 0) {
    return <p className="throw-log-empty">まだ投げていません。ダーツボードをクリックして記録してください。</p>;
  }
  const recent = [...throws].slice(-9).reverse();
  return (
    <ul className="throw-log">
      {recent.map((t, i) => (
        <li key={i}>{label(t)}</li>
      ))}
    </ul>
  );
}
