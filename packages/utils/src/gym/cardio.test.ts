import { describe, expect, it } from 'vitest';
import {
  cardioNextTime,
  cardioPresetsFor,
  distanceUnitFor,
  effortLabelForRpe,
  formatDistance,
  formatDurationClock,
  formatDurationMinutes,
  pace,
  toMetres,
} from './cardio';

describe('formatDurationMinutes', () => {
  it('rounds seconds to whole minutes', () => {
    expect(formatDurationMinutes(1200)).toBe('20 min');
    expect(formatDurationMinutes(65)).toBe('1 min');
  });

  it('shows hours once past 60 minutes', () => {
    expect(formatDurationMinutes(90 * 60)).toBe('1 h 30 min');
    expect(formatDurationMinutes(120 * 60)).toBe('2 h');
  });
});

describe('formatDurationClock', () => {
  it('renders mm:ss under an hour', () => {
    expect(formatDurationClock(0)).toBe('0:00');
    expect(formatDurationClock(65)).toBe('1:05');
    expect(formatDurationClock(599)).toBe('9:59');
  });

  it('renders h:mm:ss past an hour', () => {
    expect(formatDurationClock(3661)).toBe('1:01:01');
  });
});

describe('distance round trip (AC6: km/mi/m)', () => {
  it('km: 5 km stores as 5000 m and displays back as 5 km', () => {
    const m = toMetres(5, 'KM');
    expect(m).toBe(5000);
    expect(formatDistance(m, 'KM')).toBe('5 km');
  });

  it('mi: 3.1 mi stores in metres and displays back to one decimal', () => {
    const m = toMetres(3.1, 'MI');
    expect(m).toBeCloseTo(4988.97, 1);
    expect(formatDistance(m, 'MI')).toBe('3.1 mi');
  });

  it('m: the rower stores and displays whole metres', () => {
    expect(toMetres(500, 'M')).toBe(500);
    expect(formatDistance(500, 'M')).toBe('500 m');
  });
});

describe('pace', () => {
  it('5 km in 25 min is 5:00 /km', () => {
    expect(pace(5000, 25 * 60, 'KM')).toBe('5:00 /km');
  });

  it('a 500 m rowing split', () => {
    // 2000 m in 8 min → 2:00 per 500 m
    expect(pace(2000, 8 * 60, 'M')).toBe('2:00 /500m');
  });

  it('null when there is nothing to divide by', () => {
    expect(pace(0, 600, 'KM')).toBeNull();
    expect(pace(1000, 0, 'KM')).toBeNull();
  });
});

describe('effortLabelForRpe', () => {
  it('maps RPE bands to the three chips', () => {
    expect(effortLabelForRpe(3)).toBe('Easy');
    expect(effortLabelForRpe(5)).toBe('Moderate');
    expect(effortLabelForRpe(7)).toBe('Hard');
  });

  it('is null when no effort was logged', () => {
    expect(effortLabelForRpe(undefined)).toBeNull();
  });
});

describe('cardioNextTime (Δ2.2: pure function of the last exposure, no stored state)', () => {
  it('AC5 (part): first time → start, no "Same as last time" copy', () => {
    expect(cardioNextTime(null, 'KM')).toEqual({
      kind: 'start',
      text: "Log your first time and we'll show what's next.",
    });
    expect(cardioNextTime(undefined, 'KM')).toEqual({
      kind: 'start',
      text: "Log your first time and we'll show what's next.",
    });
  });

  it('AC5 (part): a duration-only exposure with no effort logged → hold, no "at {effort}"', () => {
    expect(cardioNextTime({ durationSec: 1200 }, 'KM')).toEqual({
      kind: 'hold',
      text: 'Same as last time: 20 min.',
    });
  });

  it('a duration + distance + effort exposure renders all three', () => {
    expect(cardioNextTime({ durationSec: 1200, distanceM: 5000, intensityRpe: 5 }, 'KM')).toEqual({
      kind: 'hold',
      text: 'Same as last time: 20 min · 5 km at Moderate.',
    });
  });
});

describe('cardio catalogue presets (T-42.1)', () => {
  it('returns MET/metric data for a catalogue cardio exercise', () => {
    const preset = cardioPresetsFor('treadmill-run');
    expect(preset).not.toBeNull();
    expect(preset?.metrics).toContain('distance');
  });

  it('is null for a non-cardio (or unknown) exercise id', () => {
    expect(cardioPresetsFor('barbell-bench-press')).toBeNull();
    expect(cardioPresetsFor('not-a-real-id')).toBeNull();
  });

  it('distanceUnitFor: the rower always logs metres regardless of the profile unit', () => {
    expect(distanceUnitFor('rowing-machine', 'KM')).toBe('M');
    expect(distanceUnitFor('rowing-machine', 'MI')).toBe('M');
  });

  it("distanceUnitFor: every other entry follows the user's profile distance unit", () => {
    expect(distanceUnitFor('treadmill-run', 'MI')).toBe('MI');
    expect(distanceUnitFor('outdoor-cycle', 'KM')).toBe('KM');
  });
});
