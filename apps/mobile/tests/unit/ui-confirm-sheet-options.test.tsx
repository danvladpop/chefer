import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { ConfirmSheet, type ConfirmSheetOption } from '@chefer/ui-mobile';

// PAT-5 (technical-plan.md §2.5): ConfirmSheet's "keep my changes" options
// slot — Regenerate's "Keep the 4 meals you chose", downgrade's "you'll
// keep / you'll lose".

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function ControlledSheet({ initial }: { initial: boolean }) {
  const [keep, setKeep] = useState(initial);
  const options: ConfirmSheetOption[] = [
    {
      label: 'Keep the meals you chose',
      detail: '4 meals stay as they are',
      value: keep,
      onChange: setKeep,
    },
  ];
  return (
    <ConfirmSheet
      visible
      onClose={jest.fn()}
      title="Regenerate this week?"
      body="This replaces every meal that hasn't been eaten yet."
      confirmLabel="Regenerate 28 Sep – 4 Oct"
      cancelLabel="Cancel"
      onConfirm={jest.fn()}
      options={options}
      testID="regen-confirm"
    />
  );
}

describe('ConfirmSheet options slot (PAT-5)', () => {
  it('renders no options block when options is omitted', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ConfirmSheet
          visible
          onClose={jest.fn()}
          title="Sign out of Chefer?"
          body="You can sign back in any time."
          confirmLabel="Sign out"
          cancelLabel="Cancel"
          onConfirm={jest.fn()}
          testID="signout-confirm"
        />
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('signout-confirm-option-0')).toBeNull();
  });

  it('renders a label, detail and switch per option, reflecting its value', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ControlledSheet initial />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Keep the meals you chose')).toBeOnTheScreen();
    expect(screen.getByText('4 meals stay as they are')).toBeOnTheScreen();
    expect(screen.getByTestId('regen-confirm-option-0-switch')).toHaveProp('value', true);
  });

  it('toggling the switch calls onChange and updates the value', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ControlledSheet initial={false} />
      </SafeAreaProvider>,
    );
    const toggle = screen.getByTestId('regen-confirm-option-0-switch');
    expect(toggle).toHaveProp('value', false);
    await fireEvent(toggle, 'valueChange', true);
    expect(screen.getByTestId('regen-confirm-option-0-switch')).toHaveProp('value', true);
  });

  it('the destructive scoped confirm label still names the object and scope', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ConfirmSheet
          visible
          onClose={jest.fn()}
          title="Switch back to Free?"
          body="You'll keep your recipes. You'll lose the AI chef and saved targets."
          confirmLabel="Switch to Free"
          cancelLabel="Stay on Premium"
          onConfirm={onConfirm}
          destructive
          options={[
            {
              label: 'Keep my saved targets',
              value: true,
              onChange: jest.fn(),
            },
          ]}
          testID="downgrade-confirm"
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('downgrade-confirm-confirm')).toHaveTextContent('Switch to Free');
    await user.press(screen.getByTestId('downgrade-confirm-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
