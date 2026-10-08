import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen } from '@testing-library/react-native';
import ImportRecipeScreen from '../../app/import-recipe';

// UX-X-06: an import of an invalid link used to print the Zod issue list
// (`[{"validation":"url","code":"invalid_string",…}]`) in the error card.

const ZOD_INVALID_URL =
  '[\n  {\n    "validation": "url",\n    "code": "invalid_string",\n    "message": "Invalid url",\n    "path": []\n  }\n]';
const ZOD_WITH_FIELD =
  '[\n  {\n    "code": "too_big",\n    "maximum": 20000,\n    "type": "string",\n    "inclusive": true,\n    "exact": false,\n    "message": "String must contain at most 20000 character(s)",\n    "path": [\n      "text"\n    ]\n  }\n]';

let mockPreviewError: Error | null = null;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ dispatch: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
}));
jest.mock('expo-router/react-navigation', () => ({ usePreventRemove: () => undefined }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => true }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
  AiConsentHost: () => null,
}));
jest.mock('../../src/features/premium/premium-host', () => ({ PremiumHost: () => null }));
jest.mock('../../src/lib/trpc', () => {
  const catalog = jest
    .requireActual<typeof import('./catalog-trpc-mock')>('./catalog-trpc-mock')
    .catalogTrpc({ details: [] });
  const idle = {
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  };
  return {
    trpc: {
      ...catalog,
      recipe: {
        importPreview: {
          useMutation: () => ({
            ...idle,
            isError: mockPreviewError !== null,
            error: mockPreviewError,
          }),
        },
        importVideoPreview: { useMutation: () => idle },
        importSave: { useMutation: () => idle },
      },
    },
  };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const badRequest = (message: string) =>
  Object.assign(new Error(message), { data: { code: 'BAD_REQUEST', httpStatus: 400 } });

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ImportRecipeScreen />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  mockPreviewError = null;
});

describe('Import screen error card (UX-X-06)', () => {
  it('shows no JSON for an invalid link', async () => {
    mockPreviewError = badRequest(ZOD_INVALID_URL);
    await renderScreen();
    const card = screen.getByTestId('import-error');
    expect(card).toHaveTextContent('Check the value you entered.');
    expect(card).not.toHaveTextContent(/[[\]{}"]|invalid_string|code/);
  });

  it('names the field when the issue has one', async () => {
    mockPreviewError = badRequest(ZOD_WITH_FIELD);
    await renderScreen();
    expect(screen.getByTestId('import-error')).toHaveTextContent(
      'Check the value you entered for text.',
    );
  });

  it('still shows a deliberate server sentence as written', async () => {
    mockPreviewError = badRequest("That page doesn't look like a recipe.");
    await renderScreen();
    expect(screen.getByTestId('import-error')).toHaveTextContent(
      "That page doesn't look like a recipe.",
    );
  });

  it('shows no error card when nothing failed', async () => {
    await renderScreen();
    expect(screen.queryByTestId('import-error')).toBeNull();
  });
});
