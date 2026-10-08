import { readFileSync } from 'fs';
import { join } from 'path';
import * as RN from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { ONBOARDING_COPY } from '../../src/features/onboarding/copy';
import {
  HowYouCookStep,
  type HowYouCookStepProps,
} from '../../src/features/onboarding/how-you-cook-step';
import {
  trainingDaysCountLabel,
  TrainingDaysStep,
} from '../../src/features/onboarding/training-days-step';
import { GoalBodyCard } from '../../src/features/preferences/goal-body-card';
import { GOALS } from '../../src/features/preferences/types';

// UX-ONB-10 (onboarding nits) and the Preferences half of UX-ONB-05.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Link: ({ children }: { children: React.ReactNode }) => children,
  useLocalSearchParams: () => ({}),
}));
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    preferences: { computeTargets: { useQuery: jest.fn(() => ({ data: undefined })) } },
    mealPlan: {
      getShape: {
        useQuery: () => ({
          data: {
            slots: ['dinner'],
            days: [0, 1],
            timeCapMins: null,
            weekendNoLimit: false,
            cookingFor: null,
            leftovers: false,
          },
        }),
      },
    },
    household: { list: { useQuery: () => ({ data: [] }) } },
  },
}));

type Updater = (prev: HowYouCookStepProps['value']) => HowYouCookStepProps['value'];

describe('Training days nits (UX-ONB-10)', () => {
  it('pluralises the count: 0 days, 1 day, 2 days', () => {
    expect(trainingDaysCountLabel(0)).toBe('0 days a week');
    expect(trainingDaysCountLabel(1)).toBe('1 day a week');
    expect(trainingDaysCountLabel(2)).toBe('2 days a week');
  });

  it('asks about runs only — there is no ride option', () => {
    expect(ONBOARDING_COPY.trainingDaysRunQuestion).not.toMatch(/ride/i);
  });

  it('renders all seven weekday chips in one row, and toggles them', async () => {
    const user = userEvent.setup();
    const onWeekdaysChange = jest.fn();
    await render(
      <TrainingDaysStep
        weekdays={[0]}
        onWeekdaysChange={onWeekdaysChange}
        dayKinds={{}}
        onDayKindsChange={jest.fn()}
        onNotSure={jest.fn()}
      />,
    );
    for (let day = 0; day < 7; day++) {
      expect(screen.getByTestId(`training-days-${day}`)).toBeTruthy();
    }
    expect(screen.getByTestId('training-days-count')).toHaveTextContent('1 day a week');
    await user.press(screen.getByTestId('training-days-6'));
    expect(onWeekdaysChange).toHaveBeenCalledWith([0, 6]);
    await user.press(screen.getByTestId('training-days-0'));
    expect(onWeekdaysChange).toHaveBeenCalledWith([]);
  });
});

describe('Training days weekday rows (UX-ONB-10)', () => {
  function renderStep() {
    return render(
      <TrainingDaysStep
        weekdays={[]}
        onWeekdaysChange={jest.fn()}
        dayKinds={{}}
        onDayKindsChange={jest.fn()}
        onNotSure={jest.fn()}
      />,
    );
  }
  afterEach(() => jest.restoreAllMocks());

  it('is one row of seven on a normal phone', async () => {
    jest
      .spyOn(RN.Dimensions, 'get')
      .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
    await renderStep();
    expect(screen.getByTestId('training-days-weekdays').children).toHaveLength(1);
  });

  it('is 4 + 3 — never 6 + 1 — on a very narrow screen', async () => {
    jest
      .spyOn(RN.Dimensions, 'get')
      .mockReturnValue({ width: 320, height: 568, scale: 2, fontScale: 1 });
    await renderStep();
    expect(screen.getByTestId('training-days-weekdays').children).toHaveLength(2);
  });
});

describe('How you cook nits (UX-ONB-10, UX-ONB-04)', () => {
  const VALUE = {
    shape: {
      slots: ['dinner' as const],
      days: [0, 1],
      timeCapMins: null,
      weekendNoLimit: false,
      cookingFor: null,
      leftovers: false,
    },
    currency: 'EUR' as const,
    units: 'METRIC' as const,
    autoPlanWeekly: false,
  };

  it('tints every Switch with the brand colour, not the platform teal', () => {
    // A rendered Switch does not expose trackColor in the test renderer, so guard the source.
    const source = readFileSync(
      join(__dirname, '../../src/features/onboarding/how-you-cook-step.tsx'),
      'utf8',
    );
    const switches = source.match(/<Switch\b[^>]*>/gs) ?? [];
    expect(switches).toHaveLength(2);
    for (const tag of switches) expect(tag).toContain('trackColor={SWITCH_TRACK}');
    expect(source).toMatch(/SWITCH_TRACK = \{ true: colors\.primary, false: colors\.neutral \}/);
  });

  it('never rewrites the units or currency itself — the wizard owns the region default', async () => {
    const onChange = jest.fn();
    await render(<HowYouCookStep value={VALUE} onChange={onChange} isPremium={false} />);
    for (const [change] of onChange.mock.calls as [HowYouCookStepProps['value'] | Updater][]) {
      const next = typeof change === 'function' ? change(VALUE) : change;
      expect(next.units).toBe('METRIC');
      expect(next.currency).toBe('EUR');
    }
  });
});

describe('Goal cards use Ionicons, not emoji (UX-ONB-10)', () => {
  it('every goal icon is an icon name', () => {
    for (const goal of GOALS) expect(goal.icon).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe('GoalBodyCard in the saved units (UX-ONB-05)', () => {
  const EMPTY = {
    goal: null,
    biologicalSex: null,
    age: null,
    heightCm: null,
    weightKg: null,
    activityLevel: null,
  };

  it('imperial: feet + inches and lb, saved as cm / kg', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    await render(
      <GoalBodyCard
        initial={EMPTY}
        units="IMPERIAL"
        onSave={onSave}
        isSaving={false}
        isSaved={false}
      />,
    );
    expect(screen.getByText('Height (ft, in)')).toBeTruthy();
    await user.type(screen.getByTestId('metrics-height'), '5');
    await user.type(screen.getByTestId('metrics-height-in'), '10');
    await user.type(screen.getByTestId('metrics-weight'), '165');
    await user.press(screen.getByTestId('prefs-save-goal-body'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const [payload] = onSave.mock.calls[0] as [{ heightCm: number; weightKg: number }];
    expect(payload.heightCm).toBe(177.8);
    expect(payload.weightKg).toBeCloseTo(74.84, 1);
  });

  it('shows saved metric values in the saved imperial units', async () => {
    await render(
      <GoalBodyCard
        initial={{ ...EMPTY, heightCm: 177.8, weightKg: 75 }}
        units="IMPERIAL"
        onSave={jest.fn()}
        isSaving={false}
        isSaved={false}
      />,
    );
    expect(screen.getByTestId('metrics-height')).toHaveDisplayValue('5');
    expect(screen.getByTestId('metrics-height-in')).toHaveDisplayValue('10');
    expect(screen.getByTestId('metrics-weight')).toHaveDisplayValue('165.3');
  });

  it('metric: "1,80" is flagged and Save does nothing; 180 saves', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();
    await render(<GoalBodyCard initial={EMPTY} onSave={onSave} isSaving={false} isSaved={false} />);
    await user.type(screen.getByTestId('metrics-height'), '1,80');
    await user.type(screen.getByTestId('metrics-weight'), '8');
    expect(screen.getByTestId('metrics-height-error')).toBeTruthy();
    expect(screen.getByTestId('metrics-weight-error')).toBeTruthy();
    expect(screen.getByTestId('prefs-save-goal-body')).toBeDisabled();
    await user.press(screen.getByTestId('prefs-save-goal-body'));
    expect(onSave).not.toHaveBeenCalled();

    await user.clear(screen.getByTestId('metrics-height'));
    await user.type(screen.getByTestId('metrics-height'), '180');
    await user.clear(screen.getByTestId('metrics-weight'));
    await user.type(screen.getByTestId('metrics-weight'), '80');
    await user.press(screen.getByTestId('prefs-save-goal-body'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ heightCm: 180, weightKg: 80 }));
  });
});
