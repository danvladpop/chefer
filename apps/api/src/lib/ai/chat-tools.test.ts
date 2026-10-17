import { describe, expect, it, vi } from 'vitest';
import { CHAT_TOOL_DEFINITIONS, dispatchChatTool } from './chat-tools.js';
import type { ChatTools } from './types.js';

// The shared chat tool surface: what the providers advertise and how a
// model's call is resolved against the real handlers.

function tools(overrides: Partial<ChatTools> = {}): ChatTools {
  return {
    swapMeal: vi.fn().mockResolvedValue('swapped'),
    scaleRecipe: vi.fn().mockResolvedValue('scaled'),
    addToShoppingList: vi.fn().mockResolvedValue('added'),
    getMyReview: vi.fn().mockResolvedValue('review'),
    logMeal: vi.fn().mockResolvedValue('logged'),
    importRecipe: vi.fn().mockResolvedValue('imported'),
    whatCanIMake: vi.fn().mockResolvedValue('pantry'),
    getMyTraining: vi.fn().mockResolvedValue('TRAINING summary'),
    ...overrides,
  };
}

describe('CHAT_TOOL_DEFINITIONS', () => {
  it('advertises getMyTraining as a parameterless, read-only training tool', () => {
    const def = CHAT_TOOL_DEFINITIONS.find((d) => d.name === 'getMyTraining');
    expect(def).toBeDefined();
    expect(def?.parameters).toEqual({ type: 'object', properties: {} });
    expect(def?.description).toMatch(/workouts, routines/);
    expect(def?.description).toMatch(/cannot change anything/);
  });

  it('every definition has a dispatch branch (no "Unknown tool")', async () => {
    const t = tools();
    for (const def of CHAT_TOOL_DEFINITIONS) {
      expect(await dispatchChatTool(def.name, {}, t)).not.toMatch(/^Unknown tool/);
    }
  });
});

describe('dispatchChatTool — getMyTraining', () => {
  it('resolves to the handler and ignores stray arguments', async () => {
    const getMyTraining = vi.fn().mockResolvedValue('TRAINING summary');
    expect(
      await dispatchChatTool('getMyTraining', { day: 'monday' }, tools({ getMyTraining })),
    ).toBe('TRAINING summary');
    expect(getMyTraining).toHaveBeenCalledWith();
  });

  it('returns a failure as text, never throws', async () => {
    const t = tools({ getMyTraining: vi.fn().mockRejectedValue(new Error('gym down')) });
    expect(await dispatchChatTool('getMyTraining', {}, t)).toBe('Tool failed: gym down');
  });

  it('unknown tools stay unknown', async () => {
    expect(await dispatchChatTool('editRoutine', {}, tools())).toBe('Unknown tool: editRoutine');
  });
});
