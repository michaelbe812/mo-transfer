/**
 * Prometheus metrics of the cache server (text exposition format 0.0.4, no client library):
 *   nx_cache_requests_total{operation,outcome,role,namespace}        GET hit/miss, PUT stored/exists, 4xx/5xx
 *   nx_cache_request_duration_seconds{operation,outcome}  histogram  GET: time to first byte (stream not included)
 *   nx_cache_bytes_total{operation,namespace}                        bytes served (GET hits) / stored (PUT)
 *   nx_cache_entry_bytes{operation}                       histogram  entry size distribution
 * The hit rate the server sees = hit / (hit + miss); Nx' own view is in nx-metrics (plugin).
 */

export type Operation = 'get' | 'put';

export type Outcome =
  | 'hit'
  | 'miss'
  | 'stored'
  | 'exists'
  | 'unauthorized'
  | 'forbidden'
  | 'invalid'
  | 'too-large'
  | 'error';

export interface RequestSample {
  operation: Operation;
  status: number;
  role?: string;
  namespace?: string;
  seconds: number;
}

export const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];
export const SIZE_BUCKETS = [1024, 10 * 1024, 100 * 1024, 1024 ** 2, 10 * 1024 ** 2, 100 * 1024 ** 2, 1024 ** 3];

export const outcomeOf = (operation: Operation, status: number): Outcome => {
  if (status === 200) return operation === 'get' ? 'hit' : 'stored';
  if (status === 404) return 'miss';
  if (status === 409) return 'exists';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 413) return 'too-large';
  if (status >= 500) return 'error';
  return 'invalid';
};

type Labels = Readonly<Record<string, string>>;

const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const labelText = (labels: Labels) => {
  const entries = Object.entries(labels);
  return entries.length ? `{${entries.map(([key, value]) => `${key}="${escape(value)}"`).join(',')}}` : '';
};

class Counter {
  private readonly values = new Map<string, { labels: Labels; value: number }>();
  readonly name: string;
  readonly help: string;

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(labels: Labels, by = 1): void {
    const key = labelText(labels);
    const entry = this.values.get(key) ?? { labels, value: 0 };
    entry.value += by;
    this.values.set(key, entry);
  }

  get(labels: Labels): number {
    return this.values.get(labelText(labels))?.value ?? 0;
  }

  render(): string[] {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
      ...[...this.values.values()].map(({ labels, value }) => `${this.name}${labelText(labels)} ${value}`),
    ];
  }
}

class Histogram {
  private readonly series = new Map<string, { labels: Labels; counts: number[]; sum: number; count: number }>();
  readonly name: string;
  readonly help: string;
  readonly buckets: readonly number[];

  constructor(name: string, help: string, buckets: readonly number[]) {
    this.name = name;
    this.help = help;
    this.buckets = buckets;
  }

  observe(labels: Labels, value: number): void {
    const key = labelText(labels);
    const entry = this.series.get(key) ?? { labels, counts: this.buckets.map(() => 0), sum: 0, count: 0 };
    this.buckets.forEach((bound, index) => {
      if (value <= bound) entry.counts[index]++;
    });
    entry.sum += value;
    entry.count++;
    this.series.set(key, entry);
  }

  render(): string[] {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const { labels, counts, sum, count } of this.series.values()) {
      this.buckets.forEach((bound, index) => {
        lines.push(`${this.name}_bucket${labelText({ ...labels, le: String(bound) })} ${counts[index]}`);
      });
      lines.push(`${this.name}_bucket${labelText({ ...labels, le: '+Inf' })} ${count}`);
      lines.push(`${this.name}_sum${labelText(labels)} ${sum}`);
      lines.push(`${this.name}_count${labelText(labels)} ${count}`);
    }
    return lines;
  }
}

export class CacheMetrics {
  readonly requests = new Counter('nx_cache_requests_total', 'Cache requests by operation and outcome.');
  readonly duration = new Histogram(
    'nx_cache_request_duration_seconds',
    'Request duration until the response starts (GET: time to first byte).',
    DURATION_BUCKETS,
  );
  readonly bytes = new Counter('nx_cache_bytes_total', 'Bytes served (get) and stored (put).');
  readonly entrySize = new Histogram('nx_cache_entry_bytes', 'Size of served/stored cache entries.', SIZE_BUCKETS);
  private readonly startedAt = Date.now();

  recordRequest(sample: RequestSample): void {
    const outcome = outcomeOf(sample.operation, sample.status);
    this.requests.inc({
      operation: sample.operation,
      outcome,
      role: sample.role ?? 'none',
      namespace: sample.namespace ?? 'none',
    });
    this.duration.observe({ operation: sample.operation, outcome }, sample.seconds);
  }

  recordBytes(operation: Operation, namespace: string, bytes: number): void {
    this.bytes.inc({ operation, namespace }, bytes);
    this.entrySize.observe({ operation }, bytes);
  }

  render(): string {
    const memory = process.memoryUsage();
    return `${[
      ...this.requests.render(),
      ...this.duration.render(),
      ...this.bytes.render(),
      ...this.entrySize.render(),
      '# HELP process_uptime_seconds Seconds since the server started.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${(Date.now() - this.startedAt) / 1000}`,
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${memory.rss}`,
    ].join('\n')}\n`;
  }
}
