import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TableSafety } from '@chefer/types';
import { WhatWeCheckSheet } from '../../src/features/safety/what-we-check-sheet';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderSheet(ui: JSX.Element) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

const TABLE: TableSafety = {
  people: [
    {
      who: 'you',
      isOwner: true,
      items: [{ id: 'vegetarian', label: 'Vegetarian', kind: 'diet' }],
      notes: [],
    },
    {
      who: 'Luca',
      isOwner: false,
      items: [{ id: 'tree-nuts', label: 'Tree nuts', kind: 'allergy' }],
      notes: ['low sugar'],
    },
  ],
  hasRules: true,
  needsReview: false,
};

describe('WhatWeCheckSheet (UX-02)', () => {
  it('lists every person and their rules, and notes what cannot be checked', async () => {
    await renderSheet(<WhatWeCheckSheet visible table={TABLE} onClose={jest.fn()} />);
    expect(screen.getByTestId('what-we-check-sheet-title')).toHaveTextContent(
      'Checked for your table',
    );
    expect(screen.getByText('Vegetarian')).toBeTruthy();
    expect(screen.getByText(/Tree nuts, .low sugar. \(a note\)/)).toBeTruthy();
  });

  it('the footer action closes the sheet and opens Settings', async () => {
    const onClose = jest.fn();
    await renderSheet(<WhatWeCheckSheet visible table={TABLE} onClose={onClose} />);
    await fireEvent.press(screen.getByTestId('what-we-check-sheet-edit'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/preferences');
  });

  it('a row calls onEditPerson with that person', async () => {
    const onEditPerson = jest.fn();
    await renderSheet(
      <WhatWeCheckSheet visible table={TABLE} onClose={jest.fn()} onEditPerson={onEditPerson} />,
    );
    await fireEvent.press(screen.getByTestId('what-we-check-sheet-row-Luca'));
    expect(onEditPerson).toHaveBeenCalledWith(TABLE.people[1]);
  });
});
