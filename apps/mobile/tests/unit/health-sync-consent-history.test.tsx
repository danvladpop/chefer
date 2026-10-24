import { screen } from '@testing-library/react-native';
import { ConsentHistory } from '../../src/features/privacy/consent-history';
import { renderWithTrpc } from './friends-core-harness';
import { settle } from './trainer-fixtures';

// C2 health sync: a HEALTH_SYNC row names the health store and the data types
// that were on, never the raw enum.

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

function row(id: string, granted: boolean, providers: string[], createdAt: string) {
  return {
    id,
    kind: 'HEALTH_SYNC',
    granted,
    providers,
    documentVersion: null,
    contextId: null,
    createdAt,
  };
}

describe('Consent history: HEALTH_SYNC', () => {
  it('labels the types turned on, and turning everything off', async () => {
    await renderWithTrpc(<ConsentHistory />, {
      'privacy.getConsentHistory': () => [
        row('2', false, ['HEALTH_CONNECT'], '2026-10-23T10:00:00.000Z'),
        row('1', true, ['HEALTH_CONNECT', 'weight', 'steps'], '2026-10-22T10:00:00.000Z'),
      ],
    });
    await settle();
    expect(screen.getByText('Health Connect: weight, steps')).toBeOnTheScreen();
    expect(screen.getByText('Health Connect: turned off')).toBeOnTheScreen();
    expect(screen.queryByText('HEALTH_SYNC')).toBeNull();
  });
});
