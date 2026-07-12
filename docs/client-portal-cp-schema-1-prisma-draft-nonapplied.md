# Client Portal CP-SCHEMA-1 Prisma Draft — Non-Applied

## Purpose

This is a **documentation-only, non-applied Prisma draft**. It is:

- documentation only;
- a non-applied draft only;
- **not** `schema.prisma`;
- **not** a migration;
- **not** generated Prisma client input;
- no DB command;
- no production apply;
- **no CP-SCHEMA-1 authorization**.

The Prisma-like blocks below exist **inside this markdown file only** so a reviewer
can see what the future models might look like. Nothing here is wired to Prisma
tooling.

## Warning

> **Do not copy into `schema.prisma`** without separate human approval
> (`docs/client-portal-cp-schema-1-human-approval-packet.md`), a clone rehearsal,
> an accepted rollback plan, and explicit CP-SCHEMA-1 authorization.

Known collisions the implementer must resolve first:

- `schema.prisma` **already contains an inert legacy candidate block** with models
  `ClientPortalUser` and `ClientPortalAuditEvent` and enums
  `ClientPortalUserStatus`, `ClientPortalGrantStatus`, `ClientPortalAuditAction`.
  Applying this draft requires an explicit **replace / migrate / rename decision**
  for the legacy candidates (they are stale candidates per the naming decision, but
  removal is itself a schema change needing review).
- The repo convention is `@default(uuid())` for ids; this draft uses `cuid()` per
  the planning preference — **one convention must be chosen before implementation**.
- Prisma requires **back-relation fields on the internal models** (`Case`, `Client`,
  `Document`, `User`); the actual relation field names must be checked against the
  real `schema.prisma` when a patch is prepared.

## Draft enums

```prisma
// NON-APPLIED DRAFT — documentation only. Do not paste into schema.prisma.
// NOTE: ClientPortalUserStatus / ClientPortalGrantStatus / ClientPortalAuditAction
// already exist in the legacy candidate block with different values — reconcile first.

enum ClientPortalUserStatus {
  ACTIVE
  SUSPENDED
  REVOKED
  // UNRESOLVED: INVITED (pre-first-login) — legacy block currently defaults to INVITED.
}

enum ClientPortalGrantStatus {
  ACTIVE
  REVOKED
  EXPIRED
  // UNRESOLVED: PENDING (invite/approval workflow).
}

enum ClientPortalPublicationStatus {
  DRAFT
  PUBLISHED
  REVOKED
  ARCHIVED
  // UNRESOLVED: SCHEDULED.
}

enum ClientPortalDocumentShareStatus {
  ACTIVE
  REVOKED
  EXPIRED
  ARCHIVED
  // UNRESOLVED: PENDING_APPROVAL.
}

enum ClientPortalUploadRequestStatus {
  OPEN
  COMPLETED
  REVOKED
  EXPIRED
  // UNRESOLVED: DRAFT (prepared before release).
}

enum ClientPortalUploadedFileStatus {
  RECEIVED
  UNDER_REVIEW
  ACCEPTED
  REJECTED
  DELETED
  // UNRESOLVED: virus-scan states depend on the storage/scanning design.
}

enum ClientPortalTaskStatus {
  OPEN
  COMPLETED
  REVOKED
  EXPIRED
  // UNRESOLVED: IN_PROGRESS.
}

enum ClientPortalAuditAction {
  LOGIN
  LOGOUT
  MATTER_LIST_VIEW
  MATTER_DETAIL_VIEW
  DOCUMENT_LIST_VIEW
  DOCUMENT_DETAIL_VIEW
  UPLOAD_REQUEST_VIEW
  TASK_VIEW
  TASK_COMPLETE
  ACCESS_DENIED
  SYSTEM_DENIED
  // UNRESOLVED: final taxonomy; legacy block has a different action list.
}

enum ClientPortalAuditResult {
  SUCCESS
  DENIED
  FAILED
  // UNRESOLVED: whether NOT_READY is distinct from DENIED.
  // NOTE: legacy block uses ClientPortalAuditOutcome — reconcile naming.
}
```

## Draft models

```prisma
// NON-APPLIED DRAFT — documentation only. Do not paste into schema.prisma.
//
// Conventions used here (all subject to implementation review):
//   - id String @id @default(cuid())   // repo currently uses uuid(); pick one.
//   - external-safe *Ref String @unique // opaque, prefixed; generator UNRESOLVED.
//   - internal FKs are NEVER client-facing; relations to Case/Client/Document/User
//     need back-relation fields added on those models (names to be checked).
//   - onDelete is intentionally left unspecified/commented: cascade deletes are
//     to be avoided; revoke-over-delete is the frozen rule. UNRESOLVED per model.
//   - No workspaceText, no raw text, no AI prompt/output, no client-facing
//     storage/SharePoint path fields anywhere in this draft.

model ClientPortalUser {
  id                 String                 @id @default(cuid())
  portalUserRef      String                 @unique // external-safe, e.g. cpu_<opaque>
  externalAuthSubject String                @unique
  email              String
  displayName        String
  status             ClientPortalUserStatus
  linkedClientId     String?                // internal FK -> Client; linkage, NOT a grant
  linkedClient       Client?                @relation(fields: [linkedClientId], references: [id]) // onDelete: UNRESOLVED (no cascade)
  createdAt          DateTime               @default(now())
  updatedAt          DateTime               @updatedAt
  lastLoginAt        DateTime?
  suspendedAt        DateTime?
  revokedAt          DateTime?

  matterGrants   ClientPortalMatterGrant[]
  documentShares ClientPortalDocumentShare[]
  uploadRequests ClientPortalUploadRequest[]
  uploadedFiles  ClientPortalUploadedFile[]
  tasks          ClientPortalTask[]
  auditEvents    ClientPortalAuditEvent[]

  @@index([email])
  @@index([status])
  @@map("client_portal_users") // COLLISION: legacy candidate table uses this name — reconcile.
}

model ClientPortalMatterGrant {
  id              String                  @id @default(cuid())
  grantRef        String                  @unique // internal handle; not used in client URLs
  portalUserId    String
  portalUser      ClientPortalUser        @relation(fields: [portalUserId], references: [id]) // onDelete: UNRESOLVED
  caseId          String                  // internal FK -> Case; FK is NOT visibility
  case            Case                    @relation(fields: [caseId], references: [id]) // no cascade from Case deletion
  grantType       String                  // UNRESOLVED: enum vs string
  status          ClientPortalGrantStatus
  visibilityScope String?                 // UNRESOLVED: enum vs string
  grantedByUserId String                  // internal FK -> User (actor metadata, not access)
  grantedBy       User                    @relation(fields: [grantedByUserId], references: [id])
  grantedAt       DateTime
  revokedAt       DateTime?
  expiresAt       DateTime?
  reasonCode      String?
  createdAt       DateTime                @default(now())
  updatedAt       DateTime                @updatedAt

  documentShares ClientPortalDocumentShare[]
  uploadRequests ClientPortalUploadRequest[]
  tasks          ClientPortalTask[]

  @@index([portalUserId, caseId, status])
  @@index([caseId, status])
  @@index([expiresAt])
  // UNRESOLVED: active-grant uniqueness likely needs a Postgres partial index
  // (WHERE status = 'ACTIVE'), which Prisma cannot express natively — raw SQL in
  // the migration or app-level enforcement. Do NOT use a plain @@unique here.
  @@map("client_portal_matter_grants")
}

model ClientPortalMatterPublication {
  id                          String                        @id @default(cuid())
  publicationRef              String                        @unique // internal handle
  caseId                      String
  case                        Case                          @relation(fields: [caseId], references: [id]) // no auto-publish from Case
  clientFacingDisplayName     String
  clientFacingStatus          String                        // sanitized, NOT internal case status
  clientFacingSummary         String?                       // manually made safe
  nextClientAction            String?
  nextClientDeadline          DateTime?
  lastClientVisibleUpdateAt   DateTime?
  responsibleLawyerDisplayName String?                      // display name only
  publishedByUserId           String
  publishedBy                 User                          @relation(fields: [publishedByUserId], references: [id])
  publishedAt                 DateTime
  status                      ClientPortalPublicationStatus
  createdAt                   DateTime                      @default(now())
  updatedAt                   DateTime                      @updatedAt

  @@index([caseId, status])
  @@index([lastClientVisibleUpdateAt])
  // UNRESOLVED: one-active-publication-per-case — likely a partial unique index.
  @@map("client_portal_matter_publications")
}

model ClientPortalDocumentShare {
  id               String                          @id @default(cuid())
  documentShareRef String                          @unique // external-safe; client URL param
  documentId       String                          // internal FK -> Document; FK is NOT a share by itself
  document         Document                        @relation(fields: [documentId], references: [id]) // no cascade
  caseId           String
  case             Case                            @relation(fields: [caseId], references: [id])
  portalUserId     String?                         // UNRESOLVED: per-user vs grant-group share
  portalUser       ClientPortalUser?               @relation(fields: [portalUserId], references: [id])
  grantId          String?
  grant            ClientPortalMatterGrant?        @relation(fields: [grantId], references: [id])
  displayName      String
  safeDescription  String?
  documentType     String?
  sharedByUserId   String
  sharedBy         User                            @relation(fields: [sharedByUserId], references: [id])
  sharedAt         DateTime
  revokedAt        DateTime?
  expiresAt        DateTime?
  downloadAllowed  Boolean                         @default(false) // flag only; no download implementation
  versionLabel     String?
  status           ClientPortalDocumentShareStatus
  createdAt        DateTime                        @default(now())
  updatedAt        DateTime                        @updatedAt
  // FORBIDDEN by design: raw content, workspace text, extraction metadata,
  // storage/SharePoint path fields.

  tasks ClientPortalTask[]

  @@index([documentId, status])
  @@index([caseId, status])
  @@index([portalUserId, status])
  @@index([grantId, status])
  @@index([expiresAt])
  @@map("client_portal_document_shares")
}

model ClientPortalUploadRequest {
  id                String                          @id @default(cuid())
  uploadRequestRef  String                          @unique // external-safe; client URL param
  caseId            String
  case              Case                            @relation(fields: [caseId], references: [id])
  portalUserId      String?                         // UNRESOLVED: per-user vs grant-group
  portalUser        ClientPortalUser?               @relation(fields: [portalUserId], references: [id])
  grantId           String?
  grant             ClientPortalMatterGrant?        @relation(fields: [grantId], references: [id])
  title             String
  description       String?
  dueDate           DateTime?
  allowedFileTypes  String?                         // UNRESOLVED: string vs String[] vs JSON
  maxFileSize       Int?
  status            ClientPortalUploadRequestStatus
  requestedByUserId String
  requestedBy       User                            @relation(fields: [requestedByUserId], references: [id])
  requestedAt       DateTime
  completedAt       DateTime?
  revokedAt         DateTime?
  retentionPolicyKey String?                        // vocabulary UNRESOLVED
  createdAt         DateTime                        @default(now())
  updatedAt         DateTime                        @updatedAt

  uploadedFiles ClientPortalUploadedFile[]

  @@index([caseId, status])
  @@index([portalUserId, status])
  @@index([grantId, status])
  @@index([dueDate])
  @@map("client_portal_upload_requests")
}

model ClientPortalUploadedFile {
  id                     String                         @id @default(cuid())
  uploadedFileRef        String                         @unique // external-safe
  uploadRequestId        String
  uploadRequest          ClientPortalUploadRequest      @relation(fields: [uploadRequestId], references: [id]) // no cascade file deletion
  caseId                 String
  case                   Case                           @relation(fields: [caseId], references: [id])
  originalFileName       String?
  safeDisplayName        String
  mimeType               String?
  size                   Int?
  storageRef             String                         // INTERNAL ONLY — never client-facing; storage design UNRESOLVED
  status                 ClientPortalUploadedFileStatus
  uploadedByPortalUserId String
  uploadedBy             ClientPortalUser               @relation(fields: [uploadedByPortalUserId], references: [id])
  uploadedAt             DateTime
  reviewedByUserId       String?
  reviewedBy             User?                          @relation(fields: [reviewedByUserId], references: [id])
  reviewedAt             DateTime?
  rejectedAt             DateTime?
  retentionPolicyKey     String?
  createdAt              DateTime                       @default(now())
  updatedAt              DateTime                       @updatedAt
  // NOTE: intentionally NO relation to Document in V1 — an uploaded file is not
  // automatically an internal Document (separate intake/review bridge required).

  @@index([uploadRequestId, status])
  @@index([caseId, status])
  @@index([uploadedByPortalUserId, uploadedAt])
  @@index([reviewedAt])
  @@map("client_portal_uploaded_files")
}

model ClientPortalTask {
  id                     String                     @id @default(cuid())
  taskRef                String                     @unique // external-safe; client URL param
  caseId                 String
  case                   Case                       @relation(fields: [caseId], references: [id])
  portalUserId           String?                    // UNRESOLVED: per-user vs grant-group
  portalUser             ClientPortalUser?          @relation(fields: [portalUserId], references: [id])
  grantId                String?
  grant                  ClientPortalMatterGrant?   @relation(fields: [grantId], references: [id])
  title                  String
  description            String?
  dueDate                DateTime?
  status                 ClientPortalTaskStatus
  actionType             String?                    // UNRESOLVED: enum values
  relatedDocumentShareId String?
  relatedDocumentShare   ClientPortalDocumentShare? @relation(fields: [relatedDocumentShareId], references: [id])
  completedAt            DateTime?
  revokedAt              DateTime?
  createdByUserId        String
  createdBy              User                       @relation(fields: [createdByUserId], references: [id])
  createdAt              DateTime                   @default(now())
  updatedAt              DateTime                   @updatedAt
  // NOTE: intentionally NO relation to the internal Task model — a portal task is
  // separate by default; a completion bridge would be a separately-approved design.

  @@index([portalUserId, caseId, status])
  @@index([grantId, status])
  @@index([dueDate])
  @@index([relatedDocumentShareId])
  @@map("client_portal_tasks")
}

model ClientPortalAuditEvent {
  id            String                  @id @default(cuid())
  auditRef      String?                 @unique // UNRESOLVED: whether needed at all
  portalUserId  String?
  portalUser    ClientPortalUser?       @relation(fields: [portalUserId], references: [id]) // never cascade audit away
  caseId        String?
  case          Case?                   @relation(fields: [caseId], references: [id])
  documentId    String?                 // id reference only — NEVER content
  document      Document?               @relation(fields: [documentId], references: [id])
  action        ClientPortalAuditAction
  result        ClientPortalAuditResult
  reasonCode    String?                 // bounded code, never free-text content
  occurredAt    DateTime
  sessionRef    String?
  requestRef    String?
  ipHash        String?                 // hashed only; hashing policy UNRESOLVED
  userAgentHash String?                 // hashed only
  createdAt     DateTime                @default(now())
  // CONTENT-FREE BY CONSTRUCTION: no content/snippet/prompt/output columns,
  // and no unconstrained Json metadata column in this draft.

  @@index([portalUserId, occurredAt])
  @@index([caseId, occurredAt])
  @@index([action, occurredAt])
  @@index([result, occurredAt])
  @@map("client_portal_audit_events") // COLLISION: legacy candidate table uses this name — reconcile.
}
```

## Known Prisma/dialect limitations

- **Partial indexes** (e.g. unique active grant per `(portalUserId, caseId)` WHERE
  `status = 'ACTIVE'`) are **not expressible directly in Prisma schema** — they need
  raw SQL in the migration or app-level enforcement; this is why the draft avoids a
  plain `@@unique` there.
- **Nullable unique / composite semantics** (`auditRef String? @unique`, nullable FK
  members of composite indexes) require DB-specific review (Postgres treats NULLs as
  distinct in unique indexes).
- **Enum changes are migration-sensitive**: adding values is easy, removing/renaming
  is hard to roll back; the legacy candidate enums use different values, so any
  reconciliation is itself migration-sensitive.
- **`onDelete` behavior must be reviewed per relation** — the frozen rule is
  revoke-over-delete and no cascade into (or out of) internal models; the draft
  leaves `onDelete` unspecified with comments rather than guessing.
- **Index overuse should be avoided** — the draft lists candidate indexes from the
  relation/index spec, but the first migration should include only those justified
  by the concrete query design.

## Draft review checklist

- compare relation names / back-relation fields with the actual `schema.prisma`
  (including the legacy candidate block collisions);
- validate against a **clone only after approval** — never production;
- **manually review the generated migration** line by line;
- check **enum drift** against the legacy candidate enums;
- confirm **no `workspaceText`** anywhere;
- confirm **no broad JSON payloads** (the draft deliberately has none);
- confirm **no cascade-delete risk** (explicit `onDelete` decisions made);
- confirm **no production apply**.

## Final non-authorization

- **This draft is not implementation.**
- **No migration exists.**
- **No DB-backed portal exists.**
- **CP-SCHEMA-1 remains blocked**; production apply remains NO-GO; Client Portal
  remains inert.
