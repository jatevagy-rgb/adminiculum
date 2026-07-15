# Release Readiness Go / No-Go Checklist

Date: 2026-07-15
Current HEAD: `6800b13`
Final readiness: `NO_GO_DEPLOYMENT_BASELINE_UNKNOWN`

| Gate | Status | Evidence | Required action |
|---|---|---|---|
| Code branch | PASS_WITH_KNOWN_RISK | Branch `hotfix/runtime-shape-20260308`, HEAD `6800b13`; pre-existing untracked operational artifacts untouched | Stage docs explicitly only. |
| Last deployed baseline | BLOCKED | Backend/frontend baselines have medium-confidence evidence but no authoritative repo deployment ledger | Prove active App Service deployments. |
| Diff classification | PASS_WITH_KNOWN_RISK | Broad diff classified in readiness docs | Create narrower release branch before deploy. |
| Backend validation | PASS | `npx.cmd prisma validate`, `npx.cmd tsc --noEmit`, `npm.cmd test -- --runInBand` (53 suites / 549 tests), and `npm.cmd run build` passed. | Console noise in negative-path tests observed but tests passed. |
| Frontend validation | PASS_WITH_KNOWN_RISK | `npx.cmd tsc --noEmit` passed; `npm.cmd run build` passed with known `<img>` warning; `npm.cmd audit --json` reported 4 moderate advisories. | Security acceptance still required. |
| Security audit | BLOCKED | Frontend 4 moderate; backend 1 critical/7 high/9 moderate/2 low from `npm audit` | Security acceptance/remediation required. |
| Data/migrations | BLOCKED | Prisma schema changed and CP-SCHEMA-1 migration file present | Exclude or separately approve/prove migration. |
| Configuration | UNKNOWN | Production values not read/changed by task | Operator must confirm before deploy. |
| Feature flags | PASS_WITH_KNOWN_RISK | Flags audited; no changes authorized | Confirm prod values before deploy. |
| Product boundaries | PASS_WITH_KNOWN_RISK | Client Portal parked; Mode C editor; Outlook off; AI/n8n not introduced | Smoke guards post-deploy if later approved. |
| Build artifact | BLOCKED | Clean `NEXT_PUBLIC_BACKEND_BASE_URL=https://prod-env-verify.invalid` build passed `npm run verify:prod-env`, but broader scan found `http://localhost:3000` MSAL redirect values in 7 `.next` files from `.env.local`. | Build deploy artifact only with full production public auth env injected; repeat scan. |

## No-go reasons

1. Last deployed baseline cannot be proven authoritatively from repo state.
2. Candidate branch contains protected schema/migration files and CP-SCHEMA-1 remains blocked.
3. Candidate branch contains package changes and current audit advisories requiring acceptance/remediation.
4. Release is too broad for a simple editor/ops/workflow deploy without explicit approval.
5. Process-only backend-base build is insufficient for a clean production artifact because `.env.local` can still bake local MSAL redirect URIs.

## Approval items before deployment

- Prove active frontend/backend deploy commits and deployment IDs.
- Decide whether to create a narrow release branch excluding blocked schema/migration/portal work.
- Obtain security sign-off for npm audit findings or remediate separately.
- Confirm production feature-flag and auth env values without changing them in this task.
- Approve a post-deploy smoke operator and rollback owner.
