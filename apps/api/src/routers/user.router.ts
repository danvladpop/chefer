import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { UserRole } from '@chefer/types';
import { authService } from '../application/auth/auth.service.js';
import { deleteAccount, exportAccountData } from '../application/user/account-data.service.js';
import { UserService } from '../application/user/user.service.js';
import { PrismaUserRepository } from '../infrastructure/prisma/prisma-user.repository.js';
import { adminProcedure, protectedProcedure, router } from '../lib/trpc.js';

const userService = new UserService(new PrismaUserRepository());

// ─── Input Schemas ────────────────────────────────────────────────────────────

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.nativeEnum(UserRole).optional(),
});

const updateUserSchema = z.object({
  id: z.string().cuid(),
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  /** Required to change your own email (audit F-X-4-6). */
  currentPassword: z.string().min(1).max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
  // https only: `javascript:` and plain-http tracking URLs were accepted
  // (audit F-PROF-1-3).
  image: z
    .string()
    .url()
    .max(2048)
    .refine((u) => u.startsWith('https://'), 'Image must be an https URL')
    .optional(),
});

const listUsersSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  sortBy: z.enum(['createdAt', 'name', 'email']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const userRouter = router({
  /**
   * Get the currently authenticated user's profile.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await userService.findById(ctx.user.id);
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    return user;
  }),

  /**
   * Get a user by ID. Admin only — the DTO carries email, name, role and
   * tier, so letting any signed-in user call it leaked every account's
   * details (audit F-ADM-1-1 / F-X-4-2). Users read themselves via `me`.
   */
  getById: adminProcedure.input(z.object({ id: z.string().cuid() })).query(async ({ input }) => {
    const user = await userService.findById(input.id);
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    return user;
  }),

  /**
   * List users with pagination and filtering. Admin only.
   */
  list: adminProcedure.input(listUsersSchema).query(async ({ input }) => {
    return userService.list({
      page: input.page,
      limit: input.limit,
      search: input.search,
      role: input.role,
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
    });
  }),

  /**
   * Create a new user. Admin only.
   */
  create: adminProcedure.input(createUserSchema).mutation(async ({ input }) => {
    return userService.create({
      email: input.email,
      name: input.name,
      role: input.role,
      password: input.password,
    });
  }),

  /**
   * Update a user. Admins can update any user; regular users can only update themselves.
   */
  update: protectedProcedure.input(updateUserSchema).mutation(async ({ ctx, input }) => {
    const { id, currentPassword, ...data } = input;

    // Non-admins can only update themselves and cannot change role
    if (ctx.user.role !== 'ADMIN') {
      if (id !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only update your own profile',
        });
      }
      if (data.role) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot change your own role',
        });
      }
    }

    // Admins can't change their own role, and the last admin can't be
    // demoted — either would lock everyone out of admin (audit F-ADM-1-3).
    if (data.role && data.role !== 'ADMIN') {
      if (id === ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You cannot change your own role' });
      }
      const target = await userService.findById(id);
      if (target?.role === 'ADMIN' && (await userService.countAdmins()) <= 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot demote the last admin' });
      }
    }

    // Changing the sign-in email takes the current password, so a stolen
    // session can't become a permanent takeover via email change + reset
    // (audit F-PROF-1-3, F-X-4-6). Admins editing other users are exempt.
    if (data.email !== undefined && id === ctx.user.id) {
      if (!currentPassword || !(await userService.verifyPassword(id, currentPassword))) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Enter your current password to change your email',
        });
      }
    }

    return userService.update(id, data);
  }),

  /**
   * Delete a user. Admin only.
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot delete your own account',
        });
      }
      await userService.delete(input.id);
      return { success: true };
    }),

  /**
   * Everything Chefer stores about the caller, as JSON ("Download my data").
   * Additive; audit P0-6 (F-PROF-1-1).
   */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    return exportAccountData(ctx.user.id);
  }),

  /**
   * Deletes the caller's account and all their data, after re-entering the
   * password and typing DELETE. Required in-app by both app stores (audit
   * F-M-PROF-1-1). The last admin can't delete themselves.
   */
  deleteSelf: protectedProcedure
    .input(z.object({ password: z.string().min(1).max(100), confirm: z.literal('DELETE') }))
    .mutation(async ({ ctx, input }) => {
      if (!(await userService.verifyPassword(ctx.user.id, input.password))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'That password is not correct' });
      }
      if (ctx.user.role === 'ADMIN' && (await userService.countAdmins()) <= 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You are the last admin — promote someone else before deleting your account',
        });
      }
      await deleteAccount(ctx.user.id);
      await authService.logout(ctx.sessionToken, ctx.res);
      return { success: true as const };
    }),

  /**
   * Upgrades the current user to the PREMIUM plan.
   * Demo flow — no payment integration; the click itself flips the tier.
   */
  upgradePlan: protectedProcedure.mutation(async ({ ctx }) => {
    return userService.update(ctx.user.id, { planTier: 'PREMIUM' });
  }),

  /**
   * Self-service downgrade back to FREE (PW-2). Needed to test both sides of
   * every gate, and honest during a free beta.
   */
  downgradePlan: protectedProcedure.mutation(async ({ ctx }) => {
    return userService.update(ctx.user.id, { planTier: 'FREE' });
  }),

  /**
   * Admin tier management (PW-2) — "a DB flag that can be changed" without
   * SSH-ing into prod psql. Backs the /admin/users page.
   */
  setPlanTier: adminProcedure
    .input(z.object({ userId: z.string().cuid(), planTier: z.enum(['FREE', 'PREMIUM']) }))
    .mutation(async ({ input }) => {
      return userService.update(input.userId, { planTier: input.planTier });
    }),

  /**
   * Today's AI call counts for a set of users (PW-2 admin page). Same direct
   * aiCallLog read the profile router uses.
   */
  aiCallsToday: adminProcedure
    .input(z.object({ userIds: z.array(z.string().cuid()).min(1).max(100) }))
    .query(async ({ input }) => {
      const { prisma } = await import('@chefer/database');
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const rows = await prisma.aiCallLog.groupBy({
        by: ['userId'],
        where: { userId: { in: input.userIds }, createdAt: { gte: todayStart } },
        _count: { _all: true },
      });
      return Object.fromEntries(rows.map((r) => [r.userId, r._count._all]));
    }),

  /**
   * Update the current user's own profile.
   */
  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100).optional(),
        image: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return userService.update(ctx.user.id, input);
    }),
});
