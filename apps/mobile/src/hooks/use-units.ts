import { useMemo } from 'react';
import { addItemPlaceholder, formatQty, unitOptionsFor, type UnitSystem } from '@chefer/utils';
import { useUnitSystem } from './use-unit-system';

export type Units = {
  system: UnitSystem;
  isImperial: boolean;
  /** "2 lb", "1,5 kg" — a list quantity in the user's units and the device's number format. */
  qty: (quantity: number, unit?: string | null) => string;
  /** The add-item placeholder in the user's own units ("e.g. 2 lb chicken"). */
  addItemPlaceholder: string;
  /** Unit chips for a quantity field in the user's system. */
  unitOptions: readonly string[];
};

/**
 * The ONE way a screen asks "which units, and how do I print them" (WP-11,
 * audit §6.4, UX-SHOP-01/05): backed by a freshly fetched `preferredUnits`
 * (see `useUnitSystem`), formatted by the shared `@chefer/utils` formatters
 * in the device locale. Mirror of apps/web `hooks/useUnits.ts`.
 */
export function useUnits(): Units {
  const system = useUnitSystem();
  return useMemo(
    () => ({
      system,
      isImperial: system === 'IMPERIAL',
      qty: (quantity, unit) => formatQty(quantity, unit, system),
      addItemPlaceholder: addItemPlaceholder(system),
      unitOptions: unitOptionsFor(system),
    }),
    [system],
  );
}
