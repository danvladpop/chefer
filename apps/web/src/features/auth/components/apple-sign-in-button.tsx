'use client';

// Sign in with Apple button, drawn to Apple's HIG: black, white Apple logo,
// "Continue with Apple" (the logo is decorative). 44px minimum height.

function AppleLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.62c-.02-2.24 1.83-3.32 1.92-3.37-1.05-1.53-2.67-1.74-3.25-1.76-1.38-.14-2.7.82-3.4.82-.7 0-1.78-.8-2.93-.78-1.51.02-2.9.88-3.68 2.23-1.57 2.72-.4 6.75 1.13 8.96.75 1.08 1.64 2.29 2.8 2.25 1.13-.04 1.55-.73 2.91-.73 1.36 0 1.74.73 2.93.71 1.21-.02 1.98-1.1 2.72-2.19.86-1.25 1.21-2.47 1.23-2.53-.03-.01-2.36-.91-2.38-3.61zM14.15 5.97c.62-.75 1.04-1.8.92-2.84-.89.04-1.97.6-2.61 1.34-.57.66-1.07 1.73-.94 2.75.99.08 2-.5 2.63-1.25z" />
    </svg>
  );
}

export function AppleSignInButton({
  label = 'Continue with Apple',
  disabled,
  onClick,
}: {
  label?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white ring-offset-background hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <AppleLogo />
      {label}
    </button>
  );
}
