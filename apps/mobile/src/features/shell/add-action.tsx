import { useRef, useState } from 'react';
import { router, type Href } from 'expo-router';
import { IconButton, ListRow, ListSection, Sheet, useThemeColors } from '@chefer/ui-mobile';
import { localDateStr } from '@chefer/utils';
import { Icon, type IconName } from '../../components/icon';
import { trpc } from '../../lib/trpc';
import { QuickAddSheet } from '../tracker/quick-add-sheet';

// ─── Add (plan: "Today → the Add button") ──────────────────────────────────
// One header button replaces Today's stacked Quick add button and Snap card:
// every way of putting food into the day sits in one short sheet, the way
// MyFitnessPal and Apple Health keep "add" behind a single +. Searching opens
// the existing quick-add sheet once this one has gone (iOS presents one
// modal at a time); the rest are pushes into the tracker or the cookbook.

type AddChoice = { key: string; title: string; subtitle: string; icon: IconName } & (
  | { href: Href }
  | { quickAdd: true }
);

const CHOICES: readonly AddChoice[] = [
  {
    key: 'search',
    title: 'Search foods',
    subtitle: 'A food, a recipe or something you had before',
    icon: 'search',
    quickAdd: true,
  },
  {
    key: 'snap',
    title: 'Snap a meal',
    subtitle: 'Take a photo and the chef estimates it',
    icon: 'camera',
    href: '/tracker?snap=1',
  },
  {
    key: 'copy',
    title: 'Copy yesterday',
    subtitle: 'Log everything you ate yesterday again',
    icon: 'copy',
    href: '/tracker?copy=1',
  },
  {
    key: 'recipe',
    title: 'Save a recipe',
    subtitle: 'From a link, a photo or by hand',
    icon: 'recipes',
    href: '/import-recipe',
  },
];

/** Today's header + button and the sheet it opens. Self-contained. */
export function AddAction() {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
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
        <ListSection className="mb-4">
          {CHOICES.map((choice) => (
            <ListRow
              key={choice.key}
              testID={`add-${choice.key}`}
              title={choice.title}
              subtitle={choice.subtitle}
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
    </>
  );
}

/** Ask Chef, the header button every food tab root carries. */
export function AskChefAction() {
  const colors = useThemeColors();
  return (
    <IconButton
      testID="shell-ask-chef"
      accessibilityLabel="Ask the chef"
      variant="tinted"
      icon={<Icon name="chef" color={colors.brand} />}
      onPress={() => router.push('/chat')}
    />
  );
}
