import { describe, expect, it } from 'vitest';
import { healthSyncConsentLabel } from './health-sync';

describe('healthSyncConsentLabel', () => {
  it('names the platform and the types that are on', () => {
    expect(healthSyncConsentLabel(['HEALTH_CONNECT', 'weight', 'activeEnergy', 'nutrition'])).toBe(
      'Health Connect: weight, active energy, food',
    );
  });

  it('says turned off when no type is on', () => {
    expect(healthSyncConsentLabel(['APPLE_HEALTH'])).toBe('Apple Health: turned off');
  });

  it('ignores values it does not know', () => {
    expect(healthSyncConsentLabel(['SOMETHING', 'steps', 'heartRate'])).toBe('Health sync: steps');
  });
});
