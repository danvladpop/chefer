import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { GymBootstrap, SaveGymProfileInput } from '@chefer/types';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { useSaveGymProfile } from '../../src/features/gym/use-save-gym-profile';
import { makeBootstrap, profile } from './gym-fixtures';
import type { createTrpcGymMock } from './gym-trpc-mock';
import { mutationResult } from './gym-trpc-mock';

// UX-GYM-22 (WP-02 lane C): gym settings save optimistically — a second tap
// builds on the first, and a failed save restores exactly what it changed.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- hoisted mock factory
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});

const { trpc } = jest.requireMock<ReturnType<typeof createTrpcGymMock>>('../../src/lib/trpc');

type Options = {
  onMutate: (input: SaveGymProfileInput) => Promise<{ previous: GymBootstrap['profile'] }>;
  onError: (
    error: unknown,
    input: SaveGymProfileInput,
    context: { previous: GymBootstrap['profile'] } | undefined,
  ) => void;
  onSuccess: (profileDto: NonNullable<GymBootstrap['profile']>, input: SaveGymProfileInput) => void;
};

async function setup() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
  let options: Options | undefined;
  trpc.gym.profile.save.useMutation.mockImplementation((opts: Options) => {
    options = opts;
    return mutationResult();
  });
  await renderHook(() => useSaveGymProfile(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  if (!options) throw new Error('useMutation was not called');
  const read = () => queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey)?.profile;
  return { options, read };
}

describe('useSaveGymProfile', () => {
  it('applies the change to the cached profile at once, so the next tap builds on it', async () => {
    const { options, read } = await setup();
    await options.onMutate({ weeklyGoal: 4 });
    expect(read()?.weeklyGoal).toBe(4);
    await options.onMutate({ weeklyGoal: 5, hasDipBelt: true });
    expect(read()).toMatchObject({ weeklyGoal: 5, hasDipBelt: true });
  });

  it('rolls back only the fields a failed save changed', async () => {
    const { options, read } = await setup();
    const first = await options.onMutate({ weeklyGoal: 4 });
    await options.onMutate({ hasDipBelt: true }); // a second, later save
    options.onError(new Error('x'), { weeklyGoal: 4 }, first);

    expect(read()?.weeklyGoal).toBe(profile.weeklyGoal); // restored
    expect(read()?.hasDipBelt).toBe(true); // the other save is untouched
  });

  it("replaces the profile with the server's copy on success", async () => {
    const { options, read } = await setup();
    await options.onMutate({ weeklyGoal: 4 });
    options.onSuccess(
      { ...profile, weeklyGoal: 4, setupCompletedAt: '2026-09-24' },
      { weeklyGoal: 4 },
    );
    expect(read()?.setupCompletedAt).toBe('2026-09-24');
  });
});
