import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { UserRole } from '@chefer/types';

import { adminProcedure, protectedProcedure, publicProcedure, router } from '../lib/trpc.js';
import { UserService } from '../application/user/user.service.js';
import { PrismaUserRepository } from '../infrastructure/prisma/prisma-user.repository.js';

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
  role: z.nativeEnum(UserRole).optional(),
  image: z.string().url().optional(),
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
   * Get a user by ID.
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ input }) => {
      const user = await userService.findById(input.id);
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }
      return user;
    }),

  /**
   * List users with pagination and filtering. Admin only.
   */
  list: adminProcedure
    .input(listUsersSchema)
    .query(async ({ input }) => {
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
    });
  }),

  /**
   * Update a user. Admins can update any user; regular users can only update themselves.
   */
  update: protectedProcedure.input(updateUserSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;

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
