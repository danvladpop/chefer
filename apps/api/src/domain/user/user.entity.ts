import type { UserRole } from '@chefer/types';

// ─── User Entity ──────────────────────────────────────────────────────────────

export interface UserEntityProps {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  passwordHash: string | null;
  emailVerified: Date | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User domain entity.
 * Encapsulates business logic related to user management.
 */
export class UserEntity {
  private readonly props: UserEntityProps;

  constructor(props: UserEntityProps) {
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get name(): string | null {
    return this.props.name;
  }

  get role(): UserRole {
    return this.props.role;
  }

  get passwordHash(): string | null {
    return this.props.passwordHash;
  }

  get emailVerified(): Date | null {
    return this.props.emailVerified;
  }

  get image(): string | null {
    return this.props.image;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /**
   * Returns true if the user has verified their email.
   */
  get isEmailVerified(): boolean {
    return this.props.emailVerified !== null;
  }

  /**
   * Returns true if the user is an admin.
   */
  get isAdmin(): boolean {
    return this.props.role === 'ADMIN';
  }

  /**
   * Returns true if the user is a moderator or admin.
   */
  get isModerator(): boolean {
    return this.props.role === 'MODERATOR' || this.props.role === 'ADMIN';
  }

  /**
   * Returns the display name (name if set, otherwise email prefix).
   */
  get displayName(): string {
    return this.props.name ?? this.props.email.split('@')[0] ?? this.props.email;
  }

  /**
   * Creates a plain object representation suitable for API responses.
   * Strips sensitive fields like passwordHash.
   */
  toPublicProfile(): {
    id: string;
    email: string;
    name: string | null;
    role: UserRole;
    image: string | null;
    createdAt: Date;
  } {
    return {
      id: this.props.id,
      email: this.props.email,
      name: this.props.name,
      role: this.props.role,
      image: this.props.image,
      createdAt: this.props.createdAt,
    };
  }

  /**
   * Factory method to create a UserEntity from a database record.
   */
  static fromPersistence(data: UserEntityProps): UserEntity {
    return new UserEntity(data);
  }
}
