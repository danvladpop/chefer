import { Platform } from 'react-native';
import { getApiBaseUrl, getTrpcUrl } from '../../src/lib/api-url';

describe('getApiBaseUrl', () => {
  it('uses localhost on iOS (simulator shares the host network)', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(getApiBaseUrl()).toBe('http://localhost:3001');
  });

  it('uses 10.0.2.2 on Android (emulator alias for host loopback)', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(getApiBaseUrl()).toBe('http://10.0.2.2:3001');
  });

  it('appends /trpc for the tRPC endpoint', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(getTrpcUrl()).toBe('http://localhost:3001/trpc');
  });
});
