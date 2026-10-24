import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { PopIn, Text } from '@chefer/ui-mobile';

// The live PR banner (mockup 03, build-plan Lane C §4): a set that just beat
// your best says so for three seconds — "New best · Bench press 80 kg × 5" —
// without stopping the workout (it never takes a touch). The pop is MO-14, the
// success haptic stays with the caller. `useLivePrBanner` owns the 3 s clock;
// a second PR replaces the first and restarts it.

export const LIVE_PR_BANNER_MS = 3000;

export type LivePrBannerState = { id: number; text: string };

export function useLivePrBanner(): {
  banner: LivePrBannerState | null;
  show: (text: string) => void;
} {
  const [banner, setBanner] = useState<LivePrBannerState | null>(null);
  const next = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    next.current += 1;
    setBanner({ id: next.current, text });
    timer.current = setTimeout(() => setBanner(null), LIVE_PR_BANNER_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { banner, show };
}

export function LivePrBanner({
  banner,
  bottom,
}: {
  banner: LivePrBannerState | null;
  /** Distance from the screen's bottom edge (above the rest bar). */
  bottom: number;
}) {
  if (!banner) return null;
  return (
    <View pointerEvents="none" style={{ bottom }} className="absolute left-4 right-4 items-center">
      {/* Keyed so a second PR pops again. */}
      <PopIn key={banner.id} shine>
        <View
          testID="live-pr-banner"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={banner.text}
          className="rounded-full bg-brand px-5 py-3"
        >
          <Text numberOfLines={2} className="text-center text-callout font-bold text-brand-on">
            🏅 {banner.text}
          </Text>
        </View>
      </PopIn>
    </View>
  );
}
