import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { ExplainSheet } from '@chefer/ui-mobile';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('ExplainSheet (PAT-1)', () => {
  it('renders the sentence, rows and footnote, and the action changes an input', async () => {
    const user = userEvent.setup();
    const onAction = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ExplainSheet
          visible
          onClose={jest.fn()}
          eyebrow="Why this target"
          title="Protein"
          sentence="You get 128 g because you train 4× a week."
          rows={[
            { label: 'Weight', value: '80 kg' },
            { label: 'Activity', value: 'Active' },
          ]}
          footnote="Change your goal to change this."
          action={{ label: 'Change your goal', onPress: onAction }}
          testID="explain-protein"
        />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('explain-protein-title')).toHaveTextContent('Protein');
    expect(screen.getByText('Why this target')).toBeOnTheScreen();
    expect(screen.getByTestId('explain-protein-sentence')).toHaveTextContent(
      'You get 128 g because you train 4× a week.',
    );
    expect(screen.getByText('Weight')).toBeOnTheScreen();
    expect(screen.getByText('80 kg')).toBeOnTheScreen();
    expect(screen.getByText('Change your goal to change this.')).toBeOnTheScreen();

    await user.press(screen.getByText('Change your goal'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders no sentence element when sentence is omitted, and no rows block when rows is empty', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ExplainSheet
          visible
          onClose={jest.fn()}
          title="Loading…"
          rows={[]}
          testID="explain-loading"
        />
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('explain-loading-sentence')).toBeNull();
  });

  it('closes from the close button', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ExplainSheet
          visible
          onClose={onClose}
          title="Price"
          sentence="≈ 996 lei · Mon–Sun · 1 portion"
          rows={[]}
          testID="explain-price"
        />
      </SafeAreaProvider>,
    );
    await user.press(screen.getByTestId('explain-price-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
