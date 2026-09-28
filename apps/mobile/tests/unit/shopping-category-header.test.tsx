import { render, screen } from '@testing-library/react-native';
import { CategoryHeader } from '../../src/features/shopping-list/category-header';

// Bug B-28 (T-BUG-28): ticking a Shop item visibly reflowed the whole list,
// even though no ITEM row's own height changes when it's checked (stable
// keys, no sort-by-checked, no LayoutAnimation — already ruled out before
// this fix). The real cause: the CATEGORY HEADER's own label text grows on
// every tick ("3 items" → "3 items · 1 done") and had no `min-w-0` /
// `numberOfLines` on a Text flex child inside a `justify-between` row — the
// #1 documented overflow cause in this codebase (CLAUDE.md) — so past a
// certain width/text-scale it wrapped to a second line, changing the
// header's own height and reflowing everything below it. jsdom/RNTL doesn't
// compute real flexbox wrapping, so this locks in the actual fix (single
// line, truncated) as a contract instead of measuring pixels.

describe('CategoryHeader (bug B-28)', () => {
  it('caps the label to one line regardless of how the done-count text grows', async () => {
    await render(
      <CategoryHeader
        testID="category-produce"
        label="Produce"
        itemCount={3}
        doneCount={0}
        expanded={false}
        onPress={jest.fn()}
      />,
    );
    const label = screen.getByTestId('category-produce-label');
    expect(label.props.numberOfLines).toBe(1);
  });

  it('keeps numberOfLines=1 as the done count (and the "✓ all" badge) appear', async () => {
    const { rerender } = await render(
      <CategoryHeader
        testID="category-produce"
        label="Produce"
        itemCount={3}
        doneCount={0}
        expanded={false}
        onPress={jest.fn()}
      />,
    );

    for (const doneCount of [1, 2, 3]) {
      await rerender(
        <CategoryHeader
          testID="category-produce"
          label="Produce"
          itemCount={3}
          doneCount={doneCount}
          expanded={false}
          onPress={jest.fn()}
        />,
      );
      const label = screen.getByTestId('category-produce-label');
      // The fix: still one line, however long the trailing count text gets.
      expect(label.props.numberOfLines).toBe(1);
    }

    // All done: the "✓ all" badge is additional content in the row, not in
    // the label itself — it must not force the label to wrap either.
    expect(screen.getByText('✓ all')).toBeOnTheScreen();
    expect(screen.getByTestId('category-produce-label').props.numberOfLines).toBe(1);
  });

  it('shows the running count and "✓ all" only once every item is done', async () => {
    await render(
      <CategoryHeader
        testID="category-dairy"
        label="Dairy & Eggs"
        itemCount={2}
        doneCount={1}
        expanded={false}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText(/1 done/)).toBeOnTheScreen();
    expect(screen.queryByText('✓ all')).toBeNull();
  });
});
