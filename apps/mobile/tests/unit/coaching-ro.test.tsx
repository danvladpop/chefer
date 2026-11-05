import { render, screen } from '@testing-library/react-native';
import type { ClientWeekSummaryDto, CoachingNoticeDto } from '@chefer/types';
import { ConsentScreen } from '../../src/features/coaching/join/consent-screen';
import { clientNoticeTitle } from '../../src/features/coaching/notices/coaching-notices';
import { clientRowLabel } from '../../src/features/trainer/components/client-row';
import { weekSummaryLinesT } from '../../src/features/trainer/data-lines';
import { formatCoachedSet, rirText } from '../../src/features/trainer/format';
import { trainerNoticeTitle } from '../../src/features/trainer/home/trainer-notices';
import { turnOffBody } from '../../src/features/trainer/home/use-turn-off-trainer-tools';
import { getTranslator, resetLocaleForTests } from '../../src/lib/i18n';
import { clientRow } from './trainer-fixtures';

// Lane J phase 4: trainer coaching in Romanian — the consent screen, the client and trainer notice
// lines, a client row's spoken label, the logged-set lines and the trainer's "Last 7 days" lines.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

function notice(overrides: Partial<CoachingNoticeDto>): CoachingNoticeDto {
  return {
    id: 'n1',
    kind: 'ROUTINE_UPDATED',
    at: '2026-10-02T10:00:00.000Z',
    read: false,
    other: { id: 'u1', name: 'Ana', role: 'TRAINER' },
    ...overrides,
  };
}

describe('coaching in Romanian', () => {
  beforeEach(() => resetLocaleForTests(['ro-RO']));
  afterAll(() => resetLocaleForTests(['en-US']));

  it('the consent screen reads the legal lines in Romanian', async () => {
    await render(
      <ConsentScreen
        trainerName="Ana"
        currentTrainerName="Ion"
        busy={false}
        offline={false}
        error={null}
        onAllow={() => undefined}
        onDecline={() => undefined}
      />,
    );
    expect(screen.getByText('Ana vrea să te antreneze în Chefer.')).toBeOnTheScreen();
    expect(screen.getByText('Rutina ta activă.')).toBeOnTheScreen();
    expect(screen.getByText('Ion nu te va mai antrena.')).toBeOnTheScreen();
    expect(screen.getByText('Treci la Ana')).toBeOnTheScreen();
  });

  it('notice lines on both sides', () => {
    expect(clientNoticeTitle(notice({ kind: 'REQUEST_ACCEPTED' }))).toBe(
      'Ana este acum antrenorul tău',
    );
    expect(
      trainerNoticeTitle(
        notice({
          kind: 'COACHING_ENDED',
          endedBy: 'CLIENT',
          other: { id: 'c1', name: 'Maria', role: 'CLIENT' },
        }),
      ),
    ).toBe('Maria a renunțat. Își păstrează rutina.');
  });

  it('a client row, sets and the turn-off confirmation', () => {
    expect(clientRowLabel(clientRow({ inactiveDays: 2 }))).toContain(
      'Ultimul antrenament: Mie 30 sept.',
    );
    expect(formatCoachedSet({ weightKg: 60, reps: 8, completed: false, isWarmup: false })).toBe(
      '60 kg × 8 (neterminată)',
    );
    expect(rirText(3)).toBe('Ultima serie: 3+ repetări în rezervă');
    expect(turnOffBody(20)).toMatch(/^Cei 20 de clienți ai tăi nu te mai au ca antrenor/);
  });

  it('the trainer’s last-7-days lines', () => {
    const summary: ClientWeekSummaryDto = {
      from: '2026-10-20',
      to: '2026-10-26',
      workouts: { done: 3, goal: 4 },
      sharing: { food: true, weight: false },
      food: {
        numbers: 'PROTEIN_ONLY',
        daysLogged: 1,
        mealsLogged: 2,
        avgKcal: null,
        avgProteinG: 110,
        targetKcal: null,
        targetProteinG: 125,
        planAdherence: null,
      },
      weight: null,
    };
    const lines = weekSummaryLinesT(
      summary,
      'Maria',
      { weightKg: (kg) => `${kg} kg`, date: (d) => d },
      getTranslator(),
    );
    expect(lines.workouts).toBe('3 din 4 antrenamente');
    expect(lines.food).toEqual([
      'Mâncare înregistrată în 1 din 7 zile',
      'Maria ascunde caloriile în Chefer.',
      '110 din 125 g proteine pe zi',
      'Niciun plan de mese săptămâna aceasta',
    ]);
  });
});
