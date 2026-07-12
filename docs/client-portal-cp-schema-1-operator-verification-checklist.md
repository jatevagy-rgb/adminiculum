# Client Portal CP-SCHEMA-1 Operator Verification Checklist

## Purpose

This is a documentation-only operator checklist for future CP-SCHEMA-1 evidence
gathering.

No database command is run by this task. The snippets below are illustrative
metadata checks for a separately approved operator run only.

## Why this is needed

- The CP-SCHEMA-1 collision strategy found a legacy ClientPortal candidate block
  in `schema.prisma`.
- The existing migration `20260702140000_add_client_portal_foundation` may have
  created legacy tables/enums in some environments.
- Production `_prisma_migrations` divergence is known from prior baseline work.
- Before any schema patch, an operator must verify the environment state so a
  replacement, normalization, or quarantine strategy does not hide real data or
  migration history.

## Verification environments

- Local development database, only if intentionally selected and non-sensitive.
- Empty DB rehearsal environment.
- Production-like clone DB rehearsal.
- Production metadata check, only when separately approved.

## What to verify

- Whether legacy ClientPortal tables exist.
- Whether legacy ClientPortal tables are empty.
- Whether `_prisma_migrations` records `20260702140000_add_client_portal_foundation`.
- Whether table names collide with final planned CP-SCHEMA-1 names.
- Whether ClientPortal-related enum types exist in the DB.
- Whether any business data exists in legacy tables.
- Whether any app code references legacy tables.
- Whether rollback, rename, replacement, or normalization would be safe.

## Suggested SQL / commands

Do not run these now. Run only against a clone or separately approved metadata
context. Do not export business data; record metadata and row counts only.

List ClientPortal-like tables:

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name LIKE 'client_portal%'
    OR table_name LIKE 'client_visible%'
    OR table_name LIKE 'client_submission%'
  )
ORDER BY table_name;
```

Count rows in known legacy tables:

```sql
SELECT 'client_portal_users' AS table_name, COUNT(*)::bigint AS row_count FROM client_portal_users
UNION ALL
SELECT 'client_portal_memberships', COUNT(*)::bigint FROM client_portal_memberships
UNION ALL
SELECT 'client_visible_artifacts', COUNT(*)::bigint FROM client_visible_artifacts
UNION ALL
SELECT 'client_portal_grants', COUNT(*)::bigint FROM client_portal_grants
UNION ALL
SELECT 'client_submissions', COUNT(*)::bigint FROM client_submissions
UNION ALL
SELECT 'client_submission_attachments', COUNT(*)::bigint FROM client_submission_attachments
UNION ALL
SELECT 'client_portal_audit_events', COUNT(*)::bigint FROM client_portal_audit_events;
```

Inspect migration history metadata:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE migration_name ILIKE '%client_portal%'
   OR migration_name = '20260702140000_add_client_portal_foundation'
ORDER BY started_at;
```

Inspect ClientPortal-like enum types:

```sql
SELECT t.typname AS enum_name, e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND (
    t.typname ILIKE '%clientportal%'
    OR t.typname ILIKE '%clientvisible%'
    OR t.typname ILIKE '%clientsubmission%'
  )
ORDER BY t.typname, e.enumsortorder;
```

## Expected outputs to record

- Environment name.
- Timestamp.
- Operator.
- Connection target confirmation.
- Tables present.
- Row counts only.
- Migration records.
- Enum records.
- Any errors or permission blockers.
- Conclusion.
- Recommendation.

## Decision after verification

If legacy tables are absent:

- Replacement may be simpler, but still requires schema patch review, migration
  generation, and clone rehearsal.

If legacy tables are present but empty:

- Normalize/replace with a careful additive/rename/drop strategy only after
  human approval and clone proof.

If legacy tables contain data:

- CP-SCHEMA-1 remains blocked pending data classification, ownership decision,
  retention review, and a migration/backfill plan.

## Final statement

This checklist does not authorize DB access, schema changes, migration creation,
migration apply, production apply, or Client Portal runtime enablement.
