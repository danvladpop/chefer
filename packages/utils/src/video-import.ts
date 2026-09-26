import type { VideoPlatform } from '@chefer/types';

// ─── Video-link recipe import: shared pure helpers ───────────────────────────
// URL recognition (the API refuses anything else, so yt-dlp never touches an
// arbitrary host) and the review form's validation and clean-up, shared so web
// and mobile validate a draft exactly the way the API's importSave does.

const YOUTUBE_ID = /^[\w-]{6,}$/;

/**
 * Recognises a single public video on one of the supported platforms and
 * returns its canonical https URL. Channels, playlists, searches, profiles and
 * every other host return null.
 */
export function parseVideoUrl(raw: string): { platform: VideoPlatform; url: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const segments = url.pathname.split('/').filter(Boolean);
  url.protocol = 'https:';

  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (segments[0] === 'watch') {
      const id = url.searchParams.get('v');
      return id && YOUTUBE_ID.test(id)
        ? { platform: 'youtube', url: `https://www.youtube.com/watch?v=${id}` }
        : null;
    }
    if (segments[0] === 'shorts' && segments[1]) {
      return YOUTUBE_ID.test(segments[1])
        ? { platform: 'youtube', url: `https://www.youtube.com/shorts/${segments[1]}` }
        : null;
    }
    return null;
  }
  if (host === 'youtu.be') {
    const id = segments[0];
    return id && YOUTUBE_ID.test(id)
      ? { platform: 'youtube', url: `https://www.youtube.com/watch?v=${id}` }
      : null;
  }
  if (host === 'tiktok.com') {
    // https://www.tiktok.com/@user/video/123…  or  https://www.tiktok.com/t/ZT…/
    const isVideo = segments[0]?.startsWith('@') && segments[1] === 'video' && segments[2];
    const isShort = segments[0] === 't' && segments[1];
    return isVideo || isShort ? { platform: 'tiktok', url: url.toString() } : null;
  }
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    return segments[0] ? { platform: 'tiktok', url: url.toString() } : null;
  }
  if (host === 'instagram.com') {
    const kind = segments[0];
    return (kind === 'reel' || kind === 'reels' || kind === 'p' || kind === 'tv') && segments[1]
      ? { platform: 'instagram', url: `https://www.instagram.com/${kind}/${segments[1]}/` }
      : null;
  }
  return null;
}

export function isSupportedVideoUrl(raw: string): boolean {
  return parseVideoUrl(raw) !== null;
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
};

/**
 * Parses what a cook types into a quantity box: "2", "1.5", "1,5", "1/2",
 * "1 1/2", "½", "1½". Returns null for anything else (or a non-positive value).
 */
export function parseQuantityInput(raw: string): number | null {
  let text = raw.trim().replace(',', '.');
  if (!text) return null;
  let total = 0;
  const unicode = text.slice(-1);
  if (unicode in UNICODE_FRACTIONS) {
    total += UNICODE_FRACTIONS[unicode] ?? 0;
    text = text.slice(0, -1).trim();
    if (!text) return total;
  }
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  let value: number;
  if (mixed) {
    value = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  } else if (fraction) {
    value = Number(fraction[1]) / Number(fraction[2]);
  } else if (/^\d+(\.\d+)?$/.test(text) || /^\.\d+$/.test(text)) {
    value = Number(text);
  } else {
    return null;
  }
  total += value;
  return Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : null;
}

/** The recipe shape the review form edits (a subset of the API's ExtractedRecipe). */
export interface VideoDraftLike {
  name: string;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: string[];
  nutritionInfo: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  servings: number;
  prepTimeMins: number;
  cookTimeMins: number;
}

/**
 * What still blocks saving, as short sentences for the form. Mirrors the
 * API's importSave schema: a name, at least one measured ingredient, at least
 * one step, and 1–20 servings.
 */
export function videoDraftProblems(draft: VideoDraftLike): string[] {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push('Add a recipe name.');
  const named = draft.ingredients.filter((i) => i.name.trim());
  if (named.length === 0) problems.push('Add at least one ingredient.');
  else if (named.some((i) => !(i.quantity > 0))) problems.push('Give every ingredient an amount.');
  if (!draft.instructions.some((s) => s.trim())) problems.push('Add at least one step.');
  if (!Number.isInteger(draft.servings) || draft.servings < 1 || draft.servings > 20) {
    problems.push('Servings must be between 1 and 20.');
  }
  if (draft.prepTimeMins < 0 || draft.cookTimeMins < 0) problems.push('Times cannot be negative.');
  return problems;
}

/**
 * The reviewed draft, ready for importSave: trimmed, blank rows dropped, and
 * the per-serving nutrition rescaled when the user changed the serving count
 * (the AI's estimate is per ITS serving count; the dish's total is unchanged).
 */
export function finalizeVideoDraft<T extends VideoDraftLike>(
  original: VideoDraftLike,
  edited: T,
): T {
  const factor = edited.servings > 0 ? original.servings / edited.servings : 1;
  const n = edited.nutritionInfo;
  const scale = (v: number) => Math.round(v * factor);
  return {
    ...edited,
    name: edited.name.trim(),
    ingredients: edited.ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({ name: i.name.trim(), quantity: i.quantity, unit: i.unit.trim() || 'piece' })),
    instructions: edited.instructions.map((s) => s.trim()).filter(Boolean),
    nutritionInfo:
      factor === 1
        ? n
        : {
            calories: scale(n.calories),
            protein: scale(n.protein),
            carbs: scale(n.carbs),
            fat: scale(n.fat),
            fiber: scale(n.fiber),
          },
  };
}

/** The review form's editable values — strings, exactly as typed. */
export interface VideoDraftFormValues {
  name: string;
  servings: string;
  prepTimeMins: string;
  cookTimeMins: string;
  ingredients: { quantity: string; unit: string; name: string }[];
  instructions: string[];
}

/**
 * Draft → form. An empty list gets one blank row to type into, and a zero
 * time is left blank (the video said nothing; "0" would look like a fact).
 */
export function videoDraftToForm(draft: VideoDraftLike): VideoDraftFormValues {
  const minutes = (v: number) => (v > 0 ? String(v) : '');
  return {
    name: draft.name,
    servings: String(draft.servings),
    prepTimeMins: minutes(draft.prepTimeMins),
    cookTimeMins: minutes(draft.cookTimeMins),
    ingredients: draft.ingredients.length
      ? draft.ingredients.map((i) => ({ quantity: String(i.quantity), unit: i.unit, name: i.name }))
      : [{ quantity: '', unit: '', name: '' }],
    instructions: draft.instructions.length ? [...draft.instructions] : [''],
  };
}

/** Form → draft, over the original so untouched fields (nutrition, tags) survive. */
export function videoFormToDraft<T extends VideoDraftLike>(
  original: T,
  form: VideoDraftFormValues,
): T {
  const minutes = (v: string) => {
    const n = Math.round(Number(v.trim() || '0'));
    return Number.isFinite(n) ? n : -1;
  };
  const servings = Number(form.servings.trim());
  return {
    ...original,
    name: form.name,
    servings: Number.isFinite(servings) && form.servings.trim() ? servings : 0,
    prepTimeMins: minutes(form.prepTimeMins),
    cookTimeMins: minutes(form.cookTimeMins),
    ingredients: form.ingredients.map((i) => ({
      name: i.name,
      quantity: parseQuantityInput(i.quantity) ?? 0,
      unit: i.unit,
    })),
    instructions: form.instructions,
  };
}
