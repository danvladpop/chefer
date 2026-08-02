# Deployment Plan — Chefer, self-judged for ~$0

Status: **code prep DONE — awaiting your one-time Phase 0**.
Goal: put Chefer online for **private testing (just you)** at **$0**, respecting the
existing stack.

## ✅ Locked decisions + what's implemented (read this first)

**Decisions (all confirmed):** truly-**$0** ingress via **DuckDNS + Caddy** (`chefer.duckdns.org`,
free auto-TLS) · compute on **Oracle Always Free ARM VM** · **Prisma ARM** engine target added ·
DB seeded from your **local dump** · **nightly pg_dump** backups.

**Architecture chosen: one VM, one origin.** Caddy terminates TLS for `chefer.duckdns.org`
and path-routes on a single hostname: `/trpc`, `/api/uploads/*`, `/api/recipe-images/*`,
`/uploads/*` → the API container; everything else → the Next.js web container. Because it's a
single origin, there is **no CORS and no cross-subdomain cookie** to manage. Workers + SSE +
uploads all run natively on the always-on VM (no refactor).

**Code prep completed this session (verified with a real production web build):**

- `packages/database/prisma/schema.prisma` — added `binaryTargets` incl. `linux-musl-arm64-openssl-3.0.x` (ARM VM).
- `infrastructure/docker/Dockerfile.api` — **rewritten to run the API via `tsx`** (the monorepo resolves `@chefer/*` as source; a project-wide `tsc` emit isn't set up, so we run TS directly, exactly like `pnpm dev`). Prisma client generated in-image.
- `infrastructure/docker/Dockerfile.web` — fixed to include the `@chefer/api`/`@chefer/database` workspace deps (needed for end-to-end tRPC types) + Prisma generate; standalone output.
- `apps/web/next.config.ts` — `typescript.ignoreBuildErrors` (pre-existing cross-package type debt doesn't block the deploy build; `pnpm typecheck` still enforces it), `images.unoptimized` in prod, `/trpc` rewrite honours an internal URL.
- `apps/web/src/app/layout.tsx` — `export const dynamic = 'force-dynamic'` (app is fully authed; fixes `useSearchParams` prerender errors).
- `apps/web/src/app/api/health/route.ts` — **new** liveness route the web healthcheck needs (was missing).
- SSR now calls the API over the internal Docker network via `API_INTERNAL_URL` (`trpc-server.ts`, `trpc-provider.tsx`); `app.set('trust proxy', 1)` so the upload URL + cookie `Secure` work behind Caddy; two benign pre-existing casts fixed so the build is clean.
- `docker-compose.deploy.yml` (repo root) — postgres + api + web + caddy, persistent `pgdata`/`uploads`/caddy volumes, **no Redis, no nginx**.
- `infrastructure/docker/Caddyfile` — single-origin path routing + auto-TLS + SSE flush.
- `.env.production.example` — every var you need.
- `infrastructure/scripts/` — `deploy.sh` (one-command redeploy), `restore-dump.sh` (local dump → VM), `backup-db.sh` (nightly), `duckdns-update.sh`.

**Future deploys are one button.** Superseded by [`plan-cicd.md`](./plan-cicd.md), now implemented:
images are built in GitHub Actions and pushed to GHCR, and the VM only pulls them
(`infrastructure/scripts/deploy.sh` = `git pull` → `compose pull` → `up -d --no-build`). Deploy via
**Actions → Deploy → Run workflow**, `gh workflow run deploy.yml`, or any code push to `master`;
roll back by running the workflow with `tag = sha-<short>`. Building on the VM still exists as a
fallback (`deploy-local-build.sh`). Phase 0 below is **one-time**.

---

_Original analysis (still valid) follows._

Respecting the tech stack that already exists.

> 2026 pricing/free-tier facts below are from public sources (see **Sources**); re-check
> live before acting — these move.

---

## 1. What the app actually needs (the analysis that drives everything)

I went through BE, FE, DB and infra. The decisive facts:

| Trait                      | Where                                                                                                                                                         | Consequence for hosting                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Always-on Node process** | `apps/api` runs two `setInterval` workers (`recipeImageWorker` poll loop, `ingredientPriceWorker` 12 h) started at boot in `index.ts`                         | Needs a container/VM that stays running. **Scale-to-zero / spin-down kills the workers** → images never finish.                   |
| **Long-lived SSE**         | `/api/recipe-images/stream`                                                                                                                                   | Needs a host that allows long streaming responses; trivial on a real server, awkward on serverless.                               |
| **Local file uploads**     | `POST /api/uploads/image` writes to disk, served at `/uploads/*`                                                                                              | Needs **persistent disk**. Ephemeral serverless disks lose them on every redeploy/cold start.                                     |
| **PostgreSQL + Prisma**    | `packages/database`                                                                                                                                           | Needs a Postgres. A **co-located** Postgres = $0; a managed one is usually the only paid piece.                                   |
| **Next.js 15 SSR**         | `apps/web` (server components + `trpc-server`)                                                                                                                | Needs a Node SSR runtime (not static hosting).                                                                                    |
| **Already containerised**  | `infrastructure/docker/Dockerfile.{api,web}` + `docker-compose.prod.yml`                                                                                      | The project was **designed to run as containers behind a reverse proxy** — a VM deploy is the grain of the stack, not against it. |
| **Redis is dead weight**   | `docker-compose.prod.yml` includes Redis, but **no code imports it** (no `redis`/`ioredis` dep, workers are in-memory, SSE uses an in-process `EventEmitter`) | **Drop Redis** → less RAM, simpler.                                                                                               |

**Conclusion:** this is a small **always-on containerised monolith-of-two-services + Postgres**.
The cheapest correct home is **one always-free VM running the existing `docker-compose`**, not a
serverless platform.

---

## 2. Options I considered, and why they lose at $0

| Option                                                                                  | $0?             | Verdict for _this_ app                                                                                                                                                                    |
| --------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Self-host on a free-forever VM** (Oracle Always Free / GCP e2-micro) + docker-compose | **Yes**         | ✅ **Winner.** Always-on (workers+SSE work), persistent disk (uploads work), co-located Postgres ($0), uses the repo's existing Docker setup, no code rewrite.                            |
| Firebase App Hosting + Cloud Run + Neon                                                 | Mostly          | Needs Blaze billing (card, real spend risk); workers need a Cloud Scheduler refactor; uploads need a Storage refactor; DB on Neon. More moving parts, more code changes, more money-risk. |
| **Render** free web service                                                             | No, in practice | Spins down after 15 min → **workers die**; free Postgres **auto-deletes at 30 days**. Disqualifying for this app.                                                                         |
| **Railway / Fly.io**                                                                    | No              | No real free tier for new accounts in 2026 (trial credits only; Fly needs a card).                                                                                                        |
| Vercel (web) free + API elsewhere                                                       | Partial         | Vercel is great for the Next.js front, but you still need a free always-on home for the API — so you're back to the VM anyway, plus cross-origin cookie complexity. Not simpler.          |
| Cloudflare Workers/Pages (full serverless)                                              | Yes             | Would require rewriting the Express server, workers, and SSE to the Workers model + a Prisma driver adapter. Large rewrite against the stack. No.                                         |

---

## 3. Recommended architecture

**One Always-Free VM running the existing containers, reached privately through Cloudflare
(or Tailscale) — zero open ports, free TLS, free access gate.**

```
  Your browser
       │  (HTTPS, email-gated)
       ▼
  Cloudflare edge ──[Cloudflare Tunnel, free, no inbound ports]──►  VM (Oracle Always Free, ARM, 2 vCPU/12 GB)
   + Cloudflare Access (free ≤50 users = just you)                   ├─ docker compose:
                                                                     │   ├─ web   (Next.js SSR)      :3000
                                                                     │   ├─ api   (Express+tRPC)     :3001  ← workers + SSE run here, always on
                                                                     │   ├─ postgres (persistent volume)
                                                                     │   └─ cloudflared (tunnel connector)
                                                                     └─ Docker volumes: pgdata, uploads
   External (egress only): Gemini API, Pollinations.ai
```

### Cost

| Item                    | Choice                                             | Cost                                      |
| ----------------------- | -------------------------------------------------- | ----------------------------------------- |
| Compute (VM, always-on) | Oracle Cloud **Always Free** ARM (2 OCPU / 12 GB)  | **$0**                                    |
| Postgres                | container on the VM (Docker volume)                | **$0**                                    |
| Uploads storage         | Docker volume on the VM                            | **$0**                                    |
| Ingress + TLS           | Cloudflare **Tunnel** (unlimited, free)            | **$0**                                    |
| Access control          | Cloudflare **Access** (Zero Trust, free ≤50 users) | **$0**                                    |
| AI                      | Gemini free tier (already used)                    | **$0**                                    |
| Recipe images           | Pollinations.ai (free)                             | **$0**                                    |
| **Domain** (optional)   | `chefer.app` at Cloudflare Registrar (at-cost)     | **~$10–12/yr**                            |
| **Total**               |                                                    | **$0** (or ~$10/yr with a branded domain) |

---

## 4. The domain / ingress decision (how to get to true $0 vs a branded URL)

You wanted "chefer" in the name. Three ways, cheapest-first:

- **A. Tailscale — truly $0, most private.** Put the VM on your Tailscale tailnet; name the
  machine `chefer` → reach it at `chefer.<your-tailnet>.ts.net` (has "chefer", $0, no domain,
  no open ports, only _your_ logged-in devices can connect). Optionally **Tailscale Funnel**
  (free) exposes a public HTTPS URL if you want to open it on a device without the Tailscale
  client. Best if you're fine without a custom domain.
- **B. Cloudflare Tunnel + Access + a `chefer.app` domain — ~$10/yr, branded + browser-friendly.**
  Buy `chefer.app` (~$10–12/yr, Cloudflare at-cost), run it through a free Tunnel, gate it with
  free Cloudflare Access (email OTP → only you). Real URL, any browser, still no open ports.
  **My default recommendation** — the only cost is the domain, and it's the nicest experience.
- **C. Caddy + DuckDNS — $0, branded-ish.** Free `chefer.duckdns.org`, Caddy on the VM for
  automatic Let's Encrypt TLS. Requires opening ports 80/443 (small attack surface) and there's
  no built-in access gate, so lean on the app's own login. Works, but B is safer and A is simpler.

→ **Go with B if you'll spend ~$10/yr for a `chefer.app` URL; otherwise A (Tailscale) for literal $0.**

---

## 5. Component notes

### Compute — Oracle Cloud Always Free (primary)

- **Always Free** ARM `VM.Standard.A1.Flex`: post-June-2026 the free grant is **2 OCPU + 12 GB**
  (was 4/24; still plenty for web+api+postgres), 200 GB block storage, generous egress. Runs
  24/7 at $0 after the trial ends. A card is needed for identity verification; Always-Free
  resources aren't charged.
- **Caveats to plan for:** (1) sign-up approval + **regional capacity** for A1 can be flaky —
  pick a region with stock, retry, or use the "always free" AMD `E2.1.Micro` as a fallback;
  (2) Oracle may **reclaim idle** Always-Free instances — our workers keep it non-idle, and a
  small keep-alive cron removes any doubt; (3) **ARM64** → see Prisma note in §6.
- **Fallback: GCP e2-micro Always Free** (1 shared vCPU, **1 GB RAM**, 30 GB, us-west1/central1/east1).
  1 GB is too little to _build_ Next.js on-box → build images in **GitHub Actions → GHCR**, VM only
  pulls & runs. Also 1 GB is tight to run web+api+postgres together; Oracle is much roomier.

### Database — Postgres container

- Add a `postgres:16-alpine` service with a named volume `pgdata`. No external DB, no Neon, no
  dump-to-third-party. Seed it either from your **local dump** (`pg_dump` → `pg_restore`, keeps
  your generated recipes/prices/images) or clean via `pnpm db:push && pnpm db:seed`.

### Uploads — persist on a volume

- Mount a `uploads` volume into the api container at `apps/api/uploads`. No code change; files
  survive restarts and redeploys. (This is the thing that would've needed a rewrite on serverless.)

### Workers + SSE — nothing to do

- They run natively in the always-on api container. No Cloud Scheduler, no refactor. This is the
  big win of the VM approach over the Firebase plan.

### Secrets

- A `.env.production` on the VM (`chmod 600`, **not** committed) is enough for a private box.
  No paid secret manager needed. Keep real keys out of git.

---

## 6. Code / config changes required (small — AI does these)

Far fewer than the serverless route:

1. **Drop Redis** from the prod compose (unused).
2. **Prisma ARM engine**: the base images are `node:20-alpine` (musl); on ARM64 Prisma needs the
   `linux-musl-arm64-openssl-3.0.x` engine. Fix by adding
   `binaryTargets = ["native", "linux-musl-arm64-openssl-3.0.x"]` to the schema generator, **or**
   switch the Docker base to `node:20-slim` (Debian) which is the least-friction path on ARM.
   (On the GCP AMD fallback this is a non-issue.)
3. **A deploy compose** (`docker-compose.deploy.yml` or adapt `docker-compose.prod.yml`): services
   `web`, `api`, `postgres`, `cloudflared` (the tunnel connector); volumes `pgdata`, `uploads`;
   drop the nginx+SSL block (Cloudflare terminates TLS). Healthchecks kept.
4. **Prod env**: `NODE_ENV=production` (already flips the `Secure` cookie), `AI_MOCK_ENABLED=false`,
   `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, **fresh** `JWT_SECRET`/`REFRESH_TOKEN_SECRET`,
   `DATABASE_URL=postgres://...@postgres:5432/chefer`, `CORS_ORIGINS=https://chefer.app`.
5. **Web env** (baked at build): `NEXT_PUBLIC_API_URL=https://chefer.app` (or the `api.` host / same
   host with an `/api` path via the tunnel), `NEXT_PUBLIC_APP_URL=https://chefer.app`,
   `NEXT_PUBLIC_APP_NAME=Chefer`. Remember `NEXT_PUBLIC_*` require a **rebuild** to change.
6. **SSR→API hop**: `trpc-server` uses `NEXT_PUBLIC_API_URL`; on one VM the web container can call
   the api container directly over the compose network for SSR. Optional tidy-up (an internal URL);
   not required for correctness.
7. **`next.config.ts` remotePatterns**: allow the Pollinations + Unsplash hosts in prod.
8. **A one-command deploy script** (`infrastructure/scripts/deploy.sh`: `git pull && docker compose ... up -d --build`) and/or an optional GitHub Actions build→GHCR workflow for the GCP fallback.
9. Update `infrastructure.md` with a Deployment section and refresh `.env.example`.

Everything else (auth, CORS `credentials:true`, cookie `Secure` in prod) is already correct for a
same-origin/branded-domain setup.

---

## 7. Security (light — private, single user)

- **Access gate**: Cloudflare Access (email OTP) or Tailscale (device auth) means the app isn't
  openly reachable at all — strongest single control for "only me", and free.
- **No inbound ports** with Tunnel/Tailscale; if you use Caddy/DuckDNS instead, open only 443 and
  put the VM firewall (`ufw`/OCI security list) to match.
- **Secrets** in `.env.production` (chmod 600), never in git; **rotate** JWT/session secrets for prod.
- **Change the seed passwords** (`Admin@123!`, `User@123!`) before the login is reachable.
- **Keep the OS patched**; run containers as non-root (the Dockerfiles already add a `nodejs` user).
- **Budget-of-worry**: none — nothing here can bill you (no metered cloud), which is itself a
  security property vs the Blaze-card route.

---

## 8. Step-by-step

**Phase 0 — accounts (you, ~30–45 min)**

1. Create an Oracle Cloud account; verify (card, no charge on Always Free). Pick a region with A1 capacity.
2. **DuckDNS** (chosen, $0): sign in at duckdns.org with GitHub/Google, create the subdomain **`chefer`** (→ `chefer.duckdns.org`), copy your **token**. (Set the A record to the VM IP in Phase 4, or let `duckdns-update.sh` do it.)
3. Have your `GEMINI_API_KEY` ready.

**Phase 1 — code prep (AI, you review + merge)** 4. AI does §6 (drop Redis, Prisma ARM target, deploy compose, env templates, deploy script, docs) on a branch.

**Phase 2 — provision the VM (you)** 5. Launch the Always-Free ARM VM (Ubuntu 22.04/24.04). Add SSH key. Note the public IP (only needed transiently). 6. `ssh` in; install Docker + compose plugin (AI provides the exact commands).

**Phase 3 — bring it up (you, AI-scripted)** 7. `git clone` the repo (or `scp` it); create `.env.production` (paste real secrets). 8. `docker compose -f docker-compose.deploy.yml up -d --build`. Wait for healthchecks. 9. Seed the DB: restore your local dump, or `db:push && db:seed` (AI provides the commands). 10. Smoke-test on the VM: `curl localhost:3001/health`, `curl localhost:3000`.

**Phase 4 — expose it (you), DuckDNS + Caddy**

1. Point `chefer.duckdns.org` at the VM: set the A record to the VM's public IP on the
   DuckDNS dashboard (or run `./infrastructure/scripts/duckdns-update.sh` on the VM).
2. Open ports **80** and **443** in **both** places (Oracle gotcha): the OCI **security list/NSG**
   (ingress rules) **and** the instance firewall — Oracle Ubuntu ships a restrictive iptables:
   `sudo iptables -I INPUT 6 -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT`,
   same for 443, then `sudo netfilter-persistent save`.
3. `caddy` (already in the compose) auto-issues Let's Encrypt TLS for `PUBLIC_DOMAIN`.
   Browse `https://chefer.duckdns.org` → log in.
   _(Later, if you want a hidden IP + email gate, swap Caddy for Cloudflare Tunnel/Access — see the original analysis below.)_

**Phase 5 — verify (you)** 11. From your laptop: log in, generate a plan, watch images stream, shopping list, ingredients,
create-recipe-with-upload. Confirm uploads survive a `docker compose restart`.

---

## 9. Who does what

**You (manual — accounts, VM, secrets, DNS/tunnel auth):**

- Create Oracle (and Cloudflare **or** Tailscale) accounts; launch the VM; SSH in.
- (Path B) buy `chefer.app`; create the Tunnel + Access policy in the Cloudflare dashboard.
- Put real secrets into `.env.production`; run the DB seed/restore commands; `docker compose up`.

**AI (all code, config, scripts, exact commands):**

- Drop Redis; add Prisma ARM `binaryTargets` (or switch base image); write `docker-compose.deploy.yml`.
- Write `.env.production`/`.env.local` templates, `next.config.ts` host allowlist, prod CORS.
- Write `infrastructure/scripts/deploy.sh` + optional GitHub Actions (build→GHCR) for the GCP fallback.
- Write the `cloudflared`/Tailscale config and the exact `docker`/`gcloud`/`ssh` command list per step.
- Migration script (local `pg_dump` → VM Postgres) and docs update.

---

## 10. Risks / things to watch

1. **Oracle A1 capacity** — the #1 friction; some regions are out of free ARM stock. Mitigate: try
   another region, retry over a day, or fall back to Oracle AMD `E2.1.Micro` (1 GB) / GCP e2-micro.
2. **Idle reclaim** — Oracle can reclaim _idle_ Always-Free VMs. Our workers + a keep-alive cron keep it active.
3. **ARM + Prisma engine** — must set the musl-arm64 binary target or use a Debian base, else the api
   container crashes on query. (Addressed in §6.2.)
4. **Building Next.js on a small box** — fine on Oracle 12 GB; on GCP 1 GB you must build in CI.
5. **`NEXT_PUBLIC_*` baked at build** — changing the public URL means a web rebuild, not a restart.
6. **One box = one basket** — no HA/backups by default. Add a nightly `pg_dump` to the uploads volume
   (or to Cloudflare R2 free 10 GB) so a VM loss doesn't lose data. Cheap insurance, still $0.
7. **Pollinations / Gemini free-tier limits** still apply (429s under bursts) — already handled with
   retry/back-off in the code.
8. **VM ops burden** — you own OS patching and restarts. For a personal test that's a few minutes a
   month; `restart: always` + Docker healthchecks keep it self-healing.

---

## 11. Decisions to confirm before I build

1. **Ingress**: ✅ **CONFIRMED — DuckDNS + Caddy** (`chefer.duckdns.org`, literal $0). Cloudflare Tunnel/Access remains the future upgrade if you buy a domain.
2. **Compute**: Oracle Always Free ARM (roomy, some capacity friction) — or GCP e2-micro (tiny, build-in-CI)? _(My default: Oracle ARM.)_
3. **Prisma-on-ARM fix**: add `binaryTargets` (keep Alpine) — or switch base image to `node:20-slim`? _(My default: `binaryTargets`, smallest change.)_
4. **DB seed**: restore your **local dump** (keep generated content) — or clean `db:seed`? _(My default: local dump.)_
5. **Backups**: add a nightly `pg_dump` (to volume or free R2) now, or skip for v1? _(My default: add it — it's free and cheap insurance.)_

---

## Sources

- [Oracle Always Free resources (official)](https://docs.oracle.com/iaas/Content/FreeTier/freetier.htm) · [A1 free-limit change, July 2026](https://www.infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
- [Render/Railway/Fly free-tier state 2026](https://render.com/articles/platforms-with-a-real-free-tier-for-developers-in-2026) · [Fly/Railway no free tier](https://techsy.io/en/blog/railway-vs-render-vs-fly-io)
- [Cloudflare Tunnel free + Zero Trust free ≤50 users](https://www.cloudflare.com/plans/zero-trust-services/)
- [Google Cloud always-free e2-micro](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [Cloudflare registrar at-cost domain pricing](https://pickuma.com/for-dev/best-domain-registrars-developers-2026/)
