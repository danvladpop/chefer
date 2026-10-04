import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  coachingInviteRepository,
  coachingLinkRepository,
  coachingNoteRepository,
  prisma,
  routineRepository,
  trainerProfileRepository,
  type RoutineWithDays,
} from '@chefer/database';
import { diffRoutineDoc } from '@chefer/utils';

// Real-database tests for the coaching repositories (WP-18, spec §5, §9). They need
// a migrated PostgreSQL (the lane clone, chefer_wp18), so they are OFF by default
// (CI has no database). Run them with:
//   cd apps/api && COACHING_DB_TEST=1 npx vitest run src/application/coaching/coaching.repository.db
//
// What only a real database can prove: the partial unique index (one ACTIVE link
// per client) under a race, and the stamping done inside replaceDocument's
// version-checked transaction.

const enabled = process.env['COACHING_DB_TEST'] === '1';
const RUN = `dbtest${Date.now().toString(36)}`;
const NOW = new Date();
const PRIVACY = '2026-09-30';

const created: string[] = [];
async function makeUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `${RUN}-${label}@coaching.test`, firstName: label },
  });
  created.push(user.id);
  return user.id;
}

async function makeInvite(trainerId: string, code: string): Promise<string> {
  await coachingInviteRepository.create({
    code,
    trainerId,
    label: null,
    expiresAt: new Date(NOW.getTime() + 14 * 86_400_000),
  });
  return code;
}

const join = (code: string, clientId: string) =>
  coachingLinkRepository.join({
    code,
    clientId,
    source: 'web',
    documentVersion: PRIVACY,
    maxActiveClients: 50,
    now: new Date(),
  });

afterAll(async () => {
  if (!enabled) return;
  // Everything cascades from the users.
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe.skipIf(!enabled)('coaching repositories (real database)', () => {
  let trainerA = '';
  let trainerB = '';

  beforeAll(async () => {
    trainerA = await makeUser('trainerA');
    trainerB = await makeUser('trainerB');
    await trainerProfileRepository.activate(trainerA, 'Ana');
    await trainerProfileRepository.activate(trainerB, 'Ion');
  });

  it('two concurrent joins for one client leave exactly one ACTIVE link', async () => {
    const client = await makeUser('racer');
    const [a, b] = await Promise.all([
      makeInvite(trainerA, `A${RUN}`.toUpperCase().slice(0, 10).padEnd(10, '0')),
      makeInvite(trainerB, `B${RUN}`.toUpperCase().slice(0, 10).padEnd(10, '0')),
    ]);
    const results = await Promise.all([join(a, client), join(b, client)]);
    expect(results.some((r) => r.status === 'joined')).toBe(true);
    for (const r of results) expect(['joined', 'conflict']).toContain(r.status);
    const active = await prisma.coachingLink.findMany({
      where: { clientId: client, status: 'ACTIVE' },
    });
    expect(active).toHaveLength(1);
  });

  it('the partial unique index itself rejects a second ACTIVE link, but allows an ENDED one', async () => {
    const client = await makeUser('index');
    await prisma.coachingLink.create({ data: { trainerId: trainerA, clientId: client } });
    await expect(
      prisma.coachingLink.create({ data: { trainerId: trainerB, clientId: client } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await prisma.coachingLink.create({
      data: {
        trainerId: trainerB,
        clientId: client,
        status: 'ENDED',
        endedAt: NOW,
        endedBy: 'CLIENT',
      },
    });
  });

  it('join consumes the invite, writes the granted event with the link as context; a second use fails', async () => {
    const client = await makeUser('joiner');
    const other = await makeUser('late');
    const code = await makeInvite(trainerA, `J${RUN}`.toUpperCase().slice(0, 10).padEnd(10, '1'));
    const out = await join(code, client);
    if (out.status !== 'joined') throw new Error(`expected joined, got ${out.status}`);
    const events = await prisma.consentEvent.findMany({
      where: { userId: client, kind: 'COACHING_SHARING' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ granted: true, contextId: out.link.id, source: 'web' });
    expect((await coachingInviteRepository.find(code))?.usedById).toBe(client);
    expect((await join(code, other)).status).toBe('invite_unavailable');
  });

  it('a switch ends the old link with a withdrawal, hides its note and creates the new link', async () => {
    const client = await makeUser('switcher');
    const first = await makeInvite(trainerA, `S1${RUN}`.toUpperCase().slice(0, 10).padEnd(10, '2'));
    const second = await makeInvite(
      trainerB,
      `S2${RUN}`.toUpperCase().slice(0, 10).padEnd(10, '3'),
    );
    await join(first, client);
    await coachingNoteRepository.upsert(trainerA, client, 'note about the client');
    const out = await join(second, client);
    if (out.status !== 'joined') throw new Error('expected joined');
    expect(out.endedLinks).toHaveLength(1);
    const events = await prisma.consentEvent.findMany({
      where: { userId: client, kind: 'COACHING_SHARING' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.granted)).toEqual([true, false, true]);
    expect((await coachingNoteRepository.find(trainerA, client))?.hiddenAt).not.toBeNull();
    // Coming back within the retention window un-hides the same note.
    const back = await makeInvite(trainerA, `S3${RUN}`.toUpperCase().slice(0, 10).padEnd(10, '4'));
    await join(back, client);
    const note = await coachingNoteRepository.find(trainerA, client);
    expect(note?.hiddenAt).toBeNull();
    expect(note?.body).toBe('note about the client');
  });

  it('end() writes one withdrawal and is a no-op the second time; deactivate ends everything in one go', async () => {
    const t = await makeUser('tdeact');
    await trainerProfileRepository.activate(t, 'Dee');
    const c1 = await makeUser('c1');
    const c2 = await makeUser('c2');
    await join(await makeInvite(t, `D1${RUN}`.toUpperCase().slice(0, 10).padEnd(10, '5')), c1);
    await join(await makeInvite(t, `D2${RUN}`.toUpperCase().slice(0, 10).padEnd(10, '6')), c2);
    const open = await makeInvite(t, `D3${RUN}`.toUpperCase().slice(0, 10).padEnd(10, '7'));
    await coachingNoteRepository.upsert(t, c1, 'x');

    const end = {
      trainerId: t,
      clientId: c1,
      endedBy: 'TRAINER' as const,
      source: 'web',
      documentVersion: PRIVACY,
      now: new Date(),
    };
    expect(await coachingLinkRepository.end(end)).not.toBeNull();
    expect(await coachingLinkRepository.end(end)).toBeNull();
    expect(
      await prisma.consentEvent.count({
        where: { userId: c1, kind: 'COACHING_SHARING', granted: false },
      }),
    ).toBe(1);

    const res = await trainerProfileRepository.deactivate(t, {
      source: 'web',
      documentVersion: PRIVACY,
      now: new Date(),
    });
    expect(res.endedClientIds).toEqual([c2]);
    expect(await trainerProfileRepository.findActive(t)).toBeNull();
    expect((await coachingInviteRepository.find(open))?.revokedAt).not.toBeNull();
    expect(await coachingLinkRepository.findActiveForClient(c2)).toBeNull();
    expect((await coachingNoteRepository.find(t, c1))?.hiddenAt).not.toBeNull();
    // Idempotent.
    expect(
      (
        await trainerProfileRepository.deactivate(t, {
          source: 'web',
          documentVersion: PRIVACY,
          now: new Date(),
        })
      ).endedClientIds,
    ).toEqual([]);
  });

  describe('replaceDocument: stamps and trainer notes', () => {
    let owner = '';
    let routine: RoutineWithDays;

    const write = (
      row: RoutineWithDays,
      edit: (days: RoutineWithDays['days']) => RoutineWithDays['days'],
    ) => ({
      name: row.name,
      days: edit(row.days).map((d) => ({
        id: d.id,
        name: d.name,
        plannedWeekday: d.plannedWeekday,
        exercises: d.exercises.map((e) => ({
          id: e.id,
          exerciseId: e.exerciseId,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSec: e.restSec,
          supersetGroup: e.supersetGroup,
          notes: e.notes,
        })),
      })),
    });

    beforeAll(async () => {
      owner = await makeUser('owner');
      const exercises = await prisma.exercise.findMany({ where: { ownerId: null }, take: 3 });
      if (exercises.length < 3)
        throw new Error('the curated library is empty: start the API once or run the seed');
      routine = await routineRepository.create(owner, {
        name: 'Plan',
        templateKey: null,
        isActive: true,
        days: [
          {
            name: 'A',
            plannedWeekday: 0,
            exercises: exercises.map((e) => ({
              exerciseId: e.id,
              sets: 3,
              repMin: 6,
              repMax: 8,
              targetRir: 2,
              restSec: 120,
              supersetGroup: null,
              notes: `owner note ${e.id}`,
            })),
          },
        ],
      });
    });

    it('a TRAINER save stamps only the changed row and the routine, writes trainerNote, never the client’s notes', async () => {
      const rows = routine.days[0]?.exercises ?? [];
      const doc = write(routine, (d) => d);
      const first = doc.days[0]?.exercises[0];
      if (!first) throw new Error('no row');
      const res = await routineRepository.replaceDocument(
        owner,
        routine.id,
        {
          ...doc,
          days: doc.days.map((d) => ({
            ...d,
            exercises: d.exercises.map((e, i) => ({
              ...e,
              // a hostile `notes` value from a trainer path must be ignored
              notes: 'TRAINER-TRIED-TO-WRITE-THIS',
              sets: i === 0 ? 4 : e.sets,
              trainerNote: i === 0 ? 'knees out' : null,
            })),
          })),
        },
        routine.version,
        { actorId: trainerA, path: 'TRAINER', diff: diffRoutineDoc },
      );
      if (res.status !== 'ok') throw new Error(res.status);
      routine = res.routine;
      const saved = routine.days[0]?.exercises ?? [];
      expect(saved[0]).toMatchObject({
        sets: 4,
        trainerNote: 'knees out',
        lastEditedById: trainerA,
      });
      expect(saved[0]?.lastEditedAt).not.toBeNull();
      for (const [i, e] of saved.slice(1).entries()) {
        expect(e.lastEditedById).toBeNull();
        expect(e.lastEditedAt).toBeNull();
        expect(e.trainerNote).toBeNull();
        expect(e.notes).toBe(rows[i + 1]?.notes);
      }
      expect(saved[0]?.notes).toBe(rows[0]?.notes);
      expect(routine.lastEditedById).toBe(trainerA);
    });

    it('an identical OWNER save changes nothing and stamps nothing (stamps are not re-written)', async () => {
      const before = routine;
      const res = await routineRepository.replaceDocument(
        owner,
        routine.id,
        write(routine, (d) => d),
        routine.version,
        { actorId: owner, path: 'OWNER', diff: diffRoutineDoc },
      );
      if (res.status !== 'ok') throw new Error(res.status);
      routine = res.routine;
      expect(routine.version).toBe(before.version + 1);
      expect(routine.lastEditedById).toBe(trainerA);
      expect(routine.lastEditedAt?.getTime()).toBe(before.lastEditedAt?.getTime());
      expect(routine.days[0]?.exercises[0]?.trainerNote).toBe('knees out');
    });

    it('an OWNER full save without the field keeps the trainer note; a changed row is stamped with the owner', async () => {
      const res = await routineRepository.replaceDocument(
        owner,
        routine.id,
        {
          ...write(routine, (d) => d),
          days: write(routine, (d) => d).days.map((d) => ({
            ...d,
            exercises: d.exercises.map((e, i) => ({ ...e, restSec: i === 1 ? 150 : e.restSec })),
          })),
        },
        routine.version,
        { actorId: owner, path: 'OWNER', diff: diffRoutineDoc },
      );
      if (res.status !== 'ok') throw new Error(res.status);
      routine = res.routine;
      const saved = routine.days[0]?.exercises ?? [];
      expect(saved[0]?.trainerNote).toBe('knees out');
      expect(saved[0]?.lastEditedById).toBe(trainerA); // untouched row keeps the trainer's stamp
      expect(saved[1]).toMatchObject({ restSec: 150, lastEditedById: owner });
      expect(routine.lastEditedById).toBe(owner);
    });

    it('legacy call (no actor): no stamps, trainer note untouched', async () => {
      const res = await routineRepository.replaceDocument(
        owner,
        routine.id,
        write(routine, (d) => d),
        routine.version,
      );
      if (res.status !== 'ok') throw new Error(res.status);
      routine = res.routine;
      expect(routine.days[0]?.exercises[0]?.trainerNote).toBe('knees out');
    });

    it('clearTrainerNoteIds removes just those notes (the client can remove, never rewrite)', async () => {
      const target = routine.days[0]?.exercises[0];
      if (!target) throw new Error('no row');
      const res = await routineRepository.replaceDocument(
        owner,
        routine.id,
        write(routine, (d) => d),
        routine.version,
        { actorId: owner, path: 'OWNER', clearTrainerNoteIds: [target.id], diff: diffRoutineDoc },
      );
      if (res.status !== 'ok') throw new Error(res.status);
      routine = res.routine;
      expect(routine.days[0]?.exercises[0]?.trainerNote).toBeNull();
      expect(routine.days[0]?.exercises[0]?.lastEditedById).toBe(owner);
    });

    it('a stale version is a conflict and writes nothing', async () => {
      const res = await routineRepository.replaceDocument(
        owner,
        routine.id,
        write(routine, (d) => d),
        routine.version - 1,
        { actorId: trainerA, path: 'TRAINER', diff: diffRoutineDoc },
      );
      expect(res.status).toBe('conflict');
    });

    it('a new row added by the trainer is stamped and carries its note; a removed row changes the routine', async () => {
      const lib = await prisma.exercise.findFirst({ where: { ownerId: null }, skip: 10 });
      if (!lib) throw new Error('no exercise');
      const base = write(routine, (d) => d);
      const res = await routineRepository.replaceDocument(
        owner,
        routine.id,
        {
          ...base,
          days: base.days.map((d) => ({
            ...d,
            exercises: [
              ...d.exercises.slice(0, 2).map((e) => ({ ...e, trainerNote: null })),
              {
                exerciseId: lib.id,
                sets: 3,
                repMin: 8,
                repMax: 10,
                targetRir: 2,
                restSec: 90,
                supersetGroup: null,
                notes: 'ignored on the trainer path',
                trainerNote: 'new cue',
              },
            ],
          })),
        },
        routine.version,
        { actorId: trainerB, path: 'TRAINER', diff: diffRoutineDoc },
      );
      if (res.status !== 'ok') throw new Error(res.status);
      const rows = res.routine.days[0]?.exercises ?? [];
      expect(rows).toHaveLength(3);
      expect(rows[2]).toMatchObject({
        trainerNote: 'new cue',
        notes: null,
        lastEditedById: trainerB,
      });
      expect(res.routine.lastEditedById).toBe(trainerB);
    });
  });
});
