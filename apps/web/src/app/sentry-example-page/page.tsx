'use client';

import { notFound } from 'next/navigation';
import { useState } from 'react';
import * as Sentry from '@sentry/nextjs';

// Sentry wiring validation page — dev only; 404s in production builds.
export default function SentryExamplePage() {
  const [sent, setSent] = useState(false);

  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-bold">Sentry validation</h1>
      <p className="max-w-md text-sm text-gray-600">
        Click the button to throw a test error. It should appear in the Sentry project within a
        minute.
      </p>
      <button
        type="button"
        className="min-h-11 rounded-md border px-4 py-2 font-medium hover:bg-gray-50"
        onClick={() => {
          setSent(true);
          Sentry.captureException(new Error('Sentry example frontend error (manual capture)'));
          throw new Error('Sentry example frontend error (thrown)');
        }}
      >
        Throw test error
      </button>
      {sent && <p className="text-sm text-emerald-600">Sent — check the Sentry issues feed.</p>}
    </main>
  );
}
