import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { effectiveNumbersMode } from '@chefer/types';
import { trpc } from '../../lib/trpc';

// WP-08 protein-only mode. ONE predicate for every surface: `useNumbersMode()`.
// Never test the stored string at a call site. `effectiveNumbersMode` maps
// null / NONE (reserved for WP-16) / unknown values to FULL, so the screens
// only ever see 'FULL' | 'PROTEIN_ONLY'.
//
// The value arrives two ways, both through `NumbersModeProvider`:
//  - the root `NumbersModeHost` reads `preferences.get` once for the whole app
//    (the query the Preferences screen already uses, so it is shared);
//  - Today and the Tracker wrap their content in a provider fed by their own
//    payload's `numbersMode`, so a cold start never flashes kcal for a
//    protein-only user before `preferences.get` has answered.
// Switching the setting invalidates the queries, and every consumer re-renders.

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
 * A screen that owns a payload carrying `numbersMode` (Today, the Tracker) passes
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

/** Mounted once in the root layout: feeds the whole app from `preferences.get`. */
export function NumbersModeHost({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const { data } = trpc.preferences.get.useQuery(undefined, {
    enabled: signedIn,
    staleTime: 60_000,
  });
  // Unknown until loaded: inherit (FULL). A signed-out session shows FULL too.
  return (
    <NumbersModeProvider mode={signedIn ? data?.numbersMode : null}>{children}</NumbersModeProvider>
  );
}
