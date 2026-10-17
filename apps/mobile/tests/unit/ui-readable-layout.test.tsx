import * as ReactNative from 'react-native';
import { Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen } from '@testing-library/react-native';
import {
  heroHeight,
  heroMaxWidth,
  READABLE_MAX_WIDTH,
  readableContentWidth,
  readableGutter,
  Screen,
  Sheet,
  SHEET_MAX_WIDTH,
} from '@chefer/ui-mobile';

// Large screens (tablet / landscape / foldable): readable content is capped at
// one centred column, sheets at a phone-width panel, heroes at a share of the
// window height — and at phone widths nothing changes at all.
// RNTL v14: render / act are async — always await them.

const PHONE_WIDTHS = [320, 360, 375, 390, 393, 412, 430];

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const initialWindow = ReactNative.Dimensions.get('window');

/** Resizes the (shared) window the way a rotation or a split screen would. */
async function mockWindow(width: number, height: number) {
  const window = { width, height, scale: 2, fontScale: 1 };
  await act(() => {
    ReactNative.Dimensions.set({ window, screen: window });
  });
}

/** Every style object in the (possibly nested) style prop of this testID. */
function stylesOf(testID: string): Record<string, unknown>[] {
  const style = screen.getByTestId(testID).props.style as unknown;
  return ([] as unknown[]).concat(style).flat(Infinity).filter(Boolean) as Record<
    string,
    unknown
  >[];
}

afterEach(async () => {
  await mockWindow(initialWindow.width, initialWindow.height);
});

describe('readable column math', () => {
  it.each(PHONE_WIDTHS)('a %ipt phone gets no gutter', (width) => {
    expect(readableGutter(width)).toBe(0);
    expect(readableContentWidth(width)).toBe(width);
  });

  it('kicks in only once each side gets a real gutter', () => {
    // A foldable's inner screen in portrait (~673–720pt) keeps its own padding.
    expect(readableGutter(READABLE_MAX_WIDTH + 47)).toBe(0);
    expect(readableGutter(READABLE_MAX_WIDTH + 48)).toBe(24);
  });

  it('centres a READABLE_MAX_WIDTH column on tablets and in landscape', () => {
    expect(readableGutter(1280)).toBe(300); // 10" tablet, landscape
    expect(readableContentWidth(1280)).toBe(READABLE_MAX_WIDTH);
    expect(readableGutter(800)).toBe(60); // 10" tablet, portrait
    expect(readableGutter(915)).toBe(117); // Pixel 8, landscape
    expect(readableContentWidth(915)).toBe(681);
  });

  it('caps a hero at 40% of the window height', () => {
    expect(heroMaxWidth(800, 1.5)).toBe(480); // tablet landscape: 480 × 320
    // A phone in portrait: wider than the screen, so the hero stays full width.
    expect(heroMaxWidth(844, 1.5)).toBeGreaterThan(390);
    expect(heroMaxWidth(568, 1.5)).toBeGreaterThan(320);
  });

  it('keeps a phone hero at its fixed height and grows it with the column elsewhere', () => {
    const recipe = { minHeight: 224, aspectRatio: 16 / 9, horizontalPadding: 32 };
    for (const width of PHONE_WIDTHS) {
      expect(heroHeight({ ...recipe, windowWidth: width, windowHeight: 844 })).toBe(224);
    }
    // Tablet landscape: 648pt wide column, capped at 40% of 800.
    expect(heroHeight({ ...recipe, windowWidth: 1280, windowHeight: 800 })).toBe(320);
    // Tablet portrait: 16:9 of the 648pt column.
    expect(heroHeight({ ...recipe, windowWidth: 800, windowHeight: 1280 })).toBe(365);
  });
});

describe('Screen', () => {
  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Screen testID="screen" className="px-0" style={{ paddingTop: 7 }}>
          <RNText>Body</RNText>
        </Screen>
      </SafeAreaProvider>,
    );

  it.each(PHONE_WIDTHS)('passes the style through untouched at %ipt', async (width) => {
    await mockWindow(width, 844);
    await renderScreen();
    expect(screen.getByTestId('screen').props.style).toEqual({ paddingTop: 7 });
  });

  it('pads the sides out to the centred column on a wide window', async () => {
    await mockWindow(1280, 800);
    await renderScreen();
    const styles = stylesOf('screen');
    expect(styles).toContainEqual({ paddingTop: 7 });
    expect(styles).toContainEqual({ paddingLeft: 300, paddingRight: 300 });
  });
});

describe('Sheet', () => {
  it('caps the panel at SHEET_MAX_WIDTH and centres it (full width below that)', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Sheet visible onClose={jest.fn()} title="Log something" testID="sheet">
          <RNText>Body</RNText>
        </Sheet>
      </SafeAreaProvider>,
    );
    // The panel is the first child of the keyboard-inset wrapper after the scrim.
    const wrapper = screen.getByTestId('sheet-keyboard-inset');
    const panel = wrapper.children[1] as unknown as { props: { style: unknown } };
    const styles = ([] as unknown[]).concat(panel.props.style).flat(Infinity).filter(Boolean);
    expect(styles).toContainEqual({
      width: '100%',
      maxWidth: SHEET_MAX_WIDTH,
      alignSelf: 'center',
    });
  });
});
