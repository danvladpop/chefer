'use client';

/* eslint-disable @next/next/no-img-element -- exercise photos are API-hosted WebPs */
import { memo, useState } from 'react';
import { ChevronDown, CircleSlash, MoreHorizontal, StickyNote } from 'lucide-react';
import type {
  EquipmentProfile,
  ExerciseDto,
  ExerciseMeta,
  PrKind,
  Rir,
  SessionExerciseDoc,
  SessionSetDoc,
  WeightUnit,
} from '@chefer/types';
import { cn, explain, explainInputs } from '@chefer/utils';
import { KIND_ARROW, KIND_TONE, prescriptionText } from '../../shared/format';
import { exerciseImageUrl } from '../../use-gym-bootstrap';
import { allWorkingSetsDone, warmupSetsOf, workingSets } from '../workout-model';
import { SetRow } from './set-row';

const RIR_OPTIONS: { value: Rir; label: string }[] = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3+' },
];

export interface ExerciseCardProps {
  se: SessionExerciseDoc;
  meta: ExerciseMeta | undefined;
  /** The library row (for the thumbnail), when known. */
  dto: ExerciseDto | undefined;
  index: number;
  expanded: boolean;
  /** Superset letter ("A") when the card is part of one. */
  supersetLabel?: string | null;
  /** 0-based place inside the superset ("A1" = 0). */
  supersetIndex?: number;
  /** The set to do next, when it is in this card. */
  focusSetId?: string | null;
  onToggleExpanded: (seId: string) => void;
  profile: EquipmentProfile;
  unit: WeightUnit;
  lastTime: { weightKg: number; reps: number }[];
  /** Most recent non-empty note typed for this exercise, from a prior session. */
  lastNote?: string | null;
  /** The live PR badge (at most one per exercise). */
  prSetId: string | null;
  prKind: PrKind | null;
  onEditSet: (seId: string, setId: string, patch: { weightKg?: number; reps?: number }) => void;
  onToggleSet: (seId: string, set: SessionSetDoc) => void;
  onSetRir: (seId: string, rir: Rir | null) => void;
  onOpenActions: (seId: string) => void;
  onOpenPlates: (weightKg: number) => void;
  onOpenSetMenu: (seId: string, setId: string) => void;
}

/**
 * One exercise of the active workout: header (thumbnail, name, ⋯), the
 * suggestion banner with "Why?", warm-ups collapsed, working sets, and the
 * RIR chips once the last working set is ticked.
 */
export const ExerciseCard = memo(function ExerciseCard({
  se,
  meta,
  dto,
  index,
  expanded,
  supersetLabel = null,
  supersetIndex = 0,
  focusSetId = null,
  onToggleExpanded,
  profile,
  unit,
  lastTime,
  lastNote = null,
  prSetId,
  prKind,
  onEditSet,
  onToggleSet,
  onSetRir,
  onOpenActions,
  onOpenPlates,
  onOpenSetMenu,
}: ExerciseCardProps) {
  const [showWarmups, setShowWarmups] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [editRir, setEditRir] = useState(false);
  const name = meta?.name ?? 'Exercise';
  const warmups = warmupSetsOf(se);
  const working = workingSets(se);
  const done = working.filter((s) => s.completedAt !== null).length;
  const img = dto ? exerciseImageUrl(dto) : null;
  const p = se.prescription;
  const calibrating =
    p.reasonCode === 'START_CALIBRATING' || p.reasonCode.startsWith('CALIBRATING');
  const showRir = allWorkingSetsDone(se) && !se.skipped;

  return (
    <article
      className={cn(
        'rounded-2xl border bg-white shadow-sm transition-colors',
        expanded && !se.skipped ? 'border-[#944a00]/30' : '',
        supersetLabel && 'border-l-4 border-l-violet-500',
        se.skipped && 'opacity-70',
      )}
      data-testid="gym-exercise-card"
      aria-label={name}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3 sm:p-4">
        <button
          type="button"
          onClick={() => onToggleExpanded(se.id)}
          aria-expanded={expanded}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
        >
          {img ? (
            <img
              src={img}
              alt=""
              loading="lazy"
              className="h-11 w-11 shrink-0 rounded-lg bg-gray-100 object-cover"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-600">
              {index + 1}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              {supersetLabel && (
                <span
                  className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-bold text-violet-800"
                  data-testid="gym-superset-chip"
                  aria-label={`Superset ${supersetLabel}, exercise ${supersetIndex + 1}`}
                >
                  {supersetLabel}
                  {supersetIndex + 1}
                </span>
              )}
              <span className="min-w-0 truncate text-sm font-semibold text-gray-900 sm:text-base">
                {name}
              </span>
            </span>
            <span className="block truncate text-xs text-gray-500">
              {se.skipped ? (
                <span className="inline-flex items-center gap-1">
                  <CircleSlash className="h-3 w-3" aria-hidden="true" />
                  Skipped today
                </span>
              ) : (
                <>
                  {done}/{working.length} sets ·{' '}
                  {prescriptionText(p, unit, meta?.loadType, meta?.isTimed)}
                </>
              )}
            </span>
            {lastNote && (
              <span
                className="block truncate text-xs text-gray-500"
                data-testid="gym-exercise-last-note"
              >
                Last time: {lastNote}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-gray-400 transition-transform',
              expanded && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          onClick={() => onOpenActions(se.id)}
          aria-label={`More actions for ${name}`}
          data-testid="gym-exercise-actions"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {expanded && !se.skipped && (
        <div className="space-y-3 border-t px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
          {/* Suggestion banner — every number explains itself (§1.2 #2). */}
          <div className={cn('rounded-xl px-3 py-2', KIND_TONE[p.kind])}>
            <div className="flex items-start gap-2">
              <span className="mt-px text-sm font-bold" aria-hidden="true">
                {KIND_ARROW[p.kind]}
              </span>
              <p className="min-w-0 flex-1 text-sm">{explain(p, unit)}</p>
              <button
                type="button"
                onClick={() => setShowWhy((v) => !v)}
                aria-expanded={showWhy}
                className="-my-2 -mr-2 flex min-h-11 shrink-0 items-center px-2 text-xs font-semibold underline underline-offset-2"
              >
                Why?
              </button>
            </div>
            {showWhy && (
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-black/10 pt-2 text-xs">
                {explainInputs(p, unit).map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="font-medium opacity-80">{row.label}</dt>
                    <dd className="min-w-0">{row.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {se.notes && (
            <p className="flex items-start gap-1.5 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
              <StickyNote className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{se.notes}</span>
            </p>
          )}

          {/* Warm-ups, collapsed by default (research §5.1 #8). */}
          {warmups.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowWarmups((v) => !v)}
                aria-expanded={showWarmups}
                className="flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <span>
                  {warmups.length} warm-up set{warmups.length === 1 ? '' : 's'}
                  {warmups.every((s) => s.completedAt !== null) && ' ✓'}
                </span>
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', showWarmups && 'rotate-180')}
                  aria-hidden="true"
                />
              </button>
              {showWarmups && (
                <div className="mt-1 space-y-1">
                  {warmups.map((s) => (
                    <SetRow
                      key={s.id}
                      seId={se.id}
                      set={s}
                      label="W"
                      meta={meta}
                      profile={profile}
                      unit={unit}
                      lastTime={null}
                      pr={null}
                      focused={focusSetId === s.id}
                      onEdit={onEditSet}
                      onToggle={onToggleSet}
                      onOpenPlates={onOpenPlates}
                      onOpenMenu={onOpenSetMenu}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            {working.map((s, i) => (
              <SetRow
                key={s.id}
                seId={se.id}
                set={s}
                label={String(i + 1)}
                meta={meta}
                profile={profile}
                unit={unit}
                lastTime={lastTime[i] ?? lastTime[lastTime.length - 1] ?? null}
                pr={prSetId === s.id ? prKind : null}
                focused={focusSetId === s.id}
                onEdit={onEditSet}
                onToggle={onToggleSet}
                onOpenPlates={onOpenPlates}
                onOpenMenu={onOpenSetMenu}
              />
            ))}
            {working.length === 0 && (
              <p className="px-2 py-3 text-sm text-gray-500">No sets. Add one from the ⋯ menu.</p>
            )}
          </div>

          {/* RIR chips after the last set: optional, collapse once answered. */}
          {showRir && (se.lastSetRir === null || editRir) && (
            <div
              className={cn(
                'rounded-xl border px-3 py-2',
                calibrating ? 'border-[#944a00]/40 bg-[#fff8f0]' : 'border-dashed',
              )}
              data-testid="gym-rir-chips"
            >
              <p className="text-xs text-gray-600">
                How many more could you have done?
                {calibrating && (
                  <span className="font-medium text-[#944a00]"> Helps us find your weight.</span>
                )}
              </p>
              <div className="mt-2 flex gap-1.5" role="group" aria-label="Reps in reserve">
                {RIR_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={se.lastSetRir === o.value}
                    onClick={() => {
                      onSetRir(se.id, o.value);
                      setEditRir(false);
                    }}
                    className={cn(
                      'min-h-11 min-w-11 flex-1 rounded-xl border text-sm font-semibold transition-colors',
                      se.lastSetRir === o.value
                        ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
                        : 'bg-white text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {showRir && se.lastSetRir !== null && !editRir && (
            <button
              type="button"
              onClick={() => setEditRir(true)}
              className="min-h-11 px-2 text-xs text-gray-500 hover:text-gray-800"
            >
              Reps left on the last set: {se.lastSetRir >= 3 ? '3+' : se.lastSetRir} · change
            </button>
          )}
        </div>
      )}
    </article>
  );
});
