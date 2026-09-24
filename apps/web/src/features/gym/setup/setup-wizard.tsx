'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react';
import {
  EXERCISE_BY_ID,
  type GymEquipmentAccess,
  type TrainingExperience,
  type WeightUnit,
} from '@chefer/types';
import { Button, Input } from '@chefer/ui';
import { cn, unitLabel, VOLUME_GROUP_LABELS } from '@chefer/utils';
import { CardLabel, GymCard } from '../shared/gym-card';
import { ToggleRow } from '../shared/toggle-row';
import { useGymData } from '../shared/use-gym-data';
import { localDate } from '../use-gym-bootstrap';
import {
  buildSetupPayload,
  defaultUnitForLocale,
  knownWeightCandidates,
  previewForTemplate,
  type ProgramPreview,
  type StartMode,
} from './setup-payload';

// ─── Gym setup (gym_plan.md §1.3) ─────────────────────────────────────────────
// Four questions (days, experience, equipment + units, which days), then the
// recommended program with "choose another" and starting weights, then done.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STEP_TITLES = [
  'Training days',
  'Experience',
  'Equipment',
  'Your week',
  'Your program',
  'Ready',
] as const;

type Step = 0 | 1 | 2 | 3 | 4 | 5;

export function SetupWizard() {
  const router = useRouter();
  const utils = trpc.useUtils();
  // Leaving setup: back to Today if there is a profile, else out of Gym mode
  // (/gym would just send a profile-less account straight back here).
  const { data: existing } = useGymData();
  const exitHref = existing?.profile ? '/gym' : '/dashboard';
  const [step, setStep] = useState<Step>(0);
  const [days, setDays] = useState(3);
  const [experience, setExperience] = useState<TrainingExperience>('BEGINNER');
  const [equipmentAccess, setEquipment] = useState<GymEquipmentAccess>('FULL_GYM');
  const [unit, setUnit] = useState<WeightUnit>('KG');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderTime, setReminderTime] = useState('18:00');
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<StartMode>('calibrate');
  const [knownWeights, setKnownWeights] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // The unit defaults to the locale (after mount: SSR has no navigator).
  useEffect(() => {
    setUnit(defaultUnitForLocale(navigator.language));
  }, []);

  // Experienced lifters usually know their weights (§1.3: calibrate is the beginner default).
  useEffect(() => {
    setStartMode(experience === 'BEGINNER' ? 'calibrate' : 'known');
  }, [experience]);

  const recommend = trpc.gym.profile.recommend.useQuery(
    { days, experience, equipmentAccess },
    { enabled: step >= 4, staleTime: Infinity },
  );
  const chosenKey = templateKey ?? recommend.data?.recommendedKey ?? null;
  const preview = useMemo(
    () => (chosenKey ? previewForTemplate(chosenKey, equipmentAccess, experience) : null),
    [chosenKey, equipmentAccess, experience],
  );

  const saveProfile = trpc.gym.profile.save.useMutation();
  const complete = trpc.gym.profile.completeSetup.useMutation({
    onSuccess: async (bootstrap) => {
      utils.gym.bootstrap.setData({ today: localDate() }, bootstrap);
      if (reminderOn) {
        // Reminders fire from the phone app; the web stores the preference only.
        await saveProfile.mutateAsync({ reminderEnabled: true, reminderTime }).catch(() => null);
      }
      void utils.gym.bootstrap.invalidate();
      capture('gym_setup_completed', {
        template: chosenKey,
        days,
        experience,
        knownWeights: startMode === 'known',
      });
      setStep(5);
    },
    onError: (e) => setError(e.message),
  });

  const finish = () => {
    if (!chosenKey) return;
    setError(null);
    try {
      const payload = buildSetupPayload({
        days,
        experience,
        equipmentAccess,
        unit,
        plannedWeekdays: weekdays,
        reminderTime: reminderOn ? reminderTime : null,
        templateKey: chosenKey,
        startMode,
        knownWeights,
      });
      complete.mutate(payload);
    } catch {
      setError('Some answers look off. Check the weights you typed and try again.');
    }
  };

  const next = () => setStep((s) => Math.min(5, s + 1) as Step);
  const back = () => setStep((s) => Math.max(0, s - 1) as Step);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8" data-testid="gym-setup">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Gym setup · {step < 5 ? `Step ${step + 1} of 5` : 'Done'}
        </p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">{STEP_TITLES[step]}</h1>
        <div className="mt-3 flex gap-1" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-[#944a00]' : 'bg-gray-200')}
            />
          ))}
        </div>
      </div>

      {step === 0 && (
        <Question
          prompt="How many days a week can you realistically train?"
          hint="Pick what you can keep up on a busy week. Consistency beats ambition."
        >
          <div className="grid grid-cols-5 gap-2">
            {[2, 3, 4, 5, 6].map((n) => (
              <Choice
                key={n}
                selected={days === n}
                onClick={() => setDays(n)}
                testId={`setup-days-${n}`}
              >
                <span className="text-lg font-bold">{n}</span>
              </Choice>
            ))}
          </div>
        </Question>
      )}

      {step === 1 && (
        <Question prompt="How much lifting experience do you have?">
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice
              selected={experience === 'BEGINNER'}
              onClick={() => setExperience('BEGINNER')}
              title="New or returning"
              body="Under 6 months of consistent lifting."
              testId="setup-exp-beginner"
            />
            <Choice
              selected={experience === 'INTERMEDIATE'}
              onClick={() => setExperience('INTERMEDIATE')}
              title="Experienced"
              body="6+ months of consistent training."
              testId="setup-exp-intermediate"
            />
          </div>
        </Question>
      )}

      {step === 2 && (
        <Question prompt="What equipment do you have?">
          <div className="grid gap-2">
            {(
              [
                ['FULL_GYM', 'Full gym', 'Barbells, machines, cables, dumbbells.'],
                ['DUMBBELLS', 'Dumbbells + bench', 'A home or hotel setup.'],
                ['BODYWEIGHT', 'Bodyweight', 'No equipment needed.'],
              ] as const
            ).map(([value, title, body]) => (
              <Choice
                key={value}
                selected={equipmentAccess === value}
                onClick={() => setEquipment(value)}
                title={title}
                body={body}
                testId={`setup-equipment-${value}`}
              />
            ))}
          </div>
          <p className="mb-2 mt-6 text-sm font-medium text-gray-800">Units</p>
          <div className="grid grid-cols-2 gap-2 sm:w-64">
            {(['KG', 'LB'] as const).map((u) => (
              <Choice
                key={u}
                selected={unit === u}
                onClick={() => setUnit(u)}
                testId={`setup-unit-${u}`}
              >
                <span className="font-semibold">{unitLabel(u)}</span>
              </Choice>
            ))}
          </div>
        </Question>
      )}

      {step === 3 && (
        <Question
          prompt="Which days, roughly?"
          hint={`Pick up to ${days}. Used for your week strip; you can skip this.`}
        >
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {WEEKDAYS.map((label, i) => {
              const on = weekdays.includes(i);
              const full = !on && weekdays.length >= days;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  disabled={full}
                  onClick={() =>
                    setWeekdays((w) => (on ? w.filter((d) => d !== i) : [...w, i].sort()))
                  }
                  className={cn(
                    'flex min-h-12 min-w-0 items-center justify-center rounded-xl border text-xs font-semibold transition-colors sm:text-sm',
                    on
                      ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
                      : 'bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <GymCard className="mt-6">
            <ToggleRow
              label="Want a reminder?"
              hint="Reminders come from the Chefer phone app. Never more than one a day."
              checked={reminderOn}
              onChange={setReminderOn}
            />
            {reminderOn && (
              <label className="mt-3 flex items-center justify-between gap-3 text-sm text-gray-700">
                Time
                <Input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="w-32"
                />
              </label>
            )}
          </GymCard>
        </Question>
      )}

      {step === 4 && (
        <ProgramStep
          loading={recommend.isLoading}
          failed={recommend.isError}
          reason={recommend.data?.reason ?? null}
          isRecommended={chosenKey === recommend.data?.recommendedKey}
          preview={preview}
          alternatives={[
            ...(recommend.data && chosenKey !== recommend.data.recommendedKey
              ? [
                  {
                    key: recommend.data.recommendedKey,
                    name: `${previewForTemplate(recommend.data.recommendedKey, equipmentAccess, experience)?.name ?? 'Recommended'} (recommended)`,
                  },
                ]
              : []),
            ...(recommend.data?.alternatives ?? [])
              .filter((a) => a.key !== chosenKey)
              .map((a) => ({ key: a.key, name: `${a.name} · ${a.daysPerWeek}×/week` })),
          ]}
          onChoose={setTemplateKey}
          unit={unit}
          startMode={startMode}
          onStartMode={setStartMode}
          knownWeights={knownWeights}
          onKnownWeight={(id, v) => setKnownWeights((k) => ({ ...k, [id]: v }))}
          onRetry={() => void recommend.refetch()}
        />
      )}

      {step === 5 && (
        <GymCard className="text-center" data-testid="setup-done">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
            <Check className="h-6 w-6 text-emerald-600" aria-hidden="true" />
          </span>
          <h2 className="mt-3 font-serif text-xl font-bold text-gray-900">You&apos;re set up</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
            The first 6–8 weeks build the habit. Missing a session changes nothing. Aim for your
            weekly goal.
          </p>
          <Button
            size="lg"
            className="mt-5 bg-[#944a00] hover:bg-[#7a3d00]"
            onClick={() => router.replace('/gym')}
            data-testid="setup-go-today"
          >
            Go to Today
          </Button>
        </GymCard>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {step < 5 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={step === 0 ? () => router.push(exitHref) : back}>
            <ArrowLeft aria-hidden="true" />
            Back
          </Button>
          {step < 4 ? (
            <Button onClick={next} data-testid="setup-next">
              {step === 3 && weekdays.length === 0 ? 'Skip' : 'Next'}
              <ChevronRight aria-hidden="true" />
            </Button>
          ) : (
            <Button
              onClick={finish}
              disabled={!preview || complete.isPending}
              loading={complete.isPending}
              className="bg-[#944a00] hover:bg-[#7a3d00]"
              data-testid="setup-finish"
            >
              Start this program
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Question({
  prompt,
  hint,
  children,
}: {
  prompt: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-base font-semibold text-gray-900">{prompt}</p>
      {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Choice({
  selected,
  onClick,
  title,
  body,
  children,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  title?: string;
  body?: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'flex min-h-12 w-full min-w-0 flex-col items-center justify-center rounded-xl border px-3 py-3 text-center transition-colors',
        title && 'items-start text-left',
        selected
          ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
          : 'bg-white text-gray-700 hover:bg-gray-50',
      )}
    >
      {title && <span className="text-sm font-semibold text-gray-900">{title}</span>}
      {body && <span className="mt-0.5 text-xs text-gray-500">{body}</span>}
      {children}
    </button>
  );
}

function ProgramStep({
  loading,
  failed,
  reason,
  isRecommended,
  preview,
  alternatives,
  onChoose,
  unit,
  startMode,
  onStartMode,
  knownWeights,
  onKnownWeight,
  onRetry,
}: {
  loading: boolean;
  failed: boolean;
  reason: string | null;
  isRecommended: boolean;
  preview: ProgramPreview | null;
  alternatives: { key: string; name: string }[];
  onChoose: (key: string) => void;
  unit: WeightUnit;
  startMode: StartMode;
  onStartMode: (mode: StartMode) => void;
  knownWeights: Record<string, string>;
  onKnownWeight: (exerciseId: string, value: string) => void;
  onRetry: () => void;
}) {
  const [showOthers, setShowOthers] = useState(false);

  if (failed) {
    return (
      <GymCard className="text-center">
        <p className="text-sm text-gray-600">Setup needs a connection. Check it and try again.</p>
        <Button className="mt-4" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </GymCard>
    );
  }
  if (loading || !preview) {
    return <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />;
  }

  const maxVolume = Math.max(
    1,
    ...preview.volume.map((v) => Math.max(v.fractional, v.productiveMax)),
  );
  const candidates = knownWeightCandidates(preview);

  return (
    <div className="flex flex-col gap-4">
      <GymCard data-testid="setup-program">
        <CardLabel>{isRecommended ? 'Recommended for you' : 'Your pick'}</CardLabel>
        <h2 className="mt-1 font-serif text-xl font-bold text-gray-900">{preview.name}</h2>
        {isRecommended && reason && (
          <p className="mt-1 text-sm text-gray-600">
            <span className="font-medium text-gray-800">Why this program: </span>
            {reason}
          </p>
        )}
        {!isRecommended && <p className="mt-1 text-sm text-gray-600">{preview.description}</p>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {preview.days.map((day, i) => (
            <div key={`${day.name}-${i}`} className="min-w-0 rounded-xl border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-semibold text-gray-900">{day.name}</p>
                <p className="shrink-0 text-xs text-gray-500">~{day.estimatedMin} min</p>
              </div>
              <ul className="mt-2 space-y-1">
                {day.exercises.map((e) => (
                  <li
                    key={e.exerciseId}
                    className="flex justify-between gap-2 text-xs text-gray-600"
                  >
                    <span className="min-w-0 truncate">{exerciseName(e.exerciseId)}</span>
                    <span className="shrink-0 tabular-nums">
                      {e.sets} × {e.repMin === e.repMax ? e.repMin : `${e.repMin}–${e.repMax}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <CardLabel>Weekly balance (sets per muscle)</CardLabel>
          <ul className="mt-2 space-y-1.5">
            {preview.volume
              .filter((v) => v.fractional > 0 || v.floor > 0)
              .map((v) => (
                <li key={v.group} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 truncate text-gray-600">
                    {(VOLUME_GROUP_LABELS as Record<string, string | undefined>)[v.group] ??
                      v.group}
                  </span>
                  <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <span
                      className="absolute inset-y-0 bg-emerald-100"
                      style={{
                        left: `${(v.floor / maxVolume) * 100}%`,
                        width: `${(Math.max(0, v.productiveMax - v.floor) / maxVolume) * 100}%`,
                      }}
                      aria-hidden="true"
                    />
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-[#944a00]"
                      style={{ width: `${Math.min(100, (v.fractional / maxVolume) * 100)}%` }}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums text-gray-500">
                    {Math.round(v.fractional * 10) / 10}
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-1 text-[11px] text-gray-400">Green band: the productive range.</p>
        </div>

        {alternatives.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowOthers((v) => !v)}
              aria-expanded={showOthers}
            >
              Choose another program
            </Button>
            {showOthers && (
              <ul className="mt-2 grid gap-2">
                {alternatives.map((a) => (
                  <li key={a.key}>
                    <button
                      type="button"
                      onClick={() => {
                        onChoose(a.key);
                        setShowOthers(false);
                      }}
                      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="min-w-0 truncate">{a.name}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </GymCard>

      <GymCard>
        <CardLabel>Starting weights</CardLabel>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Choice
            selected={startMode === 'calibrate'}
            onClick={() => onStartMode('calibrate')}
            title="Help me find them"
            body="Light guesses first; your feedback tunes them in a session or two."
            testId="setup-start-calibrate"
          />
          <Choice
            selected={startMode === 'known'}
            onClick={() => onStartMode('known')}
            title="I know my weights"
            body="Enter a working weight for the lifts you know."
            testId="setup-start-known"
          />
        </div>
        {startMode === 'known' && (
          <ul className="mt-4 divide-y">
            {candidates.map((meta) => (
              <li key={meta.id} className="flex items-center justify-between gap-3 py-2">
                <label htmlFor={`kw-${meta.id}`} className="min-w-0 truncate text-sm text-gray-800">
                  {meta.name}
                </label>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Input
                    id={`kw-${meta.id}`}
                    inputMode="decimal"
                    placeholder="—"
                    value={knownWeights[meta.id] ?? ''}
                    onChange={(e) => onKnownWeight(meta.id, e.target.value)}
                    className="w-20 text-right"
                  />
                  <span className="w-5 text-xs text-gray-500">{unitLabel(unit)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </GymCard>
    </div>
  );
}

/** Names from the curated catalog (setup runs before the user's library matters). */
function exerciseName(id: string): string {
  return EXERCISE_BY_ID.get(id)?.name ?? id;
}
