import { TRPCError } from '@trpc/server';

import type { UserRole } from '@chefer/types';

import type { IUserRepository } from '../../infrastructure/prisma/prisma-user.repository.js';
import {
  domainErrorToTRPCCode,
  UserEmailConflictError,
  UserNotFoundError,
} from '../../domain/user/user.errors.js';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateUserInput {
  email: string;
  name?: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
  image?: string;
}

export interface ListUsersInput {
  page: number;
  limit: number;
  search?: string;
  role?: UserRole;
  sortBy?: 'createdAt' | 'name' | 'email';
  sortOrder?: 'asc' | 'desc';
}

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  image: string | null;
  emailVerified: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedUsersDto {
  users: UserDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class UserService {
  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * Finds a user by ID. Returns null if not found (doesn't throw).
   */
  async findById(id: string): Promise<UserDto | null> {
    try {
      const user = await this.userRepository.findById(id);
      return user ? this.toDto(user) : null;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Finds a user by email. Returns null if not found.
   */
  async findByEmail(email: string): Promise<UserDto | null> {
    try {
      const user = await this.userRepository.findByEmail(email);
      return user ? this.toDto(user) : null;
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Lists users with pagination and optional filtering.
   */
  async list(input: ListUsersInput): Promise<PaginatedUsersDto> {
    const { page, limit, search, role, sortBy = 'createdAt', sortOrder = 'desc' } = input;

    const skip = (page - 1) * limit;

    const where = {
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(role ? { role } : {}),
    };

    try {
      const { users, total } = await this.userRepository.findManyWithCount({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
      });

      return {
        users: users.map((u) => this.toDto(u)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Creates a new user.
   */
  async create(input: CreateUserInput): Promise<UserDto> {
    const { email, name, role } = input;

    // Check for email conflict
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `User with email "${email}" already exists`,
      });
    }

    try {
      const user = await this.userRepository.create({ email, name, role });
      return this.toDto(user);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Updates a user by ID.
   */
  async update(id: string, input: UpdateUserInput): Promise<UserDto> {
    // Check that user exists
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `User not found: ${id}` });
    }

    // Check email uniqueness if changing email
    if (input.email && input.email !== existing.email) {
      const emailConflict = await this.userRepository.findByEmail(input.email);
      if (emailConflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Email "${input.email}" is already in use`,
        });
      }
    }

    try {
      const updated = await this.userRepository.update(id, input);
      return this.toDto(updated);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Deletes a user by ID.
   */
  async delete(id: string): Promise<void> {
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `User not found: ${id}` });
    }

    try {
      await this.userRepository.delete(id);
    } catch (error) {
      this.handleError(error);
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private toDto(user: {
    id: string;
    email: string;
    name: string | null;
    role: UserRole;
    image: string | null;
    emailVerified: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      image: user.image,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private handleError(error: unknown): never {
    if (error instanceof TRPCError) {
      throw error;
    }

    if (error instanceof UserNotFoundError || error instanceof UserEmailConflictError) {
      throw new TRPCError({
        code: domainErrorToTRPCCode(error),
        message: error.message,
      });
    }

    console.error('Unexpected error in UserService:', error);
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    });
  }
}
