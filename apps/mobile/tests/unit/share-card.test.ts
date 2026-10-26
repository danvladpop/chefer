import { Platform, Share } from 'react-native';
import { presentShareCard } from '../../src/features/share/share-card';

// Lane E2: a share card is downloaded and handed to the OS share sheet with
// its link; when the image can't be fetched, the link alone is shared.

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
}));
let mockCanShareFiles = false;
jest.mock('../../src/lib/share-file', () => ({ canShareFiles: () => mockCanShareFiles }));
jest.mock('../../src/lib/trpc', () => ({ trpc: {} }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
const mockShareAsync = jest.fn(() => Promise.resolve());
jest.mock('expo-sharing', () => ({ shareAsync: mockShareAsync }), { virtual: true });

const FileSystem = jest.requireMock<{ downloadAsync: jest.Mock }>('expo-file-system/legacy');
const LINK = {
  id: 'abc123',
  url: 'https://chefer.test/s/abc123',
  imageUrl: 'https://chefer.test/s/abc123/image',
};

let shareSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  mockCanShareFiles = false;
  shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
});

function setOS(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

describe('presentShareCard', () => {
  it('iOS: downloads the card and shares the image with the link', async () => {
    setOS('ios');
    FileSystem.downloadAsync.mockResolvedValue({
      status: 200,
      uri: 'file:///cache/chefer-abc123.png',
    });
    await expect(presentShareCard(LINK, 'Lemon pasta')).resolves.toBe(true);
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      LINK.imageUrl,
      'file:///cache/chefer-abc123.png',
    );
    expect(shareSpy).toHaveBeenCalledWith({
      url: 'file:///cache/chefer-abc123.png',
      message: 'Lemon pasta https://chefer.test/s/abc123',
    });
  });

  it('Android with expo-sharing: shares the PNG file', async () => {
    setOS('android');
    mockCanShareFiles = true;
    FileSystem.downloadAsync.mockResolvedValue({
      status: 200,
      uri: 'file:///cache/chefer-abc123.png',
    });
    await presentShareCard(LINK, 'Lemon pasta');
    expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/chefer-abc123.png', {
      mimeType: 'image/png',
      dialogTitle: 'Lemon pasta',
    });
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('a failed download still shares the link as text', async () => {
    setOS('ios');
    FileSystem.downloadAsync.mockResolvedValue({ status: 404, uri: '' });
    await presentShareCard(LINK, 'Lemon pasta');
    expect(shareSpy).toHaveBeenCalledWith({ message: 'Lemon pasta https://chefer.test/s/abc123' });
  });

  it('a dismissed sheet resolves false', async () => {
    setOS('ios');
    FileSystem.downloadAsync.mockResolvedValue({ status: 200, uri: 'file:///x.png' });
    shareSpy.mockResolvedValue({ action: Share.dismissedAction });
    await expect(presentShareCard(LINK, 'x')).resolves.toBe(false);
  });
});
