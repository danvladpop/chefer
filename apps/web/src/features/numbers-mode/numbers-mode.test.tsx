// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumbersModeHost, NumbersModeProvider, useNumbersMode } from './numbers-mode';

// WP-08: ONE predicate for every surface. null / NONE (reserved for WP-16) /
// unknown values are the full numbers; only PROTEIN_ONLY changes anything.

const m = vi.hoisted(() => ({ prefs: undefined as { numbersMode?: string | null } | undefined }));
vi.mock('@/lib/trpc', () => ({
  trpc: { preferences: { get: { useQuery: () => ({ data: m.prefs }) } } },
}));

afterEach(cleanup);

function Probe({ payloadMode }: { payloadMode?: string | null }) {
  const { mode, proteinOnly } = useNumbersMode(payloadMode);
  return <p data-testid="probe">{`${mode}:${String(proteinOnly)}`}</p>;
}
const probe = () => screen.getByTestId('probe').textContent;

describe('useNumbersMode', () => {
  it('is FULL with no provider (every existing screen and test)', () => {
    render(<Probe />);
    expect(probe()).toBe('FULL:false');
  });

  it.each([
    ['PROTEIN_ONLY', 'PROTEIN_ONLY:true'],
    ['FULL', 'FULL:false'],
    ['NONE', 'FULL:false'],
    ['protein_only', 'FULL:false'],
    ['something-new', 'FULL:false'],
    [null, 'FULL:false'],
  ])('a stored %s reads %s', (stored, expected) => {
    render(
      <NumbersModeProvider mode={stored}>
        <Probe />
      </NumbersModeProvider>,
    );
    expect(probe()).toBe(expected);
  });

  it('an unknown value (undefined) inherits the parent; a payload value wins once loaded', () => {
    render(
      <NumbersModeProvider mode="PROTEIN_ONLY">
        <NumbersModeProvider mode={undefined}>
          <Probe />
        </NumbersModeProvider>
        <NumbersModeProvider mode={null}>
          <Probe />
        </NumbersModeProvider>
        <Probe payloadMode="FULL" />
      </NumbersModeProvider>,
    );
    const all = screen.getAllByTestId('probe').map((n) => n.textContent);
    expect(all).toEqual(['PROTEIN_ONLY:true', 'FULL:false', 'FULL:false']);
  });

  it('the host feeds every page from preferences.get, and stays FULL until it has loaded', () => {
    m.prefs = undefined;
    const { rerender } = render(
      <NumbersModeHost>
        <Probe />
      </NumbersModeHost>,
    );
    expect(probe()).toBe('FULL:false');
    m.prefs = { numbersMode: 'PROTEIN_ONLY' };
    rerender(
      <NumbersModeHost>
        <Probe />
      </NumbersModeHost>,
    );
    expect(probe()).toBe('PROTEIN_ONLY:true');
    m.prefs = { numbersMode: null };
    rerender(
      <NumbersModeHost>
        <Probe />
      </NumbersModeHost>,
    );
    expect(probe()).toBe('FULL:false');
  });
});
