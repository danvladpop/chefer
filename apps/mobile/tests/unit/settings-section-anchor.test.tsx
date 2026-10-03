import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import {
  SECTION_HIGHLIGHT_MS,
  SECTION_SETTLE_MS,
  SectionAnchor,
  useSectionTitle,
} from '../../src/features/settings/section-anchor';

// UX-ACC-04: `?section=` scrolls to the card the Settings row named, tints it
// for a moment, titles the screen after the row — and then leaves the user alone.

let mockParams: { section?: string | string[] } = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));

const mockScrollIntoView = jest.fn();
jest.mock('@chefer/ui-mobile', () => ({
  ...jest.requireActual<Record<string, unknown>>('@chefer/ui-mobile'),
  useScrollFieldIntoView: () => mockScrollIntoView,
}));

function Title({ fallback }: { fallback: string }) {
  return <Text testID="title">{useSectionTitle(fallback)}</Text>;
}

const layoutEvent = { nativeEvent: { layout: { x: 0, y: 400, width: 300, height: 120 } } };

beforeEach(() => {
  jest.useFakeTimers();
  mockParams = {};
  mockScrollIntoView.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('SectionAnchor', () => {
  it('scrolls to and tints the card named by ?section=', async () => {
    mockParams = { section: 'targets' };
    await render(
      <>
        <SectionAnchor id="goal-body">
          <Text>Goal</Text>
        </SectionAnchor>
        <SectionAnchor id="targets">
          <Text>Targets</Text>
        </SectionAnchor>
      </>,
    );
    await fireEvent(screen.getByTestId('section-goal-body'), 'layout', layoutEvent);
    expect(mockScrollIntoView).not.toHaveBeenCalled();
    expect(String(screen.getByTestId('section-goal-body').props.className)).not.toMatch(
      /bg-primary/,
    );

    await fireEvent(screen.getByTestId('section-targets'), 'layout', layoutEvent);
    expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
    expect(String(screen.getByTestId('section-targets').props.className)).toMatch(/bg-primary/);

    await act(() => {
      jest.advanceTimersByTime(SECTION_HIGHLIGHT_MS + 10);
    });
    expect(String(screen.getByTestId('section-targets').props.className)).not.toMatch(/bg-primary/);
  });

  it('re-scrolls while the cards above it settle, then stops fighting the user', async () => {
    mockParams = { section: 'pause' };
    await render(
      <SectionAnchor id="pause">
        <Text>Pause</Text>
      </SectionAnchor>,
    );
    const anchor = screen.getByTestId('section-pause');
    await fireEvent(anchor, 'layout', layoutEvent);
    await fireEvent(anchor, 'layout', layoutEvent);
    expect(mockScrollIntoView).toHaveBeenCalledTimes(2);

    await act(() => {
      jest.advanceTimersByTime(SECTION_SETTLE_MS + 10);
    });
    await fireEvent(anchor, 'layout', layoutEvent);
    expect(mockScrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a section, or with one it does not know', async () => {
    mockParams = { section: 'nonsense' };
    await render(
      <SectionAnchor id="targets">
        <Text>Targets</Text>
      </SectionAnchor>,
    );
    await fireEvent(screen.getByTestId('section-targets'), 'layout', layoutEvent);
    expect(mockScrollIntoView).not.toHaveBeenCalled();
  });
});

describe('useSectionTitle', () => {
  it('titles the screen after the row that opened it', async () => {
    mockParams = { section: 'safety' };
    await render(<Title fallback="Preferences" />);
    expect(screen.getByTestId('title')).toHaveTextContent('Allergies & diets');
  });

  it('keeps the screen’s own title without a section (or with an unknown one)', async () => {
    await render(<Title fallback="Preferences" />);
    expect(screen.getByTestId('title')).toHaveTextContent('Preferences');
    mockParams = { section: 'constructor' };
    await render(<Title fallback="Profile" />);
    expect(screen.getAllByTestId('title').at(-1)).toHaveTextContent('Profile');
  });
});
