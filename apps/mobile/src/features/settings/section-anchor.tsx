import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useScrollFieldIntoView } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// ─── Settings section anchors (UX-ACC-04) ──────────────────────────────────────
// The Settings hub lists ~20 rows but only a handful of screens. A row opens
// its screen with `?section=<id>`; the card that owns that setting wraps itself
// in <SectionAnchor id="…">, which scrolls it into view and tints it for a
// moment so the user sees which card the row meant. The screen's title follows
// the row (`useSectionTitle`).
//
// Scrolling goes through `useScrollFieldIntoView()` (any ref with
// `measureLayout` works, a View included), so the anchor must sit inside a
// `KeyboardAwareScrollView`; outside one it is a plain wrapper. Cards above the
// target often finish loading after it mounts and push it down, so the target
// re-scrolls on every layout change for a short settle window — and stops once
// that has passed, so it never fights the user's own scrolling.

/** Section ids → the screen title the matching Settings row promised. Ids are unique across screens. */
export const SECTION_TITLES: Readonly<Record<string, string>> = {
  // Preferences
  safety: 'Allergies & diets',
  'goal-body': 'Goal & body',
  targets: 'Your targets',
  display: 'Money & units',
  budget: 'Weekly budget',
  'auto-plan': 'Plan my week automatically',
  'weekly-updates': 'Weekly updates',
  // Profile
  plan: 'Plan & Premium',
  privacy: 'Privacy & data',
  account: 'Your data & account',
  // Gym settings
  units: 'Units, equipment & weekly goal',
  reminders: 'Training days & reminders',
  pause: 'Pause training',
  export: 'Export workouts',
};

/** How long after first layout the target keeps re-scrolling while the page above it settles. */
export const SECTION_SETTLE_MS = 1500;
/** How long the target stays tinted. */
export const SECTION_HIGHLIGHT_MS = 2500;
const SCROLL_MARGIN = 12;

/** The `?section=` the screen was opened with (null for none or an unknown id). */
export function useSectionParam(): string | null {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const raw = Array.isArray(params.section) ? params.section[0] : params.section;
  return raw !== undefined && Object.prototype.hasOwnProperty.call(SECTION_TITLES, raw)
    ? raw
    : null;
}

/** The screen title for the opened section, else the screen's own. */
export function useSectionTitle(fallback: string): string {
  const section = useSectionParam();
  return section ? (SECTION_TITLES[section] ?? fallback) : fallback;
}

export function SectionAnchor({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const target = useSectionParam();
  const isTarget = target === id;
  const ref = useRef<View>(null);
  const scrollIntoView = useScrollFieldIntoView();
  const settleUntil = useRef<number | null>(null);
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => setHighlighted(false), SECTION_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlighted]);

  const onLayout = () => {
    if (!isTarget) return;
    const now = Date.now();
    if (settleUntil.current === null) {
      settleUntil.current = now + SECTION_SETTLE_MS;
      setHighlighted(true);
    } else if (now > settleUntil.current) {
      return;
    }
    scrollIntoView(ref.current, SCROLL_MARGIN);
  };

  return (
    // `-m-1 p-1` grows the tint 4 pt beyond the card without moving anything.
    <View
      ref={ref}
      testID={`section-${id}`}
      onLayout={onLayout}
      className={cn('-m-1 rounded-3xl p-1', highlighted && 'bg-primary/15', className)}
    >
      {children}
    </View>
  );
}
