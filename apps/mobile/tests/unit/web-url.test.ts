import { getWebUrl } from '../../src/lib/api-url';

jest.mock('../../src/lib/env', () => ({
  env: { EXPO_PUBLIC_API_URL: 'http://192.168.1.20:3001' },
}));

describe('getWebUrl', () => {
  it('points development builds at the web app next to the API', () => {
    expect(getWebUrl('/terms')).toBe('http://192.168.1.20:3000/terms');
  });
});
