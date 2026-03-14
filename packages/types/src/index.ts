// ─── Enums ───────────────────────────────────────────────────────────────────

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  MODERATOR = 'MODERATOR',
}

export enum PostStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

// ─── Base Types ───────────────────────────────────────────────────────────────

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── User Types ───────────────────────────────────────────────────────────────

export interface User extends BaseEntity {
  email: string;
  name: string | null;
  role: UserRole;
  emailVerified: Date | null;
  image: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  image: string | null;
}

export interface CreateUserInput {
  email: string;
  name?: string;
  role?: UserRole;
  password?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
  image?: string;
}

// ─── Post Types ───────────────────────────────────────────────────────────────

export interface Post extends BaseEntity {
  title: string;
  content: string | null;
  published: boolean;
  status: PostStatus;
  authorId: string;
  slug: string;
}

export interface CreatePostInput {
  title: string;
  content?: string;
  published?: boolean;
  authorId: string;
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
  published?: boolean;
  status?: PostStatus;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  success: true;
  message?: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ─── Pagination Types ─────────────────────────────────────────────────────────

export interface PaginationInput {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface CursorPaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Auth Types ───────────────────────────────────────────────────────────────

export interface AuthSession {
  user: UserProfile;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// ─── Filter & Sort Types ──────────────────────────────────────────────────────

export type SortOrder = 'asc' | 'desc';

export interface SortInput {
  field: string;
  order: SortOrder;
}

export interface FilterInput {
  search?: string;
  sort?: SortInput;
  pagination?: PaginationInput;
}

// ─── Environment Types ────────────────────────────────────────────────────────

export type NodeEnv = 'development' | 'test' | 'production';

// ─── Utility Types ────────────────────────────────────────────────────────────

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OmitTimestamps<T extends BaseEntity> = Omit<T, 'createdAt' | 'updatedAt'>;

export type ValueOf<T> = T[keyof T];

export type NonEmptyArray<T> = [T, ...T[]];

export type RecordStringUnknown = Record<string, unknown>;

// ─── Error Types ──────────────────────────────────────────────────────────────

export interface AppError {
  code: string;
  message: string;
  statusCode: number;
  details?: RecordStringUnknown;
}

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_SERVER_ERROR'
  | 'BAD_REQUEST'
  | 'RATE_LIMIT_EXCEEDED'
  | 'SERVICE_UNAVAILABLE';
