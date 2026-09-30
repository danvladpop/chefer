import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AppRouter } from '@chefer/api';
import { HEALTH_CONSENT_API_LEVEL, LEGAL_VERSIONS } from '@chefer/types';
import { API_URL, CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// UX-26 (T-26.1, T-26.3) through the real API. HEALTH_CONSENT_ENFORCE is `off`
// in every env this wave, so this file proves the OFF behaviour end to end —
// including that an installed binary (no `x-chefer-api-level`) is never
// rejected. The `declared` / `all` branches need a different server mode, so
// they are covered by the API integration tests
// (apps/api/src/routers/health-consent-gate.router.test.ts) which set the mode.
//
// A throwaway user per file: these tests write and then WITHDRAW health data.

/** A client that sends a fixed level, or NO level header at all (level = null = an installed binary). */
function leveled(level: number | null, token: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        headers: () => ({
          'x-chefer-client': 'mobile',
          'x-trpc-source': 'mobile-react',
          ...(level !== null && { 'x-chefer-api-level': String(level) }),
          authorization: `Bearer ${token}`,
        }),
      }),
    ],
  });
}

const { client, setToken } = makeContractClient();
let token = '';
const SAFETY = { allergies: ['Peanuts'], dietaryRestrictions: [], dislikedIngredients: [] };

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('privacy-contract'),
    password: 'Contract@123!',
    ...CONTRACT_CONSENT,
    firstName: 'Privacy',
  });
  if (!user.session) throw new Error('mobile register response is missing the session credential');
  token = user.session.token;
  setToken(token);
});

describe('user.me.healthDataConsentAt + grantHealthConsent (T-26.1)', () => {
  it('starts null, grant records it and is idempotent, and logs one HEALTH event', async () => {
    expect((await client.user.me.query()).healthDataConsentAt).toBeNull();

    const first = await client.privacy.grantHealthConsent.mutate({});
    const second = await client.privacy.grantHealthConsent.mutate({});
    expect(second.healthDataConsentAt).toEqual(first.healthDataConsentAt);
    expect((await client.user.me.query()).healthDataConsentAt).toEqual(first.healthDataConsentAt);

    const history = await client.privacy.getConsentHistory.query();
    const health = history.filter((e) => e.kind === 'HEALTH');
    expect(health).toHaveLength(1);
    expect(health[0]).toMatchObject({ granted: true, source: 'mobile' });

    // Separate from the AI consent — untouched.
    expect((await client.user.me.query()).aiDataConsentAt).toBeNull();

    // Reset for the tests below: withdraw (also exercised in depth further down).
    await client.privacy.withdrawHealthData.mutate({ confirm: 'WITHDRAW' });
    expect((await client.user.me.query()).healthDataConsentAt).toBeNull();
  });
});

describe('preferences.updateSafety without consent — installed-binary contract (T-26.3)', () => {
  it('is accepted under `off` for the new level, an older level and NO header (installed binary)', async () => {
    for (const level of [HEALTH_CONSENT_API_LEVEL, 3, null]) {
      const c = leveled(level, token);
      await expect(c.preferences.updateSafety.mutate(SAFETY)).resolves.toBeDefined();
    }
    const prefs = await client.preferences.get.query();
    expect(prefs.dietaryPreferences?.allergies).toEqual(['Peanuts']);
    await client.preferences.updateSafety.mutate({
      allergies: [],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
  });

  it('the other health writes are accepted the same way without the header', async () => {
    const c = leveled(null, token);
    await expect(c.tracker.logWeight.mutate({ weightKg: 71 })).resolves.toBeDefined();
    await expect(c.preferences.saveProfileBasics.mutate({ weightKg: 71 })).resolves.toBeDefined();
    await expect(
      c.household.add.mutate({ name: 'Mia', allergies: ['Peanuts'] }),
    ).resolves.toBeDefined();
    await client.privacy.withdrawHealthData.mutate({ confirm: 'WITHDRAW' });
  });
});

describe('privacy.withdrawHealthData deletes everything listed and records it (AC3)', () => {
  it('empties owner + household allergies, goal, metrics, weigh-ins; plans stop carrying safety rules', async () => {
    await client.privacy.grantHealthConsent.mutate({});
    await client.preferences.updateSafety.mutate({
      allergies: ['Peanuts'],
      dietaryRestrictions: ['Vegan'],
      dislikedIngredients: ['Fish'],
    });
    await client.household.add.mutate({ name: 'Sam', isKid: true, allergies: ['Tree nuts'] });
    await client.preferences.saveProfileBasics.mutate({
      goal: 'LOSE_WEIGHT',
      biologicalSex: 'FEMALE',
      age: 30,
      heightCm: 170,
      weightKg: 70,
      activityLevel: 'LIGHTLY_ACTIVE',
    });
    await client.tracker.logWeight.mutate({ weightKg: 70 });

    const before = await client.safety.getTable.query();
    expect(before.hasRules).toBe(true);
    expect((await client.tracker.weightHistory.query({ days: 30 })).length).toBeGreaterThan(0);

    await client.privacy.withdrawHealthData.mutate({ confirm: 'WITHDRAW' });

    const prefs = await client.preferences.get.query();
    expect(prefs.dietaryPreferences?.allergies ?? []).toEqual([]);
    expect(prefs.dietaryPreferences?.dietaryRestrictions ?? []).toEqual([]);
    expect(prefs.dietaryPreferences?.dislikedIngredients ?? []).toEqual([]);
    expect(prefs.chefProfile?.goal ?? null).toBeNull();
    expect(prefs.chefProfile?.age ?? null).toBeNull();
    expect(prefs.chefProfile?.heightCm ?? null).toBeNull();
    expect(prefs.chefProfile?.weightKg ?? null).toBeNull();

    const members = await client.household.list.query();
    expect(members.map((m) => m.name).sort()).toEqual(['Mia', 'Sam']); // the people stay…
    expect(members.every((m) => m.allergies.length === 0)).toBe(true); // …their health data does not
    expect(await client.tracker.weightHistory.query({ days: 30 })).toEqual([]);

    // Plans stop showing "Checked for": the rules the check runs against are gone.
    const after = await client.safety.getTable.query();
    expect(after.hasRules).toBe(false);
    expect(after.people.every((p) => p.items.length === 0)).toBe(true);

    // Recorded: consent cleared + a HEALTH withdrawal event (newest first).
    expect((await client.user.me.query()).healthDataConsentAt).toBeNull();
    const events = (await client.privacy.getConsentHistory.query()).filter(
      (e) => e.kind === 'HEALTH',
    );
    expect(events[0]?.granted).toBe(false);
    expect(events.some((e) => e.granted)).toBe(true);
  });

  it('requires the typed confirmation', async () => {
    await expect(
      // @ts-expect-error — the literal is part of the contract
      client.privacy.withdrawHealthData.mutate({ confirm: 'yes' }),
    ).rejects.toThrow();
  });
});

describe('registration needs the 16+ confirmation (AC4, server side)', () => {
  it('a level >= 2 client without ageConfirmed is rejected; an installed binary without the header still registers', async () => {
    const noAge = { acceptedTerms: true, acceptedTermsVersion: LEGAL_VERSIONS.terms } as const;
    await expect(
      client.auth.register.mutate({
        email: uniqueEmail('privacy-age'),
        password: 'Contract@123!',
        ...noAge,
      }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });

    const legacy = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${API_URL}/trpc`,
          transformer: superjson,
          headers: () => ({ 'x-chefer-client': 'mobile' }),
        }),
      ],
    });
    await expect(
      legacy.auth.register.mutate({
        email: uniqueEmail('privacy-age-legacy'),
        password: 'Contract@123!',
      }),
    ).resolves.toBeDefined();
  });
});
