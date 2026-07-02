# CP-SCHEMA-1 Migration SQL Draft Review

Classification target: `cp_schema1_migration_sql_draft_review_documented_no_migration_file_no_db_change_no_runtime_change`

This document reviews a **review-only** SQL draft for CP-SCHEMA-1. The SQL below was not applied to any database, no migration folder was created, no database connection was opened, and no production/Azure runtime was touched.

## 1. Executive summary

The CP-SCHEMA-1 Prisma schema candidate in commit `6fc5582` produces an additive SQL draft containing only:

- new Client Portal enums;
- new Client Portal tables;
- indexes for portal login, membership isolation, artifact publication lookup, grant resolution, submission triage, attachment lookup, and audit lookup;
- foreign keys from new portal tables to intended existing tables (`clients`) and to other new portal tables.

The draft does **not** drop existing tables, drop columns, rename columns, update existing rows, backfill visibility, enable Client Portal runtime, add routes, or make existing data client-visible.

Assessment: the SQL draft is a reasonable no-apply review candidate. It is **not production-ready** until a real migration file is created in a later task, reviewed, applied to a confirmed non-production clone, introspected, and separately approved for production.

## 2. Source commits compared

- Base schema: `2985f6d` (`docs: add CP-SCHEMA-1 implementation preflight`), before CP-SCHEMA-1 schema candidate.
- Candidate schema: `6fc5582` / current HEAD (`feat(prisma): draft CP-SCHEMA-1 candidate`).
- Compared file: `Backend/prisma/schema.prisma`.

Only the schema candidate commit is compared for this SQL draft. No migration files existed or were created for CP-SCHEMA-1 during this review.

## 3. Commands used

No database connection was used. `CLONE_DATABASE_URL` was not used.

Commands:

```powershell
$tmp = Join-Path $env:TEMP 'adminiculum-cp-schema1-diff'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
git show 2985f6d:Backend/prisma/schema.prisma | Set-Content -LiteralPath (Join-Path $tmp 'schema-before.prisma') -Encoding UTF8
Copy-Item -LiteralPath Backend\prisma\schema.prisma -Destination (Join-Path $tmp 'schema-after.prisma') -Force
npx.cmd prisma migrate diff --from-schema-datamodel (Join-Path $tmp 'schema-before.prisma') --to-schema-datamodel (Join-Path $tmp 'schema-after.prisma') --script | Set-Content -LiteralPath (Join-Path $tmp 'cp-schema1-diff.sql') -Encoding UTF8
```

One earlier attempt was run from `Backend/` with the wrong relative schema path and failed before producing output. It did not connect to any database and produced no migration file.

## 4. Generated SQL draft, sanitized

The following SQL is generated from schema-datamodel-to-schema-datamodel diff only. It is **review-only** and was **not applied**.

```sql
-- CreateEnum
CREATE TYPE "ClientPortalUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ClientPortalMembershipRole" AS ENUM ('REQUESTER', 'TEAM_LEAD', 'CLIENT_MANAGER', 'CLIENT_ADMIN');

-- CreateEnum
CREATE TYPE "ClientPortalMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ClientVisibleArtifactType" AS ENUM ('REQUEST', 'STATUS', 'TIMELINE_ITEM', 'TODO', 'DOCUMENT_REQUEST', 'DOCUMENT_VERSION', 'MESSAGE', 'DEADLINE', 'REPORT_SNAPSHOT', 'CONNECTOR_LINK', 'INTEGRATION_AUDIT_ITEM');

-- CreateEnum
CREATE TYPE "ClientVisibleArtifactStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REVOKED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ClientVisibleSourceType" AS ENUM ('CASE', 'TASK', 'DOCUMENT', 'DOCUMENT_VERSION', 'COMMUNICATION', 'TIME_REPORT', 'CONNECTOR', 'MANUAL');

-- CreateEnum
CREATE TYPE "ClientPortalGrantAction" AS ENUM ('READ', 'DOWNLOAD', 'UPLOAD', 'COMMENT', 'MANAGE', 'VIEW_REPORT', 'VIEW_INTEGRATION');

-- CreateEnum
CREATE TYPE "ClientPortalGrantScope" AS ENUM ('CLIENT', 'TEAM', 'ROLE', 'MEMBERSHIP', 'REQUESTER_OWN');

-- CreateEnum
CREATE TYPE "ClientPortalGrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ClientSubmissionType" AS ENUM ('NEW_REQUEST', 'MESSAGE', 'DOCUMENT_UPLOAD', 'CLARIFICATION', 'PROFILE_ADMIN', 'INTEGRATION_ADMIN');

-- CreateEnum
CREATE TYPE "ClientSubmissionStatus" AS ENUM ('SUBMITTED', 'IN_TRIAGE', 'ACCEPTED_INTERNAL', 'NEEDS_CLARIFICATION', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClientSubmissionAttachmentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'BLOCKED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClientSubmissionAttachmentStatus" AS ENUM ('PENDING_REVIEW', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ClientPortalActorType" AS ENUM ('CLIENT_PORTAL_USER', 'INTERNAL_USER', 'SYSTEM', 'CONNECTOR');

-- CreateEnum
CREATE TYPE "ClientPortalAuditAction" AS ENUM ('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'WORKSPACE_SELECTED', 'ARTIFACT_READ', 'ARTIFACT_DOWNLOADED', 'SUBMISSION_CREATED', 'ATTACHMENT_UPLOADED', 'ARTIFACT_PROPOSED', 'ARTIFACT_APPROVED', 'ARTIFACT_PUBLISHED', 'ARTIFACT_REVOKED', 'GRANT_CREATED', 'GRANT_REVOKED', 'MEMBERSHIP_INVITED', 'MEMBERSHIP_UPDATED', 'MEMBERSHIP_REVOKED');

-- CreateEnum
CREATE TYPE "ClientPortalAuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILED');

-- CreateTable
CREATE TABLE "client_portal_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'password',
    "externalSubjectId" TEXT,
    "status" "ClientPortalUserStatus" NOT NULL DEFAULT 'INVITED',
    "lastLoginAt" TIMESTAMP(3),
    "acceptedTermsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_portal_memberships" (
    "id" TEXT NOT NULL,
    "clientPortalUserId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" "ClientPortalMembershipRole" NOT NULL,
    "status" "ClientPortalMembershipStatus" NOT NULL DEFAULT 'INVITED',
    "teamScopeType" TEXT,
    "teamScopeId" TEXT,
    "teamDisplayName" TEXT,
    "invitedByInternalUserId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_portal_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_visible_artifacts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "artifactType" "ClientVisibleArtifactType" NOT NULL,
    "status" "ClientVisibleArtifactStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceType" "ClientVisibleSourceType",
    "sourceId" TEXT,
    "sourceCaseId" TEXT,
    "sourceDocumentId" TEXT,
    "sourceTaskId" TEXT,
    "sourceCommunicationId" TEXT,
    "proposedByInternalUserId" TEXT,
    "approvedByInternalUserId" TEXT,
    "publishedByInternalUserId" TEXT,
    "proposedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_visible_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_portal_grants" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "action" "ClientPortalGrantAction" NOT NULL DEFAULT 'READ',
    "scopeType" "ClientPortalGrantScope" NOT NULL,
    "status" "ClientPortalGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "role" "ClientPortalMembershipRole",
    "membershipId" TEXT,
    "teamScopeType" TEXT,
    "teamScopeId" TEXT,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "grantedByInternalUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_portal_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_submissions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientPortalUserId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "submissionType" "ClientSubmissionType" NOT NULL,
    "status" "ClientSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "title" TEXT,
    "body" TEXT,
    "payload" JSONB,
    "targetArtifactId" TEXT,
    "targetRequestArtifactId" TEXT,
    "idempotencyKey" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PORTAL',
    "triagedByInternalUserId" TEXT,
    "triagedAt" TIMESTAMP(3),
    "linkedCaseId" TEXT,
    "linkedTaskId" TEXT,
    "linkedDocumentId" TEXT,
    "linkedCommunicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_submission_attachments" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "safeFileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "checksumSha256" TEXT,
    "storageRef" TEXT,
    "scanStatus" "ClientSubmissionAttachmentScanStatus" NOT NULL DEFAULT 'PENDING',
    "status" "ClientSubmissionAttachmentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedDocumentId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_submission_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_portal_audit_events" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "actorType" "ClientPortalActorType" NOT NULL,
    "actorClientPortalUserId" TEXT,
    "actorMembershipId" TEXT,
    "actorInternalUserId" TEXT,
    "action" "ClientPortalAuditAction" NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "artifactId" TEXT,
    "submissionId" TEXT,
    "outcome" "ClientPortalAuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_portal_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_portal_users_status_idx" ON "client_portal_users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "client_portal_users_email_provider_key" ON "client_portal_users"("emailNormalized", "authProvider");

-- CreateIndex
CREATE INDEX "client_portal_memberships_user_status_idx" ON "client_portal_memberships"("clientPortalUserId", "status");

-- CreateIndex
CREATE INDEX "client_portal_memberships_client_status_idx" ON "client_portal_memberships"("clientId", "status");

-- CreateIndex
CREATE INDEX "client_portal_memberships_client_role_idx" ON "client_portal_memberships"("clientId", "role");

-- CreateIndex
CREATE INDEX "client_portal_memberships_team_scope_idx" ON "client_portal_memberships"("clientId", "teamScopeType", "teamScopeId");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_client_type_status_idx" ON "client_visible_artifacts"("clientId", "artifactType", "status");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_client_status_published_idx" ON "client_visible_artifacts"("clientId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_source_idx" ON "client_visible_artifacts"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_source_case_idx" ON "client_visible_artifacts"("sourceCaseId");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_source_document_idx" ON "client_visible_artifacts"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_source_task_idx" ON "client_visible_artifacts"("sourceTaskId");

-- CreateIndex
CREATE INDEX "client_visible_artifacts_source_communication_idx" ON "client_visible_artifacts"("sourceCommunicationId");

-- CreateIndex
CREATE INDEX "client_portal_grants_client_artifact_action_idx" ON "client_portal_grants"("clientId", "artifactId", "action");

-- CreateIndex
CREATE INDEX "client_portal_grants_client_scope_action_idx" ON "client_portal_grants"("clientId", "scopeType", "action");

-- CreateIndex
CREATE INDEX "client_portal_grants_membership_action_idx" ON "client_portal_grants"("membershipId", "action");

-- CreateIndex
CREATE INDEX "client_portal_grants_team_scope_idx" ON "client_portal_grants"("clientId", "teamScopeType", "teamScopeId");

-- CreateIndex
CREATE INDEX "client_submissions_client_status_created_idx" ON "client_submissions"("clientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "client_submissions_user_created_idx" ON "client_submissions"("clientPortalUserId", "createdAt");

-- CreateIndex
CREATE INDEX "client_submissions_membership_created_idx" ON "client_submissions"("membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "client_submissions_target_artifact_idx" ON "client_submissions"("targetArtifactId");

-- CreateIndex
CREATE INDEX "client_submissions_target_request_artifact_idx" ON "client_submissions"("targetRequestArtifactId");

-- CreateIndex
CREATE UNIQUE INDEX "client_submissions_client_idempotency_key" ON "client_submissions"("clientId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "client_submission_attachments_client_uploaded_idx" ON "client_submission_attachments"("clientId", "uploadedAt");

-- CreateIndex
CREATE INDEX "client_submission_attachments_submission_idx" ON "client_submission_attachments"("submissionId");

-- CreateIndex
CREATE INDEX "client_submission_attachments_document_idx" ON "client_submission_attachments"("acceptedDocumentId");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_client_created_idx" ON "client_portal_audit_events"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_portal_actor_idx" ON "client_portal_audit_events"("actorType", "actorClientPortalUserId", "createdAt");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_internal_actor_idx" ON "client_portal_audit_events"("actorInternalUserId", "createdAt");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_resource_idx" ON "client_portal_audit_events"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_artifact_idx" ON "client_portal_audit_events"("artifactId", "createdAt");

-- CreateIndex
CREATE INDEX "client_portal_audit_events_submission_idx" ON "client_portal_audit_events"("submissionId", "createdAt");

-- AddForeignKey
ALTER TABLE "client_portal_memberships" ADD CONSTRAINT "client_portal_memberships_clientPortalUserId_fkey" FOREIGN KEY ("clientPortalUserId") REFERENCES "client_portal_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_memberships" ADD CONSTRAINT "client_portal_memberships_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_visible_artifacts" ADD CONSTRAINT "client_visible_artifacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_grants" ADD CONSTRAINT "client_portal_grants_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_grants" ADD CONSTRAINT "client_portal_grants_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "client_visible_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_grants" ADD CONSTRAINT "client_portal_grants_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "client_portal_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_clientPortalUserId_fkey" FOREIGN KEY ("clientPortalUserId") REFERENCES "client_portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "client_portal_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_targetArtifactId_fkey" FOREIGN KEY ("targetArtifactId") REFERENCES "client_visible_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submissions" ADD CONSTRAINT "client_submissions_targetRequestArtifactId_fkey" FOREIGN KEY ("targetRequestArtifactId") REFERENCES "client_visible_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submission_attachments" ADD CONSTRAINT "client_submission_attachments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_submission_attachments" ADD CONSTRAINT "client_submission_attachments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "client_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_audit_events" ADD CONSTRAINT "client_portal_audit_events_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_audit_events" ADD CONSTRAINT "client_portal_audit_events_actorClientPortalUserId_fkey" FOREIGN KEY ("actorClientPortalUserId") REFERENCES "client_portal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_audit_events" ADD CONSTRAINT "client_portal_audit_events_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "client_portal_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_audit_events" ADD CONSTRAINT "client_portal_audit_events_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "client_visible_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_portal_audit_events" ADD CONSTRAINT "client_portal_audit_events_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "client_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


```

## 5. Table-by-table review

| Table | Purpose | Safety review |
| --- | --- | --- |
| `client_portal_users` | External portal identity separate from internal `users` | Additive. Does not reuse `UserRole.CLIENT`. Stores `passwordHash` field for future auth but no auth runtime is implemented. |
| `client_portal_memberships` | Tenant/client-scoped membership and role boundary | Additive. Requires `clientId` and `clientPortalUserId`; no membership exists by default. Route `clientId` trust is not introduced. |
| `client_visible_artifacts` | Publication-safe artifact shell | Additive. Existing internal objects are not exposed because no artifact rows are created and `PUBLISHED` still requires a grant. `payload` is JSONB and needs strict future validators. |
| `client_portal_grants` | Artifact access/action grants | Additive. Grants are scoped by `clientId`, `artifactId`, action, optional role/membership/team scope. No grants exist by default. |
| `client_submissions` | Client-originated inbound write/triage boundary | Additive. Default `SUBMITTED`; does not auto-create cases/tasks/documents/communications or artifacts. `body`/`payload` require future input validators. |
| `client_submission_attachments` | Metadata-only submission attachments | Additive. Stores metadata and opaque `storageRef`; no bytes, no raw signed URLs. |
| `client_portal_audit_events` | Content-minimal portal audit | Additive. JSONB `metadata` must stay redacted by future runtime validators. Audit does not grant visibility. |

## 6. Enum review

The draft creates these new enums only:

- `ClientPortalUserStatus`
- `ClientPortalMembershipRole`
- `ClientPortalMembershipStatus`
- `ClientVisibleArtifactType`
- `ClientVisibleArtifactStatus`
- `ClientVisibleSourceType`
- `ClientPortalGrantAction`
- `ClientPortalGrantScope`
- `ClientPortalGrantStatus`
- `ClientSubmissionType`
- `ClientSubmissionStatus`
- `ClientSubmissionAttachmentScanStatus`
- `ClientSubmissionAttachmentStatus`
- `ClientPortalActorType`
- `ClientPortalAuditAction`
- `ClientPortalAuditOutcome`

Risk: enum churn is possible as portal workflow semantics mature. If the team expects rapid value changes, the future migration prompt should reconsider whether some dimensions should become constrained strings instead of Postgres enums. Current enum set is acceptable as a draft because it is stable foundation vocabulary and inert until runtime exists.

## 7. Index review

Index coverage matches the intended lookup paths:

- Portal login lookup: `client_portal_users_email_provider_key`, `client_portal_users_status_idx`.
- Client/membership isolation: `client_portal_memberships_user_status_idx`, `client_portal_memberships_client_status_idx`, `client_portal_memberships_client_role_idx`, `client_portal_memberships_team_scope_idx`.
- Artifact publication/status: `client_visible_artifacts_client_type_status_idx`, `client_visible_artifacts_client_status_published_idx`.
- Source correlation: `client_visible_artifacts_source_*` indexes.
- Grant resolution: `client_portal_grants_client_artifact_action_idx`, `client_portal_grants_client_scope_action_idx`, `client_portal_grants_membership_action_idx`, `client_portal_grants_team_scope_idx`.
- Submission triage: `client_submissions_client_status_created_idx`, `client_submissions_user_created_idx`, `client_submissions_membership_created_idx`.
- Attachment lookup: `client_submission_attachments_client_uploaded_idx`, `client_submission_attachments_submission_idx`, `client_submission_attachments_document_idx`.
- Audit lookup: client/time, actor, resource, artifact, and submission indexes.

Noted risk: `client_submissions_client_idempotency_key` is a broad unique index over `[clientId, idempotencyKey]`. PostgreSQL permits multiple `NULL` values in a unique index, so nullable rows are workable, but a future real migration review may prefer a partial unique index where `idempotencyKey IS NOT NULL` for clarity.

## 8. FK/delete behavior review

Foreign keys point only to intended existing/new tables:

- Existing table FK: `clients` only.
- New table FKs: `client_portal_users`, `client_portal_memberships`, `client_visible_artifacts`, `client_submissions`.

Delete behavior:

| FK family | Delete behavior | Review |
| --- | --- | --- |
| Membership -> portal user | `CASCADE` | Acceptable draft, but retention policy should confirm whether revoked users may ever be hard-deleted. |
| Membership -> client | `RESTRICT` | Conservative; prevents silent tenant history deletion. |
| Artifact -> client | `RESTRICT` | Conservative; existing data is not exposed. |
| Grant -> client | `RESTRICT` | Conservative. |
| Grant -> artifact | `CASCADE` | Dependent grant rows follow artifact deletion. Production should prefer revoke over delete. |
| Grant -> membership | `SET NULL` | Preserves grant history shape without hard-coupling to deleted memberships. |
| Submission -> client/user/membership | `RESTRICT` | Conservative; preserves client-originated traceability. |
| Submission -> target artifacts | `SET NULL` | Safe for triage records if an artifact is removed/revoked. |
| Attachment -> client | `RESTRICT` | Conservative. |
| Attachment -> submission | `CASCADE` | Dependent metadata follows submission deletion; production should still prefer retention policy. |
| Audit -> client/user/membership/artifact/submission | `SET NULL` | Content-minimal audit survives deletions with redacted pointers. |

No foreign keys point from existing internal tables to new portal tables. That keeps the candidate inert relative to existing runtime paths.

## 9. Additive-only safety checklist

- Existing tables dropped: no.
- Existing columns dropped: no.
- Existing columns renamed: no.
- Existing indexes dropped: no.
- Existing data updated/backfilled: no.
- Existing data made client-visible: no.
- Existing routes/auth/runtime changed: no.
- New tables inert by default: yes; empty tables plus default states do not expose data.
- Feature flags enabled: no.
- Migration safe for production apply now: no; clone proof and production approval are still required.

## 10. Privacy/security checklist

- `UserRole.CLIENT` is not used as the Client Portal security model.
- Client Portal identity is separate via `client_portal_users`.
- Tenant isolation is represented by `client_portal_memberships.clientId`.
- Read path is represented by `client_visible_artifacts` + `client_portal_grants`.
- Publication is not a direct flag on internal `cases`, `tasks`, `documents`, or `communications`.
- Client submissions remain pending/triage-oriented and do not publish automatically.
- Attachments are metadata-only and do not expose raw signed URLs.
- Audit is content-minimal by schema intent, but future validators must prevent sensitive `metadata` payloads.
- JSONB risk exists in `client_visible_artifacts.payload`, `client_submissions.payload`, and `client_portal_audit_events.metadata`; runtime validators are mandatory before enablement.

## 11. Risks and open questions

1. **JSON payload validator dependency:** `payload` and `metadata` columns are intentionally flexible, but they are unsafe without strict allow-list validators.
2. **Enum churn:** some enum values may evolve; future migration review should decide whether any enum should become a constrained string.
3. **Idempotency uniqueness:** nullable `idempotencyKey` works in PostgreSQL, but partial unique SQL may be cleaner.
4. **Membership uniqueness:** no active-only uniqueness exists yet. This preserves history, but runtime must prevent duplicate active memberships or a future partial unique index should be added.
5. **No invitation table yet:** invitation flow still needs a later explicit model or runtime strategy.
6. **No team table yet:** team/workgroup semantics are string-scoped for now; later implementation must decide whether to add `ClientPortalTeam` or map to existing workgroups/departments.
7. **Production-like clone proof still required:** this SQL must be applied to clone/staging first in a later task, never straight to production.

## 12. Whether a real migration file creation prompt is safe next

Yes, a real migration file creation prompt is safe next **only if** it remains no-apply/no-DB and creates a reviewable migration folder without running any migration apply command.

It is not safe to apply to production yet.

## 13. Recommended next prompt

`Adminiculum — CP-SCHEMA-1 create migration file draft no apply`

Required constraints for that prompt:

- create a real Prisma migration folder/file for CP-SCHEMA-1 only;
- do not apply it;
- do not connect to DB;
- do not use `CLONE_DATABASE_URL`;
- do not run `prisma migrate deploy`, `prisma migrate dev`, or `prisma db push`;
- do not deploy;
- do not enable Client Portal runtime;
- confirm no existing data becomes client-visible;
- validate `prisma validate`, backend typecheck/tests, and `git diff --check`.

## 14. Final status

- Runtime change: no.
- Schema change: no.
- Migration change: no.
- DB change: no.
- DB connection used: no.
- Production/Azure touched: no.
- Secrets printed: no.
- SQL draft generated: yes, review-only.
- Real migration file created: no.
- Final classification: `cp_schema1_migration_sql_draft_review_documented_no_migration_file_no_db_change_no_runtime_change`.
