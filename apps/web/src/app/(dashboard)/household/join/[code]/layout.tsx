import type { Metadata } from 'next';
import { HOUSEHOLD_SHARING_COPY } from '@chefer/types';

// Per-segment tab title; the page is a client component and cannot export metadata.
export const metadata: Metadata = {
  title: HOUSEHOLD_SHARING_COPY.joinPageTitle,
  robots: { index: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
