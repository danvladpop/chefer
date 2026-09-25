'use client';

import Link from 'next/link';
import { useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { AlertTriangle, ArrowLeft, Copy, PauseCircle, RotateCw, Trash2 } from 'lucide-react';
import type { ActivePauseDto, GymProfileDto, WeightUnit } from '@chefer/types';
import { Button, Input, Sheet } from '@chefer/ui';
import { addDaysLocal, cn, formatLoadNumber, unitLabel } from '@chefer/utils';
import { shortDate } from '../shared/format';
import { CardLabel, GymCard, GymSkeleton } from '../shared/gym-card';
import { Stepper } from '../shared/stepper';
import { ToggleRow } from '../shared/toggle-row';
import { useGymData } from '../shared/use-gym-data';
import { outbox, useOutboxStatus, type OutboxEntry } from '../workout/outbox';
import {
  defaultInventory,
  draftFrom,
  inventoryPayload,
  plateChoices,
  type InventoryDraft,
} from './inventory';

// ─── Gym settings (gym_plan.md §5.1 settings) ─────────────────────────────────
// Units, weekly goal, equipment inventory, reminders (stored only — the web
// has no local notifications; the phone app sends them), pause, and the
// outbox's "needs attention" entries (Copy / Retry / Discard).

export function SettingsView() {
  const { data, today, ready } = useGymData();
  const status = useOutboxStatus();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <Link
        href="/gym"
        className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Today
      </Link>
      <h1 className="font-serif text-2xl font-bold text-neutral-900">Gym settings</h1>

      <div className="mt-6 flex flex-col gap-4">
        {status.parked.length > 0 && <NeedsAttention entries={status.parked} />}
        {status.otherAccount > 0 && (
          <p className="rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600">
            {status.otherAccount} workout{status.otherAccount === 1 ? '' : 's'} from another account
            on this browser will upload when that account signs in.
          </p>
        )}

        {!ready || !data ? (
          <GymSkeleton rows={3} />
        ) : !data.profile ? (
          <GymCard>
            <p className="text-sm text-gray-600">Finish the gym setup first.</p>
            <Button asChild className="mt-3">
              <Link href="/gym/setup">Start setup</Link>
            </Button>
          </GymCard>
        ) : (
          <ProfileSettings
            key={data.profile.unit}
            profile={data.profile}
            today={today}
            paused={data.weeks[data.weeks.length - 1]?.status === 'paused'}
            activePause={data.activePause}
          />
        )}
      </div>
    </div>
  );
}

function ProfileSettings({
  profile,
  today,
  paused,
  activePause,
}: {
  profile: GymProfileDto;
  today: string;
  paused: boolean;
  activePause: ActivePauseDto | null;
}) {
  const utils = trpc.useUtils();
  const unit = profile.unit;
  const [saved, setSaved] = useState<string | null>(null);
  const save = trpc.gym.profile.save.useMutation({
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      setSaved('Saved');
      setTimeout(() => setSaved(null), 2500);
    },
  });

  const [goal, setGoal] = useState(profile.weeklyGoal);
  const [draft, setDraft] = useState<InventoryDraft>(() => draftFrom(profile, unit));
  const [reminderOn, setReminderOn] = useState(profile.reminderEnabled);
  const [reminderTime, setReminderTime] = useState(profile.reminderTime ?? '18:00');

  const switchUnit = (next: WeightUnit) => {
    if (next === unit) return;
    // A new unit gets that unit's standard plates and dumbbells (a pound gym
    // has 45 lb plates, not converted 20 kg ones — gym_plan.md §6.1).
    save.mutate({ unit: next, ...defaultInventory(next) });
  };

  return (
    <>
      <GymCard>
        <CardLabel>Units</CardLabel>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:w-64" role="group" aria-label="Weight unit">
          {(['KG', 'LB'] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              disabled={save.isPending}
              onClick={() => switchUnit(u)}
              className={cn(
                'min-h-11 rounded-xl border text-sm font-semibold transition-colors',
                unit === u
                  ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
                  : 'bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              {unitLabel(u)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Switching resets plates and dumbbells to the standard {unit === 'KG' ? 'lb' : 'kg'} set.
        </p>
      </GymCard>

      <GymCard>
        <CardLabel>Weekly goal</CardLabel>
        <p className="mt-1 text-xs text-gray-500">
          Workouts per week. A week is met when you reach it; streaks count weeks, not days.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Stepper
            label="weekly goal"
            value={`${goal} / week`}
            onDecrement={() => setGoal((g) => Math.max(1, g - 1))}
            onIncrement={() => setGoal((g) => Math.min(7, g + 1))}
            canDecrement={goal > 1}
            canIncrement={goal < 7}
            className="w-44"
          />
          <Button
            variant="outline"
            disabled={goal === profile.weeklyGoal || save.isPending}
            onClick={() => save.mutate({ weeklyGoal: goal })}
          >
            Save goal
          </Button>
        </div>
      </GymCard>

      <GymCard>
        <CardLabel>Equipment</CardLabel>
        <p className="mt-1 text-xs text-gray-500">
          Suggested weights only use loads you can actually make.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <NumberField
            label={`Bar weight (${unitLabel(unit)})`}
            value={draft.barWeight}
            onChange={(v) => setDraft((d) => ({ ...d, barWeight: v }))}
          />
          <NumberField
            label={`Machine step (${unitLabel(unit)})`}
            value={draft.machineStep}
            onChange={(v) => setDraft((d) => ({ ...d, machineStep: v }))}
          />
          <NumberField
            label={`Cable step (${unitLabel(unit)})`}
            value={draft.cableStep}
            onChange={(v) => setDraft((d) => ({ ...d, cableStep: v }))}
          />
        </div>

        <p className="mb-2 mt-4 text-sm font-medium text-gray-800">Plates (pairs)</p>
        <div className="flex flex-wrap gap-1.5">
          {plateChoices(unit, profile.platePairsKg).map((p) => {
            const on = draft.plates.some((x) => Math.abs(x - p) < 0.01);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    plates: on ? d.plates.filter((x) => Math.abs(x - p) >= 0.01) : [...d.plates, p],
                  }))
                }
                className={cn(
                  'min-h-11 min-w-11 rounded-full border px-3 text-sm font-medium tabular-nums transition-colors',
                  on
                    ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
                    : 'bg-white text-gray-500 hover:bg-gray-50',
                )}
              >
                {p}
              </button>
            );
          })}
        </div>

        <label className="mt-4 block text-sm font-medium text-gray-800" htmlFor="gym-dumbbells">
          Dumbbells ({unitLabel(unit)}, comma separated)
        </label>
        <textarea
          id="gym-dumbbells"
          value={draft.dumbbells}
          onChange={(e) => setDraft((d) => ({ ...d, dumbbells: e.target.value }))}
          rows={2}
          className="mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#944a00]/30"
        />

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <ToggleRow
            label="Dip belt"
            hint="Lets the engine add load to dips and pull-ups."
            checked={draft.hasDipBelt}
            onChange={(v) => setDraft((d) => ({ ...d, hasDipBelt: v }))}
          />
          <ToggleRow
            label="Micro plates"
            hint={`${unit === 'KG' ? '0.5 kg' : '1.25 lb'} pairs for smaller jumps.`}
            checked={draft.microPlates}
            onChange={(v) => setDraft((d) => ({ ...d, microPlates: v }))}
          />
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setDraft(draftFrom({ ...defaultInventory(unit) }, unit))}
          >
            Reset to standard
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() => save.mutate(inventoryPayload(draft, unit))}
            data-testid="gym-save-inventory"
          >
            Save equipment
          </Button>
        </div>
        <p className="mt-2 text-right text-xs text-gray-400">
          Bar now: {formatLoadNumber(profile.barWeightKg, unit)} {unitLabel(unit)}
        </p>
      </GymCard>

      <GymCard>
        <CardLabel>Reminders</CardLabel>
        <p className="mt-1 text-xs text-gray-500">
          Reminders are sent by the Chefer phone app on your planned days. At most one a day.
        </p>
        <div className="mt-3">
          <ToggleRow label="Remind me to train" checked={reminderOn} onChange={setReminderOn} />
        </div>
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
        <div className="mt-3 flex justify-end">
          <Button
            variant="outline"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                reminderEnabled: reminderOn,
                reminderTime: reminderOn ? reminderTime : null,
              })
            }
          >
            Save reminders
          </Button>
        </div>
      </GymCard>

      <PauseCard today={today} paused={paused} activePause={activePause} />

      {(saved !== null || save.isError) && (
        <p
          role="status"
          className={cn(
            'sticky bottom-nav-safe rounded-xl px-3 py-2 text-center text-sm lg:bottom-4',
            save.isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
          )}
        >
          {save.isError ? "Couldn't save. Settings need a connection." : saved}
        </p>
      )}
    </>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-gray-800">
      {label}
      <Input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </label>
  );
}

const PAUSE_REASONS = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'illness', label: 'Illness' },
  { value: 'injury', label: 'Injury' },
  { value: 'other', label: 'Other' },
] as const;

function PauseCard({
  today,
  paused,
  activePause,
}: {
  today: string;
  paused: boolean;
  activePause: ActivePauseDto | null;
}) {
  const utils = trpc.useUtils();
  const [weeks, setWeeks] = useState(1);
  const [reason, setReason] = useState<(typeof PAUSE_REASONS)[number]['value']>('vacation');

  const create = trpc.gym.pause.create.useMutation({
    onSuccess: () => {
      capture('training_paused', { weeks, reason });
      void utils.gym.bootstrap.invalidate();
    },
  });
  const end = trpc.gym.pause.end.useMutation({
    onSuccess: () => void utils.gym.bootstrap.invalidate(),
  });

  return (
    <GymCard>
      <CardLabel>Pause training</CardLabel>
      <p className="mt-1 text-xs text-gray-500">
        Vacation, illness or injury: a pause freezes your streak, and weights ease back in when you
        return.
      </p>

      {activePause ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sky-50 px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm text-sky-800">
            <PauseCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Paused until {shortDate(activePause.endDate)}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={end.isPending}
            onClick={() => end.mutate({ id: activePause.id })}
          >
            End pause now
          </Button>
        </div>
      ) : paused ? (
        <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">
          Training is paused this week.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Pause length">
            {[1, 2, 3, 4].map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={weeks === w}
                onClick={() => setWeeks(w)}
                className={cn(
                  'min-h-11 rounded-full border px-4 text-sm font-medium',
                  weeks === w
                    ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
                    : 'bg-white text-gray-600 hover:bg-gray-50',
                )}
              >
                {w} week{w === 1 ? '' : 's'}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Reason">
            {PAUSE_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={reason === r.value}
                onClick={() => setReason(r.value)}
                className={cn(
                  'min-h-11 rounded-full border px-3 text-xs font-medium',
                  reason === r.value
                    ? 'border-gray-800 bg-gray-800 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              variant="outline"
              disabled={create.isPending || !today}
              onClick={() =>
                create.mutate({
                  startDate: today,
                  endDate: addDaysLocal(today, weeks * 7 - 1),
                  reason,
                })
              }
            >
              Pause for {weeks} week{weeks === 1 ? '' : 's'}
            </Button>
          </div>
          {create.isError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {create.error.message}
            </p>
          )}
        </>
      )}
    </GymCard>
  );
}

function NeedsAttention({ entries }: { entries: OutboxEntry[] }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  return (
    <GymCard className="border-amber-300 bg-amber-50/40" id="needs-attention">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Workouts that need attention
      </p>
      <p className="mt-1 text-xs text-gray-600">
        The server couldn&apos;t accept these. Nothing is deleted until you choose to: copy the
        data, retry, or discard.
      </p>
      <ul className="mt-3 divide-y">
        {entries.map((entry) => (
          <li key={entry.doc.id} className="py-3">
            <p className="truncate text-sm font-medium text-gray-900">
              {entry.doc.name} · {shortDate(entry.doc.localDate)}
            </p>
            <p className="break-words text-xs text-amber-800">{entry.parkedReason}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Clipboard needs a secure context (https / localhost).
                  void navigator.clipboard
                    .writeText(JSON.stringify(entry.doc, null, 2))
                    .then(() => setCopied(entry.doc.id))
                    .catch(() => undefined);
                }}
              >
                <Copy aria-hidden="true" />
                {copied === entry.doc.id ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void outbox.retryParked(entry.doc.id)}
              >
                <RotateCw aria-hidden="true" />
                Retry
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmId(entry.doc.id)}
              >
                <Trash2 aria-hidden="true" />
                Discard
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Sheet
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        title="Discard this workout?"
        description="It will be removed from this browser for good. Copy it first if you might need it."
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmId) outbox.discardParked(confirmId);
                setConfirmId(null);
              }}
            >
              Discard
            </Button>
          </div>
        }
      >
        <div />
      </Sheet>
    </GymCard>
  );
}
