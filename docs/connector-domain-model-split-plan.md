# Connector Domain Model Split Plan

Classification target: `connector_domain_model_split_plan_documented_no_runtime_change`

Document date: 2026-07-01

This is a docs-only future domain model split plan for Adminiculum's universal connector layer. It does not edit `Backend/prisma/schema.prisma`, create Prisma migrations, add API routes, add frontend UI, connect to external systems, add secrets, modify auth, enable the client portal, deploy, or change runtime behavior.

## 1. Executive summary

The connector domain should be additive, client-scoped, and isolated from both internal Adminiculum users and future client portal users.

Core normalized flow:

`External system task / issue / card / item -> ExternalWorkflowEvent -> ExternalIntakeItem -> Adminiculum legal request / communication / case / task / document review`

Key recommendations:

- split connector persistence into multiple migration phases;
- start with inert connection/event/log foundations;
- keep raw inbound data internal and not client-visible;
- link external objects to Adminiculum resources without granting visibility;
- make outbound status/comment sync approval-gated;
- store credential references only, never raw credential values;
- use strings/JSON for high-churn adapter fields and enums only for stable security states.

This plan should not proceed to migration until the broader Client Portal/baseline migration proof blockers are resolved.

## 2. Current schema anchor review

Observed conventions in `Backend/prisma/schema.prisma`:

- dominant ID style: `String @id @default(uuid())`;
- table mapping: `@@map("snake_case_plural")`;
- timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`;
- many feature foundations are additive and nullable where runtime rollout needs safety;
- sensitive work-product models stay internal by default.

Relevant current anchors:

| Current model | Table | Connector relationship later |
| --- | --- | --- |
| `Client` | `clients` | ownership root for external connections, queues, intake, approvals, logs |
| `User` | `users` | internal creator/updater/triager/approver references only |
| `Case` | `cases` | optional linked Adminiculum resource after triage |
| `Task` | `tasks` | optional linked Adminiculum task after triage |
| `Communication` | `communications` | optional linked communication/intake source |
| `Document` | `documents` | optional copied attachment/document after controlled import |

Existing integration-related foundation:

- `Communication` already has provider-shaped Outlook import fields (`externalMessageId`, `providerConversationId`, `mailboxAddress`, `direction`, `source`, `syncStatus`, metadata/recipients).
- Outlook import service and Graph adapter planning are communication-specific, not the generic Client Portal connector model.
- No generic connector schema models currently exist.

Current models that must not be directly exposed to external systems:

- internal `Task`;
- internal `Communication`;
- internal `Comment`;
- `DocumentReviewSuggestion`;
- `LegalAnalysis`;
- `ContractReviewRecord`;
- `BlockReviewNote`;
- `LawyerHandoffPackage`;
- `TimeEntry`;
- AI/generation/anonymization artifacts;
- SharePoint metadata beyond approved portal/publication links.

Connector data should be isolated in `External*` models and only link to internal models after explicit triage or approval.

## 3. Domain model layers

| Layer | Purpose | Key entity | Security role | MVP/later | Client Portal relationship |
| --- | --- | --- | --- | --- | --- |
| 1. Connection configuration | Represents external system connection for one client | `ExternalConnection` | client-scoped credential boundary | MVP | client admin may configure later |
| 2. Queue/project scope | Selected legal queue allowed for watch | `ExternalWorkflowQueue` | prevents full workspace scraping | MVP | may show configured queue status |
| 3. Raw inbound events | Webhook/API/email event envelope | `ExternalWorkflowEvent` | audit/dedupe, not client-visible | MVP | internal only |
| 4. Normalized intake | Safe intake candidate | `ExternalIntakeItem` | internal triage object | MVP | portal-visible only after publication/request creation |
| 5. Object linking | Stable external/internal resource link | `ExternalObjectLink` | correlation, not visibility grant | MVP | may power source badges/links after grants |
| 6. Outbound approval | Gate external status/comment/link | `ExternalSyncApproval` | prevents leakage | MVP for outbound phase | approved client-visible messages/status |
| 7. Sync log/audit | Operational connector history | `ExternalSyncLog` / audit integration | redacted traceability | MVP | redacted feed later |
| 8. Adapter configuration | Capabilities/mapping metadata | `ConnectorAdapterCapability`, mapping models/config | avoids app-specific business logic | later/static first | admin setup wizard later |

## 4. Proposed future entities

The following are conceptual future schema entities only. Do not paste into Prisma until a separate migration task is approved.

### A) `ExternalConnection`

Purpose: one configured external workflow system connection for one client.

Proposed fields:

- `id`
- `clientId`
- `systemType`
- `displayName`
- `status`
- `integrationLevel`
- `credentialRef`
- `healthStatus`
- `lastHealthCheckAt`
- `createdByInternalUserId`
- `updatedByInternalUserId`
- `createdAt`
- `updatedAt`
- `disabledAt`
- `revokedAt`
- `metadata Json`

Security:

- connection is client-scoped;
- connection does not grant access to internal Adminiculum APIs;
- credentials must not live in normal text fields;
- revocation must stop inbound fetch/subscriptions and pending outbound sends.

Suggested mapping later: `@@map("external_connections")`.

### B) `ExternalWorkflowQueue`

Purpose: selected legal queue/project/board/list watched by a connection.

Proposed fields:

- `id`
- `externalConnectionId`
- `clientId`
- `externalQueueId`
- `externalQueueName`
- `externalQueueUrl`
- `queueType`
- `status`
- `inboundEnabled`
- `outboundEnabled`
- `attachmentPolicy`
- `allowedEventTypes Json`
- `clientTeamMapping Json`
- `createdAt`
- `updatedAt`
- `disabledAt`

Security:

- queue scoping is mandatory;
- no full workspace scraping;
- disabled queues reject inbound events and outbound actions.

Suggested mapping later: `@@map("external_workflow_queues")`.

### C) `ExternalWorkflowEvent`

Purpose: raw inbound event envelope for webhook/API/email bridge.

Proposed fields:

- `id`
- `clientId`
- `externalConnectionId`
- `externalQueueId`
- `externalSystem`
- `externalEventId`
- `externalObjectId`
- `eventType`
- `eventTimestamp`
- `receivedAt`
- `payloadHash`
- `payloadRedacted Json`
- `rawPayloadStorageRef`
- `signatureVerified`
- `verificationStatus`
- `processingStatus`
- `errorCode`
- `errorMessage`
- `idempotencyKey`
- `createdAt`

Security:

- raw payload must be redacted or stored safely;
- no secrets in logs;
- no client visibility;
- failed verification must not create intake.

Suggested mapping later: `@@map("external_workflow_events")`.

### D) `ExternalIntakeItem`

Purpose: normalized internal legal intake item.

Proposed fields:

- `id`
- `clientId`
- `externalConnectionId`
- `externalQueueId`
- `sourceEventId`
- `externalSystem`
- `externalObjectId`
- `externalUrl`
- `title`
- `description`
- `requesterName`
- `requesterEmail`
- `teamName`
- `deadline`
- `priority`
- `sourceStatus`
- `labels Json`
- `attachmentRefs Json`
- `commentRefs Json`
- `suggestedLegalCategory`
- `suggestedAdminiculumAction`
- `triageStatus`
- `linkedCaseId`
- `linkedTaskId`
- `linkedCommunicationId`
- `linkedDocumentIds Json`
- `triagedByInternalUserId`
- `triagedAt`
- `createdAt`
- `updatedAt`

Security:

- internal only until triage/publication;
- does not equal legal advice;
- does not automatically become client-visible;
- suggestion fields are not AI claims unless real AI is later implemented.

Suggested mapping later: `@@map("external_intake_items")`.

### E) `ExternalObjectLink`

Purpose: stable link between external workflow object and Adminiculum object.

Proposed fields:

- `id`
- `clientId`
- `externalConnectionId`
- `externalQueueId`
- `externalSystem`
- `externalObjectId`
- `externalUrl`
- `adminiculumResourceType`
- `adminiculumResourceId`
- `linkStatus`
- `createdByInternalUserId`
- `createdAt`
- `updatedAt`
- `revokedAt`

Security:

- linking does not imply external visibility of the internal object;
- link may power correlation and source chips only after portal visibility rules allow it.

Suggested mapping later: `@@map("external_object_links")`.

### F) `ExternalSyncApproval`

Purpose: approval gate for outbound status/comment/link.

Proposed fields:

- `id`
- `clientId`
- `externalConnectionId`
- `externalObjectLinkId`
- `targetExternalObjectId`
- `outboundType`
- `proposedStatus`
- `proposedComment`
- `proposedUrl`
- `payloadPreview Json`
- `status`
- `proposedByInternalUserId`
- `approvedByInternalUserId`
- `approvedAt`
- `rejectedByInternalUserId`
- `rejectedAt`
- `sentAt`
- `failureReason`
- `createdAt`
- `updatedAt`

Security:

- outbound cannot be sent unless approved;
- forbidden internal fields must never be in `payloadPreview`;
- approval snapshot must be immutable enough for audit.

Suggested mapping later: `@@map("external_sync_approvals")`.

### G) `ExternalSyncLog`

Purpose: operational sync log for inbound/outbound connector activity.

Proposed fields:

- `id`
- `clientId`
- `externalConnectionId`
- `externalQueueId`
- `direction`
- `action`
- `status`
- `externalObjectId`
- `relatedEventId`
- `relatedIntakeItemId`
- `relatedApprovalId`
- `resourceType`
- `resourceId`
- `errorCode`
- `errorMessage`
- `metadata Json`
- `createdAt`

Security:

- logs must be redacted;
- no credentials;
- no raw privileged payloads.

Suggested mapping later: `@@map("external_sync_logs")`.

### H) `ExternalConnectorAuditEvent`

Question: separate connector audit table or reuse future `ClientPortalAuditEvent`?

Options:

1. Separate connector audit table.
2. Reuse `ClientPortalAuditEvent`.
3. Use a future generic Adminiculum audit table.

Recommendation:

- use connector-specific sync logs plus future broader audit integration;
- do not overload `ClientPortalAuditEvent` because connectors can operate before portal publication and may produce internal-only events;
- if a generic audit table exists later, connector audit can feed it through a redacted adapter.

### I) `ExternalCredentialRef`

Purpose: pointer to external credentials without storing secrets.

Proposed fields:

- `id`
- `externalConnectionId`
- `provider`
- `keyVaultSecretName` or `secretRef`
- `credentialType`
- `status`
- `expiresAt`
- `lastRotatedAt`
- `createdAt`
- `updatedAt`

Security:

- consider storing this only as secret-store metadata;
- actual secret values must not be in DB;
- never return secret values from APIs;
- revocation/rotation must be audited.

Suggested mapping later, if persisted: `@@map("external_credential_refs")`.

### J) `ConnectorAdapterCapability`

Purpose: describes what an adapter supports.

Possible fields:

- `systemType`
- `supportsWebhook`
- `supportsPolling`
- `supportsListQueues`
- `supportsAttachments`
- `supportsPostComment`
- `supportsUpdateStatus`
- `supportsOAuth`
- `supportsServiceAccount`
- `supportsSignatureVerification`
- `notes`

Recommendation:

- static code/config first;
- DB table only if admin-configurable adapter metadata is needed later.

## 5. Relationship with Client Portal

Rules:

- connector inbound item is internal until triaged;
- connector item may later create or attach to `ClientPortalRequest`;
- client portal may show source badge and external ID only after the request/case/resource is client-visible;
- `ExternalObjectLink` may power portal source chips or external links only after visibility rules pass;
- outbound approval may create client-visible message/status;
- connector audit may feed a redacted client-visible integration/audit log later.

Client portal visibility remains governed by:

- portal identity;
- active membership;
- role/scope;
- explicit grants/publications;
- client-safe DTOs.

Connector data does not bypass those rules.

## 6. Relationship with existing internal models

### `Client`

- Owns connector connections, queues, events, intake items, links, approvals, and logs.
- `clientId` is an ownership anchor, not a visibility grant.

### `User`

- References internal users for created/updated/triaged/proposed/approved actions.
- External workflow users and connector actors must not be stored as internal `User`.

### `Case`

- `ExternalIntakeItem` may be triaged into a new or existing case.
- `ExternalObjectLink` may link external object to case.
- Link does not sync case internals outward.

### `Task`

- `ExternalIntakeItem` may become an internal task.
- Internal task status/history does not sync outward automatically.
- Approved outbound status uses `ExternalSyncApproval`, not raw task state.

### `Communication`

- Connector intake may become or link to a communication.
- Internal communication thread does not sync outward automatically.
- Raw internal communications remain internal.

### `Document`

- Attachment metadata stays on intake unless controlled copy is approved.
- Copied file may create/link to `Document`.
- Document review comments/redlines do not sync outward.

Forbidden direct exposure:

- internal tasks;
- internal communication threads;
- document review comments;
- case internal notes;
- legal analysis;
- AI drafts/summaries;
- time entries and billing internals.

## 7. Enum/string strategy

Use Prisma enums for stable, security-significant state. Prefer strings/JSON for platform-specific or high-churn values.

| Candidate | Example values | Stability | Security importance | Recommendation |
| --- | --- | --- | --- | --- |
| `ExternalSystemType` | `JIRA`, `BITRIX24`, `MICROSOFT_GRAPH`, `ASANA`, `MONDAY`, `TRELLO`, `CLICKUP`, `GENERIC_WEBHOOK`, `EMAIL_BRIDGE`, `CUSTOM_API` | Medium | Medium | enum if list is curated; string if marketplace expands rapidly |
| `ExternalConnectionStatus` | `DRAFT`, `ACTIVE`, `DISABLED`, `ERROR`, `REVOKED` | High | High | enum |
| `ExternalIntegrationLevel` | `LINK_ONLY`, `INBOUND`, `APPROVED_OUTBOUND`, `ADVANCED_SYNC` | High | High | enum |
| `ExternalQueueType` | `PROJECT`, `BOARD`, `LIST`, `PLAN`, `GROUP`, `MAILBOX`, `CUSTOM` | Medium | Medium | enum or string; enum acceptable for MVP |
| `ExternalQueueStatus` | `ACTIVE`, `DISABLED`, `ERROR` | High | High | enum |
| `ExternalAttachmentPolicy` | `METADATA_ONLY`, `CONTROLLED_COPY`, `AUTOMATIC_COPY` | High | High | enum |
| `ExternalEventProcessingStatus` | `RECEIVED`, `NORMALIZED`, `IGNORED`, `DUPLICATE`, `FAILED` | High | High | enum |
| `ExternalVerificationStatus` | `VERIFIED`, `FAILED`, `SKIPPED`, `UNSUPPORTED` | High | High | enum |
| `ExternalIntakeTriageStatus` | `RECEIVED`, `NEEDS_REVIEW`, `LINKED`, `CONVERTED_TO_REQUEST`, `CONVERTED_TO_CASE`, `CONVERTED_TO_TASK`, `DOCUMENT_REVIEW_STARTED`, `IGNORED`, `DUPLICATE`, `ERROR` | High | High | enum |
| `ExternalAdminiculumResourceType` | `CASE`, `TASK`, `COMMUNICATION`, `DOCUMENT`, `CLIENT_PORTAL_REQUEST`, `OTHER` | Medium | High | enum with `OTHER`, or string if resource catalog grows |
| `ExternalObjectLinkStatus` | `ACTIVE`, `ARCHIVED`, `BROKEN`, `REVOKED` | High | Medium | enum |
| `ExternalOutboundType` | `STATUS`, `COMMENT`, `LINK`, `DOCUMENT_METADATA`, `CLARIFICATION_REQUEST` | Medium | High | enum for allowlist |
| `ExternalSyncApprovalStatus` | `DRAFT`, `PROPOSED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `SENT`, `FAILED`, `REVOKED` | High | High | enum |
| `ExternalSyncDirection` | `INBOUND`, `OUTBOUND` | High | Medium | enum |
| `ExternalSyncLogStatus` | `SUCCESS`, `FAILED`, `SKIPPED`, `DUPLICATE`, `RETRYING` | High | Medium | enum |
| `ExternalCredentialType` | `OAUTH`, `API_TOKEN`, `WEBHOOK_SECRET`, `SERVICE_ACCOUNT` | High | High | enum |
| `ExternalCredentialStatus` | `ACTIVE`, `EXPIRED`, `REVOKED`, `ROTATION_REQUIRED` | High | High | enum |

For adapter-specific action names, external event names, provider statuses, and custom field types, use strings with validation/mapping rather than enums.

## 8. Index and constraint strategy

Suggested indexes/constraints:

- `ExternalConnection`: index `[clientId, systemType, status]`.
- `ExternalConnection`: optional unique active connection name per client.
- `ExternalWorkflowQueue`: unique `[externalConnectionId, externalQueueId]`.
- `ExternalWorkflowQueue`: index `[clientId, status]`.
- `ExternalWorkflowEvent`: unique `[externalConnectionId, externalEventId]` when provider event ID is reliable.
- `ExternalWorkflowEvent`: unique `idempotencyKey`.
- `ExternalWorkflowEvent`: index `[externalConnectionId, createdAt]`.
- `ExternalWorkflowEvent`: index `[processingStatus, createdAt]`.
- `ExternalIntakeItem`: index `[clientId, triageStatus]`.
- `ExternalIntakeItem`: index `[externalConnectionId, externalObjectId]`.
- `ExternalIntakeItem`: index `[linkedCaseId]`, `[linkedTaskId]`, `[linkedCommunicationId]` if scalar links are kept.
- `ExternalObjectLink`: unique-ish composite `[externalConnectionId, externalObjectId, adminiculumResourceType, adminiculumResourceId]`.
- `ExternalObjectLink`: index `[clientId, linkStatus]`.
- `ExternalSyncApproval`: index `[clientId, status]`.
- `ExternalSyncApproval`: index `[externalConnectionId, targetExternalObjectId]`.
- `ExternalSyncLog`: index `[externalConnectionId, createdAt]`.
- `ExternalSyncLog`: index `[clientId, createdAt]`.
- `ExternalCredentialRef`: unique `[externalConnectionId, provider, credentialType]` if multiple credential refs are not needed.

Warnings:

- avoid uniqueness that prevents legitimate multi-queue connections;
- allow multiple links where a single external object legitimately relates to a case and a task;
- dedupe must be strong enough to stop duplicate legal requests;
- index raw/high-cardinality JSON only after measured need.

## 9. Idempotency and dedupe model

Source fields:

- provider `eventId`;
- `externalObjectId`;
- `eventType`;
- `eventTimestamp`;
- `payloadHash`;
- `externalConnectionId`;
- `externalQueueId`.

Recommended idempotency key:

- `externalConnectionId + externalEventId` if the provider event ID is reliable.

Fallback:

- `externalConnectionId + externalObjectId + eventType + eventTimestamp + payloadHash`.

Rules:

- repeated webhook must not create duplicate `ExternalIntakeItem`;
- repeated status update should update/log duplicate safely;
- replay must be manual and audited;
- duplicate events may still append to `ExternalSyncLog`;
- dead-lettered events must preserve enough metadata for investigation.

## 10. Attachment/domain model

Options:

### A) JSON `attachmentRefs` on `ExternalIntakeItem`

Pros:

- simple MVP;
- no separate table;
- good for metadata-only intake.

Cons:

- weaker querying/reporting;
- harder per-attachment copy lifecycle.

### B) `ExternalAttachment` table

Fields if needed later:

- `id`
- `clientId`
- `externalConnectionId`
- `externalObjectId`
- `externalAttachmentId`
- `filename`
- `mimeType`
- `size`
- `externalUrl`
- `uploaderName`
- `uploaderEmail`
- `copiedDocumentId`
- `copyStatus`
- `createdAt`

Pros:

- proper lifecycle;
- better audit/querying;
- supports controlled copy workflows.

Cons:

- extra schema and migration surface.

### C) Map directly to `Document` only when copied

Recommendation:

- MVP stores metadata refs on `ExternalIntakeItem`;
- create `Document` only after controlled copy/approval;
- add `ExternalAttachment` later if metadata lifecycle needs table-level tracking.

## 11. Outbound payload safety model

Allowed outbound payload fields:

- `targetExternalObjectId`
- `outboundType`
- `safeStatus`
- `safeComment`
- `adminiculumPortalUrl`
- `correlationId`

Forbidden outbound fields:

- internal note;
- AI draft;
- detailed risk score;
- internal task ID unless transformed into safe external correlation;
- internal assignee comments;
- raw legal memo unless explicitly approved as document/link;
- internal communication content;
- document review annotations;
- billing/time/capacity data.

Implementation implication:

- `payloadPreview` should be generated from an allowlisted DTO, not copied from internal models.
- approval should snapshot the exact outgoing payload.

## 12. Migration split plan

Do not create migrations yet. Future connector schema should be split.

### CONNECTOR-SCHEMA-1 — inert connection foundation

Tables:

- `ExternalConnection`
- `ExternalWorkflowQueue`
- `ExternalWorkflowEvent`
- `ExternalSyncLog`
- optional credential reference metadata if safe

Purpose:

- connection/queue/event/log foundation;
- no runtime exposure by itself.

Risk:

- credential boundary and raw payload redaction.

Default-off:

- no adapters enabled;
- no client portal visibility;
- no outbound writes.

Tests needed:

- schema validate;
- event unique/idempotency constraints;
- no portal exposure.

### CONNECTOR-SCHEMA-2 — normalized intake and object links

Tables:

- `ExternalIntakeItem`
- `ExternalObjectLink`

Purpose:

- normalized triage and correlation.

Risk:

- external links mistaken as publication.

Default-off:

- internal-only triage until routes/policies exist.

Tests needed:

- intake not client-visible;
- object link does not grant access.

### CONNECTOR-SCHEMA-3 — outbound approval

Tables:

- `ExternalSyncApproval`
- outbound status/comment draft model if separate.

Purpose:

- approval-gated outbound writes.

Risk:

- forbidden content leakage.

Default-off:

- outbound disabled until policy and tests pass.

Tests needed:

- cannot send without approval;
- forbidden fields absent from payload.

### CONNECTOR-SCHEMA-4 — attachments

Tables:

- `ExternalAttachment` if needed.

Purpose:

- attachment metadata and controlled copy lifecycle.

Risk:

- storage/privacy and malware scanning.

Default-off:

- metadata-only unless policy enables copy.

Tests needed:

- metadata does not create `Document`;
- copied document is not portal-visible by default.

### CONNECTOR-SCHEMA-5 — adapter capability/settings

Tables/config:

- adapter capability metadata;
- field mapping;
- status mapping.

Purpose:

- configurable adapter behavior without app-specific business logic.

Risk:

- unstable schema if adapter details are over-modeled.

Default-off:

- mappings inactive until connection/queue activated.

Tests needed:

- mapping validation;
- unsupported action disabled.

## 13. MVP domain scope

Minimum MVP domain:

- `ExternalConnection`
- `ExternalWorkflowQueue`
- `ExternalWorkflowEvent`
- `ExternalIntakeItem`
- `ExternalObjectLink`
- `ExternalSyncApproval`
- `ExternalSyncLog`
- generic webhook adapter or link-only first

Explicitly defer:

- full bidirectional sync;
- automatic document copy;
- Microsoft Graph lifecycle;
- multi-queue complex mapping;
- AI auto-classification;
- connector marketplace;
- raw payload long-term retention;
- broad adapter capability DB if static config is enough.

## 14. Risk register

| Risk | Severity | Mitigation | Blocking for MVP |
| --- | --- | --- | --- |
| Connector tables grant access accidentally | Critical | Treat connector data as internal; portal grants/publications still required | Yes |
| External object link mistaken as publication | High | Link is correlation only; separate visibility model | Yes |
| Raw event payload contains sensitive data | High | Redaction, storage ref, retention policy | Yes |
| Duplicate events create duplicate legal requests | High | idempotency key and unique constraints | Yes |
| Outbound approval payload contains forbidden fields | Critical | allowlisted DTO and approval snapshot | Yes |
| Credential reference mishandled | Critical | secret store reference only, no raw secrets | Yes |
| Too many unstable enums | Medium | use strings/JSON for provider-specific churn | No if scoped |
| Attachment copying creates privacy/storage risk | High | metadata-first MVP, controlled copy later | Yes |
| Schema too app-specific | Medium | normalized core, adapter config outside business logic | Yes |
| Generic webhook malformed data | Medium | schema validation and dead-lettering | Yes |

## 15. Required future tests

Future tests before implementation:

- duplicate event ID does not create duplicate intake item;
- disabled connection rejects event;
- disabled queue rejects event;
- raw event is not client-visible;
- intake item is not client-visible by default;
- object link does not expose internal resource;
- outbound cannot send without approved status;
- forbidden fields cannot appear in outbound payload;
- credential value is never returned by API;
- attachment metadata does not create document automatically;
- copied attachment document is not portal-visible by default;
- client portal access still requires grants/publications;
- connector actor cannot satisfy internal auth;
- connector actor cannot satisfy client portal auth.

## 16. Open questions

- Should `ExternalSystemType` be enum or string for marketplace extensibility?
- Should raw payloads be stored at all in MVP, or only hashes/redacted excerpts?
- Should connector audit be a separate table or feed a future generic audit system?
- Should `ExternalCredentialRef` exist in DB or only as secret-store metadata?
- Should field/status mappings be JSON on queue, separate tables, or static config in MVP?
- Which first native adapter should follow generic webhook: Jira or Microsoft ecosystem?
- What retention period applies to failed raw events and dead-letter items?

## 17. Recommended next prompt

Recommended next prompt:

`Adminiculum — CONNECTOR1D connector migration draft review docs-only`

Suggested scope:

- no schema edit;
- no migration creation;
- review the proposed split and decide whether CONNECTOR-SCHEMA-1 should wait until CP-SCHEMA-1/baseline proof is unblocked;
- produce a draft Prisma/SQL review under docs only.

Final classification:

`connector_domain_model_split_plan_documented_no_runtime_change`
