/**
 * Loaders for the raw nutrition datasets downloaded by fetch-sources.sh.
 *
 * Every number the catalog carries is read here, from the files on disk.
 * Nothing in this module (or anything that calls it) may invent a value: a
 * nutrient the dataset does not publish stays `undefined`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** scripts/ingredients — works whether tsx runs this file as CJS or ESM. */
export const INGREDIENTS_DIR = join(
  typeof __dirname === 'string' ? __dirname : dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const OUT_DIR = join(INGREDIENTS_DIR, 'out');
export const SOURCES_DIR = join(OUT_DIR, 'sources');

export const FDC_FOUNDATION_RELEASE = '2026-04-30';
export const FDC_SR_LEGACY_RELEASE = '2018-04';
export const CIQUAL_RELEASE = '2025-11-03';

// ── CSV ─────────────────────────────────────────────────────────────────────

/** RFC-4180 CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let quoted = false;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      quoted = true;
      i++;
    } else if (c === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readCsv(path: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ── FDC ─────────────────────────────────────────────────────────────────────

export type FdcDataset = 'foundation' | 'sr_legacy';

export type FdcPortion = {
  id: number;
  seq: number;
  amount: number;
  /** measure_unit name ("cup", "medium", …) or "" when undetermined. */
  unitName: string;
  description: string;
  modifier: string;
  gramWeight: number;
};

export type FdcFood = {
  fdcId: number;
  dataset: FdcDataset;
  description: string;
  category: string;
  /** nutrient_id → amount per 100 g, exactly as published. */
  nutrients: Map<number, number>;
  portions: FdcPortion[];
};

/** FDC nutrient ids used by the catalog. */
export const N = {
  energyKcal: 1008,
  energyAtwaterGeneral: 2047,
  energyAtwaterSpecific: 2048,
  protein: 1003,
  fat: 1004,
  carbByDifference: 1005,
  carbBySummation: 1050,
  fiber: 1079,
  sugarsTotalNlea: 2000,
  sugarsTotal: 1063,
  satFat: 1258,
  sodium: 1093,
  alcohol: 1018,
} as const;

function loadFdcDataset(dir: string, dataset: FdcDataset): FdcFood[] {
  const base = join(SOURCES_DIR, dir);
  const cats = new Map(
    readCsv(join(base, 'food_category.csv')).map((r) => [r.id, r.description ?? '']),
  );
  const units = new Map(readCsv(join(base, 'measure_unit.csv')).map((r) => [r.id, r.name ?? '']));
  const wanted = dataset === 'foundation' ? 'foundation_food' : 'sr_legacy_food';
  const foods = new Map<number, FdcFood>();
  for (const r of readCsv(join(base, 'food.csv'))) {
    if (r.data_type !== wanted) continue;
    const fdcId = Number(r.fdc_id);
    foods.set(fdcId, {
      fdcId,
      dataset,
      description: r.description ?? '',
      category: cats.get(r.food_category_id ?? '') ?? '',
      nutrients: new Map(),
      portions: [],
    });
  }
  for (const r of readCsv(join(base, 'food_nutrient.csv'))) {
    const f = foods.get(Number(r.fdc_id));
    if (!f || r.amount === '' || r.amount === undefined) continue;
    const id = Number(r.nutrient_id);
    // First published value wins (food_nutrient has one row per nutrient).
    if (!f.nutrients.has(id)) f.nutrients.set(id, Number(r.amount));
  }
  for (const r of readCsv(join(base, 'food_portion.csv'))) {
    const f = foods.get(Number(r.fdc_id));
    if (!f) continue;
    const unit = units.get(r.measure_unit_id ?? '') ?? '';
    f.portions.push({
      id: Number(r.id),
      seq: r.seq_num ? Number(r.seq_num) : 0,
      amount: Number(r.amount) || 1,
      unitName: unit === 'undetermined' ? '' : unit,
      description: r.portion_description ?? '',
      modifier: r.modifier ?? '',
      gramWeight: Number(r.gram_weight),
    });
  }
  for (const f of foods.values()) f.portions.sort((a, b) => a.seq - b.seq || a.id - b.id);
  return [...foods.values()];
}

// ── CIQUAL ──────────────────────────────────────────────────────────────────

export type CiqualFood = {
  code: number;
  nameFr: string;
  nameEn: string;
  group: string;
  /** const_code → raw `teneur` string (trimmed), exactly as published. */
  raw: Map<number, string>;
};

/** CIQUAL constituent codes used by the catalog. */
export const C = {
  kcalEu: 328,
  protein: 25000,
  carbs: 31000,
  sugars: 32000,
  polyols: 34000,
  fiber: 34100,
  fat: 40000,
  satFat: 40302,
  sodium: 10110,
  alcohol: 60000,
} as const;

/**
 * The ONE rule for CIQUAL value strings (documented in SOURCES.md):
 *   "12,3"   → 12.3   (comma decimal)
 *   "traces" → 0
 *   "< 0,5"  → 0.25   (half the detection limit)
 *   "-"      → undefined (not analysed: a gap, never a zero)
 */
export function parseCiqualValue(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const s = raw.trim();
  if (s === '' || s === '-') return undefined;
  if (s === 'traces') return 0;
  const lt = /^<\s*([0-9]+(?:,[0-9]+)?)$/.exec(s);
  if (lt?.[1]) return Number(lt[1].replace(',', '.')) / 2;
  const num = /^[0-9]+(?:,[0-9]+)?$/.exec(s);
  if (num) return Number(s.replace(',', '.'));
  throw new Error(`Unrecognised CIQUAL value "${raw}"`);
}

function xmlRecords(text: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  const fieldRe = /<([a-zA-Z_]+)>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const rec: Record<string, string> = {};
    let f: RegExpExecArray | null;
    fieldRe.lastIndex = 0;
    const body = m[1] ?? '';
    while ((f = fieldRe.exec(body))) rec[f[1] ?? ''] = decodeXml((f[2] ?? '').trim());
    out.push(rec);
  }
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

function loadCiqual(): CiqualFood[] {
  const dir = join(SOURCES_DIR, 'ciqual');
  const read = (f: string) => readFileSync(join(dir, f), 'utf8').replace(/^﻿/, '');
  const groups = new Map<string, string>();
  for (const g of xmlRecords(
    read(`alim_grp_${CIQUAL_RELEASE.replace(/-/g, '_')}.xml`),
    'ALIM_GRP',
  )) {
    if (g.alim_ssssgrp_code && g.alim_ssssgrp_code !== '000000')
      groups.set(g.alim_ssssgrp_code, g.alim_ssssgrp_nom_eng ?? '');
    if (g.alim_ssgrp_code && !groups.has(g.alim_ssgrp_code))
      groups.set(g.alim_ssgrp_code, g.alim_ssgrp_nom_eng ?? '');
  }
  const foods = new Map<number, CiqualFood>();
  for (const a of xmlRecords(read(`alim_${CIQUAL_RELEASE.replace(/-/g, '_')}.xml`), 'ALIM')) {
    const code = Number(a.alim_code);
    foods.set(code, {
      code,
      nameFr: a.alim_nom_fr ?? '',
      nameEn: a.alim_nom_eng ?? '',
      group: groups.get(a.alim_ssssgrp_code ?? '') || groups.get(a.alim_ssgrp_code ?? '') || '',
      raw: new Map(),
    });
  }
  const compo = read(`compo_${CIQUAL_RELEASE.replace(/-/g, '_')}.xml`);
  const wanted = new Set<number>(Object.values(C));
  const re =
    /<alim_code>\s*(\d+)\s*<\/alim_code>\s*<const_code>\s*(\d+)\s*<\/const_code>\s*<teneur>([^<]*)<\/teneur>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(compo))) {
    const cc = Number(m[2]);
    if (!wanted.has(cc)) continue;
    const f = foods.get(Number(m[1]));
    if (f) f.raw.set(cc, decodeXml((m[3] ?? '').trim()));
  }
  return [...foods.values()];
}

// ── Facade ──────────────────────────────────────────────────────────────────

export type Sources = {
  fdc: Map<number, FdcFood>;
  ciqual: Map<number, CiqualFood>;
};

let cached: Sources | undefined;

export function loadSources(): Sources {
  if (cached) return cached;
  if (!existsSync(join(SOURCES_DIR, 'fdc-foundation', 'food.csv'))) {
    throw new Error(
      `Datasets missing in ${SOURCES_DIR}. Run scripts/ingredients/fetch-sources.sh first.`,
    );
  }
  const fdc = new Map<number, FdcFood>();
  for (const f of loadFdcDataset('fdc-foundation', 'foundation')) fdc.set(f.fdcId, f);
  for (const f of loadFdcDataset('fdc-sr-legacy', 'sr_legacy')) fdc.set(f.fdcId, f);
  const ciqual = new Map(loadCiqual().map((f) => [f.code, f]));
  cached = { fdc, ciqual };
  return cached;
}
