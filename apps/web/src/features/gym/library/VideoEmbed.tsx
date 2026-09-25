'use client';

import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { captureGymEvent } from '../analytics';

// "Watch technique" — click-to-load YouTube (gym_plan.md §1.3, §5.5). Poster
// first, no iframe (and no third-party request) until the user opts in. The
// nocookie embed still needs a referrer, and web (unlike the mobile WebView)
// can't set one, so the "Open on YouTube" fallback is the one that reliably
// works everywhere and is always shown alongside the inline player.

export interface VideoEmbedProps {
  videoId: string;
  startSec: number | null;
  channel: string | null;
}

export function VideoEmbed({ videoId, startSec, channel }: VideoEmbedProps) {
  const [loaded, setLoaded] = useState(false);
  const start = startSec ?? 0;
  const watchUrl = `https://youtu.be/${videoId}${start > 0 ? `?t=${start}` : ''}`;

  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="relative aspect-video w-full bg-neutral-900">
        {loaded ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?start=${start}&autoplay=1&rel=0`}
            title="Exercise technique video"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-80"
            />
            <button
              type="button"
              onClick={() => {
                captureGymEvent('video_opened', { fallback: false });
                setLoaded(true);
              }}
              aria-label="Play technique video"
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:scale-105">
                <Play className="ml-1 h-6 w-6 text-neutral-900" fill="currentColor" />
              </span>
            </button>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <p className="min-w-0 truncate text-xs text-neutral-500">
          {channel ? `Video: ${channel}` : 'Technique video'}
        </p>
        <a
          href={watchUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={() => captureGymEvent('video_opened', { fallback: true })}
          className="flex min-h-8 shrink-0 items-center gap-1 text-xs font-medium text-[#944a00] hover:underline"
        >
          Open on YouTube
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
