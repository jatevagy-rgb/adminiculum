# Client Portal DTO and Publication Boundary

> Status: **docs-only design**. No implementation, no schema, no migration, no
> routes, no auth change, no runtime change. Client Portal remains future-only /
> gated (`ENABLE_CLIENT_PORTAL` off). CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain
> blocked by Prisma baseline/proof work and are **not** unblocked by this document.
>
> This document defines *what* client-safe data may be exposed and *under what
> publication conditions* — it is the contract that a future implementation must
> obey. It aligns with and extends:
> - `docs/client-portal-tenant-isolated-api-contract.md`
> - `docs/client-portal-v1-identity-authorization-plan.md`
> - `docs/client-portal-v1-security-contract-audit.md`
> - `docs/client-portal-v1-schema-migration-split-plan.md`
> - `docs/client-portal-v1-schema-migration-draft-review.md`
> - `docs/connector-security-data-boundary-design.md`
> - `docs/universal-connector-compatibility-architecture.md`

---

## 1. Executive summary

The Adminiculum Client Portal exposes a **narrow, published subset** of firm work
to authenticated external client users. Its central rule:

> **A record being internal — or even linked to a `Client` — does not make it
> visible. Visibility requires an explicit, approved publication/grant, mapped
> through a client-safe DTO that carries an allow-list of fields only.**

Two independent gates must both pass for any byte to reach a portal user:

1. **Access gate** — authenticated `ClientPortalUser` + active
   `ClientPortalMembership` whose scope (client / team / grant) matches the
   record.
2. **Publication gate** — the record has an explicit client-visible artifact in
   an `approved`/`published` state (not `internal_only`, `draft`,
   `pending_approval`, `revoked`, `superseded`, or `expired`).

Internal Adminiculum models are **never** serialized to the portal. Every portal
response is built by an explicit allow-list mapper from a *published artifact*,
never by spreading a Prisma model.

The UI source (`C:\Users\hubay\Documents\Ügyfélportál`, PDFs
"Adminiculum Ügyfélportál v1.1/v1.2" and design zips) implies the DTO families
below (dashboard summary, requests list/detail, document requests, message
threads, monthly report, integrations). **No UI assets are copied into the repo**;
only their DTO/field implications are summarized here.

---

## 2. Publication boundary principle

Every visible object is a **projection** of an internal object, produced only
after human approval. The internal object and the published artifact are distinct:

| Internal object (never returned) | Published / client-visible artifact (allowed after approval) |
| --- | --- |
| `Case` | client-visible **request** summary + approved status |
| `Task` | client **to-do** (only if explicitly requested from / assigned to the client) |
| `Document` / `DocumentVersion` | approved **document version** + approved document request |
| `Communication` (raw) | approved **client-visible message** |
| `DocumentReviewSuggestion` / review session | *(nothing directly)* — only an approved "answer ready" message |
| AI draft / generation | *(nothing directly)* — only if transformed into an approved artifact |
| Internal note / `Comment` | *(nothing)* |
| `TimeEntry` / timesheet | approved **monthly report aggregate** only |
| Connector intake event (`ExternalIntakeItem`) | approved **source badge / external link**, only after triage + publication |

**Visibility rule (all must be true):**

1. authenticated portal user exists;
2. active membership exists;
3. membership scope matches the record's client / workspace / team / grant;
4. record is explicitly **client-visible or published**;
5. record is **not internal-only**;
6. record is **not pending lawyer approval**;
7. the requesting **role has permission**;
8. the response **DTO excludes forbidden fields** (allow-list mapping).

If any condition fails, the API responds as if the resource does not exist
(`404`) — never a `403` that confirms existence — consistent with the tenant
isolation contract.

---

## 3. DTO family overview

All DTOs are **client-portal-specific** types, physically and namespically
separate from internal DTOs. Naming: `ClientPortal*Dto`. Every DTO lists purpose,
allowed fields, forbidden fields, publication rule, role scope, and MVP tier.

### A) Identity / workspace

| DTO | Purpose | Allowed fields | Forbidden fields | Publication rule | Role scope | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `ClientPortalMeDto` | who am I + current workspace | `displayName`, `email`, `currentWorkspace{workspaceId,clientDisplayName}`, `role`, `locale` | internal userId, other clients, internal roles | authenticated user only | all | MVP |
| `ClientPortalWorkspaceDto` | selectable workspaces for this user | `workspaceId`, `clientDisplayName`, `role`, `teamName?` | `clientId` (internal), other users' memberships | membership rows for this user only | all | MVP |
| `ClientPortalPermissionsDto` | capability flags for UI gating | `canCreateRequest`, `canUploadDocument`, `canViewReport`, `canManageTeam`, `canViewIntegrations` | internal permission model, raw role graph | derived from role | all | MVP |

### B) Dashboard

| DTO | Purpose | Allowed | Forbidden | Publication rule | Role | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `ClientPortalSummaryDto` | dashboard counters | `openRequests`, `awaitingClient`, `inLawyerReview`, `closedThisMonth`, `upcomingDeadlines` | internal workload, hidden counts, strategy, timesheets | aggregate over published, scoped records only | all, scoped | MVP |
| `ClientPortalTodoDto` | what the client must do | `todoId`, `label`, `dueDate?`, `relatedRequestId?` | internal task fields, assignee, internal reasoning | only client-facing action items | all, scoped | MVP |
| `ClientPortalLatestUpdateDto` | recent visible activity | `updateId`, `kind`, `title`, `occurredAt`, `relatedRequestId?` | internal timeline, AI drafting, handoffs | published timeline items only | all, scoped | MVP |
| `ClientPortalDeadlineDto` | client-relevant deadlines | `deadlineId`, `label`, `dueDate`, `relatedRequestId?` | internal court/task deadlines unless published | derived from visible requests/doc requests | all, scoped | MVP |

### C) Request / matter

| DTO | Purpose | Allowed | Forbidden | Publication rule | Role | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `ClientPortalRequestListItemDto` | matter list row | `requestId`(opaque), `title`, `clientStatus`, `updatedAt`, `unreadCount?` | internal `caseNumber` if unsafe, task ids, strategy, risk | request is published + scope match | requester=own, team_lead=team, manager/admin=client | MVP |
| `ClientPortalRequestDetailDto` | matter detail | `requestId`, `title`, `clientStatus`, `summary`(approved), `nextSteps[]`, `openTodos[]`, `visibleDocuments[]`, `visibleDeadlines[]` | internal notes, review comments, AI drafts, reviewer chain | published request + child artifacts each independently published | scoped | MVP |
| `ClientPortalRequestTimelineItemDto` | matter timeline entry | `itemId`, `kind`, `label`, `occurredAt` | internal handoff/AI/strategy/time-entry items | approved timeline items only (see §8) | scoped | MVP |
| `ClientPortalNextStepDto` | what happens next | `stepId`, `label`, `owner`(`client`\|`firm`) | internal task detail, assignee notes | approved narrative only | scoped | MVP |
| `ClientPortalClientTodoDto` | client action within a request | `todoId`, `label`, `dueDate?`, `documentRequestId?` | internal task internals | explicit client action items only | scoped | MVP |

### D) Document

| DTO | Purpose | Allowed | Forbidden | Publication rule | Role | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `ClientPortalDocumentRequestDto` | "please upload X" | `documentRequestId`, `name`, `status`, `dueDate?`, `instructions`(approved) | internal task, reviewer, storage keys | published document request | scoped | MVP |
| `ClientPortalUploadedDocumentDto` | client-uploaded file record | `documentId`(opaque), `safeFileName`, `status`(`pending_review`…), `uploadedAt`, `uploaderDisplayName?` | internal path, storage key, SharePoint metadata, other clients' docs | uploaded by in-scope member; pending review until approved | scoped | MVP |
| `ClientPortalVisibleDocumentVersionDto` | approved firm output | `versionId`(opaque), `safeFileName`, `versionLabel`, `publishedAt`, `downloadToken?`(short-lived) | raw signed URL, internal versions, review annotations, workspace text | version explicitly approved/published | scoped | MVP |
| `ClientPortalDocumentActionDto` | allowed actions | `documentId`, `actions[]`(`download`\|`upload_new`) | internal action model | derived from role/grant | scoped | Later |

### E) Message / communication

| DTO | Purpose | Allowed | Forbidden | Publication rule | Role | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `ClientPortalMessageThreadDto` | thread container | `threadId`, `requestId?`, `subject`, `lastMessageAt`, `unreadCount` | internal conversation classification, raw email headers | thread has ≥1 approved message | scoped | MVP |
| `ClientPortalMessageDto` | one message | `messageId`, `authorDisplayName`, `authorSide`(`client`\|`firm`), `sentAt`, `body`(approved), `sourceBadge?`, `attachments[]` | raw email body, AI draft, internal reply draft, internal note | message explicitly approved/client-visible | scoped | MVP |
| `ClientPortalMessageAttachmentDto` | approved attachment ref | `attachmentId`, `safeFileName`, `sizeBytes?` | storage key, raw URL, provider payload | attachment approved with the message | scoped | MVP |
| `ClientPortalSourceBadgeDto` | provenance chip | `source`(`Email`\|`Portal`\|`Jira`\|`Teams`\|`Bitrix`\|`Asana`\|`Monday`), `externalUrl?`(policy-gated) | connector credentials, raw payload, other queues | approved connector-derived message only | scoped | Later |

### F) Monthly report

| DTO | Purpose | Allowed | Forbidden | Publication rule | Role | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `ClientPortalReportSummaryDto` | month header + narrative | `period`, `requestsOpened`, `requestsClosed`, `avgTurnaroundDays?`, `narrative`(approved) | per-minute timesheet, cost internals, capacity | approved report snapshot | manager/admin (team_lead subset if enabled) | MVP |
| `ClientPortalReportCategoryBreakdownDto` | by matter category | `category`, `count`, `closed` | internal cost, risk classification | approved snapshot | manager/admin | MVP |
| `ClientPortalReportTeamBreakdownDto` | by team | `teamName`, `count`, `closed` | individual productivity unless internally approved | approved snapshot + role allows | manager/admin | Later |
| `ClientPortalReportTrendDto` | month-over-month | `period`, `metric`, `value` | internal capacity/utilization | approved snapshot | manager/admin | Later |

### G) Team / admin

| DTO | Purpose | Allowed | Forbidden | Publication rule | Role | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `ClientPortalTeamMemberDto` | member of *this* client | `membershipId`, `displayName`, `role`, `status` | internal Adminiculum users, other client admins, global search | own client/workspace only | admin (team_lead read if approved) | MVP |
| `ClientPortalInvitationDto` | pending invite | `invitationId`, `email`, `role`, `status`, `expiresAt` | tokens/secrets, other clients | own client only | admin | MVP |
| `ClientPortalRoleDto` | assignable portal roles | `role`, `label`, `description` | internal role graph | static allow-list | admin | MVP |

### H) Integration / connector

| DTO | Purpose | Allowed | Forbidden | Publication rule | Role | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `ClientPortalIntegrationDto` | configured integration for *this* client | `integrationId`, `source`, `displayName`, `status`(approved), `connectedAt?` | credentials, webhook payloads, debug logs, other clients' integrations | current workspace connection only | admin (read roles if configured) | Later |
| `ClientPortalExternalObjectLinkDto` | link to external object | `externalId`, `externalUrl?`(policy-gated), `source` | raw payload, adapter logs, other queues | approved + policy allows external URL | scoped | Later |
| `ClientPortalConnectorStatusDto` | approved sync status | `source`, `status`, `lastSyncedAt?`, `note`(approved) | retry payloads, sync error payloads | approved status only | admin/scoped | Later |
| `ClientPortalIntegrationAuditItemDto` | redacted audit line | `auditId`, `action`, `occurredAt`, `actorDisplayName?` | raw payloads, internal actors, other clients | redacted audit event | admin | Later |

---

## 4. Forbidden field catalogue

The following **must never** appear in any client portal DTO, regardless of role,
unless first transformed into a separately-approved client-safe artifact. This is
the canonical deny-list; serializer tests (§14) enforce it.

- internal lawyer note; internal assistant/admin note;
- internal task details; internal task assignee; internal task assignee notes;
- internal task reassignment / workflow event;
- internal communication classification labels (`audience`, `direction` heuristics, internal type);
- raw email thread / raw email body / internet headers;
- raw webhook payload; sync retry payload; sync error payload;
- AI draft; AI summary not approved for client; generated-contract template data unless published;
- prompt / completion / model metadata (`bundlePreview`, prompt-copy, external AI instructions);
- legal strategy; settlement strategy; litigation strategy; risk score; risk escalation;
- document review comments; tracked / redline review annotations; reviewer chain; `DocumentReviewSuggestion.*`;
- SharePoint / internal storage metadata (`spItemId`, `spWebUrl`, `spPath`, `spDriveId`, `spVersionId`); `workspaceText`;
- raw storage URL / signed URL (unless short-lived, single-use, authorized — see §9);
- billing internals; time entry details; per-minute timesheet; internal cost calculation;
- capacity / workload / utilization planning; individual lawyer productivity (unless internally approved);
- internal deadline reasoning; internal `caseNumber`/`caseId`/`taskId` when not client-safe;
- **any reference to other clients** (names, ids, benchmarking, existence);
- connector credentials / OAuth tokens; adapter debug logs; connector queue names of other clients;
- outbound connector draft before approval.

**Rule of thumb:** if a field originates from an internal model and was not
explicitly copied into an approved publication artifact, it is forbidden.

---

## 5. Publication / grant model

Conceptual future controls (docs-only — **no schema is defined or edited here**).
These complement the identity models already proposed in
`client-portal-v1-identity-authorization-plan.md`
(`ClientPortalCaseAccess`, `ClientPortalDocumentGrant`/`DocumentVisibility`,
`ClientPortalMessageVisibility`):

- `ClientPortalPublication` — generic publication record linking an internal
  source to a client-safe artifact + state + approver + timestamps.
- `ClientPortalGrant` — scope grant (client / team / member / request) governing
  who may see a published artifact.
- `ClientVisibleStatus` — approved translation of internal workflow status (§7).
- `ClientVisibleMessage` — approved projection of a `Communication`.
- `ClientVisibleDocumentVersion` — approved projection of a `DocumentVersion`.
- `ClientVisibleTimelineItem` — approved projection of a timeline event.
- `ClientVisibleReportSnapshot` — approved monthly report aggregate.

### Publication states

| State | Meaning | Portal-visible? |
| --- | --- | --- |
| `internal_only` | never intended for client | No |
| `draft` | proposed artifact being prepared | No |
| `pending_approval` | awaiting lawyer approval | No |
| `approved` | approved but not yet released | No (approved ≠ visible) |
| `published` | approved **and** released to scope | **Yes** (if scope matches) |
| `revoked` | withdrawn after publication | No (audit only) |
| `expired` | time-boxed visibility elapsed | No (audit only) |
| `superseded` | replaced by a newer published artifact | No, unless history explicitly allowed |

### State rules

1. An internal object may **generate a proposed** client-visible artifact
   (`draft` → `pending_approval`).
2. A proposed artifact **must be approved** by an authorized internal user
   (`pending_approval` → `approved`).
3. An approved artifact **may be published** to a scope (`approved` → `published`).
   Publishing is a distinct, logged action.
4. `revoked` / `expired` / `superseded` artifacts **no longer appear**, except in
   internal audit (and optionally a client-visible history if explicitly enabled).
5. **Publication never reveals the internal source data** — only the transformed,
   allow-listed fields. Approval copies safe fields into the artifact; the portal
   reads the artifact, never the source.

---

## 6. Internal model → client-safe DTO mapping

Default posture for every internal model: **not directly showable**.

| Internal model | Directly shown? | Client-safe DTO derived | Required publication/grant | Allowed fields (via mapper) | Forbidden fields | Default visibility |
| --- | --- | --- | --- | --- | --- | --- |
| `Case` | No | `ClientPortalRequestListItemDto` / `ClientPortalRequestDetailDto` | request published + membership scope match | opaque `requestId`, title, `clientStatus`, approved summary, published children | `caseNumber`/`caseId` (if unsafe), strategy, risk, matter internals | invisible |
| `Task` | No | `ClientPortalClientTodoDto` (only) | task explicitly requested-from / assigned-to client and published | label, due date, related request | assignee, internal status, workflow event, notes | invisible |
| `Document` / `DocumentVersion` | No | `ClientPortalVisibleDocumentVersionDto` / `ClientPortalUploadedDocumentDto` | version approved/published (or client upload pending review) | safe file name, version label, status, publishedAt, short-lived token | sp* metadata, storage key, workspaceText, review annotations, internal versions | invisible |
| `Communication` | No | `ClientPortalMessageDto` | message explicitly approved/client-visible | author display + side, sentAt, approved body, source badge, approved attachments | raw email body, classification, AI/internal drafts, recipients internals | invisible |
| `DocumentReviewSuggestion` / review session | No | *(none directly)* | — | *(only an approved "answer ready" message/timeline item)* | all review comments, ranges, reviewer chain | invisible |
| `TimeEntry` | No | `ClientPortalReport*Dto` (aggregate only) | approved report snapshot | aggregate counts/turnaround/category | minutes, per-entry detail, worker, cost, capacity | invisible |
| `ExternalWorkflowEvent` / `ExternalIntakeItem` (connector) | No | `ClientPortalSourceBadgeDto` / `ClientPortalConnectorStatusDto` / message | triaged **and** published | source, external id, policy-gated URL, approved status/note | raw payload, adapter logs, other queues, credentials | invisible until triaged + published |
| `Client` | No | `ClientPortalMeDto.currentWorkspace.clientDisplayName` (own only) | membership | display name of **own** client only | internal `clientId`, other clients, notes, tax/registration internals | own workspace only |
| `User` (internal) | No | `authorDisplayName` on approved artifacts only | approval | display name where safe | email, role, internal identity, assignments | invisible |
| `ClientPortalUser` / `ClientPortalMembership` (team) | Partial | `ClientPortalTeamMemberDto` | admin role + own client | display name, role, status within own client | other clients, internal users, tokens | own client only |

Worked examples (as required):
- **Internal `Case` → `ClientPortalRequest*Dto`** only if the case/request is
  published *and* membership scope matches.
- **Internal `Task` → `ClientPortalClientTodoDto`** only if explicitly
  assigned to / requested from the client.
- **Internal `Document` → `ClientPortalVisibleDocumentVersionDto`** only for an
  approved version.
- **Internal `Communication` → `ClientPortalMessageDto`** only for an approved
  client-visible message.
- **`ExternalIntakeItem` → not visible** until triaged and published.

---

## 7. Status DTO boundary

Client-facing status is a **translation/publication layer**, not the internal
workflow status.

Recommended client status vocabulary (Hungarian, matching UI):

| Client status | Meaning |
| --- | --- |
| `Beérkezett` | request received |
| `Feldolgozás alatt` | in progress at the firm |
| `Dokumentumra várunk` | waiting on client document |
| `Ügyvédi ellenőrzés alatt` | under lawyer review |
| `Válasz elkészült` | answer/output ready |
| `Lezárva` | closed |

Rules:
- The internal `CaseStatus` enum (e.g. `CLIENT_INPUT`, `IN_REVIEW`, `APPROVED`,
  `SENT_TO_CLIENT`, `FINAL`, `ON_HOLD`, `CANCELLED`, `ARCHIVED`) is **more
  detailed** and internal-only.
- Client status is produced by an **approved mapping** into the vocabulary above;
  the mapping table itself is internal.
- Client status **must not** reveal internal strategy, risk, hold reasons, or
  cancellation rationale (e.g. an internal `ON_HOLD` may surface as
  `Feldolgozás alatt` or a neutral published note — never the internal reason).
- **External connector status does not automatically become client status** — it
  must be triaged and mapped through an approved publication.

---

## 8. Timeline boundary

Timeline items are `ClientVisibleTimelineItem` projections; only these kinds may
appear (after approval):

**Allowed**
- request received;
- document requested;
- document uploaded (by client, in scope);
- lawyer review started (neutral);
- clarification requested;
- answer ready;
- matter closed;
- approved external workflow update.

**Forbidden**
- internal review handoff;
- internal AI drafting;
- private lawyer discussion;
- strategy notes;
- internal task reassignment;
- risk escalation;
- time entry;
- raw communication import.

A timeline item is emitted to the portal only when an internal action has an
**approved, client-safe counterpart**. Absence of a client timeline item does not
imply inactivity — it implies nothing is published.

---

## 9. Document boundary

**May show:** requested document name; upload status; approved version; safe file
name; document status; upload timestamp; uploader display name **if within the
same client scope**.

**Must not show:** internal file path; storage key; raw signed URL (unless
short-lived, single-use, and authorized); internal review annotations; redline
comments not approved; AI-generated draft; internal SharePoint metadata; other
clients' documents.

**Upload semantics:**
- an uploaded file becomes **`pending_review`** — never auto-accepted;
- it is **not automatically visible** to all client users;
- visibility depends on **role / scope / publication**;
- download of firm output uses a **short-lived, authorized token**, not a durable
  SharePoint/signed URL, and the token is scoped to the requesting membership.

---

## 10. Message / communication boundary

**May show:** approved lawyer message; client-originated portal message; selected
email-derived message **if approved**; a source badge
(`Email` / `Portal` / `Jira` / `Teams` / `Bitrix` / `Asana` / `Monday`).

**Must not show:** full raw email thread by default; internal communication
classification; AI draft; internal reply draft; unapproved imported connector
comment; confidential internal note.

A `Communication` row (including Outlook-imported rows with
`source=OUTLOOK`, `syncStatus=IMPORTED`) is **internal by default**. It becomes a
`ClientPortalMessageDto` only via an explicit `ClientVisibleMessage` approval that
copies a safe body (never the raw `content`) and safe attachment metadata.

---

## 11. Monthly report boundary

**Allowed:** aggregate counts; number of requests; number of closed items;
category breakdown; team breakdown (if role allows); average turnaround (if safe);
document/request status summary; upcoming deadlines; approved narrative summary.

**Forbidden:** per-minute timesheet; internal workload/capacity; individual lawyer
productivity (unless explicitly approved internally); internal cost calculations;
other-client benchmarking; sensitive risk classification; internal strategic
commentary.

Reports are `ClientVisibleReportSnapshot` artifacts: computed internally from
`TimeEntry`/`Matter`/`Case` data, then **approved and published** as aggregates.
The portal reads the snapshot, never the underlying `TimeEntry` rows.

---

## 12. Connector DTO boundary

Aligns with `connector-security-data-boundary-design.md` (§14 client portal
relationship) and its `pending_approval` outbound model.

**May show:** configured integrations for the **current client only**; source
badge; external ID; external URL **only if policy allows**; approved sync
status/comment; redacted audit event.

**Must not show:** connector credential; raw webhook payload; adapter logs; sync
retry payload; external objects from other queues; other clients' integration
names/settings; outbound draft before approval.

A connector event flows: `ExternalIntakeItem` (internal) → triage → optional
`ClientPortalPublication` (`pending_approval` → `approved` → `published`) →
`ClientPortalSourceBadgeDto` / `ClientPortalConnectorStatusDto`. **Nothing** from a
connector is client-visible until triaged and published.

---

## 13. API response examples

Illustrative only — **fake demo data**, no secrets, no real client data. Field
names are indicative of the future contract.

**`ClientPortalSummaryDto`**
```json
{
  "openRequests": 3,
  "awaitingClient": 1,
  "inLawyerReview": 2,
  "closedThisMonth": 4,
  "upcomingDeadlines": [
    { "deadlineId": "dl_9f2a", "label": "Aláírt szerződés feltöltése", "dueDate": "2026-07-15" }
  ]
}
```

**`ClientPortalRequestListItemDto`**
```json
{
  "requestId": "req_7b41",
  "title": "Bérleti szerződés felülvizsgálat",
  "clientStatus": "Ügyvédi ellenőrzés alatt",
  "updatedAt": "2026-07-01T09:12:00.000Z",
  "unreadCount": 1
}
```

**`ClientPortalRequestDetailDto`**
```json
{
  "requestId": "req_7b41",
  "title": "Bérleti szerződés felülvizsgálat",
  "clientStatus": "Ügyvédi ellenőrzés alatt",
  "summary": "A szerződéstervezetet átnézzük; a jelzett pontokról hamarosan visszajelzünk.",
  "nextSteps": [ { "stepId": "st_1", "label": "Ügyvédi ellenőrzés", "owner": "firm" } ],
  "openTodos": [ { "todoId": "td_1", "label": "Aláírt meghatalmazás feltöltése", "dueDate": "2026-07-10" } ],
  "visibleDocuments": [ { "versionId": "ver_22", "safeFileName": "szerzodes_v2.pdf", "versionLabel": "v2", "publishedAt": "2026-06-30T16:00:00.000Z" } ],
  "visibleDeadlines": [ { "deadlineId": "dl_9f2a", "label": "Aláírt szerződés feltöltése", "dueDate": "2026-07-15" } ]
}
```

**`ClientPortalDocumentRequestDto`**
```json
{
  "documentRequestId": "dreq_5",
  "name": "Aláírt meghatalmazás",
  "status": "Dokumentumra várunk",
  "dueDate": "2026-07-10",
  "instructions": "Kérjük, töltse fel az aláírt meghatalmazást PDF formátumban."
}
```

**`ClientPortalMessageDto`**
```json
{
  "messageId": "msg_33",
  "authorDisplayName": "Dr. Példa Ügyvéd",
  "authorSide": "firm",
  "sentAt": "2026-07-01T08:40:00.000Z",
  "body": "Köszönjük a dokumentumot. A felülvizsgálat után jelentkezünk.",
  "sourceBadge": { "source": "Portal" },
  "attachments": []
}
```

**`ClientPortalReportSummaryDto`**
```json
{
  "period": "2026-06",
  "requestsOpened": 5,
  "requestsClosed": 4,
  "avgTurnaroundDays": 3.2,
  "narrative": "Júniusban 5 megkeresés érkezett, ebből 4 lezárult."
}
```

**`ClientPortalIntegrationDto`**
```json
{
  "integrationId": "int_email_01",
  "source": "Email",
  "displayName": "Ügyfél e-mail csatorna",
  "status": "Aktív",
  "connectedAt": "2026-06-20T10:00:00.000Z"
}
```

---

## 14. Security and negative test plan (future)

Deny-list / boundary tests to implement alongside any future portal code:

1. Internal model fields are **not present** in any DTO (schema-shape assertion per DTO).
2. AI draft cannot appear in a message DTO (even if the source `Communication` has one).
3. Internal note (`Comment`) cannot appear in a timeline DTO.
4. Raw email body is **not** visible unless an approved `ClientVisibleMessage` exists.
5. Document review annotation (`DocumentReviewSuggestion`) is never visible.
6. Unauthorized client cannot infer a resource exists → `404`, never `403`.
7. Connector event is not visible until publication (`pending_approval`/`approved` alone → hidden).
8. Revoked publication disappears from portal responses (audit only).
9. Superseded document version is hidden unless history explicitly allowed.
10. Monthly report excludes time-entry internals (no `minutes`, no per-entry rows).
11. **DTO serializers cannot accidentally spread a Prisma model** — a static/lint
    or runtime test asserts mappers never pass through unknown keys (allow-list only).
12. Cross-tenant scope test: a member of client A cannot read any artifact scoped to client B.
13. `approved` ≠ `published` — an approved-but-not-published artifact is not returned.
14. Short-lived download token is single-use, scope-bound, and expires; a durable
    SharePoint/signed URL is never emitted.

---

## 15. Later implementation guidance (docs-only)

- **Never** use `{ ...prismaModel }` (or `res.json(prismaRow)`) to build a portal response.
- Use **explicit mapper functions** per DTO (`toClientPortalRequestListItemDto(...)`), allow-list only.
- Write **deny-list tests** (fields that must never serialize) for every DTO.
- Keep DTO builders **server-side**; never rely on the frontend hiding fields.
- **Separate** internal DTOs from client-portal DTOs in code (distinct modules/namespaces).
- Treat the **publication/grant check as mandatory** *before* mapping — mapping a
  non-published record is a bug, not just a UI concern.
- Prefer **opaque ids** (`req_*`, `ver_*`) over internal ids in client responses.
- Resolve scope from **authenticated `ClientPortalUser` + active
  `ClientPortalMembership`** only — never from a client-supplied `clientId`.
- Emit `404` (not `403`) for out-of-scope/unpublished resources.
- Log every portal read/publish action to `ClientPortalAuditEvent`.

---

## 16. Open questions

1. Do we expose a **client-visible history** of superseded document versions, or
   only the latest published version? (Default: latest only.)
2. Are **team_lead** users allowed the team report breakdown in MVP, or manager/admin only?
3. Should **external URLs** (Jira/Teams/etc.) ever be shown to clients, or is the
   source badge alone sufficient in v1? (Default: badge only; URL policy-gated later.)
4. What is the **download token** mechanism (signed short-lived token vs. proxied
   stream)? Needs a security decision before document DTOs are built.
5. Does the client status vocabulary need a per-firm/customizable mapping, or is
   the fixed 6-value set sufficient?
6. Where does the **publication approval UI** live for internal users (Case
   detail, a dedicated review queue, or the connector triage screen)?
7. Retention/erasure: how do revoked/expired publications interact with GDPR
   client data-subject requests?

---

## 17. Recommended next prompt

> **Adminiculum — Client Portal publication artifact model split plan (docs-only)**
> Define the conceptual (non-schema) split for `ClientPortalPublication` /
> `ClientPortalGrant` and the per-object visibility artifacts
> (`ClientVisibleStatus`/`Message`/`DocumentVersion`/`TimelineItem`/`ReportSnapshot`),
> including state machine, approver roles, audit hooks, and how each maps to the
> DTOs in `docs/client-portal-dto-publication-boundary.md`. Keep it docs-only:
> no schema edits, no migrations, no routes, no runtime/auth change. Do not
> unblock CP-SCHEMA-1 / CONNECTOR-SCHEMA-1; note their baseline/proof prerequisites.

---

*Docs-only. No runtime, schema, migration, DB, auth, or client-portal-enablement
change. CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain blocked.*
