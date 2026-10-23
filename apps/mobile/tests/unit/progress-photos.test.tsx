import { screen, userEvent, waitFor } from '@testing-library/react-native';
import {
  addProgressPhoto,
  listProgressPhotos,
  removeAllProgressPhotos,
  removeProgressPhoto,
} from '../../src/features/body/progress-photo-store';
import { ProgressPhotos } from '../../src/features/body/progress-photos';
import { renderWithTrpc } from './friends-core-harness';

// Lane D4 (owner decision 2026-10-22): progress photos live on this phone
// only — the app's private documents folder, one folder per user, never the
// camera roll and never the server.

// An in-memory documents folder.
const mockFiles = new Map<string, string>();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: (uri: string) =>
    Promise.resolve({
      exists: mockFiles.has(uri) || [...mockFiles.keys()].some((k) => k.startsWith(uri)),
    }),
  makeDirectoryAsync: () => Promise.resolve(),
  readAsStringAsync: (uri: string) => Promise.resolve(mockFiles.get(uri) ?? ''),
  writeAsStringAsync: (uri: string, text: string) => {
    mockFiles.set(uri, text);
    return Promise.resolve();
  },
  copyAsync: ({ from, to }: { from: string; to: string }) => {
    mockFiles.set(to, `copy of ${from}`);
    return Promise.resolve();
  },
  deleteAsync: (uri: string) => {
    for (const key of [...mockFiles.keys()]) if (key.startsWith(uri)) mockFiles.delete(key);
    return Promise.resolve();
  },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Image: View };
});
jest.mock('../../src/lib/prepare-photo', () => ({
  canResizeOnDevice: () => false,
  resizeFor: () => null,
}));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');
const mockPicker = jest.requireMock<{
  requestCameraPermissionsAsync: jest.Mock;
  launchCameraAsync: jest.Mock;
  launchImageLibraryAsync: jest.Mock;
}>('expo-image-picker');

beforeEach(() => {
  jest.clearAllMocks();
  mockPicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
  mockFiles.clear();
});

describe('progress-photo-store', () => {
  it('copies a photo into the user’s private folder and lists newest first', async () => {
    await addProgressPhoto('u1', 'file:///cache/a.jpg', '2026-10-01');
    await addProgressPhoto('u1', 'file:///cache/b.jpg', '2026-10-20');
    const photos = await listProgressPhotos('u1');
    expect(photos.map((p) => p.takenOn)).toEqual(['2026-10-20', '2026-10-01']);
    expect(photos[0]?.uri).toMatch(/^file:\/\/\/docs\/progress-photos\/u1\/.+\.jpg$/);
    // The bytes were copied, not referenced (the picker's file can go away).
    expect(mockFiles.get(photos[0]?.uri ?? '')).toBe('copy of file:///cache/b.jpg');
  });

  it('keeps each account’s photos apart on a shared phone', async () => {
    await addProgressPhoto('u1', 'file:///cache/a.jpg', '2026-10-01');
    await expect(listProgressPhotos('u2')).resolves.toEqual([]);
  });

  it('removes one photo, or all of them for account deletion', async () => {
    const a = await addProgressPhoto('u1', 'file:///cache/a.jpg', '2026-10-01');
    await addProgressPhoto('u1', 'file:///cache/b.jpg', '2026-10-02');
    await removeProgressPhoto('u1', a.id);
    expect((await listProgressPhotos('u1')).map((p) => p.takenOn)).toEqual(['2026-10-02']);
    await removeAllProgressPhotos('u1');
    await expect(listProgressPhotos('u1')).resolves.toEqual([]);
    expect([...mockFiles.keys()].some((k) => k.includes('/u1/'))).toBe(false);
  });

  it('a damaged index reads as no photos instead of crashing', async () => {
    mockFiles.set('file:///docs/progress-photos/u1/index.json', '{not json');
    await expect(listProgressPhotos('u1')).resolves.toEqual([]);
  });
});

const ME = { 'user.me': () => ({ id: 'u1', email: 'a@chefer.dev' }) };

/** The add buttons wait for the signed-in user (photos are kept per user). */
async function ready() {
  await waitFor(() => expect(screen.getByTestId('progress-photo-camera')).toBeEnabled());
}

describe('ProgressPhotos', () => {
  it('says where the photos live and invites the first one', async () => {
    await renderWithTrpc(<ProgressPhotos />, ME);
    expect(screen.getByText(/Saved only on this phone, never uploaded/)).toBeOnTheScreen();
    expect(await screen.findByTestId('progress-photos-empty')).toBeOnTheScreen();
  });

  it('takes a photo with the camera and stores it for today', async () => {
    mockPicker.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/new.jpg', width: 3000, height: 4000 }],
    });
    const user = userEvent.setup();
    await renderWithTrpc(<ProgressPhotos />, ME);
    await ready();
    await user.press(screen.getByTestId('progress-photo-camera'));
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('progress_photo_added', { source: 'camera' }),
    );
    // The picker's own camera roll is never involved: only the app's folder holds it.
    const [photo] = await listProgressPhotos('u1');
    expect(photo?.uri).toContain('/docs/progress-photos/u1/');
  });

  it('a denied camera says so and offers the library instead', async () => {
    mockPicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false });
    const user = userEvent.setup();
    await renderWithTrpc(<ProgressPhotos />, ME);
    await ready();
    await user.press(screen.getByTestId('progress-photo-camera'));
    expect(await screen.findByTestId('progress-photo-notice')).toHaveTextContent(
      /choose a photo instead/,
    );
    expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('two picked photos open side by side, oldest first', async () => {
    const older = await addProgressPhoto('u1', 'file:///cache/a.jpg', '2026-09-01');
    const newer = await addProgressPhoto('u1', 'file:///cache/b.jpg', '2026-10-20');
    const user = userEvent.setup();
    await renderWithTrpc(<ProgressPhotos />, ME);
    await user.press(await screen.findByTestId(`progress-photo-${newer.id}`));
    await user.press(screen.getByTestId(`progress-photo-${older.id}`));
    await user.press(screen.getByTestId('progress-photos-compare'));
    const sheet = await screen.findByTestId('progress-photos-compare-sheet');
    expect(sheet).toBeOnTheScreen();
    const labels = screen
      .getAllByLabelText(/Progress photo from/)
      .slice(-2)
      .map((n) => n.props.accessibilityLabel as string);
    expect(labels[0]).toMatch(/2026|Sep|1/);
    expect(track).toHaveBeenCalledWith('progress_photos_compared', {});
  });
});
