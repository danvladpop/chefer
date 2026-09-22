// Mirror of the parser in apps/web (dashboard)/shopping-list/page.tsx.

/**
 * "2 kg flour" → {quantity: 2, unit: 'kg', name: 'flour'}; plain text is a
 * name-only item (quantity defaults server-side).
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
  return {
    name: (match[3] ?? '').trim(),
    quantity: parseFloat((match[1] ?? '1').replace(',', '.')),
    ...(match[2] ? { unit: match[2].toLowerCase() } : {}),
  };
}
