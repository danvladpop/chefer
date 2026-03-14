import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '404 — Page Not Found',
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">
        404 error
      </p>
      <h1 className="mb-4 text-5xl font-bold tracking-tight">Page not found</h1>
      <p className="mb-8 max-w-md text-lg text-muted-foreground">
        Sorry, we couldn&apos;t find the page you&apos;re looking for. It may have been moved,
        deleted, or never existed.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Return home
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
