import { describe, expect, it } from 'vitest';
import type { CoachingNoticeDto } from '@chefer/types';
import { noticeViews } from './notice-view';

const client = { id: 'c1', name: 'Ada', role: 'CLIENT' as const };
const trainer = { id: 't1', name: 'Ana', role: 'TRAINER' as const };
const notice = (over: Partial<CoachingNoticeDto>): CoachingNoticeDto => ({
  id: 'n1',
  kind: 'ROUTINE_UPDATED',
  at: '2026-10-02T12:00:00.000Z',
  read: false,
  other: client,
  ...over,
});

describe('trainer notices', () => {
  it('a client’s routine edit links to that client’s routine with the changes', () => {
    const [view] = noticeViews(
      [notice({ changes: [{ kind: 'removed', exercise: 'Leg press' }] })],
      'trainer',
    );
    expect(view).toMatchObject({
      text: 'Ada changed their routine',
      detail: '− Leg press',
      href: '/trainer/c1/routine',
    });
  });

  it('a client who left, and a new request pointing at Requests', () => {
    const views = noticeViews(
      [
        notice({ id: 'a', kind: 'COACHING_ENDED', endedBy: 'CLIENT' }),
        notice({ id: 'b', kind: 'REQUEST_RECEIVED' }),
      ],
      'trainer',
    );
    expect(views.map((v) => [v.text, v.href])).toEqual([
      ['Ada left. Their routine stays theirs.', null],
      ['Ada asked you to coach them', '#trainer-requests'],
    ]);
  });

  it('skips the trainer’s own ending, read notices and notices from the viewer’s trainer', () => {
    expect(
      noticeViews(
        [
          notice({ kind: 'COACHING_ENDED', endedBy: 'TRAINER' }),
          notice({ read: true }),
          notice({ other: trainer }),
        ],
        'trainer',
      ),
    ).toEqual([]);
  });
});

describe('client notices', () => {
  it('only reads notices from the viewer’s trainer', () => {
    const views = noticeViews(
      [notice({ id: 'mine', other: trainer }), notice({ id: 'theirs' })],
      'client',
    );
    expect(views.map((v) => v.id)).toEqual(['mine']);
  });

  it('a routine card without a change list has no detail line', () => {
    const [view] = noticeViews([notice({ other: trainer, changes: [] })], 'client');
    expect(view?.detail).toBeNull();
  });
});
