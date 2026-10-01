/**
 * Owner review page for the catalog candidate (plan §4.4 step 5).
 *
 *   pnpm ingredients:build && pnpm ingredients:review
 *
 * Reads out/catalog.candidate.json + out/catalog.build.json and writes a single
 * self-contained, offline HTML file: out/catalog-review.html. The page has:
 *   - a summary: rows per category vs the §4.2 targets, source split, demand
 *     coverage, validator counts and coverage gaps;
 *   - a seeded, deterministic ~5% spot-check sample. The owner compares those
 *     rows against the linked FDC / CIQUAL source pages;
 *   - the full table grouped by category, with validator flags inline;
 *   - the demand names that resolve to no row, classified.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  energyCheck,
  type CatalogEntry,
  type ValidationIssue,
} from '../../packages/database/src/catalog/validate';
import type { BuildOutput, RowDiagnostics } from './build-catalog';
import { OUT_DIR } from './lib/sources';

/** §4.2 taxonomy: plan group → categories and target count. */
const TARGETS: { group: string; categories: string[]; target: number }[] = [
  { group: 'Vegetables (fresh + frozen)', categories: ['VEGETABLE'], target: 150 },
  { group: 'Fruits (fresh + frozen + dried)', categories: ['FRUIT'], target: 95 },
  { group: 'Fresh herbs', categories: ['HERB_FRESH'], target: 25 },
  { group: 'Spices & dried herbs', categories: ['SPICE_DRIED'], target: 70 },
  { group: 'Legumes', categories: ['LEGUME'], target: 45 },
  { group: 'Grains & cereals', categories: ['GRAIN_CEREAL'], target: 60 },
  { group: 'Flours & baking', categories: ['FLOUR_BAKING'], target: 40 },
  { group: 'Pasta & noodles', categories: ['PASTA_NOODLE'], target: 25 },
  { group: 'Bread & bakery', categories: ['BREAD_BAKERY'], target: 30 },
  { group: 'Nuts, seeds & butters', categories: ['NUT_SEED'], target: 50 },
  {
    group: 'Beef / pork / lamb / veal / game',
    categories: ['BEEF', 'PORK', 'LAMB_GOAT', 'GAME'],
    target: 80,
  },
  { group: 'Poultry', categories: ['POULTRY'], target: 40 },
  { group: 'Processed meat & charcuterie', categories: ['PROCESSED_MEAT'], target: 40 },
  { group: 'Fish', categories: ['FISH'], target: 50 },
  { group: 'Seafood', categories: ['SEAFOOD'], target: 20 },
  { group: 'Eggs', categories: ['EGG'], target: 8 },
  { group: 'Milk, cream & yogurt', categories: ['DAIRY_MILK', 'DAIRY_YOGURT_CREAM'], target: 45 },
  { group: 'Cheese', categories: ['DAIRY_CHEESE'], target: 45 },
  { group: 'Plant protein & plant milks', categories: ['PLANT_PROTEIN', 'PLANT_MILK'], target: 30 },
  { group: 'Oils & fats', categories: ['OIL_FAT'], target: 25 },
  { group: 'Condiments, sauces, pastes', categories: ['CONDIMENT_SAUCE'], target: 80 },
  { group: 'Vinegars', categories: ['VINEGAR'], target: 10 },
  { group: 'Sweeteners', categories: ['SWEETENER'], target: 20 },
  {
    group: 'Canned, jarred, pickled, fermented',
    categories: ['CANNED_JARRED', 'PICKLED_FERMENTED'],
    target: 45,
  },
  { group: 'Stocks & broths', categories: ['STOCK_BROTH'], target: 10 },
  { group: 'Beverages & cooking alcohol', categories: ['BEVERAGE', 'ALCOHOL_COOKING'], target: 20 },
  { group: 'Supplements & sports', categories: ['SUPPLEMENT'], target: 15 },
  {
    group: 'Other / prepared building blocks',
    categories: ['OTHER', 'SNACK_PREPARED'],
    target: 27,
  },
];

/** Spot-check sample: FNV-1a over SEED + slug, lowest ceil(5%) hashes. */
const SAMPLE_SEED = 'chefer-catalog-v1';
const SAMPLE_FRACTION = 0.05;

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const num = (v: number | null | undefined, d = 1) =>
  v == null ? '<span class="missing">—</span>' : Number(v.toFixed(d)).toString();
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');

function main() {
  const entries: CatalogEntry[] = JSON.parse(
    readFileSync(join(OUT_DIR, 'catalog.candidate.json'), 'utf8'),
  );
  const build: BuildOutput = JSON.parse(readFileSync(join(OUT_DIR, 'catalog.build.json'), 'utf8'));
  const diag = new Map<string, RowDiagnostics>(build.rows.map((r) => [r.slug, r]));
  const issuesBySlug = new Map<string, ValidationIssue[]>();
  for (const i of build.issues) issuesBySlug.set(i.slug, [...(issuesBySlug.get(i.slug) ?? []), i]);

  const sampleSize = Math.ceil(entries.length * SAMPLE_FRACTION);
  const sample = new Set(
    [...entries]
      .sort(
        (a, b) =>
          fnv1a(SAMPLE_SEED + a.slug) - fnv1a(SAMPLE_SEED + b.slug) || (a.slug < b.slug ? -1 : 1),
      )
      .slice(0, sampleSize)
      .map((e) => e.slug),
  );

  const byCat = new Map<string, CatalogEntry[]>();
  for (const e of entries) byCat.set(e.category, [...(byCat.get(e.category) ?? []), e]);
  const bySource = new Map<string, number>();
  for (const r of build.rows)
    bySource.set(r.sourceDataset, (bySource.get(r.sourceDataset) ?? 0) + 1);
  const reviewRows = build.rows.filter((r) => r.review);
  const cov = build.coverage;
  const s = build.summary;
  const densityGaps = build.issues.filter((i) => i.rule === 'density').map((i) => i.slug);
  const countGaps = build.issues.filter((i) => i.rule === 'count-portion').map((i) => i.slug);

  // ── summary ──
  const targetRows = TARGETS.map((t) => {
    const n = t.categories.reduce((acc, c) => acc + (byCat.get(c)?.length ?? 0), 0);
    const cls = n >= t.target ? 'ok' : n >= 0.75 * t.target ? 'near' : 'low';
    return `<tr><td>${esc(t.group)}</td><td class="mono small">${t.categories.join(', ')}</td><td class="r">${n}</td><td class="r">${t.target}</td><td class="r ${cls}">${n - t.target >= 0 ? '+' : ''}${n - t.target}</td></tr>`;
  }).join('');
  const totalTarget = TARGETS.reduce((a, t) => a + t.target, 0);
  const ruleRows = Object.entries(s.byRule)
    .sort()
    .map(
      ([rule, c]) =>
        `<tr><td class="mono">${esc(rule)}</td><td class="r">${c.error}</td><td class="r">${c.warning}</td><td class="r">${c.info}</td></tr>`,
    )
    .join('');

  // ── main table ──
  const categoryOrder = TARGETS.flatMap((t) => t.categories).filter((c) => byCat.has(c));
  for (const c of byCat.keys()) if (!categoryOrder.includes(c)) categoryOrder.push(c);
  const sections = categoryOrder
    .map((cat) => {
      const rows = (byCat.get(cat) ?? []).map((e) => {
        const d = diag.get(e.slug);
        const iss = issuesBySlug.get(e.slug) ?? [];
        const ec = energyCheck(e);
        const en = e.aliases.filter((a) => a.locale === 'en').map((a) => a.alias);
        const ro = e.aliases.filter((a) => a.locale === 'ro').map((a) => a.alias);
        const portions = (d?.portionsDetail ?? [])
          .map(
            (p) =>
              `<span class="chip" title="${esc(`${p.text} · ${p.source}`)}">${esc(p.unit)} ${num(p.grams, 1)}&nbsp;g</span>`,
          )
          .join(' ');
        const flags = iss
          .map(
            (i) => `<div class="flag ${i.severity}"><b>${esc(i.rule)}</b> ${esc(i.message)}</div>`,
          )
          .join('');
        const isSample = sample.has(e.slug);
        const cls = [
          isSample ? 'sample' : '',
          iss.some((i) => i.severity === 'error') ? 'has-error' : '',
          d?.review ? 'has-review' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const deltaCls = ec && !ec.ok ? 'bad' : '';
        return `<tr class="${cls}" data-sample="${isSample ? 1 : 0}" data-flag="${iss.length || d?.review ? 1 : 0}" data-text="${esc(`${e.slug} ${e.name} ${en.join(' ')} ${ro.join(' ')}`.toLowerCase())}">
<td>${isSample ? '<span class="badge">sample</span> ' : ''}<b>${esc(e.name)}</b><div class="mono small muted">${esc(e.slug)}</div>${d?.review ? `<div class="review">review: ${esc(d.review)}</div>` : ''}</td>
<td class="small"><div><span class="loc">en</span> ${esc(en.join(' · '))}</div>${ro.length ? `<div><span class="loc">ro</span> ${esc(ro.join(' · '))}</div>` : ''}</td>
<td class="r">${num(e.kcalPer100g, 0)}</td><td class="r">${num(e.proteinPer100g)}</td><td class="r">${num(e.carbsPer100g)}</td><td class="r">${num(e.fatPer100g)}</td><td class="r">${num(e.fiberPer100g)}</td>
<td class="r ${deltaCls}">${ec ? `${ec.delta >= 0 ? '+' : ''}${ec.delta.toFixed(0)}` : '—'}</td>
<td class="small">${portions || '<span class="muted">—</span>'}</td>
<td class="r">${e.densityGPerMl != null ? num(e.densityGPerMl, 3) : '<span class="muted">—</span>'}</td>
<td class="small"><a href="${esc(d?.sourceUrl)}" target="_blank" rel="noopener">${esc(e.sourceRef)}</a> <span class="ds">${esc(d?.sourceDataset)}</span><div class="muted">${esc(d?.sourceDescription)}</div>${e.sourceNote ? `<div class="note">${esc(e.sourceNote)}</div>` : ''}${flags}</td>
</tr>`;
      });
      return `<tbody class="cat" data-cat="${esc(cat)}"><tr class="cathead"><th colspan="11">${esc(cat)} <span class="muted">(${rows.length})</span></th></tr>${rows.join('')}</tbody>`;
    })
    .join('');

  // ── coverage ──
  const missRows = cov.unresolved
    .map(
      (u) =>
        `<tr><td>${esc(u.name)}</td><td class="r">${u.lines}</td><td><span class="cls ${u.class}">${u.class}</span></td></tr>`,
    )
    .join('');
  const missByClass = cov.unresolved.reduce<Record<string, { names: number; lines: number }>>(
    (acc, u) => {
      const c = (acc[u.class] ??= { names: 0, lines: 0 });
      c.names++;
      c.lines += u.lines;
      return acc;
    },
    {},
  );
  const resolvedRows = cov.resolved
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td class="r">${r.lines}</td><td class="mono small">${esc(r.key)}</td><td class="mono small">${esc(r.slug)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Catalog v1 review</title>
<style>
:root{--bg:#fbfaf7;--fg:#1f2328;--muted:#6b7280;--line:#e5e2da;--card:#fff;--accent:#2f6f4e;--warn:#9a6700;--err:#b42318;--info:#3b5bdb;--sample:#fff7d6}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header,section{max-width:1500px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0 4px}h2{font-size:17px;margin:24px 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.card .v{font-size:22px;font-weight:600}.card .k{color:var(--muted);font-size:12px}
table{border-collapse:collapse;width:100%;background:var(--card)}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left}
thead th{position:sticky;top:0;background:#f3f1ea;z-index:1;font-size:12px}
.r{text-align:right;white-space:nowrap}.mono{font-family:ui-monospace,Menlo,monospace}.small{font-size:12px}.muted{color:var(--muted)}
.ok{color:var(--accent)}.near{color:var(--warn)}.low{color:var(--err)}.bad{color:var(--err);font-weight:600}
.missing{color:var(--err);font-weight:700}
.cathead th{background:#ece8dc;font-size:13px;position:sticky;top:30px}
tr.sample td{background:var(--sample)}
.badge{background:#f5c518;color:#3d2e00;border-radius:4px;padding:0 5px;font-size:11px;font-weight:700}
.chip{display:inline-block;border:1px solid var(--line);border-radius:10px;padding:0 6px;margin:1px 0;font-size:11px;white-space:nowrap;background:#faf8f3}
.loc{display:inline-block;min-width:18px;font-size:10px;color:#fff;background:#8a8f98;border-radius:3px;text-align:center;margin-right:3px}
.ds{font-size:10px;color:var(--muted)}.note{font-size:11px;color:#4b5563;margin-top:2px}
.review{font-size:11px;color:#7c2d12;background:#ffedd5;border-radius:4px;padding:1px 4px;margin-top:3px}
.flag{font-size:11px;margin-top:2px;padding:1px 4px;border-radius:4px}.flag.error{background:#fee4e2;color:var(--err)}.flag.warning{background:#fef0c7;color:var(--warn)}.flag.info{background:#e0e7ff;color:var(--info)}
.cls{font-size:11px;border-radius:4px;padding:0 5px}.cls.gap{background:#fee4e2;color:var(--err)}.cls.compound{background:#e0e7ff;color:var(--info)}.cls.prepared{background:#ecfdf3;color:var(--accent)}.cls.junk{background:#eee;color:#555}
.controls{position:sticky;top:0;z-index:3;background:var(--bg);padding:8px 0;display:flex;gap:12px;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--line)}
input[type=search]{padding:6px 8px;border:1px solid var(--line);border-radius:6px;min-width:240px}
details{margin:8px 0}summary{cursor:pointer;font-weight:600}
.wrap{overflow-x:auto}
</style></head><body>
<header>
<h1>Ingredient catalog v1: review</h1>
<div class="muted">Generated from <span class="mono">scripts/ingredients/catalog-draft.json</span> with FDC Foundation ${esc(build.generatedFrom.fdcFoundation)}, FDC SR Legacy ${esc(build.generatedFrom.fdcSrLegacy)} and CIQUAL ${esc(build.generatedFrom.ciqual)}. Every number on this page is read from those datasets by script.</div>
<div class="grid" style="margin-top:12px">
<div class="card"><div class="v">${entries.length}</div><div class="k">rows (target ~${totalTarget})</div></div>
<div class="card"><div class="v">${pct(cov.resolvedLines, cov.lines)}</div><div class="k">demand lines resolved (${cov.resolvedLines}/${cov.lines})</div></div>
<div class="card"><div class="v">${pct(cov.resolvedNames, cov.names)}</div><div class="k">demand names resolved (${cov.resolvedNames}/${cov.names})</div></div>
<div class="card"><div class="v">${cov.top95Resolved}/${cov.top95Names}</div><div class="k">names in the top 95% of lines resolved</div></div>
<div class="card"><div class="v">${s.errors} / ${s.warnings} / ${s.infos}</div><div class="k">validator errors / warnings / info</div></div>
<div class="card"><div class="v">${sampleSize}</div><div class="k">spot-check rows (seed "${SAMPLE_SEED}")</div></div>
<div class="card"><div class="v">${reviewRows.length}</div><div class="k">rows flagged for owner review</div></div>
</div>
<div class="grid" style="margin-top:10px">
${[...bySource]
  .sort()
  .map(
    ([k, v]) =>
      `<div class="card"><div class="v">${v}</div><div class="k">source: ${esc(k)}</div></div>`,
  )
  .join('')}
<div class="card"><div class="v">${densityGaps.length}</div><div class="k">volume-measured rows without density</div></div>
<div class="card"><div class="v">${countGaps.length}</div><div class="k">VEG/FRUIT/EGG/BREAD rows without a count portion</div></div>
</div>
</header>
<section>
<h2>Rows per category vs §4.2 target</h2>
<div class="wrap"><table><thead><tr><th>Group</th><th>Categories</th><th class="r">Rows</th><th class="r">Target</th><th class="r">Δ</th></tr></thead><tbody>${targetRows}</tbody></table></div>
<h2>Validator results by rule</h2>
<div class="wrap"><table style="max-width:520px"><thead><tr><th>Rule</th><th class="r">Errors</th><th class="r">Warnings</th><th class="r">Info</th></tr></thead><tbody>${ruleRows}</tbody></table></div>
<details><summary>Rows without density (${densityGaps.length})</summary><p class="mono small">${esc(densityGaps.join(', '))}</p></details>
<details><summary>Rows without a count portion (${countGaps.length})</summary><p class="mono small">${esc(countGaps.join(', '))}</p></details>
<details><summary>Rows flagged for owner review (${reviewRows.length})</summary><ul class="small">${reviewRows.map((r) => `<li><span class="mono">${esc(r.slug)}</span>: ${esc(r.review)}</li>`).join('')}</ul></details>
</section>
<section>
<h2>Catalog</h2>
<p class="small muted">Spot-check rows are highlighted. Check each one against its source page: kcal, protein, carbs (FDC rows show carbohydrate by difference minus fiber, per D2), fat, fiber and portions. Energy Δ = published kcal − (4P + 4C + 9F + 2Fiber).</p>
<div class="controls">
<label><input type="checkbox" id="onlySample"> Show only the spot-check sample</label>
<label><input type="checkbox" id="onlyFlag"> Show only rows with flags or review notes</label>
<input type="search" id="q" placeholder="Filter by name, slug or alias">
<span id="count" class="muted small"></span>
</div>
<div class="wrap"><table id="cat"><thead><tr><th>Name / slug</th><th>Aliases</th><th class="r">kcal</th><th class="r">P</th><th class="r">C</th><th class="r">F</th><th class="r">Fib</th><th class="r">Energy Δ</th><th>Portions</th><th class="r">g/ml</th><th>Source</th></tr></thead>${sections}</table></div>
</section>
<section>
<h2>Demand coverage</h2>
<p class="small">Each prod demand name is normalized (lowercase, diacritics stripped, parentheticals, text after the first comma and prep words removed, plurals stripped) and looked up against slugs and aliases. No fuzzy matching is used. Unresolved: ${Object.entries(
    missByClass,
  )
    .map(([k, v]) => `<span class="cls ${k}">${k}</span> ${v.names} names / ${v.lines} lines`)
    .join(
      ' · ',
    )}. <i>compound</i> and <i>prepared</i> lines are expected misses: the §7 legacy mapping splits or maps them. <i>gap</i> means a real ingredient the catalog lacks.</p>
<div class="wrap"><table style="max-width:760px"><thead><tr><th>Unresolved demand name</th><th class="r">Lines</th><th>Class</th></tr></thead><tbody>${missRows}</tbody></table></div>
<details><summary>Resolved demand names (${cov.resolved.length}): name → matched key → slug</summary>
<div class="wrap"><table><thead><tr><th>Demand name</th><th class="r">Lines</th><th>Matched key</th><th>Slug</th></tr></thead><tbody>${resolvedRows}</tbody></table></div></details>
</section>
<script>
(function(){
  var onlySample=document.getElementById('onlySample'),onlyFlag=document.getElementById('onlyFlag'),q=document.getElementById('q'),count=document.getElementById('count');
  function apply(){
    var s=onlySample.checked,f=onlyFlag.checked,t=q.value.trim().toLowerCase(),shown=0;
    document.querySelectorAll('#cat tbody.cat').forEach(function(tb){
      var any=0;
      tb.querySelectorAll('tr[data-text]').forEach(function(tr){
        var ok=(!s||tr.dataset.sample==='1')&&(!f||tr.dataset.flag==='1')&&(!t||tr.dataset.text.indexOf(t)!==-1);
        tr.style.display=ok?'':'none'; if(ok){any++;shown++;}
      });
      tb.style.display=any?'':'none';
    });
    count.textContent=shown+' rows shown';
  }
  [onlySample,onlyFlag].forEach(function(el){el.addEventListener('change',apply)});
  q.addEventListener('input',apply);
  apply();
})();
</script>
</body></html>
`;
  const out = join(OUT_DIR, 'catalog-review.html');
  writeFileSync(out, html);
  console.log(`wrote ${out} (${entries.length} rows, ${sampleSize} in the spot-check sample)`);
}

main();
