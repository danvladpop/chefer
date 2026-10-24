// @vitest-environment jsdom
import { useState } from 'react';
import {
  progressMock,
  receiptFixture,
  resetProgressMock,
  summaryFixture,
} from '@/test-support/progress-fixtures';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROGRESS_SETTINGS } from '@chefer/types';
import { CookFinishedProgress, useFinishCook } from './cook-finish';

vi.mock('@/lib/trpc', () =>
  import('@/test-support/progress-fixtures').then((m) => m.progressTrpcMock),
);

beforeEach(() => {
  resetProgressMock();
  progressMock.finishCookResult = { receipt: receiptFixture(), unlocks: [], levelUp: null };
});
afterEach(cleanup);

/** What cook-mode does: the hook in the page, the receipt block on the finish screen. */
function Harness({ initialFinished = false }: { initialFinished?: boolean }) {
  const [finished, setFinished] = useState(initialFinished);
  const finish = useFinishCook('recipe-1', finished);
  return (
    <div>
      <button onClick={() => setFinished(true)}>finish</button>
      <button onClick={() => setFinished(false)}>back</button>
      {finished && <CookFinishedProgress result={finish.data} />}
    </div>
  );
}

describe('useFinishCook', () => {
  it('does not record anything until the cook is finished', () => {
    render(<Harness />);
    expect(progressMock.mutate.finishCook).not.toHaveBeenCalled();
  });

  it('records the cook once, with a client UUID, even when finishing twice', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('finish'));
    expect(progressMock.mutate.finishCook).toHaveBeenCalledTimes(1);
    const input = progressMock.mutate.finishCook.mock.calls[0]?.[0] as {
      id: string;
      recipeId: string;
      localDate: string;
    };
    expect(input.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(input.recipeId).toBe('recipe-1');
    expect(input.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Back to steps, finish again: still one cook.
    fireEvent.click(screen.getByText('back'));
    fireEvent.click(screen.getByText('finish'));
    expect(progressMock.mutate.finishCook).toHaveBeenCalledTimes(1);
  });

  it('records the cook for everyone: with the flag off the call still happens, the receipt does not show', () => {
    progressMock.flags = { gamification: false };
    render(<Harness initialFinished />);
    expect(progressMock.mutate.finishCook).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('cook-progress')).toBeNull();
    expect(progressMock.queries['summary']).toBeUndefined();
  });
});

describe('CookFinishedProgress', () => {
  it("shows Biscuit's line, the cook count and the receipt when the gate is on", () => {
    render(<Harness initialFinished />);
    const block = screen.getByTestId('cook-progress');
    expect(block.textContent).toContain('Home-cooked dinner #37');
    expect(screen.getByTestId('cook-biscuit-line').textContent).toContain('— Biscuit');
    expect(screen.getByTestId('kitchen-receipt').textContent).toContain('Cooked at home');
  });

  it('leaves Biscuit out when he is switched off, or in quiet mode', () => {
    progressMock.summary = summaryFixture({
      settings: { ...DEFAULT_PROGRESS_SETTINGS, biscuit: false },
    });
    const { unmount } = render(<Harness initialFinished />);
    expect(screen.queryByTestId('cook-biscuit-line')).toBeNull();
    expect(screen.getByTestId('kitchen-receipt')).toBeTruthy();
    unmount();

    progressMock.summary = summaryFixture({ quiet: true });
    render(<Harness initialFinished />);
    expect(screen.queryByTestId('cook-biscuit-line')).toBeNull();
  });

  it('shows nothing when the server sent no receipt, or XP is hidden', () => {
    progressMock.finishCookResult = { receipt: null, unlocks: [], levelUp: null };
    const { unmount } = render(<Harness initialFinished />);
    expect(screen.queryByTestId('cook-progress')).toBeNull();
    unmount();

    progressMock.finishCookResult = { receipt: receiptFixture(), unlocks: [], levelUp: null };
    progressMock.summary = summaryFixture({
      settings: { ...DEFAULT_PROGRESS_SETTINGS, showXp: false },
    });
    render(<Harness initialFinished />);
    expect(screen.queryByTestId('cook-progress')).toBeNull();
  });
});
