#!/usr/bin/env node
// Baut aus results/*.json die Vergleichsmatrix: results/MATRIX.md (GitHub) und results/matrix.html (standalone).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const benchRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const resultsDir = join(benchRoot, 'results');
const catalog = JSON.parse(readFileSync(join(benchRoot, 'spec', 'cases.json'), 'utf8'));
const summary = JSON.parse(readFileSync(join(resultsDir, 'results.json'), 'utf8'));
const results = readdirSync(resultsDir)
  .filter((file) => file.endsWith('.json') && file !== 'results.json')
  .map((file) => JSON.parse(readFileSync(join(resultsDir, file), 'utf8')))
  .sort((a, b) => b.score.overall - a.score.overall);

const DIMENSIONS = [
  ['types', 'Typsicherheit'],
  ['runtime', 'Korrektheit (Wire)'],
  ['angular', 'Angular First-Class'],
  ['static', 'Code-Qualität'],
];
const ICON = { pass: '✅', fail: '❌', unsupported: '➖', missing: '❔' };

const kb = (bytes) => (bytes == null ? '–' : `${(bytes / 1024).toFixed(1)}`);
const yesNo = (value) => (value === true ? '✅' : value === false ? '❌' : value ? String(value) : '–');
const esc = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const mdCell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const pct = (value) => (value == null ? '–' : `${value.toFixed(1)} %`);

function rowsSummary() {
  return results.map((r, index) => ({
    rank: index + 1,
    name: `${r.meta.name}`,
    id: r.id,
    version: r.meta.version,
    overall: r.score.overall,
    dims: Object.fromEntries(DIMENSIONS.map(([dim]) => [dim, r.score.dimensions[dim]?.pct ?? null])),
    counts: Object.values(r.cases).reduce((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {}),
  }));
}

function metricRows() {
  return results.map((r) => {
    const m = r.metrics;
    return {
      name: r.meta.name,
      runtime: r.meta.runtime,
      genMs: r.generation?.ms ?? null,
      files: m.source.files,
      loc: m.source.loc,
      kb: kb(m.source.bytes),
      anyTotal: m.any.total,
      anyTypes: m.any.inTypes,
      noCheck: m.any.tsNoCheckFiles,
      strict: compileLabel(m.strict),
      maxStrict: compileLabel(m.maxStrict),
      strictBad: m.strict.errors > 0 || m.any.tsNoCheckFiles > 0,
      maxStrictBad: m.maxStrict.errors > 0 || m.any.tsNoCheckFiles > 0,
      workarounds: (r.meta.workarounds ?? []).length,
      oneOp: m.bundle.oneOp?.gzip ?? null,
      allOps: m.bundle.allOps?.gzip ?? null,
      deps: m.runtimeDeps.join(', ') || '–',
      gen31: r.meta.generation31 ?? '–',
      outputStyle: r.meta.outputStyle ?? '–',
    };
  });
}

/** Fehlerzahl; echte Syntaxfehler markieren — tsc meldet dann keine semantischen Fehler mehr. */
function compileLabel(compile) {
  return compile.syntaxErrors ? `${compile.errors} ⚠ Syntax` : String(compile.errors);
}

const ANGULAR_FEATURES = [
  ['httpClient', 'Angular HttpClient'],
  ['injectFn', 'inject()-DI'],
  ['provideFn', 'provide…()-Funktion'],
  ['httpResource', 'httpResource / Signals'],
  ['httpContext', 'HttpContext pro Call'],
  ['observeResponse', "observe: 'response'"],
  ['minAngular', 'Min. Angular'],
];

// ------------------------------------------------------------------ Markdown

function markdown() {
  const env = summary.environment;
  const lines = [];
  lines.push('# Vergleichsmatrix: OpenAPI-Client-Generatoren für Angular', '');
  lines.push(
    `> Automatisch erzeugt von \`scripts/build-matrix.mjs\` am ${env.date.slice(0, 10)} — Node ${env.node}, TypeScript ${env.typescript}, Angular ${env.angular}, Vitest ${env.vitest}, ${env.java}, .NET ${env.dotnet}.`,
    `> Gesamtscore = ${Object.entries(summary.dimensionWeights).map(([d, w]) => `${w * 100}% ${d}`).join(' + ')} (jeweils gewichtete Case-Punkte, Gewicht 1–3 je Case).`,
    '',
  );
  lines.push('## Ranking', '');
  lines.push(`| # | Generator | Version | **Gesamt** | ${DIMENSIONS.map(([, label]) => label).join(' | ')} | ✅ | ❌ | ➖ | ❔ |`);
  lines.push(`|---|---|---|---|${DIMENSIONS.map(() => '---').join('|')}|---|---|---|---|`);
  for (const row of rowsSummary()) {
    lines.push(
      `| ${row.rank} | ${row.name} | ${row.version} | **${pct(row.overall)}** | ${DIMENSIONS.map(([dim]) => pct(row.dims[dim])).join(' | ')} | ${row.counts.pass ?? 0} | ${row.counts.fail ?? 0} | ${row.counts.unsupported ?? 0} | ${row.counts.missing ?? 0} |`,
    );
  }
  lines.push('', '✅ bestanden · ❌ fehlgeschlagen (Feature vorhanden, aber falsch) · ➖ nicht unterstützt · ❔ kein Test', '');

  lines.push('## Score je Kategorie', '');
  lines.push(`| Kategorie | ${results.map((r) => r.meta.name).join(' | ')} |`);
  lines.push(`|---|${results.map(() => '---').join('|')}|`);
  for (const [key, label] of Object.entries(catalog.categories)) {
    lines.push(`| ${label} | ${results.map((r) => pct(r.score.categories[key]?.pct)).join(' | ')} |`);
  }
  lines.push('');

  lines.push('## Kennzahlen', '');
  lines.push('| Generator | Laufzeit | Output-Stil | Gen.-Zeit (ms) | Dateien | LOC | KB | `any` gesamt / in Typen | `@ts-nocheck` | Strict-Fehler | Max-Strict-Fehler | Bundle 1 Op / alle (KB gz) | Laufzeit-Deps | OAS 3.1 | Workarounds |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of metricRows()) {
    lines.push(
      `| ${m.name} | ${m.runtime} | ${mdCell(m.outputStyle)} | ${m.genMs ?? '–'} | ${m.files} | ${m.loc} | ${m.kb} | ${m.anyTotal} / ${m.anyTypes} | ${m.noCheck} | ${m.strict} | ${m.maxStrict} | ${kb(m.oneOp)} / ${kb(m.allOps)} | ${mdCell(m.deps)} | ${mdCell(m.gen31)} | ${m.workarounds || '–'} |`,
    );
  }
  lines.push('');

  lines.push('## Angular-Features (laut meta.json, verifiziert durch A-*-Tests)', '');
  lines.push(`| Feature | ${results.map((r) => r.meta.name).join(' | ')} |`);
  lines.push(`|---|${results.map(() => '---').join('|')}|`);
  for (const [key, label] of ANGULAR_FEATURES) {
    lines.push(`| ${label} | ${results.map((r) => mdCell(yesNo(r.meta.angular?.[key]))).join(' | ')} |`);
  }
  lines.push(`| Validierung | ${results.map((r) => mdCell(r.meta.validation ?? '–')).join(' | ')} |`, '');

  lines.push('## Alle Cases', '');
  for (const [category, label] of Object.entries(catalog.categories)) {
    const inCategory = catalog.cases.filter((c) => c.category === category);
    if (!inCategory.length) continue;
    lines.push(`### ${label}`, '');
    lines.push(`| Case | W | Erwartung | ${results.map((r) => r.meta.name).join(' | ')} |`);
    lines.push(`|---|---|---|${results.map(() => ':-:').join('|')}|`);
    for (const c of inCategory) {
      lines.push(`| \`${c.id}\` ${mdCell(c.title)} | ${c.weight} | ${mdCell(c.expect)} | ${results.map((r) => ICON[r.cases[c.id]?.status ?? 'missing']).join(' | ')} |`);
    }
    lines.push('');
  }

  lines.push('## Highlights & Probleme je Generator', '');
  for (const r of results) {
    lines.push(`### ${r.meta.name} ${r.meta.version}`, '');
    for (const item of r.meta.highlights ?? []) lines.push(`- ➕ ${item}`);
    for (const item of r.meta.issues ?? []) lines.push(`- ➖ ${item}`);
    for (const item of r.meta.workarounds ?? []) lines.push(`- ⚠️ Workaround: ${item.description}${item.forceFail?.length ? ` (gewertet als ❌: ${item.forceFail.join(', ')})` : ''}`);
    lines.push(`- Details: [generators/${r.id}/NOTES.md](../generators/${r.id}/NOTES.md)`, '');
  }
  return lines.join('\n') + '\n';
}

// ------------------------------------------------------------------ HTML

function heat(value) {
  if (value == null) return '';
  const tier = value >= 85 ? 'h5' : value >= 70 ? 'h4' : value >= 55 ? 'h3' : value >= 40 ? 'h2' : 'h1';
  return ` class="num ${tier}"`;
}

function html() {
  const env = summary.environment;
  const names = results.map((r) => esc(r.meta.name));
  const caseRows = catalog.cases
    .map((c) => {
      const cells = results
        .map((r) => {
          const res = r.cases[c.id] ?? { status: 'missing' };
          return `<td class="st ${res.status}" title="${esc(res.note ?? res.status)}">${ICON[res.status]}</td>`;
        })
        .join('');
      return `<tr data-dim="${c.dimension}" data-cat="${c.category}" data-text="${esc(`${c.id} ${c.title} ${c.expect}`.toLowerCase())}"><td><code>${c.id}</code><div class="sub">${esc(c.title)}</div></td><td class="num">${c.weight}</td><td class="exp">${esc(c.expect)}</td>${cells}</tr>`;
    })
    .join('\n');

  const ranking = rowsSummary()
    .map(
      (row) =>
        `<tr><td class="num">${row.rank}</td><td><strong>${esc(row.name)}</strong><div class="sub">${esc(row.version)}</div></td><td${heat(row.overall)}><strong>${pct(row.overall)}</strong></td>${DIMENSIONS.map(([dim]) => `<td${heat(row.dims[dim])}>${pct(row.dims[dim])}</td>`).join('')}<td class="num">${row.counts.pass ?? 0}</td><td class="num">${row.counts.fail ?? 0}</td><td class="num">${row.counts.unsupported ?? 0}</td></tr>`,
    )
    .join('\n');

  const categories = Object.entries(catalog.categories)
    .map(([key, label]) => `<tr><td>${esc(label)}</td>${results.map((r) => `<td${heat(r.score.categories[key]?.pct)}>${pct(r.score.categories[key]?.pct)}</td>`).join('')}</tr>`)
    .join('\n');

  const metrics = metricRows()
    .map(
      (m) =>
        `<tr><td><strong>${esc(m.name)}</strong><div class="sub">${esc(m.outputStyle)}</div></td><td>${esc(m.runtime)}</td><td class="num">${m.genMs ?? '–'}</td><td class="num">${m.files}</td><td class="num">${m.loc}</td><td class="num">${m.kb}</td><td class="num">${m.anyTotal} / ${m.anyTypes}</td><td class="num">${m.noCheck}</td><td class="num ${m.strictBad ? 'bad' : 'good'}">${esc(m.strict)}</td><td class="num ${m.maxStrictBad ? 'bad' : 'good'}">${esc(m.maxStrict)}</td><td class="num">${kb(m.oneOp)} / ${kb(m.allOps)}</td><td>${esc(m.deps)}</td><td>${esc(m.gen31)}</td><td class="num">${m.workarounds || '–'}</td></tr>`,
    )
    .join('\n');

  const angular = ANGULAR_FEATURES.map(([key, label]) => `<tr><td>${esc(label)}</td>${results.map((r) => `<td>${esc(yesNo(r.meta.angular?.[key]))}</td>`).join('')}</tr>`).join('\n');

  const notes = results
    .map(
      (r) =>
        `<section class="card"><h3>${esc(r.meta.name)} <span class="sub">${esc(r.meta.version)}</span></h3><ul>${(r.meta.highlights ?? []).map((h) => `<li class="plus">${esc(h)}</li>`).join('')}${(r.meta.issues ?? []).map((h) => `<li class="minus">${esc(h)}</li>`).join('')}${(r.meta.workarounds ?? []).map((w) => `<li class="minus">⚠ Workaround: ${esc(w.description)}</li>`).join('')}</ul></section>`,
    )
    .join('\n');

  const dimButtons = [['all', 'Alle'], ...DIMENSIONS].map(([dim, label]) => `<button data-filter="${dim}"${dim === 'all' ? ' class="active"' : ''}>${esc(label)}</button>`).join('');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenAPI Generator Matrix</title>
<style>
:root{--bg:#fbfaf8;--fg:#1d1d1f;--muted:#6b6b70;--line:#e4e2dd;--card:#fff;--good:#1f7a4d;--bad:#b3261e;--h1:#f6d6d3;--h2:#f8e6cf;--h3:#f3efc9;--h4:#dcefd6;--h5:#c4e6cf;--accent:#3b5bdb}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141416;--fg:#ececee;--muted:#9a9aa1;--line:#2c2c31;--card:#1c1c20;--good:#6fd39b;--bad:#ff8a80;--h1:#4a2522;--h2:#4a3820;--h3:#45421f;--h4:#24402c;--h5:#1d4a31;--accent:#8ea2ff}}
:root[data-theme="dark"]{--bg:#141416;--fg:#ececee;--muted:#9a9aa1;--line:#2c2c31;--card:#1c1c20;--good:#6fd39b;--bad:#ff8a80;--h1:#4a2522;--h2:#4a3820;--h3:#45421f;--h4:#24402c;--h5:#1d4a31;--accent:#8ea2ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1400px;margin:0 auto;padding:24px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px}h3{margin:0 0 8px;font-size:15px}
.meta{color:var(--muted);font-size:13px}.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--card)}
table{border-collapse:collapse;width:100%}th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{position:sticky;top:0;background:var(--card);font-weight:600;font-size:12px;color:var(--muted);white-space:nowrap}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.h1{background:var(--h1)}.h2{background:var(--h2)}.h3{background:var(--h3)}.h4{background:var(--h4)}.h5{background:var(--h5)}
.good{color:var(--good)}.bad{color:var(--bad)}.sub{color:var(--muted);font-size:12px}td.exp{color:var(--muted);font-size:12px;min-width:260px;max-width:420px}td.st{text-align:center;cursor:help}
.controls{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px}button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--fg);padding:5px 12px;border-radius:999px;cursor:pointer}button.active{border-color:var(--accent);color:var(--accent)}
input[type=search]{font:inherit;padding:5px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg);min-width:220px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}.card ul{margin:0;padding-left:18px}.plus::marker{content:"＋ ";color:var(--good)}.minus::marker{content:"－ ";color:var(--bad)}
code{font-size:12px}
</style>
</head>
<body><main>
<h1>OpenAPI-Client-Generatoren für Angular</h1>
<div class="meta">${esc(env.date.slice(0, 10))} · Node ${esc(env.node)} · TypeScript ${esc(env.typescript)} · Angular ${esc(env.angular)} · ${catalog.cases.length} Cases · Gesamtscore = ${Object.entries(summary.dimensionWeights).map(([d, w]) => `${w * 100}% ${d}`).join(' + ')}</div>
<h2>Ranking</h2>
<div class="wrap"><table><thead><tr><th>#</th><th>Generator</th><th>Gesamt</th>${DIMENSIONS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th>✅</th><th>❌</th><th>➖</th></tr></thead><tbody>${ranking}</tbody></table></div>
<h2>Score je Kategorie</h2>
<div class="wrap"><table><thead><tr><th>Kategorie</th>${names.map((n) => `<th>${n}</th>`).join('')}</tr></thead><tbody>${categories}</tbody></table></div>
<h2>Kennzahlen</h2>
<div class="wrap"><table><thead><tr><th>Generator</th><th>Laufzeit</th><th>Gen. ms</th><th>Dateien</th><th>LOC</th><th>KB</th><th>any ges./Typen</th><th>@ts-nocheck</th><th>Strict-Fehler</th><th>Max-Strict</th><th>Bundle 1/alle KB gz</th><th>Deps</th><th>OAS 3.1</th><th>Workarounds</th></tr></thead><tbody>${metrics}</tbody></table></div>
<h2>Angular-Features</h2>
<div class="wrap"><table><thead><tr><th>Feature</th>${names.map((n) => `<th>${n}</th>`).join('')}</tr></thead><tbody>${angular}</tbody></table></div>
<h2>Alle Cases</h2>
<div class="controls">${dimButtons}<input type="search" id="q" placeholder="Case suchen …"></div>
<div class="wrap"><table id="cases"><thead><tr><th>Case</th><th>W</th><th>Erwartung</th>${names.map((n) => `<th>${n}</th>`).join('')}</tr></thead><tbody>${caseRows}</tbody></table></div>
<p class="sub">✅ bestanden · ❌ Feature vorhanden, aber falsch · ➖ nicht unterstützt · ❔ kein Test. Tooltip = Fehlermeldung/Notiz.</p>
<h2>Highlights &amp; Probleme</h2>
<div class="cards">${notes}</div>
</main>
<script>
const rows=[...document.querySelectorAll('#cases tbody tr')];let dim='all',q='';
function apply(){rows.forEach(r=>{r.hidden=!((dim==='all'||r.dataset.dim===dim)&&(!q||r.dataset.text.includes(q)))})}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');dim=b.dataset.filter;apply()}));
document.getElementById('q').addEventListener('input',e=>{q=e.target.value.toLowerCase();apply()});
</script>
</body></html>
`;
}

writeFileSync(join(resultsDir, 'MATRIX.md'), markdown());
writeFileSync(join(resultsDir, 'matrix.html'), html());
console.log(`[matrix] ${results.length} Generatoren → results/MATRIX.md, results/matrix.html`);
if (!existsSync(join(resultsDir, 'raw'))) console.log('[matrix] Hinweis: results/raw fehlt (Tests nicht gelaufen?)');
