import { fireEvent, render, screen } from '@testing-library/react-native';
import { UncheckedNotice } from '../../src/features/safety/unchecked-notice';

describe('UncheckedNotice (UX-01 "Something else" + UX-22 T-22.1)', () => {
  it('unrecognised: names the term and offers Keep as a note / Remove', async () => {
    const onKeepNote = jest.fn();
    const onRemove = jest.fn();
    await render(
      <UncheckedNotice testID="notice" term="zzz" onKeepNote={onKeepNote} onRemove={onRemove} />,
    );
    expect(screen.getByText(/Chefer can.t check for .zzz. yet/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('notice-keep-note'));
    expect(onKeepNote).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('notice-remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('condition: nothing is saved, offers Choose a goal / OK, never reads as medical advice', async () => {
    const onChooseGoal = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <UncheckedNotice
        testID="notice"
        variant="condition"
        term="pre-diabetes"
        onChooseGoal={onChooseGoal}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/pre-diabetes/)).toBeTruthy();
    expect(screen.queryByText(/medical advice/i)).toBeNull();
    await fireEvent.press(screen.getByTestId('notice-choose-goal'));
    expect(onChooseGoal).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('notice-ok'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
