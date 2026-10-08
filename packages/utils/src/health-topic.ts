// ─── Health/safety topic classifier (UX-22, T-22.2) ────────────────────────────
// Pure keyword classifier over the LAST user message in a chat turn. The API
// sets `X-Chat-Health-Topic: 1` / `X-Chat-Safety-Topic: 1` from these before
// streaming (the plain-text stream has no "final event" to carry a flag), and
// the client renders the matching disclaimer under that reply.
//
// This is a belt on top of the system-prompt guardrail (T-00.14), not the
// primary control (04 §5.13 risk note): it will miss paraphrases, and that is
// an accepted trade-off — a false negative just means the footer doesn't
// appear on one flagged-looking reply, not that the guardrail itself is gone.
// EN + RO keywords, case- and diacritic-insensitive.

/** Medical/health topics — "not medical advice, check with your GP" (AC4). */
const HEALTH_KEYWORDS = [
  // English
  'diabet',
  'blood sugar',
  'blood pressure',
  'cholesterol',
  'pregnan',
  'breastfeed',
  'medication',
  'medicine',
  'prescription',
  'insulin',
  'thyroid',
  'heart disease',
  'kidney',
  'liver disease',
  'cancer',
  'doctor',
  'gp',
  'symptom',
  'illness',
  'disease',
  'eating disorder',
  'anorexia',
  'bulimia',
  'chronic condition',
  'health condition',
  'medical condition',
  // Unsafe weight loss / disordered eating (App Review R-14)
  'very low calorie',
  'very-low-calorie',
  'low-calorie diet',
  'vlcd',
  'crash diet',
  'starvation',
  'starve myself',
  'starving myself',
  'starve to lose',
  'water fast',
  'fast to lose weight',
  'fasting to lose weight',
  'purge',
  'purging',
  'laxative',
  'binge',
  'self-harm',
  'self harm',
  'hurt myself',
  // Romanian (diacritics stripped by `normalise`)
  'diabet',
  'glicemie',
  'tensiune arteriala',
  'colesterol',
  'gravida',
  'sarcina',
  'alaptare',
  'medicatie',
  'medicamente',
  'insulina',
  'tiroida',
  'boala de rinichi',
  'boala de ficat',
  'cancer',
  'doctor',
  'medic',
  'simptom',
  'boala',
  'tulburare alimentara',
  'anorexie',
  'bulimie',
  'afectiune cronica',
  'afectiune medicala',
  'dieta drastica',
  'infometare',
  'sa ma infometez',
  'vomit',
];

/** Allergen/food-safety topics — "AI can be wrong, check the label" (AC4). */
const SAFETY_KEYWORDS = [
  // English
  'allergy',
  'allergic',
  'allergen',
  'gluten-free',
  'gluten free',
  'nut-free',
  'nut free',
  'dairy-free',
  'dairy free',
  'lactose',
  'celiac',
  'coeliac',
  'cross-contamination',
  'cross contamination',
  'is this safe',
  'safe for my',
  'contain nuts',
  'contains nuts',
  'peanut',
  'shellfish',
  'sesame',
  // Romanian
  'alergie',
  'alergic',
  'alergen',
  'fara gluten',
  'fara lactoza',
  'celiac',
  'contaminare incrucisata',
  'e sigur',
  'este sigur',
  'contine nuci',
  'arahide',
  'fructe de mare',
  'susan',
];

function normalise(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // strip diacritics (ă, â, î, ș, ț → a, a, i, s, t)
}

function matchesAny(normalised: string, keywords: string[]): boolean {
  return keywords.some((k) => normalised.includes(normalise(k)));
}

/**
 * A daily intake stated below the 1,200 kcal safety floor ("800 calories a
 * day", "eat only 600 kcal", "500 cal/day"). A bare per-meal figure ("a 500
 * calorie dinner") is deliberately NOT matched — that's an ordinary cooking
 * question.
 */
const VERY_LOW_DAILY_KCAL =
  /(?<![\d,.])\b([1-9]\d{2}|1[01]\d{2})\s*(?:k?cals?|kilocalories|calories|calorii)\b/g;
const DAILY_CONTEXT =
  /(a|per|pe|each|every|\/)\s*(day|zi)\b|daily|zilnic|only eat|eating only|just eat|to lose weight/;

function mentionsVeryLowDailyIntake(normalised: string): boolean {
  for (const m of normalised.matchAll(VERY_LOW_DAILY_KCAL)) {
    const start = m.index;
    const end = start + m[0].length;
    const before = normalised.slice(Math.max(0, start - 20), start);
    const after = normalised.slice(end, end + 25);
    if (DAILY_CONTEXT.test(after) || /(only|just)\s+(eat\w*\s+)?$/.test(before)) return true;
  }
  return false;
}

/** True when the message reads as a medical/health question (not an allergen check). */
export function isHealthTopic(text: string): boolean {
  const n = normalise(text);
  return matchesAny(n, HEALTH_KEYWORDS) || mentionsVeryLowDailyIntake(n);
}

/** True when the message reads as an allergen/food-safety question. */
export function isSafetyTopic(text: string): boolean {
  return matchesAny(normalise(text), SAFETY_KEYWORDS);
}
