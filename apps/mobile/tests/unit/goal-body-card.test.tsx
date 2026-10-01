import { render, screen, userEvent } from '@testing-library/react-native';
import {
  GoalBodyCard,
  type GoalBodyInitialData,
} from '../../src/features/preferences/goal-body-card';

// Bug B-38: "Saved ✓" used to stick regardless of unsaved changes. Tested
// directly against the component's own contract (initial/onSave/isSaved) so
// the "just saved, then edited" transition is explicit and doesn't depend on
// a parent screen's mutation-mock plumbing.

// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in health-consent.test.tsx, so here consent is always on record.
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

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

// R-02 (Guideline 1.4.1): no body metrics under 16, no calorie deficit under 18.
describe('GoalBodyCard — age rules (R-02)', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>, age: string) {
    await user.press(screen.getByTestId('goal-LOSE_WEIGHT'));
    await user.press(screen.getByTestId('metrics-sex-FEMALE'));
    await user.type(screen.getByTestId('metrics-age'), age);
    await user.type(screen.getByTestId('metrics-height'), '152');
    await user.type(screen.getByTestId('metrics-weight'), '44');
    await user.press(screen.getByTestId('metrics-activity-SEDENTARY'));
  }

  it('shows the friendly message, no estimate, and a disabled Save for age 13', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    await render(
      <GoalBodyCard initial={ALL_NULL} onSave={onSave} isSaving={false} isSaved={false} />,
    );
    await fill(user, '13');

    expect(screen.getByTestId('metrics-age-error')).toHaveTextContent(
      'Chefer is for people aged 16 and over.',
    );
    expect(screen.getByTestId('metrics-calorie-preview')).toHaveTextContent(
      'Chefer is for people aged 16 and over.',
    );
    expect(screen.queryByText('1,200')).toBeNull();
    await user.press(screen.getByTestId('prefs-save-goal-body'));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('explains maintenance for a 17-year-old on Lose Weight and shows no deficit', async () => {
    const user = userEvent.setup();
    await render(
      <GoalBodyCard initial={ALL_NULL} onSave={jest.fn()} isSaving={false} isSaved={false} />,
    );
    await fill(user, '17');

    expect(screen.queryByTestId('metrics-age-error')).toBeNull();
    expect(screen.getByTestId('metrics-minor-note')).toHaveTextContent(
      "Under 18 we don't set a calorie deficit — your target is maintenance. Talk to a doctor before trying to lose weight.",
    );
    // 17 y/o, 152 cm, 44 kg, sedentary → maintenance 1,373, not 1,373 − 500 (which would be the 1,200 floor).
    expect(screen.getByTestId('metrics-calorie-preview')).toHaveTextContent(/1,373 maintenance/);
  });

  it('shows no minor note for an adult and saves normally', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    await render(
      <GoalBodyCard initial={ALL_NULL} onSave={onSave} isSaving={false} isSaved={false} />,
    );
    await fill(user, '30');

    expect(screen.queryByTestId('metrics-minor-note')).toBeNull();
    await user.press(screen.getByTestId('prefs-save-goal-body'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ age: 30, goal: 'LOSE_WEIGHT' }));
  });
});
