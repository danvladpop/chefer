import { useState } from 'react';
import {
  DENSE_MAX_FONT_SCALE,
  haptics,
  PressableScale,
  SelectSheet,
  Text,
} from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// FB7-07: the equipment filter is a chip that opens a SelectSheet instead of
// a second row of 20 pills. It shows the chosen value ("Dumbbell ▾"), turns
// primary while a filter is active, and the sheet's first row clears it.

export interface EquipmentFilterOption {
  value: string;
  label: string;
}

export interface EquipmentFilterChipProps {
  options: readonly EquipmentFilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  testID?: string;
}

const ANY = '__any__';

export function EquipmentFilterChip({
  options,
  value,
  onChange,
  testID = 'equipment-filter',
}: EquipmentFilterChipProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? value;
  const active = value !== null;

  return (
    <>
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`Equipment, ${label ?? 'any'}`}
        accessibilityHint="Opens a list of equipment to filter by"
        accessibilityState={{ selected: active }}
        onPress={() => {
          haptics.selection();
          setOpen(true);
        }}
        className={cn(
          'min-h-11 flex-row items-center justify-center gap-1 rounded-full border px-4 py-2',
          active ? 'border-primary bg-primary' : 'border-border bg-background',
        )}
      >
        <Text
          className={cn(
            'text-sm font-medium',
            active ? 'text-primary-foreground' : 'text-foreground',
          )}
          maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
        >
          {label ?? 'Equipment'}
        </Text>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          className={cn('text-xs', active ? 'text-primary-foreground' : 'text-muted-foreground')}
        >
          ▾
        </Text>
      </PressableScale>
      <SelectSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Equipment"
        options={[{ value: ANY, label: 'Any equipment' }, ...options]}
        value={value ?? ANY}
        onChange={(v) => {
          onChange(v === ANY ? null : v);
          setOpen(false);
        }}
        searchable={false}
        testID={`${testID}-sheet`}
      />
    </>
  );
}
