import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import { FRIENDS_COPY } from '@chefer/types';
import {
  friendsErrorData,
  isFriendsUnavailableError,
  textRejectedOf,
} from '../../src/features/friends/api/friends-errors';
import {
  VideoDraftForm,
  type VideoImportPreview,
} from '../../src/features/recipes/video-draft-form';
import { SAFE_AREA_METRICS, trpcError } from './friends-core-harness';

// PRD §9.4 / UX §16.13: a shared recipe whose name or description trips the
// word filter comes back BAD_REQUEST + `data.textRejected: 'recipe'`; the
// recipe form and the import review show the plain message under the name.

const PREVIEW: VideoImportPreview = {
  via: 'video',
  draft: {
    name: 'Garlic Noodles',
    description: 'Buttery garlic noodles.',
    ingredients: [{ name: 'noodles', quantity: 200, unit: 'g' }],
    instructions: ['Boil the noodles.'],
    nutritionInfo: { calories: 600, protein: 20, carbs: 90, fat: 18, fiber: 4 },
    cuisineType: 'Asian',
    dietaryTags: [],
    prepTimeMins: 5,
    cookTimeMins: 10,
    servings: 2,
  },
  notFound: [],
  unverifiedQuantities: [],
  assumptions: [],
  transcriptSource: 'subtitles',
  safety: { ok: true, issues: [] },
  platform: 'youtube',
  sourceUrl: 'https://www.youtube.com/watch?v=abcdef123',
  ogImageUrl: null,
  videoTitle: 'Garlic noodles',
  creator: 'chef',
};

describe('friends error readers', () => {
  it('reads data.textRejected and the other Following flags, never throws', () => {
    expect(textRejectedOf(trpcError('BAD_REQUEST', 400, { textRejected: 'recipe' }))).toBe(
      'recipe',
    );
    expect(textRejectedOf(trpcError('BAD_REQUEST', 400, { textRejected: 'name' }))).toBe('name');
    expect(textRejectedOf(trpcError('BAD_REQUEST', 400, { textRejected: null }))).toBeNull();
    expect(textRejectedOf(new Error('plain'))).toBeNull();
    expect(textRejectedOf(null)).toBeNull();
    expect(
      isFriendsUnavailableError(trpcError('FORBIDDEN', 403, { friendsUnavailable: true })),
    ).toBe(true);
    expect(isFriendsUnavailableError(trpcError('FORBIDDEN', 403))).toBe(false);
    expect(friendsErrorData(undefined)).toEqual({});
  });
});

describe('import review: the rejection shows under the name field', () => {
  it('renders nameError under the recipe name', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <VideoDraftForm
          preview={PREVIEW}
          saving={false}
          saveError={null}
          nameError={FRIENDS_COPY.recipe.textRejected}
          onBack={jest.fn()}
          onSave={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('video-draft-name-error')).toHaveTextContent(
      'Some words in this recipe’s name or description aren’t allowed on shared recipes. Change them, or turn off recipe sharing.',
    );
    expect(screen.queryByTestId('video-draft-problems')).toBeNull();
  });

  it('renders nothing extra without a rejection', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <VideoDraftForm
          preview={PREVIEW}
          saving={false}
          saveError={null}
          onBack={jest.fn()}
          onSave={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId('video-draft-name-error')).toBeNull();
  });
});
