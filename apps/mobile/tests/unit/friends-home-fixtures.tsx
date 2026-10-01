import { act } from '@testing-library/react-native';
import type { ActivityItemDto, FriendUserSummary } from '@chefer/types';
import { availableHandlers, meDto, person, type Handlers } from './friends-core-harness';

// Fixtures shared by the friends-home-* tests (F2.1): a handful of named
// people, the `friends.*` handlers of a Following home, and `settle()`.

const NAMES: readonly [string, string][] = [
  ['Andrei', 'Ionescu'],
  ['Elena', 'Radu'],
  ['Chris', 'Stan'],
  ['Dana', 'Moldovan'],
  ['Maria', 'Pop'],
  ['Victor', 'Dumitru'],
  ['Ioana', 'Marin'],
];

export const personId = (n: number): string => `cperson${String(n).padStart(17, '0')}`;

export function who(n: number, overrides: Partial<FriendUserSummary> = {}): FriendUserSummary {
  const [first, last] = NAMES[n % NAMES.length] ?? ['Test', 'User'];
  return person({
    id: personId(n),
    firstName: first,
    displayName: `${first} ${last}`,
    ...overrides,
  });
}

export function page<T>(items: T[], extra: Record<string, unknown> = {}, nextCursor?: string) {
  return { items, nextCursor: nextCursor ?? null, ...extra };
}

export function activityItem(
  n: number,
  kind: ActivityItemDto['kind'],
  overrides: Partial<ActivityItemDto> = {},
  actor: Partial<FriendUserSummary> = {},
): ActivityItemDto {
  return {
    id: `cactivity${String(n).padStart(15, '0')}`,
    kind,
    actor: who(n, actor),
    createdAt: new Date(Date.now() - n * 3_600_000),
    readAt: null,
    ...(kind === 'FOLLOW_REQUEST' ? { requestState: 'pending' as const } : {}),
    ...overrides,
  };
}

/** The Following home's handlers; override any path. Lists are empty by default. */
export function homeHandlers(overrides: Handlers = {}, me = meDto()): Handlers {
  return {
    ...availableHandlers(me),
    'friends.requests': () => page([], { total: 0 }),
    'friends.following': () => page([], { total: 0 }),
    'friends.followers': () => page([], { total: 0 }),
    'friends.suggestions': () => [],
    ...overrides,
  };
}

/** Let queries settle (availability → me → lists). */
export async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
