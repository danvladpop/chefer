import { ImageResponse } from 'next/og';
import { SHARE_CARD_SIZE, ShareCardArt } from '@/features/share/share-card-art';
import { env } from '@/lib/env';
import { serverClient } from '@/lib/trpc-server';

// Lane E2: GET /s/<id>/image — the share card as a 1080 × 1350 PNG, rendered
// server-side (next/og) from the public `share.get` snapshot. Public on
// purpose: the person chose to share it. The recipe photo is fetched here and
// inlined, with a short timeout, so a slow image host gives a card without a
// photo instead of no card.

const PHOTO_TIMEOUT_MS = 4000;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

async function inlinePhoto(url: string | null): Promise<string | null> {
  if (!url?.startsWith('https://')) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type.split(';')[0] ?? '')) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_PHOTO_BYTES) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await serverClient.share.get.query({ id }).catch(() => null);
  if (!card) return new Response('Not found', { status: 404 });

  const photo =
    card.payload.kind === 'recipe' || card.payload.kind === 'cook'
      ? await inlinePhoto(card.payload.imageUrl)
      : null;
  return new ImageResponse(
    <ShareCardArt
      payload={card.payload}
      imageDataUrl={photo}
      linkHost={new URL(env.NEXT_PUBLIC_APP_URL).host}
    />,
    {
      ...SHARE_CARD_SIZE,
      // A card never changes after it is made.
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    },
  );
}
