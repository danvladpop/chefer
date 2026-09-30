import { Platform, Share } from 'react-native';
import { canShareFiles, CSV_MIME, JSON_MIME, shareExportFile } from '../../src/lib/share-file';

// T-39.5 (bug B-53, UX-39 AC5): a real, named export file on both platforms.
// iOS shares the written file via Share.share({ url }); Android goes through
// expo-sharing when the binary contains it (wave-4 native release) and keeps
// the titled text share on older binaries.

const mockRequireOptional = jest.fn();
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string): unknown => mockRequireOptional(name),
}));

const mockWrite = jest.fn((_uri: string, _contents: string, _options?: unknown) =>
  Promise.resolve(),
);
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: (uri: string, contents: string, options?: unknown) =>
    mockWrite(uri, contents, options),
}));

const mockShareAsync = jest.fn((_uri: string, _options?: unknown) => Promise.resolve());
jest.mock('expo-sharing', () => ({
  shareAsync: (uri: string, options?: unknown) => mockShareAsync(uri, options),
}));

let shareSpy: jest.SpyInstance;

function setPlatform(os: 'ios' | 'android') {
  jest.replaceProperty(Platform, 'OS', os);
}

function nativeModulePresent(present: boolean) {
  mockRequireOptional.mockImplementation((name: string) =>
    present && name === 'ExpoSharing' ? {} : null,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('canShareFiles', () => {
  it('looks up the ExpoSharing native module', () => {
    nativeModulePresent(true);
    expect(canShareFiles()).toBe(true);
    expect(mockRequireOptional).toHaveBeenCalledWith('ExpoSharing');
    nativeModulePresent(false);
    expect(canShareFiles()).toBe(false);
  });
});

describe('shareExportFile on Android', () => {
  beforeEach(() => setPlatform('android'));

  it('with expo-sharing: writes the named file and shares it with the MIME type', async () => {
    nativeModulePresent(true);

    await shareExportFile('chefer-export-2026-09-30.json', '{"a":1}', JSON_MIME);

    expect(mockWrite).toHaveBeenCalledWith(
      'file:///cache/chefer-export-2026-09-30.json',
      '{"a":1}',
      { encoding: 'utf8' },
    );
    expect(mockShareAsync).toHaveBeenCalledWith('file:///cache/chefer-export-2026-09-30.json', {
      mimeType: 'application/json',
      dialogTitle: 'chefer-export-2026-09-30.json',
      UTI: 'public.json',
    });
    expect(shareSpy).not.toHaveBeenCalled();
  });

  it('defaults to application/json and shares a CSV as text/csv', async () => {
    nativeModulePresent(true);

    await shareExportFile('a.json', '{}');
    expect(mockShareAsync).toHaveBeenLastCalledWith('file:///cache/a.json', {
      mimeType: 'application/json',
      dialogTitle: 'a.json',
      UTI: 'public.json',
    });

    await shareExportFile('gym.csv', 'a,b', CSV_MIME);
    expect(mockShareAsync).toHaveBeenLastCalledWith('file:///cache/gym.csv', {
      mimeType: 'text/csv',
      dialogTitle: 'gym.csv',
      UTI: 'public.comma-separated-values-text',
    });
  });

  it('without the native module (older binary): titled text share, nothing written', async () => {
    nativeModulePresent(false);

    await shareExportFile('gym.csv', 'a,b', CSV_MIME);

    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(shareSpy).toHaveBeenCalledWith({ title: 'gym.csv', message: 'a,b' });
  });

  it('falls back to the text share when expo-sharing fails', async () => {
    nativeModulePresent(true);
    mockShareAsync.mockRejectedValueOnce(new Error('no activity'));

    await shareExportFile('gym.csv', 'a,b', CSV_MIME);

    expect(shareSpy).toHaveBeenCalledWith({ title: 'gym.csv', message: 'a,b' });
  });
});

describe('shareExportFile on iOS', () => {
  beforeEach(() => setPlatform('ios'));

  it('writes the named file and shares its URL — expo-sharing is not involved', async () => {
    nativeModulePresent(true);

    await shareExportFile('chefer-export-2026-09-30.json', '{"a":1}');

    expect(mockWrite).toHaveBeenCalledWith(
      'file:///cache/chefer-export-2026-09-30.json',
      '{"a":1}',
      { encoding: 'utf8' },
    );
    expect(shareSpy).toHaveBeenCalledWith({
      url: 'file:///cache/chefer-export-2026-09-30.json',
      title: 'chefer-export-2026-09-30.json',
    });
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('behaves the same without the native module', async () => {
    nativeModulePresent(false);

    await shareExportFile('gym.csv', 'a,b', CSV_MIME);

    expect(shareSpy).toHaveBeenCalledWith({ url: 'file:///cache/gym.csv', title: 'gym.csv' });
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('falls back to the text share when the file cannot be written', async () => {
    mockWrite.mockRejectedValueOnce(new Error('disk full'));

    await shareExportFile('gym.csv', 'a,b', CSV_MIME);

    expect(shareSpy).toHaveBeenCalledWith({ title: 'gym.csv', message: 'a,b' });
  });
});
