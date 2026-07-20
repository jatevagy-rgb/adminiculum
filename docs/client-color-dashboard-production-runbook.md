# Client Color and Dashboard Production Runbook

> **NOT AUTHORIZED IN THIS TICKET.** Every apply, deploy, restart, or production-write command below requires a separate explicit production approval.

## Approved candidate identity

- Release runtime commit: `7544fefa95a93ea478829b9a02f23481727ebb91` plus this release-audit documentation commit.
- Migration: `20260719120000_add_client_color_key`.
- SQL SHA-256: `F76F8BF8A1AA6A4289CE13F03F68F1423417741CEC9C4E421F7914D9C1C1978C`.
- Expected pre-apply migration head: `20260718120000_add_task_submission_workflow`.
- Current production runtime source before this release: `4647c080f7c070713ff9ec1f82e4140e3f622c77`.
- Current backend deployment before this release: `be17637b-5431-4de6-a96a-98fe8ada884a`.
- Current frontend deployment before this release: `2af5724d-277b-49ad-997d-80f557a36aff`.

## Preconditions

1. Confirm a separate human production approval names this exact migration and release branch commit.
2. Confirm PostgreSQL target identity is the production `adminiculum` database and no clone/staging URL is mixed into the session.
3. Confirm server state Ready and current PITR/backup retention is available. Because geo-backup and HA are disabled, record the latest restorable point and operator acceptance before write access.
4. Run SELECT-only checks for active failed `_prisma_migrations`, current finished head, `ClientColorKey`, and `clients.colorKey`.
5. Require head `20260718120000_add_task_submission_workflow`, zero active failed rows, and absence of both candidate objects. Stop on any difference.
6. Recompute the SQL SHA-256 and require exact equality with the value above.
7. Verify backend and frontend artifacts were built from the approved release commit, with no package, lockfile, environment, auth, CORS, Azure, Calendar, Outlook/Graph, Client Portal, AI/n8n, editor, or clause-library drift.

## Apply mechanism

The repository's historical chain must not be replayed with blanket `prisma migrate deploy`. Use the same reviewed one-shot Node/`pg` mechanism proven for the TaskSubmission production migration: connect with an operator-supplied production `DATABASE_URL`, start a transaction, execute only the exact candidate SQL, insert one successful `_prisma_migrations` record with the exact SQL checksum, and commit. Do not use `prisma migrate dev`, `prisma db push`, or `prisma migrate resolve`.

> **NOT AUTHORIZED IN THIS TICKET — command preview only**

```powershell
$migration = 'Backend/prisma/migrations/20260719120000_add_client_color_key/migration.sql'
(Get-FileHash -Algorithm SHA256 $migration).Hash
# Require F76F8BF8A1AA6A4289CE13F03F68F1423417741CEC9C4E421F7914D9C1C1978C
# Run the approved one-shot Node/pg operator script with production DATABASE_URL.
# The script must execute only $migration and record migration_name
# 20260719120000_add_client_color_key in the same transaction.
```

The operator script and its output must not print the connection string, password, access token, or business data.

## Immediate schema proof

Run SELECT-only metadata checks and record sanitized results:

- candidate `_prisma_migrations` row exists, finished, not rolled back;
- `ClientColorKey` exists with exactly ten approved labels in order;
- `clients.colorKey` exists, is nullable, has no default, and uses the enum;
- legacy `clients.color` still exists and was not changed;
- no active failed migration row;
- no blocked/non-granted lock remains.

Stop before deployment if any proof fails.

## Backend deployment

> **NOT AUTHORIZED IN THIS TICKET.** Deploy the backend artifact only after schema proof.

Required smoke:

- `/health` returns 200;
- unauthenticated protected routes remain 401;
- authenticated client list/detail returns bounded nullable `colorKey` and omits legacy `color`;
- invalid color returns 400; null is accepted;
- Cases, Tasks, Dashboard, Communications, and Review return safe relation-backed color;
- Notifications return null color;
- task lifecycle submit/review behavior remains unchanged;
- no 500 on basic routes.

If backend smoke fails, restore the previous backend artifact. Keep the additive enum/column.

## Frontend deployment

> **NOT AUTHORIZED IN THIS TICKET.** Deploy the frontend only after backend smoke passes.

Require production public environment injection and `verify:prod-env`. After deployment:

- Clients select/save/change/clear works;
- Cases and Tasks inherit the current client color;
- Dashboard title appears once, resume is truthful, terminal work is excluded, groups/calendar/communications remain present;
- Communications assigned rows are colored and unassigned rows neutral;
- Review queue/detail color is separate from urgency and lifecycle;
- Notifications remain neutral;
- 1366×768 and 1440×900 have no horizontal overflow or broken layout;
- browser console/network has no localhost target, CORS error, failed fetch, or runtime exception.

## Completion record

Record migration timestamp, exact release commit, backend/frontend deployment IDs, schema proof, authenticated smoke results, rollback decision, and final classification. Client color deployment does not authorize any later removal of legacy `Client.color`.
