import { appStoreUrl, playStoreUrl, type StoreCampaign } from '@chefer/types';
import { pressControl } from '@chefer/ui';
import { cn } from '@chefer/utils';

// Official store badges (ASO plan §5.2). Artwork is unmodified, straight from
// each brand's badge page: public/badges/app-store-badge.svg (Apple marketing
// guidelines) and public/badges/google-play-badge.png (play.google.com/badges,
// which bakes a quarter-height clear space into the PNG). Both render at the
// same 48px visible height — above Apple's 40px minimum, and Google asks for
// the Play badge to be no smaller than any other store's. Apple asks for its
// badge to lead the lineup. The App Store badge appears only once
// APP_STORE_APP_ID is set (iOS still in review).

/** Visible artwork height in px; both badges are sized from it. */
const BADGE_HEIGHT = 48;
// Apple's SVG is 119.66×40 with no padding. Its ¼-height clear space (12px) is
// py-3 above and below; beside it, the Play PNG's own padding supplies it, so
// the pair fits side by side from 375px (and stacks at 320px).
const APPLE_WIDTH = Math.round((BADGE_HEIGHT * 119.66407) / 40);
// Google's PNG is 646×250 with the 564×168 badge centred inside its own clear space.
const PLAY_HEIGHT = Math.round((BADGE_HEIGHT * 250) / 168);
const PLAY_WIDTH = Math.round((PLAY_HEIGHT * 646) / 250);

const linkClass = cn(
  'block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#944a00] focus-visible:ring-offset-2',
  pressControl,
);

type StoreBadgesProps = {
  /** Where the badges sit — becomes the campaign in both store consoles. */
  campaign: StoreCampaign;
  className?: string;
};

export function StoreBadges({ campaign, className }: StoreBadgesProps) {
  const apple = appStoreUrl(campaign);
  return (
    <ul
      aria-label="Get the Chefer app"
      className={cn('flex flex-wrap items-center justify-center', className)}
    >
      {apple && (
        <li>
          <a href={apple} className={cn(linkClass, 'py-3')}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static vector badge, nothing for the optimizer to do */}
            <img
              src="/badges/app-store-badge.svg"
              alt="Download on the App Store"
              width={APPLE_WIDTH}
              height={BADGE_HEIGHT}
              className="block"
            />
          </a>
        </li>
      )}
      <li>
        <a href={playStoreUrl(campaign)} className={linkClass}>
          {/* eslint-disable-next-line @next/next/no-img-element -- official artwork must ship as-is */}
          <img
            src="/badges/google-play-badge.png"
            alt="Get it on Google Play"
            width={PLAY_WIDTH}
            height={PLAY_HEIGHT}
            className="block"
          />
        </a>
      </li>
    </ul>
  );
}

/** Trademark notices both brands ask for wherever their badge is shown. */
export function StoreTrademarks({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs text-gray-500', className)}>
      {appStoreUrl() &&
        'Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries and regions. App Store is a service mark of Apple Inc. '}
      Google Play and the Google Play logo are trademarks of Google LLC.
    </p>
  );
}
