# Connector Security and Data Boundary Design

Classification target: `connector_security_data_boundary_documented_no_runtime_change`

Document date: 2026-07-01

This is a docs-only security and data-boundary design for the future Adminiculum universal connector layer. It does not create schema migrations, edit `Backend/prisma/schema.prisma`, add API routes, add frontend UI, change auth, enable the client portal, connect to external systems, add secrets, or deploy.

## 1. Executive summary

The connector layer is an intake and approved-sync boundary between client workflow tools and Adminiculum. It must not become a broad integration pipe or a backdoor into internal legal work.

Core rule:

> Inbound may be automatic. Outbound must be approval-gated.

The connector may import external workflow items from a configured legal queue into internal triage. It must never automatically export internal lawyer work product, AI output, strategy, raw internal communications, internal tasks, billing details, or other client data.

The connector actor is not:

- an internal Adminiculum user;
- a client portal human user;
- an external workflow user.

It is a bounded service actor scoped to one client, one connection, and selected legal queues.

## 2. Actor model

### Internal Adminiculum user

Examples:

- lawyer;
- assistant;
- internal admin.

Can:

- view connector intake inside internal Adminiculum surfaces;
- triage external intake;
- link intake to existing case/task/communication/document review;
- create legal request/case/task where authorized;
- draft outbound status/comment;
- approve outbound status/comment if role/policy allows;
- revoke or disable connector if authorized.

Cannot:

- expose internal work product without publication/approval;
- bypass outbound approval;
- treat connector data as legally approved without triage;
- grant connector actor internal user privileges.

Must audit:

- triage decisions;
- case/task/document links;
- outbound draft creation;
- outbound approval/rejection;
- connector configuration changes.

Identity fields to store:

- internal user ID;
- display name/email snapshot for audit;
- role at time of action;
- client ID / case ID / resource ID context.

### Client portal user

Examples:

- requester;
- team lead;
- client manager;
- client admin.

Can:

- see only approved client-visible data;
- view connector source badges and external links if authorized;
- configure connector only if client-admin role and feature policy allow;
- revoke client-owned connection if policy permits;
- submit or comment through client portal surfaces when implemented.

Cannot:

- access internal Adminiculum APIs;
- see raw webhook payloads;
- see internal triage notes;
- see connector credentials;
- see unapproved outbound drafts;
- see internal sync errors containing sensitive payload data.

Must audit:

- connector setup/revocation actions;
- viewing approved connector-linked portal resources;
- outbound-policy changes if permitted;
- request/comment actions.

Identity fields to store:

- client portal user ID;
- client ID and membership ID;
- portal role;
- team/workgroup scope;
- auth provider subject where applicable.

### Connector service actor

Definition:

- non-human actor representing a configured external system connection.

Can:

- ingest events from configured queues only;
- fetch configured external object snapshots when policy allows;
- fetch attachment metadata;
- post approved outbound status/comment through adapter;
- report health/error state.

Cannot:

- log in;
- call internal APIs directly;
- satisfy internal auth middleware;
- satisfy client portal auth middleware;
- create cases/tasks/documents directly;
- approve outbound content;
- read outside selected queues;
- access other clients' data.

Must audit:

- every inbound event;
- every rejected event;
- every external fetch;
- every outbound send attempt;
- every token/connection health change.

Identity fields to store:

- connector actor ID;
- external connection ID;
- client ID;
- external system;
- selected queue IDs;
- credential reference ID, never raw secret.

### External workflow user

Definition:

- employee or representative of the client company using Jira, Bitrix24, Teams/Planner, Asana, Monday, Trello, ClickUp, email, or another workflow system.

Can:

- create tasks/issues/cards/comments/attachments in the external legal queue according to the external system's permissions.

Cannot:

- become an Adminiculum user automatically;
- become a client portal user automatically;
- receive internal legal content unless approved outbound sync or portal publication sends it;
- infer case existence or legal strategy from connector internals.

Must audit:

- external requester identity as provided by source;
- external object/comment metadata;
- mapping to Adminiculum intake.

Identity fields to store:

- external user ID if available;
- requester name/email;
- external team/department;
- external source URL;
- external object ID.

### System actor

Examples:

- background processor;
- retry worker;
- scheduler;
- health checker.

Can:

- process queued inbound events;
- retry failed work within policy;
- run health checks;
- mark dead-letter items;
- create system audit events.

Cannot:

- approve outbound content;
- bypass queue scope;
- bypass revocation;
- generate legal advice.

Must audit:

- retries;
- dead-letter actions;
- health transitions;
- automated normalization or fetch failures.

Identity fields to store:

- system actor type;
- job ID / worker ID;
- connection ID;
- event ID / resource ID;
- timestamp and retry count.

## 3. Data boundary overview

External workflow system contains:

- task / issue / card / item;
- comment;
- attachment;
- status;
- requester;
- team/department;
- external URL.

Adminiculum connector layer contains:

- `ExternalWorkflowEvent`;
- `ExternalIntakeItem`;
- `ExternalObjectLink`;
- `ExternalSyncApproval`;
- `ExternalSyncLog`.

Internal Adminiculum legal workspace contains:

- case;
- internal task;
- document review;
- internal communication;
- internal note;
- AI assistance;
- legal analysis.

Client portal contains:

- approved status;
- approved message;
- approved document;
- client-visible request/case;
- monthly report.

Boundary rule:

- External workflow data does not become client-visible or legally approved just because it entered Adminiculum.
- Connector intake is evidence/input for triage, not legal advice or final legal position.
- Internal Adminiculum content leaves only through explicit publication or approved outbound sync.

## 4. Inbound data rules

Allowed inbound data:

- external system name;
- connection ID;
- external object ID;
- external URL;
- event ID;
- event type;
- task/issue/card/item title;
- description;
- requester name;
- requester email;
- team/department;
- deadline;
- priority;
- source status;
- labels/tags;
- comments from external workflow;
- attachment metadata;
- optional attachment content only if connection policy allows.

Inbound restrictions:

- only configured legal queue/project/board/list/channel/folder;
- no full workspace scraping;
- no unrelated project/task import;
- no hidden/private tasks outside legal queue;
- no automatic ingestion of every comment unless configured;
- no full company-wide permission unless absolutely required and documented;
- no external object fetch after connection revocation;
- no raw payload exposure to portal users.

Inbound processing must fail closed:

- unknown connection -> reject;
- disabled connection -> reject;
- disabled queue -> reject;
- unsupported event -> reject or dead-letter without intake creation;
- payload outside scope -> reject and audit.

## 5. Attachment/document boundary

### Option A — metadata only

Imports:

- external filename;
- external file URL;
- size;
- MIME type;
- uploader;
- timestamp.

Behavior:

- file is not copied into Adminiculum automatically;
- internal user decides whether to fetch/import;
- safest default for MVP.

### Option B — controlled copy

Imports:

- file content only after triage or policy approval.

Behavior:

- stored as inbound/pending review;
- not client-visible by default;
- requires audit and future virus-scan/content-safety step.

### Option C — automatic copy for trusted pilot queues

Imports:

- file content automatically only when connection policy permits.

Behavior:

- still pending internal review;
- never published by default;
- audit required for every file;
- size/type limits required.

Forbidden:

- automatic publication of external attachments to client portal;
- syncing internal reviewed/redlined documents back without approval;
- copying unrelated external files;
- storing external credentials inside document metadata;
- sending privileged internal documents to external workflow systems by default.

## 6. Queue scoping

Supported relationship:

- one client -> multiple external connections;
- one connection -> one or more legal queues;
- each queue has explicit scope rules;
- only selected queue is watched.

Examples:

- Jira project `LEGAL`;
- Bitrix task group `Jogi kérések`;
- Teams Planner plan `Legal Requests`;
- Asana project `Legal Requests`;
- Monday board `Legal Requests`;
- Trello board/list/label `Legal Requests`;
- ClickUp list/folder `Legal Requests`;
- generic webhook source with shared secret;
- dedicated email address/folder/category.

Queue configuration should define:

- allowed inbound event types;
- allowed outbound actions;
- allowed attachment behavior;
- enabled/disabled state;
- owner/internal responsible user;
- client team mapping;
- field mapping version;
- status mapping version;
- rate limits;
- retention/raw-payload policy.

Queue-scope proof should be visible during onboarding and connection review.

## 7. Webhook security

Generic webhook requirements:

- unique endpoint or connection ID;
- shared secret or signature verification;
- timestamp tolerance to prevent replay;
- idempotency key;
- event ID dedupe;
- payload size limit;
- optional IP allowlist;
- reject unknown connection;
- reject disabled connection;
- reject disabled queue;
- never log secrets;
- store raw payload only if allowed and preferably redacted.

Platform signature notes:

- Jira: webhook signature/security model depends on deployment and app model; adapter-specific validation required.
- Bitrix24: token or application/webhook validation is tenant-specific; adapter-specific validation required.
- Microsoft Teams / Planner / Graph: Graph change notifications include validation and auth requirements; separate Graph security design required.
- Asana: webhook secret/handshake model should be implemented adapter-specifically.
- Monday: webhook verification depends on app/webhook setup; adapter-specific validation required.
- Trello: webhook validation/token model should be adapter-specific.
- ClickUp: webhook signature/event validation should be adapter-specific.
- Generic webhook: Adminiculum-owned HMAC signature should be required.
- Email bridge: validate mailbox/folder/category and message metadata; signature is not equivalent to webhook auth.
- Make/Zapier/Power Automate: use generated endpoint secret plus optional HMAC/custom header.
- Custom API: require signed requests or token-based validation before accepting events.

## 8. OAuth/credential boundary

Credential rules:

- never store raw secrets in normal DB fields if avoidable;
- use a secret store / Azure Key Vault later;
- DB stores only credential reference, connection state, scopes, expiry, and health;
- support revocation;
- support rotation;
- support connection health state;
- do not print secrets in logs;
- do not expose tokens to frontend;
- do not expose external credentials to internal users except coarse connection status;
- do not reuse internal Adminiculum auth tokens as connector credentials.

Credential lifecycle:

1. client admin authorizes connection;
2. system stores secret reference;
3. connection is scoped to client and selected queues;
4. health checks validate access;
5. rotation/revocation updates connection state;
6. pending outbound writes are cancelled on revocation.

## 9. Normalization boundary

Raw event:

- platform-specific;
- may include sensitive/unmapped fields;
- may be stored only if policy allows;
- not directly shown to client portal users;
- not directly used as legal content.

Normalized intake:

- safe normalized fields;
- internal until triaged;
- not legal advice;
- not client-visible by default.

`ExternalIntakeItem` fields:

- `externalSystem`
- `externalConnectionId`
- `externalQueueId`
- `externalObjectId`
- `externalUrl`
- `eventId`
- `eventType`
- `title`
- `description`
- `requesterName`
- `requesterEmail`
- `teamName`
- `deadline`
- `priority`
- `sourceStatus`
- `attachmentRefs`
- `commentRefs`
- `suggestedLegalCategory`
- `suggestedAdminiculumAction`
- `triageStatus`
- `linkedCaseId`
- `linkedTaskId`
- `linkedCommunicationId`
- `linkedDocumentIds`

Normalization guardrails:

- missing fields produce safe nulls, not crashes;
- unmapped fields stay out;
- suggestion fields are not AI claims unless real AI is implemented and approved;
- source text remains source material, not legal conclusion.

## 10. Triage and human control

Triage states:

- `received`;
- `normalized`;
- `needs_review`;
- `linked_to_existing_case`;
- `converted_to_legal_request`;
- `converted_to_task`;
- `document_review_started`;
- `ignored_not_legal`;
- `duplicate`;
- `error`.

Human actions:

- accept as legal request;
- create case;
- link to existing case;
- create task;
- request clarification;
- ignore;
- mark duplicate;
- approve outbound status draft.

Rules:

- no inbound item automatically becomes legal advice;
- no inbound item automatically becomes final response;
- no inbound item automatically becomes client-visible legal position;
- duplicates should be visible but not create duplicate work;
- triage action must be audited.

## 11. Outbound approval boundary

Allowed outbound after approval:

- short status;
- simple comment;
- request for more documents;
- link to Adminiculum portal;
- "review completed" notice;
- closing status.

Forbidden outbound:

- internal notes;
- AI drafts;
- legal strategy;
- detailed risk scoring;
- private lawyer comments;
- internal task history;
- raw document review comments;
- privileged internal documents;
- billing internals;
- full internal timeline.

Outbound states:

- `draft`;
- `proposed`;
- `pending_approval`;
- `approved`;
- `sent`;
- `failed`;
- `revoked`;
- `superseded`.

Approvers:

- internal lawyer;
- internal admin;
- optionally responsible lawyer only.

Approval rules:

- connector actor cannot approve;
- system actor cannot approve;
- client portal requester cannot approve outbound legal status unless a later policy explicitly allows a client-admin workflow action;
- approval records must store approver, timestamp, content snapshot, target object, and mapping version.

## 12. Status mapping safety

External -> Adminiculum examples:

- `Open` -> `received` / `triage`;
- `In Progress` -> `processing`;
- `Waiting` -> `waiting_for_client` / `waiting_for_document`;
- `Done` -> external closed only, not Adminiculum legal closure.

Adminiculum -> External examples:

- `Beérkezett`;
- `Feldolgozás alatt`;
- `További adat szükséges`;
- `Válasz elkészült`;
- `Lezárva`.

Safety rules:

- external status change must not automatically close Adminiculum legal matter;
- Adminiculum closure must not automatically publish legal conclusion unless approved;
- status mappings are per queue/connection;
- ambiguous statuses require manual triage;
- outbound status updates require approval and audit.

## 13. Comment sync safety

Inbound comments:

- may be imported from configured queue;
- may create communication or intake-note candidates depending on triage;
- not automatically visible to all client portal users;
- should carry source author/time metadata.

Outbound comments:

- must be short;
- must be approved;
- should avoid sensitive legal content;
- may include Adminiculum portal link;
- should include only approved client-safe wording.

Rules:

- no auto-reply with AI-generated text;
- no full legal memo in Jira/Bitrix/Teams/etc. by default;
- sensitive answer should live in Adminiculum portal/document;
- comments sent externally must be stored as immutable outbound snapshots.

## 14. Client portal relationship

Client portal may show:

- source badge: Jira / Teams / Bitrix / Asana / Monday / Email;
- external ID chip;
- external URL if user has permission;
- approved status;
- approved messages;
- approved documents;
- request timeline.

Client portal must not show:

- raw webhook payload;
- connector credentials;
- internal sync errors with sensitive payload;
- internal triage notes;
- adapter debug logs;
- unapproved outbound drafts;
- internal task details;
- AI drafts/summaries not explicitly approved for client.

Portal visibility rule:

- connector intake becomes portal-visible only after explicit portal publication or approved client-visible workflow state.

## 15. Audit requirements

Mandatory audit events:

- connection created;
- connection updated;
- connection disabled;
- queue selected;
- webhook received;
- webhook rejected;
- event normalized;
- intake item created;
- duplicate detected;
- attachment metadata received;
- attachment copied;
- item linked to case/task/document;
- outbound draft created;
- outbound approved;
- outbound sent;
- outbound failed;
- credential rotated;
- connection revoked.

Required audit fields:

- actor type;
- actor ID;
- client ID;
- connection ID;
- external object ID;
- resource type;
- resource ID;
- timestamp;
- request/correlation ID;
- metadata redaction rule;
- outcome;
- error code if failed.

Audit data rules:

- never store raw secrets;
- redact payload metadata where needed;
- retain enough target/source identifiers to investigate;
- preserve approval snapshots for outbound content.

## 16. Idempotency, dedupe and retry

Idempotency components:

- event ID;
- external object ID;
- event type;
- event timestamp/version;
- external connection ID;
- normalized idempotency key.

Dedupe rules:

- provider retries must not create duplicate legal requests;
- object update events update or append to existing intake record;
- duplicate detection must be audited;
- email bridge dedupes by message ID, mailbox/folder, and sender timestamp.

Retry policy:

- retry transient fetch/send failures;
- do not retry invalid signatures;
- do not retry disabled connection/queue;
- stop retries after max count;
- dead-letter poison messages;
- allow manual replay for authorized internal admins.

## 17. Error/failure behavior

| Failure | Expected response | Retry | Audit | Alert internal user |
| --- | --- | --- | --- | --- |
| Invalid signature | Reject 401/403 equivalent | No | Yes | Security alert if repeated |
| Unknown connection | Reject 404/403 equivalent | No | Yes | Admin alert if repeated |
| Disabled queue | Reject/ignore safely | No | Yes | Optional |
| Unsupported event type | Ignore/dead-letter | No by default | Yes | Optional |
| Payload too large | Reject 413 equivalent | No | Yes | Yes if repeated |
| Normalization failed | Dead-letter | Manual replay | Yes | Yes |
| External API fetch failed | Defer event | Yes | Yes | Yes after threshold |
| Outbound send failed | Keep approved request failed/pending | Yes if transient | Yes | Yes |
| Token expired | Mark connection unhealthy | No until refreshed | Yes | Yes |
| Permission revoked | Disable affected actions | No | Yes | Yes |
| Rate limit | Backoff | Yes | Yes | Optional until threshold |

All errors should avoid printing secrets, raw privileged payloads, or excessive external data.

## 18. Rate limit and cost controls

Principles:

- prefer webhook over polling;
- if polling is used, keep low frequency and queue scoped;
- store minimal payload;
- avoid automatic large file copies;
- avoid AI processing on every inbound event by default;
- batch health checks;
- configure per-client limits;
- alert on event spikes;
- support connection-level throttles;
- backoff on provider rate limits;
- expose health/status without exposing secrets.

Cost controls are also security controls: broad polling and file copying increase data exposure.

## 19. Platform-specific boundary notes

| Platform | Likely connection method | Queue concept | Inbound support | Outbound support | Biggest security risk |
| --- | --- | --- | --- | --- | --- |
| Jira | OAuth/app/webhook | project, board, JQL, label/component | Strong | Comments/status likely | Overbroad project scopes and custom fields |
| Bitrix24 | app/webhook/token | task group, project, pipeline | Good but tenant-specific | Comments/status possible | Tenant permission sprawl |
| Microsoft Teams / Planner / Graph | Graph OAuth/subscriptions | team/channel, Planner plan/bucket, mailbox folder | Strong but complex | Comments/status depends on target | Overbroad Graph consent and mailbox access |
| Asana | OAuth/webhook | project/section/custom field | Strong | Comments/status possible | Custom field privacy |
| Monday | OAuth/webhook | board/group/status column | Strong | Updates/comments possible | Mis-mapped columns importing sensitive data |
| Trello | OAuth/token/webhook | board/list/label | Good | Comments/card movement possible | Personal token and board over-scope |
| ClickUp | OAuth/token/webhook | space/folder/list/custom field | Strong | Comments/status possible | Workspace over-scope |
| Generic webhook | Signed endpoint | caller-defined source | Depends on sender | Usually inbound only | Spoofing/malformed payload |
| Email bridge | mailbox/folder/category | address/folder/category | Good fallback | Usually outbound email later only | Email forwarding of sensitive threads |
| Make/Zapier/Power Automate | generated webhook + secret | automation scenario/flow | Good bridge | Possible via bridge | Bypassing queue/policy with broad automation |
| Custom API | token/HMAC/OAuth | custom queue/filter | Adapter-specific | Adapter-specific | Unknown auth and payload semantics |

All platform details must be adapter-specific before implementation.

## 20. Risk register

| Risk | Severity | Mitigation | Blocking for MVP |
| --- | --- | --- | --- |
| Connector sees too much client workspace | Critical | Queue-scoped connection, onboarding scope proof | Yes |
| Outbound leaks internal legal content | Critical | Outbound allowlist, approval queue, snapshot audit | Yes |
| AI draft accidentally sent | Critical | AI output excluded from outbound DTOs by default | Yes |
| Duplicate events create duplicate requests | High | Idempotency/dedupe keys | Yes |
| External user mistaken for client portal user | High | Separate external workflow identity from portal identity | Yes |
| Connector actor mistaken for internal user | Critical | Separate connector actor and middleware | Yes |
| Credentials logged | Critical | Secret references, log redaction, no frontend exposure | Yes |
| Full attachment copy creates privacy/storage risk | High | Metadata-first default, approval/policy for copy | Yes |
| External status closes legal matter incorrectly | High | External status cannot close internal legal matter automatically | Yes |
| Zapier/Make bridge sends malformed data | Medium | Schema validation, test event, dead-letter | Yes |
| Customer admin misconfigures queue | High | Test event preview, scope review, disable/revoke | Yes |
| Rate limit/cost spike | Medium | Throttles, alerting, webhook-first | Yes for native adapters |

## 21. Required future tests

Required tests before implementation is considered safe:

- invalid webhook rejected;
- disabled connection rejected;
- wrong queue rejected;
- duplicate event does not duplicate request;
- inbound item not client-visible by default;
- outbound requires approval;
- forbidden fields cannot be sent outbound;
- connector actor cannot access internal APIs;
- connector actor cannot satisfy client portal auth;
- internal AI draft cannot be published by connector;
- attachment starts pending review;
- external closed status does not close case automatically;
- audit event created for every inbound/outbound step;
- webhook replay is rejected;
- payload over size limit is rejected;
- revoked connection blocks fetch and outbound;
- outbound snapshot remains immutable after send.

Fixture tests should cover:

- Jira;
- Bitrix24;
- Microsoft Teams / Planner / Graph;
- Asana;
- Monday;
- Trello;
- ClickUp;
- generic webhook;
- email bridge;
- Make/Zapier/Power Automate bridge;
- custom API payload.

## 22. Recommended next prompt

Recommended next prompt:

`Adminiculum — CONNECTOR1C connector domain model split plan docs-only`

Suggested scope:

- no implementation;
- no schema migration;
- design future inert connector foundation entities only after CP baseline migration questions are settled;
- define `ExternalConnection`, `ExternalQueueBinding`, `ExternalWorkflowEvent`, `ExternalIntakeItem`, `ExternalSyncApproval`, and `ExternalSyncLog` conceptually;
- keep client portal disabled and no external connections.

Final classification:

`connector_security_data_boundary_documented_no_runtime_change`
