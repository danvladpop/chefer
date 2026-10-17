import { useState } from 'react';
import { View } from 'react-native';
import {
  DENSE_MAX_FONT_SCALE,
  haptics,
  PressableScale,
  SelectSheet,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { filterPillClassName, filterPillTextClassName } from './collapsible-chip-filters';

// FB7-07: the equipment filter is a chip that opens a SelectSheet instead of
// a second row of 20 pills. It shows the chosen value ("Dumbbell ▾"), turns
// primary while a filter is active, and the sheet's first row clears it.
// `tone="brand"` draws it as the 10 Oct redesign's brand-tint `FilterPill`
// (the Exercises library); the default keeps the kit `Chip` look its
// neighbours in the swap/add picker still use.

export interface EquipmentFilterOption {
  value: string;
  label: string;
}

export interface EquipmentFilterChipProps {
  options: readonly EquipmentFilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** `kit` matches the kit `Chip`; `brand` matches `FilterPill`. */
  tone?: 'kit' | 'brand';
  testID?: string;
}

const ANY = '__any__';

export function EquipmentFilterChip({
  options,
  value,
  onChange,
  tone = 'kit',
  testID = 'equipment-filter',
}: EquipmentFilterChipProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? value;
  const active = value !== null;
  const brand = tone === 'brand';
  const colors = useThemeColors();

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
        className={
          brand
            ? filterPillClassName(active)
            : cn(
                'min-h-11 flex-row items-center justify-center gap-1 rounded-full border px-4 py-2',
                active ? 'border-primary bg-primary' : 'border-border bg-background',
              )
        }
      >
        <Text
          className={
            brand
              ? filterPillTextClassName(active)
              : cn('text-sm font-medium', active ? 'text-primary-foreground' : 'text-foreground')
          }
          maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
        >
          {label ?? 'Equipment'}
        </Text>
        {brand ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Icon name="chevronDown" color={active ? colors.onBrand : colors.brand} size={16} />
          </View>
        ) : (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            className={cn('text-xs', active ? 'text-primary-foreground' : 'text-muted-foreground')}
          >
            ▾
          </Text>
        )}
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
