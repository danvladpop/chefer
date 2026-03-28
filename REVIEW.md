# Chefer — Full Application Review

**Date:** 2026-03-28
**Reviewer:** Claude Code (automated audit)
**Scope:** Security, bugs, architecture, performance, code quality

---

## Executive Summary

The Chefer codebase has a solid foundation — correct use of tRPC, Prisma, Zod validation, and a clear layered architecture. Several good practices are already in place (bcrypt hashing, HttpOnly cookies, ownership checks). However, there are **3 high-severity issues** that must be fixed before production, and a number of medium/low issues that warrant attention in upcoming sprints.

---

## Severity Legend

| Icon | Level      | Action Required                     |
| ---- | ---------- | ----------------------------------- |
| 🔴   | **High**   | Fix before production               |
| 🟡   | **Medium** | Fix in next sprint                  |
| 🟢   | **Low**    | Backlog / best-practice improvement |

---

## 1. Security Vulnerabilities

### 🔴 SEC-01 — Public User Profile Enumeration

**File:** `apps/api/src/routers/user.router.ts:55`

```typescript
getById: publicProcedure   // ← should be protectedProcedure
  .input(z.object({ id: z.string().cuid() }))
  .query(async ({ input }) => {
    const user = await userService.findById(input.id);
    ...
    return user; // returns email, name, role, createdAt, updatedAt
  }),
```

Any unauthenticated caller can fetch any user's full profile (email, name, role, timestamps) by iterating CUID values. This enables user enumeration, email harvesting, and role discovery.

**Fix:** Change `publicProcedure` to `protectedProcedure`. If this endpoint is intentionally public (e.g., for public profile pages), return a reduced DTO that omits email and role.

---

### 🔴 SEC-02 — `ctx.user.firstName` Accessed but Not in `UserProfile` Type

**Files:** `apps/api/src/routers/dashboard.router.ts:10`, `packages/types/src/index.ts:33`

```typescript
// dashboard.router.ts
return dashboardService.getSummary(ctx.user.id, ctx.user.firstName ?? null);
//                                               ^^^^^^^^^^^^^^^^ — does not exist on UserProfile

// types/src/index.ts
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  image: string | null;
  // firstName and lastName are missing
}
```

`UserProfile` does not include `firstName` or `lastName` — these fields are stored in the database but are never selected in `resolveUserFromSession()` (`auth.middleware.ts:51–57`). Accessing `ctx.user.firstName` at runtime evaluates to `undefined`, not the user's first name. If TypeScript strict mode doesn't catch this it means the interface is missing the field declaration.

**Fix:** Either:

- Add `firstName: string | null` and `lastName: string | null` to `UserProfile` **and** select those fields in `resolveUserFromSession`, or
- Derive `firstName` inside `getSummary()` by splitting `user.name` — and remove the parameter from the call site.

---

### 🔴 SEC-03 — JWT Bearer Token Authentication Not Implemented

**File:** `apps/api/src/interfaces/http/middleware/auth.middleware.ts:101–108`

```typescript
if (!user) {
  const bearerToken = extractBearerToken(req.headers.authorization);
  if (bearerToken) {
    // In production, verify JWT here:
    // user = await verifyJwt(bearerToken, env.JWT_SECRET);
    void bearerToken; // placeholder — token is silently discarded
  }
}
```

The code extracts a Bearer token but does nothing with it. Any client presenting `Authorization: Bearer <token>` receives an `UNAUTHORIZED` response regardless. Meanwhile, `env.ts` requires `JWT_SECRET` and `REFRESH_TOKEN_SECRET` to be set (minimum 32 chars) — they are validated at startup but never consumed. This is misleading to operators and means any JWT-based integration silently fails.

**Fix (choose one):**

- Implement proper JWT verification using `jose` or `jsonwebtoken` with `env.JWT_SECRET`.
- If JWT support is out-of-scope for the current phase, remove the `if (bearerToken)` block, remove `JWT_SECRET` / `REFRESH_TOKEN_*` from `env.ts`, and document this as a future phase.

---

### 🟡 SEC-04 — Session Cookie Missing `Secure` Flag in Non-Production

**File:** `apps/api/src/application/auth/auth.service.ts:122–127`

```typescript
const isProd = process.env['NODE_ENV'] === 'production';
const securePart = isProd ? '; Secure' : '';
res.setHeader(
  'Set-Cookie',
  `${SESSION_COOKIE}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=...${securePart}`,
);
```

The `Secure` attribute is omitted in non-production environments. This is acceptable for HTTP localhost development, but a staging environment served over HTTPS will issue cookies without `Secure`, making them transmittable over plain HTTP. Consider `SameSite=Strict` instead of `Lax` for stronger CSRF protection (at the cost of slightly reduced usability with same-site navigations).

**Fix:** Decouple `Secure` from `NODE_ENV`. Base it on whether the request was served over HTTPS, or add a `COOKIE_SECURE=true/false` env var that can be explicitly set in staging.

---

### 🟡 SEC-05 — 10 MB JSON Body Limit Opens DoS Vector

**File:** `apps/api/src/index.ts:22`

```typescript
app.use(express.json({ limit: '10mb' }));
```

A 10 MB body limit is extremely generous for a tRPC API whose largest legitimate payload is a recipe with a few ingredients. Any unauthenticated caller can repeatedly POST 10 MB bodies to exhaust memory or CPU.

**Fix:** Reduce to `'256kb'` (or at most `'1mb'`) as a sensible default. If image upload is needed, handle it via a dedicated multipart endpoint with its own higher limit.

---

### 🟡 SEC-06 — Health Endpoint Leaks Environment and Version Info

**File:** `apps/api/src/index.ts:28–35`

```typescript
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV, // ← leaks "production"
    version: process.env['npm_package_version'] ?? 'unknown', // ← leaks version
  });
});
```

Exposing `environment` and `version` to unauthenticated callers aids attackers in targeting known vulnerabilities for specific package versions. `/health/ready` and `/api/health` are fine (return minimal info).

**Fix:** Remove `environment` and `version` from the public `/health` response, or gate the endpoint behind an internal network rule.

---

### 🟡 SEC-07 — No Rate Limiting on Auth Endpoints

**File:** `apps/api/src/lib/env.ts:29–31`

```typescript
RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
```

The env vars for rate limiting are defined and validated at startup but no middleware consumes them. The `auth.register` and `auth.login` endpoints are fully unprotected against brute-force or credential-stuffing attacks.

**Fix:** Add `express-rate-limit` (or `@trpc/server` middleware) on the `/trpc/auth.login` and `/trpc/auth.register` paths, using the `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` values already in env.

---

### 🟡 SEC-08 — Session Token Uses UUID Instead of Cryptographically Secure Random

**File:** `apps/api/src/application/auth/auth.service.ts:115`

```typescript
const sessionToken = crypto.randomUUID();
```

UUIDv4 uses only 122 bits of actual entropy (6 bits are fixed version/variant markers). While this is unlikely to be exploited in practice, the OWASP Session Management standard recommends at least 128 bits of unpredictable random data from a CSPRNG.

**Fix:**

```typescript
const sessionToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
```

This gives 256 bits of entropy.

---

### 🟢 SEC-09 — Silent Logout Ignores Database Deletion Failures

**File:** `apps/api/src/application/auth/auth.service.ts:100–110`

```typescript
await prisma.session.deleteMany({ where: { sessionToken } }).catch(() => {
  // Ignore errors — cookie is cleared regardless
});
```

If the database is unavailable during logout, the session is never deleted, leaving an orphaned (but still valid) session token. The error is silently swallowed.

**Fix:** Log the error so it appears in monitoring, even if the cookie clear should still proceed.

---

### 🟢 SEC-10 — Chat Route Accesses Prisma Directly from `apps/web`

**File:** `apps/web/src/app/api/chat/route.ts:4,41`

```typescript
import { prisma } from '@chefer/database';
// ...
const session = await prisma.session.findUnique({ ... });
```

This violates the documented architecture rule: "No direct DB access from `apps/web`". The web app bypasses the API layer and creates its own session-resolution logic — a duplicated code path that can diverge from `auth.middleware.ts`.

**Fix:** Create a `session.validate` tRPC procedure (or use the existing `auth.me`) so the chat route authenticates through the standard API path.

---

## 2. Bugs & Logic Errors

### 🔴 BUG-01 — AI Recipe Swap Passes Empty `currentRecipeId`

**File:** `apps/api/src/application/meal-plan/meal-plan.service.ts:373–378`

```typescript
newRecipe = await aiService.generateRecipeSwap({
  userId,
  mealType: mealType as MealType,
  currentRecipeId: '', // ← hardcoded empty string
  reason,
});
```

The AI swap never knows which recipe it is replacing. When the live AI service is implemented, it cannot generate a contextually appropriate swap because it lacks the original recipe. The plan's current day/meal slot is already available at this point in the code.

**Fix:** Fetch the current meal slot from the plan's `days` array before calling the AI, and pass the actual recipe ID:

```typescript
const day = plan.days.find((d) => d.dayOfWeek === dayOfWeek);
const slot = (day?.meals as MealSlotJson[])?.find((m) => m.type === mealType);
const currentRecipeId = slot?.recipeId ?? '';
```

---

### 🟡 BUG-02 — Password Field in Admin `user.create` Is Silently Discarded

**File:** `apps/api/src/routers/user.router.ts:14–18, 84–89`

```typescript
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100).optional(),
  password: z.string().min(8),   // ← accepted
  role: z.nativeEnum(UserRole).optional(),
});

create: adminProcedure.input(createUserSchema).mutation(async ({ input }) => {
  return userService.create({
    email: input.email,
    name: input.name,
    role: input.role,
    // password is never passed — silently ignored
  });
}),
```

An admin creates a user with a password, yet the password is never hashed or stored. The user is created with `passwordHash = null`, meaning they cannot log in with any password.

**Fix:** Either remove `password` from the schema (admin-created users use an invitation or password-reset flow), or pass the password through to the service which hashes and stores it.

---

### 🟡 BUG-03 — `findAllRecipesForUser` Has N+1 Problem in Default Path

**File:** `packages/database/src/repositories/favourite-recipe.repository.ts:144–169`

```typescript
// Fetches ALL user meal plans + ALL days
const plans = await prisma.mealPlan.findMany({
  where: { userId },
  include: { days: true },
});

// Then extracts IDs and fetches recipes in a second query
const recipeIds = new Set<string>();
for (const plan of plans) {
  /* ... */
}
return prisma.recipe.findMany({ where: { id: { in: [...recipeIds] } } });
```

This loads every meal plan a user has ever had (including archived) into memory just to collect recipe IDs. For a user with years of history this could be thousands of rows. The `take: limit` on the final recipe query is applied _after_ loading all plans.

**Fix:** Use a Prisma join or subquery to find distinct `recipeId`s directly:

```typescript
const mealDays = await prisma.mealPlanDay.findMany({
  where: { mealPlan: { userId } },
  select: { meals: true },
});
```

Then extract IDs and apply the limit before fetching full recipes.

---

### 🟡 BUG-04 — Graceful Shutdown Exits Before HTTP Server Closes

**File:** `apps/api/src/index.ts:116–132`

```typescript
async function gracefulShutdown(signal: string): Promise<void> {
  server.close(() => {
    console.log('✅ HTTP server closed');   // runs asynchronously...
  });

  try {
    await prisma.$disconnect();             // ...but we proceed here immediately
  } catch { ... }

  process.exit(0);   // exits before server.close callback fires
}
```

`server.close()` is asynchronous — it stops accepting new connections but waits for existing ones to finish. However, the function proceeds to `process.exit(0)` without waiting for the callback, meaning in-flight requests are hard-killed.

**Fix:**

```typescript
await new Promise<void>((resolve) => server.close(() => resolve()));
```

---

### 🟢 BUG-05 — Unvalidated `messages` Array in Chat Route

**File:** `apps/web/src/app/api/chat/route.ts:63`

```typescript
const { messages } = (await req.json()) as { messages: IncomingMessage[] };
```

The body is parsed and cast without any Zod validation. A malformed payload (missing `messages`, wrong type, deeply nested objects) can cause an unhandled exception or pass garbage to the AI service.

**Fix:** Add a Zod schema and `safeParse` before processing.

---

## 3. Architecture Issues

### 🟡 ARCH-01 — `updateDayMeal` Repository Method Has No Ownership Enforcement

**File:** `packages/database/src/repositories/meal-plan.repository.ts`

The `updateDayMeal(planId, dayOfWeek, mealType, newRecipeId)` repository method finds and updates a `MealPlanDay` by `planId` alone — no `userId` is checked at the database layer. Authorization is entirely dependent on the service layer calling `findActiveWithDays(userId)` first. If a future refactor adds a new call path that skips this check, it silently allows cross-user plan modification.

**Fix:** Add `userId` to the `updateDayMeal` signature and include it in the `WHERE` clause via a join or sub-select on `MealPlan`:

```typescript
where: { mealPlanId: planId, mealPlan: { userId } }
```

---

### 🟡 ARCH-02 — Duplicate `CATEGORY_MAP` / `inferCategory` Logic

**Files:**

- `apps/api/src/application/meal-plan/meal-plan.service.ts:27–89`
- `apps/api/src/application/shopping-list/shopping-list.service.ts:27–89`

Both files contain a near-identical `CATEGORY_MAP` object (100+ lines) and an `inferCategory()` function. Any change (adding "potato" → Produce, fixing a typo) must be made in both places.

**Fix:** Extract to `packages/utils/src/category.ts` and import from both services.

---

### 🟡 ARCH-03 — Services Instantiated as Module-Level Singletons

**Files:** Various routers, e.g. `apps/api/src/routers/user.router.ts:10`

```typescript
const userService = new UserService(new PrismaUserRepository());
```

Services are constructed at module load time rather than injected. This makes unit testing harder (can't pass mock repositories without module-level patching) and is inconsistent with the interface-driven repository pattern described in CLAUDE.md.

**Fix:** Pass service instances through a simple DI container or constructor injection at the router level, consistent with how the rest of the interfaces are designed.

---

### 🟢 ARCH-04 — `void env` at Bottom of `auth.middleware.ts` Is a Code Smell

**File:** `apps/api/src/interfaces/http/middleware/auth.middleware.ts:159`

```typescript
// Expose env for use in middleware
void env;
```

`env` is imported but only used in a commented-out JWT path. This line silences the "unused import" lint warning by voiding the value. When JWT is implemented, the real usage should remove this placeholder.

---

## 4. Performance Issues

### 🟡 PERF-01 — Case-Insensitive Search Without Index on `name`

**File:** `apps/api/src/application/user/user.service.ts:96–106`

```typescript
OR: [
  { email: { contains: search, mode: 'insensitive' } },
  { name:  { contains: search, mode: 'insensitive' } },
],
```

Prisma's `contains` with `mode: 'insensitive'` maps to `ILIKE '%value%'` in PostgreSQL, which cannot use a standard B-tree index. The `User` table likely has an index on `email`, but substring ILIKE bypasses it anyway. There is no index on `name`.

**Fix:** For the short term, add `@@index([name])` to the Prisma schema. For the long term, use PostgreSQL full-text search via `@@ts_vector` or a dedicated search index.

---

### 🟡 PERF-02 — `findAllRecipesForUser` Loads Full Meal Plans to Collect IDs

Already detailed in **BUG-03** above. The performance impact grows O(n) with the user's plan history.

---

### 🟢 PERF-03 — Repeated JSON Type Assertions in Inner Loops

**File:** `apps/api/src/application/meal-plan/meal-plan.service.ts:444–452`

```typescript
for (const day of plan.days) {
  for (const m of day.meals as MealSlotJson[]) allIds.add(m.recipeId);
}
```

The cast `as MealSlotJson[]` happens on every iteration of the outer loop. It has no runtime cost but indicates the field should be typed at source. Prisma supports typed `Json` fields via custom type helpers.

---

## 5. Code Quality

### 🟡 QUAL-01 — Unused Environment Variables Defined as Required

**File:** `apps/api/src/lib/env.ts`

The following variables are validated at startup (startup will **fail** if they are missing) but are never used in code:

| Variable                                  | Intended Use             | Status          |
| ----------------------------------------- | ------------------------ | --------------- |
| `JWT_SECRET`                              | JWT verification         | Not implemented |
| `REFRESH_TOKEN_SECRET`                    | Refresh tokens           | Not implemented |
| `REFRESH_TOKEN_EXPIRES_IN`                | Refresh tokens           | Not implemented |
| `JWT_EXPIRES_IN`                          | JWT expiry               | Not implemented |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Rate limiting middleware | Not wired up    |

This forces operators to set 5+ secrets for features that don't yet exist, and creates confusion about what is actually active.

**Fix:** Move future-phase variables to an `.env.example` comment block explaining they are optional/future, and make their Zod schemas `.optional()` until the feature is built.

---

### 🟡 QUAL-02 — String Inputs Not Trimmed Before Storage

**Files:** `apps/api/src/routers/recipe.router.ts`, `apps/api/src/routers/preferences.router.ts`

Zod schemas accept strings without `.trim()`:

```typescript
name: z.string().min(1).max(120),        // "  My Recipe  " is stored as-is
description: z.string().min(1).max(500),
```

A recipe named `"  Pasta  "` will not match a search for `"Pasta"` and will display with leading/trailing whitespace in the UI.

**Fix:** Add `.trim()` to all user-supplied string fields: `z.string().trim().min(1).max(120)`.

---

### 🟡 QUAL-03 — Inconsistent Error Handling Across Services

Some services use `try/catch` with a `handleError()` wrapper:

```typescript
// user.service.ts
try {
  return await this.userRepository.findById(id);
} catch (error) {
  this.handleError(error); // generic logger
}
```

Others throw `TRPCError` directly without logging:

```typescript
// recipe.service.ts
if (!recipe) throw new TRPCError({ code: 'NOT_FOUND', message: 'Recipe not found.' });
```

This makes it unpredictable when errors are logged vs. silently swallowed.

**Fix:** Establish one convention: tRPC-known errors (`NOT_FOUND`, `FORBIDDEN`, etc.) are thrown directly; unexpected database errors are caught, logged with context, and re-thrown as `INTERNAL_SERVER_ERROR`.

---

### 🟡 QUAL-04 — `IncomingMessage.role` Typed as `string` Instead of Union

**File:** `apps/web/src/app/api/chat/route.ts:59`

```typescript
type IncomingMessage = {
  role: string;   // should be 'user' | 'assistant' | 'system'
  ...
};
```

And then cast at usage:

```typescript
role: m.role as 'user' | 'assistant',
```

If an invalid role (e.g., `"admin"`) is sent, the cast silently accepts it and passes it to the AI SDK, which may produce unexpected behavior.

**Fix:** Type as `role: 'user' | 'assistant'` from the start, and let Zod validation reject unknown roles.

---

### 🟢 QUAL-05 — No Structured Logging

**Files:** Throughout `apps/api/src/`

All logging uses `console.log` / `console.error` with emoji prefixes:

```typescript
console.log(`✅ tRPC error on ${path ?? 'unknown'}:`);
console.error('Unexpected error in UserService:', error);
```

In a production environment with centralized log aggregation (Datadog, Loki, CloudWatch), unstructured text logs are difficult to query and alert on.

**Fix:** Integrate `pino` or `winston` for structured JSON logs. The logger can be configured to use pretty-print in development.

---

### 🟢 QUAL-06 — `updateManualRecipe` Uses Two Sequential Queries (Read + Update)

**File:** `packages/database/src/repositories/favourite-recipe.repository.ts:207–235`

```typescript
const existing = await prisma.recipe.findFirst({ where: { id, creatorId: userId, source: MANUAL } });
if (!existing) throw new Error('...');

return prisma.recipe.update({ where: { id }, data: { ... } });
```

The ownership check and update are two separate queries without a transaction. In theory, the record could be deleted between the check and the update (a TOCTOU race), though unlikely in practice.

**Fix:** Use `prisma.recipe.updateMany({ where: { id, creatorId: userId, source: MANUAL }, data })` and check `count === 0` to detect "not found or not owned" in a single atomic operation.

---

## 6. Summary Table

| ID      | Severity  | Category     | File                                 | Description                                                             |
| ------- | --------- | ------------ | ------------------------------------ | ----------------------------------------------------------------------- |
| SEC-01  | 🔴 High   | Security     | `user.router.ts:55`                  | `publicProcedure` exposes full user profiles to unauthenticated callers |
| SEC-02  | 🔴 High   | Security/Bug | `dashboard.router.ts:10`             | `ctx.user.firstName` undefined — not in `UserProfile` type              |
| SEC-03  | 🔴 High   | Security     | `auth.middleware.ts:103`             | JWT Bearer token extraction implemented but not verified                |
| SEC-04  | 🟡 Medium | Security     | `auth.service.ts:122`                | `Secure` cookie flag absent in non-production deployments               |
| SEC-05  | 🟡 Medium | Security     | `index.ts:22`                        | 10 MB JSON body limit enables memory-exhaustion DoS                     |
| SEC-06  | 🟡 Medium | Security     | `index.ts:28`                        | Health endpoint leaks `environment` and `version`                       |
| SEC-07  | 🟡 Medium | Security     | `env.ts:29`                          | Rate limiting env vars defined but no middleware applies them           |
| SEC-08  | 🟡 Medium | Security     | `auth.service.ts:115`                | Session token is UUIDv4 (122-bit entropy); prefer 256-bit CSPRNG        |
| SEC-09  | 🟢 Low    | Security     | `auth.service.ts:102`                | Silent swallow of DB error during session deletion                      |
| SEC-10  | 🟢 Low    | Architecture | `chat/route.ts:4`                    | Web app imports Prisma directly, bypassing the API layer                |
| BUG-01  | 🔴 High   | Bug          | `meal-plan.service.ts:376`           | `currentRecipeId: ''` hardcoded — AI swap has no context                |
| BUG-02  | 🟡 Medium | Bug          | `user.router.ts:84`                  | Password accepted by schema but never hashed or stored                  |
| BUG-03  | 🟡 Medium | Bug/Perf     | `favourite-recipe.repository.ts:144` | Loads all meal plan history to collect recipe IDs                       |
| BUG-04  | 🟡 Medium | Bug          | `index.ts:116`                       | `process.exit(0)` fires before `server.close()` callback                |
| BUG-05  | 🟢 Low    | Bug          | `chat/route.ts:63`                   | Chat message body not validated with Zod                                |
| ARCH-01 | 🟡 Medium | Architecture | `meal-plan.repository.ts`            | `updateDayMeal` takes no `userId` — ownership enforced only in service  |
| ARCH-02 | 🟡 Medium | Architecture | Two service files                    | Duplicate `CATEGORY_MAP` / `inferCategory` in 100+ lines each           |
| ARCH-03 | 🟡 Medium | Architecture | Multiple routers                     | Services constructed at module scope; defeats interface-driven design   |
| ARCH-04 | 🟢 Low    | Architecture | `auth.middleware.ts:159`             | `void env` placeholder code smell                                       |
| PERF-01 | 🟡 Medium | Performance  | `user.service.ts:96`                 | Case-insensitive name search with no DB index                           |
| PERF-02 | 🟡 Medium | Performance  | `favourite-recipe.repository.ts:144` | Same as BUG-03                                                          |
| QUAL-01 | 🟡 Medium | Code Quality | `env.ts`                             | 5 env vars required at startup for unimplemented features               |
| QUAL-02 | 🟡 Medium | Code Quality | Multiple routers                     | String inputs not trimmed before validation or storage                  |
| QUAL-03 | 🟡 Medium | Code Quality | Multiple services                    | Inconsistent error-handling patterns                                    |
| QUAL-04 | 🟡 Medium | Code Quality | `chat/route.ts:59`                   | `role: string` cast instead of typed union                              |
| QUAL-05 | 🟢 Low    | Code Quality | `apps/api/src/`                      | No structured logging; `console.log` throughout                         |
| QUAL-06 | 🟢 Low    | Code Quality | `favourite-recipe.repository.ts:207` | Two-query ownership check + update has TOCTOU gap                       |

---

## 7. Recommended Remediation Order

### Immediate (before any production deployment)

1. **SEC-01** — Change `user.getById` to `protectedProcedure`
2. **SEC-02** — Add `firstName`/`lastName` to `UserProfile` and select them in session resolution
3. **SEC-03** — Implement JWT verification or remove the placeholder and make secrets optional
4. **BUG-01** — Pass the real `currentRecipeId` from the plan to the AI swap call
5. **BUG-02** — Remove password from `createUserSchema` or hash and store it

### Next Sprint

6. **SEC-05** — Reduce JSON body limit to `256kb`
7. **SEC-07** — Wire up `express-rate-limit` on auth endpoints
8. **SEC-08** — Switch session token to 256-bit CSPRNG hex
9. **ARCH-01** — Add `userId` guard to `updateDayMeal`
10. **ARCH-02** — Extract shared `CATEGORY_MAP` to `@chefer/utils`
11. **BUG-03 / PERF-02** — Rewrite `findAllRecipesForUser` default path
12. **BUG-04** — Await `server.close()` before `process.exit`
13. **QUAL-01** — Make unimplemented-phase env vars optional
14. **QUAL-02** — Add `.trim()` to string schemas across routers
15. **PERF-01** — Add DB index on `User.name`

### Backlog

16. **SEC-04** — Introduce `COOKIE_SECURE` env var
17. **SEC-06** — Strip environment/version from public health endpoint
18. **SEC-09** — Log logout DB errors
19. **SEC-10** — Route chat authentication through tRPC
20. **ARCH-03** — Dependency injection for services
21. **QUAL-03** — Standardise error-handling conventions
22. **QUAL-04** — Type `IncomingMessage.role` as a union
23. **QUAL-05** — Integrate structured logging (Pino)
24. **QUAL-06** — Replace two-query ownership check with `updateMany`
