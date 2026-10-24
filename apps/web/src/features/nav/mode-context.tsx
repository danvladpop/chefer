'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTrainerMode } from '@/features/trainer-mode/use-trainer-mode';
import { capture } from '@/lib/analytics';
import { TRAINER_MODE_COPY, type TrainerBadgesDto } from '@chefer/types';
import {
  deriveMode,
  MODE_HOME,
  modeCookieString,
  modeOfPath,
  navFor,
  type AppMode,
  type ModeNav,
} from './nav-items';

// ─── Food / Gym / Trainer mode (gym_plan.md D3, trainer-mode.md §5.1) ─────────
// The mode is DERIVED, never stored in React alone: `/gym*` is Gym, Food
// destinations are Food, `/trainer*` is Trainer while trainer mode is
// available, and neutral pages (profile, premium …) follow the `chefer_mode`
// cookie. The dashboard layout reads that cookie on the server and passes it
// in as `initialMode`, so SSR renders the right nav — no flash.

interface ModeContextValue {
  mode: AppMode;
  nav: ModeNav;
  /** Switch modes: persists the cookie and navigates to the mode's home. */
  switchMode: (next: AppMode) => void;
  /** A switch is navigating (the mode flipped, the route has not yet). */
  switching: boolean;
  /** The flag is on and trainer tools are active: the Trainer segment shows. */
  trainerModeAvailable: boolean;
  /** Availability is still being found out: wait before acting on "unavailable". */
  trainerModeLoading: boolean;
  /** `trainer.badges` while trainer mode is available, else null. */
  trainerBadges: TrainerBadgesDto | null;
  /** Count badges per nav href (trainer mode's Clients: pending requests, §7.1). */
  navBadges: Readonly<Record<string, number>>;
}

const ModeContext = createContext<ModeContextValue | null>(null);

const NO_BADGES: Readonly<Record<string, number>> = {};

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
  // Screen readers hear the new shell after a switch into or out of trainer
  // mode (§12 "each mode switch announces the new mode").
  const [announcement, setAnnouncement] = useState('');

  const trainer = useTrainerMode();
  // A remembered `trainer` is trusted while the answer is still loading, so a
  // trainer who left in trainer mode gets its nav on the first render.
  const trainerMode = trainer.available || (trainer.isLoading && cookieMode === 'trainer');
  const settledUnavailable = !trainer.isLoading && !trainer.available;

  // Visiting a page that belongs to a mode makes it the remembered mode.
  useEffect(() => {
    setPending(null);
  }, [pathname]);
  useEffect(() => {
    const fromPath = modeOfPath(pathname, { trainerMode });
    if (fromPath && fromPath !== cookieMode) {
      writeModeCookie(fromPath);
      setCookieMode(fromPath);
    } else if (cookieMode === 'trainer' && settledUnavailable) {
      // Trainer mode is gone (tools off, flag off): back to personal (§5.1).
      writeModeCookie('food');
      setCookieMode('food');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to navigation and availability only
  }, [pathname, trainerMode, settledUnavailable]);

  const mode = pending ?? deriveMode(pathname, cookieMode, { trainerMode });
  // WP-18: "Clients" appears for a user whose trainer tools are on, never otherwise.
  const isTrainer = trainer.status.active;

  const switchMode = useCallback(
    (next: AppMode) => {
      if (next === mode) return;
      writeModeCookie(next);
      setCookieMode(next);
      setPending(next);
      if (next === 'trainer' || mode === 'trainer') {
        const to = next === 'trainer' ? 'trainer' : 'personal';
        capture('trainer_mode_switched', { to });
        setAnnouncement(TRAINER_MODE_COPY.mode.switched(to));
      } else {
        capture('gym_mode_switched', { to: next });
      }
      // /gym itself sends a user without a gym profile on to /gym/setup.
      router.push(MODE_HOME[next]);
    },
    [mode, router],
  );

  const badges = trainer.badges;
  const value = useMemo<ModeContextValue>(
    () => ({
      mode,
      nav: navFor(mode, { trainer: isTrainer, trainerMode }),
      switchMode,
      switching: pending !== null,
      trainerModeAvailable: trainer.available,
      trainerModeLoading: trainer.isLoading,
      trainerBadges: badges,
      // Lane K4: Today's badge = clients who went quiet since the trainer last opened Today.
      navBadges:
        mode === 'trainer' && badges
          ? { '/trainer/clients': badges.requests, '/trainer/today': badges.quietClients ?? 0 }
          : NO_BADGES,
    }),
    [
      mode,
      isTrainer,
      trainerMode,
      switchMode,
      pending,
      trainer.available,
      trainer.isLoading,
      badges,
    ],
  );
  return (
    <ModeContext.Provider value={value}>
      {children}
      {trainer.available && (
        <p className="sr-only" aria-live="polite" data-testid="mode-announcement">
          {announcement}
        </p>
      )}
    </ModeContext.Provider>
  );
}

export function useAppMode(): ModeContextValue {
  const ctx = useContext(ModeContext);
  if (!ctx) {
    throw new Error('useAppMode must be used inside <ModeProvider>');
  }
  return ctx;
}

/** The mode context, or null outside the dashboard shell (isolated component tests). */
export function useOptionalAppMode(): ModeContextValue | null {
  return useContext(ModeContext);
}

/**
 * Where "back to the clients" goes: trainer mode's Clients tab, or `/trainer`
 * (Trainer tools) without it.
 */
export function useTrainerClientsHref(): string {
  return useOptionalAppMode()?.trainerModeAvailable ? '/trainer/clients' : '/trainer';
}
