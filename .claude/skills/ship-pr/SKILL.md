---
name: ship-pr
description: Nowoll's approval workflow for getting a finished step into main — plan approval, live check, secret scan, push, pull request, waiting for CI, merge, syncing main. Use when Rafi says "push and open the PR", "merge that PR", or approves a plan; and before any push, PR or merge.
---

# Ship a step (plan → build → PR → merge)

Rafi approves each stage explicitly. **Never** push, open a PR or merge without his words for it — an
earlier approval doesn't carry over to the next stage or the next step.

| Stage | Needs Rafi's words |
|---|---|
| Build a step | "approved" (on a written plan with numbered decisions + a recommendation) |
| Push + open the PR | "push and open the PR" (after his live check, if the change is customer-visible) |
| Merge | "merge that PR" — **and** every CI check green |

## Before pushing

1. `git status --short` is clean (everything meant to ship is committed, nothing stray).
2. **Secret scan** of everything the branch adds:
   ```bash
   git diff main..HEAD | grep -nE '^\+' | grep -iE '(re_[A-Za-z0-9]{12,}|eyJ[A-Za-z0-9_-]{20,}|sk_live|-----BEGIN|AKIA[0-9A-Z]{12}|ghp_|github_pat_|[0-9a-f]{64})' || echo "no secrets"
   ```
   Explain every hit (e.g. a dummy build-only `DATABASE_URL`) or remove it. `.env` files are never committed
   (CLAUDE.md Rule 3).
3. Branch is `feature/<name>`, `fix/<name>` or `docs/<name>` — never `main` (Rule 8). If main moved and
   files overlap, rebase on `origin/main`, resolve (usually "keep both sides"), and **re-run verify-step**.

## Push + PR

```bash
git push -u origin <branch>
gh pr create --base main --head <branch> --title "<the commit's title>" --body "<body>"
```

PR body: **What** (bullets), **Verified** (the real results, numbers included), anything not done and why.
End it with the attribution lines from the session's system reminder. Then wait for CI in the background
and report it as a table:

```bash
until [ -n "$(gh pr checks N 2>/dev/null)" ] && ! gh pr checks N | grep -qE 'pending|queued|in_progress'; do sleep 20; done
gh pr checks N
```

A red check: read its log (`gh run view <run> --log-failed`), find the real cause (a cancelled job in a
matrix usually means a *sibling* failed), fix, push, wait again. Never merge red.

## Merge

Only on "merge that PR", with every check green:

```bash
gh pr merge N --squash --delete-branch
git checkout main && git pull --ff-only
```

Several open PRs touching the same files: merge one, rebase the next on main, re-verify, push, wait for
green, then ask again.

## After merging

- Tell Rafi what's now in main, and what HE needs to do, e.g. "Database tasks → migrate" (if a migration
  shipped) then `preview.sh build` + `up` for the $0 trial, or nothing.
- Save any new lesson to memory (what went wrong, why, how to avoid it).
