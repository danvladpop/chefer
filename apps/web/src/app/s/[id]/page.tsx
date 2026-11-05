import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StoreBadges } from '@/features/app-stores/components/StoreBadges';
import { smartAppBanner } from '@/features/app-stores/store-metadata';
import { SHARE_CARD_SIZE } from '@/features/share/share-card-art';
import { serverClient } from '@/lib/trpc-server';
import { buttonVariants } from '@chefer/ui';
import { shareCardLines } from '@chefer/utils';

// Lane E2: the public page a share card links to — the card itself, its
// words as real text (screen readers, link previews) and the way into Chefer.
// Public on purpose (the person chose to share it); never indexed.

type Props = { params: Promise<{ id: string }> };

async function loadCard(id: string) {
  return serverClient.share.get.query({ id }).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const card = await loadCard(id);
  if (!card) return { title: 'Chefer', robots: { index: false } };
  const lines = shareCardLines(card.payload);
  const image = { url: `/s/${id}/image`, ...SHARE_CARD_SIZE, alt: lines.title };
  return {
    ...smartAppBanner(),
    title: lines.title,
    description: lines.eyebrow,
    robots: { index: false },
    openGraph: { title: lines.title, description: lines.eyebrow, images: [image] },
    twitter: { card: 'summary_large_image', images: [image.url] },
  };
}

export default async function ShareCardPage({ params }: Props) {
  const { id } = await params;
  const card = await loadCard(id);
  if (!card) notFound();
  const lines = shareCardLines(card.payload);

  return (
    <main
      id="main"
      tabIndex={-1}
      className="min-h-dvh bg-gradient-to-b from-[#fff3e8] to-white px-4 py-8 outline-none sm:py-12"
    >
      <div className="mx-auto flex max-w-md flex-col items-center gap-6">
        <h1 className="sr-only">{lines.title}</h1>
        {/* eslint-disable-next-line @next/next/no-img-element -- the generated PNG, already sized */}
        <img
          src={`/s/${id}/image`}
          width={SHARE_CARD_SIZE.width}
          height={SHARE_CARD_SIZE.height}
          alt=""
          className="h-auto w-full rounded-card shadow-e2"
        />
        <section aria-label="What this card shows" className="w-full">
          <p className="text-sm font-medium text-gray-600">{lines.eyebrow}</p>
          {lines.stats.length > 0 && (
            <ul className="mt-2 grid gap-1 text-sm text-gray-900">
              {lines.stats.map((stat) => (
                <li key={stat.label}>
                  <span className="font-semibold">{stat.value}</span> {stat.label}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="flex w-full flex-col items-center gap-3 text-center">
          <p className="text-base font-semibold text-gray-900">
            Plan your week, cook it, and train — with Chefer.
          </p>
          <StoreBadges campaign="share-card" />
          <Link href="/register" className={buttonVariants({ variant: 'outline' })}>
            Try Chefer on the web
          </Link>
        </div>
      </div>
    </main>
  );
}
