# Client Color Dashboard Production Migration Execution

Date: 2026-07-20

Runtime source: `30fd4bb8f1f3e3e46edb944501a69f7f6c81779b`

Migration: `20260719120000_add_client_color_key`

## Authorization and target

- Production server: `adminiculum.postgres.database.azure.com`.
- Database: `adminiculum`.
- Resource group: `Adminiculum-RG`.
- PostgreSQL runtime version: `15.18`.
- Pre-apply migration head: `20260718120000_add_task_submission_workflow`.
- Candidate objects and candidate migration record were absent before execution.

## Recovery gate

- Server state: Ready.
- Region: Austria East.
- Backup retention: 7 days.
- Latest full backup observed: `2026-07-20T00:56:26.603109Z`.
- Earliest restore point observed: `2026-07-14T00:54:47.016975Z`.
- Immediate pre-migration recovery marker: `2026-07-20T11:22:01.199404Z`.
- Azure supports point-in-time restore to a new Flexible Server.

## SQL identity and audit

- File: `Backend/prisma/migrations/20260719120000_add_client_color_key/migration.sql`.
- SHA-256: `F76F8BF8A1AA6A4289CE13F03F68F1423417741CEC9C4E421F7914D9C1C1978C`.
- Size: 223 bytes; 6 lines; 2 statements.
- Approved statements: create `ClientColorKey`; add nullable `clients.colorKey`.
- Destructive statements: 0.
- No default, backfill, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, unrelated DDL, or legacy `clients.color` mutation.

## One-shot execution

- Method: operator-only one-shot Node PostgreSQL TLS/SCRAM executor outside the repository.
- The executor had hard server/database, migration-head, checksum, object-absence, failed-migration, transaction, and lock guards.
- It executed only the reviewed SQL in one transaction and stopped on first error.
- SQL start: `2026-07-20T11:22:14.497Z`.
- SQL end: `2026-07-20T11:22:14.547Z`.
- Duration: 50 ms.
- Attempts: 1.
- Result: committed successfully.

## Migration history

Physical enum and column proof completed before the migration history write. A separate truthful transaction then inserted exactly one finished `_prisma_migrations` record with the lower-case reviewed checksum and `applied_steps_count = 1`.

No `prisma migrate deploy`, `prisma migrate dev`, `prisma db push`, historical replay, seed, or unrelated production write was used.
