import type { EventMap, ProgressSettingsPatch } from '@chefer/types';

// ─── Kitchen progress analytics (tech-plan §8 "Measure") ─────────────────────
// One place that turns a Rewards & motivation change into analytics events, so
// mobile and web report the same pressure signals.

export type ProgressSettingsEvent =
  | { name: 'progress_celebrations_changed'; props: EventMap['progress_celebrations_changed'] }
  | { name: 'progress_hidden'; props: EventMap['progress_hidden'] }
  | { name: 'progress_reminder_toggled'; props: EventMap['progress_reminder_toggled'] };

export function progressSettingsEvents(patch: ProgressSettingsPatch): ProgressSettingsEvent[] {
  const events: ProgressSettingsEvent[] = [];
  if (patch.celebrations !== undefined) {
    events.push({ name: 'progress_celebrations_changed', props: { to: patch.celebrations } });
  }
  for (const setting of ['showXp', 'showFlameOnToday', 'biscuit'] as const) {
    const on = patch[setting];
    if (on !== undefined) events.push({ name: 'progress_hidden', props: { setting, on } });
  }
  if (patch.reminder?.enabled !== undefined) {
    events.push({ name: 'progress_reminder_toggled', props: { on: patch.reminder.enabled } });
  }
  return events;
}
