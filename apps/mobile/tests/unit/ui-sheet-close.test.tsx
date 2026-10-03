import { Keyboard, Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Sheet, useScrollFieldIntoView, type ScrollFieldIntoView } from '@chefer/ui-mobile';

// UX-FOOD-16: every Sheet close path dismisses the keyboard, so Save in a
// numeric sheet never leaves a keyboard up with nothing focused.
// UX-X-03: the grabber + header carry the drag-to-dismiss handlers.
// UX-FOOD-10: fields inside a Sheet body can scroll themselves clear of the keyboard.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Harness({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <Sheet visible={visible} onClose={onClose} title="Edit entry" testID="sheet">
        <RNText>Body</RNText>
      </Sheet>
    </SafeAreaProvider>
  );
}

describe('Sheet close path', () => {
  afterEach(() => jest.restoreAllMocks());

  it('dismisses the keyboard when ✕ closes the sheet', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const onClose = jest.fn();
    await render(<Harness visible onClose={onClose} />);
    expect(dismiss).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('sheet-close'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses the keyboard when the backdrop closes the sheet', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await render(<Harness visible onClose={jest.fn()} />);
    await fireEvent.press(screen.getByLabelText('Close Edit entry'));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses the keyboard when the parent hides the sheet itself (after Save)', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const { rerender } = await render(<Harness visible onClose={jest.fn()} />);
    expect(dismiss).not.toHaveBeenCalled();

    await rerender(<Harness visible={false} onClose={jest.fn()} />);
    expect(dismiss).toHaveBeenCalled();
  });
});

describe('Sheet drag handle (UX-X-03)', () => {
  it('puts the pan handlers on the grabber + header, not on the scrolling body', async () => {
    await render(<Harness visible onClose={jest.fn()} />);
    const handle = screen.getByTestId('sheet-drag-handle');
    expect(typeof handle.props.onResponderMove).toBe('function');
    expect(typeof handle.props.onResponderRelease).toBe('function');
    expect(screen.getByTestId('sheet-scroll').props.onResponderMove).toBeUndefined();
  });

  it('still lets ✕ be tapped (the handle only claims a vertical move)', async () => {
    const onClose = jest.fn();
    await render(<Harness visible onClose={onClose} />);
    await fireEvent.press(screen.getByTestId('sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Sheet body keyboard scrolling (UX-FOOD-10)', () => {
  it('hands its fields a working useScrollFieldIntoView', async () => {
    let scrollFieldIntoView: ScrollFieldIntoView | undefined;
    function Probe() {
      scrollFieldIntoView = useScrollFieldIntoView();
      return null;
    }
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Sheet visible onClose={jest.fn()} title="Quick add" testID="sheet">
          <Probe />
        </Sheet>
      </SafeAreaProvider>,
    );
    const measureLayout = jest.fn((_rel: unknown, onSuccess: (x: number, y: number) => void) =>
      onSuccess(0, 300),
    );
    await act(() => {
      scrollFieldIntoView?.({ measureLayout });
    });
    expect(measureLayout).toHaveBeenCalledTimes(1);
  });
});
