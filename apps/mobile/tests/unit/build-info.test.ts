import { formatBuildInfo } from '../../src/lib/build-info';

const base = {
  appVersion: '0.0.1',
  variant: 'production',
  updatesEnabled: true,
  isDevServer: false,
  channel: 'production',
  updateId: null,
  isEmbeddedLaunch: true,
};

describe('formatBuildInfo', () => {
  it('labels a production binary still running its embedded bundle', () => {
    expect(formatBuildInfo(base)).toBe('Chefer 0.0.1 · production · built-in bundle');
  });

  it('shows the short id of a downloaded OTA update', () => {
    expect(
      formatBuildInfo({
        ...base,
        isEmbeddedLaunch: false,
        updateId: '3f2a9c1e-1111-2222-3333-444455556666',
      }),
    ).toBe('Chefer 0.0.1 · production · update 3f2a9c1e');
  });

  it('flags a channel that differs from the variant', () => {
    expect(formatBuildInfo({ ...base, channel: 'preview' })).toBe(
      'Chefer 0.0.1 · production · channel preview · built-in bundle',
    );
  });

  it('marks dev-client sessions, whose JS comes from Metro', () => {
    expect(
      formatBuildInfo({ ...base, variant: 'development', isDevServer: true, channel: '' }),
    ).toBe('Chefer 0.0.1 · development · dev server');
  });

  it('treats an empty channel as none', () => {
    expect(formatBuildInfo({ ...base, channel: '' })).toBe(
      'Chefer 0.0.1 · production · channel none · built-in bundle',
    );
  });
});
