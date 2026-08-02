# Implementation Plan — One-Button Deploys via GitHub Actions

Status: **implemented** (awaiting your one-time GitHub secrets/variables setup — see §5) · Goal: replace "SSH in → `git pull` → build on the VM
(15–40 min)" with **one button** (or one command) and a **much faster** deploy.

---

## 1. Why the current deploy is slow

The VM is an Oracle `E2.1.Micro`: **1 OCPU / 1 GB RAM** (+4 GB swap). It builds _both_ images,
and `next build` on that box swaps heavily — that's essentially all of the 15–40 minutes.
A GitHub-hosted runner is **4 vCPU / 16 GB**. Same x86_64 architecture as the VM, so images
built in CI run as-is — no cross-compilation needed.

**Fix: build in CI, let the VM only pull.** The VM stops compiling entirely; it just downloads
~150–300 MB and restarts containers.

|                                     | today                      | after                                                      |
| ----------------------------------- | -------------------------- | ---------------------------------------------------------- |
| Where images build                  | on the 1 GB VM             | GitHub runner (4 vCPU / 16 GB)                             |
| Cold build                          | 15–40 min                  | ~4–6 min                                                   |
| Incremental build (layer cache hit) | same 15–40 min             | **~1–3 min**                                               |
| VM work                             | full build, swap thrashing | `pull` + restart ≈ 1–2 min                                 |
| Trigger                             | manual SSH + script        | **button in GitHub UI** / `gh workflow run` / auto on push |

---

## 2. What already exists (and why it never ran)

`.github/workflows/deploy.yml` is scaffolding from the original template:

- It triggers on **`main`** — this repo's branch is **`master`**, so **it has never run**.
- Its build-and-push-to-GHCR steps are decent bones (buildx + metadata + GHCR login).
- Its "Deploy to server" step is a **placeholder that only `echo`s**.
- It has a `migrate` job running `pnpm db:migrate:prod` **from the runner** — that cannot work:
  our Postgres is container-internal and not exposed to the internet. (Our compose `migrate`
  service already handles this correctly on the VM.)

→ Rewrite `deploy.yml`; keep `ci.yml` (lint/typecheck) as-is.

---

## 3. Proposed design

```
  you click "Run workflow"  (or push to master)
            │
            ▼
  ┌─────────────────────────────────────────┐
  │ Job 1 & 2 (parallel): build api + web   │  GitHub runner, buildx + GHA layer cache
  │   push → ghcr.io/danvladpop/chefer-api  │  tags: latest + sha-<short>
  │                        chefer-web       │
  └───────────────────┬─────────────────────┘
                      ▼
  ┌─────────────────────────────────────────┐
  │ Job 3: deploy (SSH to the VM)           │
  │   git pull        (compose/Caddyfile)   │
  │   docker compose pull                   │
  │   docker compose up -d --no-build       │  ← migrate service runs, then api, then web
  │   docker image prune -f                 │
  └───────────────────┬─────────────────────┘
                      ▼
  ┌─────────────────────────────────────────┐
  │ Job 4: verify — poll /api/health        │  fails the run if the site isn't healthy
  └─────────────────────────────────────────┘
```

### Key decisions

1. **Registry: GHCR, public images.** The repo is public, so the packages can be public too →
   **no `docker login` on the VM**, no PAT to manage. (If we keep them private instead, the VM
   needs a one-time `docker login ghcr.io` with a `read:packages` PAT.)
2. **VM is updated over SSH** from the Action (`appleboy/ssh-action`), using a **dedicated deploy
   keypair** — not your Oracle console key. Port 22 is already open.
3. **Migrations stay on the VM** via the existing one-shot `migrate` compose service (it has
   private-network access to Postgres). Delete the broken CI migration job.
4. **Secrets never enter CI.** `.env.production` stays on the VM. CI only needs the SSH key/host.
   The `NEXT_PUBLIC_*` values are baked at build time but are **public URLs**, so they live as
   GitHub _Variables_, not secrets.
5. **Rollback built in.** Every image is tagged `sha-<short>` as well as `latest`. The workflow
   takes an optional `tag` input, so redeploying a known-good build is: run workflow → enter
   `sha-abc1234`.

---

## 4. Changes required

### 4a. `docker-compose.deploy.yml`

- Point services at GHCR: `image: ghcr.io/danvladpop/chefer-api:${TAG:-latest}` (same for web,
  and the `migrate` service reuses the api image).
- Keep the `build:` blocks as an **emergency local fallback**; the deploy path uses
  `pull` + `up -d --no-build` so it never builds on the VM.

### 4b. `.github/workflows/deploy.yml` (rewrite)

- Triggers: `workflow_dispatch` (the button, with optional `tag` input) **+** `push: [master]`
  with `paths-ignore` for `**.md` / `docs/**` so doc edits don't trigger deploys.
- `concurrency: cancel-in-progress: false` (never interrupt a live deploy).
- Two parallel build jobs (api, web) using `docker/build-push-action` with
  `cache-from/to: type=gha` for fast incremental builds.
- Web build receives `NEXT_PUBLIC_*` build args from repo Variables.
- Deploy job: SSH → `git pull --ff-only` → `docker compose pull` → `up -d --no-build` → prune.
- Verify job: poll `https://chefer.duckdns.org/api/health` (retry ~10×5 s), fail if unhealthy.

### 4c. `infrastructure/scripts/deploy.sh`

Repurpose as the **pull-based** deploy (what CI runs, and what you can still run by hand):
`git pull` → `docker compose pull` → `up -d --no-build` → prune. Add
`deploy-local-build.sh` (or a `--build` flag) preserving today's build-on-VM behaviour as fallback.

### 4d. Docs

`infrastructure.md` §13 (CI/CD) + `docs/plan-deployment.md` updated to describe the new flow.

---

## 5. Manual steps you'll do once (~10 min)

1. **Create a deploy keypair** (on your PC):
   `ssh-keygen -t ed25519 -f chefer_deploy -N '""'`
2. **Authorise it on the VM**: append `chefer_deploy.pub` to `~/.ssh/authorized_keys`.
3. **Add GitHub secrets** (repo → Settings → Secrets and variables → Actions → _Secrets_):
   - `DEPLOY_HOST` = `129.159.9.54`
   - `DEPLOY_USER` = `ubuntu`
   - `DEPLOY_SSH_KEY` = contents of the **private** `chefer_deploy` file
4. **Add GitHub variables** (same page → _Variables_):
   - `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_APP_URL` = `https://chefer.duckdns.org`
   - `NEXT_PUBLIC_APP_NAME` = `Chefer`
   - `DEPLOYMENT_URL` = `https://chefer.duckdns.org`
5. **After the first successful run**, set the two GHCR packages to **Public**
   (GitHub → your profile → Packages → `chefer-api` / `chefer-web` → Package settings → Change
   visibility). Otherwise do a one-time `docker login ghcr.io` on the VM with a `read:packages` PAT.

Everything else (workflow, compose, scripts, docs) is AI work.

---

## 6. After this, deploying is

- **Button:** GitHub → Actions → _Deploy_ → **Run workflow**.
- **Command:** `gh workflow run deploy.yml` (from your PC, no SSH).
- **Automatic:** any push to `master` that touches code.

Rollback: _Run workflow_ → `tag = sha-<previous>`.

---

## 7. Extra speed levers (optional, can add later)

| Lever                                                              | Gain                                    | Cost             |
| ------------------------------------------------------------------ | --------------------------------------- | ---------------- |
| GHA layer cache (**included**)                                     | biggest — incremental builds 1–3 min    | none             |
| Parallel api/web jobs (**included**)                               | wall-clock = slowest image, not the sum | none             |
| `paths-filter`: skip rebuilding an unchanged image                 | ~half the time on one-sided changes     | small complexity |
| Slim the web runtime image                                         | faster VM pull                          | minor            |
| Pre-pull images before switching (`pull` then `up`) (**included**) | shorter downtime                        | none             |

Realistic post-change timings: **cold ~5–8 min end-to-end**, **typical (cache hit) ~3–4 min**,
of which the VM is busy only ~1–2 min.

---

## 8. Risks / notes

1. **Downtime**: `up -d` recreates containers → ~10–30 s blip. Fine for a private app (zero-downtime
   would need two replicas + a proxy switch — not worth it here).
2. **SSH exposure**: port 22 is open to the internet and GitHub runners have dynamic IPs, so it can't
   be IP-restricted. Mitigation: dedicated key, and optionally restrict that key to a single command
   via `authorized_keys` `command=`. (Tailscale would remove the exposure entirely — bigger change.)
3. **Disk growth** on the VM from old images → `docker image prune -f` runs every deploy.
4. **`NEXT_PUBLIC_*` drift**: these are baked into the web image in CI; if the public URL ever
   changes you must update the GitHub Variables (changing `.env.production` alone won't do it).
   Documented in the workflow.
5. **First run** must complete before you can set package visibility (the packages don't exist yet).
