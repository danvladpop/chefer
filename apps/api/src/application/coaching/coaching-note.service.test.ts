import { describe, expect, it, vi } from 'vitest';
import type { CoachingLink, CoachingNote } from '@chefer/database';
import type { CoachingAccess } from './coaching-access.service.js';
import { CoachingNoteService } from './coaching-note.service.js';

const TRAINER = 'ctrainer0000000000000001';
const CLIENT = 'cclient00000000000000001';
const link = { id: 'l1' } as CoachingLink;
const access = (withLink: boolean): CoachingAccess => ({
  trainerId: TRAINER,
  clientId: CLIENT,
  scope: 'note',
  link: withLink ? link : null,
});
const note = (over: Partial<CoachingNote> = {}): CoachingNote => ({
  trainerId: TRAINER,
  clientId: CLIENT,
  body: 'left knee, careful',
  updatedAt: new Date('2026-10-03T10:00:00Z'),
  hiddenAt: null,
  ...over,
});

function setup(stored: CoachingNote | null = null) {
  const notes = {
    find: vi.fn(async () => stored),
    upsert: vi.fn(async (_t: string, _c: string, body: string) => note({ body })),
    delete: vi.fn(async () => undefined),
    deleteHiddenBefore: vi.fn(),
  };
  return { service: new CoachingNoteService(notes), notes };
}

describe('CoachingNoteService', () => {
  it('get: the note, or null when there is none', async () => {
    expect(await setup(note()).service.get(access(true))).toEqual({
      body: 'left knee, careful',
      updatedAt: '2026-10-03T10:00:00.000Z',
    });
    expect(await setup(null).service.get(access(true))).toBeNull();
  });

  it('get: a hidden note (the link ended) is not readable', async () => {
    expect(await setup(note({ hiddenAt: new Date() })).service.get(access(false))).toBeNull();
  });

  it('save stores the body as is (opaque: no trimming, filtering or parsing)', async () => {
    const { service, notes } = setup();
    const body = '  anything — even  <b>markup</b> and   spacing\n\nkept  ';
    const out = await service.save(access(true), body);
    expect(notes.upsert).toHaveBeenCalledWith(TRAINER, CLIENT, body);
    expect(out.body).toBe(body);
  });

  it('save with an empty body deletes the note', async () => {
    const { service, notes } = setup(note());
    expect((await service.save(access(true), '')).body).toBe('');
    expect(notes.delete).toHaveBeenCalledWith(TRAINER, CLIENT);
    expect(notes.upsert).not.toHaveBeenCalled();
  });

  it('save needs an ACTIVE link: a note-only access can read, never write', async () => {
    const { service, notes } = setup(note());
    await expect(service.save(access(false), 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(notes.upsert).not.toHaveBeenCalled();
  });

  it('a failed write is rethrown without its cause and without the body (it must not reach logs or Sentry)', async () => {
    const { service, notes } = setup();
    notes.upsert.mockRejectedValueOnce(
      new Error('Invalid `prisma.coachingNote.upsert()` invocation: data: { body: "SECRET-NOTE" }'),
    );
    const err = await service.save(access(true), 'SECRET-NOTE').catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Could not save the note.',
    });
    expect((err as { cause?: unknown }).cause).toBeUndefined();
    expect(JSON.stringify(err, Object.getOwnPropertyNames(err))).not.toContain('SECRET-NOTE');
  });
});
