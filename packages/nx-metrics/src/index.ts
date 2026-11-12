/** Library API: record format, reports and bench for own dashboards / collectors. The Nx plugin is `./plugin`. */
export * from './record.ts';
export * from './stats.ts';
export * from './report.ts';
export * from './graph.ts';
export * from './affected.ts';
export * from './cache-size.ts';
export { readJsonl, appendJsonl } from './sinks.ts';
export {
  parseBenchConfig,
  loadBenchConfig,
  type BenchConfig,
  type BenchScenario,
  type CacheMode,
} from './bench/config.ts';
export { runBench, type BenchResult, type ScenarioResult, type IterationResult } from './bench/runner.ts';
export { compareBench, comparabilityWarnings, benchToMarkdown, comparisonToMarkdown } from './bench/compare.ts';
