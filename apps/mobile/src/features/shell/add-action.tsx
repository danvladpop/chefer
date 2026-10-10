import { useRef, useState } from 'react';
import { router, type Href } from 'expo-router';
import {
  haptics,
  IconButton,
  ListRow,
  ListSection,
  PressableScale,
  Sheet,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { localDateStr } from '@chefer/utils';
import { Icon, type IconName } from '../../components/icon';
import { trpc } from '../../lib/trpc';
import { QuickAddSheet } from '../tracker/quick-add-sheet';
import { LogWorkoutSheet } from './log-workout-sheet';

// ─── Add (plan: "Today → the Add button") ──────────────────────────────────
// One header button replaces Today's stacked Quick add button and Snap card:
// every way of putting food into the day sits in one short sheet, the way
// MyFitnessPal and Apple Health keep "add" behind a single +. Searching opens
// the existing quick-add sheet once this one has gone (iOS presents one
// modal at a time); the rest are pushes into the tracker or the cookbook.
// 10 Oct redesign: titles only (less text), and a Training group with "Log a
// workout", which opens the shared Log a workout sheet the same way.

type AddChoice = { key: string; title: string; icon: IconName } & (
  | { href: Href }
  | { quickAdd: true }
  | { logWorkout: true }
);

const CHOICES: readonly AddChoice[] = [
  {
    key: 'search',
    title: 'Search foods',
    icon: 'search',
    quickAdd: true,
  },
  {
    key: 'snap',
    title: 'Snap a meal',
    icon: 'camera',
    href: '/tracker?snap=1',
  },
  {
    key: 'copy',
    title: 'Copy yesterday',
    icon: 'copy',
    href: '/tracker?copy=1',
  },
  {
    key: 'recipe',
    title: 'Save a recipe',
    icon: 'recipes',
    href: '/import-recipe',
  },
];

const TRAINING_CHOICES: readonly AddChoice[] = [
  { key: 'workout', title: 'Log a workout', icon: 'barbell', logWorkout: true },
];

/** Today's header + button and the sheet it opens. Self-contained. */
export function AddAction() {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [logWorkoutOpen, setLogWorkoutOpen] = useState(false);
  // What to do once the sheet has fully gone (a push or the next modal).
  const next = useRef<AddChoice | null>(null);

  const choose = (choice: AddChoice) => {
    next.current = choice;
    setOpen(false);
  };

  const onExited = () => {
    const choice = next.current;
    next.current = null;
    if (!choice) return;
    if ('quickAdd' in choice) setQuickAddOpen(true);
    else if ('logWorkout' in choice) setLogWorkoutOpen(true);
    else router.push(choice.href);
  };

  return (
    <>
      <IconButton
        testID="shell-add"
        accessibilityLabel="Add food"
        variant="filled"
        icon={<Icon name="add" color={colors.onBrand} size={26} />}
        onPress={() => setOpen(true)}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        onExited={onExited}
        title="Add to today"
        testID="add-sheet"
      >
        <ListSection title="Food" className="mb-3">
          {CHOICES.map((choice) => (
            <ListRow
              key={choice.key}
              testID={`add-${choice.key}`}
              title={choice.title}
              icon={<Icon name={choice.icon} color={colors.brand} />}
              onPress={() => choose(choice)}
            />
          ))}
        </ListSection>
        <ListSection title="Training" className="mb-4">
          {TRAINING_CHOICES.map((choice) => (
            <ListRow
              key={choice.key}
              testID={`add-${choice.key}`}
              title={choice.title}
              icon={<Icon name={choice.icon} color={colors.brand} />}
              onPress={() => choose(choice)}
            />
          ))}
        </ListSection>
      </Sheet>
      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        date={localDateStr()}
        onLogged={() => {
          void utils.dashboard.summary.invalidate();
          void utils.tracker.getDay.invalidate();
        }}
      />
      <LogWorkoutSheet visible={logWorkoutOpen} onClose={() => setLogWorkoutOpen(false)} />
    </>
  );
}

/**
 * Ask Chef: the one AI assistant, in the same top-bar spot on every tab
 * (10 Oct redesign). A labelled pill rather than a bare glyph so it reads as
 * a feature, not a decoration. MO-01 press feedback via PressableScale.
 */
export function AskChefAction() {
  const colors = useThemeColors();
  return (
    <PressableScale
      testID="shell-ask-chef"
      accessibilityRole="button"
      accessibilityLabel="Ask the chef"
      hitSlop={4}
      onPress={() => {
        haptics.selection();
        router.push('/chat');
      }}
      className="min-h-11 flex-row items-center gap-1.5 rounded-full bg-brand-tint pl-3 pr-3.5"
    >
      <Icon name="chef" color={colors.brand} size={20} />
      <Text className="text-callout font-semibold text-brand">Ask Chef</Text>
    </PressableScale>
  );
}
