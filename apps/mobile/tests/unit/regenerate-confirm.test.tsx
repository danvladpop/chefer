import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import { ConfirmSheet } from '@chefer/ui-mobile';
import { RegenerateConfirm } from '../../src/features/meal-plan/regenerate-confirm';

// UX-PLAN-01 (honest copy), UX-PLAN-03 (busy state + the quota error).

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

type Overrides = Partial<React.ComponentProps<typeof RegenerateConfirm>>;
async function renderConfirm(over: Overrides = {}) {
  const onConfirm = jest.fn();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RegenerateConfirm
        visible
        onClose={jest.fn()}
        weekLabel="28 Sep – 4 Oct"
        weekOffset={0}
        plannedMealsCount={21}
        pinnedCount={0}
        keepPicks
        onKeepPicksChange={jest.fn()}
        busy={false}
        error={null}
        onConfirm={onConfirm}
        {...over}
      />
    </SafeAreaProvider>,
  );
  return { onConfirm };
}

describe('RegenerateConfirm — copy (UX-PLAN-01)', () => {
  it("this week: says past days and logged meals stay, with no '21 meals' promise", async () => {
    await renderConfirm();
    const body = screen.getByTestId('regenerate-confirm-body');
    expect(body).toHaveTextContent(/Past days and meals you've already logged stay/);
    expect(body).not.toHaveTextContent('21');
  });

  it('next week: replaced whole, with its meal count', async () => {
    await renderConfirm({ weekOffset: 1 });
    expect(screen.getByTestId('regenerate-confirm-body')).toHaveTextContent(
      'This replaces the 21 planned meals.',
    );
  });
});

describe('RegenerateConfirm — busy and error (UX-PLAN-03)', () => {
  it('confirms once when idle', async () => {
    const user = userEvent.setup();
    const { onConfirm } = await renderConfirm();
    await user.press(screen.getByTestId('regenerate-confirm-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('while a generation runs the confirm button is busy and extra taps do nothing', async () => {
    const user = userEvent.setup();
    const { onConfirm } = await renderConfirm({ busy: true });
    const confirm = screen.getByTestId('regenerate-confirm-confirm');
    expect(confirm).toBeDisabled();
    expect(confirm.props.accessibilityState).toMatchObject({ busy: true });
    await user.press(confirm);
    await user.press(confirm);
    await user.press(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the quota message instead of swallowing it, and the button is usable again', async () => {
    const user = userEvent.setup();
    const message = "You've used today's 3 free plan generations.";
    const { onConfirm } = await renderConfirm({ error: message });
    expect(screen.getByTestId('regenerate-confirm-error')).toHaveTextContent(message);
    await user.press(screen.getByTestId('regenerate-confirm-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('no error line when there is no error', async () => {
    await renderConfirm();
    expect(screen.queryByTestId('regenerate-confirm-error')).toBeNull();
  });
});

describe('ConfirmSheet busy/error are opt-in (other callers unchanged)', () => {
  it('without busy/error it behaves as before', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    function Host() {
      const [n, setN] = useState(0);
      return (
        <ConfirmSheet
          visible
          testID="plain"
          title="Sure?"
          body="body"
          confirmLabel="Yes"
          cancelLabel="No"
          onConfirm={() => {
            setN(n + 1);
            onConfirm();
          }}
          onClose={jest.fn()}
        />
      );
    }
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Host />
      </SafeAreaProvider>,
    );
    await user.press(screen.getByTestId('plain-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('plain-error')).toBeNull();
  });
});
