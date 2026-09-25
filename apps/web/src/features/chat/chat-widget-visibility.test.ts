import { describe, expect, it } from 'vitest';
import { showChatWidget } from './chat-widget-visibility';

describe('showChatWidget', () => {
  it('hides the widget on the active workout and its sub-routes', () => {
    expect(showChatWidget('/gym/workout')).toBe(false);
    expect(showChatWidget('/gym/workout/anything')).toBe(false);
  });

  it('hides the widget on focus routes: onboarding and cook mode', () => {
    expect(showChatWidget('/onboarding')).toBe(false);
    expect(showChatWidget('/recipes/abc123/cook')).toBe(false);
    expect(showChatWidget('/recipes/abc123')).toBe(true);
  });

  it('shows it everywhere else, including look-alike paths', () => {
    expect(showChatWidget('/dashboard')).toBe(true);
    expect(showChatWidget('/gym')).toBe(true);
    expect(showChatWidget('/gym/workouts-history')).toBe(true);
    expect(showChatWidget(null)).toBe(true);
  });
});
