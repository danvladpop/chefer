// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { I18nProvider } from '@/lib/i18n';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from '@chefer/i18n';
import type { ClientRowDto, ClientWeekSummaryDto } from '@chefer/types';
import { ClientList } from '../trainer/components/ClientList';
import { weekSummaryLinesT } from '../trainer/data-lines';
import { ConsentScreen } from './components/ConsentScreen';
import { checkInAnswersLineT, editorLabelT, routineChangesLineT } from './lib/copy';
import { formatDayWithWeekdayT, formatShortDayT } from './lib/dates';
import { clientNoticeView } from './lib/notice-view';

// Lane J phase 4: the coaching screens and lines in Romanian.

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const ro = createTranslator('ro');

function inRomanian(ui: React.ReactNode) {
  return render(
    <I18nProvider initialChoice="ro" deviceTags={[]}>
      {ui}
    </I18nProvider>,
  );
}

describe('coaching in Romanian', () => {
  it('the consent screen', () => {
    inRomanian(
      <ConsentScreen
        trainerName="Ana"
        currentTrainerName="Ion"
        busy={false}
        error={null}
        onAllow={() => undefined}
        onDecline={() => undefined}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ana vrea să te antreneze în Chefer.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Rutina ta activă.')).toBeInTheDocument();
    expect(screen.getByTestId('coaching-switch-line')).toHaveTextContent(
      'Ion nu te va mai antrena.',
    );
    expect(screen.getByRole('button', { name: 'Treci la Ana' })).toBeInTheDocument();
  });

  it('the clients list', () => {
    const maria: ClientRowDto = {
      clientId: 'c1',
      name: 'Maria Popescu',
      since: '2026-09-20T09:00:00.000Z',
      label: null,
      lastWorkoutDate: '2026-09-30',
      week: { sessions: 2, goal: 3 },
      inactiveDays: 4,
      routineChangedByClientAt: null,
    };
    inRomanian(<ClientList clients={[maria]} />);
    const row = screen.getByTestId('trainer-client-row');
    expect(within(row).getByText('Ultimul antrenament: Mie 30 sept.')).toBeInTheDocument();
    expect(within(row).getByText('2 / 3 săptămâna aceasta')).toBeInTheDocument();
  });

  it('dates, stamps, changes and check-in answers', () => {
    expect(formatShortDayT('2026-10-02', ro.t)).toBe('2 oct.');
    expect(formatDayWithWeekdayT('2026-09-30', ro.t)).toBe('Mie 30 sept.');
    expect(editorLabelT({ name: 'Ana', former: true }, ro.t)).toBe('Ana (fost antrenor)');
    expect(editorLabelT({ name: 'your trainer', former: true }, ro.t)).toBe('un fost antrenor');
    expect(
      routineChangesLineT(
        [
          { kind: 'added', exercise: 'Fandări' },
          { kind: 'note', exercise: 'Genuflexiuni' },
          { kind: 'schedule' },
        ],
        ro.t,
        2,
      ),
    ).toBe('+ Fandări · notiță la Genuflexiuni · + încă 1');
    expect(checkInAnswersLineT(['ENERGY', 'SLEEP'], { ENERGY: 3, SLEEP: 4 }, ro.t)).toBe(
      'Energie 3/5 · Somn 4/5',
    );
  });

  it('a client notice', () => {
    const view = clientNoticeView(
      {
        id: 'n1',
        kind: 'REQUEST_DECLINED',
        at: '2026-10-02T10:00:00.000Z',
        read: false,
        other: { id: 't1', name: 'Ana', role: 'TRAINER' },
      },
      'Europe/Bucharest',
      ro.t,
    );
    expect(view?.text).toBe('Ana nu te poate prelua acum');
  });

  it('the trainer’s last-7-days lines, with Romanian plurals and numbers', () => {
    const summary: ClientWeekSummaryDto = {
      from: '2026-10-20',
      to: '2026-10-26',
      workouts: { done: 2, goal: 20 },
      sharing: { food: true, weight: false },
      food: {
        numbers: 'FULL',
        daysLogged: 5,
        mealsLogged: 14,
        avgKcal: 1850,
        avgProteinG: 110,
        targetKcal: 2000,
        targetProteinG: 125,
        planAdherence: 0.75,
      },
      weight: null,
    };
    const lines = weekSummaryLinesT(
      summary,
      'Maria',
      { weightKg: (kg) => `${kg} kg`, date: (d) => d },
      ro,
    );
    expect(lines.workouts).toBe('2 din 20 de antrenamente');
    expect(lines.food).toEqual([
      'Mâncare înregistrată în 5 din 7 zile',
      '1.850 din 2.000 kcal pe zi',
      '110 din 125 g proteine pe zi',
      '75% din mesele planificate, mâncate conform planului',
    ]);
  });
});
