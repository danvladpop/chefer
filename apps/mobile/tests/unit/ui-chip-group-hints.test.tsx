import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChipGroup } from '@chefer/ui-mobile';

// ChipGroup's disabledValues + hints (T-00.5 kit half): a gated option
// (e.g. "Two of us" behind Premium) renders disabled, never selectable, with
// a short visible + accessibility-hint caption.

const options = [
  { value: 'just-me', label: 'Just me', testID: 'household-just-me' },
  { value: 'two-of-us', label: 'Two of us', testID: 'household-two-of-us' },
] as const;

describe('ChipGroup disabledValues + hints', () => {
  it('renders a disabled chip with its caption and blocks selection', async () => {
    const onChange = jest.fn();
    await render(
      <ChipGroup
        options={options}
        value={['just-me']}
        onChange={onChange}
        disabledValues={['two-of-us']}
        hints={{ 'two-of-us': 'Part of Premium' }}
      />,
    );

    expect(screen.getByTestId('household-two-of-us')).toBeDisabled();
    expect(screen.getByTestId('household-two-of-us-hint')).toHaveTextContent('Part of Premium');
    expect(screen.getByTestId('household-two-of-us').props.accessibilityHint).toBe(
      'Part of Premium',
    );

    await fireEvent.press(screen.getByTestId('household-two-of-us'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('an enabled option has no hint caption and still toggles normally', async () => {
    const onChange = jest.fn();
    await render(
      <ChipGroup
        options={options}
        value={[]}
        onChange={onChange}
        disabledValues={['two-of-us']}
        hints={{ 'two-of-us': 'Part of Premium' }}
      />,
    );

    expect(screen.queryByTestId('household-just-me-hint')).toBeNull();
    await fireEvent.press(screen.getByTestId('household-just-me'));
    expect(onChange).toHaveBeenCalledWith(['just-me']);
  });

  it('with no disabledValues/hints, behaves exactly as before (no captions)', async () => {
    const onChange = jest.fn();
    await render(<ChipGroup options={options} value={['just-me']} onChange={onChange} />);
    expect(screen.getByTestId('household-two-of-us')).not.toBeDisabled();
    expect(screen.queryByTestId('household-two-of-us-hint')).toBeNull();
  });
});
