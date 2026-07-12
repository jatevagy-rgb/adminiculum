# Client Portal Legacy Candidate Block Inventory

## Purpose

This is a **documentation-only** inventory of the existing inert Client Portal
candidate block in `Backend/prisma/schema.prisma`. It exists so the collision
strategy and any future schema patch work from exact facts. It authorizes nothing.

## Inventory method

- `schema.prisma` **inspected only** (models ~lines 2014–2236, enums ~1871–2012);
- **no edit**;
- **no DB query**;
- **no migration**.

Related fact: a committed legacy migration exists —
`Backend/prisma/migrations/20260702140000_add_client_portal_foundation/` — so the
legacy tables **may already exist in any database where that migration was
applied**. Whether they exist (and whether they are empty) **in production** is an
operator-verified open question (see the collision strategy doc), especially given
the previously documented production `_prisma_migrations` history divergence.

## Existing legacy models/enums

### Models (7)

| Model | Mapped table | Purpose (inferred) | Final plan disposition | Mismatch notes |
| --- | --- | --- | --- | --- |
| `ClientPortalUser` | `client_portal_users` | External portal principal | **Collides with final model of the same name — replace/reconcile** | Legacy has `passwordHash`, `emailNormalized`, optional `externalSubjectId`, status default `INVITED`; final plan wants required unique `externalAuthSubject`, `portalUserRef`, `linkedClientId?`, no password decision made. |
| `ClientPortalMembership` | `client_portal_memberships` | Client-scoped membership with roles/team scopes | **Deprecate (stale)** | Final plan rejected membership semantics — access must be matter-specific grants, not standing client membership. `onDelete: Cascade` from user. |
| `ClientVisibleArtifact` | `client_visible_artifacts` | Polymorphic client-visible artifact with `payload Json` | **Deprecate (stale)** | Final plan splits this into `ClientPortalMatterPublication` / `ClientPortalDocumentShare` / `ClientPortalUploadRequest` / `ClientPortalTask`; unconstrained `Json` payload violates the no-broad-JSON rule. |
| `ClientPortalGrant` | `client_portal_grants` | Artifact-level grant (action/scope) | **Deprecate (stale); superseded by `ClientPortalMatterGrant`** | Grants attach to artifacts, not matters; `onDelete: Cascade` from artifact — cascade risk the final plan forbids. |
| `ClientSubmission` | `client_submissions` | Inbound portal submission with `payload Json?` + `body` | **Deprecate (stale)** | Final plan uses explicit `ClientPortalUploadRequest`/`ClientPortalUploadedFile` and defers messages; free-text `body` + `Json` payload need content review. |
| `ClientSubmissionAttachment` | `client_submission_attachments` | Uploaded file metadata (scan status, `storageRef`, `acceptedDocumentId`) | **Deprecate (stale); concepts reused in `ClientPortalUploadedFile`** | Closest legacy analogue to the final uploaded-file model; scan-status enum and `acceptedDocumentId` link are useful references but the final model has no `Document` relation in V1. |
| `ClientPortalAuditEvent` | `client_portal_audit_events` | Portal audit with `metadata Json?` and `outcome` | **Collides with final model of the same name — replace/reconcile** | Legacy `metadata Json?` violates content-free-by-construction; legacy actions are artifact/membership-centric; final uses `result` (`ClientPortalAuditResult`) vs legacy `outcome` (`ClientPortalAuditOutcome`). |

### Enums (16)

| Enum | Values | Final plan disposition | Mismatch notes |
| --- | --- | --- | --- |
| `ClientPortalUserStatus` | `INVITED, ACTIVE, SUSPENDED, REVOKED` | **Name collides with final enum — reconcile** | Final recommends `ACTIVE/SUSPENDED/REVOKED`; `INVITED` is an open question — value sets differ. |
| `ClientPortalMembershipRole` | `REQUESTER, TEAM_LEAD, CLIENT_MANAGER, CLIENT_ADMIN` | Deprecate with membership | No final counterpart. |
| `ClientPortalMembershipStatus` | `INVITED, ACTIVE, SUSPENDED, REVOKED` | Deprecate with membership | No final counterpart. |
| `ClientVisibleArtifactType` | 11 values (`REQUEST` … `INTEGRATION_AUDIT_ITEM`) | Deprecate with artifact | Polymorphism replaced by explicit models. |
| `ClientVisibleArtifactStatus` | `DRAFT, PENDING_APPROVAL, APPROVED, PUBLISHED, REVOKED, EXPIRED, SUPERSEDED` | Deprecate with artifact | Final uses per-model status enums. |
| `ClientVisibleSourceType` | `CASE, TASK, DOCUMENT, DOCUMENT_VERSION, COMMUNICATION, TIME_REPORT, CONNECTOR, MANUAL` | Deprecate with artifact | |
| `ClientPortalGrantAction` | `READ, DOWNLOAD, UPLOAD, COMMENT, MANAGE, VIEW_REPORT, VIEW_INTEGRATION` | Deprecate with artifact grant | Final grant has `grantType`/`visibilityScope` (shape unresolved). |
| `ClientPortalGrantScope` | `CLIENT, TEAM, ROLE, MEMBERSHIP, REQUESTER_OWN` | Deprecate with artifact grant | Scope-by-membership contradicts matter-specific grants. |
| `ClientPortalGrantStatus` | `ACTIVE, REVOKED, EXPIRED` | **Name collides with final enum — values happen to be identical; reuse possible** | Only enum where legacy and final value sets match exactly. |
| `ClientSubmissionType` | `NEW_REQUEST, MESSAGE, DOCUMENT_UPLOAD, CLARIFICATION, PROFILE_ADMIN, INTEGRATION_ADMIN` | Deprecate with submission | |
| `ClientSubmissionStatus` | `SUBMITTED, IN_TRIAGE, ACCEPTED_INTERNAL, NEEDS_CLARIFICATION, REJECTED, CLOSED` | Deprecate with submission | |
| `ClientSubmissionAttachmentScanStatus` | `PENDING, CLEAN, BLOCKED, FAILED` | Deprecate; useful reference for future scan design | Final uploaded-file scan state is unresolved. |
| `ClientSubmissionAttachmentStatus` | `PENDING_REVIEW, ACCEPTED, REJECTED` | Deprecate; concepts fold into `ClientPortalUploadedFileStatus` | Final adds `RECEIVED/UNDER_REVIEW/DELETED`. |
| `ClientPortalActorType` | `CLIENT_PORTAL_USER, INTERNAL_USER, SYSTEM, CONNECTOR` | Deprecate or reconsider | Final audit model keys on `portalUserId` only; internal/system actor representation unresolved. |
| `ClientPortalAuditAction` | 16 values (`LOGIN_SUCCEEDED` … `MEMBERSHIP_REVOKED`) | **Name collides with final enum — different value sets; reconcile** | Legacy is artifact/membership-centric; final draft is matter/document/task/upload-centric. |
| `ClientPortalAuditOutcome` | `SUCCESS, DENIED, FAILED` | No name collision; final plan names it `ClientPortalAuditResult` with identical values | Rename-vs-reuse decision needed. |

## Collision/mismatch table

| Legacy item | Final planned item | Collision type | Recommended disposition |
| --- | --- | --- | --- |
| model `ClientPortalUser` (`client_portal_users`) | model `ClientPortalUser` (`client_portal_users`) | **Model name + table name** | Replace with final definition (field reconciliation: auth posture, `externalAuthSubject`, `portalUserRef`) after human approval. |
| model `ClientPortalAuditEvent` (`client_portal_audit_events`) | model `ClientPortalAuditEvent` (`client_portal_audit_events`) | **Model name + table name** | Replace with final content-free definition (drop `metadata Json?`) after human approval. |
| enum `ClientPortalUserStatus` | enum `ClientPortalUserStatus` | **Enum name; value drift (`INVITED`)** | Reconcile with the INVITED open question, then replace. |
| enum `ClientPortalGrantStatus` | enum `ClientPortalGrantStatus` | **Enum name; identical values** | Reuse as-is or carry over unchanged. |
| enum `ClientPortalAuditAction` | enum `ClientPortalAuditAction` | **Enum name; disjoint value sets** | Replace values wholesale (migration-sensitive; enum value removal). |
| enum `ClientPortalAuditOutcome` | enum `ClientPortalAuditResult` | Semantic twin, different name | Decide rename vs reuse before patch. |
| model `ClientPortalMembership` + enums | — (rejected concept) | Stale concept | Deprecate/remove after verifying table emptiness. |
| model `ClientVisibleArtifact` + enums | 4 explicit final models | Stale concept (polymorphic) | Deprecate/remove; map any needed concepts explicitly. |
| model `ClientPortalGrant` + enums | model `ClientPortalMatterGrant` | Stale concept (artifact-grant vs matter-grant) | Deprecate/remove; no name/table collision (`client_portal_matter_grants` is new). |
| model `ClientSubmission` / `ClientSubmissionAttachment` + enums | `ClientPortalUploadRequest` / `ClientPortalUploadedFile` | Stale concept | Deprecate/remove; carry scan/`acceptedDocumentId` ideas into future upload design. |
| migration `20260702140000_add_client_portal_foundation` | — | Applied-history artifact | Do **not** delete the migration file; handle via a new forward migration after clone verification. |

## Inventory conclusion

- **The legacy block is not enough as-is**: membership/artifact semantics contradict
  the frozen grant/share/publication model, `Json` payloads violate the
  content-rules, and two cascade deletes (`user → memberships`,
  `artifact → grants`) contradict the no-cascade rule.
- **The final decision still requires human approval** (replace vs rename vs keep),
  plus operator verification of whether the legacy tables exist and are empty in
  production.
- **No schema change is authorized** by this inventory.
