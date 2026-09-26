import { ImageResponse } from 'next/og';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/seo/brand';

// The share card for every page (Twitter reuses it via twitter-image.tsx).
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 56,
        padding: '0 80px',
        background: 'linear-gradient(135deg, #A9570A 0%, #7E3E00 100%)',
        color: '#FFF4E6',
        fontFamily: 'sans-serif',
      }}
    >
      <svg width="340" height="236" viewBox="120 240 784 544">
        <circle cx="512" cy="512" r="228" fill="#FFF4E6" />
        <circle cx="512" cy="512" r="162" fill="none" stroke="#E9CFAE" strokeWidth="16" />
        <rect x="176" y="296" width="16" height="150" rx="8" fill="#FFF4E6" />
        <rect x="208" y="296" width="16" height="150" rx="8" fill="#FFF4E6" />
        <rect x="240" y="296" width="16" height="150" rx="8" fill="#FFF4E6" />
        <path
          d="M176 430 H256 V446 Q256 492 232 504 V712 Q232 732 216 732 Q200 732 200 712 V504 Q176 492 176 446 Z"
          fill="#FFF4E6"
        />
        <path d="M800 296 V520 H852 V470 Q852 330 800 296 Z" fill="#FFF4E6" />
        <rect x="806" y="500" width="36" height="232" rx="18" fill="#FFF4E6" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 620 }}>
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 44, marginTop: 8 }}>{SITE_TAGLINE}</div>
        <div style={{ fontSize: 26, marginTop: 28, opacity: 0.85, lineHeight: 1.35 }}>
          {SITE_DESCRIPTION}
        </div>
      </div>
    </div>,
    size,
  );
}
