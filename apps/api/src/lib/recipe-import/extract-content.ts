// ─── Main-content extraction for recipe pages (F5) ───────────────────────────
// Dependency-free readability strip: recipe blogs bury the recipe under nav,
// ads and life stories. We (1) pull schema.org Recipe JSON-LD when present —
// the highest-signal source, most food blogs emit it for SEO — (2) strip the
// page down to readable text, and (3) grab og:image for the save step. The
// combined output is capped so a bloated page can't blow up the AI prompt.

const MAX_AI_TEXT_CHARS = 20_000;
const MAX_JSONLD_CHARS = 8_000;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  frac12: '1/2',
  frac14: '1/4',
  frac34: '3/4',
  deg: '°',
  eacute: 'é',
  egrave: 'è',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-z0-9]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

/** Removes an element type including its (non-nested) content. */
function dropBlocks(html: string, tag: string): string {
  return html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi'), ' ');
}

interface JsonLdNode {
  '@type'?: string | string[];
  '@graph'?: unknown;
  [key: string]: unknown;
}

function isRecipeNode(node: unknown): node is JsonLdNode {
  if (typeof node !== 'object' || node === null) return false;
  const type = (node as JsonLdNode)['@type'];
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === 'string' && t.toLowerCase() === 'recipe');
}

function collectRecipeNodes(value: unknown, out: JsonLdNode[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRecipeNodes(item, out);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  if (isRecipeNode(value)) {
    out.push(value);
    return;
  }
  const graph = (value as JsonLdNode)['@graph'];
  if (graph) collectRecipeNodes(graph, out);
}

// The JSON-LD fields worth forwarding to the model — everything else
// (publisher, aggregateRating, video…) is prompt noise.
const RECIPE_FIELDS = [
  'name',
  'description',
  'recipeIngredient',
  'recipeInstructions',
  'recipeYield',
  'recipeCuisine',
  'recipeCategory',
  'prepTime',
  'cookTime',
  'totalTime',
  'nutrition',
  'keywords',
  'suitableForDiet',
] as const;

/** Extracts schema.org Recipe JSON-LD blocks, trimmed to the useful fields. */
export function extractJsonLdRecipe(html: string): string | null {
  const scripts = html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  );
  const found: JsonLdNode[] = [];
  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      collectRecipeNodes(JSON.parse(raw), found);
    } catch {
      // malformed JSON-LD — the plain-text path still works
    }
  }
  const first = found[0];
  if (!first) return null;

  const trimmed: Record<string, unknown> = {};
  for (const field of RECIPE_FIELDS) {
    if (first[field] !== undefined) trimmed[field] = first[field];
  }
  const json = JSON.stringify(trimmed);
  return json.length > MAX_JSONLD_CHARS ? json.slice(0, MAX_JSONLD_CHARS) : json;
}

/** og:image URL resolved against the page URL, or null. */
export function extractOgImage(html: string, baseUrl: string): string | null {
  const patterns = [
    /<meta[^>]*property\s*=\s*["']og:image(?::secure_url|:url)?["'][^>]*content\s*=\s*["']([^"']+)["']/i,
    /<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image(?::secure_url|:url)?["']/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    const raw = match?.[1] ? decodeEntities(match[1]).trim() : null;
    if (!raw) continue;
    try {
      const url = new URL(raw, baseUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    } catch {
      // relative-URL garbage — try the next pattern
    }
  }
  return null;
}

/** Strips a page down to readable main-content text. */
export function stripToText(html: string): string {
  let text = html;
  for (const tag of ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'select']) {
    text = dropBlocks(text, tag);
  }
  // Chrome elements — recipe content never lives in these.
  for (const tag of ['nav', 'header', 'footer', 'aside', 'form', 'button']) {
    text = dropBlocks(text, tag);
  }
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  // Structure → line breaks before the tags are removed.
  text = text.replace(/<(?:br|hr)\s*\/?>/gi, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '\n- ');
  text = text.replace(/<\/(?:p|div|li|h[1-6]|tr|section|article|blockquote)\s*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  text = text.replace(/[ \t\r\f\v]+/g, ' ');
  text = text.replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

export interface PageContent {
  /** Prompt-ready text: JSON-LD recipe (when present) + stripped page text, capped. */
  aiText: string;
  ogImageUrl: string | null;
  hasJsonLd: boolean;
}

export function extractPageContent(html: string, pageUrl: string): PageContent {
  const jsonLd = extractJsonLdRecipe(html);
  const text = stripToText(html);

  let aiText: string;
  if (jsonLd) {
    const remaining = Math.max(0, MAX_AI_TEXT_CHARS - jsonLd.length - 200);
    aiText = `STRUCTURED RECIPE DATA (schema.org JSON-LD from the page — most reliable source):\n${jsonLd}\n\nPAGE TEXT:\n${text.slice(0, remaining)}`;
  } else {
    aiText = text.slice(0, MAX_AI_TEXT_CHARS);
  }

  return { aiText, ogImageUrl: extractOgImage(html, pageUrl), hasJsonLd: jsonLd !== null };
}
