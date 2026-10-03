import * as ReactNative from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import {
  DENSE_MAX_FONT_SCALE,
  VALUE_MAX_FONT_SCALE,
  valueFontSize,
  ValueStepper,
} from '@chefer/ui-mobile';

// T-BUG-O2 (O-07): `adjustsFontSizeToFit` measured its shrink factor against
// a row's width at that render's measure time and, on the new architecture,
// never recomputed it upward once the row widened again — a transient
// narrow measure of ONE row (triggered by a sibling re-layout) left that
// row's kg/reps stuck at a near-invisible scale while identical neighbouring
// rows rendered normally. The fix drops the auto-shrink mechanism: the font
// size is a pure function of the display string (`valueFontSize`), so three
// rows with the same value are guaranteed to render the same size no matter
// what else is happening in the layout.

function noopNext(value: number): number {
  return value;
}

function fontSizeOf(rowTestID: string, display: string): number | undefined {
  const value = within(screen.getByTestId(rowTestID)).getByText(display);
  return (value.props.style as { fontSize?: number } | undefined)?.fontSize;
}

describe('T-BUG-O2 valueFontSize', () => {
  it('is 20pt for four characters or fewer', () => {
    expect(valueFontSize('60')).toBe(20);
    expect(valueFontSize('1:30')).toBe(20); // mm:ss rest/tempo value, 4 chars
    expect(valueFontSize('')).toBe(20);
  });

  it('is 17pt for exactly five characters', () => {
    expect(valueFontSize('102.5')).toBe(17); // kg with a decimal, 5 chars
    expect(valueFontSize('12345')).toBe(17);
  });

  it('is 14pt for six characters or more', () => {
    expect(valueFontSize('1000.5')).toBe(14);
    expect(valueFontSize('123456789')).toBe(14);
  });
});

describe('T-BUG-O2 ValueStepper — identical values render identical font sizes', () => {
  it('renders the same fontSize on three rows with identical values and drops adjustsFontSizeToFit', async () => {
    await render(
      <>
        {['row1', 'row2', 'row3'].map((testID) => (
          <ValueStepper
            key={testID}
            testID={testID}
            value={102.5}
            next={noopNext}
            onChange={jest.fn()}
            format={(v) => String(v)}
            caption="kg"
            name="Weight"
          />
        ))}
      </>,
    );

    const fontSizes = ['row1', 'row2', 'row3'].map((testID) => fontSizeOf(testID, '102.5'));
    expect(fontSizes).toEqual([17, 17, 17]);
    expect(new Set(fontSizes).size).toBe(1);

    for (const testID of ['row1', 'row2', 'row3']) {
      const value = within(screen.getByTestId(testID)).getByText('102.5');
      expect(value.props.adjustsFontSizeToFit).toBeUndefined();
      // A Dynamic Type cap still applies (the value's own, tighter one: it is
      // already 20pt in a fixed-width cell) — only the auto-shrink-on-measure
      // mechanism is gone.
      expect(value.props.maxFontSizeMultiplier).toBe(VALUE_MAX_FONT_SCALE);
    }
  });

  it('stays identical across a tick, an untick and an edit re-render (also at a 1.3x text scale)', async () => {
    const rows = (aValue: number, aDone: boolean) => (
      <>
        <ValueStepper
          testID="a"
          value={aValue}
          next={noopNext}
          onChange={jest.fn()}
          format={(v) => String(v)}
          caption="kg"
          name="Weight"
          done={aDone}
        />
        <ValueStepper
          testID="b"
          value={102.5}
          next={noopNext}
          onChange={jest.fn()}
          format={(v) => String(v)}
          caption="kg"
          name="Weight"
        />
      </>
    );

    const { rerender } = await render(rows(102.5, false));
    expect(fontSizeOf('a', '102.5')).toBe(fontSizeOf('b', '102.5'));
    // maxFontSizeMultiplier caps Dynamic Type at 1.3x — the style's fontSize
    // itself (checked above) never changes, which is the whole point of the
    // fix: no measure-dependent shrink, so a 1.3x rendering pass can't leave
    // one row stuck smaller than the other.
    expect(within(screen.getByTestId('a')).getByText('102.5').props.maxFontSizeMultiplier).toBe(
      1.3,
    );

    // Tick row "a" (done = true) — a sibling state change that used to be
    // able to trigger a transient narrow re-measure on the other row.
    await rerender(rows(102.5, true));
    expect(fontSizeOf('a', '102.5')).toBe(fontSizeOf('b', '102.5'));

    // Untick row "a".
    await rerender(rows(102.5, false));
    expect(fontSizeOf('a', '102.5')).toBe(fontSizeOf('b', '102.5'));

    // Edit row "a" to a shorter value — "b" must be completely unaffected.
    await rerender(rows(60, false));
    expect(fontSizeOf('a', '60')).toBe(20); // 2 chars
    expect(fontSizeOf('b', '102.5')).toBe(17); // unaffected by "a"'s edit

    // Edit row "a" back to the original value — both match again.
    await rerender(rows(102.5, false));
    expect(fontSizeOf('a', '102.5')).toBe(fontSizeOf('b', '102.5'));
  });
});

// UX-05 A1 (T-05.A1.1, O-05/O-06): a `grouped` variant — one filled
// container with transparent −/+ — used by the set row and the routine
// editor. AC13: identical rows render identical font sizes at 1.0x and 1.3x.
describe('UX-05 A1 grouped ValueStepper variant', () => {
  it('renders three identical grouped rows at identical font sizes, at 1.0x and after ticks/edits', async () => {
    const rows = (aValue: number, aDone: boolean) => (
      <>
        {['a', 'b', 'c'].map((testID) => (
          <ValueStepper
            key={testID}
            testID={testID}
            variant="grouped"
            value={testID === 'a' ? aValue : 55}
            next={noopNext}
            onChange={jest.fn()}
            format={(v) => String(v)}
            caption="kg"
            name="Weight"
            done={testID === 'a' ? aDone : false}
          />
        ))}
      </>
    );
    const { rerender } = await render(rows(55, false));
    expect([fontSizeOf('a', '55'), fontSizeOf('b', '55'), fontSizeOf('c', '55')]).toEqual([
      20, 20, 20,
    ]);
    await rerender(rows(55, true)); // tick
    expect([fontSizeOf('a', '55'), fontSizeOf('b', '55'), fontSizeOf('c', '55')]).toEqual([
      20, 20, 20,
    ]);
    await rerender(rows(55, false)); // untick
    expect([fontSizeOf('a', '55'), fontSizeOf('b', '55'), fontSizeOf('c', '55')]).toEqual([
      20, 20, 20,
    ]);
  });

  it('caps the caption and the −/+ glyphs at the dense max font scale (AX5 overflow fix)', async () => {
    await render(
      <ValueStepper
        testID="grouped"
        variant="grouped"
        value={60}
        next={noopNext}
        onChange={jest.fn()}
        format={(v) => String(v)}
        caption="kg"
        name="Weight"
      />,
    );
    const row = screen.getByTestId('grouped');
    const caption = within(row).getByText('kg');
    const minus = within(row).getByText('−');
    const plus = within(row).getByText('+');
    expect(caption.props.maxFontSizeMultiplier).toBe(DENSE_MAX_FONT_SCALE);
    expect(minus.props.maxFontSizeMultiplier).toBe(DENSE_MAX_FONT_SCALE);
    expect(plus.props.maxFontSizeMultiplier).toBe(DENSE_MAX_FONT_SCALE);
  });

  it('the plain variant is unchanged (no shared container class)', async () => {
    await render(
      <ValueStepper
        testID="plain"
        value={60}
        next={noopNext}
        onChange={jest.fn()}
        format={(v) => String(v)}
        caption="kg"
        name="Weight"
      />,
    );
    const row = screen.getByTestId('plain');
    expect(String(row.props.className ?? '')).not.toMatch(/bg-muted/);
  });
});

describe('ValueStepper at large OS text (WP-04 device pass)', () => {
  function renderStepper() {
    return render(
      <ValueStepper
        testID="w"
        value={62.5}
        next={noopNext}
        onChange={jest.fn()}
        format={(v) => String(v)}
        caption="kg"
        name="Weight"
      />,
    );
  }

  it('keeps 44 pt −/+ at default size', async () => {
    const dims = jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
    await renderStepper();
    // (PressableScale's className is compiled away under Jest — hitSlop shows the mode.)
    expect(screen.getByTestId('w-inc').props.hitSlop).toEqual({ top: 4, bottom: 4 });
    dims.mockRestore();
  });

  it('narrows the −/+ visual to 36 pt above 1.2x and keeps a 44 pt hit area via hitSlop', async () => {
    const dims = jest
      .spyOn(ReactNative, 'useWindowDimensions')
      .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1.6 });
    await renderStepper();
    const inc = screen.getByTestId('w-inc');
    expect(inc.props.hitSlop).toMatchObject({ left: 4, right: 4 });
    dims.mockRestore();
  });
});
