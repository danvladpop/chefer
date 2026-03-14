import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Welcome to Chefer',
  description: 'A production-ready TypeScript monorepo platform',
};

const features = [
  {
    title: 'Type-Safe API',
    description:
      'End-to-end type safety with tRPC v11. Define your API once, use it everywhere with full autocompletion.',
    icon: '🔒',
  },
  {
    title: 'Modern Stack',
    description:
      'Next.js 15 App Router, React 19, Turborepo 2, pnpm workspaces. Built for performance at scale.',
    icon: '⚡',
  },
  {
    title: 'Database Ready',
    description:
      'Prisma 5 with PostgreSQL. Type-safe queries, migrations, and a seed script out of the box.',
    icon: '🗄️',
  },
  {
    title: 'Testing Suite',
    description:
      'Vitest for unit tests, React Testing Library for components, Playwright for E2E. Coverage included.',
    icon: '✅',
  },
  {
    title: 'DX First',
    description:
      'ESLint 9 flat config, Prettier, Husky, lint-staged, and commitlint for a great developer experience.',
    icon: '🛠️',
  },
  {
    title: 'Production Ready',
    description:
      'Docker multi-stage builds, GitHub Actions CI/CD, environment validation with Zod.',
    icon: '🚀',
  },
] as const;

const techStack = [
  'Next.js 15',
  'React 19',
  'TypeScript 5',
  'tRPC v11',
  'Prisma 5',
  'Turborepo 2',
  'TailwindCSS 3',
  'Vitest',
  'Playwright',
  'Docker',
  'PostgreSQL',
  'Zod',
] as const;

export default function HomePage() {
  return (
    <main className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full bg-gradient-to-b from-background to-muted/30 px-4 py-24 text-center">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 inline-flex items-center rounded-full border bg-muted px-3 py-1 text-sm font-medium">
            <span className="mr-2">🚀</span>
            Production-ready TypeScript monorepo
          </div>
          <h1 className="mb-6 text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Build with{' '}
            <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              confidence
            </span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-muted-foreground">
            A fully-configured TypeScript monorepo with Next.js, tRPC, Prisma, and everything you
            need to ship production-grade applications fast.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Get Started
            </Link>
            <a
              href="https://github.com/chefer/chefer"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-8 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="w-full border-y bg-muted/20 px-4 py-8">
        <div className="mx-auto max-w-5xl">
          <p className="mb-6 text-center text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Built with industry-standard tools
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {techStack.map((tech) => (
              <span
                key={tech}
                className="rounded-full border bg-background px-4 py-1.5 text-sm font-medium text-foreground"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="w-full px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight">Everything you need</h2>
            <p className="text-lg text-muted-foreground">
              A complete foundation so you can focus on building your product.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-3 text-3xl">{feature.icon}</div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="w-full bg-primary px-4 py-20 text-primary-foreground">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold">Ready to build?</h2>
          <p className="mb-8 text-lg opacity-90">
            Clone the repo, run the setup script, and you&apos;re ready to ship.
          </p>
          <div className="rounded-lg bg-primary-foreground/10 p-4 font-mono text-sm">
            <code>
              git clone https://github.com/chefer/chefer && cd chefer &&
              ./infrastructure/scripts/setup.sh
            </code>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t px-4 py-8 text-center text-sm text-muted-foreground">
        <p>
          Built with ❤️ by the Chefer team. MIT License.{' '}
          <a
            href="https://github.com/chefer/chefer"
            className="underline underline-offset-4 hover:text-foreground"
          >
            View source
          </a>
        </p>
      </footer>
    </main>
  );
}
