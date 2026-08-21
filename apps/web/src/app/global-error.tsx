'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Catches render errors in the root layout itself, where error.tsx can't —
// it replaces <html> entirely, so it must render its own document shell.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: 'flex',
            minHeight: '100dvh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            padding: '1rem',
          }}
        >
          <span style={{ fontSize: '3rem' }} aria-hidden="true">
            ⚠️
          </span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Something went wrong</h1>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.375rem',
              border: '1px solid #ccc',
              background: '#fff',
              cursor: 'pointer',
              minHeight: '44px',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
