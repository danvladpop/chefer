import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  Button,
  buttonVariants,
  Chip,
  DEFAULT_MAX_FONT_SCALE,
  DENSE_MAX_FONT_SCALE,
  Input,
  PasswordInput,
  SearchField,
  SegmentedControl,
  Text,
  thumbMetrics,
} from '@chefer/ui-mobile';
import { chipVariants } from '../../../../packages/ui-mobile/src/components/chip';

// The official Reanimated mock builds a NEW shared value on every render, so a
// write (the track's onLayout) is lost on the next one. This file needs the
// real persistence semantics to test the thumb: same mock, stable shared values.
type MockShared = { value: number; get: () => number; set: (v: number) => void };
jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual<Record<string, unknown>>('react-native-reanimated/mock');
  const { useRef } = jest.requireActual<typeof import('react')>('react');
  return {
    ...mock,
    useReducedMotion: () => false,
    useSharedValue: (init: number): MockShared => {
      const ref = useRef<MockShared | null>(null);
      if (ref.current === null) {
        const box: MockShared = {
          value: init,
          get: () => box.value,
          set: (v) => {
            box.value = v;
          },
        };
        ref.current = box;
      }
      return ref.current;
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain CJS config
const tailwindConfig = require('../../tailwind.config.js') as {
  theme: { extend: { fontSize: Record<string, [string, { lineHeight: string }]> } };
};

// WP-04 lane A — readability primitives: type floor, OS text size caps, inputs
// that grow instead of clip, chips/segments that wrap, the segmented thumb
// (UX-X-10) and default accessibility labels (UX-X-09).

function flat(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) as Record<string, unknown>;
}

describe('type floor (UX-X-14)', () => {
  const { fontSize } = tailwindConfig.theme.extend;

  it('secondary text is at least 14pt and callout text 16pt', () => {
    expect(fontSize.xs?.[0]).toBe('14px');
    expect(fontSize.xs?.[1].lineHeight).toBe('19px');
    expect(fontSize.sm?.[0]).toBe('16px');
    expect(fontSize.sm?.[1].lineHeight).toBe('22px');
  });

  it('the ramp stays strictly increasing', () => {
    const sizes = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'].map((k) =>
      parseInt(fontSize[k]?.[0] ?? '0', 10),
    );
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(sizes).size).toBe(sizes.length);
  });
});

describe('OS text size caps (X-08)', () => {
  it('lets dense controls scale to 1.6x and everything else to 2.0x', () => {
    expect(DENSE_MAX_FONT_SCALE).toBe(1.6);
    expect(DEFAULT_MAX_FONT_SCALE).toBe(2.0);
  });

  it('the shared Text applies the default cap unless overridden', async () => {
    await render(
      <>
        <Text>plain</Text>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}>dense</Text>
      </>,
    );
    expect(screen.getByText('plain').props.maxFontSizeMultiplier).toBe(2.0);
    expect(screen.getByText('dense').props.maxFontSizeMultiplier).toBe(1.6);
  });
});

describe('Input / SearchField grow with large text (X-08) and have names (X-09)', () => {
  it('Input is min-h-11 py-2, never a fixed h-11', async () => {
    await render(<Input testID="in" placeholder="Name" />);
    const className = String(screen.getByTestId('in').props.className);
    expect(className).toMatch(/\bmin-h-11\b/);
    expect(className).toMatch(/\bpy-2\b/);
    expect(className).not.toMatch(/(^|\s)h-11\b/);
  });

  it('Input defaults accessibilityLabel to label, then placeholder; explicit wins', async () => {
    await render(
      <>
        <Input testID="a" label="First name" placeholder="Dan" />
        <Input testID="b" placeholder="Search" />
        <Input testID="c" label="Ignored" accessibilityLabel="Explicit" />
        <PasswordInput testID="d" label="Password" />
      </>,
    );
    expect(screen.getByTestId('a').props.accessibilityLabel).toBe('First name');
    expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Search');
    expect(screen.getByTestId('c').props.accessibilityLabel).toBe('Explicit');
    expect(screen.getByTestId('d').props.accessibilityLabel).toBe('Password');
  });

  it('SearchField wrapper and input grow (min-h-11, no h-full)', async () => {
    await render(<SearchField testID="s" accessibilityLabel="Search recipes" />);
    expect(String(screen.getByTestId('s-field').props.className)).not.toMatch(/(^|\s)h-11\b/);
    expect(String(screen.getByTestId('s-field').props.className)).toMatch(/\bmin-h-11\b/);
    expect(String(screen.getByTestId('s').props.className)).not.toMatch(/\bh-full\b/);
    expect(screen.getByTestId('s').props.accessibilityLabel).toBe('Search recipes');
  });
});

describe('Chip at large text (X-08, X-09)', () => {
  it('wraps long labels (no single-line truncation) inside a 44pt-min pill', async () => {
    await render(<Chip testID="chip" label="Gluten and wheat free" selected />);
    // (className is consumed by NativeWind in the tree; assert the variant.)
    const className = chipVariants({ selected: true });
    expect(className).toMatch(/\bmin-h-11\b/);
    expect(className).toMatch(/\bmax-w-full\b/);
    const label = screen.getByText('Gluten and wheat free');
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.maxFontSizeMultiplier).toBe(DENSE_MAX_FONT_SCALE);
  });

  it('exposes role and selected / disabled state', async () => {
    await render(<Chip testID="chip" label="Keto" selected disabled />);
    const chip = screen.getByTestId('chip');
    expect(chip.props.accessibilityState).toEqual({ selected: true, disabled: true });
    expect(chip.props.accessibilityRole).toBe('button');
  });
});

describe('SegmentedControl thumb (UX-X-10)', () => {
  const options = [
    { value: 'a', label: 'Food', testID: 'seg-a' },
    { value: 'b', label: 'Gym', testID: 'seg-b' },
    { value: 'c', label: 'Both', testID: 'seg-c' },
  ] as const;

  it('thumbMetrics: offset is index x segment width, derived from the track width', () => {
    // 300pt track, 4pt padding each side, 3 options -> 97.33pt segments.
    const segment = (300 - 8) / 3;
    expect(thumbMetrics(300, 3, 0)).toEqual({ width: segment, offset: 0 });
    expect(thumbMetrics(300, 3, 1)).toEqual({ width: segment, offset: segment });
    expect(thumbMetrics(300, 3, 2).offset).toBeCloseTo(2 * segment);
  });

  it('thumbMetrics: no width before the first layout, and the spring overshoot is clamped', () => {
    expect(thumbMetrics(0, 3, 1)).toEqual({ width: 0, offset: 0 });
    expect(thumbMetrics(300, 0, 0)).toEqual({ width: 0, offset: 0 });
    const segment = (300 - 8) / 3;
    expect(thumbMetrics(300, 3, 2.06).offset).toBeCloseTo(2 * segment);
    expect(thumbMetrics(300, 3, -0.06).offset).toBe(0);
  });

  it('draws the thumb under the SELECTED option on first layout (value at index 1)', async () => {
    const control = () => (
      <SegmentedControl testID="seg" value="b" onChange={jest.fn()} options={options} />
    );
    const { rerender } = await render(control());
    await fireEvent(screen.getByTestId('seg'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 44 } },
    });
    // The jest Reanimated mock re-evaluates the worklet on render, not on a
    // shared-value write; on device the UI thread does it with no re-render.
    await rerender(control());
    const track = screen.getByTestId('seg');
    // The thumb is the track's first child (absolutely positioned, no testID).
    const thumb = track.children[0];
    expect(thumb).toBeDefined();
    const style = flat((thumb as unknown as { props: { style: unknown } }).props.style) as {
      width: number;
      transform: { translateX: number }[];
    };
    const segment = (300 - 8) / 3;
    expect(style.width).toBeCloseTo(segment);
    expect(style.transform[0]?.translateX).toBeCloseTo(segment);
  });

  it('labels wrap instead of clipping (never auto-shrink), and segments are tabs with state', async () => {
    await render(
      <SegmentedControl testID="seg" value="b" onChange={jest.fn()} options={options} />,
    );
    const gym = screen.getByTestId('seg-b');
    expect(gym.props.accessibilityRole).toBe('tab');
    expect(gym.props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('seg-a').props.accessibilityState).toEqual({ selected: false });
    const label = screen.getByText('Gym');
    expect(label.props.numberOfLines).toBe(2);
    // adjustsFontSizeToFit stuck the compact Food | Gym switch at a tiny size on
    // the new architecture — the labels must never auto-shrink.
    expect(label.props.adjustsFontSizeToFit).toBeUndefined();
    expect(label.props.maxFontSizeMultiplier).toBe(DENSE_MAX_FONT_SCALE);
  });
});

describe('SegmentedControl compact (header switch)', () => {
  it('caps the xs label scale so the Food | Gym switch never truncates', async () => {
    const options = [
      { value: 'a', label: 'Food' },
      { value: 'b', label: 'Gym' },
    ];
    await render(
      <SegmentedControl testID="seg" size="xs" value="a" onChange={jest.fn()} options={options} />,
    );
    const label = screen.getByText('Gym');
    expect(label.props.numberOfLines).toBe(1);
    expect(label.props.maxFontSizeMultiplier).toBe(1.3);
  });
});

describe('Button lg (busy hands)', () => {
  it('lg is a 48pt min-h size and its label steps up to text-base', async () => {
    expect(buttonVariants({ size: 'lg' })).toMatch(/\bmin-h-12\b/);
    await render(<Button size="lg">Start workout</Button>);
    expect(String(screen.getByText('Start workout').props.className)).toMatch(/\btext-base\b/);
    expect(String(screen.getByText('Start workout').props.className)).not.toMatch(/\btext-sm\b/);
  });
});
