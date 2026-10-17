import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { WorkoutType } from '@chefer/types';
import { Button, ChipGroup, Sheet, Text, useThemeColors } from '@chefer/ui-mobile';
import { isSimpleTraining } from '@chefer/utils';
import { Icon } from '../../components/icon';
import { useFlags } from '../../hooks/use-flags';
import { localDate } from '../gym/offline/ids';
import { WorkoutTypeChips } from '../gym/simple/workout-type-chips';
import { LoggedWorkoutForm } from '../gym/today/log-workout-form';
import { useActiveWorkout } from '../gym/use-active-workout';
import { useGymBootstrap } from '../gym/use-gym-bootstrap';

// "Log a workout" (10 Oct redesign; board LogWorkoutSheet). One sheet reached
// from Today (next to Cook now), the Add sheet and Train, so logging training
// is as close as logging food:
//  - a gym day you already did → log mode for today (`/gym/workout?log=…`),
//    the same screen the old "Log a workout you already did" link opened;
//  - a workout done elsewhere → the "Log a workout" form, with the tapped
//    workout type preselected (opened once this sheet has gone: iOS shows one
//    modal at a time);
//  - start a freestyle workout now (or resume the one already running).
// "Keep it simple" (simple training mode §6.2) skips the chooser: the sheet IS
// the form — no sets grid to log, so a type, a duration and Save.

type Next = { kind: 'href'; href: Href } | { kind: 'form'; workoutType: WorkoutType };

const FREESTYLE = '__freestyle';

function logHref(dayId: string | null): Href {
  const date = localDate();
  return dayId
    ? { pathname: '/gym/workout', params: { log: date, day: dayId } }
    : { pathname: '/gym/workout', params: { log: date } };
}

export interface LogWorkoutSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Preselects a workout type in the form (simple Today's planned day). */
  initialType?: WorkoutType | undefined;
}

export function LogWorkoutSheet(props: LogWorkoutSheetProps) {
  const { data: bootstrap } = useGymBootstrap();
  const flags = useFlags();
  if (bootstrap && isSimpleTraining(bootstrap.profile, flags)) {
    return <SimpleLogWorkoutSheet {...props} />;
  }
  return <LogWorkoutChooserSheet {...props} />;
}

/** Simple mode: the form itself, fresh on every opening. */
function SimpleLogWorkoutSheet({ visible, onClose, initialType }: LogWorkoutSheetProps) {
  const { data: bootstrap } = useGymBootstrap();
  const [openCount, setOpenCount] = useState(0);
  const [shownFor, setShownFor] = useState(visible);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) setOpenCount((n) => n + 1);
  }
  if (!bootstrap) return null;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      eyebrow="Done elsewhere or earlier"
      title="Log a workout"
      testID="log-workout-sheet"
    >
      <LoggedWorkoutForm
        key={openCount}
        bootstrap={bootstrap}
        initialType={initialType}
        onDone={onClose}
      />
    </Sheet>
  );
}

function LogWorkoutChooserSheet({ visible, onClose }: LogWorkoutSheetProps) {
  const colors = useThemeColors();
  const { data: bootstrap } = useGymBootstrap();
  const { simpleTraining } = useFlags();
  const activeWorkout = useActiveWorkout();
  const next = useRef<Next | null>(null);
  // The form opened from a type chip; `openCount` gives every opening a fresh form.
  const [form, setForm] = useState<{ workoutType: WorkoutType; openCount: number } | null>(null);
  const openCount = useRef(0);

  const days = [...(bootstrap?.activeRoutine?.days ?? [])].sort((a, b) => a.position - b.position);
  const dayOptions = [
    ...days.map((day) => ({ value: day.id, label: day.name, testID: `log-workout-day-${day.id}` })),
    { value: FREESTYLE, label: 'Freestyle', testID: 'log-workout-day-freestyle' },
  ];
  const choose = (choice: Next) => {
    next.current = choice;
    onClose();
  };

  const onExited = () => {
    const choice = next.current;
    next.current = null;
    if (!choice) return;
    if (choice.kind === 'href') router.push(choice.href);
    else {
      openCount.current += 1;
      setForm({ workoutType: choice.workoutType, openCount: openCount.current });
    }
  };

  const startNow = () => {
    if (!activeWorkout.isActive) activeWorkout.start({ kind: 'freestyle' });
    else activeWorkout.resume();
    choose({ kind: 'href', href: '/gym/workout' });
  };

  return (
    <>
      <Sheet
        visible={visible}
        onClose={onClose}
        onExited={onExited}
        eyebrow="Today"
        title="Log a workout"
        testID="log-workout-sheet"
      >
        <View className="gap-4 pb-4">
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <Icon name="barbell" color={colors.brand} />
              <Text accessibilityRole="header" className="text-headline font-semibold text-label">
                Gym workout you did
              </Text>
            </View>
            <ChipGroup
              options={dayOptions}
              value={[]}
              onChange={(values) => {
                const picked = values[0];
                if (picked)
                  choose({ kind: 'href', href: logHref(picked === FREESTYLE ? null : picked) });
              }}
            />
          </View>
          <View className="h-px bg-separator" />
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <Icon name="activity" color={colors.brand} />
              <Text accessibilityRole="header" className="text-headline font-semibold text-label">
                Done elsewhere
              </Text>
            </View>
            <WorkoutTypeChips
              testID="log-workout-pick"
              value={undefined}
              includeStrength={simpleTraining}
              onChange={(picked) => {
                if (picked) choose({ kind: 'form', workoutType: picked });
              }}
            />
          </View>
          <View className="h-px bg-separator" />
          <Button testID="log-workout-start-now" variant="secondary" onPress={startNow}>
            {activeWorkout.isActive ? 'Resume your workout' : 'Start a freestyle workout now'}
          </Button>
        </View>
      </Sheet>
      {bootstrap ? (
        <Sheet
          visible={form !== null}
          onClose={() => setForm(null)}
          title="Log a workout"
          eyebrow="Done elsewhere or earlier"
          testID="log-workout-form-sheet"
        >
          {form ? (
            <LoggedWorkoutForm
              key={form.openCount}
              bootstrap={bootstrap}
              initialType={form.workoutType}
              onDone={() => setForm(null)}
            />
          ) : null}
        </Sheet>
      ) : null}
    </>
  );
}
