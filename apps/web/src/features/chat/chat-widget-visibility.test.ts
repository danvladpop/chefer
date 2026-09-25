import { describe, expect, it } from 'vitest';
import { showChatWidget } from './chat-widget-visibility';

describe('showChatWidget', () => {
  it('hides the widget on the active workout and its sub-routes', () => {
    expect(showChatWidget('/gym/workout')).toBe(false);
    expect(showChatWidget('/gym/workout/anything')).toBe(false);
  });

  it('shows it everywhere else, including look-alike paths', () => {
    expect(showChatWidget('/dashboard')).toBe(true);
    expect(showChatWidget('/gym')).toBe(true);
    expect(showChatWidget('/gym/workouts-history')).toBe(true);
    expect(showChatWidget(null)).toBe(true);
  });
});
