import { render, screen } from '@testing-library/react-native';
import { clampLabelCentre, LineChart, niceTicks } from '@chefer/ui-mobile';

// UX-FOOD-20: the Progress calorie axis went negative (-149.6), had odd ticks
// and clipped the last x label.

type JsonElement = NonNullable<ReturnType<typeof screen.toJSON>>;

function svgTexts(): string[] {
  const out: string[] = [];
  const walk = (node: JsonElement | string) => {
    if (typeof node === 'string') return;
    if (node.type === 'RNSVGText') out.push(JSON.stringify(node.children));
    node.children?.forEach(walk);
  };
  const root = screen.toJSON();
  if (root) walk(root as JsonElement);
  return out;
}

describe('niceTicks', () => {
  it('rounds the bounds out to 1/2/5 steps', () => {
    expect(niceTicks({ min: 0, max: 2592 }).ticks).toEqual([0, 1000, 2000, 3000]);
    expect(niceTicks({ min: 70.8, max: 78.4 })).toEqual({
      min: 70,
      max: 80,
      ticks: [70, 75, 80],
    });
  });

  it('always contains the data and has no float noise', () => {
    const { min, max, ticks } = niceTicks({ min: 0.3, max: 0.9 });
    expect(min).toBeLessThanOrEqual(0.3);
    expect(max).toBeGreaterThanOrEqual(0.9);
    for (const t of ticks) expect(String(t)).not.toMatch(/\d{6,}/);
  });
});

describe('clampLabelCentre', () => {
  it('keeps a label inside the chart at both edges', () => {
    // "26 Sep" ≈ 36px wide: its centre may not be nearer than 18px to either edge.
    expect(clampLabelCentre(2, '26 Sep', 300)).toBe(18);
    expect(clampLabelCentre(299, '26 Sep', 300)).toBe(282);
    expect(clampLabelCentre(150, '26 Sep', 300)).toBe(150);
  });
});

describe('LineChart axis (UX-FOOD-20)', () => {
  const data = [
    // A day at 0 kcal pads the extent to about -190 without a floor.
    { x: 0, y: 0 },
    { x: 5, y: 2400 },
    { x: 9, y: 2100 },
  ];

  it('never draws below the floor and uses round gridlines', async () => {
    await render(
      <LineChart
        width={320}
        data={data}
        reference={{ y: 2000, label: 'Target' }}
        yFloor={0}
        niceTicks
        formatY={(v) => v.toLocaleString('en-GB')}
      />,
    );
    const labels = svgTexts().join(' ');
    expect(labels).not.toContain('-');
    for (const tick of ['"0"', '"1,000"', '"2,000"', '"3,000"']) expect(labels).toContain(tick);
  });

  it('without a floor the padded axis can dip below the data (the old behaviour)', async () => {
    await render(
      <LineChart
        width={320}
        data={[
          { x: 0, y: 0 },
          { x: 1, y: 100 },
        ]}
      />,
    );
    expect(svgTexts().join(' ')).toContain('-');
  });
});
