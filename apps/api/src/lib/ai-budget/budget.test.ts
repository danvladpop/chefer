import { describe, expect, it, vi } from 'vitest';
import {
  AI_PAUSED_TODAY_MESSAGE,
  AI_USER_BUDGET_MESSAGE,
  AiBudget,
  type AiBudgetConfig,
  type AiBudgetEnforce,
} from './budget.js';

// ─── AI budgets (Phase 2) ─────────────────────────────────────────────────────
// A fake repository: `global` is today's total, `users` each user's month, all
// in micro-USD. The clock is injectable, so day/month rollovers are tested.

const USD = 1_000_000;

function setup(
  opts: {
    enforce?: AiBudgetEnforce;
    global?: number;
    users?: Record<string, number>;
    now?: Date;
    cacheMs?: number;
  } = {},
) {
  const state = {
    global: opts.global ?? 0,
    users: { ...(opts.users ?? {}) } as Record<string, number>,
    now: opts.now ?? new Date('2026-10-11T10:00:00Z'),
  };
  const repo = {
    sumCostSince: vi.fn((_since: Date, userId?: string) =>
      Promise.resolve(userId === undefined ? state.global : (state.users[userId] ?? 0)),
    ),
  };
  const sendAlert = vi.fn((_alert: { subject: string; text: string }) => Promise.resolve());
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const config: AiBudgetConfig = {
    enforce: opts.enforce ?? 'on',
    userSoftUsd: 3,
    userHardUsd: 6,
    globalDailyUsd: 25,
  };
  const budget = new AiBudget(config, {
    repo,
    sendAlert,
    log,
    now: () => state.now,
    cacheMs: opts.cacheMs ?? 60_000,
  });
  return { budget, repo, sendAlert, log, state };
}

describe('AiBudget — per-user monthly budget', () => {
  it('allows a user under the soft limit, silently', async () => {
    const { budget, log } = setup({ users: { u1: 1 * USD } });
    expect(await budget.checkUser('u1')).toBeNull();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('above soft: allowed, logged once per user per month, flagged in the status', async () => {
    const { budget, log, state } = setup({ users: { u1: 3.5 * USD }, cacheMs: 0 });
    expect(await budget.checkUser('u1')).toBeNull();
    expect(await budget.checkUser('u1')).toBeNull();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn.mock.calls[0]![0]).toContain('soft monthly AI budget');
    expect((await budget.userStatus('u1')).status).toBe('soft');
    // A new month logs again.
    state.now = new Date('2026-11-02T10:00:00Z');
    await budget.checkUser('u1');
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('at the hard limit: refused with the friendly monthly message', async () => {
    const { budget } = setup({ users: { u1: 6 * USD } });
    expect(await budget.checkUser('u1')).toEqual({
      reason: 'user_monthly',
      message: AI_USER_BUDGET_MESSAGE,
    });
    expect(await budget.checkUser('u2')).toBeNull();
    const status = await budget.userStatus('u1');
    expect(status).toMatchObject({
      monthCostUsd: 6,
      softLimitUsd: 3,
      hardLimitUsd: 6,
      status: 'hard',
      pausedToday: false,
    });
  });

  it('counts calls recorded since the last read (the cache never lags real spend)', async () => {
    const { budget, repo } = setup({ users: { u1: 5.9 * USD } });
    expect(await budget.checkUser('u1')).toBeNull();
    budget.record({ userId: 'u1', costMicroUsd: 0.2 * USD });
    expect(await budget.checkUser('u1')).not.toBeNull();
    // Still one query per user (+ the global one) within the cache window.
    expect(repo.sumCostSince.mock.calls.filter((c) => c[1] === 'u1')).toHaveLength(1);
  });

  it('re-reads after the cache window and at a new month', async () => {
    const { budget, repo, state } = setup({ users: { u1: 6 * USD } });
    await budget.checkUser('u1');
    state.now = new Date('2026-11-01T00:00:01Z');
    state.users['u1'] = 0;
    expect(await budget.checkUser('u1')).toBeNull();
    expect(repo.sumCostSince.mock.calls.filter((c) => c[1] === 'u1')).toHaveLength(2);
    // The month query starts on the 1st, UTC.
    const since = repo.sumCostSince.mock.calls.at(-1)![0];
    expect(since.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});

describe('AiBudget — global daily kill-switch', () => {
  it('caches the day total for ~60 s (one query, not one per call)', async () => {
    const { budget, repo, state } = setup({ global: 1 * USD });
    await budget.backgroundAllowed();
    await budget.backgroundAllowed();
    await budget.checkUser('u1');
    expect(repo.sumCostSince.mock.calls.filter((c) => c[1] === undefined)).toHaveLength(1);
    state.now = new Date(state.now.getTime() + 61_000);
    await budget.backgroundAllowed();
    expect(repo.sumCostSince.mock.calls.filter((c) => c[1] === undefined)).toHaveLength(2);
  });

  it('emails once per threshold per day: 50%, 80%, then 100% (paused)', async () => {
    const { budget, sendAlert, state } = setup({ global: 10 * USD });
    await budget.globalSpend();
    expect(sendAlert).not.toHaveBeenCalled();

    budget.record({ userId: null, costMicroUsd: 3 * USD }); // 13 / 25 = 52%
    budget.record({ userId: null, costMicroUsd: 0.1 * USD });
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0]![0].subject).toContain('50%');

    budget.record({ userId: null, costMicroUsd: 7 * USD }); // 20.1 → 80%
    expect(sendAlert).toHaveBeenCalledTimes(2);
    expect(sendAlert.mock.calls[1]![0].subject).toContain('80%');

    budget.record({ userId: 'u1', costMicroUsd: 5 * USD }); // 25.1 → 100%
    expect(sendAlert).toHaveBeenCalledTimes(3);
    expect(sendAlert.mock.calls[2]![0].text).toContain('PAUSED');

    // Re-reading the same day does not resend anything.
    state.now = new Date(state.now.getTime() + 120_000);
    state.global = 30 * USD;
    await budget.globalSpend();
    expect(sendAlert).toHaveBeenCalledTimes(3);
  });

  it('a jump past several thresholds sends only the highest one', async () => {
    const { budget, sendAlert } = setup({ global: 21 * USD });
    await budget.globalSpend();
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0]![0].subject).toContain('80%');
  });

  it('alerts again on the next UTC day', async () => {
    const { budget, sendAlert, state, repo } = setup({ global: 13 * USD });
    await budget.globalSpend();
    state.now = new Date('2026-10-12T00:05:00Z');
    await budget.globalSpend();
    expect(sendAlert).toHaveBeenCalledTimes(2);
    expect(repo.sumCostSince.mock.calls.at(-1)![0].toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });

  it('at 100%: user AI is refused ("paused for today") and background AI pauses', async () => {
    const { budget } = setup({ global: 25 * USD });
    expect(await budget.checkUser('u1')).toEqual({
      reason: 'global_daily',
      message: AI_PAUSED_TODAY_MESSAGE,
    });
    expect(await budget.backgroundAllowed()).toBe(false);
    expect((await budget.userStatus('u1')).pausedToday).toBe(true);
  });

  it('resumes at the next UTC day', async () => {
    const { budget, state } = setup({ global: 25 * USD });
    expect(await budget.backgroundAllowed()).toBe(false);
    state.now = new Date('2026-10-12T00:00:01Z');
    state.global = 0;
    expect(await budget.backgroundAllowed()).toBe(true);
    expect(await budget.checkUser('u1')).toBeNull();
  });

  it('an alert that fails to send is logged, never thrown', async () => {
    const { budget, sendAlert, log } = setup({ global: 13 * USD });
    sendAlert.mockRejectedValueOnce(new Error('smtp down'));
    await expect(budget.globalSpend()).resolves.toBeDefined();
    await new Promise((r) => setTimeout(r, 0));
    expect(log.error).toHaveBeenCalledWith(
      '[ai.budget] could not send the budget alert email',
      expect.any(Error),
    );
  });
});

describe('AiBudget — AI_BUDGET_ENFORCE', () => {
  it('warn: never refuses, but logs and still emails', async () => {
    const { budget, sendAlert, log } = setup({
      enforce: 'warn',
      global: 30 * USD,
      users: { u1: 10 * USD },
    });
    expect(await budget.checkUser('u1')).toBeNull();
    expect(await budget.backgroundAllowed()).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('AI_BUDGET_ENFORCE=warn'));
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0]![0].text).toContain('warning only');
    expect((await budget.userStatus('u1')).pausedToday).toBe(false);
  });

  it('off: checks nothing, queries nothing, emails nothing', async () => {
    const { budget, repo, sendAlert } = setup({
      enforce: 'off',
      global: 30 * USD,
      users: { u1: 10 * USD },
    });
    expect(await budget.checkUser('u1')).toBeNull();
    expect(await budget.backgroundAllowed()).toBe(true);
    expect(repo.sumCostSince).not.toHaveBeenCalled();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('gates() exposes the checks for lib/ai/budget-gate.ts', async () => {
    const { budget } = setup({ global: 25 * USD });
    const gates = budget.gates();
    expect(await gates.background()).toBe(false);
    expect((await gates.user('u1'))?.reason).toBe('global_daily');
  });
});
