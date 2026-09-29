import { render, screen, userEvent } from '@testing-library/react-native';
import type { WorkoutSessionDoc } from '@chefer/types';
import { localDate } from '../../src/features/gym/offline/ids';
import { ResumeCard } from '../../src/features/gym/today/resume-card';
import { makeBootstrap } from './gym-fixtures';
import { activeDoc } from './gym-workout-helpers';

// T-36.A1.1: the Resume card renders straight off `resumeSummary()` (shared
// with the logger), so these tests exercise its state machine (active /
// paused / backfill / all-logged) rather than re-deriving the summary.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const BOOTSTRAP = makeBootstrap();

function completeAllSets(doc: WorkoutSessionDoc): WorkoutSessionDoc {
  return {
    ...doc,
    exercises: doc.exercises.map((se) => ({
      ...se,
      sets: se.sets.map((s) => ({
        ...s,
        completedAt: s.isWarmup ? s.completedAt : '2026-09-24T09:00:00.000Z',
      })),
    })),
  };
}

/** Device-local "HH:MM", matching resume-card.tsx's own `formatTime` — kept
 * TZ-independent so these tests pass on any machine, not just UTC. */
function localTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Pinned clock: the card reads the real clock (`localDate()`, "tomorrow" label),
// so an unpinned suite rots as the calendar moves. Local noon on Mon 28 Sep 2026
// keeps the pinned day stable in every timezone. `advanceTimers` lets the
// card's elapsed ticker keep running as it would on a device.
const NOW = new Date(2026, 8, 28, 12, 0, 0);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
});

afterEach(() => jest.useRealTimers());

describe('ResumeCard', () => {
  it('active: shows elapsed time, exercise/set progress and the current focus', async () => {
    const session = { ...activeDoc(), localDate: localDate() };
    await render(<ResumeCard bootstrap={BOOTSTRAP} session={session} pausedAt={null} />);

    expect(screen.getByText('WORKOUT IN PROGRESS')).toBeOnTheScreen();
    expect(screen.getByText('Upper A')).toBeOnTheScreen();
    expect(screen.getByText('0 of 1 exercises · 0 of 3 sets')).toBeOnTheScreen();
    expect(screen.getByText('Now: bench · set 1 of 3')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-today-resume-elapsed')).toBeOnTheScreen();
  });

  it('active: Resume routes to the workout screen', async () => {
    const user = userEvent.setup();
    const session = { ...activeDoc(), localDate: localDate() };
    await render(<ResumeCard bootstrap={BOOTSTRAP} session={session} pausedAt={null} />);

    await user.press(screen.getByTestId('gym-today-resume-button'));
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
  });

  it('paused: shows the static minutes-in time, "Next", Finish-with and the keep-until time', async () => {
    const pausedAt = new Date(NOW.getTime() - 10 * 60_000).toISOString(); // paused 10 min ago
    const startedAt = new Date(NOW.getTime() - 33 * 60_000).toISOString(); // 23 min in
    const keepsUntilIso = new Date(NOW.getTime() + (24 * 60 - 10) * 60_000).toISOString(); // +24h
    const session = { ...activeDoc(), localDate: localDate(), startedAt };
    await render(<ResumeCard bootstrap={BOOTSTRAP} session={session} pausedAt={pausedAt} />);

    expect(screen.getByText('WORKOUT PAUSED')).toBeOnTheScreen();
    expect(screen.getByText('23 min in')).toBeOnTheScreen();
    expect(screen.getByText('Next: bench · set 1 of 3')).toBeOnTheScreen();
    expect(screen.getByText('Finish with 3 sets')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-today-resume-keeps-until')).toHaveTextContent(
      `Keeps until ${localTime(keepsUntilIso)} tomorrow`,
    );
  });

  it('backfill: eyebrow reads LOGGING {weekday d Mon} and never ticks', async () => {
    const session = { ...activeDoc(), localDate: '2026-09-20' };
    await render(<ResumeCard bootstrap={BOOTSTRAP} session={session} pausedAt={null} />);

    expect(screen.getByText('LOGGING SUN 20 SEP')).toBeOnTheScreen();
    expect(screen.queryByTestId('gym-today-resume-elapsed')).not.toBeOnTheScreen();
  });

  it('all sets logged: shows the finish copy and the Finish workout button', async () => {
    const session = completeAllSets({ ...activeDoc(), localDate: localDate() });
    await render(<ResumeCard bootstrap={BOOTSTRAP} session={session} pausedAt={null} />);

    expect(screen.getByText('All sets logged · Finish when you’re ready.')).toBeOnTheScreen();
    expect(screen.getByTestId('gym-today-resume-button')).toHaveTextContent('Finish workout');
  });
});
