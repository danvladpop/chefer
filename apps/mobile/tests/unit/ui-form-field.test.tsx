import { Text as RNText } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { FormField } from '@chefer/ui-mobile';

// PAT-17 (03-ux-design-spec.md D.2): the label's accessible name reads
// "{label}, required"; the `*` glyph itself is hidden from the tree. The
// error replaces the hint and shows an `alert-circle`.

describe('FormField (PAT-17)', () => {
  it('a required field is announced as "{label}, required" and shows a visible *', async () => {
    await render(
      <FormField label="Name" required testID="ff-name">
        <RNText>control</RNText>
      </FormField>,
    );
    expect(screen.getByLabelText('Name, required')).toBeTruthy();
    expect(screen.getByText(/\*/, { includeHiddenElements: true })).toBeTruthy();
  });

  it('an optional field has no "required" in its accessible name and no *', async () => {
    await render(
      <FormField label="Description" testID="ff-desc">
        <RNText>control</RNText>
      </FormField>,
    );
    expect(screen.getByLabelText('Description')).toBeTruthy();
    expect(screen.queryByLabelText('Description, required')).toBeNull();
  });

  it('shows the hint when there is no error', async () => {
    await render(
      <FormField label="Servings" hint="1–20" testID="ff-servings">
        <RNText>control</RNText>
      </FormField>,
    );
    expect(screen.getByTestId('ff-servings-hint')).toHaveTextContent('1–20');
  });

  it('the error replaces the hint', async () => {
    await render(
      <FormField label="Name" hint="e.g. Grandma's lasagna" error="Add a name." testID="ff-name">
        <RNText>control</RNText>
      </FormField>,
    );
    expect(screen.getByTestId('ff-name-error-text')).toHaveTextContent('Add a name.');
    expect(screen.queryByTestId('ff-name-hint')).toBeNull();
  });
});
