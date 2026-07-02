# Connector Schema Implementation Preflight

Classification target: `connector_schema_implementation_preflight_documented_no_runtime_change_no_schema_change`

This is a docs-only, no-change preflight for the future `CONNECTOR-SCHEMA-1` inert connector schema foundation migration. It does not edit `Backend/prisma/schema.prisma`, create Prisma migration files, run `prisma migrate`, run `prisma db push`, mutate a database, add API routes, add frontend UI, change auth, enable the client portal, connect to external systems, add or use secrets, deploy, or change runtime behavior.

## 1. Executive summary

The future `CONNECTOR-SCHEMA-1` plan is internally consistent and safe as a draft, but it is **not ready to implement yet** because the clean Prisma migration proof / baseline-bootstrap path remains unresolved.

Preflight recommendation:

- Keep `CONNECTOR-SCHEMA-1` limited to `ExternalConnection`, `ExternalWorkflowQueue`, `ExternalWorkflowEvent`, and `ExternalSyncLog`.
- Defer `ExternalCredentialRef`, intake/link/approval/attachment/mapping tables, API routes, frontend UI, external calls, and real credentials.
- Keep the first migration additive, inert, default-off, and non-runtime.
- Use stable Prisma enums for lifecycle/security status fields.
- Keep provider-specific event/action values as `String` / `Json`.
- Do not create the migration until a clean/prod-like proof target is available and the baseline/bootstrap blocker is resolved.

## 2. Scope and non-goals

Future `CONNECTOR-SCHEMA-1` intended scope:

- `ExternalConnection`
- `ExternalWorkflowQueue`
- `ExternalWorkflowEvent`
- `ExternalSyncLog`
- stable connector lifecycle/status enums

Explicitly deferred:

- `ExternalCredentialRef`
- `ExternalIntakeItem`
- `ExternalObjectLink`
- `ExternalSyncApproval`
- `ExternalAttachment`
- adapter field/status mapping tables
- webhook endpoints
- API routes
- frontend UI
- real credentials
- external connections
- outbound sync implementation
- client portal enablement

Non-goals for this preflight:

- no schema edits;
- no migration creation;
- no DB mutation;
- no Prisma migrate / db push;
- no runtime behavior change;
- no production/Azure work;
- no external connector access.

## 3. Existing docs consistency review

Reviewed:

- `docs/universal-connector-compatibility-architecture.md`
- `docs/connector-security-data-boundary-design.md`
- `docs/connector-domain-model-split-plan.md`
- `docs/connector-migration-draft-review.md`

Consistency findings:

- The docs consistently describe a universal normalized connector flow: external item/event -> `ExternalWorkflowEvent` -> later `ExternalIntakeItem` -> Adminiculum legal work.
- The docs agree that connector runtime must be queue-scoped and must not scrape whole client workspaces.
- The docs agree that inbound may become automatic later, but outbound status/comment sync must be approval-gated.
- The connector actor remains separate from internal Adminiculum users and client portal users.
- Raw payload handling is consistently treated as sensitive: use hash/redacted payload/pointer only, never raw secrets or attachment binaries in ordinary DB fields.
- Credential handling is consistently pointer-only: no raw credentials in DB.
- Older planning allowed `ExternalCredentialRef` in the first migration “if safe”; the latest draft review resolves that ambiguity by recommending deferral and keeping only optional `credentialRef String?` on `ExternalConnection`.
- No reviewed connector doc requires runtime behavior in `CONNECTOR-SCHEMA-1`.
- No reviewed connector doc requires outbound sync before `ExternalSyncApproval`.

Preflight conclusion:

- The docs are consistent enough to implement later, provided `ExternalCredentialRef` remains deferred and the migration proof blocker is resolved first.

## 4. Current schema anchor review

Observed schema anchors and conventions from `Backend/prisma/schema.prisma`:

- `Client` is the canonical client/tenant anchor. Connector records should require `clientId`.
- `User` is the internal actor anchor. `createdByInternalUserId` and `updatedByInternalUserId` may reference `User` with optional relations.
- Connector actors and external workflow users must not be stored as internal `User` records.
- Existing core domain IDs generally use `String @id @default(uuid())`.
- Existing tables use PascalCase Prisma model names with `@@map("snake_case_table")`.
- Stable lifecycle values use Prisma enums with uppercase enum members.
- Common timestamp convention is `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`; append-only log/event records may only need `createdAt`.
- Owned child records often use `onDelete: Cascade`; historical/audit optional references often use `SetNull`; connector audit records should avoid hard cascade where possible.
- `Communication` already has provider/import foundation fields and must not be changed by connector foundation work.

Anchor decisions:

- `ExternalConnection` should reference `Client`.
- `ExternalWorkflowQueue`, `ExternalWorkflowEvent`, and `ExternalSyncLog` should also carry `clientId` for safe client-scoped filtering and operational queries.
- `createdByInternalUserId` / `updatedByInternalUserId` can safely reference `User?` with `onDelete: SetNull`, but scalar-only fields would also be acceptable if relation churn becomes a concern.
- First migration should avoid direct relations to `Case`, `Task`, `Document`, or `Communication`; those belong to later intake/link phases.

## 5. Future model consistency check

### A) `ExternalConnection`

Preflight status: consistent.

- Requires `clientId` and `Client` relation.
- `systemType` is a stable enum candidate.
- `status` should default to `DRAFT`.
- `integrationLevel` should default to `LINK_ONLY`.
- `healthStatus` should default to `UNKNOWN`.
- `credentialRef String?` is acceptable as an opaque pointer only; no credential table in this phase.
- `metadata Json?` is acceptable for redacted, non-secret metadata.
- `createdByInternalUserId` and `updatedByInternalUserId` are useful for audit and should be optional.
- `disabledAt` and `revokedAt` support soft-state transitions without deleting audit history.

Open decision before implementation:

- Keep `credentialRef String?` or defer it entirely. The current recommendation is to keep it as pointer-only metadata.

### B) `ExternalWorkflowQueue`

Preflight status: consistent.

- Requires relation to `ExternalConnection`.
- Carries `clientId` denormalized for client-scoped filtering; implementation should ensure it matches the parent connection.
- `status` should default to `DRAFT`.
- `inboundEnabled` and `outboundEnabled` must default to `false`.
- `attachmentPolicy` should default to `METADATA_ONLY`.
- `externalQueueId` + `externalConnectionId` uniqueness is reasonable because the queue ID is scoped to one connection.
- Queue scoping is mandatory and prevents broad workspace scraping.

Open decision before implementation:

- Define how link-only connectors represent `externalQueueId` if no provider queue exists. A synthetic stable value may be required later.

### C) `ExternalWorkflowEvent`

Preflight status: consistent.

- `idempotencyKey` should be required and unique.
- `externalEventId` should remain optional and non-unique because many generic providers may omit it.
- `payloadHash` should be optional but recommended where payloads exist.
- `payloadRedacted Json?` is acceptable only for intentionally redacted payload excerpts.
- `rawPayloadStorageRef String?` is future-safe but should remain unused until secure storage and retention rules exist.
- `signatureVerified` should default to `false`.
- `verificationStatus` should default to `NOT_REQUIRED` or a similarly explicit non-claim value.
- `processingStatus` should default to `RECEIVED`.
- Error fields are operational only and must be redacted.
- Events are not client-visible and do not create legal requests in this phase.

Open decision before implementation:

- Consider omitting `rawPayloadStorageRef` if the team wants to reduce temptation to store raw payloads before secure blob storage exists.

### D) `ExternalSyncLog`

Preflight status: consistent.

- Operational log only.
- Carries `clientId`, `externalConnectionId`, optional `externalQueueId`, and optional `relatedEventId`.
- Stores `direction`, `action`, `status`, redacted `metadata Json?`, and error fields.
- Does not authorize outbound writes.
- Does not become client-visible by default.
- Indexes by connection/client/time and related event are appropriate.

Open decision before implementation:

- Decide whether `resourceType` / `resourceId` string pairs are sufficient until `ExternalObjectLink`, or whether they should be deferred to avoid implying internal resource links.

## 6. Enum preflight

Stable enough for Prisma enums:

- `ExternalSystemType`
- `ExternalConnectionStatus`
- `ExternalIntegrationLevel`
- `ExternalHealthStatus`
- `ExternalQueueType`
- `ExternalQueueStatus`
- `ExternalAttachmentPolicy`
- `ExternalVerificationStatus`
- `ExternalEventProcessingStatus`
- `ExternalSyncDirection`
- `ExternalSyncLogStatus`

Recommended enum values remain:

- `ExternalSystemType`: `JIRA`, `BITRIX24`, `MICROSOFT_GRAPH`, `ASANA`, `MONDAY`, `TRELLO`, `CLICKUP`, `GENERIC_WEBHOOK`, `EMAIL_BRIDGE`, `CUSTOM_API`
- `ExternalConnectionStatus`: `DRAFT`, `ACTIVE`, `DISABLED`, `ERROR`, `REVOKED`
- `ExternalIntegrationLevel`: `LINK_ONLY`, `INBOUND`, `APPROVED_OUTBOUND`, `ADVANCED_SYNC`
- `ExternalHealthStatus`: `UNKNOWN`, `HEALTHY`, `DEGRADED`, `ERROR`
- `ExternalQueueType`: `PROJECT`, `BOARD`, `LIST`, `PLAN`, `GROUP`, `MAILBOX`, `CUSTOM`
- `ExternalQueueStatus`: `DRAFT`, `ACTIVE`, `DISABLED`, `ERROR`
- `ExternalAttachmentPolicy`: `METADATA_ONLY`, `CONTROLLED_COPY`, `AUTOMATIC_COPY`
- `ExternalVerificationStatus`: `NOT_REQUIRED`, `VERIFIED`, `FAILED`, `SKIPPED`
- `ExternalEventProcessingStatus`: `RECEIVED`, `NORMALIZED`, `IGNORED`, `DUPLICATE`, `FAILED`
- `ExternalSyncDirection`: `INBOUND`, `OUTBOUND`
- `ExternalSyncLogStatus`: `SUCCESS`, `FAILED`, `SKIPPED`, `DUPLICATE`, `RETRYING`

Keep as strings or JSON:

- provider-specific event names;
- provider-specific actions;
- external field names;
- status mapping values;
- resource type strings until link models exist;
- adapter capability metadata.

Preflight conclusion:

- Enum values follow existing project style: PascalCase enum names, uppercase values.
- `CUSTOM_API` and `GENERIC_WEBHOOK` preserve future compatibility.
- Do not add `ExternalCredentialType` or `ExternalCredentialStatus` until `ExternalCredentialRef` is explicitly approved.

## 7. Index and constraint preflight

Safe planned constraints:

- `ExternalConnection`: index `[clientId, systemType, status]`.
- `ExternalConnection`: index `[status]`.
- `ExternalWorkflowQueue`: unique `[externalConnectionId, externalQueueId]`.
- `ExternalWorkflowQueue`: index `[externalConnectionId, status]`.
- `ExternalWorkflowQueue`: index `[clientId, status]`.
- `ExternalWorkflowEvent`: unique `[idempotencyKey]`.
- `ExternalWorkflowEvent`: non-unique index `[externalConnectionId, externalEventId]`.
- `ExternalWorkflowEvent`: index `[clientId, createdAt]`.
- `ExternalWorkflowEvent`: index `[processingStatus, createdAt]`.
- `ExternalWorkflowEvent`: index `[externalConnectionId, createdAt]`.
- `ExternalSyncLog`: index `[externalConnectionId, createdAt]`.
- `ExternalSyncLog`: index `[clientId, createdAt]`.
- `ExternalSyncLog`: index `[relatedEventId]`.
- `ExternalSyncLog`: index `[status, createdAt]`.

Constraints to avoid:

- Do not make nullable `externalEventId` globally unique.
- Do not unique `externalObjectId`; repeated updates to the same external object are legitimate.
- Do not unique queue IDs globally across clients/connections.
- Do not unique status/action logs in a way that blocks retries or repeated state transitions.

Preflight conclusion:

- The `idempotencyKey` unique constraint is the right dedupe primitive, but implementation must define deterministic key construction before any runtime event ingestion.

## 8. Migration safety preflight

Future `CONNECTOR-SCHEMA-1` would be safe only if it remains:

- additive only;
- new connector tables and enums only;
- no required fields added to existing populated models;
- no existing table behavior changes;
- default-off;
- no runtime query;
- no API exposure;
- no frontend UI;
- no backfill;
- no seed;
- no external connection;
- no credential values;
- no client portal enablement;
- no outbound sync behavior.

Important caveat:

- Adding Prisma relations to existing `Client` / `User` models may require schema back-relation fields when implemented. That is still a schema change and must be reviewed in the future migration implementation task, but it should not require database column changes on `clients` or `users`.

Implementation remains blocked until the baseline/bootstrap migration proof path is resolved.

## 9. Baseline/bootstrap dependency

Reviewed baseline documents:

- `docs/baseline-bootstrap-strategy-clean-prisma-proof.md`
- `docs/client-portal-v1-clean-local-migration-chain-proof.md`
- `docs/migration-history-reconciliation-lawyer-handoff-decision.md`

Current blocker:

- The active Prisma migration chain cannot replay from an empty database.
- The first migration, `20260211153100_baseline`, is intentionally no-op and represents an already-existing historical database state.
- A clean local migration-chain proof failed at `20260212180000_add_workload_tracking` because baseline tables such as `clients` are not created by the no-op baseline.
- The current Prisma schema must not be treated as historical baseline SQL.

Why this blocks connector implementation:

- A new connector migration cannot be honestly proven against a clean migration chain while the chain cannot bootstrap to the current schema.
- Generating or testing `CONNECTOR-SCHEMA-1` against a drifted local DB would hide migration-order and baseline assumptions.
- `prisma db push` is not acceptable migration proof.

Proof needed before implementation:

- A reviewed local-only baseline bootstrap path for disposable proof databases, or
- A production-like clone/PITR target that already has the real historical baseline state and current migration metadata.

For production confidence:

- A production-like clone/staging proof should apply the future connector migration before any production apply is considered.
- Production apply must remain separately approved.

## 10. Risk register

| Risk | Severity | Mitigation | Blocking before implementation? |
| --- | --- | --- | --- |
| Implementing before baseline proof | Critical | Resolve clean/prod-like migration proof first | Yes |
| Enum churn after migration | Medium | Use enums only for stable lifecycle/security fields; provider-specific values stay strings/JSON | No |
| `idempotencyKey` constraint wrong | High | Define deterministic key construction and test duplicate/retry cases | Yes |
| Nullable `externalEventId` uniqueness mistake | High | Keep non-unique index; unique only `idempotencyKey` | Yes |
| Queue uniqueness too strict | Medium | Scope uniqueness by `externalConnectionId` | No |
| Relation `onDelete` mismatch | Medium | Prefer `Restrict` / `SetNull` for audit tables; avoid cascade for logs/events | Yes |
| `credentialRef` misunderstood as secret storage | High | Pointer-only docs, no raw secret fields, no `ExternalCredentialRef` table yet | Yes |
| Raw payload sensitivity | High | Store hash/redacted excerpts only; defer raw storage until secure retention exists | Yes |
| Connector tables mistaken as permission grants | High | No API/UI/runtime behavior in schema foundation | Yes |
| Runtime accidentally starts reading inert tables | High | No runtime code in migration task; later code gated and reviewed separately | Yes |
| Outbound sync implemented without approval | Critical | Defer outbound until `ExternalSyncApproval` phase | Yes |
| Client portal accidental exposure | Critical | No client portal routes or portal visibility in connector foundation | Yes |
| External connection starts without flag | Critical | No external calls; future runtime requires explicit flags and connection/queue state | Yes |

## 11. Implementation readiness checklist

- [ ] Baseline/bootstrap migration proof resolved.
- [ ] Clean/prod-like migration target available.
- [ ] `CONNECTOR-SCHEMA-1` final scope approved.
- [ ] `ExternalCredentialRef` deferred or explicitly approved.
- [ ] `credentialRef String?` decision finalized.
- [ ] Enum strategy approved.
- [ ] Index/constraint strategy approved.
- [ ] `onDelete` strategy approved.
- [ ] No existing table changes except Prisma relation metadata/back-relations where explicitly reviewed.
- [ ] Defaults are safe/off.
- [ ] No runtime code reads new tables.
- [ ] No external secrets stored.
- [ ] No API routes added.
- [ ] No frontend UI added.
- [ ] No client portal enablement.
- [ ] Future implementation runs `prisma validate`.
- [ ] Future implementation runs backend typecheck/tests.
- [ ] Future migration applies to a proof DB/clone before production planning.

## 12. Blocking issues

Blocking before `CONNECTOR-SCHEMA-1` implementation:

1. Clean Prisma migration proof / baseline-bootstrap path is unresolved.
2. No current green clean local migration-chain proof exists.
3. No current connector-specific production-like clone proof exists.
4. `credentialRef String?` should be explicitly reaffirmed or removed from the first migration.
5. `rawPayloadStorageRef String?` should be explicitly reaffirmed or removed from the first migration.
6. Idempotency key construction must be specified before runtime ingestion exists.

Non-blocking but should be decided during implementation:

- whether created/updated internal user references are real relations or scalar audit fields initially;
- whether `resourceType` / `resourceId` belongs in `ExternalSyncLog` before `ExternalObjectLink`;
- exact constraint names if the implementation uses explicit `map` names.

## 13. Recommended next prompt

Recommended next prompt:

`Adminiculum — local-only baseline bootstrap design for disposable Prisma proof`

That prompt should:

- keep production/Azure untouched;
- avoid creating connector or client portal migrations;
- design the local-only baseline bootstrap artifact boundaries;
- identify the exact proof target and target guards;
- document how a future connector/client-portal migration can be tested only after the baseline bootstrap path is green.

After that, a later connector-specific implementation prompt can safely be:

`Adminiculum — CONNECTOR-SCHEMA-1 inert connector foundation migration draft only`

That later prompt must still explicitly authorize schema and migration-file changes before any implementation begins.
