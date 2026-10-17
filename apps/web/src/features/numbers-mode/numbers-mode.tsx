'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { trpc } from '@/lib/trpc';
import { effectiveNumbersMode } from '@chefer/types';

// WP-08 protein-only mode. ONE predicate for every surface: `useNumbersMode()`.
// Never test the stored string at a call site. `effectiveNumbersMode` maps
// null / NONE (reserved for WP-16) / unknown values to FULL, so screens only
// ever see 'FULL' | 'PROTEIN_ONLY'. Mirrors apps/mobile/src/features/numbers-mode.
//
// The value arrives two ways, both through `NumbersModeProvider`:
//  - the dashboard layout's `NumbersModeHost` reads `preferences.get` once for
//    every page (the query Preferences already uses, so it is shared);
//  - Today and the Tracker wrap their content in a provider fed by their own
//    payload's `numbersMode`, so a cold load never flashes kcal for a
//    protein-only user before `preferences.get` has answered.
// Switching the setting invalidates the queries and every consumer re-renders.

export type EffectiveNumbersMode = 'FULL' | 'PROTEIN_ONLY';

const NumbersModeContext = createContext<EffectiveNumbersMode>('FULL');

/**
 * Supplies the mode below it. `mode` is a raw stored/payload value; `undefined`
 * means "not known here" and inherits the parent's value (null means FULL).
 */
export function NumbersModeProvider({
  mode,
  children,
}: {
  mode: string | null | undefined;
  children: ReactNode;
}) {
  const parent = useContext(NumbersModeContext);
  const value = mode === undefined ? parent : effectiveNumbersMode(mode);
  return <NumbersModeContext.Provider value={value}>{children}</NumbersModeContext.Provider>;
}

/**
 * The effective mode, and the predicate every kcal/macro surface switches on.
 * A page that owns a payload carrying `numbersMode` (Today, the Tracker) passes
 * it as `payloadMode`: it wins over the app-wide value once it has loaded.
 */
export function useNumbersMode(payloadMode?: string | null): {
  mode: EffectiveNumbersMode;
  proteinOnly: boolean;
} {
  const inherited = useContext(NumbersModeContext);
  const mode = payloadMode === undefined ? inherited : effectiveNumbersMode(payloadMode);
  return useMemo(() => ({ mode, proteinOnly: mode === 'PROTEIN_ONLY' }), [mode]);
}

/** Mounted once in the dashboard layout: feeds every page from `preferences.get`. */
export function NumbersModeHost({ children }: { children: ReactNode }) {
  const { data } = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  // Unknown until loaded: inherit (FULL).
  return <NumbersModeProvider mode={data?.numbersMode}>{children}</NumbersModeProvider>;
}
