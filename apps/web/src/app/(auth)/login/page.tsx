import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your Chefer account',
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Logo / Brand */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-2xl font-bold">
            <span className="text-3xl">⚡</span>
            <span>Chefer</span>
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to your account to continue
          </p>
        </div>

        {/* Login Form Card */}
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          <LoginForm />
        </div>

        {/* Footer Links */}
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Sign up
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          By signing in, you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
