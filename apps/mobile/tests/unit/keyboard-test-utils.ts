import { TextInput } from 'react-native';

// RN's jest setup replaces `TextInput` with a mock whose instance methods
// (`focus`, `blur`, …) are ONE shared `jest.fn` on the prototype; each call
// records the instance in `mock.contexts`. That lets a screen test ask "which
// field did Return move focus to?" without a device.

function focusMock(): jest.Mock {
  const focus: unknown = Object.getOwnPropertyDescriptor(TextInput.prototype, 'focus')?.value;
  if (!jest.isMockFunction(focus)) throw new Error('TextInput.focus is not the jest mock');
  return focus;
}

function testIDOf(field: unknown): string | undefined {
  if (typeof field !== 'object' || field === null || !('props' in field)) return undefined;
  const { props } = field;
  if (typeof props !== 'object' || props === null || !('testID' in props)) return undefined;
  return typeof props.testID === 'string' ? props.testID : undefined;
}

/** testIDs of the fields `.focus()` was called on, in order. */
export function focusedFields(): (string | undefined)[] {
  const contexts: unknown[] = focusMock().mock.contexts;
  return contexts.map(testIDOf);
}

export function resetFocusedFields(): void {
  focusMock().mockClear();
}
