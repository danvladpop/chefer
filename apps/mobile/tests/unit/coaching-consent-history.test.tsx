import { screen } from '@testing-library/react-native';
import { COACHING_CONSENT_LABELS } from '@chefer/types';
import { ConsentHistory } from '../../src/features/privacy/consent-history';
import { renderWithTrpc } from './friends-core-harness';
import { settle } from './trainer-fixtures';

// WP-18 lane D: a COACHING_SHARING row reads "Trainer access allowed" / "Trainer access ended", never the
// raw enum (the API only sends these rows to API level 6+).

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

function row(id: string, granted: boolean, createdAt: string) {
  return {
    id,
    kind: 'COACHING_SHARING',
    granted,
    providers: [],
    documentVersion: '2026-10-01',
    contextId: 'link-1',
    createdAt,
  };
}

describe('Consent history: COACHING_SHARING', () => {
  it('labels a grant and a withdrawal from the shared copy', async () => {
    await renderWithTrpc(<ConsentHistory />, {
      'privacy.getConsentHistory': () => [
        row('2', false, '2026-10-03T10:00:00.000Z'),
        row('1', true, '2026-10-02T10:00:00.000Z'),
      ],
    });
    await settle();
    expect(COACHING_CONSENT_LABELS.granted).toBe('Trainer access allowed');
    expect(screen.getByText('Trainer access allowed')).toBeOnTheScreen();
    expect(screen.getByText('Trainer access ended')).toBeOnTheScreen();
    expect(screen.queryByText('COACHING_SHARING')).toBeNull();
  });
});
