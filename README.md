# nowoll
Nowoll — always new | E-commerce clothing store (Bangladesh)

## CI (GitHub Actions)

Every pull request to `main` (and every push to `main`) runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — two jobs side by side:

| Job | What it checks |
|---|---|
| **Checks** | Prettier formatting · migrations apply to an empty database · `schema.prisma` has no change without a migration (drift check) · typecheck · lint · all unit + API tests |
| **Browser tests** | the Playwright tests in [`tests/e2e`](tests/e2e/README.md) against the real API + storefront |

- **Green ✓ on the PR = safe to merge.** The repo is private on GitHub's free plan, so GitHub can't block a red merge — the rule is simply: never merge a PR whose checks failed.
- **A red ✗:** open the PR's *Checks* tab → the failed step shows the error. For browser tests, download **playwright-report** from the run's *Artifacts* and open `index.html` — each failing test has a screenshot and a step-by-step trace.
- No secrets are stored in GitHub: all tests run on dummy values and a throwaway database.

The same checks locally: `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`.
