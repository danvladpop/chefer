import type { ReactNode } from 'react';
import { EmptyState, ErrorState, Screen, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { useCoachingAvailability } from '../../trainer/api/use-coaching-availability';
import { TRAINER_SCREEN_CLASS, TrainerHeader } from '../../trainer/components/trainer-header';
import { COACHING_MOBILE_COPY } from '../copy';

// The client-side coaching routes (Find a trainer, a trainer's card) ask `coaching.availability` first,
// like Your trainer: pending → blank, unreachable → Retry, off → "Coaching isn’t available right now."
// Children mount (and run their own `coaching.*` queries) only once it said yes.

export const COACHING_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = [
  'top',
  'bottom',
  'left',
  'right',
];

export function CoachingGate({
  testID,
  title,
  children,
}: {
  testID: string;
  title: string;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  const { enabled, isLoading, unreachable, retry } = useCoachingAvailability();
  const header = <TrainerHeader testID={`${testID}-header`} title={title} />;
  if (isLoading) {
    return (
      <Screen
        edges={COACHING_EDGES}
        className={TRAINER_SCREEN_CLASS}
        testID={`${testID}-loading`}
      />
    );
  }
  if (unreachable) {
    return (
      <Screen edges={COACHING_EDGES} className={TRAINER_SCREEN_CLASS}>
        {header}
        <ErrorState testID={`${testID}-gate-error`} onRetry={retry} />
      </Screen>
    );
  }
  if (!enabled) {
    return (
      <Screen
        edges={COACHING_EDGES}
        className={TRAINER_SCREEN_CLASS}
        testID={`${testID}-unavailable`}
      >
        {header}
        <EmptyState
          icon={<Icon name="yourTrainer" color={colors.labelTertiary} size={40} />}
          title={COACHING_MOBILE_COPY.unavailable}
        />
      </Screen>
    );
  }
  return <>{children}</>;
}
