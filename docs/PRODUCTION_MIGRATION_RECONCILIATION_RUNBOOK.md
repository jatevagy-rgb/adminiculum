# Database Migration Reconciliation

This document records Adminiculum RC1A migration-history reconciliation.
RC1A changes local repository history only. It does not authorize or perform
database migration, schema deployment, backend persistence, or route enablement.

## Historical Baseline

The production `_prisma_migrations` history contains:

`20260211153100_baseline`

The matching historical artifact has been restored at:

`Backend/prisma/migrations/20260211153100_baseline/migration.sql`

Evidence:

- File length: 284 bytes
- SHA-256:
  `5ed4f7d9db1fda4ec3ece38c5d26439790771aa28dffc1a4e96164a22ce679d2`
- The checksum matches the production migration-history evidence recorded
  during BP2.
- Multiple independent archived and deployment-staging copies were found with
  identical bytes and checksum.
- The migration is an intentional no-op ending in `SELECT 1`.

The baseline is already considered applied in the database. It is restored
only so the local migration chain contains the historical artifact represented
in migration history. It must not be recreated from the current schema,
modified, reapplied, resolved, or used to infer the original database schema.

The historical `add_contract_tables.sql` file found beside some archived copies
is not the checksummed Prisma `migration.sql`. It is not restored into the
active migration folder by RC1A.

## Superseded Review-Suggestion Migration

The following migration was local-only and was never applied to production:

`20260610214500_add_document_review_suggestions`

It has been removed from Prisma's active `Backend/prisma/migrations` chain.
Its original SQL intent is preserved for audit/reference at:

`docs/migration-reconciliation/20260610214500_add_document_review_suggestions.superseded.sql`

That archived SQL is:

- superseded;
- local-only;
- never applied to production;
- non-operational documentation;
- not a migration to execute;
- not a migration name to reuse.

Its intended objects were:

- `DocumentReviewWorkspaceSource`;
- `DocumentReviewSuggestionType`;
- `DocumentReviewSuggestionStatus`;
- `document_review_suggestions`;
- related indexes and foreign keys.

BP3 must replace this artifact with a new timestamped, reviewed forward
migration only after RC1B clone comparison and RC1C migration review.

## Production Enum Preservation

The current local Prisma schema preserves the production enum values:

- `WorkType.OTHER`
- `ClauseKind.SPECIAL`
- `RepresentedSide.NEUTRAL`
- `ClauseCategory.SPECIAL`
- `AssemblyStatus.GENERATED`

These values must remain present when future schema diffs are generated.
Any SQL proposing enum replacement, enum-value removal, or recreation of
enum-backed tables is a no-go.

## Forbidden Commands and Actions

Until a separately approved reconciliation and deployment window:

- do not run `prisma migrate deploy`;
- do not run `prisma migrate reset`;
- do not run `prisma db push`;
- do not run `prisma migrate resolve`;
- do not edit `_prisma_migrations`;
- do not mark migrations as applied;
- do not generate migrations against production;
- do not apply archived SQL;
- do not deploy database or backend changes;
- do not enable document-review persistence routes;
- do not implement `DocumentReviewSession` as part of RC1A.

## Next Phases

### RC1B — Production-Clone Diff

- Create or select an approved production-schema clone.
- Perform read-only catalog comparison.
- Generate SQL diff against the clone only.
- Reject any destructive table, column, enum, constraint, or data operation.

### RC1C — Reviewed Forward Migration Draft

- Draft a new timestamped additive migration.
- Create the review-suggestion persistence objects.
- Add `DocumentReviewSession` and its relations/indexes.
- Add resource-aware permission policy before routes are exposed.
- Test migration and rollback procedures on the clone.

### BP3 — Backend Persistence

- Implement review-session services and APIs only after RC1 reconciliation.
- Use `TimelineEvent.eventType = CUSTOM` with string event types.
- Keep document content and generated Word files outside review-session rows.

### BP4 — Frontend Integration

- Connect `/documents/compare` only after backend persistence is approved.
- Preserve explicit save behavior and the current local-only fallback.

## RC1A Completion Boundary

RC1A is complete when:

- the exact baseline artifact is present locally;
- the local-only review migration is absent from the active Prisma chain;
- its intent remains preserved outside that chain;
- production enum values remain represented locally;
- non-mutating validation succeeds;
- no migration, database write, commit, or deploy has occurred.
