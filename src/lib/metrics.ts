export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = average(values);
  const variance = average(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

export function rate(hits: number, total: number): number {
  if (total === 0) return 0;
  return hits / total;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
