/** Descriptive statistics for durations. Percentiles are what you report to customers, not means (outliers). */
export interface Summary {
  n: number;
  mean: number;
  median: number;
  p90: number;
  min: number;
  max: number;
  stddev: number;
}

/** Percentile with linear interpolation between closest ranks; `sorted` must be ascending and non-empty. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

export function summarize(values: readonly number[]): Summary | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
  return {
    n: sorted.length,
    mean,
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stddev: Math.sqrt(variance),
  };
}

export function median(values: readonly number[]): number | undefined {
  return summarize(values)?.median;
}

/** `1234` → `1.23 s`, `83000` → `1m 23s`; for markdown tables. */
export function formatMs(ms: number | undefined): string {
  if (ms === undefined || Number.isNaN(ms)) return '–';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/** `1536` → `1.5 KiB`; for markdown tables. */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || Number.isNaN(bytes)) return '–';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`;
}

export function formatPercent(ratio: number | undefined): string {
  return ratio === undefined || Number.isNaN(ratio) ? '–' : `${(ratio * 100).toFixed(1)} %`;
}
