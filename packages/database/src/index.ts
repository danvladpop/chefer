export { prisma, type PrismaClient } from './client';
export {
  UserRepository,
  userRepository,
  type IUserRepository,
  type FindManyOptions,
  type CreateUserData,
  type UpdateUserData,
  ChefProfileRepository,
  chefProfileRepository,
  type IChefProfileRepository,
  type UpsertChefProfileData,
  type ActivityLevel,
  type BiologicalSex,
  type Goal,
  DietaryPreferencesRepository,
  dietaryPreferencesRepository,
  type IDietaryPreferencesRepository,
  type UpsertDietaryPreferencesData,
} from './repositories/index';

// Re-export Prisma types for convenience
export type {
  User,
  Account,
  Session,
  Post,
  Tag,
  PostTag,
  UserProfile,
  ChefProfile,
  DietaryPreferences,
} from '@prisma/client';
export { UserRole, PostStatus, Prisma, BiologicalSex } from '@prisma/client';
