import { TRPCError } from '@trpc/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  prisma,
  type ModerationAction,
  type ModerationLog,
  type ModerationLogEntry,
  type ReportReason,
  type SocialDbClient,
  type SocialProfile,
  type UserReport,
} from '@chefer/database';
import { FRIENDS_COPY, MODERATION } from '@chefer/types';
import { TextRejectedCause } from '../../lib/friends-errors.js';
import type { SocialTx } from './activity.service.js';
import {
  isEligibleReporter,
  ModerationService,
  runSerializableTx,
  type ModerationAccess,
} from './moderation.service.js';

// Moderation (PRD §9, FR-13.4–13.8; plan §4.6 and §9 "Moderation" row).
// An in-memory world stands in for the repositories with their real
// semantics: distinct-reporter counting over eligible, not-discounted
// reports; conditional hide / force-private writes. Every write records the
// transaction client it ran on, so "one log row in the SAME transaction as
// the action" (INV-10) is asserted, not assumed.

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return { ...mod, prisma: { $transaction: vi.fn() } };
});

const OWNER = 'cowner000000000000000001';
const REPORTERS = Array.from({ length: 8 }, (_, i) => `crep${String(i).padStart(20, '0')}`);
const [R1, R2, R3, R4, R5, R6] = REPORTERS as [string, string, string, string, string, string];
const STRANGER = 'cstranger000000000000001';
const NOW = new Date('2026-10-01T12:00:00.000Z');
const OLD = new Date('2026-09-01T12:00:00.000Z');
const RECIPE = 'crecipe00000000000000001';
const RECIPE_B = 'crecipe00000000000000002';
const BLOCKED = 'fuck';

interface RecipeRow {
  id: string;
  creatorId: string | null;
  source: string;
  originRecipeId: string | null;
  name: string;
  description: string;
  hiddenAt: Date | null;
  hiddenReason: 'REPORTS' | 'FILTER' | null;
}

type Write = { op: string; db: SocialDbClient | undefined; args: unknown[] };

function makeWorld(opts: { visible?: string[]; ties?: string[] } = {}) {
  const writes: Write[] = [];
  const reports: UserReport[] = [];
  const logs: ModerationLog[] = [];
  const recipes = new Map<string, RecipeRow>();
  const profiles = new Map<string, SocialProfile>();
  const users = new Map<string, { createdAt: Date; emailVerified: Date | null }>();
  const blocks: [string, string][] = [];
  const visible = new Set(opts.visible ?? [OWNER]);
  const ties = new Set(opts.ties ?? []);
  for (const id of [...REPORTERS, STRANGER]) users.set(id, { createdAt: OLD, emailVerified: OLD });

  const addProfile = (userId: string, patch: Partial<SocialProfile> = {}) =>
    profiles.set(userId, {
      userId,
      visibility: 'PUBLIC',
      searchName: 'x',
      sharePlan: true,
      shareRecipes: true,
      shareWorkouts: true,
      shareTargets: false,
      forcedPrivateAt: null,
      featured: false,
      activatedAt: OLD,
      updatedAt: OLD,
      ...patch,
    });
  addProfile(OWNER);

  const addRecipe = (patch: Partial<RecipeRow> & { id: string }) =>
    recipes.set(patch.id, {
      creatorId: OWNER,
      source: 'MANUAL',
      originRecipeId: null,
      name: 'Tomato soup',
      description: 'Warm and red.',
      hiddenAt: null,
      hiddenReason: null,
      ...patch,
    });
  addRecipe({ id: RECIPE });
  addRecipe({ id: RECIPE_B, name: 'Bean stew' });

  const distinct = (pred: (r: UserReport) => boolean) =>
    new Set(
      reports.filter((r) => r.eligible && !r.discountedAt && pred(r)).map((r) => r.reporterId),
    ).size;

  const reportRepo = {
    create: vi.fn(
      (data: Omit<UserReport, 'id' | 'createdAt' | 'discountedAt'>, db?: SocialDbClient) => {
        writes.push({ op: 'report.create', db, args: [data] });
        const row: UserReport = {
          id: `rep${reports.length}`,
          createdAt: NOW,
          discountedAt: null,
          ...data,
          recipeId: data.recipeId ?? null,
        };
        reports.push(row);
        return Promise.resolve(row);
      },
    ),
    distinctEligibleReportersForRecipe: vi.fn((recipeId: string) =>
      Promise.resolve(distinct((r) => r.recipeId === recipeId)),
    ),
    distinctEligibleReportersForUser: vi.fn((userId: string) =>
      Promise.resolve(distinct((r) => r.targetUserId === userId)),
    ),
    discountForRecipe: vi.fn((recipeId: string, db?: SocialDbClient) => {
      writes.push({ op: 'report.discountForRecipe', db, args: [recipeId] });
      const live = reports.filter((r) => r.recipeId === recipeId && !r.discountedAt);
      for (const r of live) r.discountedAt = NOW;
      return Promise.resolve(live.length);
    }),
    discountForUser: vi.fn((userId: string, db?: SocialDbClient) => {
      writes.push({ op: 'report.discountForUser', db, args: [userId] });
      const live = reports.filter((r) => r.targetUserId === userId && !r.discountedAt);
      for (const r of live) r.discountedAt = NOW;
      return Promise.resolve(live.length);
    }),
    countSince: vi.fn(() => Promise.resolve({ reports: 9, eligibleReports: 4 })),
    reporterFacts: vi.fn((id: string) => Promise.resolve(users.get(id) ?? null)),
    hasSocialTie: vi.fn((_reporter: string, target: string) => Promise.resolve(ties.has(target))),
  };

  const moderationRepo = {
    log: vi.fn((entry: ModerationLogEntry, db?: SocialDbClient) => {
      writes.push({ op: `log.${entry.action}`, db, args: [entry] });
      const row: ModerationLog = {
        id: `log${logs.length}`,
        createdAt: NOW,
        recipeId: null,
        distinctReporters: null,
        undoOfId: null,
        ...entry,
      };
      logs.push(row);
      return Promise.resolve(row);
    }),
    find: vi.fn((id: string) => Promise.resolve(logs.find((l) => l.id === id) ?? null)),
    findUndoOf: vi.fn((id: string) =>
      Promise.resolve(logs.find((l) => l.action === 'UNDO' && l.undoOfId === id) ?? null),
    ),
    findRecipeForReport: vi.fn((id: string) => Promise.resolve(recipes.get(id) ?? null)),
    weeklyCounts: vi.fn(() =>
      Promise.resolve({
        RECIPE_AUTO_HIDDEN: 1,
        ACCOUNT_FORCED_PRIVATE: 2,
        RECIPE_FILTER_HIDDEN: 3,
        NAME_REJECTED: 4,
        RECIPE_TEXT_REJECTED: 5,
        UNDO: 6,
      } satisfies Record<ModerationAction, number>),
    ),
    hideRecipe: vi.fn((id: string, reason: 'REPORTS' | 'FILTER', db?: SocialDbClient) => {
      const r = recipes.get(id);
      if (!r || r.hiddenAt) return Promise.resolve(false);
      writes.push({ op: `hide.${reason}`, db, args: [id] });
      r.hiddenAt = NOW;
      r.hiddenReason = reason;
      return Promise.resolve(true);
    }),
    unhideRecipe: vi.fn((id: string, only?: 'REPORTS' | 'FILTER', db?: SocialDbClient) => {
      const r = recipes.get(id);
      if (!r?.hiddenAt || (only && r.hiddenReason !== only)) return Promise.resolve(false);
      writes.push({ op: 'unhide', db, args: [id, only] });
      r.hiddenAt = null;
      r.hiddenReason = null;
      return Promise.resolve(true);
    }),
    ownSharedRecipesForFilter: vi.fn((userId: string) =>
      Promise.resolve(
        [...recipes.values()]
          .filter(
            (r) =>
              r.creatorId === userId &&
              r.source === 'MANUAL' &&
              r.originRecipeId === null &&
              !r.hiddenAt,
          )
          .map(({ id, name, description }) => ({ id, name, description })),
      ),
    ),
  };

  const profileRepo = {
    find: vi.fn((id: string) => Promise.resolve(profiles.get(id) ?? null)),
    forcePrivate: vi.fn((id: string, db?: SocialDbClient) => {
      const p = profiles.get(id);
      if (!p || p.forcedPrivateAt) return Promise.resolve(false);
      writes.push({ op: 'forcePrivate', db, args: [id] });
      p.forcedPrivateAt = NOW;
      p.visibility = 'PRIVATE';
      return Promise.resolve(true);
    }),
    clearForcedPrivate: vi.fn((id: string, db?: SocialDbClient) => {
      const p = profiles.get(id);
      if (!p?.forcedPrivateAt) return Promise.resolve(false);
      writes.push({ op: 'clearForcedPrivate', db, args: [id] });
      p.forcedPrivateAt = null;
      return Promise.resolve(true);
    }),
  };

  const access: ModerationAccess = {
    resolve: vi.fn((_viewer: string, owner: string) =>
      Promise.resolve({
        visible: visible.has(owner),
        isSelf: false,
        ownerVisibility: null,
        outgoing: null,
        incoming: null,
        can: { plan: 'locked', recipes: 'locked', workouts: 'locked', targets: false },
      } as const),
    ),
  };
  const blockSvc = {
    blockInTx: vi.fn((db: SocialDbClient, a: string, b: string) => {
      writes.push({ op: 'block', db, args: [a, b] });
      blocks.push([a, b]);
      return Promise.resolve({ blockerId: a, blockedId: b, createdAt: NOW });
    }),
    invalidateCaches: vi.fn(),
  };
  const suggestions = { invalidateAll: vi.fn() };

  const txs: { kind: string; db: SocialDbClient }[] = [];
  const runner =
    (kind: string): SocialTx =>
    (fn) => {
      const db = { tx: txs.length, kind } as unknown as SocialDbClient;
      txs.push({ kind, db });
      return fn(db);
    };

  const service = new ModerationService(
    reportRepo,
    moderationRepo,
    profileRepo,
    access,
    blockSvc,
    suggestions,
    runner('serializable'),
    runner('plain'),
    () => NOW,
  );

  const report = (reporterId: string, extra: { recipeId?: string; reason?: ReportReason } = {}) =>
    service.reportAndBlock(reporterId, {
      userId: OWNER,
      reason: extra.reason ?? 'INAPPROPRIATE',
      ...(extra.recipeId && { recipeId: extra.recipeId }),
    });

  return {
    service,
    report,
    writes,
    reports,
    logs,
    recipes,
    profiles,
    users,
    blocks,
    txs,
    addProfile,
    addRecipe,
    reportRepo,
    moderationRepo,
    profileRepo,
    blockSvc,
    suggestions,
    logsOf: (action: ModerationAction) => logs.filter((l) => l.action === action),
    firstLog: (action: ModerationAction): ModerationLog => {
      const row = logs.find((l) => l.action === action);
      if (!row) throw new Error(`no ${action} row`);
      return row;
    },
  };
}

async function rejection(p: Promise<unknown>): Promise<TRPCError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    return err as TRPCError;
  }
  throw new Error('expected a rejection');
}

/** Every write of a log row happened on the same tx client as `op`'s write. */
function sameTx(writes: Write[], op: string, logOp: string) {
  const action = writes.filter((w) => w.op === op);
  const log = writes.filter((w) => w.op === logOp);
  expect(action.length).toBe(log.length);
  action.forEach((w, i) => {
    expect(w.db).toBeDefined();
    expect(log[i]?.db).toBe(w.db);
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Eligibility ───────────────────────────────────────────────────────────────

describe('isEligibleReporter (PRD §9.3)', () => {
  const hours = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
  it('needs an account at least 24 h old and a confirmed email', () => {
    expect(isEligibleReporter({ createdAt: hours(24), emailVerified: OLD }, NOW)).toBe(true);
    expect(isEligibleReporter({ createdAt: hours(23.99), emailVerified: OLD }, NOW)).toBe(false);
    expect(isEligibleReporter({ createdAt: hours(500), emailVerified: null }, NOW)).toBe(
      !MODERATION.REPORTER_REQUIRES_VERIFIED_EMAIL,
    );
  });
});

// ─── reportAndBlock ────────────────────────────────────────────────────────────

describe('reportAndBlock — validation (INV-3)', () => {
  it('refuses to report yourself', async () => {
    const w = makeWorld();
    const err = await rejection(w.service.reportAndBlock(OWNER, { userId: OWNER, reason: 'SPAM' }));
    expect(err.code).toBe('BAD_REQUEST');
    expect(w.writes).toEqual([]);
  });

  it('a target that is not header-visible and has no tie is the one NOT_FOUND, nothing written', async () => {
    const w = makeWorld({ visible: [] });
    const err = await rejection(w.report(R1));
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe(FRIENDS_COPY.notAvailable.title);
    expect(w.writes).toEqual([]);
    expect(w.blockSvc.invalidateCaches).not.toHaveBeenCalled();
  });

  it('a follow / Activity tie is enough when the header is not visible', async () => {
    const w = makeWorld({ visible: [], ties: [OWNER] });
    await expect(w.report(R1)).resolves.toEqual({ ok: true });
    expect(w.reports).toHaveLength(1);
    expect(w.blocks).toEqual([[R1, OWNER]]);
  });

  it("a recipe must be the target's own shared recipe (MANUAL, not a copy)", async () => {
    const w = makeWorld();
    w.addRecipe({ id: 'cother', creatorId: STRANGER });
    w.addRecipe({ id: 'cai', source: 'AI' });
    w.addRecipe({ id: 'ccopy', originRecipeId: 'csrc' });
    for (const recipeId of ['cmissing', 'cother', 'cai', 'ccopy']) {
      const err = await rejection(w.report(R1, { recipeId }));
      expect(err.code).toBe('NOT_FOUND');
    }
    expect(w.writes).toEqual([]);
  });
});

describe('reportAndBlock — report + block in one SERIALIZABLE transaction', () => {
  it('files the report, blocks, and returns { ok: true } with no notification', async () => {
    const w = makeWorld();
    await expect(w.report(R1, { recipeId: RECIPE, reason: 'SPAM' })).resolves.toEqual({ ok: true });
    expect(w.reports).toEqual([
      expect.objectContaining({
        reporterId: R1,
        targetUserId: OWNER,
        recipeId: RECIPE,
        reason: 'SPAM',
        eligible: true,
      }),
    ]);
    expect(w.txs.map((t) => t.kind)).toEqual(['serializable']);
    const db = w.txs[0]?.db;
    expect(w.writes.map((x) => [x.op, x.db])).toEqual([
      ['report.create', db],
      ['block', db],
    ]);
    expect(w.blockSvc.invalidateCaches).toHaveBeenCalledWith(R1, OWNER);
    expect(w.suggestions.invalidateAll).not.toHaveBeenCalled();
  });

  it('ineligible reports (new or unverified accounts) block but do not count', async () => {
    const w = makeWorld();
    w.users.set(R3, { createdAt: new Date(NOW.getTime() - 3_600_000), emailVerified: OLD }); // 1 h old
    w.users.set(R4, { createdAt: OLD, emailVerified: null }); // unverified
    w.users.set(R5, { createdAt: new Date(NOW.getTime() - 60_000), emailVerified: null });
    for (const r of [R1, R2, R3, R4, R5]) await w.report(r, { recipeId: RECIPE });

    expect(w.reports.map((r) => r.eligible)).toEqual([true, true, false, false, false]);
    expect(w.blocks).toHaveLength(5); // every one of them blocked
    expect(w.recipes.get(RECIPE)?.hiddenAt).toBeNull(); // 2 eligible < 3
    expect(w.profiles.get(OWNER)?.forcedPrivateAt).toBeNull(); // 2 eligible < 5
    expect(w.logs).toEqual([]);
  });

  it('counts distinct reporters: the same reporter twice counts once', async () => {
    const w = makeWorld();
    await w.report(R1, { recipeId: RECIPE });
    await w.report(R1, { recipeId: RECIPE }); // e.g. after an unblock
    await w.report(R2, { recipeId: RECIPE });
    expect(w.reports).toHaveLength(3);
    expect(w.recipes.get(RECIPE)?.hiddenAt).toBeNull(); // 2 distinct
    await w.report(R3, { recipeId: RECIPE });
    expect(w.recipes.get(RECIPE)?.hiddenReason).toBe('REPORTS');
  });
});

describe('reportAndBlock — recipe threshold (exactly 3)', () => {
  it('hides at the 3rd distinct eligible reporter, logs once in the same transaction, never again', async () => {
    const w = makeWorld();
    await w.report(R1, { recipeId: RECIPE });
    await w.report(R2, { recipeId: RECIPE });
    expect(w.recipes.get(RECIPE)?.hiddenAt).toBeNull();
    expect(w.logs).toEqual([]);

    await w.report(R3, { recipeId: RECIPE });
    expect(w.recipes.get(RECIPE)).toMatchObject({ hiddenAt: NOW, hiddenReason: 'REPORTS' });
    expect(w.logsOf('RECIPE_AUTO_HIDDEN')).toEqual([
      expect.objectContaining({
        targetUserId: OWNER,
        recipeId: RECIPE,
        distinctReporters: 3,
        reason: '3 distinct eligible reporters',
        actor: 'system',
      }),
    ]);
    sameTx(w.writes, 'hide.REPORTS', 'log.RECIPE_AUTO_HIDDEN');
    // The hide ran in the 3rd report's own serializable transaction.
    expect(w.writes.find((x) => x.op === 'hide.REPORTS')?.db).toBe(w.txs[2]?.db);

    await w.report(R4, { recipeId: RECIPE });
    expect(w.logsOf('RECIPE_AUTO_HIDDEN')).toHaveLength(1);
  });

  it("only that recipe's reports count toward it", async () => {
    const w = makeWorld();
    await w.report(R1, { recipeId: RECIPE });
    await w.report(R2, { recipeId: RECIPE_B });
    await w.report(R3); // a profile report
    expect(w.recipes.get(RECIPE)?.hiddenAt).toBeNull();
    expect(w.recipes.get(RECIPE_B)?.hiddenAt).toBeNull();
  });
});

describe('reportAndBlock — account threshold (exactly 5)', () => {
  it('forces private at the 5th distinct eligible reporter across profile and recipe reports', async () => {
    const w = makeWorld();
    await w.report(R1);
    await w.report(R2, { recipeId: RECIPE });
    await w.report(R3, { recipeId: RECIPE_B });
    await w.report(R4);
    expect(w.profiles.get(OWNER)?.forcedPrivateAt).toBeNull();
    expect(w.suggestions.invalidateAll).not.toHaveBeenCalled();

    await w.report(R5);
    expect(w.profiles.get(OWNER)).toMatchObject({ forcedPrivateAt: NOW, visibility: 'PRIVATE' });
    expect(w.logsOf('ACCOUNT_FORCED_PRIVATE')).toEqual([
      expect.objectContaining({
        targetUserId: OWNER,
        distinctReporters: 5,
        reason: '5 distinct eligible reporters',
        actor: 'system',
      }),
    ]);
    sameTx(w.writes, 'forcePrivate', 'log.ACCOUNT_FORCED_PRIVATE');
    expect(w.suggestions.invalidateAll).toHaveBeenCalledTimes(1);

    await w.report(R6);
    expect(w.logsOf('ACCOUNT_FORCED_PRIVATE')).toHaveLength(1);
    expect(w.suggestions.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('a target without a SocialProfile is never forced (nothing to force) and nothing is logged', async () => {
    const w = makeWorld({ visible: [], ties: [OWNER] });
    w.profiles.delete(OWNER);
    for (const r of [R1, R2, R3, R4, R5]) await w.report(r);
    expect(w.logs).toEqual([]);
  });
});

// ─── hideFilteredRecipes ───────────────────────────────────────────────────────

describe('hideFilteredRecipes (turn-on and recipes-on)', () => {
  it('hides only own shared recipes that trip the filter, one log row each in the same tx', async () => {
    const w = makeWorld();
    w.addRecipe({ id: 'cbadname', name: `${BLOCKED} pie` });
    w.addRecipe({ id: 'cbaddesc', description: `So ${BLOCKED} good` });
    w.addRecipe({ id: 'cbadsus', name: `${BLOCKED} pie`, hiddenAt: OLD, hiddenReason: 'REPORTS' });
    w.addRecipe({ id: 'cbadcopy', name: `${BLOCKED} pie`, originRecipeId: 'csrc' });
    w.addRecipe({ id: 'cscunthorpe', name: 'Scunthorpe cocktail sausages' });

    await expect(w.service.hideFilteredRecipes(OWNER)).resolves.toBe(2);
    expect(w.recipes.get('cbadname')).toMatchObject({ hiddenReason: 'FILTER' });
    expect(w.recipes.get('cbaddesc')).toMatchObject({ hiddenReason: 'FILTER' });
    expect(w.recipes.get('cbadsus')?.hiddenReason).toBe('REPORTS'); // untouched
    expect(w.recipes.get('cbadcopy')?.hiddenAt).toBeNull(); // a copy is never shared
    expect(w.recipes.get('cscunthorpe')?.hiddenAt).toBeNull();
    expect(w.logsOf('RECIPE_FILTER_HIDDEN').map((l) => [l.recipeId, l.reason])).toEqual([
      ['cbadname', 'blocked term in recipe name'],
      ['cbaddesc', 'blocked term in recipe description'],
    ]);
    sameTx(w.writes, 'hide.FILTER', 'log.RECIPE_FILTER_HIDDEN');
    // Second run (e.g. recipes off → on): nothing new.
    await expect(w.service.hideFilteredRecipes(OWNER)).resolves.toBe(0);
    expect(w.logsOf('RECIPE_FILTER_HIDDEN')).toHaveLength(2);
  });

  it('re-applies an earned forced-private restriction at turn-on (FD-14: rejoining resets nothing)', async () => {
    const w = makeWorld();
    for (const r of [R1, R2, R3, R4, R5]) await w.report(r);
    expect(w.logsOf('ACCOUNT_FORCED_PRIVATE')).toHaveLength(1);
    // Turn Following off (the profile goes) and on again (a fresh profile).
    w.profiles.delete(OWNER);
    w.addProfile(OWNER);
    w.suggestions.invalidateAll.mockClear();

    await w.service.hideFilteredRecipes(OWNER);
    expect(w.profiles.get(OWNER)).toMatchObject({ forcedPrivateAt: NOW, visibility: 'PRIVATE' });
    const reapplied = w.logsOf('ACCOUNT_FORCED_PRIVATE');
    expect(reapplied).toHaveLength(2);
    expect(reapplied[1]?.reason).toBe('5 distinct eligible reporters (re-applied at turn-on)');
    expect(w.suggestions.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('below the account threshold turn-on changes nothing', async () => {
    const w = makeWorld();
    await w.report(R1);
    await w.service.hideFilteredRecipes(OWNER);
    expect(w.profiles.get(OWNER)?.forcedPrivateAt).toBeNull();
    expect(w.logs).toEqual([]);
  });
});

// ─── checkRecipeText ───────────────────────────────────────────────────────────

describe('checkRecipeText (recipe create / update / importSave)', () => {
  it('rejects a blocked term when recipes are shared: one log row (no text), BAD_REQUEST + textRejected', async () => {
    const w = makeWorld();
    for (const text of [
      { name: `${BLOCKED} burger` },
      { name: 'Burger', description: `the ${BLOCKED.toUpperCase()} best` },
    ]) {
      const err = await rejection(w.service.checkRecipeText(OWNER, text));
      expect(err.code).toBe('BAD_REQUEST');
      expect(err.message).toBe(FRIENDS_COPY.recipe.textRejected);
      expect(err.cause).toBeInstanceOf(TextRejectedCause);
      expect((err.cause as TextRejectedCause).field).toBe('recipe');
    }
    expect(w.logsOf('RECIPE_TEXT_REJECTED').map((l) => [l.reason, l.recipeId])).toEqual([
      ['blocked term in recipe name', null],
      ['blocked term in recipe description', null],
    ]);
    expect(JSON.stringify(w.logs)).not.toContain(BLOCKED);
  });

  it('logs the recipe id on an edit', async () => {
    const w = makeWorld();
    await rejection(w.service.checkRecipeText(OWNER, { name: `${BLOCKED} burger` }, RECIPE));
    expect(w.logsOf('RECIPE_TEXT_REJECTED')[0]?.recipeId).toBe(RECIPE);
  });

  it('is not applied when recipes are not shared (no profile, or My recipes off) — INV-8', async () => {
    const w = makeWorld();
    w.addProfile(OWNER, { shareRecipes: false });
    await expect(
      w.service.checkRecipeText(OWNER, { name: `${BLOCKED} burger` }),
    ).resolves.toBeUndefined();
    await expect(
      w.service.checkRecipeText(STRANGER, { name: `${BLOCKED} burger` }),
    ).resolves.toBeUndefined();
    expect(w.logs).toEqual([]);
  });

  it('a clean create reads and writes nothing', async () => {
    const w = makeWorld();
    await w.service.checkRecipeText(OWNER, { name: 'Scunthorpe shiitake', description: null });
    expect(w.profileRepo.find).not.toHaveBeenCalled();
    expect(w.txs).toEqual([]);
    expect(w.writes).toEqual([]);
  });

  it('a clean edit lifts a FILTER hide, never a REPORTS hide', async () => {
    const w = makeWorld();
    w.addRecipe({ id: 'cfilter', hiddenAt: OLD, hiddenReason: 'FILTER' });
    w.addRecipe({ id: 'creports', hiddenAt: OLD, hiddenReason: 'REPORTS' });

    await w.service.checkRecipeText(OWNER, { name: 'Clean name' }, 'cfilter');
    expect(w.recipes.get('cfilter')).toMatchObject({ hiddenAt: null, hiddenReason: null });

    await w.service.checkRecipeText(OWNER, { name: 'Clean name' }, 'creports');
    expect(w.recipes.get('creports')).toMatchObject({ hiddenAt: OLD, hiddenReason: 'REPORTS' });
  });

  it('lifts a FILTER hide even with recipe sharing off (the text is clean now)', async () => {
    const w = makeWorld();
    w.addProfile(OWNER, { shareRecipes: false });
    w.addRecipe({ id: 'cfilter', hiddenAt: OLD, hiddenReason: 'FILTER' });
    await w.service.checkRecipeText(OWNER, { name: 'Clean name' }, 'cfilter');
    expect(w.recipes.get('cfilter')?.hiddenAt).toBeNull();
  });

  it('a dirty edit of a FILTER-hidden recipe with sharing off keeps it hidden', async () => {
    const w = makeWorld();
    w.addProfile(OWNER, { shareRecipes: false });
    w.addRecipe({ id: 'cfilter', hiddenAt: OLD, hiddenReason: 'FILTER' });
    await w.service.checkRecipeText(OWNER, { name: `${BLOCKED} pie` }, 'cfilter');
    expect(w.recipes.get('cfilter')?.hiddenReason).toBe('FILTER');
  });

  it('a cleaned FILTER-hidden recipe that already has 3 eligible reporters goes back under REPORTS', async () => {
    const w = makeWorld();
    w.addRecipe({ id: 'cfilter', hiddenAt: OLD, hiddenReason: 'FILTER' });
    for (const r of [R1, R2, R3]) await w.report(r, { recipeId: 'cfilter' });
    expect(w.logsOf('RECIPE_AUTO_HIDDEN')).toEqual([]); // already hidden: nothing to do then

    await w.service.checkRecipeText(OWNER, { name: 'Clean name' }, 'cfilter');
    expect(w.recipes.get('cfilter')?.hiddenReason).toBe('REPORTS');
    expect(w.logsOf('RECIPE_AUTO_HIDDEN')).toHaveLength(1);
    sameTx(w.writes, 'hide.REPORTS', 'log.RECIPE_AUTO_HIDDEN');
  });
});

// ─── undo ──────────────────────────────────────────────────────────────────────

describe('undo (ops only)', () => {
  it('RECIPE_AUTO_HIDDEN: un-hides, discounts the reports, writes one UNDO row (actor ops)', async () => {
    const w = makeWorld();
    for (const r of [R1, R2, R3]) await w.report(r, { recipeId: RECIPE });
    const hidden = w.firstLog('RECIPE_AUTO_HIDDEN');

    const result = await w.service.undo(hidden.id);
    expect(result).toMatchObject({ logId: hidden.id, action: 'RECIPE_AUTO_HIDDEN', dryRun: false });
    expect(result.undoLogId).toBe(w.logsOf('UNDO')[0]?.id);
    expect(w.recipes.get(RECIPE)?.hiddenAt).toBeNull();
    expect(w.reports.every((r) => r.discountedAt)).toBe(true);
    expect(w.logsOf('UNDO')).toEqual([
      expect.objectContaining({
        actor: 'ops',
        undoOfId: hidden.id,
        targetUserId: OWNER,
        recipeId: RECIPE,
      }),
    ]);
    sameTx(w.writes, 'unhide', 'log.UNDO');

    // Discounted reports never count again: a 4th reporter alone doesn't re-hide.
    await w.report(R4, { recipeId: RECIPE });
    expect(w.recipes.get(RECIPE)?.hiddenAt).toBeNull();
  });

  it('ACCOUNT_FORCED_PRIVATE: clears it (visibility stays PRIVATE), discounts, logs UNDO', async () => {
    const w = makeWorld();
    for (const r of [R1, R2, R3, R4, R5]) await w.report(r);
    const forced = w.firstLog('ACCOUNT_FORCED_PRIVATE');
    w.suggestions.invalidateAll.mockClear();

    await w.service.undo(forced.id);
    expect(w.profiles.get(OWNER)).toMatchObject({ forcedPrivateAt: null, visibility: 'PRIVATE' });
    expect(w.reports.every((r) => r.discountedAt)).toBe(true);
    expect(w.logsOf('UNDO')).toHaveLength(1);
    sameTx(w.writes, 'clearForcedPrivate', 'log.UNDO');
    expect(w.suggestions.invalidateAll).toHaveBeenCalledTimes(1);

    // Turning on again doesn't re-force: the reports were discounted.
    await w.service.hideFilteredRecipes(OWNER);
    expect(w.profiles.get(OWNER)?.forcedPrivateAt).toBeNull();
  });

  it('RECIPE_FILTER_HIDDEN: un-hides, discounts nothing', async () => {
    const w = makeWorld();
    w.addRecipe({ id: 'cbad', name: `${BLOCKED} pie` });
    await w.report(R1, { recipeId: 'cbad' });
    await w.service.hideFilteredRecipes(OWNER);
    const filtered = w.firstLog('RECIPE_FILTER_HIDDEN');

    const result = await w.service.undo(filtered.id);
    expect(result.detail).toBe('recipe un-hidden');
    expect(w.recipes.get('cbad')?.hiddenAt).toBeNull();
    expect(w.reports[0]?.discountedAt).toBeNull();
    expect(w.reportRepo.discountForRecipe).not.toHaveBeenCalled();
  });

  it('--dry-run writes nothing', async () => {
    const w = makeWorld();
    for (const r of [R1, R2, R3]) await w.report(r, { recipeId: RECIPE });
    const hidden = w.firstLog('RECIPE_AUTO_HIDDEN');
    const before = w.writes.length;

    const result = await w.service.undo(hidden.id, { dryRun: true });
    expect(result).toMatchObject({ dryRun: true, undoLogId: null });
    expect(result.detail).toMatch(/^would un-hide recipe/);
    expect(w.writes.length).toBe(before);
    expect(w.recipes.get(RECIPE)?.hiddenReason).toBe('REPORTS');
  });

  it('refuses unknown rows, non-undoable actions and a second undo', async () => {
    const w = makeWorld();
    expect((await rejection(w.service.undo('cnope'))).code).toBe('NOT_FOUND');

    await rejection(w.service.checkRecipeText(OWNER, { name: `${BLOCKED} pie` }));
    const rejected = w.firstLog('RECIPE_TEXT_REJECTED');
    expect((await rejection(w.service.undo(rejected.id))).code).toBe('BAD_REQUEST');

    for (const r of [R1, R2, R3]) await w.report(r, { recipeId: RECIPE });
    const hidden = w.firstLog('RECIPE_AUTO_HIDDEN');
    await w.service.undo(hidden.id);
    expect((await rejection(w.service.undo(hidden.id))).code).toBe('CONFLICT');
    const undoRow = w.firstLog('UNDO');
    expect((await rejection(w.service.undo(undoRow.id))).code).toBe('BAD_REQUEST');
    expect(w.logsOf('UNDO')).toHaveLength(1);
  });
});

// ─── weeklyMetrics ─────────────────────────────────────────────────────────────

describe('weeklyMetrics (the moderation.weekly line)', () => {
  it('maps report counts and per-action counts since the given date', async () => {
    const w = makeWorld();
    const since = new Date('2026-09-24T00:00:00.000Z');
    await expect(w.service.weeklyMetrics(since)).resolves.toEqual({
      reports: 9,
      eligibleReports: 4,
      recipeAutoHidden: 1,
      accountForcedPrivate: 2,
      recipeFilterHidden: 3,
      nameRejected: 4,
      recipeTextRejected: 5,
      undo: 6,
    });
    expect(w.reportRepo.countSince).toHaveBeenCalledWith(since);
    expect(w.moderationRepo.weeklyCounts).toHaveBeenCalledWith(since);
  });
});

// ─── runSerializableTx (the concurrency guard) ─────────────────────────────────

describe('runSerializableTx', () => {
  const conflict = (code: string) => Object.assign(new Error(code), { code });
  // eslint-disable-next-line @typescript-eslint/unbound-method -- a vi.fn mock, no `this`
  const $transaction = () => vi.mocked(prisma.$transaction);

  it('runs SERIALIZABLE and retries a serialization conflict (P2034) on top of the winner', async () => {
    let calls = 0;
    $transaction().mockImplementation(((fn: (tx: unknown) => unknown, opts: unknown) => {
      expect(opts).toEqual({ isolationLevel: 'Serializable' });
      calls++;
      if (calls < 3) return Promise.reject(conflict('P2034'));
      return Promise.resolve(fn({}));
    }) as never);
    await expect(runSerializableTx(() => Promise.resolve('done'))).resolves.toBe('done');
    expect(calls).toBe(3);
  });

  it('retries the Block upsert race (P2002), not other errors, and gives up after 5 attempts', async () => {
    $transaction().mockRejectedValueOnce(conflict('P2002')).mockResolvedValueOnce('ok');
    await expect(runSerializableTx(() => Promise.resolve('x'))).resolves.toBe('ok');

    $transaction().mockReset().mockRejectedValue(conflict('P2003'));
    await expect(runSerializableTx(() => Promise.resolve('x'))).rejects.toMatchObject({
      code: 'P2003',
    });
    expect($transaction()).toHaveBeenCalledTimes(1);

    $transaction().mockReset().mockRejectedValue(conflict('P2034'));
    await expect(runSerializableTx(() => Promise.resolve('x'))).rejects.toMatchObject({
      code: 'P2034',
    });
    expect($transaction()).toHaveBeenCalledTimes(5);
  });
});
