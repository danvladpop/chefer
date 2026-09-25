'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { capture } from '@/lib/analytics';
import {
  deriveMode,
  MODE_HOME,
  modeCookieString,
  modeOfPath,
  navFor,
  type AppMode,
  type ModeNav,
} from './nav-items';

// ─── Food / Gym mode (gym_plan.md D3 on web) ──────────────────────────────────
// The mode is DERIVED, never stored in React alone: `/gym*` is Gym, Food
// destinations are Food, and neutral pages (profile, premium …) follow the
// `chefer_mode` cookie. The dashboard layout reads that cookie on the server
// and passes it in as `initialMode`, so SSR renders the right nav — no flash.

interface ModeContextValue {
  mode: AppMode;
  nav: ModeNav;
  /** Switch modes: persists the cookie and navigates to the mode's home. */
  switchMode: (next: AppMode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

function writeModeCookie(mode: AppMode): void {
  try {
    document.cookie = modeCookieString(mode);
  } catch {
    // Cookies disabled: the pathname still decides the mode on gym/food pages.
  }
}

export function ModeProvider({
  initialMode,
  children,
}: {
  initialMode: AppMode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [cookieMode, setCookieMode] = useState<AppMode>(initialMode);
  // Optimistic target while the switch navigation is in flight, so the
  // control flips on click rather than when the next route has loaded.
  const [pending, setPending] = useState<AppMode | null>(null);

  // Visiting a page that belongs to a mode makes it the remembered mode.
  useEffect(() => {
    setPending(null);
    const fromPath = modeOfPath(pathname);
    if (fromPath && fromPath !== cookieMode) {
      writeModeCookie(fromPath);
      setCookieMode(fromPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to navigation only
  }, [pathname]);

  const mode = pending ?? deriveMode(pathname, cookieMode);

  const switchMode = useCallback(
    (next: AppMode) => {
      if (next === mode) return;
      writeModeCookie(next);
      setCookieMode(next);
      setPending(next);
      capture('gym_mode_switched', { to: next });
      // /gym itself sends a user without a gym profile on to /gym/setup.
      router.push(MODE_HOME[next]);
    },
    [mode, router],
  );

  const value = useMemo(() => ({ mode, nav: navFor(mode), switchMode }), [mode, switchMode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useAppMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    throw new Error('useAppMode must be used inside <ModeProvider>');
  }
  return ctx;
}
