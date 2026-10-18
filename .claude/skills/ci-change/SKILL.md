---
name: ci-change
description: Rules and tests for changing Nowoll's GitHub Actions workflows (.github/workflows/) and the shell scripts they run — CI, Docker check, Deploy to staging, Promote to production, Database tasks. Use before editing or adding any workflow or CI shell script.
---

# Change a GitHub Actions workflow

| Workflow | What it does |
|---|---|
| `ci.yml` | every PR + main: format, types, lint, tests, migration drift, browser tests |
| `docker-build.yml` | PRs touching Docker/infra: builds the 5 images, compose, shellcheck, `nginx -t` |
| `deploy.yml` | after CI on main: build all images → `deploy-to.yml` (staging). Off until `DEPLOY_ENABLED=true` |
| `promote.yml` | the one-click production deploy (reuses the images; an older commit = rollback) |
| `deploy-to.yml` | the shared deploy steps: migrations, upload, `deploy.sh`, outside health check |
| `db-tasks.yml` | buttons: migrate, seed, grant/revoke admin, reset 2FA (production DB changes only from CI) |

## Rules

- **Inputs and secrets go through `env:`**, never `${{ … }}` inside a `run:` script (script injection).
- Third-party actions: only the ones already used (`actions/checkout`, `actions/setup-node`,
  `pnpm/action-setup`, `actions/upload-artifact`). Docker work uses the `docker` CLI directly.
- Secrets are never echoed; mask user input that appears in logs (`echo "::add-mask::$EMAIL"`).
- Matrix jobs: `fail-fast: false` where each item should report its own result.
- Repository variables vs secrets: public values (domains, Supabase URL + anon key) are **variables**;
  database URLs and keys are **secrets**. Document every new one in `docs/deployment.md` (and
  `docs/preview.md` if the trial needs it).
- Pin image versions (e.g. `cloudflare/cloudflared:2026.9.3`, `nginx:1.27.5-alpine`), a release at least two
  weeks old.

## Test before pushing

1. **Lint:** `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -no-color` (it also runs
   shellcheck on every `run:` block), and
   `docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:v0.10.0 <scripts>` for `.sh` files.
2. **Run the new steps' commands from a clean copy of git** (`git archive HEAD | tar -x -C $D/clean`), exactly
   as the workflow does — a fresh checkout has no `packages/*/dist`, no `.env`, no `node_modules`.
   (Database tasks once failed on GitHub with ERR_MODULE_NOT_FOUND because the shared packages weren't built;
   locally they were.) Reproduce the failure first when fixing one, then show the fix passes.
3. Relative paths in a workflow resolve differently than you think (compose's `env_file` resolves against
   the compose file's folder) — use `"$PWD/…"`.
4. Workflows that can't run without Rafi's accounts (VPS, ghcr.io pushes): test the scripts they call
   locally (registry stand-in, see the docker-change skill) and say in the PR what is still untested.

## After merging a workflow

`workflow_run` and `workflow_dispatch` workflows only take effect from `main`: tell Rafi to run a button
from `main` **after** the merge (running it before the merge uses the old version).
