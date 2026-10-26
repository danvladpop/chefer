import Link from 'next/link';
import { StoreTrademarks } from '@/features/app-stores/components/StoreBadges';
import { pressControl } from '@chefer/ui';
import { cn } from '@chefer/utils';

// Top bar and footer shared by the public marketing pages (`/`, `/switch/*`),
// so a footer link added once shows on every one of them.

export function PublicHeader() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-orange-100 px-4 sm:px-8">
      <Link href="/" className="flex min-h-11 items-center gap-2">
        <span className="text-xl" aria-hidden="true">
          🍽️
        </span>
        <span className="font-serif text-lg font-semibold tracking-tight text-[#944a00]">
          Chefer
        </span>
      </Link>
      <Link
        href="/login"
        className={cn(
          'inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-gray-700 hover:bg-gray-100',
          pressControl,
        )}
      >
        Sign in
      </Link>
    </header>
  );
}

const FOOTER_LINKS = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/support', label: 'Support' },
  { href: '/switch/mealime', label: 'Switching from Mealime?' },
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t px-4 py-8 text-center text-sm text-gray-600">
      <p>
        Chefer is a small independent project — feedback shapes it weekly, from the{' '}
        <em>Send feedback</em> button inside the app.
      </p>
      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4">
        {FOOTER_LINKS.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-gray-700"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs">&copy; {new Date().getFullYear()} Chefer</p>
      <StoreTrademarks className="mx-auto mt-2 max-w-xl" />
    </footer>
  );
}
