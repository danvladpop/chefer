'use client';

import { useEffect, useState } from 'react';
import { Activity, Dumbbell, PersonStanding } from 'lucide-react';
import type { ExerciseEquipment } from '@chefer/types';
import { cn } from '@chefer/utils';

// UX-05 amendment A6 (T-05.11, O-26, ⚖ D-22 a): the web twin of mobile's
// ExerciseImage (apps/mobile/src/features/gym/components/exercise-image.tsx)
// — one shared exercise-image surface. 3:2 everywhere (never the
// aspect-square crop ExerciseCard/PhotoCrossfade used to apply, which cut a
// third of every landscape photo), a designed icon placeholder instead of a
// blank/generic tile, and one silent retry + `exercise_image_failed` on a
// load error.

const EQUIPMENT_ICON: Record<ExerciseEquipment, typeof Dumbbell> = {
  BARBELL: Dumbbell,
  SMITH: Dumbbell,
  EZ_BAR: Dumbbell,
  DUMBBELL: Dumbbell,
  KETTLEBELL: Dumbbell,
  CABLE: Activity,
  MACHINE: Activity,
  BAND: Activity,
  ASSISTED: Activity,
  BODYWEIGHT: PersonStanding,
};

export interface ExerciseImageProps {
  /** Resolved photo URL (already run through exerciseImageUrl), or null. */
  uri: string | null;
  equipment: ExerciseEquipment;
  /** Primary muscle label, shown under the placeholder icon on the hero only. */
  primaryMuscleLabel?: string | null;
  name: string;
  /** `thumb` = small card/list image; `hero` = full-width detail image. */
  size: 'thumb' | 'hero';
  /** True when the audit (README.md) hid this photo for showing the wrong exercise. */
  hidden?: boolean;
  /** Analytics id: a catalogue slug, or 'custom' for a user-authored exercise. */
  analyticsExerciseId: string;
  onImageFailed?: (exerciseId: string) => void;
  className?: string;
  testId?: string;
}

export function ExercisePlaceholder({
  equipment,
  primaryMuscleLabel,
  size,
  className,
  testId,
}: {
  equipment: ExerciseEquipment;
  primaryMuscleLabel?: string | null;
  size: 'thumb' | 'hero';
  className?: string;
  testId?: string;
}) {
  const Icon = EQUIPMENT_ICON[equipment];
  return (
    <div
      data-testid={testId}
      aria-label={size === 'hero' ? 'No photo yet' : undefined}
      role={size === 'hero' ? 'img' : undefined}
      className={cn(
        'flex h-full w-full flex-col items-center justify-center bg-neutral-100',
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={size === 'hero' ? 'h-10 w-10 text-neutral-400' : 'h-5 w-5 text-neutral-400'}
      />
      {size === 'hero' && primaryMuscleLabel ? (
        <span className="mt-1 text-xs text-neutral-500">{primaryMuscleLabel}</span>
      ) : null}
    </div>
  );
}

export function ExerciseImage({
  uri,
  equipment,
  primaryMuscleLabel = null,
  name,
  size,
  hidden = false,
  analyticsExerciseId,
  onImageFailed,
  className,
  testId = 'exercise-image',
}: ExerciseImageProps) {
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(false);

  // A new uri (e.g. navigating to a different exercise) resets retry/failure state.
  useEffect(() => {
    setRetried(false);
    setFailed(false);
  }, [uri]);

  const showPlaceholder = hidden || !uri || failed;

  return (
    <div
      data-testid={testId}
      className={cn('aspect-[3/2] w-full overflow-hidden rounded-2xl bg-neutral-100', className)}
    >
      {showPlaceholder ? (
        <ExercisePlaceholder
          equipment={equipment}
          primaryMuscleLabel={primaryMuscleLabel}
          size={size}
          testId={`${testId}-placeholder`}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- external, unoptimized static host
        <img
          key={retried ? 'retry' : 'initial'}
          data-testid={`${testId}-photo`}
          src={uri}
          alt={size === 'hero' ? `${name}, start and end positions` : ''}
          className="h-full w-full object-cover"
          onError={() => {
            if (!retried) {
              // One silent retry on the next mount (a transient network blip).
              setRetried(true);
              return;
            }
            setFailed(true);
            onImageFailed?.(analyticsExerciseId);
          }}
        />
      )}
    </div>
  );
}
