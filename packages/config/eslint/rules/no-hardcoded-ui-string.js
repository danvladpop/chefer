// @ts-check
// ADR 0002 (i18n): text a person reads comes from the @chefer/i18n catalogs
// through `t()`, never from a literal in a component. This rule flags JSX text
// and literal strings in the attributes people read or hear (placeholder,
// aria-label, accessibilityLabel…). WARN while the app is converted screen by
// screen (Lane J phases 2–4); it becomes an error once the sweep is done.

/** Attributes whose value is read on screen or by a screen reader. */
export const UI_TEXT_ATTRIBUTES = new Set([
  'placeholder',
  'title',
  'alt',
  'label',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-valuetext',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityValue',
]);

/**
 * Text that is the same in every language Chefer ships: units, symbols and
 * the brand. Compared after trimming, case-sensitively.
 */
const LANGUAGE_NEUTRAL = new Set([
  'Chefer',
  'kcal',
  'g',
  'kg',
  'mg',
  'ml',
  'l',
  'lb',
  'oz',
  'cm',
  'in',
  'min',
  'h',
  'km',
  'mi',
  'RON',
  'EUR',
  'USD',
  'GBP',
  'OK',
]);

/** True when `text` holds something a translator would have to translate. */
export function isTranslatableText(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!/\p{L}/u.test(trimmed)) return false;
  return !LANGUAGE_NEUTRAL.has(trimmed);
}

/** @type {import('eslint').Rule.RuleModule} */
export const noHardcodedUiString = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow hard-coded user-facing text in JSX; use t() from @chefer/i18n (ADR 0002).',
    },
    schema: [],
    messages: {
      hardcoded:
        'Hard-coded UI text "{{text}}". Add a key to @chefer/i18n and render it with t() (ADR 0002).',
    },
  },
  create(context) {
    /** @param {import('estree').Node} node @param {string} text */
    function report(node, text) {
      const shown = text.trim().replace(/\s+/g, ' ');
      context.report({
        node,
        messageId: 'hardcoded',
        data: { text: shown.length > 40 ? `${shown.slice(0, 39)}…` : shown },
      });
    }

    /** Literal strings and template text reachable from a JSX expression. */
    function checkExpression(node) {
      if (!node) return;
      switch (node.type) {
        case 'Literal':
          if (isTranslatableText(node.value)) report(node, /** @type {string} */ (node.value));
          return;
        case 'TemplateLiteral':
          for (const quasi of node.quasis) {
            if (isTranslatableText(quasi.value.cooked)) report(quasi, quasi.value.cooked ?? '');
          }
          return;
        case 'ConditionalExpression':
          checkExpression(node.consequent);
          checkExpression(node.alternate);
          return;
        case 'LogicalExpression':
          checkExpression(node.right);
          return;
        default:
      }
    }

    return {
      JSXText(node) {
        if (isTranslatableText(node.value)) report(node, node.value);
      },
      JSXExpressionContainer(node) {
        // Children only; attribute values are handled below.
        if (node.parent?.type === 'JSXAttribute') return;
        checkExpression(node.expression);
      },
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;
        if (!name || !UI_TEXT_ATTRIBUTES.has(name) || !node.value) return;
        if (node.value.type === 'Literal') checkExpression(node.value);
        else if (node.value.type === 'JSXExpressionContainer')
          checkExpression(node.value.expression);
      },
    };
  },
};

export default noHardcodedUiString;
