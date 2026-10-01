/**
 * Candidate finder for the draft list: grep the downloaded datasets by
 * description so a row's source id is picked from the files, never from memory.
 *
 *   pnpm ingredients:search "garlic, raw" "^chickpeas" …
 *   pnpm ingredients:search --id fdc:169230 ciqual:12345
 *
 * Each query is a case-insensitive regex (all whitespace-separated words of a
 * plain query must match, in any order). Output per hit:
 *   F=Foundation S=SR Legacy Q=CIQUAL · id · kcal P C(avail) F fib · portions · description
 */
import { C, loadSources, N, parseCiqualValue, type CiqualFood, type FdcFood } from './lib/sources';

const args = process.argv.slice(2);
const limit = Number(process.env.LIMIT ?? 12);
const src = loadSources();

const fmt = (v: number | undefined) => (v === undefined ? '  -  ' : v.toFixed(1).padStart(5));

function fdcLine(f: FdcFood): string {
  const g = (id: number) => f.nutrients.get(id);
  const kcal = g(N.energyKcal) ?? g(N.energyAtwaterSpecific) ?? g(N.energyAtwaterGeneral);
  const cbd = g(N.carbByDifference);
  const fib = g(N.fiber);
  const carbs = cbd !== undefined ? Math.max(0, cbd - (fib ?? 0)) : g(N.carbBySummation);
  const portions = f.portions
    .map((p) =>
      `${p.amount} ${p.unitName || ''}${p.modifier ? ` ${p.modifier}` : ''}${p.description ? ` ${p.description}` : ''}=${p.gramWeight}`.replace(
        /\s+/g,
        ' ',
      ),
    )
    .slice(0, 6)
    .join('; ');
  const complete = [kcal, g(N.protein), carbs, g(N.fat), fib].every((v) => v !== undefined)
    ? '*'
    : ' ';
  return `${f.dataset === 'foundation' ? 'F' : 'S'}${complete}${String(f.fdcId).padEnd(7)} ${fmt(kcal)} ${fmt(g(N.protein))} ${fmt(carbs)} ${fmt(g(N.fat))} ${fmt(fib)} | ${f.description}${portions ? `  [${portions}]` : ''}`;
}

function ciqLine(f: CiqualFood): string {
  const g = (c: number) => parseCiqualValue(f.raw.get(c));
  return `Q ${String(f.code).padEnd(7)} ${fmt(g(C.kcalEu))} ${fmt(g(C.protein))} ${fmt(g(C.carbs))} ${fmt(g(C.fat))} ${fmt(g(C.fiber))} | ${f.nameEn} / ${f.nameFr}`;
}

function matcher(q: string): (s: string) => boolean {
  if (/[\^$|()[\]\\.*+?]/.test(q)) {
    const re = new RegExp(q, 'i');
    return (s) => re.test(s);
  }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return (s) => {
    const l = s.toLowerCase();
    return words.every((w) => l.includes(w));
  };
}

if (args[0] === '--id') {
  for (const ref of args.slice(1)) {
    const [db, id] = ref.split(':');
    if (db === 'fdc') {
      const f = src.fdc.get(Number(id));
      console.log(f ? fdcLine(f) : `${ref}: not found`);
      if (f)
        for (const p of f.portions)
          console.log(
            `     portion ${p.id}: ${p.amount} [${p.unitName}] mod="${p.modifier}" desc="${p.description}" = ${p.gramWeight} g`,
          );
    } else {
      const f = src.ciqual.get(Number(id));
      console.log(f ? ciqLine(f) : `${ref}: not found`);
    }
  }
} else {
  for (const q of args) {
    const m = matcher(q);
    console.log(`\n### ${q}`);
    const fdc = [...src.fdc.values()].filter((f) => m(f.description));
    fdc.sort((a, b) =>
      a.dataset === b.dataset
        ? a.description.length - b.description.length
        : a.dataset === 'foundation'
          ? -1
          : 1,
    );
    for (const f of fdc.slice(0, limit)) console.log(fdcLine(f));
    if (fdc.length > limit) console.log(`  … ${fdc.length - limit} more FDC`);
    const cq = [...src.ciqual.values()].filter((f) => m(f.nameEn) || m(f.nameFr));
    cq.sort((a, b) => a.nameEn.length - b.nameEn.length);
    for (const f of cq.slice(0, Math.ceil(limit / 2))) console.log(ciqLine(f));
  }
}
