import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RatingSnapshot } from '../types/domain';

const LINE_COLORS = ['#2f6fed', '#c0392b', '#1e7d32', '#e0a800', '#8e44ad'];

interface ChartRow {
  date: string;
  internalRating?: number;
  [system: string]: string | number | undefined;
}

function buildChartData(snapshots: RatingSnapshot[]): { rows: ChartRow[]; systems: string[] } {
  const systems = new Set<string>();
  const rows: ChartRow[] = snapshots.map((s) => {
    const row: ChartRow = {
      date: new Date(s.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' }),
      internalRating: s.internalRating ?? undefined,
    };
    for (const er of s.externalRatings) {
      row[er.system] = er.value;
      systems.add(er.system);
    }
    return row;
  });
  return { rows, systems: [...systems] };
}

export function RatingChart({ snapshots }: { snapshots: RatingSnapshot[] }) {
  if (snapshots.length === 0) {
    return <p className="chart-empty">まだレーティングの記録がありません。スキルチェックを実施するか、外部レーティングを入力してください。</p>;
  }
  const { rows, systems } = buildChartData(snapshots);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
        <XAxis dataKey="date" stroke="var(--text-secondary)" fontSize={12} />
        <YAxis stroke="var(--text-secondary)" fontSize={12} />
        <Tooltip
          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', fontSize: 13 }}
        />
        <Legend />
        <Line type="monotone" dataKey="internalRating" name="内部レーティング" stroke="#2f6fed" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        {systems.map((system, i) => (
          <Line
            key={system}
            type="monotone"
            dataKey={system}
            name={system}
            stroke={LINE_COLORS[(i + 1) % LINE_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
