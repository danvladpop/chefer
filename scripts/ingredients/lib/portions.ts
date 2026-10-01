/**
 * FDC food_portion records → canonical portion units and densities.
 * Rules are documented in packages/database/data/ingredients/SOURCES.md.
 */
import type { FdcFood, FdcPortion } from './sources';

export type MappedPortion = {
  unit: string;
  grams: number;
  source: string;
  portionId: number;
  fdcId: number;
  text: string;
};
export type VolumeMeasure = {
  kind: 'cup' | 'tbsp' | 'tsp' | 'floz' | 'ml';
  ml: number;
  qualified: boolean;
  portion: FdcPortion;
  fdcId: number;
  text: string;
};

const DIRECT: Record<string, string> = {
  piece: 'piece',
  pieces: 'piece',
  small: 'small',
  medium: 'medium',
  large: 'large',
  clove: 'clove',
  cloves: 'clove',
  slice: 'slice',
  slices: 'slice',
  strip: 'slice',
  strips: 'slice',
  can: 'can',
  jar: 'jar',
  bunch: 'bunch',
  sprig: 'sprig',
  sprigs: 'sprig',
  leaf: 'leaf',
  leaves: 'leaf',
  head: 'head',
  bulb: 'head',
  stalk: 'stalk',
  stalks: 'stalk',
  fillet: 'fillet',
  filet: 'fillet',
  breast: 'breast',
  thigh: 'thigh',
  drumstick: 'drumstick',
  wing: 'wing',
  scoop: 'scoop',
  bar: 'bar',
  sheet: 'sheet',
  cube: 'cube',
  packet: 'packet',
  ear: 'ear',
  wedge: 'wedge',
  stick: 'stick',
  // food-named counts → one piece
  fruit: 'piece',
  each: 'piece',
  whole: 'piece',
  item: 'piece',
  egg: 'piece',
  pepper: 'piece',
  potato: 'piece',
  tomato: 'piece',
  tomatoes: 'piece',
  onion: 'piece',
  banana: 'piece',
  plantain: 'piece',
  avocado: 'piece',
  carrot: 'piece',
  spear: 'piece',
  floret: 'piece',
  pod: 'piece',
  root: 'piece',
  kernel: 'piece',
  kernels: 'piece',
  nut: 'piece',
  date: 'piece',
  fig: 'piece',
  olive: 'piece',
  shrimp: 'piece',
  mushroom: 'piece',
  radish: 'piece',
  link: 'piece',
  frankfurter: 'piece',
  sausage: 'piece',
  patty: 'piece',
  bun: 'piece',
  roll: 'piece',
  tortilla: 'piece',
  pita: 'piece',
  bagel: 'piece',
  muffin: 'piece',
  biscuit: 'piece',
  cracker: 'piece',
  crackers: 'piece',
  cake: 'piece',
  cookie: 'piece',
  chop: 'piece',
  steak: 'piece',
  cutlet: 'piece',
  oyster: 'piece',
  scallop: 'piece',
  clam: 'piece',
  mussel: 'piece',
  sardine: 'piece',
  anchovy: 'piece',
  apricot: 'piece',
  prune: 'piece',
  berry: 'piece',
  cherry: 'piece',
  grape: 'piece',
  strawberry: 'piece',
  almond: 'piece',
  walnut: 'piece',
  pecan: 'piece',
  cashew: 'piece',
  hazelnut: 'piece',
  chestnut: 'piece',
  pistachio: 'piece',
  peanut: 'piece',
  brazilnut: 'piece',
  sprout: 'piece',
  cherries: 'piece',
  // more food-named counts (plural forms appear as "10 grapes", "8 pods")
  beet: 'piece',
  leek: 'piece',
  cucumber: 'piece',
  eggplant: 'piece',
  artichoke: 'piece',
  parsnip: 'piece',
  turnip: 'piece',
  sweetpotato: 'piece',
  squash: 'piece',
  lemon: 'piece',
  lime: 'piece',
  orange: 'piece',
  apple: 'piece',
  peach: 'piece',
  pear: 'piece',
  plum: 'piece',
  kiwi: 'piece',
  croissant: 'piece',
  grapes: 'piece',
  raspberries: 'piece',
  blackberries: 'piece',
  blueberries: 'piece',
  berries: 'piece',
  beans: 'piece',
  pea: 'piece',
  pods: 'piece',
  dates: 'piece',
  olives: 'piece',
  almonds: 'piece',
  nuts: 'piece',
  sprouts: 'piece',
  mushrooms: 'piece',
  florets: 'piece',
  flowerets: 'piece',
  spears: 'piece',
  peppers: 'piece',
  prunes: 'piece',
  figs: 'piece',
  wafer: 'piece',
  wafers: 'piece',
  sheets: 'sheet',
  cubes: 'cube',
  bars: 'bar',
  scoops: 'scoop',
  wings: 'wing',
  thighs: 'thigh',
  drumsticks: 'drumstick',
  fillets: 'fillet',
  filets: 'fillet',
  breasts: 'breast',
  links: 'piece',
  patties: 'piece',
  cakes: 'piece',
  cookies: 'piece',
  twists: 'piece',
};

const SIZE_AFTER = /^,?\s*(extra[- ]large|small|medium|large)\b/;

/** Volume measures (ml per unit). */
const VOLUME: Record<string, VolumeMeasure['kind']> = {
  cup: 'cup',
  cups: 'cup',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbsp: 'tbsp',
  tbs: 'tbsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tsp: 'tsp',
  'fl oz': 'floz',
  milliliter: 'ml',
  ml: 'ml',
  liter: 'ml',
};
const ML: Record<VolumeMeasure['kind'], number> = {
  cup: 236.6,
  tbsp: 14.79,
  tsp: 4.93,
  floz: 29.57,
  ml: 1,
};

/** The text FDC uses for a portion: measure unit + modifier + description. */
export function portionText(p: FdcPortion): string {
  return [p.unitName, p.modifier, p.description]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The measure word: the measure_unit name when determined, else the first word(s) of the modifier. */
function measureWord(p: FdcPortion): { word: string; rest: string } {
  const text = portionText(p);
  if (/^extra[- ]large\b/.test(text))
    return { word: 'extra-large', rest: text.replace(/^extra[- ]large/, '').trim() };
  if (/^fl oz\b/.test(text)) return { word: 'fl oz', rest: text.slice(5).trim() };
  const m = /^([a-z]+)\b(.*)$/.exec(text);
  return { word: m?.[1] ?? '', rest: (m?.[2] ?? '').trim() };
}

export function canonicalPortionUnit(p: FdcPortion): string | undefined {
  const { word, rest } = measureWord(p);
  if (word === 'extra-large') return 'extra-large';
  const unit = DIRECT[word];
  // "1 fruit small (2-1/2" dia)", "1 pepper, large", "1 each medium" → the size, not "piece".
  if (unit === 'piece') {
    const size = SIZE_AFTER.exec(rest)?.[1];
    if (size) return size.startsWith('extra') ? 'extra-large' : size;
  }
  return unit;
}

const EMBEDDED_VOLUME = /(\d+(?:\.\d+)?(?:\/\d+)?)\s*(cups?|tablespoons?|tbsp|teaspoons?|tsp)\b/;

function parseFraction(s: string): number {
  const [a, b] = s.split('/');
  return b ? Number(a) / Number(b) : Number(a);
}

export function volumeMeasure(p: FdcPortion, fdcId: number): VolumeMeasure | undefined {
  const { word, rest } = measureWord(p);
  const kind = VOLUME[word];
  if (!kind) {
    // "1 serving 1/2 cup", "1 container (1 cup)": a volume stated inside the description.
    const m = EMBEDDED_VOLUME.exec(portionText(p));
    const k = m?.[2] ? (VOLUME[m[2]] ?? VOLUME[m[2].replace(/s$/, '')]) : undefined;
    if (!m?.[1] || !k) return undefined;
    return {
      kind: k,
      ml: ML[k] * parseFraction(m[1]) * p.amount,
      qualified: true,
      portion: p,
      fdcId,
      text: portionText(p),
    };
  }
  const mlPerUnit = word === 'liter' ? 1000 : ML[kind];
  // "1 cup" with nothing after it (ignoring parentheticals like "(8 fl oz)") is unqualified.
  const qualified = rest.replace(/\([^)]*\)/g, '').replace(/[,\s]+/g, '') !== '';
  return { kind, ml: mlPerUnit * p.amount, qualified, portion: p, fdcId, text: portionText(p) };
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Portions for a row: its own FDC food first, then `portionsFrom` foods; the
 * first record per canonical unit wins. `portionAs` pins a record (by portion
 * id) to a unit and treats its gram weight as ONE unit; `skipUnits` drops units.
 */
export function mapPortions(
  foods: FdcFood[],
  opts: { portionAs?: Record<string, string>; skipUnits?: string[]; onlyUnits?: string[] } = {},
): MappedPortion[] {
  const out = new Map<string, MappedPortion>();
  const pinned = new Map(
    Object.entries(opts.portionAs ?? {}).map(([id, unit]) => [Number(id), unit]),
  );
  // Pinned records first, so they win over the automatic mapping.
  for (const f of foods) {
    for (const p of f.portions) {
      const unit = pinned.get(p.id);
      if (!unit || out.has(unit) || !(p.gramWeight > 0)) continue;
      out.set(unit, {
        unit,
        grams: round(p.gramWeight, 2),
        source: `fdc-portion:${p.id}`,
        portionId: p.id,
        fdcId: f.fdcId,
        text: portionText(p),
      });
    }
  }
  for (const f of foods) {
    for (const p of f.portions) {
      if (pinned.has(p.id)) continue;
      const unit = canonicalPortionUnit(p);
      if (!unit || out.has(unit) || !(p.gramWeight > 0) || !(p.amount > 0)) continue;
      if (opts.skipUnits?.includes(unit)) continue;
      if (opts.onlyUnits && !opts.onlyUnits.includes(unit)) continue;
      out.set(unit, {
        unit,
        grams: round(p.gramWeight / p.amount, 2),
        source: `fdc-portion:${p.id}`,
        portionId: p.id,
        fdcId: f.fdcId,
        text: portionText(p),
      });
    }
  }
  return [...out.values()];
}

const KIND_ORDER: VolumeMeasure['kind'][] = ['cup', 'tbsp', 'tsp', 'floz', 'ml'];

/** Best volume measure across foods (in priority order): cup → tbsp → tsp → fl oz → ml, unqualified first. */
export function pickDensity(
  foods: FdcFood[],
): { density: number; measure: VolumeMeasure } | undefined {
  for (const f of foods) {
    const vols = f.portions
      .map((p) => volumeMeasure(p, f.fdcId))
      .filter((v): v is VolumeMeasure => !!v && v.portion.gramWeight > 0);
    if (!vols.length) continue;
    vols.sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        Number(a.qualified) - Number(b.qualified),
    );
    const best = vols[0];
    if (best) return { density: round(best.portion.gramWeight / best.ml, 3), measure: best };
  }
  return undefined;
}
