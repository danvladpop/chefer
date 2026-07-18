import { prisma } from '@chefer/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CarrefourProduct {
  productName: string;
  priceRon: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Re-use cached price if it's less than this many hours old */
const CACHE_TTL_HOURS = 6;

// Note: www.carrefour.ro redirects to carrefour.ro — use the canonical URL directly
const SEARCH_BASE = 'https://carrefour.ro/catalogsearch/result/?q=';

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
};

// ─── English → Romanian ingredient translation map ───────────────────────────
// Carrefour.ro search returns correct food results only for Romanian queries.
// Keys must be lowercase. Add new entries as more ingredients are encountered.

const EN_TO_RO: Record<string, string> = {
  // Proteins
  avocado: 'avocado',
  'salmon fillet': 'file somon',
  salmon: 'somon',
  'chicken breast': 'piept pui',
  chicken: 'pui',
  'turkey breast': 'piept curcan',
  'turkey breast slices': 'felii piept curcan',
  turkey: 'curcan',
  'cod fillet': 'file cod',
  cod: 'cod',
  tuna: 'ton',
  shrimp: 'creveți',
  beef: 'vită',
  pork: 'porc',
  lamb: 'miel',
  eggs: 'oua',
  egg: 'ou',
  // Dairy
  'greek yogurt': 'iaurt grecesc',
  yogurt: 'iaurt',
  butter: 'unt',
  milk: 'lapte',
  'oat milk': 'lapte ovăz',
  'coconut milk': 'lapte cocos',
  'parmesan cheese': 'parmezan',
  parmesan: 'parmezan',
  'feta cheese': 'brânză feta',
  feta: 'feta',
  'cream cheese': 'cremă brânză',
  'heavy cream': 'frișcă',
  'sour cream': 'smântână',
  // Produce
  'baby spinach': 'spanac frunze',
  spinach: 'spanac',
  broccoli: 'broccoli',
  'cherry tomatoes': 'roșii cherry',
  tomatoes: 'roșii',
  tomato: 'roșie',
  'canned chopped tomatoes': 'roșii tocate conservă',
  garlic: 'usturoi',
  lemon: 'lămâie',
  'lemon juice': 'suc lamaie',
  'lemon zest': 'coaja lamaie',
  banana: 'banană',
  apple: 'măr',
  'red onion': 'ceapă roșie',
  onion: 'ceapă',
  carrot: 'morcov',
  'red pepper': 'ardei roșu',
  'bell pepper': 'ardei',
  'asparagus spears': 'sparanghel',
  asparagus: 'sparanghel',
  'snap peas': 'mazăre păstaie',
  'fresh ginger': 'ghimbir proaspăt',
  ginger: 'ghimbir',
  courgette: 'dovlecel',
  zucchini: 'dovlecel',
  'fresh parsley': 'pătrunjel proaspăt',
  parsley: 'pătrunjel',
  'fresh dill': 'mărar proaspăt',
  dill: 'mărar',
  'fresh basil': 'busuioc proaspăt',
  basil: 'busuioc',
  'romaine lettuce': 'salată romaine',
  lettuce: 'salată verde',
  cucumber: 'castravete',
  mushrooms: 'ciuperci',
  mushroom: 'ciuperci',
  'sweet potato': 'cartof dulce',
  potato: 'cartof',
  beetroot: 'sfeclă roșie',
  cauliflower: 'conopidă',
  celery: 'țelină',
  leek: 'praz',
  kale: 'kale',
  arugula: 'rucola',
  mint: 'mentă',
  thyme: 'cimbru',
  rosemary: 'rozmarin',
  coriander: 'coriandru',
  cilantro: 'coriandru',
  // Grains / pantry
  quinoa: 'quinoa',
  oats: 'fulgi ovăz',
  'rolled oats': 'fulgi ovăz',
  'brown rice': 'orez brun',
  'basmati rice': 'orez basmati',
  rice: 'orez',
  'red lentils': 'linte roșie',
  lentils: 'linte',
  chickpeas: 'năut',
  almonds: 'migdale',
  'mixed nuts': 'nuci amestec',
  walnuts: 'nuci',
  cashews: 'caju',
  'chia seeds': 'semințe chia',
  'sunflower seeds': 'semințe floarea-soarelui',
  'olive oil': 'ulei măsline',
  'coconut oil': 'ulei cocos',
  'sesame oil': 'ulei susan',
  'soy sauce': 'sos soia',
  honey: 'miere',
  'maple syrup': 'sirop arțar',
  tahini: 'tahini',
  'dijon mustard': 'muștar dijon',
  mustard: 'muștar',
  'sourdough bread': 'pâine maia',
  bread: 'pâine',
  granola: 'granola',
  'whole-grain croutons': 'crutoane integrale',
  croutons: 'crutoane',
  'caesar dressing': 'dressing caesar',
  cinnamon: 'scorțișoară',
  'chilli flakes': 'fulgi chilli',
  'curry powder': 'curry pudră',
  'whole-wheat tortilla': 'tortilla integrală',
  tortilla: 'tortilla',
  'vanilla protein powder': 'proteină pudră vanilie',
  'kalamata olives': 'măsline kalamata',
  olives: 'măsline',
  capers: 'capere',
  'whole-wheat couscous': 'couscous integral',
  couscous: 'couscous',
  'medjool dates': 'curmale medjool',
  dates: 'curmale',
  'salt and black pepper': 'sare piper',
  salt: 'sare',
  'black pepper': 'piper negru',
  pepper: 'piper',
};

/**
 * Translate an English ingredient name to Romanian using the lookup map.
 * Falls back to the original name if no translation is found.
 * Handles parenthetical qualifiers and capitalization.
 */
function toRomanian(ingredientName: string): string {
  // Strip parentheticals: "Brown rice (dry)" → "Brown rice"
  const cleaned = ingredientName
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .trim();

  const key = cleaned.toLowerCase();

  // Exact match
  if (EN_TO_RO[key]) return EN_TO_RO[key]!;

  // Prefix match — try progressively shorter phrases
  const words = key.split(/\s+/);
  for (let len = words.length - 1; len >= 1; len--) {
    const phrase = words.slice(0, len).join(' ');
    if (EN_TO_RO[phrase]) return EN_TO_RO[phrase]!;
  }

  // No translation found — return cleaned original (works if already Romanian)
  return cleaned;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip parenthetical qualifiers and common adjectives so we get a clean
 * search term: "Chicken breast (boneless)" → "Chicken breast"
 */
function normalizeForSearch(ingredientName: string): string {
  return ingredientName
    .replace(/\s*\([^)]*\)/g, '') // remove (...)
    .replace(/\s*\[[^\]]*\]/g, '') // remove [...]
    .trim();
}

function isCacheValid(resolvedAt: Date): boolean {
  const ageMs = Date.now() - resolvedAt.getTime();
  return ageMs < CACHE_TTL_HOURS * 60 * 60 * 1000;
}

/**
 * Keywords that indicate a result is NOT a food product.
 * Used to skip non-food sponsored results that Carrefour surfaces at the top.
 */
const NON_FOOD_KEYWORDS = [
  // Appliances & hardware
  'fierbator',
  'combina frigorifica',
  'frigider',
  'aragaz',
  'cuptor cu',
  'tigaie',
  'ustensile',
  'robot de',
  'presa de',
  'aparat de',
  'aspirator',
  'masina de',
  'scaun',
  'canapea',
  'fotoliu',
  'dulap',
  'cearceaf',
  'patura',
  'prosop',
  // Toys
  'lego',
  'jucarie',
  'jucarii',
  // Personal care
  'de corp',
  'de shea',
  'sampon',
  'gel de dus',
  'crema de fata',
  'lotiune',
  'parfum ',
  'deodorant',
  'vopsea de par',
  'lac de unghii',
  'fond de ten',
  // Nut butters (filter when searching for dairy "unt")
  'de arahide',
  'de caju',
  'de migdale',
  'de alune',
  // Egg dyes (filter when searching for "oua")
  'vopsea',
  'colorant',
  'vopsit oua',
  // Laundry / cleaning
  'detergent',
  'balsam de rufe',
  'sapun lichid',
  'dezinfectant',
  'mop',
  'wc ',
  'hartie igienica',
  'servetele',
  // Books & media
  'manual pentru',
  'atlas ',
  // Sports & fitness
  'greutati',
  'haltera',
  'bicicleta',
  // Alcohol / wine — appear in searches for fruit/herb ingredients
  '% alc',
  'alc.,',
  '0.75l',
  '0.75 l',
  '0,75l',
  '0,75 l',
  'feteasca',
  'sauvignon',
  'chardonnay',
  'merlot',
  'cabernet',
  'pinot',
  'whisky',
  'vodka',
  'vodca ',
  'cognac',
  'metaxa',
  'coniac',
  'bere ',
  'craft beer',
  // Pet food — appear in searches for meat ingredients
  'pentru pisici',
  'pentru caini',
  'pentru animale',
  'felix ',
  'purina',
  'whiskas',
  'pedigree',
  'royal canin',
  'dreamies',
  'hrana pisic',
  'hrana caine',
  'hrana animal',
  // Garden / agriculture seeds (NOT edible seeds like chia)
  'agrosel',
  'seminte pg',
  ' pg1',
  ' pg2',
  ' pg3',
  ' pg4',
  ' pg5',
  ' pg6',
  ' pg7',
  ' pg8',
  ' pg9',
  'rasad',
  'bulbi de',
  'ghiveci',
  // Dental / hygiene products that mention herbs
  'pentru ingrijire dentara',
  'pasta de dinti',
  'apa de gura',
  // Pharmaceutical / supplements (distinct from food supplements)
  'comprimate',
  'capsule ',
  'fiole ',
  'sirop pentru',
  // Face / beauty products containing food ingredients (avocado, honey etc.)
  'masca faciala',
  'crema faciala',
  'ser facial',
  'exfoliant',
  'ulei de ingrijire',
  'ulei corporal',
  // Baby food — appears for vegetables/proteins
  'babybio',
  'hipp ',
  'aptamil',
  'nutricia',
  'humana ',
  'milupa',
  'piure de',
  'piure pentru',
  'taitei cu',
  'terci de',
  // Snacks / confectionery that appear as "flavoured with" ingredient results
  'biscuiti',
  'biscuit',
  'chips ',
  'popcorn',
  'napolitane',
  'praline',
  'bomboane',
  'caramele',
  'ciocolata',
  'fursecuri',
  'covrigei',
  'snack',
  'grisine',
  'baton ciocolata',
  // Beverages / infusions that appear for herb/fruit ingredients
  'infuzie',
  'ceai cu',
  'bautura energizanta',
  'suc de ',
  'nectar de',
  // Condiments / sauces that appear for raw ingredient searches
  'sos de ardei',
  'sos iute',
  'tabasco',
  'ketchup',
  // Canned/processed derivatives that are NOT the ingredient itself
  'pasta vegetala',
  'rosii pasate cu',
  // Specific snack brands / product types
  'chio ',
  'chio-',
  "lay's",
  'doritos',
  'pringles',
  'saratele ',
  // Cookies/biscuits (English word used in Romanian context)
  'cookies cu',
  'cookie ',
  'fursecuri',
  // Organ-meat dishes (appear in turkey/pork searches)
  'pentru drob',
  ' drob ',
  // Face masks / cosmetics with food ingredient names
  'masca fata',
  'masca cu vitamin',
  'esfolio',
  'efect botox',
  // Beverages that appear for citrus/fruit ingredient searches
  'limonada',
  'sirop zmeura',
  'sirop capsuni',
  'sirop lamaie',
  'bautura racoritoare',
  'bautura energizanta',
  // Toy / surprise eggs
  'figurine surpriza',
  'hatchimals',
  'jucaria',
  'set jucarii',
  'ou surpriza',
  // Legumes that appear for onion searches ("fasole rosie" ≠ "ceapa rosie")
  'fasole ',
  // Cooking oil sprays (appear for avocado) — block spray variants
  'spray mantova',
  'ulei spray',
  // Breadstick/aperitif snacks that appear for herb/spinach searches
  'pentru aperitiv',
  'baghete delicioase',
  // Pate / spreads that appear for vegetable ingredient searches
  'pate vegetal',
  // Massage / body oils containing food ingredient names
  'pentru masaj',
  'ulei masaj',
  'lotus 150ml',
  // Toy cooking / play sets (appear in vegetable searches due to mock kitchen sets)
  'set de joaca',
  'set joaca',
  'melissa',
  'joc de rol',
  // Vanilla extract / baking essences (appear for butter search)
  'esenta de vanilie',
  'esenta de rom',
  'esenta de lamaie',
  // Easter egg decoration kits (appear in egg searches)
  'set creativ',
  'decoreaza',
  'de paste',
  'oua de paste',
  // Non-carbonated/carbonated drinks with ingredient flavors (lemon, ginger etc.)
  'bautura necarbogazoasa',
  'bautura carbogazoasa',
  'the lamaie',
  // Pasta sauces with vegetable names (appear for onion/garlic)
  'sos pentru paste',
  // Aloe vera / vitamin-based body products with food names
  'vitamina e 25',
  // Face masks with different Romanian phrasing
  'masca de fata',
  'farmstay',
  'real 25ml',
  // Play-Doh / clay / craft sets
  'play-doh',
  'plastilina',
  'swirlin',
  // Confectionery brands that appear for dairy/ingredient searches
  'kinder ',
  'ferrero',
  'nutella',
  // Educational / alphabet toys with ingredient words
  'litere cu',
  'cu litere',
  // Tea / herbal infusions with fruit/herb flavors
  'plicuri',
  'ceai teekanne',
  'ceai lipton',
  'zen chai',
  // Regional sauces with ingredient names
  'sos taco',
  'santa maria',
  // Body / hair oils mixed with food oils (not cooking oils)
  'mix ulei cocos',
  // Books/guides that mention food in title
  'de alimente care',
  'alimentatia',
  // Confectionery abbreviations (cioc = ciocolata = chocolate)
  'oua cioc',
  'biskrem',
  // Anti-aging / cosmetic creams with omega/avocado
  'antirid',
  'crema antirid',
  'cosmetic plant',
  'omega plus',
  // Canned fish / meat pates that are flavoured with fruit/herb (not the ingredient itself)
  'pate de ton',
  'pate ton',
  // Hair care products with food ingredient names
  'pentru par',
  'botanic therapy',
  'garnier',
  // Spray paint / aerosol products with food color names
  'belton',
  'spray premium',
  'vopsea spray',
  // Spice grinders "with X" — appear for fruit/herb ingredient searches
  'rasnita cu',
];

/**
 * Parse the Carrefour search results page HTML and extract the best-matching
 * food product from the `impressions` array in the embedded ecommerce dataLayer.
 *
 * Carrefour Romania embeds this structure in every search page:
 *   "impressions":[{"list":"Search Results","id":"...","name":"...","price":10.49,...},...]
 *
 * Strategy:
 *   1. Skip items whose names contain non-food keywords
 *   2. Prefer items whose name contains at least one word from the search term
 *   3. Apply food price sanity check (0.5–200 RON)
 *   4. If nothing passes the relevance filter, fall back to best price-filtered item
 */
function parseDataLayer(html: string, searchTerm?: string): CarrefourProduct | null {
  // Find the impressions array — it is always a flat JSON array in the HTML
  const match = html.match(/"impressions"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  if (!match) return null;

  try {
    const impressions = JSON.parse(match[1]!) as Array<{
      name?: string;
      price?: string | number;
    }>;

    // Strip Romanian diacritics for fuzzy matching (ă→a, â→a, î→i, ș→s, ț→t)
    const stripDiacritics = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ăâ]/g, 'a')
        .replace(/î/g, 'i')
        .replace(/[șş]/g, 's')
        .replace(/[țţ]/g, 't');

    // Build a set of significant words from the search term (length >= 3) to match against product names
    const termWords = searchTerm
      ? stripDiacritics(searchTerm.toLowerCase())
          .split(/\s+/)
          .filter((w) => w.length >= 3)
      : [];

    const isNonFood = (name: string): boolean => {
      const lower = name.toLowerCase();
      return NON_FOOD_KEYWORDS.some((kw) => lower.includes(kw));
    };

    const isRelevant = (name: string): boolean => {
      if (termWords.length === 0) return true;
      const lower = stripDiacritics(name.toLowerCase());
      return termWords.some((w) => lower.includes(w));
    };

    const isPriceOk = (priceRon: number): boolean =>
      !isNaN(priceRon) && priceRon > 0.5 && priceRon <= 200;

    // Pass 1: relevant + non-blocked + price OK
    // If no result passes all three checks we return null (caller shows estimated price).
    // We intentionally do NOT have a "fallback" pass that skips relevance, because that
    // leads to completely unrelated products being cached with wrong prices.
    for (const item of impressions) {
      if (!item.name) continue;
      if (isNonFood(item.name)) continue;
      const priceRon =
        typeof item.price === 'number' ? item.price : parseFloat(String(item.price ?? ''));
      if (!isPriceOk(priceRon)) continue;
      if (!isRelevant(item.name)) continue;
      return { productName: item.name, priceRon };
    }
  } catch {
    // malformed JSON
  }

  return null;
}

// ─── Serial fetch queue ───────────────────────────────────────────────────────
// Ensures we never fire more than one request at a time to Carrefour, avoiding
// rate-limit / bot-detection responses.

let fetchQueue: Promise<unknown> = Promise.resolve();

function enqueueFetch(ingredientName: string): Promise<CarrefourProduct | null> {
  return new Promise((resolve) => {
    fetchQueue = fetchQueue.then(async () => {
      try {
        const term = toRomanian(ingredientName);
        const url = `${SEARCH_BASE}${encodeURIComponent(term)}`;
        const res = await fetch(url, { headers: FETCH_HEADERS });
        if (!res.ok) {
          resolve(null);
          return;
        }
        const html = await res.text();
        resolve(parseDataLayer(html, term));
      } catch {
        resolve(null);
      }
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the cached Carrefour price for the ingredient if available (< 6 h old),
 * otherwise fires a background scrape to populate the cache for the NEXT request
 * and returns null immediately (caller uses estimated price this time).
 *
 * This is the preferred function for page-load paths — it never blocks on HTTP.
 * Background scrapes are serialised through the same fetchQueue to avoid
 * hammering carrefour.ro.
 */
export async function fetchCarrefourPriceCachedOnly(
  ingredientName: string,
): Promise<CarrefourProduct | null> {
  const normalized = ingredientName.toLowerCase().trim();

  const cached = await prisma.carrefourPriceCache.findUnique({
    where: { ingredientName: normalized },
  });

  if (cached && isCacheValid(cached.resolvedAt)) {
    return { productName: cached.productName, priceRon: cached.priceRon };
  }

  // Not in cache — kick off a background scrape and return null now.
  // The result will be available on the next page load.
  void enqueueFetch(ingredientName)
    .then(async (result) => {
      if (result) {
        await prisma.carrefourPriceCache.upsert({
          where: { ingredientName: normalized },
          create: {
            ingredientName: normalized,
            productName: result.productName,
            priceRon: result.priceRon,
          },
          update: {
            productName: result.productName,
            priceRon: result.priceRon,
            resolvedAt: new Date(),
          },
        });
      }
    })
    .catch(() => {
      /* scrape errors are non-fatal */
    });

  return null;
}

/**
 * Fetch a live Carrefour.ro price for the given ingredient name.
 * Blocks until the HTTP scrape completes (use only in background jobs, not request handlers).
 *
 * Resolution order:
 *   1. DB cache (CarrefourPriceCache) — returns instantly if < 6 h old
 *   2. Live HTTP fetch to carrefour.ro search page → parse dataLayer
 *   3. Returns null when no product found (caller uses estimated price)
 */
export async function fetchCarrefourPrice(
  ingredientName: string,
): Promise<CarrefourProduct | null> {
  const normalized = ingredientName.toLowerCase().trim();

  // 1. Cache hit
  const cached = await prisma.carrefourPriceCache.findUnique({
    where: { ingredientName: normalized },
  });
  if (cached && isCacheValid(cached.resolvedAt)) {
    return { productName: cached.productName, priceRon: cached.priceRon };
  }

  // 2. Live fetch (serialized)
  const result = await enqueueFetch(ingredientName);

  if (result) {
    // Persist to cache (upsert handles race conditions)
    await prisma.carrefourPriceCache.upsert({
      where: { ingredientName: normalized },
      create: {
        ingredientName: normalized,
        productName: result.productName,
        priceRon: result.priceRon,
      },
      update: {
        productName: result.productName,
        priceRon: result.priceRon,
        resolvedAt: new Date(),
      },
    });
  }

  return result;
}
