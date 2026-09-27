import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { PressableScale } from '../motion/pressable-scale';
import { Sheet } from './sheet';
import { DENSE_MAX_FONT_SCALE, Text } from './text';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Muted group header the option is listed under (unlabelled options come first). */
  group?: string;
  /** Small muted text after the label (e.g. a unit's canonical abbreviation). */
  detail?: string;
}

export interface SelectFieldProps<T extends string = string> {
  label: string;
  value: T | null;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  /** Show a search box in the sheet. Defaults to on when there are > 12 options. */
  searchable?: boolean;
  /** Adds an "Other…" row that swaps the list for a free-text input. */
  allowOther?: { label?: string; inputLabel: string };
  className?: string;
  testID?: string;
}

/**
 * PAT-15 "dropdown" — a field that opens a `SelectSheet` instead of a native
 * menu that would cover the keyboard. Looks like an `Input` with a trailing
 * `chevron-down`, 44pt tall.
 */
export function SelectField<T extends string = string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose one',
  required = false,
  error,
  searchable,
  allowOther,
  className,
  testID,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  // A legacy value that isn't in the canonical list (an old free-text unit
  // or cuisine) still displays — never silently changed or blanked.
  const displayLabel = selected?.label ?? (value ? value : null);
  const isSearchable = searchable ?? options.length > 12;

  const a11yLabel = `${label}, ${displayLabel ?? 'not set'}${required ? ', required' : ''}`;

  return (
    <View className={cn('gap-1', className)}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens a list to choose from"
        onPress={() => setOpen(true)}
        className={cn(
          'h-11 flex-row items-center justify-between rounded-md border border-input bg-background px-3',
          error && 'border-destructive',
        )}
      >
        <Text
          className={cn('text-base', displayLabel ? 'text-foreground' : 'text-muted-foreground')}
          numberOfLines={1}
        >
          {displayLabel ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#6b7280" />
      </Pressable>
      {error ? (
        <View className="flex-row items-center gap-1">
          <Ionicons name="alert-circle" size={14} color="#dc2626" />
          <Text className="flex-1 text-xs text-destructive">{error}</Text>
        </View>
      ) : null}
      <SelectSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        options={options}
        value={value}
        onChange={(v) => {
          onChange(v);
          setOpen(false);
        }}
        searchable={isSearchable}
        allowOther={allowOther}
        testID={testID ? `${testID}-sheet` : undefined}
      />
    </View>
  );
}

export interface SelectSheetProps<T extends string = string> {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: readonly SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  searchable?: boolean;
  allowOther?: { label?: string; inputLabel: string };
  testID?: string;
}

/**
 * The sheet body for `SelectField` — also usable on its own (a trigger other
 * than a text field, e.g. a chip). 48pt rows grouped under muted headers, a
 * `checkmark` on the selected row, an optional search box, and an
 * `Other…` row that swaps the list for one input.
 */
export function SelectSheet<T extends string = string>({
  visible,
  onClose,
  title,
  options,
  value,
  onChange,
  searchable = false,
  allowOther,
  testID,
}: SelectSheetProps<T>) {
  const [query, setQuery] = useState('');
  const [otherMode, setOtherMode] = useState(false);
  const [otherText, setOtherText] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const groups = useMemo(() => {
    const order: (string | undefined)[] = [];
    const byGroup = new Map<string | undefined, SelectOption<T>[]>();
    for (const opt of filtered) {
      if (!byGroup.has(opt.group)) {
        order.push(opt.group);
        byGroup.set(opt.group, []);
      }
      byGroup.get(opt.group)?.push(opt);
    }
    return order.map((g) => ({ group: g, rows: byGroup.get(g) ?? [] }));
  }, [filtered]);

  const handleClose = () => {
    setQuery('');
    setOtherMode(false);
    setOtherText('');
    onClose();
  };

  const select = (v: T) => {
    haptics.selection();
    onChange(v);
  };

  return (
    <Sheet visible={visible} onClose={handleClose} title={title} testID={testID}>
      {otherMode ? (
        <View className="gap-3">
          <View className="gap-1">
            <Text variant="label">{allowOther?.inputLabel ?? 'Other'}</Text>
            <OtherInput
              value={otherText}
              onChangeText={setOtherText}
              testID={testID ? `${testID}-other-input` : undefined}
              accessibilityLabel={allowOther?.inputLabel ?? 'Other'}
            />
          </View>
          <Pressable
            testID={testID ? `${testID}-other-use` : undefined}
            accessibilityRole="button"
            onPress={() => {
              const v = otherText.trim();
              if (v) select(v as T);
            }}
            disabled={!otherText.trim()}
            className="h-11 items-center justify-center rounded-md bg-primary disabled:opacity-40"
          >
            <Text className="text-sm font-semibold text-primary-foreground">Use this</Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-1">
          {searchable ? (
            <OtherInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              testID={testID ? `${testID}-search` : undefined}
              accessibilityLabel={`Search ${title.toLowerCase()}`}
            />
          ) : null}
          {groups.map(({ group, rows }) => (
            <View key={group ?? '__ungrouped__'}>
              {group ? (
                <Text
                  variant="muted"
                  className="px-1 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide"
                >
                  {group}
                </Text>
              ) : null}
              {rows.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <PressableScale
                    key={opt.value}
                    testID={testID ? `${testID}-option-${opt.value}` : undefined}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => select(opt.value)}
                    className="min-h-11 flex-row items-center justify-between gap-2 rounded-md px-2 py-2"
                  >
                    <View className="min-w-0 flex-1 flex-row items-center gap-2">
                      <Text
                        className="shrink text-base text-foreground"
                        maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
                      >
                        {opt.label}
                      </Text>
                      {opt.detail ? (
                        <Text variant="muted" className="text-xs">
                          {opt.detail}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? <Ionicons name="checkmark" size={18} color="#944a00" /> : null}
                  </PressableScale>
                );
              })}
            </View>
          ))}
          {allowOther ? (
            <PressableScale
              testID={testID ? `${testID}-other` : undefined}
              accessibilityRole="button"
              onPress={() => setOtherMode(true)}
              className="min-h-11 flex-row items-center justify-between rounded-md px-2 py-2"
            >
              <Text className="text-base text-foreground">{allowOther.label ?? 'Other…'}</Text>
            </PressableScale>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

// A minimal themed input local to this file — pulling in `Input` would add a
// cross-import; this keeps the sheet's search/"other" boxes visually
// consistent without it.
function OtherInput({
  value,
  onChangeText,
  placeholder,
  testID,
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      accessibilityLabel={accessibilityLabel}
      autoFocus={!placeholder}
      className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
    />
  );
}
