import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import { PersonRow } from '../../src/features/friends/components/person-row';
import { ProfileHeader } from '../../src/features/friends/profile/profile-header';
import { person, renderWithTrpc, SAFE_AREA_METRICS } from './friends-core-harness';
import { CAROL, profileDto } from './friends-profile-fixtures';

// PRD 2026-10 §4.1: wherever Following shows a person with trainer tools on (`FriendUserSummary.trainer`,
// additive), it reads "Trainer" and their "Gym / city" — in rows (also in the row's spoken name) and on
// the profile header. Everyone else looks exactly as before.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

describe('Following: the Trainer badge', () => {
  it('a trainer row shows the badge and gym line, and says them', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <PersonRow
          person={person({ trainer: { gymLine: 'Iron Gym, Cluj' } })}
          secondary="Follows you"
          testID="row"
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('row-trainer')).toHaveTextContent('TrainerIron Gym, Cluj');
    expect(screen.getByTestId('row-identity').props.accessibilityLabel).toBe(
      'Maria Pop, Trainer, Iron Gym, Cluj, Follows you',
    );
  });

  it('a trainer with no gym line gets just the badge; a non-trainer gets nothing', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <PersonRow person={person({ trainer: { gymLine: null } })} testID="a" />
        <PersonRow person={person({ id: 'other' })} testID="b" />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('a-trainer')).toHaveTextContent('Trainer');
    expect(screen.queryByTestId('b-trainer')).toBeNull();
    expect(screen.getByTestId('b-identity').props.accessibilityLabel).toBe('Maria Pop');
  });

  it('the profile header shows it under the name', async () => {
    await renderWithTrpc(
      <ProfileHeader
        profile={profileDto({ user: { ...CAROL, trainer: { gymLine: 'Iron Gym, Cluj' } } })}
        me={undefined}
      />,
      {},
    );
    expect(screen.getByTestId('friends-profile-header-trainer')).toHaveTextContent(
      'TrainerIron Gym, Cluj',
    );
  });

  it('no trainer field: no badge on the profile header', async () => {
    await renderWithTrpc(<ProfileHeader profile={profileDto()} me={undefined} />, {});
    expect(screen.queryByTestId('friends-profile-header-trainer')).toBeNull();
  });
});
