'use client';

import { ChevronDown } from 'lucide-react';
import type { ExerciseEquipment } from '@chefer/types';
import { cn } from '@chefer/utils';

/**
 * FB7-07: the equipment filter as a chip-shaped native `<select>` — one
 * control instead of a second row of ~20 pills. Native, so the OS picker
 * handles long lists, keyboard and screen readers. Shows the chosen value
 * ("Dumbbell"), turns primary while a filter is set, and "Any equipment"
 * clears it. `min-h-11` keeps the 44px target.
 */
export function EquipmentFilterSelect({
  value,
  options,
  onChange,
}: {
  value: ExerciseEquipment | null;
  options: readonly { value: ExerciseEquipment; label: string }[];
  onChange: (value: ExerciseEquipment | null) => void;
}) {
  const active = value !== null;
  return (
    <div className="relative shrink-0">
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as ExerciseEquipment | null)}
        aria-label="Equipment"
        data-testid="exercises-equipment-filter"
        className={cn(
          'min-h-11 cursor-pointer appearance-none rounded-full border py-0 pl-3 pr-8 text-xs font-medium transition',
          active
            ? 'border-[#944a00] bg-[#944a00] text-white'
            : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300',
        )}
      >
        <option value="">Any equipment</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2',
          active ? 'text-white' : 'text-neutral-500',
        )}
      />
    </div>
  );
}
