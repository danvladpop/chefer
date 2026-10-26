import { beforeAll, describe, expect, it } from 'vitest';
import { localDateStr } from '@chefer/utils';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';

// Lane D3 (market review 2026-10): body measurements, against the REAL API
// through the app's own tRPC link. A throwaway FREE account: measurements are
// free, and saving them needs the health-data consent like a weigh-in.

const { client, setToken } = makeContractClient();
const today = localDateStr(new Date());

beforeAll(async () => {
  const user = await client.auth.register.mutate({
    email: uniqueEmail('body-measurements'),
    password: 'Contract@123!',
    firstName: 'Measure',
    ...CONTRACT_CONSENT,
  });
  if (!user.session) throw new Error('register response is missing the session credential');
  setToken(user.session.token);
}, 60_000);

describe('tracker body measurements', () => {
  it('starts empty', async () => {
    await expect(client.tracker.bodyMeasurements.query({ days: 365 })).resolves.toEqual([]);
  });

  it('saves a day, merges a second save into it, and lists it', async () => {
    const first = await client.tracker.logBodyMeasurement.mutate({ date: today, waistCm: 82 });
    expect(first).toMatchObject({ measuredOn: today, waistCm: 82, hipsCm: null });

    const second = await client.tracker.logBodyMeasurement.mutate({
      date: today,
      hipsCm: 101.5,
      bodyFatPct: 21,
    });
    // Same entry: the waist from the first save is kept.
    expect(second).toMatchObject({ id: first.id, waistCm: 82, hipsCm: 101.5, bodyFatPct: 21 });

    const list = await client.tracker.bodyMeasurements.query({ days: 30 });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ measuredOn: today, waistCm: 82, hipsCm: 101.5 });
  });

  it('rejects an empty entry, an implausible value and a future day', async () => {
    await expect(client.tracker.logBodyMeasurement.mutate({ date: today })).rejects.toThrow();
    await expect(
      client.tracker.logBodyMeasurement.mutate({ date: today, chestCm: 900 }),
    ).rejects.toThrow();
    const future = new Date();
    future.setDate(future.getDate() + 3);
    await expect(
      client.tracker.logBodyMeasurement.mutate({ date: localDateStr(future), waistCm: 80 }),
    ).rejects.toThrow();
  });

  it('deletes an entry, and someone else’s id reads not found', async () => {
    const [entry] = await client.tracker.bodyMeasurements.query({ days: 30 });
    if (!entry) throw new Error('expected an entry');
    await expect(client.tracker.deleteBodyMeasurement.mutate({ id: entry.id })).resolves.toEqual({
      success: true,
    });
    await expect(client.tracker.deleteBodyMeasurement.mutate({ id: entry.id })).rejects.toThrow();
    await expect(client.tracker.bodyMeasurements.query({ days: 30 })).resolves.toEqual([]);
  });
});
