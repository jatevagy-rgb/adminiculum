# Universal Connector Compatibility Architecture

Classification target: `universal_connector_compatibility_architecture_documented_no_runtime_change`

Document date: 2026-07-01

This is a docs-only architecture plan for future Client Portal connected workflow systems. It does not create schema migrations, edit `Backend/prisma/schema.prisma`, add API routes, add frontend UI, change auth, enable the client portal, connect to external systems, add secrets, or deploy.

## 1. Executive summary

Adminiculum should support client workflow systems through one connector framework, not separate business logic per app.

Target product behavior:

- a client admin connects a workflow system once;
- the client admin selects a dedicated legal board, queue, project, folder, channel, list, label, or mailbox route such as `Jogi kérések`;
- client employees continue using their normal workflow system without per-user plugins;
- Adminiculum watches only the selected legal queue;
- inbound external items become normalized intake candidates;
- internal users triage intake into Adminiculum legal request, communication, case, task, or document-review workflow;
- outbound status/comment sync is approved before leaving Adminiculum;
- sensitive lawyer work product never syncs out.

Core normalized path:

`external task/item/card/issue/message -> ExternalWorkflowEvent -> ExternalIntakeItem -> Adminiculum legal request / communication / case / task / document review`

The architecture should cover at least 80% of client workflow systems by combining native adapters, generic webhooks, email bridge intake, automation-platform bridges, and link-only fallback.

## 2. Product goal: one connector pack, many workflow apps

The connector pack should make connected intake feel consistent across:

- Jira;
- Bitrix24;
- Microsoft Teams / Planner / Microsoft Graph;
- Asana;
- Monday;
- Trello;
- ClickUp;
- generic webhook systems;
- email bridge;
- Make / Zapier / Power Automate;
- custom API/webhook systems.

Product principles:

- Client employees do not install per-user plugins.
- Client admin configures the integration once.
- The connector scopes to the selected legal queue only.
- The connector is revocable.
- Connector actor is not an internal Adminiculum user.
- Inbound may be automatic.
- Outbound must be lawyer/admin approved.
- Sensitive documents should preferably stay inside Adminiculum portal.
- External systems may receive status, comment, and portal link only.

Forbidden outbound sync:

- internal notes;
- AI drafts or AI analysis;
- legal strategy;
- review comments;
- raw internal communications;
- internal tasks;
- privileged document bodies;
- unapproved attachments;
- lawyer work product not explicitly published.

## 3. Compatibility strategy

Compatibility is achieved by layering adapters over one normalized core:

1. **Connector registry** describes supported systems and capabilities.
2. **Connection manager** stores client-scoped connection metadata and revocation state.
3. **Adapter interface** hides system-specific API/webhook details.
4. **Normalizer** maps external object/event shapes into `ExternalWorkflowEvent` and `ExternalIntakeItem`.
5. **Policy engine** enforces queue scope, field mappings, outbound approval, and publication rules.
6. **Intake pipeline** dedupes, audits, and creates internal intake candidates.
7. **Outbound queue** holds proposed status/comment updates until approved.
8. **Audit log** records all inbound/outbound connector activity.

The system-specific code should stop at adapter boundaries. Everything after normalization should be platform-neutral.

## 4. Native adapter vs generic webhook vs email bridge vs link-only

Compatibility tiers:

| Tier | Name | Capability | Suitable systems | Notes |
| --- | --- | --- | --- | --- |
| Tier 0 | Link-only | Store source link and manual intake | Any system | Safe fallback when API/webhook access is unavailable |
| Tier 1 | Generic webhook/email bridge | Receive normalized JSON or email | Custom tools, Make/Zapier/Power Automate, email | Fastest broad coverage |
| Tier 2 | Native inbound adapters | OAuth/API/webhook intake | Jira, Asana, Monday, Trello, ClickUp, Bitrix24, Teams/Planner | Inbound automation, no outbound by default |
| Tier 3 | Approved outbound status | Approved status/comment sync | Systems with comment/status APIs | Requires approval queue and audit |
| Tier 4 | Advanced sync | Rich field sync, attachment policies, bidirectional state | Mature connectors only | Later phase; higher privacy/security risk |

Recommended MVP coverage:

- Tier 1 generic webhook;
- Tier 1 email bridge;
- Tier 2 native inbound for one or two high-demand systems;
- Tier 3 outbound only after approvals and audit are mature.

## 5. Universal connector core

Core components:

- `ConnectorRegistry`: system metadata, capabilities, auth modes, supported events.
- `ExternalConnection`: client-scoped connector setup and revocation state.
- `ExternalQueueBinding`: selected legal queue/project/channel/board/mailbox folder.
- `FieldMapping`: per-client mapping from external fields to normalized fields.
- `StatusMapping`: per-client mapping between external status and Adminiculum status vocabulary.
- `ExternalWorkflowEvent`: raw normalized event envelope.
- `ExternalIntakeItem`: client-safe normalized intake candidate.
- `OutboundSyncRequest`: proposed external update requiring approval.
- `ConnectorAuditEvent`: immutable audit of inbound/outbound actions.
- `ConnectorActor`: non-human actor representing a connector, not an internal user.

Design boundary:

- adapters know external APIs;
- core knows normalized contracts;
- Adminiculum workflows consume `ExternalIntakeItem`;
- outbound connector writes consume approved `OutboundSyncRequest`.

## 6. Adapter interface contract

Common adapter interface:

```ts
interface ExternalWorkflowAdapter {
  connect(input: ConnectRequest): Promise<ConnectResult>;
  disconnect(connection: ExternalConnectionRef): Promise<void>;
  revokeConnection(connection: ExternalConnectionRef): Promise<void>;
  healthCheck(connection: ExternalConnectionRef): Promise<ConnectorHealth>;
  listWorkspaces(connection: ExternalConnectionRef): Promise<ExternalWorkspace[]>;
  listQueues(connection: ExternalConnectionRef, workspaceId: string): Promise<ExternalQueue[]>;
  subscribeWebhook(connection: ExternalConnectionRef, queue: ExternalQueueRef): Promise<WebhookSubscription>;
  verifyWebhook(request: WebhookRequest): Promise<WebhookVerificationResult>;
  normalizeEvent(request: WebhookRequest | ExternalEventPayload): Promise<ExternalWorkflowEvent>;
  fetchObject(connection: ExternalConnectionRef, objectRef: ExternalObjectRef): Promise<ExternalObjectSnapshot>;
  fetchAttachments(connection: ExternalConnectionRef, objectRef: ExternalObjectRef): Promise<ExternalAttachmentMetadata[]>;
  postComment(connection: ExternalConnectionRef, objectRef: ExternalObjectRef, comment: ApprovedOutboundComment): Promise<OutboundResult>;
  updateStatus(connection: ExternalConnectionRef, objectRef: ExternalObjectRef, status: ApprovedOutboundStatus): Promise<OutboundResult>;
}
```

Interface rules:

- adapters must not write Adminiculum cases/tasks directly;
- adapters must not bypass approval for outbound writes;
- adapters must not return raw privileged internal data;
- adapters must normalize missing fields safely;
- adapters must expose capability flags so UI/policy can disable unsupported actions.

## 7. Normalized ExternalIntakeItem model

Required normalized fields:

- `externalSystem`
- `externalConnectionId`
- `externalObjectId`
- `externalUrl`
- `eventId`
- `eventType`
- `clientId`
- `requesterName`
- `requesterEmail`
- `teamName`
- `title`
- `description`
- `deadline`
- `priority`
- `attachments`
- `comments`
- `sourceStatus`
- `suggestedLegalCategory`
- `suggestedAdminiculumAction`

Recommended additional metadata:

- `externalWorkspaceId`
- `externalQueueId`
- `externalQueueName`
- `externalObjectType`
- `createdAtExternal`
- `updatedAtExternal`
- `receivedAt`
- `idempotencyKey`
- `dedupeKey`
- `rawPayloadRef`
- `fieldMappingVersion`
- `statusMappingVersion`
- `connectorActorId`
- `approvalRequiredForOutbound`

Safety:

- `description` and `comments` are intake material, not legal truth.
- `suggestedLegalCategory` is a rule/mapping suggestion, not AI classification unless a real classifier is separately implemented.
- raw payload should be stored with retention/redaction rules or not stored at all in MVP.

## 8. External object mapping

Common mapping:

| External concept | Normalized concept | Adminiculum destination |
| --- | --- | --- |
| Jira issue | `ExternalIntakeItem` | legal request / task / case candidate |
| Bitrix24 task/deal/activity | `ExternalIntakeItem` | legal request / communication candidate |
| Teams message / Planner task | `ExternalIntakeItem` | communication / legal request |
| Asana task | `ExternalIntakeItem` | legal request / task candidate |
| Monday item | `ExternalIntakeItem` | legal request / task candidate |
| Trello card | `ExternalIntakeItem` | legal request / task candidate |
| ClickUp task | `ExternalIntakeItem` | legal request / task candidate |
| Generic webhook payload | `ExternalIntakeItem` via field mapping | legal request candidate |
| Email message | `ExternalIntakeItem` / Communication | communication intake |
| Make/Zapier/Power Automate event | `ExternalIntakeItem` via generic adapter | legal request candidate |

The destination should be chosen through triage, mapping rules, and explicit admin/lawyer action, not hardcoded per external app.

## 9. Onboarding wizard flow

Wizard steps:

1. Choose workflow app.
2. Authorize connector.
3. Select legal queue.
4. Map fields.
5. Map statuses.
6. Choose outbound policy.
7. Send test event.
8. Activate.

Wizard safety checks:

- show the selected queue/project/channel/list clearly;
- warn that Adminiculum watches only that queue;
- show exactly what fields will be imported;
- require approval policy selection before outbound writes;
- test event must create a preview only, not a real case/task, unless explicitly confirmed;
- record who activated the connection and when.

## 10. Field mapping model

Field mapping should be per client connection and versioned.

Common mappings:

- title: issue summary / card title / task name / email subject;
- description: issue body / card description / email body preview;
- requester: reporter / creator / sender / custom field;
- team: project/team/workspace/list/board/custom field;
- deadline: due date / SLA field / custom date;
- priority: external priority / label / custom field;
- category: issue type / label / component / folder / custom field;
- attachments: external attachment metadata only by default;
- comments: external public comments only, if enabled.

Field mapping guardrails:

- do not import all fields by default;
- require explicit mapping for sensitive custom fields;
- support redaction/exclusion rules;
- keep mapping versions for audit/debugging;
- surface unmapped required fields during test event.

## 11. Status mapping model

Status mapping should support:

- source status -> intake state;
- Adminiculum approved status -> external status;
- external status categories, not just literal names;
- per-queue configuration;
- "do not sync" values.

Example categories:

- `NEW`
- `TRIAGED`
- `IN_LEGAL_REVIEW`
- `WAITING_CLIENT`
- `WAITING_EXTERNAL`
- `DONE`
- `REJECTED_OR_NOT_LEGAL`

Outbound status rules:

- status updates are proposed, not automatically sent;
- approval can be by lawyer, admin, or client portal admin depending on policy;
- every outbound status needs audit event and target object proof;
- failed outbound writes must retry safely or remain queued.

## 12. Inbound event pipeline

Pipeline:

1. Receive webhook/email/poll result/manual link.
2. Verify source signature/token/sender.
3. Resolve connection and selected queue binding.
4. Reject events outside the selected legal queue.
5. Normalize to `ExternalWorkflowEvent`.
6. Fetch object snapshot if needed.
7. Map fields to `ExternalIntakeItem`.
8. Dedupe using idempotency key.
9. Store audit event.
10. Create or update intake candidate.
11. Notify internal triage queue.
12. Internal user classifies into legal request, communication, case, task, or document-review flow.

Inbound automation can be automatic because it only imports candidate material. It must not expose internal data or trigger outbound writes without approval.

## 13. Approved outbound status/comment pipeline

Pipeline:

1. Internal user proposes outbound update from Adminiculum.
2. Policy engine checks whether outbound sync is enabled for the connection/queue.
3. System builds a safe external comment/status payload.
4. Approval request is created.
5. Lawyer/admin approves or rejects.
6. Adapter posts comment or updates status.
7. Result is audited.
8. Failure queues retry or manual intervention.

Allowed outbound content:

- approved status text;
- approved client-safe comment;
- portal link to approved resource;
- high-level due date/status if policy allows.

Forbidden outbound content:

- internal comments;
- lawyer strategy;
- AI drafts;
- raw internal communications;
- review suggestions/comments;
- document bodies unless explicitly published through portal workflow;
- unapproved attachments.

## 14. Attachment/document strategy

Default:

- import attachment metadata only;
- do not download binaries automatically;
- prefer storing legal documents in Adminiculum portal;
- external systems receive a portal link after publication approval.

Inbound attachment options:

- metadata preview;
- manual "import attachment" action;
- virus scan / content policy before storing;
- document review candidate only after internal confirmation.

Outbound document options:

- portal link only;
- link expiration/revocation;
- watermark/download audit;
- no raw document upload back to external workflow app in MVP.

## 15. Security and approval rules

Security invariants:

- connector actor is not an internal Adminiculum user;
- connector tokens do not satisfy internal auth;
- client portal tokens do not satisfy internal auth;
- internal tokens do not grant connector privileges;
- connector scope is client-bound and queue-bound;
- connection can be revoked;
- audit logs are immutable;
- secrets are never stored in repo;
- outbound sync requires approval.

Data minimization:

- select one legal queue, not entire workspace;
- import mapped fields only;
- redact or exclude sensitive custom fields;
- store raw payload only if retention/security policy allows;
- keep internal work product internal.

## 16. Idempotency, dedupe, retry and audit

Idempotency keys:

- `externalSystem`
- `externalConnectionId`
- `eventId`
- `externalObjectId`
- event timestamp/version if available

Dedupe:

- same event should not create duplicate intake item;
- repeated object update should update existing intake candidate or append audit;
- email bridge should dedupe by message ID and mailbox/folder.

Retry:

- inbound processing can retry safely after transient failure;
- outbound writes retry only while approval remains valid;
- revocation cancels pending outbound writes.

Audit:

- connection created/revoked;
- queue selected/changed;
- mapping changed;
- inbound event received;
- intake item created/updated;
- outbound update proposed/approved/rejected/sent/failed;
- attachment metadata fetched;
- errors and retries.

## 17. Connector actors and permissions

Connector actor types:

- `connector_service_account`: external system connection actor;
- `system`: internal automation event;
- `client_portal_user`: human external user;
- `internal_user`: lawyer/admin/assistant.

Connector actor rules:

- no login to internal UI;
- no internal API access;
- no case/task/document permissions by default;
- can only act through connector pipeline;
- all actions scoped to `clientId`, connection, and selected queue;
- outbound action requires approved request.

Permissions should be separate from `UserRole.CLIENT` and from internal Adminiculum `User`.

## 18. Platform-specific notes

### Jira

- Native adapter likely Tier 2/3.
- Queue scope: project, issue type, component, label, JQL, or dedicated board.
- Strong webhook and comment/status API support.
- Watch field privacy; Jira custom fields may contain sensitive non-legal data.

### Bitrix24

- Native adapter likely Tier 2/3.
- Queue scope: task group, project, deal pipeline, or activity category.
- Auth and webhook models vary by tenant; start with inbound plus approved comments.

### Microsoft Teams / Planner / Microsoft Graph

- Native adapter likely Tier 2 but higher security review.
- Queue scope: dedicated Teams channel, Planner plan/bucket, mailbox folder, or Graph subscription.
- Must avoid broad tenant/mailbox access.
- Graph permissions and consent need separate design.

### Asana

- Native adapter likely Tier 2/3.
- Queue scope: project/section/custom field.
- Good task/comment/status mapping; attachment import should remain metadata-first.

### Monday

- Native adapter likely Tier 2/3.
- Queue scope: board/group/status.
- Strong field mapping needed because columns are configurable.

### Trello

- Native adapter likely Tier 2/3.
- Queue scope: board/list/label.
- Cards map cleanly to intake items; comments/status need board-specific policy.

### ClickUp

- Native adapter likely Tier 2/3.
- Queue scope: space/folder/list/custom field.
- Strong custom fields; require explicit mapping.

### Generic webhook

- Tier 1 default for custom systems.
- Requires shared secret/signature, field mapping, and test event preview.
- Fastest route to 80% compatibility.

### Email bridge

- Tier 1 fallback.
- Queue scope: dedicated mailbox/folder/address/category.
- Dedupe by message ID; import as communication/legal intake.
- Avoid claiming Outlook/Graph sync unless real provider connector exists.

### Make / Zapier / Power Automate bridge

- Tier 1 automation bridge.
- External automation sends normalized JSON to Adminiculum webhook.
- Adminiculum should still verify source and enforce selected queue/client scope.

### Custom API/webhook systems

- Start as generic webhook.
- Promote to native adapter only if demand justifies support, auth, tests, and docs.

## 19. MVP sequencing

MVP 0: docs/security baseline

- finalize connector actor/security contract;
- define normalized intake schema;
- define outbound approval rules.

MVP 1: generic webhook intake

- one generic signed webhook;
- mapping wizard;
- test event preview;
- intake candidate creation;
- no outbound writes.

MVP 2: email bridge

- dedicated inbound address/folder/category;
- communication/intake mapping;
- attachment metadata only.

MVP 3: first native adapter

- choose Jira or Microsoft ecosystem based on pilot demand;
- inbound only;
- selected legal queue only.

MVP 4: approved outbound comments/status

- approval queue;
- policy templates;
- audit and retry.

MVP 5: additional native adapters

- Asana/Monday/Trello/ClickUp/Bitrix24 as demand proves.

MVP 6: advanced sync

- only after privacy, audit, revocation, and failure handling are mature.

## 20. Risk register

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Connector reads whole client workspace | Critical | Require queue selection and scope proof during onboarding |
| Connector actor becomes internal user | Critical | Separate connector actor model and middleware |
| Internal notes sync out | Critical | Outbound allowlist and approval queue |
| AI/legal strategy leaks | Critical | Never include AI drafts/strategy in outbound DTOs |
| Webhook spoofing | High | Signature verification, replay protection, connection-bound secrets |
| Duplicate intake items | Medium | Idempotency keys and dedupe store |
| Over-flexible field mapping imports sensitive data | High | Explicit field allowlist, test preview, redaction rules |
| Status mapping causes wrong external state | High | Approval required, mapping preview, audit |
| Attachments introduce malware/sensitive leakage | High | Metadata-first, scan before import, portal links for outbound |
| Revoked connection still sends updates | High | Revocation cancels subscriptions/tokens and pending outbound jobs |
| Platform API changes | Medium | Adapter capability flags and health checks |
| Automation bridge bypasses policy | High | Treat bridge as connector, not trusted internal actor |
| Client expects full bidirectional sync | Medium | Tiered compatibility labeling and MVP scope language |

## 21. Future tests

Architecture-level tests to plan:

- adapter contract conformance tests;
- webhook signature verification tests;
- queue-scope rejection tests;
- event idempotency/dedupe tests;
- field mapping tests;
- status mapping tests;
- outbound approval required tests;
- forbidden outbound field leak tests;
- connector revocation tests;
- retry and dead-letter tests;
- audit event completeness tests;
- platform fixture normalization tests for Jira, Bitrix24, Teams/Planner, Asana, Monday, Trello, ClickUp, generic webhook, email bridge.

Security tests:

- connector token cannot call internal APIs;
- client portal user cannot call connector admin APIs unless client-admin authorized;
- internal user cannot bypass outbound approval without policy role;
- raw internal communications and AI drafts are absent from outbound payloads.

## 22. Recommended next prompt

Recommended next prompt:

`Adminiculum — CONNECTOR1B connector security and data boundary design docs-only`

Suggested scope:

- no implementation;
- define connector actor, connection scope, token/secret storage requirements, webhook verification, audit events, and outbound approval policy;
- keep Client Portal feature flags off;
- no external system connection.

Final classification:

`universal_connector_compatibility_architecture_documented_no_runtime_change`
