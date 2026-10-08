import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { cn, MAX_SUPERSET_SIZE } from '@chefer/utils';

// "Superset" pick sheet (plan-library-supersets S2): shared by the routine day
// editor and the active workout. The user ticks 2 to MAX_SUPERSET_SIZE
// exercises and taps "Group as superset"; the caller applies `createSuperset`
// (which moves the picks together at the first pick's place). Ticks beyond
// the max are disabled. The workout can also offer "Also change my routine".

export const SUPERSET_COPY = {
  title: 'Superset',
  hint: `Pick 2 to ${MAX_SUPERSET_SIZE} exercises to do back to back. You rest after the round.`,
  apply: 'Group as superset',
  needMore: 'Pick at least 2 exercises.',
  full: `That’s the most for one superset.`,
  ungroup: 'Ungroup',
  alsoRoutine: 'Also change my routine',
  alsoRoutineDetail: 'Next time this day starts with the same superset.',
} as const;

export interface SupersetPickItem {
  key: string;
  name: string;
  /** A second line, e.g. "In superset A". */
  detail?: string | null;
}

export interface SupersetRoutineOption {
  /** True when the picks (in list order) can also be grouped in the routine. */
  available: (keys: readonly string[]) => boolean;
  /** Why the routine can't change right now (offline); the box is then disabled. */
  blockedReason: string | null;
}

function CheckboxRow({
  testID,
  label,
  detail,
  checked,
  disabled = false,
  onPress,
}: {
  testID: string;
  label: string;
  detail?: string | null | undefined;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      disabled={disabled}
      onPress={onPress}
      // 44pt minimum touch target even though the visible box is smaller.
      className={cn(
        'min-h-12 flex-row items-center gap-3 border-b border-border px-1 py-2 active:bg-muted',
        disabled && 'opacity-50',
      )}
    >
      <View
        className={cn(
          'h-6 w-6 items-center justify-center rounded-md border-2',
          checked ? 'border-violet-600 bg-violet-600' : 'border-input bg-background',
        )}
      >
        {checked ? <Ionicons name="checkmark" size={16} color="#ffffff" /> : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-medium">{label}</Text>
        {detail ? (
          <Text variant="muted" className="text-xs">
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function SupersetSheet({
  visible,
  onClose,
  onExited,
  items,
  initialKeys,
  routineOption = null,
  onApply,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  onExited?: () => void;
  /** The exercises that can be picked, in list order. */
  items: readonly SupersetPickItem[];
  /** Ticked when the sheet opens (e.g. the exercise whose menu opened it). */
  initialKeys?: readonly string[];
  /** "Also change my routine" (workout only). */
  routineOption?: SupersetRoutineOption | null;
  /** The picks in list order, and whether to change the routine too. */
  onApply: (keys: string[], alsoRoutine: boolean) => void;
  testID: string;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialKeys));
  const [alsoRoutine, setAlsoRoutine] = useState(false);

  // Every opening starts from the caller's initial picks, with the routine box off.
  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(initialKeys));
    setAlsoRoutine(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only
  }, [visible]);

  const picked = items.filter((item) => selected.has(item.key)).map((item) => item.key);
  const full = picked.length >= MAX_SUPERSET_SIZE;
  const ready = picked.length >= 2;
  const routineAvailable = ready && (routineOption?.available(picked) ?? false);
  const routineBlocked = routineOption?.blockedReason ?? null;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < MAX_SUPERSET_SIZE) next.add(key);
      return next;
    });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      {...(onExited ? { onExited } : {})}
      title={SUPERSET_COPY.title}
      testID={testID}
      footer={
        <View className="gap-2">
          {routineAvailable ? (
            <CheckboxRow
              testID={`${testID}-also-routine`}
              label={SUPERSET_COPY.alsoRoutine}
              detail={routineBlocked ?? SUPERSET_COPY.alsoRoutineDetail}
              checked={alsoRoutine && routineBlocked === null}
              disabled={routineBlocked !== null}
              onPress={() => setAlsoRoutine((v) => !v)}
            />
          ) : null}
          <Text
            testID={`${testID}-status`}
            variant="muted"
            className="text-xs"
            accessibilityLiveRegion="polite"
          >
            {!ready
              ? SUPERSET_COPY.needMore
              : full
                ? SUPERSET_COPY.full
                : `${picked.length} picked`}
          </Text>
          <Button
            testID={`${testID}-apply`}
            size="lg"
            disabled={!ready}
            {...(ready ? {} : { accessibilityHint: SUPERSET_COPY.needMore })}
            onPress={() => onApply(picked, routineAvailable && alsoRoutine && !routineBlocked)}
          >
            {SUPERSET_COPY.apply}
          </Button>
        </View>
      }
    >
      <Text testID={`${testID}-hint`} variant="muted">
        {SUPERSET_COPY.hint}
      </Text>
      <View>
        {items.map((item) => {
          const checked = selected.has(item.key);
          return (
            <CheckboxRow
              key={item.key}
              testID={`${testID}-item-${item.key}`}
              label={item.name}
              detail={item.detail}
              checked={checked}
              disabled={!checked && full}
              onPress={() => toggle(item.key)}
            />
          );
        })}
      </View>
    </Sheet>
  );
}
