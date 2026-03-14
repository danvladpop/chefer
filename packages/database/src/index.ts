export { prisma, type PrismaClient } from './client';
export {
  UserRepository,
  userRepository,
  type IUserRepository,
  type FindManyOptions,
  type CreateUserData,
  type UpdateUserData,
} from './repositories/index';

// Re-export Prisma types for convenience
export type { User, Account, Session, Post, Tag, PostTag, UserProfile } from '@prisma/client';
export { UserRole, PostStatus, Prisma } from '@prisma/client';
