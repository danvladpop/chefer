import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SEARCH_TARGET_PT, SearchField } from '@chefer/ui-mobile';

// SearchField (UX §3.1): labelled, return-key search, 44 pt clear target,
// 250 ms debounce.

describe('SearchField', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('is labelled and configured for search', async () => {
    await render(<SearchField accessibilityLabel="Search people by name" testID="sf" />);
    const input = screen.getByLabelText('Search people by name');
    expect(input.props.returnKeyType).toBe('search');
    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.autoCapitalize).toBe('words');
  });

  it('hides the clear button while empty', async () => {
    await render(<SearchField accessibilityLabel="Search" testID="sf" />);
    expect(screen.queryByLabelText('Clear search')).toBeNull();
  });

  it('shows a Clear search button (44 pt) once there is text', async () => {
    await render(<SearchField accessibilityLabel="Search" testID="sf" />);
    await fireEvent.changeText(screen.getByLabelText('Search'), 'ana');
    const clear = screen.getByLabelText('Clear search');
    expect(clear.props.accessibilityRole).toBe('button');
    expect(SEARCH_TARGET_PT).toBe(44);
    expect(clear).toHaveStyle({ minWidth: 44, minHeight: 44 });
    expect(screen.getByTestId('sf-field')).toHaveStyle({ minHeight: 44 });
  });

  it('clearing empties the field, notifies at once and cancels the pending debounce', async () => {
    const onChangeText = jest.fn();
    const onDebouncedChange = jest.fn();
    const onClear = jest.fn();
    await render(
      <SearchField
        accessibilityLabel="Search"
        onChangeText={onChangeText}
        onDebouncedChange={onDebouncedChange}
        onClear={onClear}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Search'), 'ana');
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByLabelText('Search').props.value).toBe('');
    expect(onChangeText).toHaveBeenLastCalledWith('');
    expect(onDebouncedChange).toHaveBeenCalledTimes(1);
    expect(onDebouncedChange).toHaveBeenLastCalledWith('');
    expect(onClear).toHaveBeenCalledTimes(1);
    await act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onDebouncedChange).toHaveBeenCalledTimes(1); // "ana" never fires
    expect(screen.queryByLabelText('Clear search')).toBeNull();
  });

  it('debounces onDebouncedChange by 250 ms and sends the latest text', async () => {
    const onDebouncedChange = jest.fn();
    await render(<SearchField accessibilityLabel="Search" onDebouncedChange={onDebouncedChange} />);
    const input = screen.getByLabelText('Search');
    await fireEvent.changeText(input, 'a');
    await act(() => {
      jest.advanceTimersByTime(200);
    });
    await fireEvent.changeText(input, 'an');
    await act(() => {
      jest.advanceTimersByTime(249);
    });
    expect(onDebouncedChange).not.toHaveBeenCalled();
    await act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDebouncedChange).toHaveBeenCalledTimes(1);
    expect(onDebouncedChange).toHaveBeenCalledWith('an');
  });

  it('the return key searches immediately and forwards onSubmitEditing', async () => {
    const onDebouncedChange = jest.fn();
    const onSubmitEditing = jest.fn();
    await render(
      <SearchField
        accessibilityLabel="Search"
        onDebouncedChange={onDebouncedChange}
        onSubmitEditing={onSubmitEditing}
      />,
    );
    const input = screen.getByLabelText('Search');
    await fireEvent.changeText(input, 'ana');
    await fireEvent(input, 'submitEditing', { nativeEvent: { text: 'ana' } });
    expect(onDebouncedChange).toHaveBeenCalledTimes(1);
    expect(onDebouncedChange).toHaveBeenCalledWith('ana');
    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
    await act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onDebouncedChange).toHaveBeenCalledTimes(1); // no second fire
  });

  it('works controlled', async () => {
    function Host() {
      const [q, setQ] = useState('bo');
      return <SearchField accessibilityLabel="Search" value={q} onChangeText={setQ} />;
    }
    await render(<Host />);
    expect(screen.getByLabelText('Search').props.value).toBe('bo');
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByLabelText('Search').props.value).toBe('');
  });

  it('disabled: not editable, no clear button', async () => {
    await render(<SearchField accessibilityLabel="Search" defaultValue="x" editable={false} />);
    expect(screen.getByLabelText('Search').props.editable).toBe(false);
    expect(screen.queryByLabelText('Clear search')).toBeNull();
  });

  it('does not fire after unmount', async () => {
    const onDebouncedChange = jest.fn();
    const view = await render(
      <SearchField accessibilityLabel="Search" onDebouncedChange={onDebouncedChange} />,
    );
    await fireEvent.changeText(screen.getByLabelText('Search'), 'ana');
    await view.unmount();
    await act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(onDebouncedChange).not.toHaveBeenCalled();
  });
});
