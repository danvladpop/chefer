# CLAUDE.md — Chefer Project Guide

This file is read by Claude Code at the start of every conversation. It contains project conventions, architectural rules, and instructions for maintaining documentation.

---

## Documentation Maintenance Rules

### CRITICAL: Update docs on every architectural change

Whenever you make a change that affects the architecture of this project, you **must** update the relevant documentation files in the same response:

| Change type                      | Files to update                               |
| -------------------------------- | --------------------------------------------- |
| New package or app added         | `infrastructure.md` §1, §5                    |
| New page or route added          | `infrastructure.md` §4, `business_flow.md`    |
| New tRPC procedure               | `infrastructure.md` §8, `business_flow.md`    |
| New environment variable         | `infrastructure.md` §10                       |
| Schema change (Prisma)           | `infrastructure.md` §6                        |
| New service or repository        | `infrastructure.md` §7                        |
| New middleware                   | `infrastructure.md` §7, §9                    |
| New Docker service               | `infrastructure.md` §12                       |
| CI/CD pipeline change            | `infrastructure.md` §13                       |
| New business flow or flow change | `business_flow.md`                            |
| Auth/authorization change        | `infrastructure.md` §9, `business_flow.md` §4 |

Do not defer documentation updates. If you add a procedure today, the docs reflect it today.

---

## Project Overview

**Chefer** is a TypeScript monorepo with:

- `apps/api` — Express + tRPC backend (port 3001)
- `apps/web` — Next.js 15 App Router frontend (port 3000)
- `packages/database` — Prisma + repositories
- `packages/types` — shared types and enums
- `packages/utils` — pure utility functions
- `packages/ui` — React component library
- `packages/config/tsconfig` — shared TypeScript configs
- `packages/config/eslint` — shared ESLint flat configs

For full details see [`infrastructure.md`](./infrastructure.md).
For business flows see [`business_flow.md`](./business_flow.md).

---

## Technology Stack (key choices)

- **pnpm** workspaces + **Turborepo** — do not switch to npm or yarn
- **tRPC v11** — all API communication goes through tRPC, not REST
- **Prisma 5** + **PostgreSQL 16** — no raw SQL except in migrations
- **Zod** — all input validation (tRPC inputs, env vars, forms)
- **superjson** — transformer for tRPC (handles Date, BigInt, etc.)
- **TailwindCSS 3** — styling only through Tailwind utility classes
- **ESLint 9 flat config** — do not revert to `.eslintrc` format

---

## Code Conventions

### TypeScript

- Strict mode is enabled everywhere — no `any`, no `@ts-ignore` without a comment explaining why
- Use `z.infer<typeof schema>` for types derived from Zod schemas
- Prefer `type` over `interface` for plain data shapes; use `interface` when extension is needed

### Imports

- Internal packages: use workspace names (`@chefer/database`, not relative paths across package boundaries)
- Within a package: use extensionless imports (e.g., `import { foo } from './bar'`, not `./bar.js`) — Next.js/webpack cannot resolve `.js` extensions in raw TypeScript source
- Import order is enforced by Prettier + ESLint: external → internal packages → relative

### File extensions

- **No `.js` extensions** in TypeScript source files consumed by Next.js. Use extensionless imports.
- The API (`apps/api`) uses Node.js ESM and may use `.js` extensions in compiled output, but source imports should remain extensionless for consistency.

### Naming

- Files: `kebab-case.ts` (e.g., `user.repository.ts`, `auth.middleware.ts`)
- React components: `PascalCase.tsx`
- Exported constants and functions: `camelCase`
- Zod schemas: `camelCaseSchema` (e.g., `createUserSchema`)

### tRPC

- Routers live in `apps/api/src/routers/` — thin wrappers only (input parsing + calling a service)
- Business logic belongs in `apps/api/src/application/` services
- Data access belongs in `apps/api/src/infrastructure/` repositories
- Always add new procedures to the procedure map in `infrastructure.md` §8

### Database

- Never import `@prisma/client` directly in apps — always go through `@chefer/database`
- Schema changes require: `pnpm db:migrate` (dev) or `pnpm db:migrate:prod` (production)
- After schema changes run `pnpm db:generate` to update the Prisma client

### Environment variables

- Validate all env vars with Zod at startup (see `apps/api/src/lib/env.ts` and `apps/web/src/lib/env.ts`)
- Never access `process.env` directly outside of `env.ts` files
- New env vars must be added to both the `.env.example` file and `infrastructure.md` §10

### Components

- Shared UI goes in `packages/ui` — do not build one-off components in the app that belong in the library
- Use `cn()` from `@chefer/utils` for conditional class merging
- Component variants use `class-variance-authority`

---

## Architecture Rules

1. **No direct DB access from `apps/web`** — the web app should call the API via tRPC. The current `/user` page uses `prisma.user.findFirst` only to get an ID; all data fetching goes through `serverClient`.

2. **Layered API architecture** — respect the layer order: Router → Service → Repository → Prisma. Do not skip layers (e.g., no Prisma calls in routers).

3. **Interface-driven repositories** — repositories implement interfaces (`IUserRepository`). Services depend on the interface, not the concrete class. This enables testing with mocks.

4. **Type safety end-to-end** — the tRPC `AppRouter` type is imported by the web app for full type inference. Never cast away types to work around type errors; fix the root cause.

5. **Auth middleware, not router guards** — access control is enforced by tRPC middleware (`protectedProcedure`, `adminProcedure`), not by `if` checks inside procedure handlers (except for ownership checks like "can only update self").

---

## Running the Project

```bash
# First time
./infrastructure/scripts/setup.sh
pnpm db:push
pnpm db:seed

# Every day
pnpm dev          # web on :3000, api on :3001

# Quality checks
pnpm lint
pnpm typecheck
pnpm test
pnpm format
```

---

## Commit Convention

This project uses **Conventional Commits** (enforced by commitlint):

```
feat(scope): add new feature
fix(scope): fix a bug
docs(scope): documentation only
refactor(scope): code change without feature/fix
test(scope): add or update tests
chore(scope): tooling, deps, config
```

Scope examples: `api`, `web`, `database`, `ui`, `types`, `utils`, `infra`

---

## Seed Accounts

After running `pnpm db:seed`:

| Email            | Password   | Role      |
| ---------------- | ---------- | --------- |
| admin@chefer.dev | Admin@123! | ADMIN     |
| alice@chefer.dev | User@123!  | USER      |
| bob@chefer.dev   | User@123!  | MODERATOR |
