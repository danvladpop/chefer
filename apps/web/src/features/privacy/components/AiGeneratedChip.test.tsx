// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AiGeneratedChip } from './AiGeneratedChip';

// UX-26 AC5 / T-26.6: the AI chip renders on AI-generated recipes only.
afterEach(cleanup);

describe('AiGeneratedChip', () => {
  it('renders on an AI-generated recipe', () => {
    render(<AiGeneratedChip recipe={{ aiGenerated: true }} />);
    expect(screen.getByTestId('ai-generated-chip').textContent).toContain('AI-generated');
  });

  it('renders nothing when the recipe is not flagged (or the API predates the flag)', () => {
    render(<AiGeneratedChip recipe={{ aiGenerated: false }} />);
    render(<AiGeneratedChip recipe={{}} />);
    render(<AiGeneratedChip recipe={null} />);
    expect(screen.queryByTestId('ai-generated-chip')).toBeNull();
  });
});
