import { UserRole, type Prisma, type User } from '@prisma/client';
import { prisma } from '../client.js';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findMany(options?: FindManyOptions): Promise<User[]>;
  create(data: CreateUserData): Promise<User>;
  update(id: string, data: UpdateUserData): Promise<User>;
  delete(id: string): Promise<User>;
  count(where?: Prisma.UserWhereInput): Promise<number>;
  exists(where: Prisma.UserWhereInput): Promise<boolean>;
}

export interface FindManyOptions {
  where?: Prisma.UserWhereInput;
  orderBy?: Prisma.UserOrderByWithRelationInput;
  skip?: number;
  take?: number;
  include?: Prisma.UserInclude;
}

export interface CreateUserData {
  email: string;
  name?: string;
  passwordHash?: string;
  role?: UserRole;
  image?: string;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  passwordHash?: string;
  role?: UserRole;
  image?: string;
  emailVerified?: Date;
}

export class UserRepository implements IUserRepository {
  /**
   * Finds a user by their unique ID.
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Finds a user by their email address.
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  /**
   * Returns a paginated list of users with optional filtering.
   */
  async findMany(options: FindManyOptions = {}): Promise<User[]> {
    const { where, orderBy = { createdAt: 'desc' }, skip = 0, take = 20, include } = options;

    return prisma.user.findMany({
      where,
      orderBy,
      skip,
      take,
      include,
    });
  }

  /**
   * Creates a new user.
   */
  async create(data: CreateUserData): Promise<User> {
    return prisma.user.create({
      data: {
        ...data,
        email: data.email.toLowerCase().trim(),
        role: data.role ?? UserRole.USER,
      },
    });
  }

  /**
   * Updates an existing user by ID.
   */
  async update(id: string, data: UpdateUserData): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: {
        ...data,
        email: data.email ? data.email.toLowerCase().trim() : undefined,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Soft deletes or permanently deletes a user by ID.
   */
  async delete(id: string): Promise<User> {
    return prisma.user.delete({
      where: { id },
    });
  }

  /**
   * Counts users matching the given criteria.
   */
  async count(where?: Prisma.UserWhereInput): Promise<number> {
    return prisma.user.count({ where });
  }

  /**
   * Checks if a user exists matching the given criteria.
   */
  async exists(where: Prisma.UserWhereInput): Promise<boolean> {
    const count = await prisma.user.count({ where });
    return count > 0;
  }

  /**
   * Finds a user with their full profile data.
   */
  async findByIdWithProfile(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        accounts: true,
      },
    });
  }

  /**
   * Paginated user list with total count.
   */
  async findManyWithCount(
    options: FindManyOptions = {},
  ): Promise<{ users: User[]; total: number }> {
    const { where } = options;

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany(options),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }
}

export const userRepository = new UserRepository();
