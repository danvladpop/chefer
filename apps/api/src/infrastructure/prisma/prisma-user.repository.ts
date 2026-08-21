import { prisma, type Prisma, type User } from '@chefer/database';
import type { PlanTier, UserRole } from '@chefer/types';
import { removeNullish } from '@chefer/utils';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface FindManyWithCountOptions {
  where?: Prisma.UserWhereInput;
  orderBy?: Prisma.UserOrderByWithRelationInput;
  skip?: number;
  take?: number;
  include?: Prisma.UserInclude;
}

// Optionals accept explicit undefined so caller objects built from zod-parsed
// input assign under exactOptionalPropertyTypes; update() strips undefineds
// before they reach Prisma.
export interface CreateUserInput {
  email: string;
  name?: string | undefined;
  passwordHash?: string | undefined;
  role?: UserRole | undefined;
  image?: string | undefined;
}

export interface UpdateUserInput {
  name?: string | undefined;
  email?: string | undefined;
  passwordHash?: string | undefined;
  role?: UserRole | undefined;
  planTier?: PlanTier | undefined;
  image?: string | undefined;
  emailVerified?: Date | undefined;
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
        ...removeNullish(data),
        email: data.email.toLowerCase().trim(),
        role: data.role ?? 'USER',
      },
    });
  }

  async update(id: string, data: UpdateUserInput): Promise<User> {
    const { email, ...rest } = data;
    return prisma.user.update({
      where: { id },
      data: {
        ...removeNullish(rest),
        ...(email !== undefined && { email: email.toLowerCase().trim() }),
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
      prisma.user.findMany({
        ...(where !== undefined && { where }),
        orderBy,
        skip,
        take,
        ...(include !== undefined && { include }),
      }),
      prisma.user.count({ where: where ?? {} }),
    ]);

    return { users, total };
  }

  async count(where?: Prisma.UserWhereInput): Promise<number> {
    return prisma.user.count({ where: where ?? {} });
  }
}
