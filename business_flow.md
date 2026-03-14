# Chefer — Business Flows

> **Keep this document up to date.** Any time a new flow is added, an existing flow changes, or a new tRPC procedure is introduced, update the relevant section here.

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [User Registration Flow](#2-user-registration-flow)
3. [User Login Flow](#3-user-login-flow)
4. [Session & Authorization Flow](#4-session--authorization-flow)
5. [View User Profile Flow](#5-view-user-profile-flow)
6. [User Management (Admin) Flow](#6-user-management-admin-flow)
7. [Post Lifecycle Flow](#7-post-lifecycle-flow)
8. [API Request Lifecycle](#8-api-request-lifecycle)

---

## 1. Application Overview

Chefer is a full-stack web application with a clear separation between a **Next.js frontend** (port 3000) and an **Express + tRPC API** (port 3001). All data flows between the frontend and backend go through tRPC over HTTP.

```
Browser
  │
  ├─ Server Components (SSR) ──► tRPC Server Client ──► API (3001) ──► PostgreSQL
  │
  └─ Client Components (CSR) ──► tRPC React Client ──► API (3001) ──► PostgreSQL
```

---

## 2. User Registration Flow

> **Status:** Schema and types are in place. The registration endpoint and UI are not yet implemented.

**Planned flow:**

```
1. User fills in RegisterForm (email, password, name)
2. Client validates input with Zod (react-hook-form)
3. POST /trpc/user.create (admin) OR a future public register endpoint
4. UserService.create()
    └── Hash password (bcrypt/argon2)
    └── UserRepository.create()
    └── Prisma INSERT into users table
5. Return new User object (without passwordHash)
6. Redirect to /login
```

**Current state:** Admin can create users via `user.create` (admin-only tRPC mutation). A self-service registration route does not yet exist.

---

## 3. User Login Flow

> **Status:** Login form UI exists. The backend auth endpoint is not yet implemented.

**Planned flow:**

```
1. User fills in LoginForm at /(auth)/login
   └── Email + password (react-hook-form + Zod validation)
2. Form submits to POST /api/auth/login (Next.js API route, not yet built)
3. API route calls tRPC or directly validates credentials:
    └── UserRepository.findByEmail(email)
    └── Compare hash (bcrypt.compare)
    └── If match → generate JWT access token + refresh token
4. Set session cookie (chefer_session) or return JWT in response
5. Redirect to /(dashboard)/dashboard
```

**Current state:**

- `LoginForm` component at `apps/web/src/features/auth/components/LoginForm.tsx` submits to `/api/auth/login`
- The route handler and token generation are not yet implemented
- The database schema is NextAuth.js compatible (Account, Session, VerificationToken tables exist)

---

## 4. Session & Authorization Flow

> **Status:** Context scaffolding exists. Full JWT issuance is not yet implemented.

**How the API resolves the current user on every request:**

```
Incoming HTTP request
  │
  ├─ requestIdMiddleware → attaches X-Request-ID
  │
  └─ tRPC adapter → createContext()
        │
        ├─ Read cookie: chefer_session
        ├─ OR read header: Authorization: Bearer <token>
        │
        ├─ Validate token / look up session
        │
        └─ Set ctx.user (null if unauthenticated)
              │
              └─ Procedure middleware checks ctx.user:
                    publicProcedure    → always allowed
                    protectedProcedure → requires ctx.user != null
                    adminProcedure     → requires ctx.user.role === 'ADMIN'
```

**Role capabilities:**

| Role              | What they can do                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------- |
| (unauthenticated) | `user.getById`                                                                            |
| USER              | All public + `user.me`, `user.update` (own), `user.updateProfile`                         |
| MODERATOR         | Same as USER (moderation capabilities reserved for future)                                |
| ADMIN             | Everything, including `user.list`, `user.create`, `user.delete`, `user.update` (any user) |

---

## 5. View User Profile Flow

> **Status:** Implemented at `/user`.

```
1. Browser requests GET /user
2. Next.js Server Component renders on the server:
    a. prisma.user.findFirst({ select: { id } })
       └── Returns the first user in the DB (any user)
    b. serverClient.user.getById.query({ id })
       └── HTTP GET to http://localhost:3001/trpc/user.getById?input={"id":"..."}
       └── API: UserService.findById(id)
       └── API: UserRepository.findById(id) → Prisma SELECT
       └── Returns User object
3. Server Component renders user card with firstName, lastName, email, id
4. HTML is sent to the browser (no client-side JS needed for this page)
```

**Data path:**

```
/user page
  └── prisma.user.findFirst()       ← direct DB (ID only)
  └── tRPC serverClient.user.getById ← via API server
        └── UserService.findById
              └── PrismaUserRepository.findById
                    └── Prisma Client → PostgreSQL
```

---

## 6. User Management (Admin) Flow

> **Status:** tRPC procedures implemented. Admin UI not yet built.

### List Users

```
adminProcedure user.list
  Input: { page, limit, search?, role?, sortBy, sortOrder }
  │
  └── UserService.list()
        └── PrismaUserRepository.findManyWithCount()
              └── prisma.$transaction([findMany, count])
  Output: { users: User[], total: number, page, limit, totalPages }
```

### Create User

```
adminProcedure user.create
  Input: { email, name?, password, role? }
  │
  └── UserService.create()
        └── Check email not already in use
        └── Hash password
        └── PrismaUserRepository.create()
  Output: User
```

### Update User

```
protectedProcedure user.update
  Input: { id, name?, email?, role?, image? }
  │
  ├── If caller is not ADMIN:
  │     └── Reject if id != ctx.user.id (FORBIDDEN)
  │     └── Reject if role is being changed (FORBIDDEN)
  └── UserService.update(id, data)
        └── PrismaUserRepository.update()
  Output: User
```

### Delete User

```
adminProcedure user.delete
  Input: { id }
  │
  └── Reject if id == ctx.user.id (cannot delete self)
  └── UserService.delete(id)
        └── PrismaUserRepository.delete()
  Output: { success: true }
```

---

## 7. Post Lifecycle Flow

> **Status:** Post schema exists. Post tRPC router is not yet implemented.

**Planned states:**

```
DRAFT ──► PUBLISHED ──► ARCHIVED
  │                        │
  └────────────────────────┘ (can archive from any state)
```

**Planned create flow:**

```
1. Author fills in PostEditor (title, content, tags)
2. POST trpc/post.create (protectedProcedure)
3. PostService.create()
    └── slugify(title) → unique slug
    └── prisma.post.create() with status: DRAFT
4. Redirect to post edit page
```

**Planned publish flow:**

```
1. Author clicks Publish on a DRAFT post
2. PATCH trpc/post.publish (protectedProcedure)
3. PostService.publish(id)
    └── Check caller is the author (or ADMIN)
    └── prisma.post.update({ status: PUBLISHED, published: true, publishedAt: now() })
```

---

## 8. API Request Lifecycle

Every call from the frontend to the API follows this path:

```
Frontend (Server or Client Component)
  │
  │  HTTP POST /trpc/<procedure>  (batched by tRPC)
  ▼
Express Server (apps/api, port 3001)
  │
  ├─ CORS check
  ├─ JSON body parse
  ├─ requestIdMiddleware (X-Request-ID)
  │
  └─ tRPC adapter
        │
        ├─ createContext()
        │     └─ Resolve ctx.user from cookie/header
        │
        ├─ timingMiddleware (logs duration in dev)
        │
        ├─ [if protectedProcedure] isAuthenticated middleware
        ├─ [if adminProcedure]     isAdmin middleware
        │
        ├─ Zod input validation
        │
        └─ Router handler
              └─ Service method
                    └─ Repository method
                          └─ Prisma → PostgreSQL
                                └─ Response serialised with superjson
                                      └─ Returned to frontend
```

### Error Handling

| Source                       | How it surfaces                                  |
| ---------------------------- | ------------------------------------------------ |
| Zod validation failure       | tRPC `BAD_REQUEST` with field-level errors       |
| `UserNotFoundError` (domain) | Mapped to tRPC `NOT_FOUND`                       |
| Unauthenticated access       | tRPC `UNAUTHORIZED`                              |
| Insufficient role            | tRPC `FORBIDDEN`                                 |
| Unhandled exception          | tRPC `INTERNAL_SERVER_ERROR` (logged to console) |
