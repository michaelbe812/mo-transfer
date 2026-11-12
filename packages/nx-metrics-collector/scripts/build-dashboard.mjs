/**
 * Generates docker/grafana/dashboards/nx-metrics.json (provisioned into Grafana). Edit here, then:
 *   node packages/nx-metrics-collector/scripts/build-dashboard.mjs
 * Panels: Nx' view (Postgres, from the plugin's run records) + the cache server's view (Prometheus).
 * Variables: ci (all/ci/local), branch, rate (€/dev hour), ci_price (€/CI minute) for the ROI panels.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PG = { type: 'grafana-postgresql-datasource', uid: 'nx-metrics-pg' };
const PROM = { type: 'prometheus', uid: 'nx-cache-prom' };

// filters every Postgres query shares (runs alias r / task_facts columns have the same names)
const RUN_FILTER = `$__timeFilter(started_at) and ('$ci' = 'all' or ci = ('$ci' = 'ci')) and coalesce(git_branch, '') ~ '^\${branch:regex}$'`;
const TASK_FILTER = `$__timeFilter(run_started_at) and ('$ci' = 'all' or ci = ('$ci' = 'ci')) and coalesce(git_branch, '') ~ '^\${branch:regex}$'`;

let nextId = 1;
const sql = (rawSql, format = 'table') => ({
  refId: 'A',
  datasource: PG,
  rawSql,
  format,
  rawQuery: true,
  editorMode: 'code',
});
const prom = (expr, legendFormat, refId = 'A') => ({ refId, datasource: PROM, expr, legendFormat, range: true });

function panel(type, title, gridPos, targets, extra = {}) {
  return {
    id: nextId++,
    type,
    title,
    gridPos,
    datasource: targets[0].datasource,
    targets,
    ...extra,
  };
}

const stat = (title, x, y, rawSql, unit, description, decimals) =>
  panel('stat', title, { x, y, w: 4, h: 4 }, [sql(rawSql)], {
    description,
    fieldConfig: { defaults: { unit, decimals, color: { mode: 'fixed', fixedColor: 'blue' } }, overrides: [] },
    options: {
      reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
      colorMode: 'background',
      graphMode: 'none',
      textMode: 'value',
    },
  });

const timeseries = (title, gridPos, targets, unit, extra = {}) =>
  panel('timeseries', title, gridPos, targets, {
    fieldConfig: {
      defaults: {
        unit,
        custom: { drawStyle: 'line', lineWidth: 2, fillOpacity: 10, spanNulls: true, ...extra.custom },
      },
      overrides: extra.overrides ?? [],
    },
    options: { legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } },
  });

const table = (title, gridPos, rawSql, overrides = []) =>
  panel('table', title, gridPos, [sql(rawSql)], {
    fieldConfig: { defaults: { custom: { align: 'auto' } }, overrides },
    options: { showHeader: true, cellHeight: 'sm' },
  });

const unitOverride = (name, unit, decimals) => ({
  matcher: { id: 'byName', options: name },
  properties: [{ id: 'unit', value: unit }, ...(decimals === undefined ? [] : [{ id: 'decimals', value: decimals }])],
});
const row = (title, y) => ({
  id: nextId++,
  type: 'row',
  title,
  collapsed: false,
  gridPos: { x: 0, y, w: 24, h: 1 },
  panels: [],
});

const panels = [
  row('Nx: Läufe und Cache (Plugin-Records)', 0),
  stat(
    'Läufe',
    0,
    1,
    `select count(*) as runs from runs where ${RUN_FILTER}`,
    'short',
    'nx run / run-many / affected Aufrufe im Zeitraum',
  ),
  stat(
    'Cache-Hit-Rate',
    4,
    1,
    `select sum(local_hit + remote_hit)::float / nullif(sum(local_hit + remote_hit + miss), 0) as hit_rate from runs where ${RUN_FILTER}`,
    'percentunit',
    'Treffer / (Treffer + Misses), nur cachebare Tasks',
    1,
  ),
  stat(
    'davon Remote',
    8,
    1,
    `select sum(remote_hit)::float / nullif(sum(local_hit + remote_hit + miss), 0) as remote from runs where ${RUN_FILTER}`,
    'percentunit',
    'Anteil der cachebaren Tasks, die aus dem Remote Cache kamen',
    1,
  ),
  stat(
    'Gesparte Zeit',
    12,
    1,
    `select sum(saved_ms) / 3600000.0 as hours from task_facts where ${TASK_FILTER}`,
    'h',
    'je Hit: Median-Dauer desselben Tasks als Miss minus Dauer des Hits (Fallback: Median des Targets)',
    1,
  ),
  stat(
    'Ersparnis Entwickler',
    16,
    1,
    `select sum(saved_ms) filter (where not ci) / 3600000.0 * $rate as eur from task_facts where ${TASK_FILTER}`,
    'currencyEUR',
    'gesparte Zeit lokaler Läufe × Stundensatz ($rate €/h) — Obergrenze, nicht jede Minute ist Wartezeit',
    0,
  ),
  stat(
    'Ersparnis CI',
    20,
    1,
    `select sum(saved_ms) filter (where ci) / 60000.0 * $ci_price as eur from task_facts where ${TASK_FILTER}`,
    'currencyEUR',
    'gesparte CI-Minuten × Preis ($ci_price €/min)',
    2,
  ),

  timeseries(
    'Hit-Rate pro Tag',
    { x: 0, y: 5, w: 12, h: 8 },
    [
      sql(
        `select $__timeGroupAlias(started_at, 1d), sum(local_hit)::float / nullif(sum(local_hit + remote_hit + miss), 0) as "lokal", sum(remote_hit)::float / nullif(sum(local_hit + remote_hit + miss), 0) as "remote" from runs where ${RUN_FILTER} group by 1 order by 1`,
        'time_series',
      ),
    ],
    'percentunit',
    { custom: { stacking: { mode: 'normal' }, fillOpacity: 40 } },
  ),
  timeseries(
    'Laufdauer p50 / p90 pro Tag',
    { x: 12, y: 5, w: 12, h: 8 },
    [
      sql(
        `select $__timeGroupAlias(started_at, 1d), percentile_cont(0.5) within group (order by duration_ms) as "p50", percentile_cont(0.9) within group (order by duration_ms) as "p90" from runs where ${RUN_FILTER} group by 1 order by 1`,
        'time_series',
      ),
    ],
    'ms',
  ),
  timeseries(
    'Gesparte Zeit pro Tag',
    { x: 0, y: 13, w: 12, h: 8 },
    [
      sql(
        `select $__timeGroupAlias(run_started_at, 1d), sum(saved_ms) filter (where ci) / 3600000.0 as "CI", sum(saved_ms) filter (where not ci) / 3600000.0 as "lokal" from task_facts where ${TASK_FILTER} group by 1 order by 1`,
        'time_series',
      ),
    ],
    'h',
    { custom: { drawStyle: 'bars', fillOpacity: 80, stacking: { mode: 'normal' } } },
  ),
  timeseries(
    'Tasks pro Tag nach Cache-Ergebnis',
    { x: 12, y: 13, w: 12, h: 8 },
    [
      sql(
        `select $__timeGroupAlias(run_started_at, 1d), count(*) filter (where cache = 'miss') as "miss", count(*) filter (where cache = 'local-hit') as "lokal", count(*) filter (where cache = 'remote-hit') as "remote" from task_facts where ${TASK_FILTER} group by 1 order by 1`,
        'time_series',
      ),
    ],
    'short',
    { custom: { drawStyle: 'bars', fillOpacity: 80, stacking: { mode: 'normal' } } },
  ),

  table(
    'Targets',
    { x: 0, y: 21, w: 12, h: 9 },
    `select target, count(*) as tasks,
  percentile_cont(0.5) within group (order by duration_ms) filter (where cache = 'miss') as "miss p50",
  percentile_cont(0.9) within group (order by duration_ms) filter (where cache = 'miss') as "miss p90",
  count(*) filter (where cache in ('local-hit', 'remote-hit'))::float / nullif(count(*) filter (where cache in ('local-hit', 'remote-hit', 'miss')), 0) as "hit rate",
  count(*) filter (where cache = 'remote-hit') as "remote hits",
  sum(saved_ms) / 3600000.0 as "gespart"
from task_facts where ${TASK_FILTER} group by target order by "miss p50" desc nulls last`,
    [
      unitOverride('miss p50', 'ms'),
      unitOverride('miss p90', 'ms'),
      unitOverride('hit rate', 'percentunit', 1),
      unitOverride('gespart', 'h', 2),
    ],
  ),
  table(
    'Langsamste Tasks (Miss-Median)',
    { x: 12, y: 21, w: 12, h: 9 },
    `select task_id as task, count(*) as misses,
  percentile_cont(0.5) within group (order by duration_ms) as "p50",
  percentile_cont(0.9) within group (order by duration_ms) as "p90",
  max(duration_ms) as "max"
from task_facts where ${TASK_FILTER} and cache = 'miss' and duration_ms is not null group by task_id order by "p50" desc limit 20`,
    [unitOverride('p50', 'ms'), unitOverride('p90', 'ms'), unitOverride('max', 'ms')],
  ),
  table(
    'Letzte Läufe',
    { x: 0, y: 30, w: 24, h: 8 },
    `select started_at as "Start", command, label, git_branch as branch, case when ci then coalesce(ci_provider, 'ci') else 'lokal' end as "wo",
  remote_cache as "remote", duration_ms as "Dauer", tasks_total as tasks, miss, local_hit as "lokal", remote_hit as "remote hits", hit_rate as "hit rate", failed
from runs where ${RUN_FILTER} order by started_at desc limit 50`,
    [unitOverride('Dauer', 'ms'), unitOverride('hit rate', 'percentunit', 1)],
  ),

  row('Cache-Server (Prometheus, nx-remote-cache-custom)', 38),
  timeseries(
    'Requests/s nach Ergebnis',
    { x: 0, y: 39, w: 8, h: 8 },
    [
      prom(
        'sum by (operation, outcome) (rate(nx_cache_requests_total[$__rate_interval]))',
        '{{operation}} {{outcome}}',
      ),
    ],
    'reqps',
  ),
  timeseries(
    'Server-Hit-Rate (GET)',
    { x: 8, y: 39, w: 8, h: 8 },
    [
      prom(
        'sum(rate(nx_cache_requests_total{operation="get",outcome="hit"}[$__rate_interval])) / sum(rate(nx_cache_requests_total{operation="get",outcome=~"hit|miss"}[$__rate_interval]))',
        'hit rate',
      ),
    ],
    'percentunit',
  ),
  timeseries(
    'GET-Latenz (bis erstes Byte)',
    { x: 16, y: 39, w: 8, h: 8 },
    [
      prom(
        'histogram_quantile(0.5, sum by (le) (rate(nx_cache_request_duration_seconds_bucket{operation="get"}[$__rate_interval])))',
        'p50',
      ),
      prom(
        'histogram_quantile(0.95, sum by (le) (rate(nx_cache_request_duration_seconds_bucket{operation="get"}[$__rate_interval])))',
        'p95',
        'B',
      ),
    ],
    's',
  ),
  timeseries(
    'Durchsatz',
    { x: 0, y: 47, w: 8, h: 8 },
    [prom('sum by (operation) (rate(nx_cache_bytes_total[$__rate_interval]))', '{{operation}}')],
    'Bps',
  ),
  timeseries(
    'Eintragsgröße p50 / p95',
    { x: 8, y: 47, w: 8, h: 8 },
    [
      prom(
        'histogram_quantile(0.5, sum by (le, operation) (rate(nx_cache_entry_bytes_bucket[1h])))',
        'p50 {{operation}}',
      ),
      prom(
        'histogram_quantile(0.95, sum by (le, operation) (rate(nx_cache_entry_bytes_bucket[1h])))',
        'p95 {{operation}}',
        'B',
      ),
    ],
    'bytes',
  ),
  timeseries(
    'Abgelehnt / Fehler',
    { x: 16, y: 47, w: 8, h: 8 },
    [
      prom(
        'sum by (outcome) (increase(nx_cache_requests_total{outcome=~"error|unauthorized|forbidden|too-large|invalid"}[$__rate_interval]))',
        '{{outcome}}',
      ),
    ],
    'short',
    { custom: { drawStyle: 'bars', fillOpacity: 80 } },
  ),
];

const textbox = (name, label, value, description) => ({
  name,
  label,
  description,
  type: 'textbox',
  query: value,
  current: { text: value, value },
  options: [{ selected: true, text: value, value }],
  hide: 0,
});

const dashboard = {
  uid: 'nx-metrics',
  title: 'Nx Metrics',
  description: 'Wirkung von Slicing und Remote Cache: Plugin-Records (@berger-engineering/nx-metrics) + Cache-Server',
  tags: ['nx', 'ci', 'cache'],
  timezone: 'browser',
  schemaVersion: 39,
  version: 1,
  editable: true,
  refresh: '1m',
  time: { from: 'now-30d', to: 'now' },
  templating: {
    list: [
      {
        name: 'ci',
        label: 'Wo',
        type: 'custom',
        query: 'all,ci,local',
        hide: 0,
        current: { text: 'all', value: 'all' },
        options: ['all', 'ci', 'local'].map((value, index) => ({ selected: index === 0, text: value, value })),
      },
      {
        name: 'branch',
        label: 'Branch',
        type: 'query',
        datasource: PG,
        hide: 0,
        refresh: 2,
        includeAll: true,
        allValue: '.*',
        multi: false,
        query: 'select distinct git_branch from runs where git_branch is not null order by 1',
        current: { text: 'All', value: '$__all' },
      },
      textbox('rate', '€/Dev-Stunde', '90', 'Stundensatz für die Ersparnis lokaler Läufe'),
      textbox('ci_price', '€/CI-Minute', '0.008', 'Preis einer CI-Minute (GitHub Linux 2-Core ≈ 0,008 $)'),
    ],
  },
  panels,
};

const out = join(import.meta.dirname, '..', 'docker', 'grafana', 'dashboards', 'nx-metrics.json');
writeFileSync(out, `${JSON.stringify(dashboard, null, 2)}\n`);
console.log(`→ ${out} (${panels.length} panels)`);
