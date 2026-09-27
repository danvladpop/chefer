// @ts-check
// Chefer §2.10 (docs/persona-study-2026-09/synthesis/04-technical-plan.md) —
// user-facing copy must never read as a safety/medical guarantee ("Safe",
// "allergen-free", "cure"…) or shame a streak ("missed", "0-week streak").
// This rule is the AST half of the guard; `containsForbiddenPhrase` is
// reused verbatim by a Vitest test over the *exported string values* of the
// copy modules (belt and braces — a rule on string literals is easy to dodge
// with a template literal built at runtime).

/**
 * Case-insensitive, whole-word/phrase matches. Keep this list additive only —
 * removing an entry is a copy-safety regression, not a lint cleanup.
 */
export const FORBIDDEN_PHRASES = [
  // Safety/medical guarantees (base list, §2.10)
  'safe',
  'allergen-free',
  'nut-free',
  'guaranteed',
  'suitable for',
  'ai meal plans tailored',
  'nutrition profile',
  'diabetics',
  'cure',
  'cures',
  'cured',
  'curing',
  'treat',
  'treats',
  'treated',
  'treating',
  'prevent',
  'prevents',
  'prevented',
  'preventing',
  // Medical-claim additions (rev 2)
  'diagnose',
  'diagnosis',
  'diagnosed',
  'medical advice',
  'clinically proven',
  // Shame-free streak/tracking language (rev 2)
  'missed',
  '0-week streak',
];

/**
 * Exact, negated phrasings that are the OPPOSITE of a medical-advice claim —
 * the mandatory disclaimer wording itself (UX-22 AC4, `terms/page.tsx`'s
 * "Health and nutrition: not medical advice" heading). Stripped out before
 * the forbidden-phrase scan runs, so the disclaimer that DISCLAIMS medical
 * advice doesn't trip the rule meant to catch a CLAIM of it. Keep this list
 * exact and narrow — it is not a general negation heuristic, so "medical
 * advice" anywhere else in the same string is still caught.
 */
const ALLOWED_NEGATED_PHRASES = [
  'not medical advice',
  'not a medical advice',
  "isn't medical advice",
  'is not medical advice',
  "doesn't give medical advice",
  'does not give medical advice',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PHRASE_MATCHERS = FORBIDDEN_PHRASES.map((phrase) => ({
  phrase,
  regex: new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i'),
}));

const ALLOWED_NEGATED_REGEXES = ALLOWED_NEGATED_PHRASES.map(
  (phrase) => new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi'),
);

/** Returns the first forbidden phrase found in `text`, or null. */
export function containsForbiddenPhrase(text) {
  if (typeof text !== 'string') return null;
  let scanned = text;
  for (const regex of ALLOWED_NEGATED_REGEXES) {
    scanned = scanned.replace(regex, '');
  }
  for (const { phrase, regex } of PHRASE_MATCHERS) {
    if (regex.test(scanned)) return phrase;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export const noForbiddenCopy = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow safety/medical-guarantee wording and shame-based streak copy in user-facing copy modules (technical-plan.md §2.10).',
    },
    schema: [],
    messages: {
      forbidden:
        'Copy contains the forbidden phrase "{{phrase}}". See technical-plan.md §2.10 — safety/medical claims and shame language are never user-facing copy.',
    },
  },
  create(context) {
    /** @param {import('estree').Node} node */
    function check(node, text) {
      const phrase = containsForbiddenPhrase(text);
      if (phrase) {
        context.report({ node, messageId: 'forbidden', data: { phrase } });
      }
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          check(node, node.value);
        }
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

export default noForbiddenCopy;
