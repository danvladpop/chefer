import { useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import type { EquipmentProfile, ExerciseMeta, WeightUnit } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import {
  formatLoadNumber,
  kgToUnit,
  platesPerSide,
  roundToAchievable,
  sameKg,
  unitLabel,
  unitToKg,
} from '@chefer/utils';

// Weight / reps entry without the system keyboard (research §5.1 #2): a big
// numeric keypad, and for barbell/smith lifts a live plate calculator
// (research §5.1 #7) built on the user's plate inventory.

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;
type Key = (typeof KEYS)[number];

function Keypad({
  onKey,
  allowDecimal,
  testID,
}: {
  onKey: (key: Key) => void;
  allowDecimal: boolean;
  testID: string;
}) {
  return (
    <View className="flex-row flex-wrap justify-between gap-y-2">
      {KEYS.map((key) => {
        const hidden = key === '.' && !allowDecimal;
        return (
          <Pressable
            key={key}
            testID={`${testID}-key-${key === '.' ? 'dot' : key}`}
            accessibilityRole="button"
            accessibilityLabel={key === 'back' ? 'Delete' : key === '.' ? 'Decimal point' : key}
            disabled={hidden}
            onPress={() => onKey(key)}
            className={`h-14 w-[31%] items-center justify-center rounded-xl ${
              hidden ? 'opacity-0' : 'bg-muted active:opacity-70'
            }`}
          >
            <RNText className="text-2xl font-semibold text-foreground">
              {key === 'back' ? '⌫' : key}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

function applyKey(text: string, key: Key, fresh: boolean, allowDecimal: boolean): string {
  const current = fresh ? '' : text;
  if (key === 'back') return fresh ? '' : current.slice(0, -1);
  if (key === '.') {
    if (!allowDecimal || current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  const [, decimals] = current.split('.');
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (current.replace('.', '').length >= 5) return current;
  return current === '0' ? key : `${current}${key}`;
}

export interface NumberSheetProps {
  visible: boolean;
  onClose: () => void;
  kind: 'weight' | 'reps';
  /** Current value: kg for weight, reps/seconds for reps. */
  value: number;
  onSubmit: (value: number) => void;
  title: string;
  unit: WeightUnit;
  meta: ExerciseMeta | null;
  profile: EquipmentProfile;
  showPlates: boolean;
  timed?: boolean;
}

/** Controlled by its parent; re-keyed per open so the keypad starts fresh. */
export function NumberSheet(props: NumberSheetProps) {
  const { visible, onClose, onSubmit, kind, value, title, unit, meta, profile, showPlates, timed } =
    props;
  const initial = kind === 'weight' ? formatLoadNumber(value, unit) : String(value);
  const [text, setText] = useState(initial);
  const [fresh, setFresh] = useState(true);
  const allowDecimal = kind === 'weight';
  const parsed = Number.parseFloat(text);
  const valid = Number.isFinite(parsed) && parsed >= 0;
  const kg = kind === 'weight' && valid ? unitToKg(parsed, unit) : null;
  const plates = showPlates && kg !== null ? platesPerSide(kg, profile) : null;
  const nearest =
    plates && meta && plates.remainderKg > 0.005
      ? roundToAchievable(kg ?? 0, { exercise: meta }, profile, 'nearest')
      : null;
  const belowBar = showPlates && kg !== null && kg < profile.barWeightKg - 0.005;

  const submit = () => {
    if (!valid) return;
    onSubmit(kind === 'weight' ? unitToKg(parsed, unit) : Math.min(3600, Math.round(parsed)));
  };

  const suffix = kind === 'weight' ? unitLabel(unit) : timed ? 's' : 'reps';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID="number-sheet"
      footer={
        <Button testID="number-sheet-save" size="lg" disabled={!valid} onPress={submit}>
          Save
        </Button>
      }
    >
      <View className="items-center py-2">
        <Text testID="number-sheet-value" className="text-4xl font-bold tabular-nums">
          {text === '' ? '0' : text}
          <Text className="text-lg text-muted-foreground"> {suffix}</Text>
        </Text>
      </View>

      {plates && !belowBar ? (
        <View testID="plate-calculator" className="gap-2 rounded-xl bg-muted p-3">
          <Text className="text-sm font-medium">
            Per side, on a {formatLoadNumber(profile.barWeightKg, unit)} {unitLabel(unit)} bar
          </Text>
          {plates.plates.length === 0 ? (
            <Text variant="muted">Just the bar.</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {plates.plates.map((p, i) => (
                <View
                  key={`${p}-${i}`}
                  className="min-w-11 items-center rounded-md border border-border bg-card px-2 py-1"
                >
                  <RNText testID={`plate-${i}`} className="text-base font-semibold text-foreground">
                    {String(kgToUnit(p, unit))}
                  </RNText>
                </View>
              ))}
            </View>
          )}
          {nearest !== null && kg !== null && !sameKg(nearest, kg) ? (
            <Pressable
              testID="plate-calculator-nearest"
              accessibilityRole="button"
              onPress={() => {
                setText(formatLoadNumber(nearest, unit));
                setFresh(true);
              }}
              className="min-h-11 justify-center"
            >
              <Text className="text-sm text-amber-800">
                Your plates can&apos;t make this exactly. Tap to use{' '}
                {formatLoadNumber(nearest, unit)} {unitLabel(unit)}.
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {belowBar ? (
        <Text variant="muted" className="text-center">
          Lighter than the empty bar.
        </Text>
      ) : null}

      <Keypad
        testID="number-sheet"
        allowDecimal={allowDecimal}
        onKey={(key) => {
          setText((t) => applyKey(t, key, fresh, allowDecimal));
          setFresh(false);
        }}
      />
    </Sheet>
  );
}
