import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  GYM_MAX_REPS,
  GYM_MAX_WEIGHT_KG,
  type EquipmentProfile,
  type ExerciseMeta,
  type WeightUnit,
} from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import {
  cn,
  formatLoadNumber,
  kgToUnit,
  PER_HAND_SUFFIX,
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
            className={cn(
              'h-14 w-[31%] items-center justify-center rounded-control',
              hidden ? 'opacity-0' : 'bg-surface-sunken active:opacity-70',
            )}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              className="text-title1 font-semibold text-label"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {key === 'back' ? '⌫' : key}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * UX-GYM-01: a value above this many times the previous one asks "are you
 * sure?" before it is saved ("1025" typed for 102.5 kg is the classic slip).
 */
export const JUMP_CONFIRM_FACTOR = 2;
/** Reps jump around legitimately (8 → 20 on a light set): only a big result asks. */
const REPS_JUMP_CONFIRM_MIN = 50;

/** The largest value the keypad accepts, in the unit it displays (the wire schema's cap). */
export function keypadMax(kind: 'weight' | 'reps', unit: WeightUnit): number {
  return kind === 'weight' ? kgToUnit(GYM_MAX_WEIGHT_KG, unit) : GYM_MAX_REPS;
}

/**
 * True when saving `next` (display value) over `previous` should be
 * confirmed: more than {@link JUMP_CONFIRM_FACTOR}× a known previous value.
 */
export function needsJumpConfirm(kind: 'weight' | 'reps', previous: number, next: number): boolean {
  if (!(previous > 0) || next <= previous * JUMP_CONFIRM_FACTOR) return false;
  return kind === 'weight' || next >= REPS_JUMP_CONFIRM_MIN;
}

function applyKey(
  text: string,
  key: Key,
  fresh: boolean,
  allowDecimal: boolean,
  max: number,
): string {
  const current = fresh ? '' : text;
  if (key === 'back') return fresh ? '' : current.slice(0, -1);
  if (key === '.') {
    if (!allowDecimal || current.includes('.')) return current;
    return current === '' ? '0.' : `${current}.`;
  }
  const [, decimals] = current.split('.');
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (current.replace('.', '').length >= 5) return current;
  const next = current === '0' ? key : `${current}${key}`;
  // Clamp to the schema bound: a digit that would exceed it is ignored.
  return Number.parseFloat(next) > max ? current : next;
}

// UX-GYM-19: a dumbbell / kettlebell number is ONE implement — say "each".
function formatPrevious(
  kind: 'weight' | 'reps',
  value: number,
  unit: WeightUnit,
  each: boolean,
): string {
  return kind === 'weight'
    ? `${formatLoadNumber(value, unit)} ${unitLabel(unit)}${each ? ` ${PER_HAND_SUFFIX}` : ''}`
    : String(value);
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

  const max = keypadMax(kind, unit);
  const [confirmingJump, setConfirmingJump] = useState(false);
  const previousDisplay = kind === 'weight' ? kgToUnit(value, unit) : value;
  const nextDisplay = kind === 'weight' ? parsed : Math.round(parsed);

  const commit = () => {
    onSubmit(
      kind === 'weight' ? unitToKg(parsed, unit) : Math.min(GYM_MAX_REPS, Math.round(parsed)),
    );
  };
  const submit = () => {
    if (!valid) return;
    if (needsJumpConfirm(kind, previousDisplay, nextDisplay)) {
      setConfirmingJump(true);
      return;
    }
    commit();
  };

  const suffix =
    kind === 'weight'
      ? `${unitLabel(unit)}${meta?.perHand ? ` ${PER_HAND_SUFFIX}` : ''}`
      : timed
        ? 's'
        : 'reps';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID="number-sheet"
      footer={
        confirmingJump ? (
          <View className="gap-2">
            <Button testID="number-sheet-jump-confirm" size="lg" onPress={commit}>
              {`Yes, save ${text} ${suffix}`}
            </Button>
            <Button
              testID="number-sheet-jump-change"
              size="lg"
              variant="outline"
              onPress={() => setConfirmingJump(false)}
            >
              Change it
            </Button>
          </View>
        ) : (
          <Button testID="number-sheet-save" size="lg" disabled={!valid} onPress={submit}>
            Save
          </Button>
        )
      }
    >
      <View className="items-center py-2">
        <Text
          testID="number-sheet-value"
          className="text-display font-bold text-label"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {text === '' ? '0' : text}
          <Text className="text-title3 font-semibold text-label-secondary"> {suffix}</Text>
        </Text>
      </View>

      {confirmingJump ? (
        <Text
          testID="number-sheet-jump-warning"
          className="text-center text-callout font-medium text-attention"
        >
          {`That is more than ${JUMP_CONFIRM_FACTOR}× the last ${formatPrevious(kind, value, unit, meta?.perHand === true)}. Is it right?`}
        </Text>
      ) : null}

      {plates && !belowBar ? (
        <View testID="plate-calculator" className="gap-2 rounded-control bg-surface-sunken p-3">
          <Text className="text-callout font-medium text-label">
            Per side, on a {formatLoadNumber(profile.barWeightKg, unit)} {unitLabel(unit)} bar
          </Text>
          {plates.plates.length === 0 ? (
            <Text className="text-subhead text-label-secondary">Just the bar.</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {plates.plates.map((p, i) => (
                <View
                  key={`${p}-${i}`}
                  className="min-w-11 items-center rounded-inner border border-separator bg-surface px-2 py-1"
                >
                  <Text
                    testID={`plate-${i}`}
                    className="text-callout font-semibold text-label"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {String(kgToUnit(p, unit))}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {plates.remainderKg > 0.005 ? (
            <Text testID="plate-calculator-remainder" className="text-subhead text-attention">
              {`${formatLoadNumber(plates.remainderKg, unit)} ${unitLabel(unit)} per side can't be made with your plates.`}
            </Text>
          ) : null}
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
              <Text className="text-subhead font-semibold text-attention">
                Your plates can&apos;t make this exactly. Tap to use{' '}
                {formatLoadNumber(nearest, unit)} {unitLabel(unit)}.
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {belowBar ? (
        <Text className="text-center text-subhead text-label-secondary">
          Lighter than the empty bar.
        </Text>
      ) : null}

      <Keypad
        testID="number-sheet"
        allowDecimal={allowDecimal}
        onKey={(key) => {
          setText((t) => applyKey(t, key, fresh, allowDecimal, max));
          setFresh(false);
          setConfirmingJump(false);
        }}
      />
    </Sheet>
  );
}
