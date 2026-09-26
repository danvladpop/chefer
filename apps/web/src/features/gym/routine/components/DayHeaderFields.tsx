'use client';

import type { ReactNode } from 'react';
import { Copy, Trash2 } from 'lucide-react';

export const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Monday' },
  { value: 1, label: 'Tuesday' },
  { value: 2, label: 'Wednesday' },
  { value: 3, label: 'Thursday' },
  { value: 4, label: 'Friday' },
  { value: 5, label: 'Saturday' },
  { value: 6, label: 'Sunday' },
];

export interface DayHeaderFieldsProps {
  name: string;
  plannedWeekday: number | null;
  onRename: (name: string) => void;
  onWeekdayChange: (weekday: number | null) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  /** Drag handle injected by the desktop shell. */
  leading?: ReactNode;
}

export function DayHeaderFields({
  name,
  plannedWeekday,
  onRename,
  onWeekdayChange,
  onDuplicate,
  onDelete,
  canDelete,
  leading,
}: DayHeaderFieldsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {leading}
        <input
          value={name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="Day name"
          aria-label="Day name"
          className="h-11 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 text-sm font-semibold text-gray-900 focus:border-gray-400 focus:outline-none lg:h-9"
        />
        <button
          type="button"
          onClick={onDuplicate}
          aria-label="Duplicate day"
          title="Duplicate day"
          className="touch-target relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label="Delete day"
          title={canDelete ? 'Delete day' : 'A routine needs at least one day'}
          className="touch-target relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <select
        value={plannedWeekday ?? ''}
        onChange={(e) => onWeekdayChange(e.target.value === '' ? null : Number(e.target.value))}
        aria-label="Planned weekday"
        className="h-11 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-600 focus:border-gray-400 focus:outline-none lg:h-9"
      >
        <option value="">No planned day</option>
        {WEEKDAY_OPTIONS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
    </div>
  );
}
