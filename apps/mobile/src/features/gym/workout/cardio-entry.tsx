import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { ExerciseDto, SessionExerciseDoc, SessionSummaryDto, WeightUnit } from '@chefer/types';
import { Button, SegmentedControl, Text, ValueStepper } from '@chefer/ui-mobile';
import {
  cardioNextTime,
  cardioPresetsFor,
  distanceUnitFor,
  formatDistance,
  formatDurationClock,
  toMetres,
  type CardioDistanceUnit,
} from '@chefer/utils';
import {
  cardioElapsedSec,
  clearCardioTimer,
  pauseCardioTimer,
  resumeCardioTimer,
  startCardioTimer,
  useCardioTimer,
} from './cardio-timer';
import { EffortChips } from './effort-chips';
import type { CardioLogFields } from './exercise-card';
import { lastCardioExposure } from './workout-model';

// ─── The cardio entry (T-42.3, UX-42) ─────────────────────────────────────────
// One entry per cardio exercise — no sets, kg or RIR (AC1). `Timer | Enter`
// picks how the time gets in; distance/level/effort are optional add-ons
// shown only when the catalogue entry actually uses them (T-42.1's
// cardio-catalog.ts). "Same as last time" + "Log it" = 2 taps (AC3).

const DURATION_CHIPS_MIN = [10, 15, 20, 30, 45, 60] as const;

function distanceStepFor(unit: CardioDistanceUnit): number {
  return unit === 'M' ? 100 : 0.1;
}

export interface CardioEntryProps {
  se: SessionExerciseDoc;
  meta: ExerciseDto;
  unit: WeightUnit;
  prior: SessionSummaryDto[];
  onLogIt: (fields: CardioLogFields) => void;
  testID: string;
}

export function CardioEntry({ se, meta, unit, prior, onLogIt, testID }: CardioEntryProps) {
  const [mode, setMode] = useState<'timer' | 'enter'>('timer');
  const [enterMin, setEnterMin] = useState<number | null>(null);
  const [distanceDisplay, setDistanceDisplay] = useState<number | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [rpe, setRpe] = useState<number | undefined>(undefined);

  const preset = cardioPresetsFor(meta.id);
  const showDistance = preset?.metrics.includes('distance') ?? false;
  const showLevel = preset?.metrics.includes('resistance') ?? false;
  const profileDistanceUnit = unit === 'LB' ? 'MI' : 'KM';
  const distanceUnit: CardioDistanceUnit = distanceUnitFor(meta.id, profileDistanceUnit);

  const timerState = useCardioTimer();
  const isThisTimer = timerState?.seId === se.id;
  const timerRunning = isThisTimer && timerState.runningSince !== null;
  const timerElapsedSec = isThisTimer ? cardioElapsedSec(timerState) : 0;

  const lastExposure = useMemo(
    () => lastCardioExposure(se.exerciseId, prior),
    [se.exerciseId, prior],
  );
  const nextTime = useMemo(
    () => cardioNextTime(lastExposure, distanceUnit),
    [lastExposure, distanceUnit],
  );

  const alreadyLogged = se.sets[0]?.completedAt !== null;

  const durationSec = mode === 'timer' ? timerElapsedSec : (enterMin ?? 0) * 60;
  const distanceM = distanceDisplay !== null ? toMetres(distanceDisplay, distanceUnit) : undefined;
  const canLog = durationSec > 0;

  const applySameAsLastTime = () => {
    if (!lastExposure?.durationSec) return;
    setMode('enter');
    setEnterMin(Math.round(lastExposure.durationSec / 60));
    setDistanceDisplay(
      lastExposure.distanceM !== undefined
        ? distanceUnit === 'M'
          ? Math.round(lastExposure.distanceM)
          : Math.round((lastExposure.distanceM / (distanceUnit === 'MI' ? 1609.344 : 1000)) * 10) /
            10
        : null,
    );
    if (lastExposure.intensityRpe !== undefined) setRpe(lastExposure.intensityRpe);
  };

  const handleLogIt = () => {
    if (!canLog) return;
    const fields: CardioLogFields = { durationSec };
    if (distanceM !== undefined) fields.distanceM = distanceM;
    if (rpe !== undefined) fields.intensityRpe = rpe;
    if (level !== null) fields.resistanceLevel = level;
    onLogIt(fields);
    if (isThisTimer) clearCardioTimer();
  };

  return (
    <View className="gap-3" testID={testID}>
      {alreadyLogged ? (
        <Text testID={`${testID}-logged`} variant="muted">
          Logged.
        </Text>
      ) : null}

      {!alreadyLogged && lastExposure ? (
        <Button
          testID={`${testID}-same-as-last-time`}
          variant="secondary"
          onPress={applySameAsLastTime}
          accessibilityLabel="Fill in the same time, distance and effort as last time"
        >
          {nextTime.text}
        </Button>
      ) : null}

      {!alreadyLogged ? (
        <>
          <SegmentedControl
            testID={`${testID}-mode`}
            accessibilityLabel="How do you want to log the time?"
            options={[
              { value: 'timer', label: 'Timer' },
              { value: 'enter', label: 'Enter' },
            ]}
            value={mode}
            onChange={setMode}
          />

          {mode === 'timer' ? (
            <View className="items-center gap-2">
              <Text testID={`${testID}-clock`} className="text-3xl font-bold tabular-nums">
                {formatDurationClock(timerElapsedSec)}
              </Text>
              {!isThisTimer || !timerRunning ? (
                <Button
                  testID={`${testID}-timer-start`}
                  onPress={() => (isThisTimer ? resumeCardioTimer() : startCardioTimer(se.id))}
                >
                  {isThisTimer && timerElapsedSec > 0 ? 'Resume' : 'Start'}
                </Button>
              ) : (
                <Button
                  testID={`${testID}-timer-pause`}
                  variant="secondary"
                  onPress={() => pauseCardioTimer()}
                >
                  Pause
                </Button>
              )}
            </View>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {DURATION_CHIPS_MIN.map((min) => (
                <Button
                  key={min}
                  testID={`${testID}-duration-${min}`}
                  size="sm"
                  variant={enterMin === min ? 'default' : 'secondary'}
                  onPress={() => setEnterMin(min)}
                >
                  {`${min} min`}
                </Button>
              ))}
            </View>
          )}

          {showDistance ? (
            <ValueStepper
              testID={`${testID}-distance`}
              name="Distance"
              value={distanceDisplay ?? 0}
              next={(v, dir) => Math.max(0, round1(v + dir * distanceStepFor(distanceUnit)))}
              onChange={setDistanceDisplay}
              format={(v) => formatDistance(toMetres(v, distanceUnit), distanceUnit)}
              caption={distanceUnit === 'M' ? 'm' : distanceUnit.toLowerCase()}
            />
          ) : null}

          {showLevel ? (
            <ValueStepper
              testID={`${testID}-level`}
              name="Level"
              value={level ?? 0}
              next={(v, dir) => Math.max(0, Math.min(20, v + dir))}
              onChange={setLevel}
              format={(v) => String(v)}
              caption="level"
            />
          ) : null}

          <EffortChips testID={`${testID}-effort`} value={rpe} onChange={setRpe} />

          <Button testID={`${testID}-log-it`} disabled={!canLog} onPress={handleLogIt}>
            Log it
          </Button>
        </>
      ) : null}
    </View>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
