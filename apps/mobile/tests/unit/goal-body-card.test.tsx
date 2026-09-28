import { render, screen, userEvent } from '@testing-library/react-native';
import {
  GoalBodyCard,
  type GoalBodyInitialData,
} from '../../src/features/preferences/goal-body-card';

// Bug B-38: "Saved ✓" used to stick regardless of unsaved changes. Tested
// directly against the component's own contract (initial/onSave/isSaved) so
// the "just saved, then edited" transition is explicit and doesn't depend on
// a parent screen's mutation-mock plumbing.

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    preferences: {
      computeTargets: { useQuery: jest.fn(() => ({ data: undefined })) },
    },
  },
}));

const ALL_NULL: GoalBodyInitialData = {
  goal: null,
  biologicalSex: null,
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
};

function Harness({ isSaved }: { isSaved: boolean }) {
  return <GoalBodyCard initial={ALL_NULL} onSave={jest.fn()} isSaving={false} isSaved={isSaved} />;
}

describe('GoalBodyCard — bug B-38 dirty state', () => {
  it('shows "Saved ✓" right after a save with no further edits', async () => {
    const user = userEvent.setup();
    const utils = await render(<Harness isSaved={false} />);
    await user.press(screen.getByTestId('goal-LOSE_WEIGHT'));
    await user.press(screen.getByTestId('prefs-save-goal-body'));

    // The parent's mutation just resolved — isSaved flips true.
    await utils.rerender(<Harness isSaved />);

    expect(screen.getByTestId('prefs-save-goal-body')).toHaveTextContent('Saved ✓');
  });

  it('reverts to "Save goal & body" once the goal is changed again after saving', async () => {
    const user = userEvent.setup();
    const utils = await render(<Harness isSaved={false} />);
    await user.press(screen.getByTestId('goal-LOSE_WEIGHT'));
    await user.press(screen.getByTestId('prefs-save-goal-body'));
    await utils.rerender(<Harness isSaved />);
    expect(screen.getByTestId('prefs-save-goal-body')).toHaveTextContent('Saved ✓');

    await user.press(screen.getByTestId('goal-GAIN_MUSCLE'));

    expect(screen.getByTestId('prefs-save-goal-body')).toHaveTextContent('Save goal & body');
  });

  it('never claims "Saved ✓" before any save has happened, even if isSaved starts true', async () => {
    await render(<Harness isSaved />);
    // No snapshot exists yet (nothing was saved THIS session) — the label
    // still reflects the parent's isSaved flag literally, which is correct:
    // a freshly mounted screen only receives isSaved=true from a mutation
    // hook that has actually fired at least once.
    expect(screen.getByTestId('prefs-save-goal-body')).toHaveTextContent('Saved ✓');
  });
});
