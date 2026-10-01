// ─── AI data consent (App Store Guideline 5.1.2(i)) ──────────────────────────
// Before the first AI action, web and mobile show the same consent sheet:
// what is sent, to whom, that it is not used for training, and a link to the
// privacy policy. "Not now" cancels the action with nothing sent. The copy
// lives here so both platforms say exactly the same thing.

/** Every client action that sends the user's data to the AI provider. */
export const AI_CONSENT_FEATURES = [
  'meal-plan',
  'meal-swap',
  'meal-scan',
  'recipe-import',
  'chat',
  'shopping-list',
  'ingredient-estimate',
] as const;
export type AiConsentFeature = (typeof AI_CONSENT_FEATURES)[number];

/** Per-action: what the user is doing, and exactly which data it sends. */
export const AI_CONSENT_FEATURE_DATA: Record<AiConsentFeature, { action: string; data: string[] }> =
  {
    'meal-plan': {
      action: 'build your meal plan',
      data: [
        'Your dietary preferences, allergies and disliked ingredients',
        'Your goal and body metrics (age, sex, height, weight, activity level, calorie target)',
        'Your household members’ needs, the recipes you rated and your pantry items',
      ],
    },
    'meal-swap': {
      action: 'find a replacement meal',
      data: [
        'Your dietary preferences, allergies and favourite cuisines',
        'The meal you are replacing',
      ],
    },
    'meal-scan': {
      action: 'estimate the nutrition in your photo',
      data: ['The photo you take or choose'],
    },
    'recipe-import': {
      action: 'read and adapt the recipe',
      data: [
        'The link, text or photo you submit',
        'For a video link: its caption and subtitles, or its audio transcribed by Groq (deleted right after)',
        'Your allergies, dietary restrictions and disliked ingredients',
      ],
    },
    chat: {
      action: 'answer your message',
      data: [
        'The messages you send',
        'Your targets, allergies, restrictions, today’s meals and recent ratings',
      ],
    },
    'shopping-list': {
      action: 'tidy up your shopping list',
      data: ['The ingredients in your meal plan'],
    },
    'ingredient-estimate': {
      action: 'fill in the nutrition for your ingredient',
      data: ['The ingredient name you typed'],
    },
  };

// ─── Server-side enforcement (R-10) ──────────────────────────────────────────
// The API refuses an AI action from a user who has no consent on record
// (AI_CONSENT_ENFORCE, apps/api/src/lib/ai-consent-gate.ts). The rejection is
// recognisable on every transport: tRPC errors carry `data.reason`, the plain
// HTTP endpoints (/api/chat, /api/scan-meal) answer 403 with `{ error, reason }`
// and an `X-AI-Consent-Required: 1` header. Clients that know the reason open
// the consent sheet; older clients just show the message.

/** `error.data.reason` / JSON `reason` of an AI action rejected for missing consent. */
export const AI_CONSENT_REQUIRED_REASON = 'AI_CONSENT_REQUIRED';

/** Header set on the plain HTTP endpoints' consent rejection. */
export const AI_CONSENT_REQUIRED_HEADER = 'x-ai-consent-required';

/** The message of the rejection — copy a user can act on even in an old client. */
export const AI_CONSENT_REQUIRED_MESSAGE =
  'Allow AI features in Profile → AI & your data to use this.';

// ─── Who receives the data ───────────────────────────────────────────────────
// The AI providers are a server setting (AI_FREE_ONLY), so the copy never
// hard-codes one: the API reports the active set (`profile.aiProviders`) and
// the helpers in @chefer/utils fill `{primary}` / `{backups}` / `{providers}`
// from this table. Until that answer arrives (or on an old server) clients
// use DEFAULT_AI_PROVIDER_DISCLOSURE, which matches production (free-only
// routing: Groq, with Cloudflare Workers AI as the backup).

/** Every AI provider Chefer can send user data to, with its public-facing facts. */
export const AI_PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    shortName: 'Gemini',
    privacyName: 'Google (Gemini API)',
    privacyDetail: 'It may process data in the United States and other countries.',
  },
  groq: {
    name: 'Groq',
    shortName: 'Groq',
    privacyName: 'Groq',
    privacyDetail:
      'United States. Under its services agreement Groq does not use what we send to train models.',
  },
  cloudflare: {
    name: 'Cloudflare Workers AI',
    shortName: 'Cloudflare',
    privacyName: 'Cloudflare (Workers AI)',
    privacyDetail:
      'Cloudflare is a US company and runs the models on its global network, so a request may be processed outside the EU. Cloudflare does not use what we send to train models.',
  },
} as const;
export type AiProviderId = keyof typeof AI_PROVIDERS;
export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProviderId[];

/** Which providers are live: the main one, and the ones it fails over to. */
export interface AiProviderDisclosure {
  primary: AiProviderId;
  backups: AiProviderId[];
}

/**
 * Paid routing: Gemini, with Groq as the backup. NOT what production runs
 * (production is AI_FREE_ONLY) — only shown when the server reports it.
 */
export const LEGACY_AI_PROVIDER_DISCLOSURE: AiProviderDisclosure = {
  primary: 'gemini',
  backups: ['groq'],
};

/** AI_FREE_ONLY=true: Groq's free tier, with Cloudflare Workers AI as the backup. */
export const FREE_ONLY_AI_PROVIDER_DISCLOSURE: AiProviderDisclosure = {
  primary: 'groq',
  backups: ['cloudflare'],
};

/**
 * What clients assume before the server has answered (or when the request
 * fails). Matches production: naming a provider that is not used would make
 * the consent sheet inaccurate (App Store 5.1.2(i)).
 */
export const DEFAULT_AI_PROVIDER_DISCLOSURE = FREE_ONLY_AI_PROVIDER_DISCLOSURE;

/**
 * Shared sheet + settings copy. `{action}` is filled from
 * AI_CONSENT_FEATURE_DATA; `{primary}`, `{primaryShort}`, `{backups}` and
 * `{providers}` from the active AiProviderDisclosure (see @chefer/utils
 * aiConsentIntro / aiConsentBackupLine / aiConsentToggleOn).
 */
export const AI_CONSENT_COPY = {
  title: 'Allow AI to use your data?',
  intro:
    'To {action}, Chefer sends some of your data to {primary}, a third-party AI service, which uses it only to produce the result.',
  sentHeading: 'What gets sent',
  noTraining: 'Your data is not used to train AI models.',
  backupProvider:
    'If {primaryShort} is busy, a request may be handled by {backups}, a backup AI service, instead.',
  control: 'We only ask once. You can turn this off at any time in Profile → AI & your data.',
  privacyLabel: 'Privacy policy',
  privacyPath: '/privacy',
  allow: 'Allow',
  notNow: 'Not now',
  saving: 'Saving…',
  saveError: 'Couldn’t save your choice. Please try again.',
  // Profile card + toggle
  cardTitle: 'AI & your data',
  toggleTitle: 'Allow AI features to process my data',
  toggleOn:
    'Meal plans, meal swaps, photo scans, recipe and video imports, chat, ingredient fill-in, the AI shopping-list tidy-up and the weekly coach review send the data they need to {providers}. Not used for training.',
  toggleOff: 'Off. We’ll ask again before any AI feature sends your data.',
  /** What the weekly coach review sends (it runs on its own, so it has no sheet of its own). */
  coachReviewNote:
    'The weekly coach review (Premium) also uses this: it sends your weight trend, goal and average calories. Without it, the review is written from a template and nothing is sent.',
} as const;
