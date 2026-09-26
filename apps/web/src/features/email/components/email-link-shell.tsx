import Link from 'next/link';

// Shared frame for the pages an email link opens (unsubscribe, confirm
// email) — the same warm card as the auth pages, no login needed.

export function EmailLinkShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-12">
      <div className="my-auto w-full max-w-md space-y-8">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 font-serif text-2xl font-semibold text-[#944a00]"
          >
            <span>Chefer</span>
          </Link>
          <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="rounded-xl border bg-card p-6 text-center text-sm shadow-sm sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
