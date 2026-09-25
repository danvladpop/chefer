'use client';

import { Dumbbell } from 'lucide-react';

// Start/end photo loop (gym_plan.md §1.3, §5.5): a cheap CSS crossfade that
// works offline (no video, no JS timer). `motion-reduce:` drops the animation
// class entirely so a reduced-motion viewer sees the start photo, static.

export function PhotoCrossfade({ images, alt }: { images: string[]; alt: string }) {
  const [start, end] = images;

  if (!start) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-neutral-100">
        <Dumbbell className="h-10 w-10 text-neutral-300" aria-hidden="true" />
      </div>
    );
  }

  if (!end || end === start) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={start}
        alt={alt}
        className="aspect-square w-full rounded-2xl bg-neutral-100 object-cover"
      />
    );
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={start}
        alt={alt}
        className="absolute inset-0 h-full w-full animate-gym-photo-a object-cover motion-reduce:animate-none"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={end}
        alt=""
        className="absolute inset-0 h-full w-full animate-gym-photo-b object-cover opacity-0 motion-reduce:hidden"
      />
    </div>
  );
}
