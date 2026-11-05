import { Text } from 'react-native';
import { screen, waitFor } from '@testing-library/react-native';
import type { ShoppingListSyncDto } from '@chefer/types';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { householdSharingFrom } from '../../src/features/household/sharing/use-household-sharing';
import { isMealSlotConflict } from '../../src/features/household/sharing/use-shared-week';
import { shopOutbox } from '../../src/features/shopping-list/shop-outbox';
import { useSharedListSync } from '../../src/features/shopping-list/use-shared-list-sync';
import { trpc } from '../../src/lib/trpc';
import { makeQueryClient, renderWithTrpc, trpcError } from './friends-core-harness';

// ADR 0003 live list: `shoppingList.sync` answers are merged into the cached list (a key still in the
// outbox keeps its local state), a new revision refetches the list, and "who ticked" comes back.

jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

jest.setTimeout(30_000);

const PLAN = 'plan-1';
const LIST_KEY = [['shoppingList', 'getForWeek'], { input: { weekOffset: 0 }, type: 'query' }];

function listData(checkedKeys: string[]) {
  return { planId: PLAN, hasPlan: true, items: [], checkedKeys };
}

function Probe({ enabled = true }: { enabled?: boolean }) {
  const list = trpc.shoppingList.getForWeek.useQuery({ weekOffset: 0 }, { staleTime: Infinity });
  const checkedBy = useSharedListSync({ weekOffset: 0, planId: PLAN, enabled });
  return (
    <>
      <Text testID="checked">{(list.data?.checkedKeys ?? []).join(',')}</Text>
      <Text testID="who">
        {Object.entries(checkedBy)
          .map(([k, p]) => `${k}:${p.name}`)
          .join(',')}
      </Text>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  shopOutbox.reload();
});
afterAll(() => setKvBackendForTests(undefined));

describe('useSharedListSync', () => {
  it('merges the other phone’s ticks, keeps a pending local tick, and says who ticked', async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(LIST_KEY, listData(['milk']));
    // "bread" was ticked here and is still in the outbox; the server has not seen it.
    shopOutbox.enqueue({ planId: PLAN, keys: ['bread'], checked: true, at: 'x' });
    const sync: ShoppingListSyncDto = {
      planId: PLAN,
      revision: 'r1',
      checkedKeys: ['milk', 'eggs'],
      checkedBy: { eggs: { name: 'Maria', isYou: false } },
    };
    queryClient.setQueryData(LIST_KEY, listData(['milk', 'bread']));
    await renderWithTrpc(
      <Probe />,
      {
        'shoppingList.getForWeek': () => listData(['milk', 'bread']),
        'shoppingList.sync': () => sync,
      },
      queryClient,
    );
    await waitFor(() => expect(screen.getByTestId('checked')).toHaveTextContent('milk,bread,eggs'));
    expect(screen.getByTestId('who')).toHaveTextContent('eggs:Maria');
    expect(track).toHaveBeenCalledWith('shared_list_synced', { remoteChanges: 1 });
  });

  it('nothing new: no cache write and no event', async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(LIST_KEY, listData(['milk']));
    await renderWithTrpc(
      <Probe />,
      {
        'shoppingList.getForWeek': () => listData(['milk']),
        'shoppingList.sync': () => ({
          planId: PLAN,
          revision: 'r1',
          checkedKeys: ['milk'],
          checkedBy: {},
        }),
      },
      queryClient,
    );
    await waitFor(() => expect(screen.getByTestId('checked')).toHaveTextContent('milk'));
    expect(track).not.toHaveBeenCalled();
  });

  it('not shared (or not focused): never asks', async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(LIST_KEY, listData([]));
    const { paths } = await renderWithTrpc(
      <Probe enabled={false} />,
      { 'shoppingList.getForWeek': () => listData([]) },
      queryClient,
    );
    await waitFor(() => expect(screen.getByTestId('checked')).toBeTruthy());
    expect(paths()).not.toContain('shoppingList.sync');
  });
});

describe('household sharing helpers', () => {
  it('a meal-slot CONFLICT is recognised; other errors are not', () => {
    expect(
      isMealSlotConflict(
        trpcError('CONFLICT', 409, {
          conflict: {
            kind: 'mealSlot',
            current: { dayOfWeek: 1, mealType: 'dinner', recipeId: 'r' },
          },
        }),
      ),
    ).toBe(true);
    expect(isMealSlotConflict(trpcError('CONFLICT', 409, { conflict: { kind: 'routine' } }))).toBe(
      false,
    );
    expect(isMealSlotConflict(trpcError('FORBIDDEN', 403))).toBe(false);
  });

  it('sharing off (or not loaded) reads as a solo household', () => {
    expect(householdSharingFrom(undefined)).toMatchObject({ enabled: false, shared: false });
    expect(
      householdSharingFrom({
        enabled: false,
        role: 'PARTNER',
        canInvite: false,
        partners: [],
        invites: [],
      }),
    ).toMatchObject({ enabled: false, shared: false, isPartner: false });
    expect(
      householdSharingFrom({
        enabled: true,
        role: 'PARTNER',
        canInvite: false,
        owner: { name: 'Dan' },
        partners: [],
        invites: [],
      }),
    ).toMatchObject({ enabled: true, shared: true, isPartner: true, ownerName: 'Dan' });
    expect(
      householdSharingFrom({
        enabled: true,
        role: 'SOLO',
        canInvite: true,
        partners: [],
        invites: [],
      }),
    ).toMatchObject({ shared: false, isOwner: false });
  });
});
