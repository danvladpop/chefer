import { describe, expect, it } from 'vitest';
import type { PlanTailoring } from '@chefer/types';
import {
  isTailoringRunning,
  newlyTailoredDays,
  shouldShowTailoringBanner,
  tailoringBannerText,
  tailoringDayLabel,
  tailoringDayState,
  tailoringProgress,
} from './plan-tailoring';

const running: PlanTailoring = {
  status: 'RUNNING',
  tailoredDays: [2, 3],
  totalDays: 5,
  currentDay: 4,
  queuedDays: [4, 5, 6],
  keptDays: [],
  canResume: false,
};

describe('tailoringDayState', () => {
  it('maps a running job to tailored / tailoring / waiting per day', () => {
    expect(tailoringDayState(running, 2)).toBe('tailored');
    expect(tailoringDayState(running, 4)).toBe('tailoring');
    expect(tailoringDayState(running, 6)).toBe('waiting');
    // Past days of the current week were never part of the job.
    expect(tailoringDayState(running, 0)).toBe('none');
  });

  it('marks days the user changed as kept, and untailored days of a stopped job as collection', () => {
    const partial: PlanTailoring = {
      ...running,
      status: 'PARTIAL',
      currentDay: null,
      keptDays: [4],
      queuedDays: [5, 6],
      canResume: true,
    };
    expect(tailoringDayState(partial, 4)).toBe('kept');
    expect(tailoringDayState(partial, 5)).toBe('collection');
    expect(tailoringDayLabel('collection')).toBe('from our recipe collection');
  });

  it('is none without a job', () => {
    expect(tailoringDayState(null, 1)).toBe('none');
    expect(tailoringDayLabel('none')).toBe('');
  });
});

describe('tailoringProgress / banner copy', () => {
  it('counts tailored + kept days against the total', () => {
    expect(tailoringProgress({ ...running, keptDays: [6] })).toEqual({
      done: 3,
      total: 5,
      fraction: 0.6,
    });
  });

  it('RUNNING: "Your chef is tailoring your week · 2 of 5 days"', () => {
    expect(tailoringBannerText(running)).toMatchObject({
      tone: 'running',
      title: 'Your chef is tailoring your week',
      detail: '2 of 5 days',
      actionLabel: null,
    });
    expect(isTailoringRunning(running)).toBe(true);
  });

  it('PARTIAL: honest one-liner with the resume action only when allowed', () => {
    const partial: PlanTailoring = { ...running, status: 'PARTIAL', canResume: true };
    expect(tailoringBannerText(partial)).toMatchObject({
      tone: 'partial',
      title: 'Tailored 2 of 5 days',
      detail: 'the rest are from our recipe collection.',
      actionLabel: 'Tailor the rest',
    });
    expect(tailoringBannerText({ ...partial, canResume: false })?.actionLabel).toBeNull();
  });

  it('FAILED and DONE have their own copy; DONE shows only after watching it run', () => {
    expect(tailoringBannerText({ ...running, status: 'FAILED', canResume: true })).toMatchObject({
      tone: 'failed',
      actionLabel: 'Try tailoring again',
    });
    const done: PlanTailoring = { ...running, status: 'DONE', tailoredDays: [2, 3, 4, 5, 6] };
    expect(tailoringBannerText(done)?.title).toBe('Your week is tailored');
    expect(shouldShowTailoringBanner(done, false)).toBe(false);
    expect(shouldShowTailoringBanner(done, true)).toBe(true);
    expect(shouldShowTailoringBanner(running, false)).toBe(true);
    expect(shouldShowTailoringBanner({ ...running, status: 'NONE' }, true)).toBe(false);
  });
});

describe('newlyTailoredDays', () => {
  it('returns the days tailored since the previous read', () => {
    expect(newlyTailoredDays(running, { ...running, tailoredDays: [2, 3, 4] })).toEqual([4]);
    expect(newlyTailoredDays(undefined, running)).toEqual([2, 3]);
    expect(newlyTailoredDays(running, null)).toEqual([]);
  });
});
