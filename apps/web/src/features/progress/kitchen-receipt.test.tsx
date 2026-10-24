// @vitest-environment jsdom
import { receiptFixture, summaryFixture } from '@/test-support/progress-fixtures';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KitchenReceipt } from './kitchen-receipt';

afterEach(cleanup);

describe('KitchenReceipt', () => {
  it('lists each reason with its XP and the total (counted up to its final value)', () => {
    render(<KitchenReceipt receipt={receiptFixture()} />);
    const receipt = screen.getByTestId('kitchen-receipt');
    expect(receipt.textContent).toContain('Kitchen receipt');
    expect(receipt.textContent).toContain('Cooked at home');
    expect(receipt.textContent).toContain('+25');
    expect(receipt.textContent).toContain('First time making this recipe');
    expect(receipt.textContent).toContain('+10');
    // The total counts up from 0 on mount; it lands on the receipt's XP.
    expect(screen.getByTestId('receipt-total').textContent).toMatch(/^\+\d+ XP$/);
  });

  it('shows the level bar, a PR detail and the soft-cap note', () => {
    render(
      <KitchenReceipt
        receipt={receiptFixture({
          kind: 'WORKOUT_PRS',
          capped: true,
          lines: [{ code: 'PR_WEIGHT', xp: 10, detail: 'Bench press' }],
        })}
        level={summaryFixture().xp}
      />,
    );
    const receipt = screen.getByTestId('kitchen-receipt');
    expect(receipt.textContent).toContain('Heaviest set yet · Bench press');
    expect(receipt.textContent).toContain('Busy day: extra actions still count, at half XP.');
    expect(receipt.textContent).toContain('Lv 7');
    expect(receipt.textContent).toContain('340 / 500');
  });
});
