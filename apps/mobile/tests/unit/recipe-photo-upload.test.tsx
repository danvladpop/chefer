import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FormFooter } from '../../src/features/recipes/form/form-footer';
import { PhotoField } from '../../src/features/recipes/form/photo-field';

// UX-REC-12: Save used to be tappable while a photo was still uploading and
// stored the recipe without it. The photo field reports when an upload starts
// and ends, and the footer waits (with a reason) until it is done.

let resolveUpload: ((url: string) => void) | null = null;

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({
      canceled: false,
      assets: [{ uri: 'file:///photo.jpg', width: 10, height: 10 }],
    }),
  ),
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('../../src/lib/auth-store', () => ({ getToken: () => 'token' }));
jest.mock('../../src/lib/api-url', () => ({ getApiBaseUrl: () => 'http://localhost' }));
jest.mock('../../src/lib/prepare-photo', () => ({
  photoPickerOptions: () => ({}),
  preparePhoto: () => Promise.resolve({ bytes: new Uint8Array([1]), mime: 'image/jpeg' }),
}));
jest.mock('../../src/lib/media-client', () => ({
  uploadImage: () => new Promise<string>((resolve) => (resolveUpload = resolve)),
}));

describe('PhotoField.onUploadingChange', () => {
  it('reports true while the upload runs, commits the URL, then reports false', async () => {
    const onChange = jest.fn();
    const onUploadingChange = jest.fn();
    await render(
      <PhotoField imageUrl="" onChange={onChange} onUploadingChange={onUploadingChange} />,
    );
    expect(onUploadingChange).toHaveBeenLastCalledWith(false);

    await fireEvent.press(screen.getByTestId('rf-photo'));
    await act(() => Promise.resolve());
    expect(onUploadingChange).toHaveBeenLastCalledWith(true);
    expect(onChange).not.toHaveBeenCalled();

    await act(() => {
      resolveUpload?.('https://cdn.example.com/p.jpg');
      return Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledWith('https://cdn.example.com/p.jpg');
    expect(onUploadingChange).toHaveBeenLastCalledWith(false);
  });
});

describe('FormFooter while a photo uploads', () => {
  const base = {
    isEdit: false,
    missingText: null,
    offline: false,
    saving: false,
    saveError: null,
    onPress: jest.fn(),
  };

  it('disables Save with a reason instead of letting it save without the photo', async () => {
    await render(<FormFooter {...base} photoUploading />);
    expect(screen.getByTestId('rf-save')).toBeDisabled();
    expect(screen.getByText('Uploading photo…')).toBeOnTheScreen();
    expect(screen.getByTestId('rf-photo-wait')).toBeOnTheScreen();
  });

  it('is a normal Save otherwise', async () => {
    await render(<FormFooter {...base} />);
    expect(screen.getByTestId('rf-save')).not.toBeDisabled();
    expect(screen.queryByTestId('rf-photo-wait')).toBeNull();
  });
});
