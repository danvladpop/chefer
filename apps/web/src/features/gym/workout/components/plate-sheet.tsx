'use client';

import { useT } from '@/lib/i18n';
import type { EquipmentProfile } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import { formatLoad, formatLoadNumber, platesPerSide, unitLabel } from '@chefer/utils';

/** Plate calculator (research §5.1 #7): plates per side for a barbell total, from the user's inventory. */
export function PlateSheet({
  weightKg,
  profile,
  onClose,
}: {
  weightKg: number | null;
  profile: EquipmentProfile;
  onClose: () => void;
}) {
  const { t } = useT();
  const open = weightKg !== null;
  const total = weightKg ?? 0;
  const { plates, remainderKg } = platesPerSide(total, profile);
  const unit = profile.unit;

  // Group identical plates: [20, 20, 5] → "2 × 20".
  const grouped: { plate: number; count: number }[] = [];
  for (const p of plates) {
    const last = grouped[grouped.length - 1];
    if (last && Math.abs(last.plate - p) < 1e-6) last.count += 1;
    else grouped.push({ plate: p, count: 1 });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('gym.workout.plates.title', { load: formatLoad(total, unit) })}
      description={t('gym.workout.plates.description', {
        bar: formatLoad(profile.barWeightKg, unit),
      })}
      size="sm"
    >
      <div className="px-5 pb-5" data-testid="gym-plate-sheet">
        {grouped.length === 0 ? (
          <p className="text-sm text-gray-600">{t('gym.workout.plates.emptyBar')}</p>
        ) : (
          <ul
            className="flex flex-wrap items-end gap-2"
            aria-label={t('gym.workout.plates.perSide')}
          >
            {grouped.map(({ plate, count }) => (
              <li
                key={plate}
                className="flex min-w-16 flex-col items-center rounded-xl border bg-gray-50 px-3 py-2"
              >
                <span className="text-lg font-bold tabular-nums text-gray-900">
                  {formatLoadNumber(plate, unit)}
                </span>
                <span className="text-xs text-gray-500">
                  {unitLabel(unit)} × {count}
                </span>
              </li>
            ))}
          </ul>
        )}
        {remainderKg > 0.001 && (
          <p className="mt-3 text-xs text-amber-700">
            {t('gym.workout.plates.leftover', { load: formatLoad(remainderKg, unit) })}
          </p>
        )}
      </div>
    </Sheet>
  );
}
