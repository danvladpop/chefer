import { describe, expect, it } from 'vitest';
import { progressSettingsEvents } from './analytics';

describe('progressSettingsEvents', () => {
  it('reports each changed setting once, and nothing for an empty patch', () => {
    expect(progressSettingsEvents({})).toEqual([]);
    expect(
      progressSettingsEvents({ celebrations: 'OFF', showXp: false, reminder: { enabled: true } }),
    ).toEqual([
      { name: 'progress_celebrations_changed', props: { to: 'OFF' } },
      { name: 'progress_hidden', props: { setting: 'showXp', on: false } },
      { name: 'progress_reminder_toggled', props: { on: true } },
    ]);
  });

  it('ignores a reminder time change (not a pressure signal)', () => {
    expect(progressSettingsEvents({ reminder: { time: '20:00' } })).toEqual([]);
  });
});
