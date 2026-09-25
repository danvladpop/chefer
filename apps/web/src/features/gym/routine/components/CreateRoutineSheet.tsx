'use client';

import { useState } from 'react';
import type { TemplateSummaryDto } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { cn } from '@chefer/utils';

export interface CreateRoutineSheetProps {
  open: boolean;
  onClose: () => void;
  templates: TemplateSummaryDto[];
  onCreateFromTemplate: (templateKey: string) => void;
  onCreateBlank: (name: string, days: number) => void;
  creating?: boolean;
}

export function CreateRoutineSheet({
  open,
  onClose,
  templates,
  onCreateFromTemplate,
  onCreateBlank,
  creating = false,
}: CreateRoutineSheetProps) {
  const [mode, setMode] = useState<'template' | 'blank'>('template');
  const [name, setName] = useState('My routine');
  const [days, setDays] = useState(3);

  return (
    <Sheet open={open} onClose={onClose} title="New routine" size="md">
      <div className="flex flex-col gap-4 px-5 pb-5 pt-1">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {(['template', 'blank'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'min-h-9 flex-1 rounded-md text-sm font-medium transition-colors',
                mode === m
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {m === 'template' ? 'From a template' : 'Start blank'}
            </button>
          ))}
        </div>

        {mode === 'template' ? (
          <div className="flex flex-col divide-y divide-gray-100">
            {templates.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={creating}
                onClick={() => onCreateFromTemplate(t.key)}
                data-testid={`template-option-${t.key}`}
                className="flex flex-col items-start gap-0.5 py-3 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="text-sm font-medium text-gray-900">{t.name}</span>
                <span className="text-xs text-gray-400">
                  {t.daysPerWeek}x/week ·{' '}
                  {t.experience === 'BEGINNER' ? 'Beginner' : 'Intermediate'}
                </span>
                <span className="mt-0.5 text-xs text-gray-500">{t.description}</span>
              </button>
            ))}
          </div>
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
