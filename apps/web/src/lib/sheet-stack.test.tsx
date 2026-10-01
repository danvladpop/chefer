// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from '@chefer/ui';

// @chefer/ui overlays stack: a Sheet opened from inside another (the
// ingredient picker inside the import review, plan-ingredient-catalog §10)
// owns Escape on its own — one Escape used to close the parent too.

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);

describe('nested Sheets', () => {
  it('Escape closes only the top-most sheet', () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    const { rerender } = render(
      <Sheet open onClose={outerClose} title="Import a recipe">
        <p>outer</p>
        <Sheet open onClose={innerClose} title="Choose an ingredient">
          <p>inner</p>
        </Sheet>
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();

    // With the inner sheet closed, Escape reaches the outer one again.
    rerender(
      <Sheet open onClose={outerClose} title="Import a recipe">
        <p>outer</p>
        <Sheet open={false} onClose={innerClose} title="Choose an ingredient">
          <p>inner</p>
        </Sheet>
      </Sheet>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(outerClose).toHaveBeenCalledTimes(1);
  });
});
