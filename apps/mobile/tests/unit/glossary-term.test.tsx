import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from '@chefer/ui-mobile';
import { GlossaryTerm } from '../../src/components/glossary-term';

// PAT-7 (technical-plan.md §2.7): a jargon term inline in running copy —
// presentational only (W0-A orchestrator decision: no glossary.ts import,
// term + definition come from props).

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('GlossaryTerm', () => {
  it('renders the term inline and opens an ExplainSheet with the definition on tap', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <View className="flex-row flex-wrap">
          <Text>Rest 1–2 </Text>
          <GlossaryTerm
            term="RIR"
            definition="Reps in reserve: how many more you could have done before failing."
            testID="glossary-rir"
          />
          <Text> before the next set.</Text>
        </View>
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('glossary-rir')).toHaveTextContent('RIR');
    expect(screen.queryByTestId('glossary-rir-sheet')).toBeNull();

    await fireEvent.press(screen.getByTestId('glossary-rir'));
    expect(screen.getByTestId('glossary-rir-sheet-title')).toHaveTextContent('RIR');
    expect(screen.getByTestId('glossary-rir-sheet-sentence')).toHaveTextContent(
      'Reps in reserve: how many more you could have done before failing.',
    );
  });

  it('uses a custom title when given, and has an accessible "term, definition" label', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <GlossaryTerm
          term="e1RM"
          title="Estimated one-rep max"
          definition="The most you could lift once, worked out from a heavier set."
          testID="glossary-e1rm"
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('glossary-e1rm').props.accessibilityLabel).toBe('e1RM, definition');
    await fireEvent.press(screen.getByTestId('glossary-e1rm'));
    expect(screen.getByTestId('glossary-e1rm-sheet-title')).toHaveTextContent(
      'Estimated one-rep max',
    );
  });

  it('closes from the sheet close button', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <GlossaryTerm
          term="deload"
          definition="A lighter week to recover."
          testID="glossary-deload"
        />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByTestId('glossary-deload'));
    expect(screen.getByTestId('glossary-deload-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('glossary-deload-sheet-close'));
    expect(screen.queryByTestId('glossary-deload-sheet-title')).toBeNull();
  });
});
