import { vi } from 'vitest';
import type { SlotFlow } from './use-slot-actions';

// A stand-in for useSlotActions' result, for component tests: every action is
// a spy, nothing touches the network.
export function fakeSlotFlow(): SlotFlow {
  return {
    target: null,
    sheetOpen: false,
    describeOpen: false,
    setDescribeOpen: vi.fn(),
    scanOpenRef: { current: null },
    openAteElse: vi.fn(),
    closeSheet: vi.fn(),
    startDescribe: vi.fn(),
    startSnap: vi.fn(),
    skip: vi.fn(),
    unskip: vi.fn(),
    replace: vi.fn(),
    undoReplacement: vi.fn(),
    onLoggedEntry: vi.fn(),
    onLogged: vi.fn(),
    pending: false,
  };
}
