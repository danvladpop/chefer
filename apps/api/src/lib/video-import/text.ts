import type { VideoDraftField, VideoTranscriptSource } from '@chefer/types';
import type { Ingredient } from '../ai/types.js';
import { captionStatesServings } from './servings.js';
import type { SpeechTranscript } from './whisper.js';
import type { SubtitleTrackRef, VideoInfo } from './ytdlp.js';

// ─── Transcript text helpers (pure) ──────────────────────────────────────────
// Everything between "yt-dlp/Whisper returned something" and "the text the
// extractor reads", plus the deterministic "what did the video NOT say" checks
// the review form shows as "not found — please add". Pure so it is tested
// without a single subprocess or network call.

/** Below this, a caption is a hashtag dump, not an ingredient list. */
export const MIN_USABLE_CAPTION_CHARS = 40;
/** Below this, subtitles/speech carried no recipe worth reading. */
export const MIN_USABLE_TRANSCRIPT_CHARS = 60;

const MAX_CAPTION_CHARS = 4_000;
const MAX_TRANSCRIPT_CHARS = 12_000;

// ─── Caption sufficiency ─────────────────────────────────────────────────────

const INGREDIENT_LINE =
  /^[\s•\-*–·▪✔✅👉🔸🔹]*(?:\d|[½¼¾⅓⅔])|\d\s*(?:g|kg|ml|l|tsp|tbsp|cups?|oz|lbs?|cloves?|teaspoons?|tablespoons?|grams?)\b/iu;
const METHOD_VERB =
  /\b(?:preheat|bake|cook|fry|air.?fry|saut[eé]|stir|mix|whisk|combine|simmer|boil|roast|grill|season|pour|heat|blend|knead|marinate|toss|fold|chop|slice|serve)\b/i;

/**
 * True when the caption alone carries a whole recipe: at least three
 * ingredient-looking lines AND at least two method sentences. Then subtitles
 * and speech are not fetched at all. Deliberately strict — the next source is
 * cheap, and a caption with ingredients but no method is the common case.
 */
export function captionCarriesRecipe(caption: string): boolean {
  if (caption.length < MIN_USABLE_CAPTION_CHARS) return false;
  const lines = caption.split(/\n+/).map((l) => l.trim());
  const ingredientLines = lines.filter((l) => l.length < 100 && INGREDIENT_LINE.test(l)).length;
  const sentences = caption.split(/[\n.!]+/).filter((s) => METHOD_VERB.test(s)).length;
  return ingredientLines >= 3 && sentences >= 2;
}

// ─── Subtitles ───────────────────────────────────────────────────────────────

const baseLang = (lang: string) => lang.toLowerCase().split(/[-_]/)[0] ?? '';

/**
 * Picks the one subtitle track worth reading: uploaded subtitles in the
 * video's language (or English), else the ORIGINAL auto-caption track —
 * never one of YouTube's ~100 machine translations of it.
 */
export function pickSubtitleTrack(info: VideoInfo): SubtitleTrackRef | null {
  const lang = info.language ? baseLang(info.language) : null;
  const matches = (key: string, want: string) =>
    baseLang(key) === want || baseLang(key).startsWith(want);

  const manual =
    (lang ? info.subtitleLangs.find((k) => matches(k, lang)) : undefined) ??
    info.subtitleLangs.find((k) => matches(k, 'en')) ??
    info.subtitleLangs[0];
  if (manual) return { lang: manual, auto: false };

  const auto =
    info.autoCaptionLangs.find((k) => k.endsWith('-orig')) ??
    (lang ? info.autoCaptionLangs.find((k) => k.toLowerCase() === lang) : undefined) ??
    info.autoCaptionLangs.find((k) => k.toLowerCase() === 'en');
  return auto ? { lang: auto, auto: true } : null;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * WebVTT/SRT → plain text. YouTube's auto-captions repeat each line across
 * two or three rolling cues, so a line equal to one of the last few emitted is
 * dropped; sound tags like [Music] go too.
 */
export function subtitlesToText(raw: string): string {
  const out: string[] = [];
  let skippingBlock = false;
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    const t = line.trim();
    if (!t) {
      skippingBlock = false;
      continue;
    }
    if (t.startsWith('WEBVTT') || /^(Kind|Language):/.test(t)) continue;
    if (/^(NOTE|STYLE|REGION)\b/.test(t)) {
      skippingBlock = true;
      continue;
    }
    if (skippingBlock || t.includes('-->') || /^\d+$/.test(t)) continue;
    const text = t
      .replace(/<[^>]+>/g, '')
      .replace(/&[#\w]+;/g, (e) => ENTITIES[e] ?? e)
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || out.slice(-3).includes(text)) continue;
    out.push(text);
  }
  return out.join(' ').trim();
}

// ─── Speech ──────────────────────────────────────────────────────────────────

/** Segments Whisper itself thinks are music or silence. */
const NO_SPEECH_THRESHOLD = 0.6;
/** What Whisper "hears" in music-only or silent clips. */
const HALLUCINATION =
  /^(?:\s*(?:thank you|thanks)(?: (?:so much )?for watching)?[.!]*\s*|\s*you\s*)+$/i;

export function speechToText(transcript: SpeechTranscript): string {
  const kept = transcript.segments.length
    ? transcript.segments.filter((s) => s.noSpeechProb < NO_SPEECH_THRESHOLD).map((s) => s.text)
    : [transcript.text];
  const text = kept.join(' ').replace(/\s+/g, ' ').trim();
  return HALLUCINATION.test(text) ? '' : text;
}

// ─── The text the extractor reads ────────────────────────────────────────────

export interface TranscriptTextInput {
  title: string;
  caption: string;
  transcript: string | null;
  source: VideoTranscriptSource;
}

/**
 * Title + caption + transcript, labelled so the model knows which is which.
 * Goes through the ordinary TEXT extraction (importText route): no video,
 * frames or audio ever reach a language model.
 */
export function buildTranscriptText(input: TranscriptTextInput): string {
  const parts = ['This is the text of a cooking video (no visuals). Extract only what it states.'];
  if (input.title) parts.push(`VIDEO TITLE: ${input.title}`);
  // Link lines (merch, socials, sponsors) carry no recipe — only tokens.
  const caption = input.caption
    .split('\n')
    .filter((line) => !/https?:\/\//.test(line))
    .join('\n')
    .trim();
  if (caption) {
    parts.push(`CREATOR'S CAPTION:\n${caption.slice(0, MAX_CAPTION_CHARS)}`);
  }
  if (input.transcript) {
    const label =
      input.source === 'speech'
        ? 'SPEECH TRANSCRIPT (automatic — words and amounts may be misheard)'
        : 'VIDEO SUBTITLES (may be auto-generated)';
    parts.push(`${label}:\n${input.transcript.slice(0, MAX_TRANSCRIPT_CHARS)}`);
  }
  return parts.join('\n\n');
}

// ─── "Not found" detection ───────────────────────────────────────────────────

const TIME_MENTION =
  /\b\d+\s*(?:-\s*\d+\s*)?(?:min(?:ute)?s?|hours?|hrs?|h)\b|\b(?:half an hour|an hour|overnight)\b/i;

interface DraftLike {
  name: string;
  ingredients: Ingredient[];
  instructions: string[];
  prepTimeMins: number;
  cookTimeMins: number;
}

/**
 * Fields the video's words did not cover. Decided from the SOURCE TEXT where
 * possible, not from what the model claims: the model fills a serving count
 * and times even when nobody said them.
 */
export function findNotFoundFields(recipe: DraftLike, sourceText: string): VideoDraftField[] {
  const missing: VideoDraftField[] = [];
  if (!recipe.name.trim()) missing.push('name');
  if (recipe.ingredients.length === 0) missing.push('ingredients');
  if (recipe.instructions.length === 0) missing.push('instructions');
  if (!captionStatesServings(sourceText)) missing.push('servings');
  if (recipe.prepTimeMins + recipe.cookTimeMins === 0 || !TIME_MENTION.test(sourceText)) {
    missing.push('time');
  }
  return missing;
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

const FRACTION_FORMS: [number, string[]][] = [
  [0.25, ['1/4', '¼', 'quarter']],
  [0.33, ['1/3', '⅓', 'third']],
  [0.5, ['1/2', '½', 'half']],
  [0.67, ['2/3', '⅔']],
  [0.75, ['3/4', '¾', 'three quarter']],
];

/** Every way a transcript might spell `quantity`. */
function quantitySpellings(quantity: number): string[] {
  const forms = [String(quantity), String(quantity).replace('.', ',')];
  const whole = Math.floor(quantity);
  const fraction = Math.round((quantity - whole) * 100) / 100;
  if (fraction === 0) {
    if (whole < NUMBER_WORDS.length) forms.push(NUMBER_WORDS[whole] ?? '');
    if (whole % 100 === 0 && whole / 100 < NUMBER_WORDS.length) {
      forms.push(`${NUMBER_WORDS[whole / 100]} hundred`);
    }
    if (whole === 12) forms.push('dozen');
  }
  for (const [value, spellings] of FRACTION_FORMS) {
    if (Math.abs(fraction - value) < 0.02) {
      for (const s of spellings) {
        forms.push(whole === 0 ? s : `${whole} ${s}`, `${whole}${s}`);
        if (whole > 0 && whole < NUMBER_WORDS.length) {
          forms.push(`${NUMBER_WORDS[whole]} and a ${s}`);
        }
      }
    }
  }
  return forms.filter(Boolean);
}

/**
 * Indexes of ingredients whose amount appears nowhere in the source text — the
 * model made it concrete ("a drizzle" → 1 tbsp) or misheard it. A hint for the
 * form, so it errs towards NOT flagging: 1 always passes ("a", "an", "one"),
 * and metric amounts pass when the text used imperial units (the extractor
 * converts lb/oz to g, so the number legitimately changed).
 */
export function unverifiedQuantityIndexes(ingredients: Ingredient[], sourceText: string): number[] {
  const text = sourceText.toLowerCase();
  const imperial = /\b(?:lbs?|pounds?|oz|ounces?)\b/.test(text);
  const flagged: number[] = [];
  ingredients.forEach((ingredient, index) => {
    if (ingredient.quantity === 1) return;
    if (imperial && ['g', 'kg', 'ml', 'l'].includes(ingredient.unit.toLowerCase())) return;
    const found = quantitySpellings(ingredient.quantity).some((form) => {
      const escaped = form.toLowerCase().replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
      // Digits must not be part of a longer number ("2" inside "250"), and
      // words must be whole words ("one" is not in "someone").
      const before = /^[a-z]/.test(form) ? '\\b' : '(?<![\\d.,])';
      const after = /[a-z]$/.test(form) ? '\\b' : '(?![\\d])';
      return new RegExp(`${before}${escaped}${after}`).test(text);
    });
    if (!found) flagged.push(index);
  });
  return flagged;
}
