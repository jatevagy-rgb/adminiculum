# Client Color Production Migration Audit

## Candidate

- Migration: `20260719120000_add_client_color_key`.
- File: `Backend/prisma/migrations/20260719120000_add_client_color_key/migration.sql`.
- SHA-256: `F76F8BF8A1AA6A4289CE13F03F68F1423417741CEC9C4E421F7914D9C1C1978C`.
- Production apply performed in this ticket: no.

## Exact SQL effect

1. Create enum `ClientColorKey` with `RED`, `ORANGE`, `AMBER`, `GREEN`, `TEAL`, `BLUE`, `INDIGO`, `PURPLE`, `ROSE`, and `SLATE`.
2. Add nullable `clients.colorKey` of type `ClientColorKey`.

The file contains no explicit transaction wrapper; the later one-shot operator must execute and record the exact reviewed file atomically using the proven operational mechanism.

## Additive safety

| Check | Result |
| --- | --- |
| Enum count | 1 |
| Added column count | 1 |
| Nullable | yes |
| Default | none |
| Backfill / `UPDATE` | none |
| `DELETE` | none |
| `DROP` | none |
| `TRUNCATE` | none |
| Existing-data conversion | none |
| Unrelated DDL | none |
| Destructive statement count | 0 |

Existing rows remain valid with `colorKey = null`; arbitrary legacy `Client.color` values are neither parsed nor copied.

## PostgreSQL behavior

Adding a nullable column without a default is a catalog/metadata operation and is not expected to rewrite the clients table. PostgreSQL still takes a brief table lock while applying the `ALTER TABLE`; the runbook therefore requires a quiet window, active-session/lock check, and immediate post-apply proof.

## Read-only production metadata

Sanitized metadata was obtained through the existing authorized backend/Kudu network path using SELECT-only PostgreSQL metadata queries. No business rows or client names were queried.

- Database: `adminiculum` on PostgreSQL 15.18.
- Current migration head: `20260718120000_add_task_submission_workflow`.
- Active failed migration rows: 0.
- Candidate migration recorded: no.
- `ClientColorKey` exists: no.
- `clients.colorKey` exists: no.
- Naming collision: none detected.
- Approximate clients table footprint: 32 KiB; row estimate was not analyzed (`-1`).
- Non-granted locks: 0 at observation time.
- Server backup retention: 7 days; server state was Ready. Geo-backup and HA were disabled, so PITR verification is a mandatory operator precondition rather than an assumption.

## Compatibility and rollback posture

The new schema is backward-compatible with the old backend and frontend. The new backend is not compatible with the old schema because its safe selects reference `colorKey`. Normal rollback must keep the additive enum and column; it must not drop them or erase saved client selections.

## Independent conclusion

The exact SQL is production-compatible and additive, but execution is not authorized here. Production use is conditional on checksum equality, exact current-head proof, backup/PITR confirmation, one-shot execution of this file only, and backend-before-frontend smoke sequencing.
