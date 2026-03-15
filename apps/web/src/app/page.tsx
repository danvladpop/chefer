import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'PersonalChef.ai — Your AI-Powered Meal Planner',
  description:
    'Generate fully personalized 7-day meal plans tailored to your health goals, dietary restrictions, and food preferences — powered by AI.',
};

const FEATURES = [
  {
    icon: '🗓️',
    title: 'Weekly AI Meal Plans',
    description:
      'Get a complete 7-day meal plan generated in seconds. Every recipe is tailored to your calorie target, macro split, and cuisine preferences.',
  },
  {
    icon: '🎯',
    title: 'Personalized Goals',
    description:
      'Whether you want to lose weight, build muscle, or simply eat healthier — the AI adapts every plan to your specific body metrics and activity level.',
  },
  {
    icon: '🛒',
    title: 'Smart Shopping Lists',
    description:
      'Every plan comes with a consolidated, de-duplicated shopping list so you can go from meal plan to grocery store in one click.',
  },
] as const;

export default async function HomePage() {
  // Redirect authenticated users straight to their dashboard
  const cookieStore = await cookies();
  const session = cookieStore.get('chefer_session');
  if (session?.value) {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-col">
      {/* ── Hero ── */}
      <section className="flex flex-col items-center bg-gradient-to-b from-background to-muted/40 px-4 py-28 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-muted px-4 py-1.5 text-sm font-medium text-muted-foreground">
            <span aria-hidden="true">🍽️</span>
            Powered by AI — no nutritionist required
          </div>

          <h1 className="mb-5 text-5xl font-bold tracking-tight sm:text-6xl">
            Your personal chef,{' '}
            <span className="bg-gradient-to-r from-primary to-emerald-500 bg-clip-text text-transparent">
              powered by AI
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-xl text-xl text-muted-foreground">
            Generate a fully personalized 7-day meal plan in seconds — tailored to your goals,
            dietary needs, and taste preferences.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Get started for free
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── 3-column Features ── */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-3xl font-bold tracking-tight">
              Everything you need to eat well
            </h2>
            <p className="text-lg text-muted-foreground">
              Stop spending hours planning meals. Let AI do the heavy lifting.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {FEATURES.map(({ icon, title, description }) => (
              <div
                key={title}
                className="flex flex-col items-center rounded-xl border bg-card p-8 text-center shadow-sm"
              >
                <div className="mb-4 text-4xl" aria-hidden="true">
                  {icon}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
        <p>
          &copy; {new Date().getFullYear()} PersonalChef.ai &mdash; All rights reserved.
        </p>
      </footer>
    </div>
  );
}
