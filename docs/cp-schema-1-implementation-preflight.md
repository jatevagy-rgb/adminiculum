# CP-SCHEMA-1 Implementation Preflight

Classification target: `cp_schema1_implementation_preflight_documented_no_runtime_change_no_schema_change_no_db_change`

This is a docs-only implementation preflight and schema candidate plan for Client Portal v1 foundation. It does not edit `Backend/prisma/schema.prisma`, create migrations, connect to any database, use `CLONE_DATABASE_URL`, run Prisma migration commands, enable Client Portal runtime, expose data, add routes, add frontend UI, deploy, or change runtime behavior.

## 1. Executive summary

The production-like clone snapshot moved CP-SCHEMA-1 from hard no-go to **conditional implementation-preflight readiness**. That is not production readiness. It means the repo can now safely prepare a minimal additive schema candidate to be reviewed before any future migration file is authored and before any clone apply/proof step is attempted.

Recommended CP-SCHEMA-1 candidate scope:

1. `ClientPortalUser` — external portal identity, separate from internal `User` and `UserRole.CLIENT`.
2. `ClientPortalMembership` — explicit tenant/workspace/role scope for each portal user.
3. `ClientVisibleArtifact` — approved/publication-state artifact layer, separate from internal source models.
4. `ClientPortalGrant` — artifact visibility/action grants scoped to client/team/membership/role.
5. `ClientSubmission` — inbound client-originated request/message/clarification/upload-intent boundary.
6. `ClientSubmissionAttachment` — attachment metadata for client submissions, no file bytes or raw storage exposure.
7. `ClientPortalAuditEvent` — content-minimal audit trail for portal identity, reads, writes, publication, grant, and admin events.

The candidate is additive, inert, nullable where possible, and default-off. It must not make any existing case, task, document, communication, report, connector event, AI draft, review note, or internal message client-visible.

## 2. Snapshot dependency and current readiness

### Snapshot dependency

The current migration chain cannot be proven by empty-DB replay because `Backend/prisma/migrations/20260211153100_baseline/migration.sql` is a no-op while later migrations assume baseline tables already exist.

The manual production-like clone snapshot documented in `docs/production-like-clone-baseline-schema-snapshot.md` records that the clone contains the baseline-critical objects:

- `_prisma_migrations`
- `clients`
- `users`
- `cases`
- `tasks`
- `documents`
- `communications`

It also records production-like foreign keys and indexes, including important examples such as:

- `cases.clientId` -> `clients.id`
- `documents.caseId` -> `cases.id`
- `documents.clientId` -> `clients.id`
- `tasks.caseId` -> `cases.id`
- `tasks.sourceCommunicationId` -> `communications.id`
- `communications_caseId_createdAt_idx`
- `communications_clientId_createdAt_idx`

### Readiness interpretation

Current CP-SCHEMA-1 readiness:

- **Preflight/design:** ready.
- **Schema edit:** safe to prompt next only as a separate controlled task.
- **Migration file authoring:** not in this task; should happen only after this candidate is reviewed.
- **Clone apply proof:** later step only, against confirmed non-production clone.
- **Production apply:** not ready.
- **Runtime enablement:** not ready.

Important snapshot caveats:

- Empty DB replay remains invalid proof.
- Local drifted DB remains invalid proof.
- Rolled-back migration rows exist in clone metadata and must be acknowledged in every future migration proof.
- No production migration may be run from this manual snapshot alone.
- Internal `UserRole.CLIENT` exists but is not the Client Portal security model.

## 3. Proposed additive model list

| Model family | Future table | MVP purpose | Inert/default-off behavior |
| --- | --- | --- | --- |
| `ClientPortalUser` | `client_portal_users` | External portal account lifecycle | No auth/runtime uses it until portal feature is implemented. |
| `ClientPortalMembership` | `client_portal_memberships` | Tenant/workspace/role scope | No membership grants access until runtime checks and feature flags exist. |
| `ClientVisibleArtifact` | `client_visible_artifacts` | Published client-safe projection of internal work | Existing internal objects remain invisible unless artifact is explicitly created and published later. |
| `ClientPortalGrant` | `client_portal_grants` | Visibility/action grant over an artifact | No grant exists by default; publication without grant remains invisible. |
| `ClientSubmission` | `client_submissions` | Client-originated write boundary/triage item | Submissions do not auto-create cases/tasks/documents or artifacts. |
| `ClientSubmissionAttachment` | `client_submission_attachments` | Metadata for uploaded/pending client files | Metadata only; no file bytes, no direct storage URL exposure. |
| `ClientPortalAuditEvent` | `client_portal_audit_events` | Content-minimal security/audit trail | Audit records do not expose content or change access by themselves. |

Optional/deferred models intentionally not in the minimal CP-SCHEMA-1 candidate:

- `ClientPortalTeam` — defer until team semantics vs existing `ClientWorkgroup`/`Department` are decided.
- `ClientPortalInvitation` — defer unless the next auth implementation explicitly requires persisted invitation tokens in the first migration.
- Connector tables — remain CONNECTOR-SCHEMA-1, separate from CP-SCHEMA-1.
- Per-artifact typed tables such as `ClientVisibleMessage` or `ClientVisibleDocumentVersion` — use generic artifact metadata + typed JSON payload in CP-SCHEMA-1, then split later if needed.

## 4. Field-level draft for each model

The snippets below are a migration-ready draft shape, not an applied Prisma schema. Naming follows existing conventions: `String @id @default(uuid())`, `createdAt`, `updatedAt`, and explicit `@@map(...)` table names.

### `ClientPortalUser`

Purpose: external portal identity, never an internal Adminiculum `User`.

Candidate fields:

```prisma
model ClientPortalUser {
  id                 String   @id @default(uuid())
  email              String
  emailNormalized    String
  displayName        String?
  passwordHash       String?
  authProvider       String   @default("password")
  externalSubjectId  String?
  status             ClientPortalUserStatus @default(INVITED)
  lastLoginAt        DateTime?
  acceptedTermsAt    DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  // Candidate relations in future schema:
  // memberships ClientPortalMembership[]
  // submissions  ClientSubmission[]
  // auditEvents  ClientPortalAuditEvent[]

  @@unique([emailNormalized, authProvider], map: "client_portal_users_email_provider_key")
  @@index([status], map: "client_portal_users_status_idx")
  @@map("client_portal_users")
}
```

Notes:

- `emailNormalized` supports non-enumerating lookup and uniqueness without trusting domain.
- `passwordHash` is nullable to allow invitation/magic-link/external-provider flows later.
- No relation to internal `User` as the identity source.

### `ClientPortalMembership`

Purpose: explicit tenant/workspace role and scope.

Candidate fields:

```prisma
model ClientPortalMembership {
  id                   String   @id @default(uuid())
  clientPortalUserId   String
  clientId             String
  role                 ClientPortalRole
  status               ClientPortalMembershipStatus @default(INVITED)
  teamScopeType        String?
  teamScopeId          String?
  teamDisplayName      String?
  invitedByInternalUserId String?
  activatedAt          DateTime?
  suspendedAt          DateTime?
  revokedAt            DateTime?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  // Candidate relations in future schema:
  // user     ClientPortalUser @relation(fields: [clientPortalUserId], references: [id], onDelete: Cascade)
  // client   Client           @relation(fields: [clientId], references: [id], onDelete: Restrict)
  // inviter  User?            @relation(fields: [invitedByInternalUserId], references: [id], onDelete: SetNull)

  @@index([clientPortalUserId, status], map: "client_portal_memberships_user_status_idx")
  @@index([clientId, status], map: "client_portal_memberships_client_status_idx")
  @@index([clientId, role], map: "client_portal_memberships_client_role_idx")
  @@index([clientId, teamScopeType, teamScopeId], map: "client_portal_memberships_team_scope_idx")
  @@map("client_portal_memberships")
}
```

Recommended uniqueness decision:

- Do **not** hard-unique `[clientPortalUserId, clientId, teamScopeType, teamScopeId]` until reinvite/revocation history semantics are settled.
- If uniqueness is needed in MVP, use partial unique SQL for active memberships only in migration SQL, not a broad Prisma unique constraint that blocks history.

### `ClientVisibleArtifact`

Purpose: generic, validated publication artifact. The portal reads artifacts, never internal source models directly.

Candidate fields:

```prisma
model ClientVisibleArtifact {
  id                  String   @id @default(uuid())
  clientId            String
  artifactType        ClientVisibleArtifactType
  state               ClientVisibleArtifactState @default(DRAFT)
  title               String?
  summary             String?
  payload             Json
  payloadVersion      Int      @default(1)
  sourceType          ClientVisibleSourceType?
  sourceId            String?
  sourceCaseId        String?
  sourceDocumentId    String?
  sourceTaskId        String?
  sourceCommunicationId String?
  proposedByInternalUserId String?
  approvedByInternalUserId String?
  publishedByInternalUserId String?
  proposedAt          DateTime?
  approvedAt          DateTime?
  publishedAt         DateTime?
  revokedAt           DateTime?
  expiresAt           DateTime?
  supersededById      String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  // Candidate relations in future schema:
  // client Client @relation(fields: [clientId], references: [id], onDelete: Restrict)
  // sourceCase Case? @relation(fields: [sourceCaseId], references: [id], onDelete: SetNull)
  // sourceDocument Document? @relation(fields: [sourceDocumentId], references: [id], onDelete: SetNull)
  // sourceTask Task? @relation(fields: [sourceTaskId], references: [id], onDelete: SetNull)
  // sourceCommunication Communication? @relation(fields: [sourceCommunicationId], references: [id], onDelete: SetNull)

  @@index([clientId, artifactType, state], map: "client_visible_artifacts_client_type_state_idx")
  @@index([clientId, state, publishedAt], map: "client_visible_artifacts_client_state_published_idx")
  @@index([sourceType, sourceId], map: "client_visible_artifacts_source_idx")
  @@index([sourceCaseId], map: "client_visible_artifacts_source_case_idx")
  @@index([sourceDocumentId], map: "client_visible_artifacts_source_document_idx")
  @@index([sourceTaskId], map: "client_visible_artifacts_source_task_idx")
  @@index([sourceCommunicationId], map: "client_visible_artifacts_source_communication_idx")
  @@map("client_visible_artifacts")
}
```

Notes:

- `payload` must contain only validator-approved client-safe fields.
- `source*` fields are audit/correlation, not visibility grants.
- `state=PUBLISHED` is still invisible without a matching grant.
- Existing internal rows remain invisible because no artifacts are auto-created.

### `ClientPortalGrant`

Purpose: explicit read/download/upload/comment/manage grant over a visible artifact.

Candidate fields:

```prisma
model ClientPortalGrant {
  id                  String   @id @default(uuid())
  clientId            String
  artifactId          String
  action              ClientPortalGrantAction @default(READ)
  scopeType           ClientPortalGrantScope
  role                ClientPortalRole?
  membershipId        String?
  teamScopeType       String?
  teamScopeId         String?
  startsAt            DateTime?
  expiresAt           DateTime?
  revokedAt           DateTime?
  grantedByInternalUserId String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  // Candidate relations in future schema:
  // client Client @relation(fields: [clientId], references: [id], onDelete: Restrict)
  // artifact ClientVisibleArtifact @relation(fields: [artifactId], references: [id], onDelete: Cascade)
  // membership ClientPortalMembership? @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  // grantedBy User? @relation(fields: [grantedByInternalUserId], references: [id], onDelete: SetNull)

  @@index([clientId, artifactId, action], map: "client_portal_grants_client_artifact_action_idx")
  @@index([clientId, scopeType, action], map: "client_portal_grants_client_scope_action_idx")
  @@index([membershipId, action], map: "client_portal_grants_membership_action_idx")
  @@index([clientId, teamScopeType, teamScopeId], map: "client_portal_grants_team_scope_idx")
  @@map("client_portal_grants")
}
```

Grant rules:

- Grant without publication is invisible.
- Publication without grant is invisible.
- Grants never widen beyond `clientId` membership scope.
- Revoked or expired grants are invisible.

### `ClientSubmission`

Purpose: inbound client-originated input. It is a triage object, not a published artifact and not legal work product.

Candidate fields:

```prisma
model ClientSubmission {
  id                    String   @id @default(uuid())
  clientId              String
  clientPortalUserId    String
  membershipId          String
  submissionType        ClientSubmissionType
  status                ClientSubmissionStatus @default(SUBMITTED)
  title                 String?
  body                  String?
  payload               Json?
  targetArtifactId      String?
  targetRequestArtifactId String?
  idempotencyKey        String?
  source                String   @default("PORTAL")
  triagedByInternalUserId String?
  triagedAt             DateTime?
  linkedCaseId          String?
  linkedTaskId          String?
  linkedDocumentId      String?
  linkedCommunicationId String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  // Candidate relations in future schema:
  // client Client @relation(fields: [clientId], references: [id], onDelete: Restrict)
  // user ClientPortalUser @relation(fields: [clientPortalUserId], references: [id], onDelete: Restrict)
  // membership ClientPortalMembership @relation(fields: [membershipId], references: [id], onDelete: Restrict)
  // targetArtifact ClientVisibleArtifact? @relation(fields: [targetArtifactId], references: [id], onDelete: SetNull)
  // linkedCase Case? @relation(fields: [linkedCaseId], references: [id], onDelete: SetNull)

  @@index([clientId, status, createdAt], map: "client_submissions_client_status_created_idx")
  @@index([clientPortalUserId, createdAt], map: "client_submissions_user_created_idx")
  @@index([membershipId, createdAt], map: "client_submissions_membership_created_idx")
  @@index([targetArtifactId], map: "client_submissions_target_artifact_idx")
  @@unique([clientId, idempotencyKey], map: "client_submissions_client_idempotency_key")
  @@map("client_submissions")
}
```

Notes:

- If `idempotencyKey` can be null, the future SQL migration should review PostgreSQL unique/null behavior and whether partial unique SQL is safer.
- Submissions must not auto-create published artifacts.
- Submissions may be triaged into internal case/task/document/communication only by internal workflow later.

### `ClientSubmissionAttachment`

Purpose: metadata for client-uploaded files associated with a submission.

Candidate fields:

```prisma
model ClientSubmissionAttachment {
  id                 String   @id @default(uuid())
  clientId           String
  submissionId       String
  safeFileName       String
  mimeType           String?
  sizeBytes          Int?
  checksumSha256     String?
  storageRef         String?
  scanStatus         ClientSubmissionAttachmentScanStatus @default(PENDING)
  status             ClientSubmissionAttachmentStatus @default(PENDING_REVIEW)
  uploadedAt         DateTime @default(now())
  acceptedDocumentId String?
  rejectedAt         DateTime?
  rejectionReasonCode String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  // Candidate relations in future schema:
  // client Client @relation(fields: [clientId], references: [id], onDelete: Restrict)
  // submission ClientSubmission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  // acceptedDocument Document? @relation(fields: [acceptedDocumentId], references: [id], onDelete: SetNull)

  @@index([clientId, uploadedAt], map: "client_submission_attachments_client_uploaded_idx")
  @@index([submissionId], map: "client_submission_attachments_submission_idx")
  @@index([acceptedDocumentId], map: "client_submission_attachments_document_idx")
  @@map("client_submission_attachments")
}
```

Notes:

- `storageRef` must be an opaque internal pointer; never expose raw storage URLs in DTOs.
- Attachment bytes are outside CP-SCHEMA-1; storage/scanning pipeline remains a later runtime task.

### `ClientPortalAuditEvent`

Purpose: content-minimal trace of portal activity, publication/grant/admin changes, and security-relevant events.

Candidate fields:

```prisma
model ClientPortalAuditEvent {
  id                   String   @id @default(uuid())
  clientId             String?
  actorType            ClientPortalActorType
  actorClientPortalUserId String?
  actorMembershipId    String?
  actorInternalUserId  String?
  action               ClientPortalAuditAction
  resourceType         String?
  resourceId           String?
  artifactId           String?
  submissionId         String?
  outcome              ClientPortalAuditOutcome @default(SUCCESS)
  ipHash               String?
  userAgentHash        String?
  metadata             Json?
  createdAt            DateTime @default(now())

  // Candidate relations in future schema:
  // client Client? @relation(fields: [clientId], references: [id], onDelete: SetNull)
  // actorPortalUser ClientPortalUser? @relation(fields: [actorClientPortalUserId], references: [id], onDelete: SetNull)
  // actorMembership ClientPortalMembership? @relation(fields: [actorMembershipId], references: [id], onDelete: SetNull)
  // actorInternalUser User? @relation(fields: [actorInternalUserId], references: [id], onDelete: SetNull)
  // artifact ClientVisibleArtifact? @relation(fields: [artifactId], references: [id], onDelete: SetNull)
  // submission ClientSubmission? @relation(fields: [submissionId], references: [id], onDelete: SetNull)

  @@index([clientId, createdAt], map: "client_portal_audit_events_client_created_idx")
  @@index([actorType, actorClientPortalUserId, createdAt], map: "client_portal_audit_events_portal_actor_idx")
  @@index([actorInternalUserId, createdAt], map: "client_portal_audit_events_internal_actor_idx")
  @@index([resourceType, resourceId], map: "client_portal_audit_events_resource_idx")
  @@index([artifactId, createdAt], map: "client_portal_audit_events_artifact_idx")
  @@index([submissionId, createdAt], map: "client_portal_audit_events_submission_idx")
  @@map("client_portal_audit_events")
}
```

Audit metadata must not store full document content, full message bodies, raw webhook payloads, secrets, tokens, raw signed URLs, internal legal strategy, AI prompts/completions, or other-client references.

## 5. Candidate enum set

Keep enums stable and minimal. Values likely to churn can remain strings until runtime semantics settle.

Candidate enums:

```prisma
enum ClientPortalUserStatus {
  INVITED
  ACTIVE
  SUSPENDED
  REVOKED
}

enum ClientPortalMembershipStatus {
  INVITED
  ACTIVE
  SUSPENDED
  REVOKED
}

enum ClientPortalRole {
  REQUESTER
  TEAM_LEAD
  CLIENT_MANAGER
  CLIENT_ADMIN
}

enum ClientVisibleArtifactType {
  REQUEST
  STATUS
  TIMELINE_ITEM
  TODO
  DOCUMENT_REQUEST
  DOCUMENT_VERSION
  MESSAGE
  DEADLINE
  REPORT_SNAPSHOT
  CONNECTOR_LINK
  INTEGRATION_AUDIT_ITEM
}

enum ClientVisibleArtifactState {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  PUBLISHED
  REVOKED
  EXPIRED
  SUPERSEDED
}

enum ClientVisibleSourceType {
  CASE
  TASK
  DOCUMENT
  DOCUMENT_VERSION
  COMMUNICATION
  TIME_REPORT
  CONNECTOR
  MANUAL
}

enum ClientPortalGrantAction {
  READ
  DOWNLOAD
  UPLOAD
  COMMENT
  MANAGE
  VIEW_REPORT
  VIEW_INTEGRATION
}

enum ClientPortalGrantScope {
  CLIENT
  TEAM
  ROLE
  MEMBERSHIP
  REQUESTER_OWN
}

enum ClientSubmissionType {
  NEW_REQUEST
  MESSAGE
  DOCUMENT_UPLOAD
  CLARIFICATION
  PROFILE_ADMIN
  INTEGRATION_ADMIN
}

enum ClientSubmissionStatus {
  SUBMITTED
  IN_TRIAGE
  ACCEPTED_INTERNAL
  NEEDS_CLARIFICATION
  REJECTED
  CLOSED
}

enum ClientSubmissionAttachmentScanStatus {
  PENDING
  CLEAN
  BLOCKED
  FAILED
}

enum ClientSubmissionAttachmentStatus {
  PENDING_REVIEW
  ACCEPTED
  REJECTED
}

enum ClientPortalActorType {
  CLIENT_PORTAL_USER
  INTERNAL_USER
  SYSTEM
  CONNECTOR
}

enum ClientPortalAuditAction {
  LOGIN_SUCCEEDED
  LOGIN_FAILED
  WORKSPACE_SELECTED
  ARTIFACT_READ
  ARTIFACT_DOWNLOADED
  SUBMISSION_CREATED
  ATTACHMENT_UPLOADED
  ARTIFACT_PROPOSED
  ARTIFACT_APPROVED
  ARTIFACT_PUBLISHED
  ARTIFACT_REVOKED
  GRANT_CREATED
  GRANT_REVOKED
  MEMBERSHIP_INVITED
  MEMBERSHIP_UPDATED
  MEMBERSHIP_REVOKED
}

enum ClientPortalAuditOutcome {
  SUCCESS
  DENIED
  FAILED
}
```

Enum risk note: if the team expects rapid expansion of artifact/action/status values, consider strings for `action`, `artifactType`, or `sourceType` and enforce allowed values in code validators instead of early enum locking.

## 6. Relation map to existing models

| Candidate model | Required existing relation | Optional existing relation | Relation purpose | Visibility implication |
| --- | --- | --- | --- | --- |
| `ClientPortalUser` | none | none | Separate external identity | No access by itself. |
| `ClientPortalMembership` | `Client` via `clientId`; optional `User` via `invitedByInternalUserId` | future team/workgroup only as string in CP-SCHEMA-1 | Tenant/workspace/role scope | Membership enables scope resolution only when runtime later implements it. |
| `ClientVisibleArtifact` | `Client` via `clientId` | `Case`, `Document`, `Task`, `Communication`, internal `User` approvers | Source correlation and approval audit | Source relation is not a grant; artifact must be published and granted. |
| `ClientPortalGrant` | `Client`, `ClientVisibleArtifact` | `ClientPortalMembership`, internal `User` grant actor | Access/action scope | Grant is invisible unless artifact is published and tenant scope matches. |
| `ClientSubmission` | `Client`, `ClientPortalUser`, `ClientPortalMembership` | target `ClientVisibleArtifact`; later `Case`/`Task`/`Document`/`Communication` after triage | Inbound client write boundary | Submission is not a portal-visible artifact by default. |
| `ClientSubmissionAttachment` | `Client`, `ClientSubmission` | accepted `Document` after internal review | Upload metadata | Upload is pending review, not published. |
| `ClientPortalAuditEvent` | none required beyond nullable `clientId` | portal user, membership, internal user, artifact, submission | Content-minimal trace | Audit does not grant access and should be redacted. |

Existing models should not receive `clientVisible` boolean flags in CP-SCHEMA-1. Publication/grant remains separate to avoid accidental broad exposure.

## 7. Index and uniqueness plan

Minimum recommended indexes:

- `client_portal_users`: unique `[emailNormalized, authProvider]`; index `[status]`.
- `client_portal_memberships`: index `[clientPortalUserId, status]`, `[clientId, status]`, `[clientId, role]`, `[clientId, teamScopeType, teamScopeId]`.
- `client_visible_artifacts`: index `[clientId, artifactType, state]`, `[clientId, state, publishedAt]`, source correlation indexes.
- `client_portal_grants`: index `[clientId, artifactId, action]`, `[clientId, scopeType, action]`, `[membershipId, action]`, `[clientId, teamScopeType, teamScopeId]`.
- `client_submissions`: index `[clientId, status, createdAt]`, `[clientPortalUserId, createdAt]`, `[membershipId, createdAt]`, `[targetArtifactId]`; review unique/idempotency strategy.
- `client_submission_attachments`: index `[clientId, uploadedAt]`, `[submissionId]`, `[acceptedDocumentId]`.
- `client_portal_audit_events`: index `[clientId, createdAt]`, actor indexes, resource index, artifact/submission indexes.

Uniqueness cautions:

- Active-only membership uniqueness may require partial unique SQL; broad Prisma `@@unique` can block revoked/reinvited history.
- Idempotency with nullable `idempotencyKey` may need partial unique SQL where `idempotencyKey IS NOT NULL`.
- Grant uniqueness should be reviewed with grant expiry/revocation history; broad uniqueness can block historical grants.

## 8. FK and delete behavior plan

Recommended delete posture:

| Relation | Recommended behavior | Reason |
| --- | --- | --- |
| `ClientPortalMembership.clientId -> Client.id` | `Restrict` | Do not silently delete portal access history with client deletion. |
| `ClientPortalMembership.clientPortalUserId -> ClientPortalUser.id` | `Cascade` or `Restrict` pending retention policy | Cascade simplifies user deletion; restrict preserves audit lifecycle. Decide before migration. |
| `ClientVisibleArtifact.clientId -> Client.id` | `Restrict` | Published artifact history should not disappear casually. |
| `ClientVisibleArtifact.source* -> internal source` | `SetNull` | Internal source retention/deletion should not destroy artifact/audit history. |
| `ClientPortalGrant.artifactId -> ClientVisibleArtifact.id` | `Cascade` | Grants are subordinate to artifact; if artifact is deleted in non-prod cleanup, grants follow. Production should prefer revoke over delete. |
| `ClientPortalGrant.membershipId -> ClientPortalMembership.id` | `Cascade` or `SetNull` | If membership deleted, grants may be removed; if audit retention is key, use `SetNull` plus clientId. |
| `ClientSubmission.clientId -> Client.id` | `Restrict` | Client-originated records are audit-sensitive. |
| `ClientSubmission.user/membership -> portal identity` | `Restrict` | Preserve author trace. |
| `ClientSubmissionAttachment.submissionId -> ClientSubmission.id` | `Cascade` | Attachment metadata is subordinate to submission. |
| `ClientPortalAuditEvent.*` | mostly `SetNull` | Audit event should survive actor/resource deletion with redacted context. |

General rule: use revoke/suspend/status transitions instead of hard deletes for production portal records.

## 9. Privacy/security notes

CP-SCHEMA-1 must preserve these rules:

- Tenant isolation is derived from `ClientPortalUser` + active `ClientPortalMembership`, not from route `clientId`.
- `/me`-scoped APIs remain the future contract.
- Internal `UserRole.CLIENT` is not the portal identity model.
- `ClientVisibleArtifact` is a safe copy/projection layer, not a flag on internal rows.
- `ClientPortalGrant` is required in addition to publication state.
- `ClientSubmission` is triage-only and cannot auto-publish or auto-create internal legal work.
- Audit is content-minimal and redacted.
- Feature flags remain off; adding inert tables must not make existing data visible.
- No client portal route should directly return internal `Case`, `Task`, `Document`, `Communication`, `TimeEntry`, connector event, AI, review, or SharePoint objects.

## 10. What must NOT be exposed

Never expose through CP-SCHEMA-1 or future portal DTOs:

- global clients list or client search;
- other clients, teams, memberships, users, reports, connectors, cases, documents, requests, or messages;
- internal notes;
- internal task details and assignee notes;
- legal strategy;
- risk scores or fake priority/AI scoring;
- AI prompts, completions, draft summaries, or model metadata;
- raw communications, raw email thread/body/headers, raw webhook payloads;
- document review annotations, suggestions, workspace text, internal version history;
- SharePoint raw paths, IDs, storage keys, persistent signed URLs;
- raw timesheets, per-minute billing, lawyer capacity/workload;
- connector credentials, debug logs, retry payloads, sync secrets;
- secrets/tokens/password hashes in audit or DTOs.

## 11. Migration risk assessment

| Risk | Severity | Mitigation | Readiness impact |
| --- | --- | --- | --- |
| Empty-DB replay invalid due no-op baseline | High | Use production-like clone for proof; do not use empty DB as proof | Known; not blocking preflight. |
| Local DB drift invalid proof | High | Do not use local DB for proof | Known; not blocking preflight. |
| Rolled-back migration rows in clone | Medium/High | Document and compare before migration apply proof | Must be acknowledged in next prompt. |
| Prisma relation back-reference churn | Medium | Keep draft reviewed before schema edit; add explicit relation names if needed | Requires schema implementation care. |
| Enum churn | Medium | Keep only stable enums; use strings for fast-changing dimensions if needed | Review before migration. |
| Broad uniqueness blocks revoke/reinvite history | Medium | Prefer indexes or partial unique SQL for active-only constraints | Review before migration SQL. |
| Accidental data exposure by linking internal models | Critical | Use artifacts + grants; no `clientVisible` flags on internal models | Must remain non-negotiable. |
| Audit content overcollection | High | Store only IDs/hashes/redacted metadata | Validator/review needed. |
| Attachment storage URL leak | High | Store opaque `storageRef`; issue scoped short-lived URLs later | Runtime later. |
| Production apply before clone proof | Critical | Separate future clone apply/proof and production approval tasks | Blocks production. |

## 12. Validation plan for a future migration candidate

For a later schema implementation prompt, before any migration is applied:

1. Confirm no DB connection is used during schema authoring.
2. Edit `Backend/prisma/schema.prisma` only in the explicit schema implementation task.
3. Generate a reviewable migration file only; do not apply.
4. Run `cd Backend && npx.cmd prisma validate`.
5. Run `cd Backend && npx.cmd tsc --noEmit`.
6. Run `cd Backend && npm.cmd test -- --runInBand` if available.
7. Run `git diff --check`.
8. Review generated SQL for additive-only behavior:
   - creates only new `client_portal_*`, `client_visible_*`, and `client_submission_*` objects;
   - no alteration of existing data visibility;
   - no destructive statements;
   - no default backfill that publishes data;
   - no runtime feature flag change.
9. Apply later only to confirmed non-production clone in a separate task.
10. After clone apply, introspect read-only to prove tables, enums, FKs, indexes, and `_prisma_migrations` state.
11. Production apply requires a separate approval/preflight.

## 13. Open questions

- Should `ClientPortalInvitation` be included in CP-SCHEMA-1 or deferred until auth flow implementation?
- Should `ClientPortalTeam` be a first-class table, or should membership carry `teamScopeType/teamScopeId` until team semantics are decided?
- Should `ClientPortalUser.emailNormalized` be globally unique, provider-scoped unique, or tenant-scoped?
- Should active membership uniqueness use partial unique SQL?
- Should `ClientVisibleArtifact.payload` remain generic JSON in CP-SCHEMA-1 or split typed artifact tables immediately?
- Which artifact states are genuinely stable enough for enums?
- Should audit events require `clientId`, or stay nullable for pre-membership login/invite events?
- What retention policy applies to revoked portal users, memberships, grants, submissions, attachments, and audit events?
- What file scanning/storage mechanism will own `ClientSubmissionAttachment.storageRef` later?
- Should `ClientSubmission.body` be stored directly, or should all high-risk text live in `payload` with strict validator metadata?

## 14. Next recommended prompt

`Adminiculum — CP-SCHEMA-1 Prisma schema candidate draft no migration apply`

Recommended next scope:

- edit `Backend/prisma/schema.prisma` with the reviewed additive/inert CP-SCHEMA-1 candidate;
- generate or prepare a migration draft only if explicitly requested;
- do not apply migrations;
- do not connect to any DB except optional Prisma validate/typecheck behavior that does not inspect a database;
- do not enable Client Portal runtime;
- do not add API routes or frontend UI;
- keep production/Azure untouched.

## 15. Final status

- Runtime change: no.
- Schema/migration change: no.
- DB change: no.
- DB connection used: no.
- Production/Azure touched: no.
- Secrets printed: no.
- CP-SCHEMA-1 readiness after preflight: conditional schema implementation prompt is reasonable; production apply is not ready.
- CONNECTOR-SCHEMA-1 readiness: remains conditional and separate.
- Final classification: `cp_schema1_implementation_preflight_documented_no_runtime_change_no_schema_change_no_db_change`.
