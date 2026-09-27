'use client';

import { useEffect, useState } from 'react';
import type { ExerciseEquipment } from '@chefer/types';
import { ExercisePlaceholder } from './ExerciseImage';

// Start/end photo loop (gym_plan.md §1.3, §5.5): a cheap CSS crossfade that
// works offline (no video, no JS timer). `motion-reduce:` drops the animation
// class entirely so a reduced-motion viewer sees the start photo, static.
//
// UX-05 amendment A6 (T-05.11): 3:2 everywhere, not the square this used to
// crop to (a third of every landscape photo was cut off) — and the shared
// icon placeholder (ExerciseImage.tsx), never a generic dumbbell tile, for
// the photo-less exercises, customs and any photo the audit hides. One
// silent retry + `onImageFailed` on a load error, mirroring mobile's
// ExerciseImage.

export interface PhotoCrossfadeProps {
  images: string[];
  alt: string;
  equipment: ExerciseEquipment;
  primaryMuscleLabel?: string | null;
  /** True when the audit (apps/api/static/exercises/README.md) hid this exercise's photos. */
  hidden?: boolean;
  analyticsExerciseId: string;
  onImageFailed?: (exerciseId: string) => void;
}

export function PhotoCrossfade({
  images,
  alt,
  equipment,
  primaryMuscleLabel = null,
  hidden = false,
  analyticsExerciseId,
  onImageFailed,
}: PhotoCrossfadeProps) {
  const [start, end] = images;
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setRetried(false);
    setFailed(false);
  }, [start]);

  const onError = () => {
    if (!retried) {
      setRetried(true);
      return;
    }
    setFailed(true);
    onImageFailed?.(analyticsExerciseId);
  };

  if (hidden || !start || failed) {
    return (
      <div className="aspect-[3/2] w-full overflow-hidden rounded-2xl bg-neutral-100">
        <ExercisePlaceholder
          equipment={equipment}
          primaryMuscleLabel={primaryMuscleLabel}
          size="hero"
        />
      </div>
    );
  }

  if (!end || end === start) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external, unoptimized static host
      <img
        key={retried ? 'retry' : 'initial'}
        src={start}
        alt={alt}
        className="aspect-[3/2] w-full rounded-2xl bg-neutral-100 object-cover"
        onError={onError}
      />
    );
  }

  return (
    <div className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl bg-neutral-100">
      {/* eslint-disable-next-line @next/next/no-img-element -- external, unoptimized static host */}
      <img
        key={retried ? 'retry' : 'initial'}
        src={start}
        alt={alt}
        className="absolute inset-0 h-full w-full animate-gym-photo-a object-cover motion-reduce:animate-none"
        onError={onError}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- external, unoptimized static host */}
      <img
        src={end}
        alt=""
        className="absolute inset-0 h-full w-full animate-gym-photo-b object-cover opacity-0 motion-reduce:hidden"
      />
    </div>
  );
}
