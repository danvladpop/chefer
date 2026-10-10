import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router, type Href } from 'expo-router';
import { ACTIVITY_PRESETS } from '@chefer/types';
import { Button, ChipGroup, Sheet, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../components/icon';
import { localDate } from '../gym/offline/ids';
import { ActivityForm } from '../gym/today/log-activity-sheet';
import { useActiveWorkout } from '../gym/use-active-workout';
import { useGymBootstrap } from '../gym/use-gym-bootstrap';

// "Log a workout" (10 Oct redesign; board LogWorkoutSheet). One sheet reached
// from Today (next to Cook now), the Add sheet and Train, so logging training
// is as close as logging food:
//  - a gym day you already did → log mode for today (`/gym/workout?log=…`),
//    the same screen the old "Log a workout you already did" link opened;
//  - an activity done elsewhere → the existing activity form, with the tapped
//    activity preselected (opened once this sheet has gone: iOS shows one
//    modal at a time);
//  - start a freestyle workout now (or resume the one already running).

type Next = { kind: 'href'; href: Href } | { kind: 'activity'; presetKey: string };

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
}

export function LogWorkoutSheet({ visible, onClose }: LogWorkoutSheetProps) {
  const colors = useThemeColors();
  const { data: bootstrap } = useGymBootstrap();
  const activeWorkout = useActiveWorkout();
  const next = useRef<Next | null>(null);
  // The activity form opened from a chip; `openCount` gives every opening a fresh form.
  const [activity, setActivity] = useState<{ presetKey: string; openCount: number } | null>(null);
  const openCount = useRef(0);

  const days = [...(bootstrap?.activeRoutine?.days ?? [])].sort((a, b) => a.position - b.position);
  const dayOptions = [
    ...days.map((day) => ({ value: day.id, label: day.name, testID: `log-workout-day-${day.id}` })),
    { value: FREESTYLE, label: 'Freestyle', testID: 'log-workout-day-freestyle' },
  ];
  const activityOptions = ACTIVITY_PRESETS.map((preset) => ({
    value: preset.key,
    label: preset.label,
    testID: `log-workout-activity-${preset.key}`,
  }));

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
      setActivity({ presetKey: choice.presetKey, openCount: openCount.current });
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
                Activity
              </Text>
            </View>
            <ChipGroup
              options={activityOptions}
              value={[]}
              onChange={(values) => {
                const picked = values[0];
                if (picked) choose({ kind: 'activity', presetKey: picked });
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
          visible={activity !== null}
          onClose={() => setActivity(null)}
          title="Log an activity"
          eyebrow="Done elsewhere"
          testID="log-activity-sheet"
        >
          {activity ? (
            <ActivityForm
              key={activity.openCount}
              bootstrap={bootstrap}
              initialPresetKey={activity.presetKey}
              onDone={() => setActivity(null)}
            />
          ) : null}
        </Sheet>
      ) : null}
    </>
  );
}
