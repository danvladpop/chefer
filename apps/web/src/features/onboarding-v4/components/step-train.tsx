'use client';

import { useState } from 'react';
import { useFlags } from '@/features/flags/use-flags';
import {
  buildSetupPayload,
  friendlySetupError,
  previewForTemplate,
} from '@/features/gym/setup/setup-payload';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Dumbbell } from 'lucide-react';
import {
  TRAINING_STYLE_ANSWERS,
  type BodyUnits,
  type GymEquipmentAccess,
  type TrainingExperience,
} from '@chefer/types';
import { pressControl } from '@chefer/ui';
import {
  cn,
  ONBOARDING_V4_COPY,
  programDaysFromWeekdays,
  userFacingErrorMessage,
  weightUnitForSystem,
} from '@chefer/utils';
import { BiscuitHalo, Chip, ErrorLine, PrimaryButton, V4Heading } from './ui';

// ─── Set up training (OnbV4Train) — only when Train was picked ────────────────
// The gym setup wizard's answers in one screen: experience + equipment chips,
// the engine's recommended program for the training days picked on About you
// (gym.profile.recommend), "Change" cycling through its alternatives, and
// completeSetup with the same payload builder as features/gym/setup.
// Simple training mode (§6.1, flag on): "How do you like to train?" comes
// first. The two "Keep it simple" answers hide the rest and finish with
// completeSimpleSetup (no routine); "I follow a program" keeps this step and
// sends trainingStyle PROGRESSIVE.

type StyleAnswer = (typeof TRAINING_STYLE_ANSWERS)[number];

const EXPERIENCE: { value: TrainingExperience; label: string }[] = [
  { value: 'BEGINNER', label: ONBOARDING_V4_COPY.trainExperienceNew },
  { value: 'INTERMEDIATE', label: ONBOARDING_V4_COPY.trainExperienceExperienced },
];
const EQUIPMENT: { value: GymEquipmentAccess; label: string }[] = [
  { value: 'FULL_GYM', label: ONBOARDING_V4_COPY.trainWhereGym },
  { value: 'DUMBBELLS', label: ONBOARDING_V4_COPY.trainWhereDumbbells },
  { value: 'BODYWEIGHT', label: ONBOARDING_V4_COPY.trainWhereBodyweight },
];

export function StepTrain({
  weekdays,
  units,
  onDone,
}: {
  /** 0 = Monday … 6 = Sunday, from About you. */
  weekdays: number[];
  units: BodyUnits;
  onDone: () => void;
}) {
  const utils = trpc.useUtils();
  const flags = useFlags();
  const askStyle = flags.simpleTraining === true;
  const [answer, setAnswer] = useState<StyleAnswer | null>(null);
  const simple = askStyle && answer?.style === 'SIMPLE';
  const showProgram = !askStyle || answer?.style === 'PROGRESSIVE';
  const [experience, setExperience] = useState<TrainingExperience>('BEGINNER');
  const [equipmentAccess, setEquipment] = useState<GymEquipmentAccess>('FULL_GYM');
  const [choice, setChoice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const days = programDaysFromWeekdays(weekdays);

  const recommend = trpc.gym.profile.recommend.useQuery(
    { days, experience, equipmentAccess },
    { staleTime: Infinity, enabled: showProgram },
  );
  const recommended = recommend.data;
  const options = recommended
    ? [
        recommended.recommendedKey,
        ...recommended.alternatives
          .map((a) => a.key)
          .filter((key) => key !== recommended.recommendedKey),
      ]
    : [];
  const templateKey = options.length > 0 ? options[choice % options.length] : undefined;
  const programName = templateKey
    ? (previewForTemplate(templateKey, equipmentAccess, experience)?.name ??
      recommended?.alternatives.find((a) => a.key === templateKey)?.name ??
      templateKey)
    : null;

  const completeSimple = trpc.gym.profile.completeSimpleSetup.useMutation({
    meta: { silent: true },
    onSuccess: (bootstrap) => {
      utils.gym.bootstrap.setData({ today: localDate() }, bootstrap);
      void utils.preferences.get.invalidate();
      void utils.gym.bootstrap.invalidate();
      capture('gym_setup_completed', {
        template: null,
        days,
        experience,
        knownWeights: false,
        trainingStyle: 'SIMPLE',
      });
      onDone();
    },
    onError: (e) => setError(userFacingErrorMessage(e)),
  });

  const complete = trpc.gym.profile.completeSetup.useMutation({
    meta: { silent: true },
    onSuccess: (bootstrap) => {
      utils.gym.bootstrap.setData({ today: localDate() }, bootstrap);
      // The setup unit became the global unit preference (P2-6).
      void utils.preferences.get.invalidate();
      void utils.gym.bootstrap.invalidate();
      capture('gym_setup_completed', {
        template: templateKey ?? null,
        days,
        experience,
        knownWeights: false,
      });
      onDone();
    },
    onError: (e) => setError(friendlySetupError(e.message)),
  });

  function start() {
    setError(null);
    if (simple) {
      // The training days picked on About you become the weekly goal.
      const goal = Math.min(7, Math.max(1, new Set(weekdays).size));
      completeSimple.mutate({
        unit: weightUnitForSystem(units),
        ...(weekdays.length > 0 && { weeklyGoal: goal }),
      });
      return;
    }
    if (!templateKey) return;
    try {
      complete.mutate({
        ...buildSetupPayload({
          days,
          experience,
          equipmentAccess,
          unit: weightUnitForSystem(units),
          plannedWeekdays: weekdays,
          reminderTime: null,
          templateKey,
          startMode: 'calibrate',
          knownWeights: {},
        }),
        ...(askStyle && { trainingStyle: 'PROGRESSIVE' as const }),
      });
    } catch (err) {
      // The payload is built from chips here, so an invalid one is a bug, not a typo.
      setError(userFacingErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="v4-train">
      <BiscuitHalo loop="goalMuscle" size={150} />
      <V4Heading title={ONBOARDING_V4_COPY.trainTitle} />

      {askStyle && (
        <div className="flex flex-col gap-2">
          <span id="v4-train-style" className="text-sm font-semibold text-revamp-label-secondary">
            How do you like to train?
          </span>
          <div role="radiogroup" aria-labelledby="v4-train-style" className="flex flex-col gap-2">
            {TRAINING_STYLE_ANSWERS.map((a) => (
              <button
                key={a.key}
                type="button"
                role="radio"
                aria-checked={answer?.key === a.key}
                onClick={() => setAnswer(a)}
                data-testid={`v4-train-style-${a.key}`}
                className={cn(
                  'min-h-14 w-full rounded-card px-4 py-3 text-left text-base font-semibold text-revamp-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  answer?.key === a.key
                    ? 'border-2 border-revamp-brand bg-revamp-brand-tint'
                    : 'border border-revamp-separator bg-revamp-surface',
                  pressControl,
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showProgram && (
        <>
          <div className="flex flex-col gap-2">
            <span id="v4-train-exp" className="text-sm font-semibold text-revamp-label-secondary">
              {ONBOARDING_V4_COPY.trainExperience}
            </span>
            <div role="group" aria-labelledby="v4-train-exp" className="flex flex-wrap gap-2">
              {EXPERIENCE.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={experience === o.value}
                  onClick={() => {
                    setExperience(o.value);
                    setChoice(0);
                  }}
                  testId={`v4-train-exp-${o.value}`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span id="v4-train-where" className="text-sm font-semibold text-revamp-label-secondary">
              {ONBOARDING_V4_COPY.trainWhere}
            </span>
            <div role="group" aria-labelledby="v4-train-where" className="flex flex-wrap gap-2">
              {EQUIPMENT.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={equipmentAccess === o.value}
                  onClick={() => {
                    setEquipment(o.value);
                    setChoice(0);
                  }}
                  testId={`v4-train-where-${o.value}`}
                />
              ))}
            </div>
          </div>

          <section
            aria-label="Your program"
            aria-busy={recommend.isLoading}
            className="flex min-h-[4.75rem] items-center gap-3 rounded-card border border-revamp-separator bg-revamp-surface p-3.5"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-revamp-brand-tint text-revamp-brand">
              <Dumbbell className="h-6 w-6" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="text-[1.0625rem] text-revamp-label" data-testid="v4-train-program">
                {programName ?? '…'}
              </b>
              <span className="text-[0.9375rem] text-revamp-label-secondary">
                {ONBOARDING_V4_COPY.trainFits(days)}
              </span>
            </span>
            {options.length > 1 && (
              <button
                type="button"
                onClick={() => setChoice((c) => (c + 1) % options.length)}
                data-testid="v4-train-change"
                className={cn(
                  'min-h-11 rounded-control bg-revamp-brand-tint px-3 text-[0.9375rem] font-semibold text-revamp-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  pressControl,
                )}
              >
                {ONBOARDING_V4_COPY.trainChange}
              </button>
            )}
          </section>
        </>
      )}

      {error && <ErrorLine message={error} />}

      <PrimaryButton
        onClick={start}
        disabled={simple ? false : !showProgram || !templateKey}
        busy={complete.isPending || completeSimple.isPending}
        testId="v4-train-start"
      >
        {ONBOARDING_V4_COPY.trainStart}
      </PrimaryButton>
    </div>
  );
}
