import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { env } from '@/lib/env';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/seo/brand';
import { TRPCProvider } from '@/lib/trpc-provider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

// The app is fully authenticated and data-driven — render every route
// dynamically. This also avoids static-prerender pitfalls (useSearchParams /
// cookies) during `next build`.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'meal planner',
    'weekly meal plan',
    'shopping list',
    'calorie tracker',
    'allergy-safe recipes',
    'macro tracking',
    'gym workout planner',
  ],
  applicationName: SITE_NAME,
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Lets content extend into the notch/home-indicator area and makes
  // env(safe-area-inset-*) resolve to real values instead of 0.
  viewportFit: 'cover',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-dvh bg-background font-sans antialiased`}
      >
        <TRPCProvider>
          <div className="relative flex min-h-dvh flex-col">{children}</div>
        </TRPCProvider>
      </body>
    </html>
  );
}
