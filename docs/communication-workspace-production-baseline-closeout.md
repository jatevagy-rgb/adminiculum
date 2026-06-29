# Communication Workspace Production Baseline Closeout

Status: production baseline applied and documented. This snapshot records the COMM5H result only; it does not introduce runtime behavior changes.

## 1. Production Target

Production database target:

- host/database: `adminiculum.postgres.database.azure.com/adminiculum`;
- schema: `public`;
- PostgreSQL version observed during proof: `15.17`.

## 2. Migration Applied

Applied migration:

- name: `20260628190000_add_communication_baseline`;
- file: `Backend/prisma/migrations/20260628190000_add_communication_baseline/migration.sql`.

The migration adds only the current communication baseline expected by Prisma:

- `CommunicationType`;
- `communications`;
- `communication_attachments`;
- nullable `tasks.sourceCommunicationId`;
- baseline communication indexes and foreign keys.

## 3. Apply Method

Production apply method:

- clone-tested one-shot Node/`pg` script;
- production `DATABASE_URL`;
- hard target guard for `adminiculum.postgres.database.azure.com`;
- executed only `20260628190000_add_communication_baseline`;
- manually recorded `_prisma_migrations` for the applied baseline migration.

Commands intentionally not used:

- no `prisma migrate deploy`;
- no `prisma migrate dev`;
- no deployment command;
- no app setting/config change command.

Runtime impact:

- no backend runtime code change;
- no frontend runtime code change;
- no Azure config change;
- no package change;
- no client portal change;
- no seed/fake data.

## 4. Schema Proof

Post-apply production proof confirmed:

- `communications` exists;
- `communication_attachments` exists;
- `CommunicationType` exists with:
  - `EMAIL`;
  - `PHONE`;
  - `MEETING`;
  - `LETTER`;
  - `NOTE`;
- `tasks.sourceCommunicationId` exists;
- `tasks.sourceCommunicationId` is nullable;
- expected indexes exist:
  - `communications_pkey`;
  - `communications_caseId_createdAt_idx`;
  - `communications_clientId_createdAt_idx`;
  - `communication_attachments_pkey`;
- expected foreign keys exist:
  - `communication_attachments_communicationId_fkey`;
  - `tasks_sourceCommunicationId_fkey`;
- `_prisma_migrations` contains `20260628190000_add_communication_baseline`;
- `_prisma_migrations.applied_steps_count` for the baseline migration is `1`.

## 5. Smoke Results

Production smoke after apply:

- `/health` → `200`;
- unauthenticated `GET /api/v1/communications?limit=8` → `401`;
- authenticated `GET /api/v1/communications?limit=8` → skipped because no auth token was available in the shell;
- frontend `/notifications` routes → `200`:
  - `/notifications`;
  - `/notifications?view=external`;
  - `/notifications?view=internal`;
  - `/notifications?view=clients`;
  - `/notifications?view=replies`;
- client portal spoofed summary/export → `501 FEATURE_NOT_AVAILABLE`;
- client portal guard reason remained `CLIENT_PORTAL_NOT_ENABLED`.

## 6. Validation Results

Validation after apply:

- `cd Backend && npx.cmd prisma validate` passed;
- `cd Backend && npx.cmd tsc --noEmit` passed;
- `cd Backend && npm.cmd test -- --runInBand` passed;
- backend tests passed `57/57`;
- `git diff --check` passed.

No rollback was needed.

## 7. Explicit Non-Goals

This baseline did not add:

- `CommunicationThread`;
- `CommunicationClassification`;
- `CommunicationAssignment`;
- `CommunicationRule`;
- provider sync fields;
- Outlook/Graph sync behavior;
- reply-state model;
- remembered rules;
- AI classification;
- client portal exposure;
- `ENABLE_COMMUNICATIONS_PERSISTENCE` enablement;
- fake communications;
- fake provider data;
- fake reply-state data.

## 8. Recommended Next Steps

Recommended sequence:

1. Run authenticated production `GET /api/v1/communications?limit=8` smoke when a valid token is available.
2. Resume COMM5B/COMM6 next-layer design only after authenticated baseline smoke is recorded.
3. Keep next-layer migration work separate from this baseline:
   - threading;
   - classification history;
   - assignment/workflow;
   - remembered rules;
   - optional provider-readiness fields.
4. Continue not to claim provider sync, reply-state tracking, remembered rules, or client portal communication exposure until those are separately implemented and persisted.

## 9. Closeout Classification

Closeout classification:

`communication_production_baseline_closeout_documented_no_runtime_change`
