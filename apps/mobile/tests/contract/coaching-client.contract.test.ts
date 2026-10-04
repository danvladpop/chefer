import { beforeAll, describe, expect, it } from 'vitest';
import { COACHING_API_LEVEL, COACHING_CONSENT_LABELS } from '@chefer/types';
import { buildAuthHeaders } from '../../src/lib/trpc-links';
import { CONTRACT_CONSENT, makeContractClient, uniqueEmail } from './client';
import {
  COACH_PASSWORD,
  makeCoachUser,
  NO_COACHING_MESSAGE,
  probeCoachingEnabled,
  setupGym,
  TODAY,
  trainerWithInvite,
} from './coaching-helpers';

// WP-18 lane D: what the SHIPPED mobile client relies on. Unlike the other coaching suites (which pass an
// explicit API level), the client here is built by the app's own link stack — the header the app really
// sends (`x-chefer-api-level: 6`) — so this fails if the bump to level 6 is lost or the level-6 client
// surfaces (trainer name, stamps, notes, "Set by", the consent-history rows, "stopped coaching you")
// stop being served to it. Skipped when coaching is off on the API.

let enabled = false;

beforeAll(async () => {
  enabled = await probeCoachingEnabled();
  if (!enabled) console.warn(`[coaching-client.contract] ${NO_COACHING_MESSAGE}`);
});

describe('the shipped client at level 6', () => {
  it('declares the coaching API level in its header', () => {
    expect(buildAuthHeaders(() => null)['x-chefer-api-level']).toBe(String(COACHING_API_LEVEL));
    expect(COACHING_API_LEVEL).toBe(6);
  });

  it('join by a deep-link code, then trainer name, stamps, note, "Set by" and the consent rows all reach it', async () => {
    if (!enabled) return;
    const trainer = await makeCoachUser({ prefix: 'cc-trainer', firstName: 'Anatrainer' });
    const invite = await trainerWithInvite(trainer);

    // The client is the app itself: no apiLevel override, the real link stack and header.
    const app = makeContractClient();
    const email = uniqueEmail('cc-client');
    const registered = await app.client.auth.register.mutate({
      email,
      password: COACH_PASSWORD,
      firstName: 'Maria',
      ...CONTRACT_CONSENT,
    });
    if (!registered.session) throw new Error('register response is missing the session credential');
    app.setToken(registered.session.token);
    const api = app.client;

    // Signed in but without gym setup: the preview says so (the app routes to setup first).
    const sloppy = `${invite.code.slice(0, 5)}-${invite.code.slice(5).toLowerCase()}`;
    expect((await api.coaching.previewInvite.query({ code: sloppy })).needsGymSetup).toBe(true);
    await setupGym(api);

    const preview = await api.coaching.previewInvite.query({ code: sloppy });
    expect(preview).toMatchObject({
      state: 'OK',
      trainerName: 'Ana',
      currentTrainerName: null,
      needsGymSetup: false,
    });
    const status = await api.coaching.join.mutate({ code: sloppy, localDate: TODAY });
    expect(status.trainer?.name).toBe('Ana');
    expect(typeof status.trainer?.since).toBe('string');

    // The trainer changes a row, leaves a cue and sets next time's target.
    const routine = await trainer.api.trainer.client.routine.query({
      clientId: registered.id,
      today: TODAY,
    });
    if (!routine) throw new Error('the client has no routine');
    const row = routine.days[0]?.exercises[0];
    if (!row?.next) throw new Error('first row has no next-session data');
    const doc = {
      id: routine.id,
      name: routine.name,
      days: routine.days.map((d) => ({
        id: d.id,
        name: d.name,
        plannedWeekday: d.plannedWeekday,
        exercises: d.exercises.map((e) => ({
          id: e.id,
          exerciseId: e.exerciseId,
          sets: e.id === row.id ? e.sets + 1 : e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSec: e.restSec,
          supersetGroup: e.supersetGroup,
          trainerNote: e.id === row.id ? 'Knees out, slow eccentric' : e.trainerNote,
        })),
      })),
    };
    await trainer.api.trainer.client.saveRoutine.mutate({
      clientId: registered.id,
      routine: doc,
      expectedVersion: routine.version,
    });
    await trainer.api.trainer.client.setNextTarget.mutate({
      clientId: registered.id,
      exerciseId: row.exerciseId,
      repBucket: row.next.repBucket,
      weightKg: 62.5,
      reps: [6, 6, 6, 6],
    });

    // What the app reads: Today's "Ana updated your routine", the Routine tab's stamps and note, the
    // logger's cue and "Set by Ana".
    const boot = await api.gym.bootstrap.query({ today: TODAY });
    expect(boot.coaching).toEqual({ trainerName: 'Ana' });
    expect(boot.activeRoutine?.lastEditedByOther?.name).toBe('Ana');
    expect(typeof boot.activeRoutine?.lastEditedByOther?.at).toBe('string');
    const changed = boot.activeRoutine?.days[0]?.exercises[0];
    expect(changed?.trainerNote).toBe('Knees out, slow eccentric');
    expect(changed?.lastEditedByOther?.name).toBe('Ana');
    const progression = boot.progressions.find(
      (p) => p.exerciseId === row.exerciseId && p.repBucket === row.next?.repBucket,
    );
    expect(progression?.override?.setByName).toBe('Ana');
    expect(progression?.override).not.toHaveProperty('setById');

    // Profile → Privacy → Consent history: the label rows are served to level 6 (with their link id).
    const history = (await api.privacy.getConsentHistory.query()).filter(
      (e) => e.kind === 'COACHING_SHARING',
    );
    expect(history.map((e) => e.granted)).toEqual([true]);
    expect(history[0]?.contextId).toBeTruthy();
    expect(COACHING_CONSENT_LABELS.granted).toBe('Trainer access allowed');

    // Leave: the status the "Your trainer" screen reads, and a withdrawal row.
    await api.coaching.leave.mutate();
    expect(await api.coaching.status.query()).toEqual({ trainer: null, stopped: null });
    const after = (await api.privacy.getConsentHistory.query()).filter(
      (e) => e.kind === 'COACHING_SHARING',
    );
    expect(after.map((e) => e.granted)).toEqual([false, true]);
    // The routine and the cue stay with the client.
    const kept = await api.gym.bootstrap.query({ today: TODAY });
    expect(kept.activeRoutine?.days[0]?.exercises[0]?.trainerNote).toBe(
      'Knees out, slow eccentric',
    );
    expect(kept.coaching).toBeNull();
  });
});
