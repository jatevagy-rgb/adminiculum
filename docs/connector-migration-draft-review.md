# Connector Migration Draft Review

Classification target: `connector_migration_draft_review_documented_no_runtime_change`

This is a docs-only review of the first future inert connector schema foundation migration. It does not edit `Backend/prisma/schema.prisma`, create Prisma migration files, run Prisma migration commands, add API routes, add frontend UI, change auth, enable the client portal, connect to external systems, add secrets, deploy, or change runtime behavior.

## 1. Executive summary

`CONNECTOR-SCHEMA-1` should be the smallest additive database foundation for future external workflow connectors. It should create the neutral connector control-plane tables needed to describe one client-scoped external connection, one selected legal queue, inbound event envelopes, and redacted operational sync logs.

Recommended scope:

- Include `ExternalConnection`.
- Include `ExternalWorkflowQueue`.
- Include `ExternalWorkflowEvent`.
- Include `ExternalSyncLog`.
- Include stable enums for status, health, queue type, verification, processing, direction, and attachment policy.
- Defer `ExternalCredentialRef` as a separate future migration unless a concrete secret-store lifecycle is implemented at the same time.
- Keep only an optional `credentialRef String?` on `ExternalConnection` as an opaque pointer field, not a credential table.

The migration must be inert and default-off: no connection should become active, no queue should watch anything, no inbound or outbound sync should start, and no connector data should become client-visible merely because tables exist.

Implementation should wait until the current clean Prisma migration proof / baseline-bootstrap path is unblocked.

## 2. Current schema convention review

Observed conventions from `Backend/prisma/schema.prisma`:

- **IDs**: most current domain models use `String @id @default(uuid())`; a few newer/join models use `@db.Uuid` with `dbgenerated("gen_random_uuid()")`. For connector foundation consistency with `Client`, `Case`, `Task`, `Document`, and `Communication`, use `String @id @default(uuid())`.
- **Table names**: Prisma model names are PascalCase and mapped to snake_case tables with `@@map`, for example `Client` -> `clients` and `Communication` -> `communications`.
- **Enums**: stable domain/status concepts use Prisma enums with uppercase values, for example `CommunicationType`, `CommunicationSource`, and `CommunicationSyncStatus`.
- **Timestamps**: models usually use `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`; append-only log models often only need `createdAt`.
- **Client anchor**: `Client` is the canonical tenant/client scope anchor for client-owned work. Connector tables should require `clientId` where records are client-scoped.
- **Internal user anchor**: `User` is the internal actor anchor for created-by / updated-by references. Connector setup fields should reference internal users only where useful for audit, and should not create a connector actor as a `User`.
- **Relations**: owned children often cascade from their parent (`CommunicationAttachment` -> `Communication`), while historical optional references often use `SetNull`.
- **Deletion posture**: connector events/logs are audit records; hard cascade deletion is risky unless a deliberate tenant-deletion policy exists. Prefer soft state (`DISABLED`, `REVOKED`) over deletion for connections.
- **Existing communication provider foundation**: `Communication` already has nullable provider fields such as `externalMessageId`, `providerConversationId`, `mailboxAddress`, `direction`, `source`, `syncStatus`, provider metadata, and attachment metadata. Connector foundation should not duplicate or modify this list contract.
- **Case/Task/Document/Communication links**: defer direct links from `CONNECTOR-SCHEMA-1`. Linkage belongs in later `ExternalIntakeItem` / `ExternalObjectLink` phases after intake and approval rules exist.

Naming conventions `CONNECTOR-SCHEMA-1` should follow:

- Prisma models: `ExternalConnection`, `ExternalWorkflowQueue`, `ExternalWorkflowEvent`, `ExternalSyncLog`.
- Table maps: `external_connections`, `external_workflow_queues`, `external_workflow_events`, `external_sync_logs`.
- Enum names: PascalCase with `External...` prefix.
- Index names: explicit where needed, especially for uniqueness/idempotency.
- Provider-specific values: keep as `String` or `Json` when likely to churn.

## 3. CONNECTOR-SCHEMA-1 scope decision

### Options reviewed

| Option | Contents | Security posture | Usefulness | Recommendation |
| --- | --- | --- | --- | --- |
| A: minimal foundation | `ExternalConnection`, `ExternalWorkflowQueue`, `ExternalWorkflowEvent`, `ExternalSyncLog` | Lowest risk; no credential lifecycle implied | Enough to support future inert connector configuration, event audit, and dedupe | Recommended |
| B: foundation plus `ExternalCredentialRef` | Option A plus credential reference metadata table | Safe only if secret-store lifecycle and rotation semantics are already designed | Useful later for OAuth/API-token lifecycle | Defer |

### Decision

Use **Option A**, with one narrow addition: allow `ExternalConnection.credentialRef String?` as an opaque optional pointer. Do not create `ExternalCredentialRef` in `CONNECTOR-SCHEMA-1`.

Rationale:

- A `credentialRef` string can point to a future Azure Key Vault secret or managed secret handle without storing any secret value.
- Creating `ExternalCredentialRef` now could imply credential lifecycle support before token storage, rotation, revocation, audit, and Key Vault boundaries are implemented.
- The first migration should stay inert; credential metadata is easier to add safely after a concrete connector authorization flow exists.
- Deferring the table avoids accidental UI/API interpretation that credentials can already be configured.

## 4. Proposed future Prisma draft

The following is a non-applied Prisma-like draft. It must not be copied into `schema.prisma` until a future migration task explicitly authorizes schema edits and the clean migration proof path is ready.

```prisma
model ExternalConnection {
  id                      String                   @id @default(uuid())
  clientId                String
  systemType              ExternalSystemType
  displayName             String
  status                  ExternalConnectionStatus @default(DRAFT)
  integrationLevel        ExternalIntegrationLevel @default(LINK_ONLY)
  credentialRef           String?
  healthStatus            ExternalHealthStatus     @default(UNKNOWN)
  lastHealthCheckAt       DateTime?
  createdByInternalUserId String?
  updatedByInternalUserId String?
  createdAt               DateTime                 @default(now())
  updatedAt               DateTime                 @updatedAt
  disabledAt              DateTime?
  revokedAt               DateTime?
  metadata                Json?

  client                  Client @relation(fields: [clientId], references: [id], onDelete: Restrict)
  createdByInternalUser   User?  @relation("ExternalConnectionCreatedBy", fields: [createdByInternalUserId], references: [id], onDelete: SetNull)
  updatedByInternalUser   User?  @relation("ExternalConnectionUpdatedBy", fields: [updatedByInternalUserId], references: [id], onDelete: SetNull)
  queues                  ExternalWorkflowQueue[]
  events                  ExternalWorkflowEvent[]
  logs                    ExternalSyncLog[]

  @@index([clientId, systemType, status])
  @@index([status])
  @@map("external_connections")
}
```

Security notes:

- `credentialRef` is a pointer only, never a raw token or secret.
- `status` defaults to `DRAFT`; no connection is usable by default.
- `integrationLevel` defaults to `LINK_ONLY`; no inbound/outbound automation is implied.
- Any future runtime must check explicit feature flags and connection/queue state before use.

```prisma
model ExternalWorkflowQueue {
  id                   String                   @id @default(uuid())
  externalConnectionId String
  clientId             String
  externalQueueId      String
  externalQueueName    String
  externalQueueUrl     String?
  queueType            ExternalQueueType
  status               ExternalQueueStatus      @default(DRAFT)
  inboundEnabled       Boolean                  @default(false)
  outboundEnabled      Boolean                  @default(false)
  attachmentPolicy     ExternalAttachmentPolicy @default(METADATA_ONLY)
  allowedEventTypes    Json?
  clientTeamMapping    Json?
  createdAt            DateTime                 @default(now())
  updatedAt            DateTime                 @updatedAt
  disabledAt           DateTime?
  metadata             Json?

  connection           ExternalConnection @relation(fields: [externalConnectionId], references: [id], onDelete: Restrict)
  client               Client             @relation(fields: [clientId], references: [id], onDelete: Restrict)
  events               ExternalWorkflowEvent[]
  logs                 ExternalSyncLog[]

  @@unique([externalConnectionId, externalQueueId])
  @@index([externalConnectionId, status])
  @@index([clientId, status])
  @@map("external_workflow_queues")
}
```

Security notes:

- A queue is the selected legal queue/project/board/list only; it is not permission to scrape a whole workspace.
- `inboundEnabled` and `outboundEnabled` both default to `false`.
- `attachmentPolicy` defaults to metadata only.
- `clientId` is intentionally duplicated for client-scope filtering and audit queries; runtime should validate it matches the parent connection.

```prisma
model ExternalWorkflowEvent {
  id                   String                         @id @default(uuid())
  clientId             String
  externalConnectionId String
  externalQueueId      String?
  externalSystem       ExternalSystemType
  externalEventId      String?
  externalObjectId     String?
  eventType            String
  eventTimestamp       DateTime?
  receivedAt           DateTime                       @default(now())
  payloadHash          String?
  payloadRedacted      Json?
  rawPayloadStorageRef String?
  signatureVerified    Boolean                        @default(false)
  verificationStatus   ExternalVerificationStatus     @default(NOT_REQUIRED)
  processingStatus     ExternalEventProcessingStatus  @default(RECEIVED)
  errorCode            String?
  errorMessage         String?
  idempotencyKey       String
  createdAt            DateTime                       @default(now())

  client               Client                 @relation(fields: [clientId], references: [id], onDelete: Restrict)
  connection           ExternalConnection     @relation(fields: [externalConnectionId], references: [id], onDelete: Restrict)
  queue                ExternalWorkflowQueue? @relation(fields: [externalQueueId], references: [id], onDelete: SetNull)
  logs                 ExternalSyncLog[]      @relation("ExternalSyncLogRelatedEvent")

  @@unique([idempotencyKey])
  @@index([externalConnectionId, externalEventId])
  @@index([clientId, createdAt])
  @@index([processingStatus, createdAt])
  @@index([externalConnectionId, createdAt])
  @@map("external_workflow_events")
}
```

Security notes:

- Store redacted payload only; do not persist raw secrets or attachment binaries.
- `ExternalWorkflowEvent` is internal operational material, not client-visible legal content.
- `processingStatus` is operational only and must not imply legal review status.
- `rawPayloadStorageRef` is optional and should remain unused until secure storage rules exist.

```prisma
model ExternalSyncLog {
  id                   String                @id @default(uuid())
  clientId             String
  externalConnectionId String
  externalQueueId      String?
  direction            ExternalSyncDirection
  action               String
  status               ExternalSyncLogStatus
  externalObjectId     String?
  relatedEventId       String?
  resourceType         String?
  resourceId           String?
  errorCode            String?
  errorMessage         String?
  metadata             Json?
  createdAt            DateTime              @default(now())

  client               Client                 @relation(fields: [clientId], references: [id], onDelete: Restrict)
  connection           ExternalConnection     @relation(fields: [externalConnectionId], references: [id], onDelete: Restrict)
  queue                ExternalWorkflowQueue? @relation(fields: [externalQueueId], references: [id], onDelete: SetNull)
  relatedEvent         ExternalWorkflowEvent? @relation("ExternalSyncLogRelatedEvent", fields: [relatedEventId], references: [id], onDelete: SetNull)

  @@index([externalConnectionId, createdAt])
  @@index([clientId, createdAt])
  @@index([relatedEventId])
  @@index([status, createdAt])
  @@map("external_sync_logs")
}
```

Security notes:

- Logs are redacted operational audit records.
- `resourceType` / `resourceId` are strings in `CONNECTOR-SCHEMA-1` to avoid hard FK coupling to `Case`, `Task`, `Document`, or `Communication` before link semantics exist.
- Outbound logs do not authorize outbound writes; later `ExternalSyncApproval` is required.

Deferred optional model:

```prisma
// Deferred from CONNECTOR-SCHEMA-1.
model ExternalCredentialRef {
  id                   String                   @id @default(uuid())
  externalConnectionId String
  provider             ExternalSystemType
  credentialType       ExternalCredentialType
  secretRef            String
  status               ExternalCredentialStatus @default(ACTIVE)
  expiresAt            DateTime?
  lastRotatedAt        DateTime?
  createdAt            DateTime                 @default(now())
  updatedAt            DateTime                 @updatedAt

  connection           ExternalConnection @relation(fields: [externalConnectionId], references: [id], onDelete: Restrict)

  @@unique([externalConnectionId, provider, credentialType])
  @@map("external_credential_refs")
}
```

Deferral rationale:

- `secretRef` is still sensitive metadata even if it is not the secret value.
- A credential table should arrive together with Key Vault / secret-store policy, rotation, revocation, and access audit.
- The first inert migration does not need credential lifecycle state.

## 5. Proposed enum draft

| Enum | Proposed values | Stable enough for Prisma enum? | Churn risk | Security note |
| --- | --- | --- | --- | --- |
| `ExternalSystemType` | `JIRA`, `BITRIX24`, `MICROSOFT_GRAPH`, `ASANA`, `MONDAY`, `TRELLO`, `CLICKUP`, `GENERIC_WEBHOOK`, `EMAIL_BRIDGE`, `CUSTOM_API` | Yes | Medium | `CUSTOM_API` prevents schema churn for bespoke systems. |
| `ExternalConnectionStatus` | `DRAFT`, `ACTIVE`, `DISABLED`, `ERROR`, `REVOKED` | Yes | Low | Default must be `DRAFT`, not `ACTIVE`. |
| `ExternalIntegrationLevel` | `LINK_ONLY`, `INBOUND`, `APPROVED_OUTBOUND`, `ADVANCED_SYNC` | Yes | Low | Does not grant runtime permission by itself. |
| `ExternalHealthStatus` | `UNKNOWN`, `HEALTHY`, `DEGRADED`, `ERROR` | Yes | Low | Default `UNKNOWN` avoids false health claims. |
| `ExternalQueueType` | `PROJECT`, `BOARD`, `LIST`, `PLAN`, `GROUP`, `MAILBOX`, `CUSTOM` | Yes | Medium | Broad enough for Jira/Planner/Trello/email/custom systems. |
| `ExternalQueueStatus` | `DRAFT`, `ACTIVE`, `DISABLED`, `ERROR` | Yes | Low | Runtime still needs feature flags and enabled booleans. |
| `ExternalAttachmentPolicy` | `METADATA_ONLY`, `CONTROLLED_COPY`, `AUTOMATIC_COPY` | Yes | Low | Default `METADATA_ONLY`; `AUTOMATIC_COPY` should remain unusable until later policy. |
| `ExternalVerificationStatus` | `NOT_REQUIRED`, `VERIFIED`, `FAILED`, `SKIPPED` | Yes | Low | Records webhook/signature posture without claiming auth. |
| `ExternalEventProcessingStatus` | `RECEIVED`, `NORMALIZED`, `IGNORED`, `DUPLICATE`, `FAILED` | Yes | Low | Operational only; not legal status. |
| `ExternalSyncDirection` | `INBOUND`, `OUTBOUND` | Yes | Low | Outbound log alone is not outbound approval. |
| `ExternalSyncLogStatus` | `SUCCESS`, `FAILED`, `SKIPPED`, `DUPLICATE`, `RETRYING` | Yes | Medium | Does not expose raw payload. |
| `ExternalCredentialType` | `OAUTH`, `API_TOKEN`, `WEBHOOK_SECRET`, `SERVICE_ACCOUNT` | Yes, later | Medium | Defer until `ExternalCredentialRef` exists. |
| `ExternalCredentialStatus` | `ACTIVE`, `EXPIRED`, `REVOKED`, `ERROR` | Yes, later | Low | Defer until credential lifecycle exists. |

Recommendation:

- Use Prisma enums for stable security and lifecycle state.
- Keep provider-specific `eventType`, sync `action`, `resourceType`, and adapter-specific metadata as `String` / `Json` to avoid enum churn.
- Do not add high-churn provider event names as Prisma enums.

## 6. Relation and onDelete review

| Model | Relation | Required? | Recommended `onDelete` | Rationale |
| --- | --- | --- | --- | --- |
| `ExternalConnection` | `Client` | Yes | `Restrict` | Connector audit should not disappear casually; align with explicit client-retention decisions. |
| `ExternalConnection` | `createdByInternalUser` | No | `SetNull` | User deletion/deactivation must not break connection audit. |
| `ExternalConnection` | `updatedByInternalUser` | No | `SetNull` | Same as above. |
| `ExternalWorkflowQueue` | `ExternalConnection` | Yes | `Restrict` | Disable/revoke connection instead of deleting queue history. |
| `ExternalWorkflowQueue` | `Client` | Yes | `Restrict` | Supports client-scoped filtering and avoids orphan audit. |
| `ExternalWorkflowEvent` | `ExternalConnection` | Yes | `Restrict` | Event envelope is audit/dedupe material. |
| `ExternalWorkflowEvent` | `ExternalWorkflowQueue` | No | `SetNull` | Queue may be disabled/removed later while event proof remains. |
| `ExternalWorkflowEvent` | `Client` | Yes | `Restrict` | Preserve tenant scope and audit trail. |
| `ExternalSyncLog` | `ExternalConnection` | Yes | `Restrict` | Sync logs should survive connection soft-state transitions. |
| `ExternalSyncLog` | `ExternalWorkflowQueue` | No | `SetNull` | Queue-specific logs remain readable after queue cleanup. |
| `ExternalSyncLog` | `ExternalWorkflowEvent` | No | `SetNull` | Log should remain even if event retention policy later trims event rows. |
| `ExternalCredentialRef` | `ExternalConnection` | Yes, later | `Restrict` | Credential metadata requires explicit revocation/rotation, not cascade. |

Do not add relations to `Case`, `Task`, `Document`, or `Communication` in `CONNECTOR-SCHEMA-1`. Those links should be introduced by later explicit link/intake models, not by operational event/log rows.

## 7. Index and constraint strategy

| Model | Index/constraint | Purpose | Risk | Required in `CONNECTOR-SCHEMA-1`? |
| --- | --- | --- | --- | --- |
| `ExternalConnection` | `@@index([clientId, systemType, status])` | List/filter client connections by system and status | Low | Yes |
| `ExternalConnection` | `@@index([status])` | Find draft/active/error connections | Low | Yes |
| `ExternalWorkflowQueue` | `@@unique([externalConnectionId, externalQueueId])` | Prevent duplicate selected external queues per connection | Medium if provider reuses IDs across workspace contexts | Yes, because scoped by connection |
| `ExternalWorkflowQueue` | `@@index([externalConnectionId, status])` | Find queues under one connection | Low | Yes |
| `ExternalWorkflowQueue` | `@@index([clientId, status])` | Client-scoped queue inventory | Low | Yes |
| `ExternalWorkflowEvent` | `@@unique([idempotencyKey])` | Primary cross-provider dedupe key | Medium if key construction is weak | Yes |
| `ExternalWorkflowEvent` | `@@index([externalConnectionId, externalEventId])` | Fast duplicate lookup when provider event ID exists | Low if non-unique | Yes, non-unique |
| `ExternalWorkflowEvent` | `@@index([clientId, createdAt])` | Client/audit query by date | Low | Yes |
| `ExternalWorkflowEvent` | `@@index([processingStatus, createdAt])` | Operational retry/error queue | Low | Yes |
| `ExternalWorkflowEvent` | unique `[externalConnectionId, externalEventId]` | Provider-event dedupe | High because `externalEventId` can be null/missing/unreliable | No; prefer unique `idempotencyKey` |
| `ExternalSyncLog` | `@@index([externalConnectionId, createdAt])` | Connection audit timeline | Low | Yes |
| `ExternalSyncLog` | `@@index([clientId, createdAt])` | Client operational audit | Low | Yes |
| `ExternalSyncLog` | `@@index([relatedEventId])` | Event-to-log trace | Low | Yes |
| `ExternalSyncLog` | `@@index([status, createdAt])` | Error/retry operations | Low | Yes |
| `ExternalCredentialRef` | `@@unique([externalConnectionId, provider, credentialType])` | One credential per kind | Medium, depends on token lifecycle | Later only |

Warnings:

- Some generic webhooks will not supply `externalEventId`.
- Repeated status changes for the same external object are legitimate and must not be blocked by uniqueness on `externalObjectId`.
- The unique `idempotencyKey` must be computed carefully before persistence.

## 8. Idempotency strategy

`CONNECTOR-SCHEMA-1` should support dedupe without creating intake items yet.

Recommended fields:

- `externalEventId String?`
- `externalObjectId String?`
- `eventType String`
- `eventTimestamp DateTime?`
- `payloadHash String?`
- `idempotencyKey String @unique`

Recommended key construction:

1. If provider gives a stable event ID: `externalConnectionId + ":" + externalEventId`.
2. Fallback: `externalConnectionId + ":" + externalObjectId + ":" + eventType + ":" + eventTimestamp + ":" + payloadHash`.
3. If the payload is too incomplete to create a reliable key, mark event as `FAILED` or `IGNORED` rather than generating a random key that defeats dedupe.

Reasoning:

- Webhook providers retry.
- Automation bridges often replay payloads.
- Duplicate inbound events must not later create duplicate legal requests.
- Dedupe should happen before `ExternalIntakeItem` exists in a later phase.

## 9. Payload storage strategy

Options reviewed:

| Option | Description | Benefit | Risk |
| --- | --- | --- | --- |
| A | Store `payloadRedacted Json?` only | Useful for audit/debug without secrets | Redaction mistakes can leak sensitive material |
| B | Store `rawPayloadStorageRef String?` for secure blob storage later | Keeps DB light, can preserve forensic proof | Requires separate secure storage, retention, encryption, and access rules |
| C | Store only `payloadHash` + extracted metadata | Lowest sensitivity | Harder to debug mapping failures |

Recommendation for `CONNECTOR-SCHEMA-1`:

- Include `payloadHash String?`.
- Include `payloadRedacted Json?` for deliberately redacted payload excerpts only.
- Include `rawPayloadStorageRef String?` as optional future-safe pointer, but do not use it until secure storage rules exist.
- Never store raw secrets, OAuth tokens, webhook shared secrets, attachment bytes, or full unredacted payloads in the normal DB row.

## 10. Migration safety review

Why the future migration is additive and inert:

- It creates new tables and enums only.
- It does not add required columns to existing populated tables.
- It does not alter `Client`, `Case`, `Task`, `Document`, `Communication`, or auth tables except for required Prisma back-relations in the schema file when implemented.
- It requires no data backfill.
- It creates no external connections.
- It stores no real credentials.
- It adds no API routes or frontend UI.
- It adds no runtime queries.
- It grants no permissions to client portal users or connector actors.
- Defaults are non-active: connection `DRAFT`, queue `DRAFT`, inbound/outbound disabled, attachment policy `METADATA_ONLY`, health `UNKNOWN`.

Implementation blocker:

- Do not create the real Prisma migration until the clean Prisma migration proof / baseline-bootstrap issue is resolved and a future implementation task explicitly authorizes schema and migration file changes.

## 11. Backfill/seed strategy

Options reviewed:

| Option | Description | Recommendation |
| --- | --- | --- |
| A | No backfill or seed | Recommended |
| B | Create disabled settings rows for all clients | Not needed; creates noise and accidental surface area |
| C | Lazy-create connection when internal admin configures it | Recommended later runtime behavior |

`CONNECTOR-SCHEMA-1` should not create rows for existing clients. Connections should be created later only through explicit internal setup after security, auth, feature flags, and UI are implemented.

## 12. Relationship to later connector schema phases

`CONNECTOR-SCHEMA-1` is only the inert control-plane/event-audit foundation.

Later phases should remain separate:

- **CONNECTOR-SCHEMA-2**: `ExternalIntakeItem` and `ExternalObjectLink` for normalized legal request candidates and honest links to Adminiculum resources.
- **CONNECTOR-SCHEMA-3**: `ExternalSyncApproval` for approval-gated outbound status/comment requests.
- **CONNECTOR-SCHEMA-4**: `ExternalAttachment` only if metadata, secure fetch, retention, and document-boundary policies are ready.
- **CONNECTOR-SCHEMA-5**: adapter mapping, field mapping, and status mapping tables after onboarding wizard semantics are settled.

`CONNECTOR-SCHEMA-1` must not create legal requests, expose connector data to clients, or authorize outbound sync.

## 13. Risk register

| Risk | Severity | Mitigation | Blocking before implementation? |
| --- | --- | --- | --- |
| Enum churn | Medium | Use enums only for stable lifecycle/security fields; keep provider event/action values as strings | No |
| Idempotency uniqueness too strict | High | Unique only `idempotencyKey`; do not unique `externalObjectId` or nullable `externalEventId` | Yes, review key construction |
| Queue uniqueness too strict | Medium | Scope uniqueness by `externalConnectionId`; avoid global queue ID uniqueness | No |
| Raw payload sensitivity | High | Store hash and redacted payload only; keep raw storage pointer unused until secure storage is designed | Yes |
| `credentialRef` mistaken for secret | High | Document and enforce pointer-only semantics; never store raw token/secret values | Yes |
| Connection accidentally active | High | Default `DRAFT`; no runtime use; feature flag required later | Yes |
| Cascade delete loses audit | Medium | Prefer `Restrict` / `SetNull`; use soft disable/revoke states | Yes |
| Connector tables mistaken as permission grants | High | No API/UI/runtime behavior in first migration; connector actor is not internal `User` | Yes |
| Future adapter needs fields not included | Low | Preserve `metadata Json?` and provider-specific strings for extension | No |
| Baseline/migration proof unresolved | High | Wait for clean migration proof before creating migration | Yes |
| `ExternalCredentialRef` premature | Medium | Defer table until Key Vault/secret lifecycle exists | No, if deferred |
| Client portal exposure confusion | High | Do not add portal routes or client-visible tables in this phase | Yes |

## 14. Required future tests

When the migration is implemented later, test:

- `npx prisma validate` passes.
- `npx prisma generate` passes.
- Migration applies to a clean baseline-proof DB.
- Migration applies to a production-like clone.
- Migration creates only `CONNECTOR-SCHEMA-1` objects.
- Default `ExternalConnection.status` is non-active.
- Default `ExternalConnection.integrationLevel` is `LINK_ONLY`.
- Default queue `inboundEnabled` and `outboundEnabled` are `false`.
- Duplicate `idempotencyKey` is rejected.
- Repeated events for the same `externalObjectId` with different idempotency keys are allowed.
- No existing API responses change.
- No client portal route is enabled.
- No credential value can be queried from connector tables.
- Backend typecheck and tests pass.

## 15. Implementation readiness checklist

Before a future implementation prompt creates the real migration:

- Clean Prisma migration proof / baseline-bootstrap path is resolved.
- Production-like clone migration apply path is available.
- `schema.prisma` change is explicitly authorized.
- Migration file creation is explicitly authorized.
- No `prisma migrate dev` or `db push` is used against shared/prod databases.
- Client portal remains disabled unless a separate approved task changes it.
- Feature flag design exists for connector runtime enablement.
- Secret-store / Key Vault design exists before any credential table or live connector auth.
- Runtime code remains off until separate API/UI tasks implement guarded behavior.
- Rollback/abandon strategy is documented for the additive migration.

## 16. Open questions

- Should `ExternalSystemType` remain an enum long-term, or should custom/native systems eventually move into a lookup table?
- Should `ExternalConnection.credentialRef` be included in `CONNECTOR-SCHEMA-1`, or deferred entirely until Key Vault integration exists?
- Should `ExternalWorkflowQueue.externalQueueId` be required for link-only connectors, or should link-only use a synthetic stable ID?
- Should event/log retention policy be defined before events are stored, or can retention be added before runtime event ingestion?
- Should `rawPayloadStorageRef` be omitted from the first migration to reduce any temptation to store raw payloads?
- What exact clean migration proof path will unblock CP/connector schema work?

## 17. Recommended next prompt

Recommended next prompt:

`Adminiculum — CONNECTOR1E connector schema migration implementation preflight no changes`

That prompt should:

- confirm the clean Prisma migration proof / baseline-bootstrap issue is resolved;
- re-read this draft review;
- inspect current `Backend/prisma/schema.prisma` and migration history;
- decide whether `credentialRef String?` stays in `ExternalConnection`;
- verify a production-like clone apply path exists;
- still avoid creating the migration unless explicitly approved in a subsequent implementation step.
