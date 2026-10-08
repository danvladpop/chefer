'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GymEquipmentAccess, TemplateSummaryDto } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { buildTemplatePreview, switchNote, type TemplatePreviewDay } from '../template-preview';

export interface CreateRoutineSheetProps {
  open: boolean;
  onClose: () => void;
  templates: TemplateSummaryDto[];
  /** `setActive`: the template becomes the active routine ("Create and switch"). */
  onCreateFromTemplate: (templateKey: string, setActive: boolean) => void;
  onCreateBlank: (name: string, days: number) => void;
  creating?: boolean;
  /** Which template button is in flight, so only that one spins. */
  creatingSetActive?: boolean | undefined;
  /** An active, non-archived routine exists — "Create" then keeps it active. */
  hasActive?: boolean;
  /** The weekly goal "Create and switch" would replace. */
  currentGoal?: number | null;
  equipmentAccess?: GymEquipmentAccess;
}

/** UX-GYM-14: what a template contains, day by day, before it is created. */
function TemplatePreviewBody({
  template,
  currentGoal,
  hasActive,
  days,
}: {
  template: TemplateSummaryDto;
  currentGoal: number | null;
  hasActive: boolean;
  days: TemplatePreviewDay[] | null;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="template-preview">
      <p className="text-sm text-gray-500">
        {template.daysPerWeek}x/week · {template.description}
      </p>
      {hasActive && (
        <p className="text-sm text-gray-800" data-testid="template-preview-switch-note">
          {switchNote(currentGoal, template.daysPerWeek)}
        </p>
      )}
      {days ? (
        days.map((day, i) => (
          <section
            key={`${day.name}-${String(i)}`}
            data-testid={`template-preview-day-${String(i)}`}
            className="flex flex-col gap-1 rounded-lg border border-gray-200 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                {day.name}
              </h3>
              <span className="text-xs text-gray-500">~{day.estimatedMin} min</span>
            </div>
            <ul className="flex flex-col gap-0.5">
              {day.exercises.map((ex) => (
                <li key={ex.exerciseId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{ex.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-gray-500">
                    {ex.sets} × {ex.repMin === ex.repMax ? ex.repMin : `${ex.repMin}-${ex.repMax}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="text-sm text-gray-500" data-testid="template-preview-unavailable">
          The day-by-day preview isn&apos;t available for this program.
        </p>
      )}
    </div>
  );
}

export function CreateRoutineSheet({
  open,
  onClose,
  templates,
  onCreateFromTemplate,
  onCreateBlank,
  creating = false,
  creatingSetActive,
  hasActive = false,
  currentGoal = null,
  equipmentAccess = 'FULL_GYM',
}: CreateRoutineSheetProps) {
  const [mode, setMode] = useState<'template' | 'blank'>('template');
  // UX-GYM-14: the template being previewed (inside the template tab).
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const previewTemplate = templates.find((t) => t.key === previewKey) ?? null;
  const previewDays = useMemo(() => {
    if (!previewTemplate) return null;
    try {
      return buildTemplatePreview(previewTemplate.key, equipmentAccess);
    } catch {
      return null;
    }
  }, [previewTemplate, equipmentAccess]);
  // A created routine closes the sheet from the page; the next open starts at the list.
  useEffect(() => {
    if (!open) setPreviewKey(null);
  }, [open]);
  const close = () => {
    setPreviewKey(null);
    onClose();
  };
  const [name, setName] = useState('My routine');
  const [days, setDays] = useState(3);

  return (
    <Sheet
      open={open}
      onClose={close}
      title={mode === 'template' && previewTemplate ? previewTemplate.name : 'New routine'}
      size="md"
      footer={
        mode === 'template' && previewTemplate ? (
          <div className="flex flex-col gap-2 px-5 pb-5 pt-3">
            {/* With no active routine there is nothing to keep: one "Create" that
                becomes the active routine, as on the phone. */}
            <Button
              type="button"
              data-testid="template-create-switch"
              loading={creating && creatingSetActive === true}
              disabled={creating}
              onClick={() => onCreateFromTemplate(previewTemplate.key, true)}
            >
              {hasActive ? 'Create and switch' : 'Create'}
            </Button>
            {hasActive && (
              <Button
                type="button"
                variant="outline"
                data-testid="template-create"
                loading={creating && creatingSetActive === false}
                disabled={creating}
                onClick={() => onCreateFromTemplate(previewTemplate.key, false)}
              >
                Create
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              data-testid="template-back"
              onClick={() => setPreviewKey(null)}
            >
              All templates
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 px-5 pb-5 pt-1">
        <div
          className={cn(
            'flex gap-1 rounded-lg bg-gray-100 p-1',
            previewTemplate && mode === 'template' && 'hidden',
          )}
        >
          {(['template', 'blank'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'min-h-11 flex-1 rounded-md text-sm font-medium transition-colors',
                mode === m
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-700',
              )}
            >
              {m === 'template' ? 'From a template' : 'Start blank'}
            </button>
          ))}
        </div>

        {mode === 'template' ? (
          previewTemplate ? (
            <TemplatePreviewBody
              template={previewTemplate}
              currentGoal={currentGoal}
              hasActive={hasActive}
              days={previewDays}
            />
          ) : (
            <div className="flex flex-col divide-y divide-gray-100">
              {templates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  disabled={creating}
                  onClick={() => setPreviewKey(t.key)}
                  data-testid={`template-option-${t.key}`}
                  className="flex min-h-11 flex-col items-start gap-0.5 py-3 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-gray-900">{t.name}</span>
                  <span className="text-xs text-gray-500">
                    {t.daysPerWeek}x/week ·{' '}
                    {t.experience === 'BEGINNER' ? 'Beginner' : 'Intermediate'}
                  </span>
                  <span className="mt-0.5 text-xs text-gray-500">{t.description}</span>
                  <span className="mt-1 text-xs font-medium text-[#944a00]">Preview</span>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-lg border border-gray-200 px-3 text-base focus:border-gray-400 focus:outline-none sm:h-10 sm:text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-gray-700">Days</span>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-11 rounded-lg border border-gray-200 px-3 text-base focus:border-gray-400 focus:outline-none sm:h-10 sm:text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              onClick={() => onCreateBlank(name.trim() || 'My routine', days)}
              loading={creating}
            >
              Create
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
