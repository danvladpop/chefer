import { Platform } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Button, withLabelSlack } from '@chefer/ui-mobile';
import { TrainButton } from '../../src/features/shell/train/train-button';

// Android tablet: "Add to my week" drew as "Add to my" — the shrink-wrapped
// label re-wrapped at draw time and the one-line frame clipped "week". Both
// shared button components now draw their label with a trailing no-break
// space on Android (room for the glyphs, still wraps when it must), and keep
// the plain label as the button's accessible name.
// RNTL v14: render / act are async — always await them.

const NBSP = '\u00A0';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('withLabelSlack', () => {
  it('adds a no-break space on Android only', () => {
    expect(withLabelSlack('Add to my week', 'android')).toBe(`Add to my week${NBSP}`);
    expect(withLabelSlack('Add to my week', 'ios')).toBe('Add to my week');
  });
});

describe.each(['android', 'ios'] as const)('button labels on %s', (os) => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', os);
  });

  const drawn = (label: string) => (os === 'android' ? `${label}${NBSP}` : label);

  it('TrainButton draws the slack and keeps a clean accessible name', async () => {
    await render(
      <TrainButton testID="add" icon="calendar" label="Add to my week" onPress={jest.fn()} />,
    );
    const button = screen.getByTestId('add');
    expect(button.props.accessibilityLabel).toBe('Add to my week');
    // The visible label still allows a second line for long labels / big type.
    const text = screen.getByText('Add to my week');
    expect(text.props.children).toBe(drawn('Add to my week'));
    expect(text.props.numberOfLines).toBe(2);
    expect(screen.getByRole('button', { name: 'Add to my week' })).toBeOnTheScreen();
  });

  it('the kit Button draws the slack and keeps a clean accessible name', async () => {
    await render(
      <Button testID="sign-in" onPress={jest.fn()}>
        Sign in
      </Button>,
    );
    expect(screen.getByTestId('sign-in').props.accessibilityLabel).toBe('Sign in');
    expect(screen.getByText('Sign in').props.children).toBe(drawn('Sign in'));
  });

  it('a caller’s own accessibilityLabel still wins on the kit Button', async () => {
    await render(
      <Button testID="save" accessibilityLabel="Save your weekly plan" onPress={jest.fn()}>
        Save
      </Button>,
    );
    expect(screen.getByTestId('save').props.accessibilityLabel).toBe('Save your weekly plan');
  });
});
