'use client';

import { useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Share2 } from 'lucide-react';
import type { CreateShareCardInput, ShareCardLink } from '@chefer/types';
import { Button, Sheet, type ButtonProps } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

// Lane E2 (market review 2026-10): "Share as a card" on the web. The card is
// made by `share.create` and rendered server-side at /s/<id>/image. With the
// Web Share API (phones, Safari, Edge) the PNG itself goes to the OS share
// sheet with the link; elsewhere a sheet shows the card with Download and Copy
// link.

async function cardFile(link: ShareCardLink): Promise<File | null> {
  try {
    const res = await fetch(link.imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], `chefer-${link.id}.png`, { type: 'image/png' });
  } catch {
    return null;
  }
}

/** True when the browser shared it; false when the fallback sheet should open. */
async function shareNatively(link: ShareCardLink, message: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  const file = await cardFile(link);
  const data: ShareData =
    file && navigator.canShare?.({ files: [file] })
      ? { files: [file], text: message, url: link.url }
      : { text: message, url: link.url };
  try {
    await navigator.share(data);
  } catch {
    // AbortError = the user closed the sheet; anything else falls back below.
  }
  return true;
}

export function ShareCardButton({
  input,
  message,
  label = 'Share as a card',
  variant = 'outline',
  className,
  testId,
}: {
  input: CreateShareCardInput;
  message: string;
  label?: string;
  variant?: ButtonProps['variant'];
  className?: string;
  testId?: string;
}) {
  const create = trpc.share.create.useMutation({ meta: { silent: true } });
  const [link, setLink] = useState<ShareCardLink | null>(null);
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    setCopied(false);
    const made = await create.mutateAsync(input).catch(() => null);
    if (!made) return;
    const native = await shareNatively(made, message);
    capture('share_card_shared', { kind: input.kind, completed: native });
    if (!native) setLink(made);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        data-testid={testId}
        disabled={create.isPending}
        onClick={() => void onShare()}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {create.isPending ? 'Making your card…' : label}
      </Button>
      {create.isError && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {userFacingErrorMessage(create.error)}
        </p>
      )}
      <Sheet
        open={link !== null}
        onClose={() => setLink(null)}
        title="Your card is ready"
        description="Download it, or copy the link to share it anywhere."
        footer={
          link ? (
            <div className="flex flex-wrap gap-2">
              <a
                href={link.imageUrl}
                download={`chefer-${link.id}.png`}
                className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Download
              </a>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard.writeText(link.url).then(() => setCopied(true))
                }
              >
                {copied ? 'Link copied' : 'Copy link'}
              </Button>
            </div>
          ) : null
        }
      >
        {link && (
          // eslint-disable-next-line @next/next/no-img-element -- the generated PNG, already sized
          <img
            src={link.imageUrl}
            width={1080}
            height={1350}
            alt="Your Chefer share card"
            className="h-auto w-full rounded-card"
          />
        )}
      </Sheet>
    </>
  );
}
