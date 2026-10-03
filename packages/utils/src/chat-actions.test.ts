import { describe, expect, it } from 'vitest';
import { CHAT_ACTIONS_MARKER, type ChatAction } from '@chefer/types';
import { chatActionsTrailer, splitChatActions } from './chat-actions';

const swap: ChatAction = {
  kind: 'swap',
  label: 'Swapped Tuesday lunch for Quinoa Bowl',
  planId: 'p1',
  dayOfWeek: 1,
  mealType: 'lunch',
  slotIndex: 1,
  previousRecipeId: 'r0',
};

describe('splitChatActions (UX-FOOD-21)', () => {
  it('returns plain text untouched', () => {
    expect(splitChatActions('Hello there')).toEqual({ text: 'Hello there', actions: [] });
  });

  it('splits the trailer off the text and parses the actions', () => {
    const raw = `Done.${chatActionsTrailer([swap])}`;
    expect(splitChatActions(raw)).toEqual({ text: 'Done.', actions: [swap] });
  });

  it('never shows a half-arrived marker', () => {
    for (let n = 1; n < CHAT_ACTIONS_MARKER.length; n++) {
      const raw = `Done.${CHAT_ACTIONS_MARKER.slice(0, n)}`;
      expect(splitChatActions(raw).text).toBe('Done.');
    }
  });

  it('keeps the text and shows no chips while the JSON is still arriving', () => {
    const full = chatActionsTrailer([swap]);
    expect(splitChatActions(`Done.${full.slice(0, full.length - 8)}`)).toEqual({
      text: 'Done.',
      actions: [],
    });
  });

  it('drops an action it does not understand, keeps the rest', () => {
    const raw = `Ok.${CHAT_ACTIONS_MARKER}${JSON.stringify([{ kind: 'nope' }, swap])}`;
    expect(splitChatActions(raw).actions).toEqual([swap]);
  });

  it('writes nothing for an empty action list', () => {
    expect(chatActionsTrailer([])).toBe('');
  });
});
