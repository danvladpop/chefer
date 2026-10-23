// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BodyMeasurementDto } from '@chefer/types';
import { BodyMeasurementsSection } from './BodyMeasurementsSection';

// Lane D3: body measurements on Progress — one chart per measure, typed and
// shown in the user's units, every field optional but at least one needed.

const m = vi.hoisted(() => ({
  entries: [] as BodyMeasurementDto[],
  log: vi.fn(),
  remove: vi.fn(),
  capture: vi.fn(),
  chart: [] as { value: number }[],
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ tracker: { bodyMeasurements: { invalidate: vi.fn() } } }),
    tracker: {
      bodyMeasurements: { useQuery: () => ({ data: m.entries }) },
      logBodyMeasurement: {
        useMutation: () => ({ mutate: m.log, isPending: false }),
      },
      deleteBodyMeasurement: {
        useMutation: () => ({ mutate: m.remove, isPending: false, isError: false }),
      },
    },
  },
}));
vi.mock('@/lib/analytics', () => ({ capture: m.capture }));
vi.mock('@/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));
vi.mock('recharts', () => {
  const Null = () => null;
  return {
    Line: Null,
    LineChart: ({ data }: { data: { value: number }[] }) => {
      m.chart = data;
      return null;
    },
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: Null,
    XAxis: Null,
    YAxis: Null,
  };
});

const entry = (measuredOn: string, over: Partial<BodyMeasurementDto>): BodyMeasurementDto => ({
  id: measuredOn,
  measuredOn,
  waistCm: null,
  hipsCm: null,
  chestCm: null,
  upperArmCm: null,
  thighCm: null,
  bodyFatPct: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.entries = [];
});
afterEach(cleanup);

describe('BodyMeasurementsSection', () => {
  it('invites a first entry when there is none', () => {
    render(<BodyMeasurementsSection system="METRIC" />);
    expect(screen.getByTestId('measurements-empty')).toBeTruthy();
    expect(screen.getByLabelText('Waist (cm)')).toBeTruthy();
    expect(screen.getByLabelText('Body fat (%)')).toBeTruthy();
  });

  it('charts the picked measure in the user’s unit, with a neutral change line', () => {
    m.entries = [
      entry('2026-09-01', { waistCm: 88.9, hipsCm: 100 }),
      entry('2026-10-01', { waistCm: 86.36 }),
    ];
    render(<BodyMeasurementsSection system="IMPERIAL" />);
    expect(screen.getByTestId('measure-chip-waist').getAttribute('aria-pressed')).toBe('true');
    expect(m.chart.map((p) => p.value)).toEqual([35, 34]);
    expect(screen.getByTestId('measure-change').textContent).toBe('−1.0 in since your first entry');
    // A measure with one value asks for another entry instead of drawing a dot.
    fireEvent.click(screen.getByTestId('measure-chip-hips'));
    expect(screen.getByTestId('measure-one-entry')).toBeTruthy();
  });

  it('saves only the filled measures, in cm, for the chosen day', () => {
    render(<BodyMeasurementsSection system="IMPERIAL" />);
    fireEvent.change(screen.getByLabelText('Waist (in)'), { target: { value: '34' } });
    fireEvent.change(screen.getByLabelText('Body fat (%)'), { target: { value: '21,5' } });
    fireEvent.click(screen.getByTestId('measurement-save'));
    expect(m.log).toHaveBeenCalledWith({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown,
      waistCm: 86.4,
      bodyFatPct: 21.5,
    });
  });

  it('flags a bad field next to it and needs at least one measure', () => {
    render(<BodyMeasurementsSection system="METRIC" />);
    fireEvent.click(screen.getByTestId('measurement-save'));
    expect(screen.getByTestId('measurement-form-error').textContent).toBe(
      'Enter at least one measurement.',
    );
    const chest = screen.getByLabelText('Chest (cm)');
    fireEvent.change(chest, { target: { value: '900' } });
    fireEvent.click(screen.getByTestId('measurement-save'));
    expect(chest.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Must be between 10 and 250 cm.')).toBeTruthy();
    expect(m.log).not.toHaveBeenCalled();
  });

  it('lists entries newest first with a labelled delete', () => {
    m.entries = [entry('2026-09-01', { waistCm: 88 }), entry('2026-10-01', { thighCm: 55 })];
    render(<BodyMeasurementsSection system="METRIC" />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]?.textContent).toContain('Thigh 55 cm');
    fireEvent.click(screen.getByRole('button', { name: /Delete the measurements from (1 Oct|Oct 1)/ }));
    expect(m.remove).toHaveBeenCalledWith({ id: '2026-10-01' });
  });
});
