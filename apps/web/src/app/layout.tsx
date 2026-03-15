import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

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

export const metadata: Metadata = {
  title: {
    default: 'Chefer',
    template: '%s | Chefer',
  },
  description:
    'A production-ready TypeScript monorepo starter with Next.js, tRPC, Prisma, and more.',
  keywords: ['chefer', 'nextjs', 'typescript', 'monorepo', 'trpc', 'prisma'],
  authors: [{ name: 'Chefer Team', url: 'https://chefer.dev' }],
  creator: 'Chefer Team',
  metadataBase: new URL(process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'Chefer',
    description: 'A production-ready TypeScript monorepo starter.',
    siteName: 'Chefer',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chefer',
    description: 'A production-ready TypeScript monorepo starter.',
    creator: '@chefer',
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
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans antialiased`}
      >
        <TRPCProvider>
          <div className="relative flex min-h-screen flex-col">
            {children}
          </div>
        </TRPCProvider>
      </body>
    </html>
  );
}
