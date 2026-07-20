# Client Color Production-Head Clone Proof

## Scope

This proof used a disposable localhost PostgreSQL database representing the schema at production migration head `20260718120000_add_task_submission_workflow`. It did not connect an application to production and did not replay the repository's known-broken empty historical chain.

## Construction method

1. Export the pre-candidate release schema as a schema datamodel.
2. Generate a schema-equivalent local baseline SQL using Prisma datamodel-to-datamodel diff.
3. Place that baseline and the exact candidate SQL in a temporary local migration chain.
4. Apply the baseline to `adminiculum_client_color_proof_20260720` on loopback PostgreSQL.
5. Seed synthetic clients, cases, tasks, communications, TaskSubmissions, notifications, and Dashboard-compatible records.
6. Apply `20260719120000_add_client_color_key` exactly once.

No real client name, document, communication body, or production row was copied.

## Migration proof

- Candidate apply succeeded; CLI-inclusive duration was 3,141 ms.
- `_prisma_migrations` recorded a finished, non-rolled-back candidate row.
- Prisma migration status was clean.
- The enum contained exactly the ten approved values.
- `clients.colorKey` was nullable, had no default, and used `ClientColorKey`.
- Every pre-existing synthetic client retained `colorKey = null` after apply.
- Legacy `Client.color` values remained byte-for-byte unchanged, including a synthetic `#123456` and a null value.
- A valid `BLUE` value stored successfully.
- An invalid `NOT_ALLOWED` value was rejected.
- Clearing the new field to null succeeded.
- Counts and all pre-existing synthetic relations remained readable.
- Prisma DB-to-candidate-schema diff returned `-- This is an empty migration.`

## Runtime compatibility proof

The pre-candidate backend build started against the migrated local schema and returned `/health` 200. This proves the additive column does not break the old runtime. The integrated backend also passed full validation and authenticated browser QA against the migrated schema.

Old-backend authenticated list probes were intentionally not spoofed: requests without a legitimate token were rejected as expected. Compatibility derives from successful old-runtime startup, health, schema reads, the absence of removed/changed columns, and the additive SQL shape.

## Integrated synthetic QA

The same disposable schema was expanded with bounded synthetic records for authenticated release-candidate QA. Client color save/change/clear, relation inheritance, Dashboard projections, communication assignment projection refresh, Review queue/detail projection, and neutral Notification behavior were exercised. A local disabled persistence gate correctly rejected the UI write route with 501; projection refresh was then verified by a controlled mutation of the disposable fixture without changing any feature flag.

## Cleanup

The local application processes were stopped and the disposable database was dropped. Production and Azure resources were not modified.
