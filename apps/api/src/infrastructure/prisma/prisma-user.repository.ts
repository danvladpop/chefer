import type { Prisma, User } from '@prisma/client';

import { prisma } from '@chefer/database';
import type { UserRole } from '@chefer/types';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface FindManyWithCountOptions {
  where?: Prisma.UserWhereInput;
  orderBy?: Prisma.UserOrderByWithRelationInput;
  skip?: number;
  take?: number;
  include?: Prisma.UserInclude;
}

export interface CreateUserInput {
  email: string;
  name?: string;
  passwordHash?: string;
  role?: UserRole;
  image?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  passwordHash?: string;
  role?: UserRole;
  image?: string;
  emailVerified?: Date;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserInput): Promise<User>;
  update(id: string, data: UpdateUserInput): Promise<User>;
  delete(id: string): Promise<User>;
  findManyWithCount(options?: FindManyWithCountOptions): Promise<{ users: User[]; total: number }>;
  count(where?: Prisma.UserWhereInput): Promise<number>;
}

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Prisma-backed implementation of IUserRepository.
 * Translates between the domain model and the persistence layer.
 */
export class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async create(data: CreateUserInput): Promise<User> {
    return prisma.user.create({
      data: {
        ...data,
        email: data.email.toLowerCase().trim(),
        role: (data.role as Prisma.EnumUserRoleFilter['equals']) ?? 'USER',
      },
    });
  }

  async update(id: string, data: UpdateUserInput): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        ...data,
        email: data.email ? data.email.toLowerCase().trim() : undefined,
        updatedAt: new Date(),
      },
    });
  }

  async delete(id: string): Promise<User> {
    return prisma.user.delete({ where: { id } });
  }

  async findManyWithCount(
    options: FindManyWithCountOptions = {},
  ): Promise<{ users: User[]; total: number }> {
    const { where, orderBy = { createdAt: 'desc' }, skip = 0, take = 20, include } = options;

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({ where, orderBy, skip, take, include }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async count(where?: Prisma.UserWhereInput): Promise<number> {
    return prisma.user.count({ where });
  }
}
