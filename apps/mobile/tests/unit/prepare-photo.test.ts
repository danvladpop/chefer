import type { ImagePickerAsset } from 'expo-image-picker';
import { SOMETHING_WRONG_MESSAGE } from '../../src/lib/media-client';
import {
  canResizeOnDevice,
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_EDGE,
  photoPickerOptions,
  preparePhoto,
  resizeFor,
} from '../../src/lib/prepare-photo';

// T-BUG-O1.2 (O-18 root cause): photos are shrunk on the device before they
// are uploaded or scanned. Binaries built before expo-image-manipulator was
// added keep T-BUG-O1's path, so both branches are covered here.

const mockRequireOptional = jest.fn();
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string): unknown => mockRequireOptional(name),
}));

const mockResize = jest.fn();
const mockSave = jest.fn();
const mockImageRelease = jest.fn();
const mockContextRelease = jest.fn();
const mockManipulate = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  ImageManipulator: { manipulate: (uri: string): unknown => mockManipulate(uri) },
}));

function asset(overrides: Partial<ImagePickerAsset> = {}): ImagePickerAsset {
  return {
    uri: 'file:///photo.heic',
    width: 8064,
    height: 6048,
    mimeType: 'image/heic',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockResolvedValue({ base64: 'AQID', uri: 'file:///out.jpg', width: 2048, height: 1536 });
  const context = {
    resize: (size: unknown) => {
      mockResize(size);
      return context;
    },
    renderAsync: () => Promise.resolve({ saveAsync: mockSave, release: mockImageRelease }),
    release: mockContextRelease,
  };
  mockManipulate.mockReturnValue(context);
});

describe('T-BUG-O1.2 resizeFor', () => {
  it('brings the long edge down to 2048 px', () => {
    expect(resizeFor(8064, 6048)).toEqual({ width: PHOTO_MAX_EDGE });
    expect(resizeFor(3024, 4032)).toEqual({ height: PHOTO_MAX_EDGE });
    expect(resizeFor(4000, 4000)).toEqual({ width: PHOTO_MAX_EDGE });
  });

  it('leaves a photo that already fits alone', () => {
    expect(resizeFor(1170, 2532)).toEqual({ height: PHOTO_MAX_EDGE });
    expect(resizeFor(1170, 2048)).toBeNull();
    expect(resizeFor(800, 600)).toBeNull();
  });

  it('resizes when the picker reports no dimensions', () => {
    expect(resizeFor(0, 0)).toEqual({ width: PHOTO_MAX_EDGE });
  });
});

describe('T-BUG-O1.2 with the native module (new binary)', () => {
  beforeEach(() => mockRequireOptional.mockReturnValue({}));

  it('asks the picker for the original file, not base64', () => {
    expect(canResizeOnDevice()).toBe(true);
    expect(mockRequireOptional).toHaveBeenCalledWith('ExpoImageManipulator');
    expect(photoPickerOptions()).toEqual({ mediaTypes: 'images' });
  });

  it('resizes the long edge and saves a JPEG at 0.8', async () => {
    const photo = await preparePhoto(asset());
    expect(mockManipulate).toHaveBeenCalledWith('file:///photo.heic');
    expect(mockResize).toHaveBeenCalledWith({ width: PHOTO_MAX_EDGE });
    expect(mockSave).toHaveBeenCalledWith({
      format: 'jpeg',
      compress: PHOTO_JPEG_QUALITY,
      base64: true,
    });
    expect(photo).toEqual({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/jpeg' });
    expect(mockImageRelease).toHaveBeenCalled();
    expect(mockContextRelease).toHaveBeenCalled();
  });

  it('re-encodes a small photo without resizing it', async () => {
    await preparePhoto(asset({ width: 800, height: 600, mimeType: 'image/png' }));
    expect(mockResize).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalled();
  });

  it('turns a manipulator failure into a sentence and still releases native memory', async () => {
    mockSave.mockRejectedValue(new Error('EXC_BAD_ACCESS decoding image'));
    await expect(preparePhoto(asset())).rejects.toThrow(SOMETHING_WRONG_MESSAGE);
    expect(mockImageRelease).toHaveBeenCalled();
    expect(mockContextRelease).toHaveBeenCalled();
  });
});

describe('T-BUG-O1.2 without the native module (older binary)', () => {
  beforeEach(() => mockRequireOptional.mockReturnValue(null));

  it("keeps T-BUG-O1's picker options", () => {
    expect(canResizeOnDevice()).toBe(false);
    expect(photoPickerOptions()).toEqual({ mediaTypes: 'images', base64: true, quality: 0.5 });
  });

  it('sends the picker base64 as-is, with its own MIME type', async () => {
    const photo = await preparePhoto(asset({ base64: 'AQID', mimeType: 'image/heic' }));
    expect(photo).toEqual({ bytes: new Uint8Array([1, 2, 3]), mime: 'image/heic' });
    expect(mockManipulate).not.toHaveBeenCalled();
  });

  it('returns null when the picker gave no base64', async () => {
    expect(await preparePhoto(asset({ base64: undefined }))).toBeNull();
  });
});
