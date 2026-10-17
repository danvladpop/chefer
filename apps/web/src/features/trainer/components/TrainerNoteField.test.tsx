// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { COACHING_LIMITS } from '@chefer/types';
import { TrainerNoteField } from './TrainerNoteField';

afterEach(cleanup);

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <TrainerNoteField clientName="Maria" value={value} onChange={setValue} />;
}

describe('TrainerNoteField', () => {
  it('has a real label ("Note for Maria") and a hint', () => {
    render(<Harness />);
    const field = screen.getByLabelText('Note for Maria');
    expect(field.tagName).toBe('TEXTAREA');
    expect(screen.getByText('Maria will see this note under the exercise.')).toBeInTheDocument();
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('accepts exactly 200 characters without an error', () => {
    render(<Harness initial={'a'.repeat(COACHING_LIMITS.trainerNoteMaxChars)} />);
    expect(screen.getByText('200 / 200')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('links the error to the field with aria-describedby past 200 characters', () => {
    render(<Harness />);
    const field = screen.getByLabelText('Note for Maria');
    fireEvent.change(field, { target: { value: 'a'.repeat(201) } });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('200 characters or fewer');
    const describedBy = field.getAttribute('aria-describedby') ?? '';
    expect(describedBy.split(' ')).toContain(alert.id);
    // Back under the limit: the error goes away.
    fireEvent.change(field, { target: { value: 'a'.repeat(200) } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(field).not.toHaveAttribute('aria-invalid');
  });
});
