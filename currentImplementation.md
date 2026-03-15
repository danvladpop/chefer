# PersonalChef.ai — Current Implementation

**Last updated:** T-006 · Sign Up & Login Pages
**Phase:** 0 — Foundation

---

## What's Been Built

| Task  | Name                              | Status  | Notes                                                                                                                                                                                                            |
| ----- | --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-001 | Health Check & Env Setup          | ✅ Done | `GET /api/health` at port 3001; AI env vars added; root `.env.example` created                                                                                                                                   |
| T-002 | Chef Profile Schema               | ✅ Done | `chef_profiles` table + `ActivityLevel`/`Goal` enums; `ChefProfileRepository` exported from `@chefer/database`                                                                                                   |
| T-003 | Authentication – Register & Login | ✅ Done | `auth.register` + `auth.login` + `auth.logout` + `auth.me` tRPC procedures; `chefer_session` cookie; bcrypt password hashing; register page at `/register`                                                       |
| T-004 | Core Layout & Navigation Shell    | ✅ Done | Next.js `middleware.ts` protects all dashboard routes; `NavBar` component with logo, nav links, avatar/sign-out dropdown; `(dashboard)` route group layout                                                       |
| T-005 | Landing Page (Unauthenticated)    | ✅ Done | `app/page.tsx` — hero with CTA → `/register`, 3-column features (Weekly AI Meal Plans, Personalized Goals, Smart Shopping Lists), footer; server-side cookie check redirects authenticated users to `/dashboard` |
| T-006 | Sign Up & Login Pages             | ✅ Done | Register success now redirects to `/onboarding`; both `/login` and `/register` pages do server-side cookie check and redirect authenticated users to `/dashboard`; branding updated to PersonalChef.ai           |

---

## How to Run

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env files (fill in DATABASE_URL at minimum)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 3. Set DATABASE_URL in apps/api/.env and packages/database/.env, then push schema
pnpm db:push
pnpm db:seed

# 4. Start both apps
pnpm dev
# → web:  http://localhost:3000
# → api:  http://localhost:3001
```

---

## How to Test the Latest Feature

### T-006 — Sign Up & Login Pages

**Pre-condition:** `pnpm db:push` and `pnpm db:seed` have been run. Both `pnpm dev` processes are running.

#### Test A — Register redirects to /onboarding

1. Open an incognito window and navigate to `http://localhost:3000/register`
2. Fill in: First name `Test`, Last name `User`, Email `newuser@example.com`, Password `Test@123!`, Confirm password `Test@123!`
3. Click **Create account**
4. **Expected:** Redirected to `/onboarding` (404 is fine at this stage — the route isn't built yet). `chefer_session` cookie is set.

#### Test B — Mismatched passwords shows inline error

1. Navigate to `/register`
2. Enter any email, password `Test@123!`, confirm password `Different@123!`
3. Click **Create account**
4. **Expected:** "Passwords do not match" error shown inline under the confirm field. No API call made.

#### Test C — Duplicate email shows server error

1. Navigate to `/register`, use `alice@chefer.dev` with a valid password
2. Click **Create account**
3. **Expected:** Red error banner "An account with this email already exists".

#### Test D — Login redirects to /dashboard

1. Navigate to `/login`, sign in as `alice@chefer.dev` / `User@123!`
2. **Expected:** Redirected to `/dashboard`.

#### Test E — Authenticated users redirected away from auth pages

1. While logged in as Alice, navigate to `http://localhost:3000/login`
2. **Expected:** Immediately redirected to `/dashboard` — login form never shown.
3. Navigate to `http://localhost:3000/register`
4. **Expected:** Same — redirected to `/dashboard`.

---

### T-005 — Landing Page (Unauthenticated)

**Pre-condition:** Both `pnpm dev` processes are running.

#### Test A — Landing page renders for unauthenticated users

1. Open an incognito window and navigate to `http://localhost:3000`
2. **Expected:** Hero section with headline "Your personal chef, powered by AI", a **Get started for free** CTA, and a **Sign in** link.

#### Test B — CTA navigates to register

1. On the landing page, click **Get started for free**
2. **Expected:** Navigates to `/register`.

#### Test C — 3-column features are present

1. Scroll down on the landing page
2. **Expected:** Three feature cards: "Weekly AI Meal Plans", "Personalized Goals", "Smart Shopping Lists" — each with an icon and description.

#### Test D — Authenticated users are redirected

1. Log in as `alice@chefer.dev` / `User@123!`
2. Navigate to `http://localhost:3000`
3. **Expected:** Immediately redirected to `/dashboard` — no landing page content shown.

---

### T-004 — Core Layout & Navigation Shell

**Pre-condition:** `pnpm db:push` and `pnpm db:seed` have been run. Both `pnpm dev` processes are running.

#### Test A — Unauthenticated redirect

1. Open an incognito window and navigate to `http://localhost:3000/dashboard`
2. **Expected:** Redirected to `/login?from=%2Fdashboard`. No `/dashboard` content is shown.

#### Test B — Redirect works for all protected routes

1. In incognito, navigate to each of: `/meal-plan`, `/preferences`, `/onboarding`, `/tracker`, `/history`
2. **Expected:** Each redirects to `/login`.

#### Test C — Nav bar visible after login

1. Navigate to `http://localhost:3000/login`
2. Sign in as `alice@chefer.dev` / `User@123!`
3. **Expected:** `/dashboard` loads with a top nav bar showing the 🍽️ PersonalChef.ai logo, Dashboard / Meal Plan / Preferences links, and a user avatar.

#### Test D — Nav links route correctly

1. While logged in, click **Meal Plan** in the nav
2. **Expected:** URL changes to `/meal-plan` (404 page is fine at this stage — the route is not yet built).
3. Click **Preferences** — URL changes to `/preferences`.
4. Click the logo — navigates to `/dashboard`.

#### Test E — Sign Out clears session

1. Click the avatar/name in the top-right corner
2. **Expected:** Dropdown shows the user's display name, email, and a **Sign out** button.
3. Click **Sign out**
4. **Expected:** Redirected to `/login`. Navigating to `/dashboard` redirects back to `/login`.

#### Test F — Auth pages remain accessible without nav

1. While logged out, visit `/login` and `/register`
2. **Expected:** No top nav bar on these pages.

---

## Seed Accounts

Available after `pnpm db:seed`:

| Email            | Password   | Role      |
| ---------------- | ---------- | --------- |
| admin@chefer.dev | Admin@123! | ADMIN     |
| alice@chefer.dev | User@123!  | USER      |
| bob@chefer.dev   | User@123!  | MODERATOR |

---

## Known Limitations (Phase 0 — complete, Phase 1 not started)

- No "forgot password" flow (out of scope for MVP)
- `/onboarding`, `/meal-plan`, `/preferences` etc. are protected by middleware but pages don't exist yet — they will 404 until Phase 1+ builds them out
- `DietaryPreferences` model not yet added (T-007)
- Pre-existing TypeScript errors in `packages/database`, `packages/utils`, and `packages/ui` (missing deps: `@types/node`, `@radix-ui/react-slot`). These do not affect the dev runtime — only `pnpm typecheck` output.
- Pre-existing `exactOptionalPropertyTypes` violations in `apps/api/src` (user router/service/repository). These do not affect runtime.
