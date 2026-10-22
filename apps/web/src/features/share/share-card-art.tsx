import type { ReactElement } from 'react';
import type { ShareCardPayload } from '@chefer/types';
import { shareCardLines } from '@chefer/utils';

// Lane E2: the share card's artwork, rendered by next/og (satori) in
// app/s/[id]/image/route.tsx. Satori supports a subset of CSS: every element
// with more than one child needs `display: flex`, and there is no Tailwind
// here — inline styles only. The words come from `shareCardLines`
// (@chefer/utils), the same lines the landing page shows as text.

export const SHARE_CARD_SIZE = { width: 1080, height: 1350 } as const;

const BRAND = '#944A00';
const BRAND_DEEP = '#7E3E00';
const CREAM = '#FFF4E6';
const RING = '#E9CFAE';

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={(size * 544) / 784} viewBox="120 240 784 544">
      <circle cx="512" cy="512" r="228" fill={CREAM} />
      <circle cx="512" cy="512" r="162" fill="none" stroke={RING} strokeWidth="16" />
      <rect x="176" y="296" width="16" height="150" rx="8" fill={CREAM} />
      <rect x="208" y="296" width="16" height="150" rx="8" fill={CREAM} />
      <rect x="240" y="296" width="16" height="150" rx="8" fill={CREAM} />
      <path
        d="M176 430 H256 V446 Q256 492 232 504 V712 Q232 732 216 732 Q200 732 200 712 V504 Q176 492 176 446 Z"
        fill={CREAM}
      />
      <path d="M800 296 V520 H852 V470 Q852 330 800 296 Z" fill={CREAM} />
      <rect x="806" y="500" width="36" height="232" rx="18" fill={CREAM} />
    </svg>
  );
}

export function ShareCardArt({
  payload,
  imageDataUrl,
  linkHost,
}: {
  payload: ShareCardPayload;
  /** The recipe photo, already fetched and inlined (null = no photo panel). */
  imageDataUrl: string | null;
  /** "chefer.duckdns.org" — printed as the app link. */
  linkHost: string;
}): ReactElement {
  const lines = shareCardLines(payload);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 72,
        background: `linear-gradient(160deg, ${BRAND} 0%, ${BRAND_DEEP} 100%)`,
        color: CREAM,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Mark size={110} />
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1 }}>Chefer</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, marginTop: 56 }}>
        <div style={{ fontSize: 34, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 3 }}>
          {lines.eyebrow}
        </div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1, marginTop: 16 }}>
          {lines.title}
        </div>
        {imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>
          <img
            src={imageDataUrl}
            width={936}
            height={560}
            style={{ marginTop: 40, borderRadius: 32, objectFit: 'cover' }}
          />
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 44 }}>
          {lines.stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 20,
                padding: '22px 32px',
                borderRadius: 28,
                background: 'rgba(255, 244, 230, 0.12)',
              }}
            >
              <div style={{ fontSize: 60, fontWeight: 700 }}>{stat.value}</div>
              <div style={{ fontSize: 36, opacity: 0.9 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 32,
          opacity: 0.9,
        }}
      >
        <div>Plan, cook and train with Chefer</div>
        <div style={{ fontWeight: 700 }}>{linkHost}</div>
      </div>
    </div>
  );
}
