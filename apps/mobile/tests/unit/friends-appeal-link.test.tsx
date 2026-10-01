import { Linking } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { SUPPORT_EMAIL } from '@chefer/types';
import { AppealLink, appealMailto } from '../../src/features/friends/components/appeal-link';

// The appeal route for an automatic moderation step (PRD §9): a labelled link
// that opens a pre-addressed email with a subject saying what is appealed.

afterEach(() => jest.restoreAllMocks());

describe('AppealLink', () => {
  it('builds a mailto to the support address with an encoded subject', () => {
    expect(appealMailto('recipe')).toBe(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Appeal: hidden recipe')}`,
    );
    expect(appealMailto('profile')).toBe(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Appeal: private profile')}`,
    );
  });

  it('shows the prompt and the address, and opens the email on press', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<AppealLink subject="profile" testID="appeal" />);

    expect(screen.getByText('Think this is a mistake?')).toBeTruthy();
    expect(screen.getByText(`Email ${SUPPORT_EMAIL}`)).toBeTruthy();
    const link = screen.getByTestId('appeal');
    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.accessibilityLabel).toBe(
      `Think this is a mistake? Email ${SUPPORT_EMAIL} to appeal`,
    );

    await userEvent.setup().press(link);
    expect(openURL).toHaveBeenCalledWith(appealMailto('profile'));
  });
});
