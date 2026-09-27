// Mirror of the parser in apps/web (dashboard)/shopping-list/page.tsx.

// Bug B-32 (T-BUG-32): a bare number with no unit word used to fall through
// with no `unit` at all, and the pantry/list UI then defaulted THAT to
// "pcs" — "paneer 225" rendered as "paneer 225 pcs", and a block of cheese
// can't be edited afterwards (edit is UX-15, Next). Nobody buys 225 pieces
// of a kitchen ingredient in one line; a number this large with no unit word
// is a weight, so it's inferred as grams instead of silently becoming "pcs".
const LARGE_BARE_NUMBER_UNIT_THRESHOLD = 20;

/**
 * "2 kg flour" → {quantity: 2, unit: 'kg', name: 'flour'}; plain text is a
 * name-only item (quantity defaults server-side). "225 paneer" → unit
 * inferred as grams (bug B-32) rather than left to default to "pcs".
 */
export function parseCustomItemInput(raw: string): {
  name: string;
  quantity?: number;
  unit?: string;
} {
  const match = /^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|pcs|x)?\s+(.+)$/i.exec(raw.trim());
  if (!match) {
    return { name: raw.trim() };
  }
  const quantity = parseFloat((match[1] ?? '1').replace(',', '.'));
  const unit =
    match[2]?.toLowerCase() ?? (quantity > LARGE_BARE_NUMBER_UNIT_THRESHOLD ? 'g' : undefined);
  return {
    name: (match[3] ?? '').trim(),
    quantity,
    ...(unit && { unit }),
  };
}
