# Client Portal Publication Artifact Payload and Validator Design

> Status: **docs-only design**. No implementation, no schema, no migration, no
> routes, no auth change, no runtime change. Client Portal remains future-only /
> gated (`ENABLE_CLIENT_PORTAL` off). This document **does not** unblock
> CP-SCHEMA-1 or CONNECTOR-SCHEMA-1 — both remain blocked by Prisma baseline/proof
> work; their prerequisites are unchanged.
>
> Defines, for each future `ClientVisible*` publication artifact family, the exact
> conceptual client-safe **payload shape**, the **allow-list transform**, the
> **payload validator + deny-list**, and the **test matrix** proving forbidden
> internal fields cannot be persisted or serialized. Extends:
> - `docs/client-portal-publication-approval-audit-workflow.md`
> - `docs/client-portal-publication-artifact-model-split-plan.md`
> - `docs/client-portal-dto-publication-boundary.md`
> - `docs/client-portal-tenant-isolated-api-contract.md`
> - `docs/client-portal-v1-security-contract-audit.md`
> - `docs/client-portal-v1-identity-authorization-plan.md`
> - `docs/connector-security-data-boundary-design.md`
> - `docs/universal-connector-compatibility-architecture.md`

---

## 1. Executive summary

The publication artifact payload must be **safe before it reaches DTO mapping**.
DTO mapping is the *last* safety layer, not the first or only one.

**The only safe path:**

```
internal source object
  → allow-list transform      (copy only permitted fields, translate vocab, redact)
  → payload validator          (required/allowed/enum/length/URL/deny-list; fail closed)
  → approval workflow          (approver previews the validated payload)
  → published artifact         (state = published)
  → grant check                (membership/team/role scope)
  → client portal DTO mapper   (allow-list build; never reintroduces internal fields)
```

**Never:** `internal source object → spread/serialize directly into portal DTO`.

The validator is a **server-side, fail-closed** gate. Frontend hiding is not
security. Every artifact family has a typed payload shape, an allow-list of field
names, a deny-list that rejects forbidden names/patterns at **any** nesting depth,
and tests proving both.

UI source (`C:\Users\hubay\Documents\Ügyfélportál`, "Adminiculum Ügyfélportál
v1.1/v1.2" PDFs + design zips) informs payload field sets (request/status/timeline/
todo/document/message/deadline/report/integration). **No UI assets copied** — only
payload/field implications summarized.

---

## 2. Validator architecture concept (future layers)

| Layer | Responsibility | May see internal fields? | Returns to portal? |
| --- | --- | --- | --- |
| **A) Source extractor** | reads the internal source object (`Case`, `Document`, `Communication`, `TimeEntry`, connector item…) | Yes (internally) | **Never directly** |
| **B) Allow-list transformer** | copies **only** explicitly permitted fields; translates internal status/category/source into client-safe vocabulary; drops/redacts unsafe content | Reads internal, emits safe-only | No |
| **C) Payload validator** | validates required fields, allowed field names, enum values, text length, URL safety, source badges; **rejects forbidden names, suspicious nested objects, raw model shapes**; **fails closed** | Sees candidate payload only | No |
| **D) Approval preview** | shows the **exact validated payload** to the internal approver | Shows validated payload | No (internal preview) |
| **E) DTO mapper** | maps the **published** artifact payload → `ClientPortal*Dto`; **does not reintroduce internal source fields** | Reads validated artifact only | Yes (to granted user) |

Rules: validators are **server-side**; a payload that fails validation **cannot be
approved**; publish **revalidates**; the DTO mapper builds by allow-list from the
stored artifact, never from the source model.

---

## 3. Global payload rules

**Allowed global metadata (any family):** `artifactDisplayId` (opaque);
`title`; `description`/`clientFriendlyText`; `status`/`clientFriendlyStatus`;
`sourceBadge`; `createdAt`/`publishedAt`; `dueDate`/`deadline` (if approved);
safe **action labels**; safe **links only via controlled link objects**
(`actionRef`); **display names only within same client scope**; `externalId`
**only when policy allows**.

**Forbidden globally (any family, any nesting):** internal database IDs (unless
mapped to opaque portal IDs); raw Prisma model objects; internal note fields; AI
prompt/completion/model metadata; raw email headers/body/thread; raw webhook
payload; connector credentials; raw storage URLs; SharePoint metadata; review
annotations; risk score; litigation/settlement strategy; internal task assignee
notes; time-entry details; billing internals; other-client references; debug logs;
stack traces.

**Global validator invariants:**
1. **Allow-list only** — any field name not in the family's allow-list → reject.
2. **Deny-list everywhere** — any name/pattern in §8 at any depth → reject.
3. **Opaque IDs** — internal ids must be pre-mapped to opaque portal ids (`req_*`, `ver_*`); a raw uuid where an opaque id is required → reject.
4. **No raw links** — a URL string where an `actionRef` is required → reject.
5. **Bounded** — every text field has a max length (§7); over-length → reject (not silently truncate, unless the transform explicitly truncates a preview).
6. **Fail closed** — unknown shape, unexpected nested object, or ambiguous field → reject, never pass through.

---

## 4. Payload family specifications

For each: sources, purpose, required/optional/allowed-nested fields, forbidden,
transform rules, validator rules, DTO target, MVP/later.

### A) `ClientVisibleRequestPayload`
- **Sources:** `Case`; manual portal request; `ExternalIntakeItem` (after triage); `Communication` (after conversion).
- **Required:** `portalRequestId`(opaque), `title`, `category`(client-safe), `clientFriendlyStatus`, `todoCount`, `createdAt`.
- **Optional:** `requesterDisplayName`(same-scope), `teamDisplayName`, `deadline`, `nextStep`, `sourceBadge`, `externalIdChip`(policy), `updatedAt`.
- **Allowed nested:** `sourceBadge{source,externalUrlActionRef?}`.
- **Forbidden:** internal `caseNumber`/`caseId` (unless mapped), strategy, priority reasoning, assignee notes, risk score, raw internal status code.
- **Transform:** map `CaseStatus` → `clientFriendlyStatus`; category → client vocabulary; count client-visible todos.
- **Validator:** allow-list; enum on category/status; length on title/nextStep; opaque id required.
- **DTO:** `ClientPortalRequestListItemDto` / `ClientPortalRequestDetailDto`. **MVP.**

### B) `ClientVisibleStatusPayload`
- **Sources:** `Case` status; `Task` state; document workflow state; connector sync state (after approval).
- **Required:** `status`(enum, client-safe), `label`, `effectiveAt`, `actionRequired`(bool).
- **Optional:** `explanation`, `relatedRequestId`.
- **Forbidden:** internal status code if not mapped; hold/cancellation reason; strategy.
- **Transform:** internal status → one of the 6 client statuses (§B doc); `actionRequired` derived.
- **Validator:** status ∈ {`Beérkezett`,`Feldolgozás alatt`,`Dokumentumra várunk`,`Ügyvédi ellenőrzés alatt`,`Válasz elkészült`,`Lezárva`}; reject any raw internal code.
- **DTO:** embedded in request DTOs / `clientStatus`. **MVP.**

### C) `ClientVisibleTimelineItemPayload`
- **Sources:** approved internal event; document request/upload; message publication; deadline publication; connector approved update.
- **Required:** `timelineItemId`(opaque), `type`(enum allow-list), `title`, `occurredAt`.
- **Optional:** `body`, `sourceBadge`, `relatedRequestId`, `clientActionRequired`.
- **Forbidden types:** internal review handoff, AI drafting, task reassignment, risk escalation, strategy, time entry.
- **Transform:** map approved event → allowed `type`; short client-safe title/body.
- **Validator:** `type` ∈ allow-list only; body length; reject forbidden event types.
- **DTO:** `ClientPortalRequestTimelineItemDto` / `ClientPortalLatestUpdateDto`. **MVP.**

### D) `ClientVisibleTodoPayload`
- **Sources:** `Task` (only if explicitly client-assigned); document request; clarification request; signature/review instruction.
- **Required:** `todoId`(opaque), `title`, `instruction`, `actionType`(enum), `relatedRequestId`.
- **Optional:** `dueDate`, `priorityLabel`, `relatedDocumentRequestId`, `completedAt`.
- **Forbidden:** internal lawyer tasks, admin checklist, review subtasks, AI task.
- **Transform:** only client-facing action items; wording approved.
- **Validator:** `actionType` ∈ {`upload`,`clarify`,`review`,`confirm`,`sign`}; length; opaque ids.
- **DTO:** `ClientPortalClientTodoDto`. **MVP.**

### E) `ClientVisibleDocumentRequestPayload`
- **Sources:** internal document-request task; lawyer request; approved checklist item.
- **Required:** `documentRequestId`(opaque), `displayName`, `instruction`, `acceptedFileTypes`(list), `status`, `relatedRequestId`.
- **Optional:** `dueDate`, `maxFileSizeLabel`.
- **Forbidden:** internal strategic reason; internal reviewer note; storage metadata.
- **Transform:** client-friendly instruction; accepted types allow-list.
- **Validator:** `acceptedFileTypes` ∈ safe extension allow-list; length; opaque ids.
- **DTO:** `ClientPortalDocumentRequestDto`. **MVP.**

### F) `ClientVisibleDocumentVersionPayload` — **high risk**
- **Sources:** `Document` **approved version only**.
- **Required:** `visibleDocumentVersionId`(opaque), `displayName`, `versionLabel`, `status`, `downloadActionRef`, `relatedRequestId`.
- **Optional:** `finalizedAt`, `uploadedAt`, `uploadedByDisplayName`(same-scope).
- **Allowed nested:** `downloadActionRef{ref,expiresHint?}` (never a URL).
- **Forbidden:** **raw URL**; storage key; `spItemId`/`spWebUrl`/`spPath`; `workspaceText`; review comments; unapproved redline; AI draft.
- **Transform:** safe file name; version label; **no** storage fields copied.
- **Validator (high-risk, mandatory day one):** reject any URL string; reject `sp*`/`storageKey`/`workspaceText`/`annotation`/`reviewComment`; require `downloadActionRef` (not a URL); opaque id.
- **DTO:** `ClientPortalVisibleDocumentVersionDto`. **MVP.**

### G) `ClientVisibleMessagePayload` — **high risk**
- **Sources:** approved lawyer message; client-originated portal message; approved email-derived message; approved connector comment.
- **Required:** `messageId`(opaque), `threadId`(opaque), `senderDisplayName`, `senderRoleLabel`(`client`/`firm`), `body`, `createdAt`.
- **Optional:** `sourceBadge`, `attachmentRefs[]`(approved only), `relatedRequestId`.
- **Forbidden:** raw email thread/body/headers; internal communication classification/labels; AI draft metadata; internal reply draft; unapproved attachments.
- **Transform:** approved body only (never raw `content`); attachment refs limited to approved.
- **Validator (high-risk):** body max length; reject `rawEmail`/`emailHeaders`/quoted-thread markers; reject internal label fields; every `attachmentRef` must be an approved ref; opaque ids.
- **DTO:** `ClientPortalMessageDto`. **MVP.**

### H) `ClientVisibleDeadlinePayload`
- **Sources:** approved deadline; client-action deadline; court/authority deadline (only if safe).
- **Required:** `deadlineId`(opaque), `title`, `date`, `relatedRequestId`, `actionRequired`(bool), `status`.
- **Optional:** `timeZone`, `explanation`.
- **Forbidden:** internal deadline calculation; strategic urgency note; litigation planning.
- **Transform:** client-friendly label; safe date.
- **Validator:** date format; length; reject strategy fields; opaque ids.
- **DTO:** `ClientPortalDeadlineDto`. **MVP.**

### I) `ClientVisibleReportSnapshotPayload` — **high risk**
- **Sources:** monthly report generation (`TimeEntry`/`Matter`/`Case` aggregates).
- **Required:** `reportId`(opaque), `periodStart`, `periodEnd`, `generatedAt`, `requestCounts{opened,closed}`.
- **Optional:** `approvedAt`, `summaryText`, `categoryBreakdown[]`, `teamBreakdown[]`(role-gated), `turnaroundSummary`, `upcomingDeadlines[]`, `documentStatusSummary`.
- **Forbidden:** time-entry detail; per-minute/`billableMinutes`; `hourlyRate`; lawyer productivity; capacity; other-client benchmark.
- **Transform:** **aggregate-only** computation; approved narrative.
- **Validator (high-risk):** every numeric must be an aggregate (no per-entry array); reject `billableMinutes`/`hourlyRate`/`capacity`/`timeEntry`; `teamBreakdown` only if role allows; length on `summaryText`.
- **DTO:** `ClientPortalReport*Dto`. **MVP (summary) / Later (team/trend).**

### J) `ClientVisibleConnectorLinkPayload`
- **Sources:** `ExternalObjectLink` (after publication); `ExternalIntakeItem` (after triage).
- **Required:** `sourceSystem`(enum badge), `externalDisplayId`, `externalObjectType`, `relatedRequestId`.
- **Optional:** `sourceBadge`, `externalUrlActionRef`(policy), `syncStatusLabel`.
- **Forbidden:** raw webhook payload; credentials; adapter logs; other-queue objects.
- **Transform:** badge + display id; external URL only via policy-gated `actionRef`.
- **Validator:** `sourceSystem` ∈ badge allow-list (§6); reject raw URL (require `externalUrlActionRef`); reject payload/credential fields.
- **DTO:** `ClientPortalExternalObjectLinkDto` / `ClientPortalConnectorStatusDto`. **Later.**

### K) `ClientVisibleIntegrationAuditItemPayload`
- **Sources:** redacted connector sync/audit event.
- **Required:** `auditItemId`(opaque), `actionLabel`, `sourceSystem`, `status`, `occurredAt`, `actorLabel`(redacted).
- **Optional:** `externalDisplayId`, `redactedReasonCode`.
- **Forbidden:** raw payload; adapter debug; credentials; error stack; other-client integration data.
- **Transform:** redacted action + reason code only.
- **Validator:** `actionLabel`/`status` ∈ allow-list; reject payload/stack/credential fields; reason is a **code**, not free text.
- **DTO:** `ClientPortalIntegrationAuditItemDto`. **Later.**

---

## 5. URL and file-reference safety

- **No persisted raw signed URLs** in any payload.
- Use `downloadActionRef` / `actionRef` (an opaque server-resolvable reference), never a URL string.
- `actionRef` is **resolved server-side only after** membership/grant check, producing a **short-lived, single-use, scope-bound** URL at request time (never stored).
- `externalUrl` may be shown **only** through a policy-approved `externalUrlActionRef`, subject to grant + policy.
- Storage paths/keys (`spItemId`, `spWebUrl`, `spPath`, `storageKey`) are **forbidden** in payloads.
- Every file access is short-lived, scoped, and **audited** (`publication_artifact_downloaded`).

---

## 6. Source badge and external ID rules

**Safe source badge allow-list:** `Portal`, `Email`, `Jira`, `Teams`,
`Bitrix24`, `Asana`, `Monday`, `Trello`, `ClickUp`, `Egyedi rendszer`.

Rules:
- A source badge appears **only if publication policy allows** it for that artifact.
- An `externalId`/`externalDisplayId` chip **must not reveal other client/project data** — it is the object's own id, validated to not embed cross-tenant references.
- An **external URL** is visible only if the current user has a grant **and** policy allows (via `externalUrlActionRef`).
- Any `sourceSystem` outside the allow-list → validator reject (or coerced to `Egyedi rendszer` only if policy explicitly maps it).

---

## 7. Text sanitization rules

- **Max lengths (indicative):** `title` ≤ 200; `label` ≤ 80; `instruction`/`explanation` ≤ 1000; message `body` ≤ 5000; `summaryText` ≤ 4000; `nextStep` ≤ 300. Over-length → reject (transform may pre-truncate a *preview* field deliberately).
- **Strip or reject HTML** unless an explicitly sanitized subset is designed; **no `<script>`, no `<iframe>`, no event handlers, no `javascript:` URLs**.
- **No raw quoted email thread** by default (message body is the approved text, not the thread dump).
- **No hidden metadata** (comments, data-attributes, zero-width markers).
- **No internal comment markers** (e.g. `[[internal:…]]`, reviewer tags).
- **No "AI draft" labels** unless a future explicit client-facing disclosure feature is designed and approved.
- **Markdown policy:** if allowed, a safe subset only (bold/italic/lists/links-as-actionRef); raw HTML disallowed; links must resolve to `actionRef`, not arbitrary URLs.

---

## 8. Deny-list validator concept

Canonical deny-list — validators reject a payload if any of these **field
names/patterns** appear at **any** object level (case-insensitive, substring/word
match as appropriate):

`internalNote`, `lawyerNote`, `assistantNote`, `strategy`, `riskScore`,
`riskLevelInternal`, `aiDraft`, `aiSummaryInternal`, `prompt`, `completion`,
`model`, `rawEmail`, `emailHeaders`, `rawWebhook`, `webhookPayload`, `credential`,
`token`, `secret`, `password`, `storageKey`, `spItemId`, `spWebUrl`,
`workspaceText`, `reviewComment`, `annotation`, `reviewerChain`, `timeEntry`,
`billableMinutes`, `hourlyRate`, `capacity`, `internalAssignee`, `debug`, `stack`,
`otherClient`.

**Semantic checks (beyond names):**
- nested object **looks like a full Prisma model** (e.g. has `createdById` +
  `updatedAt` + internal-only keys together) → reject;
- object includes an **unrelated `clientId`** (≠ the artifact's target client) → reject;
- object includes **raw file/storage metadata** shapes → reject;
- object contains **connector payload or credential fragments** (e.g. `Bearer `,
  `access_token`, URL with credentials, base64 blobs beyond expected fields) → reject.

The deny-list is a **defense-in-depth** backstop *on top of* the allow-list — a
field must be both **on the allow-list** and **not** matching the deny-list.

---

## 9. Allow-list transformer examples (illustrative, fake field names — not code)

- **`Case` → `ClientVisibleRequestPayload`:** copy `title→title`,
  `map(status)→clientFriendlyStatus`, `map(caseType)→category`,
  `assignedLawyer.name→(dropped)`, `deadline→deadline`; compute
  `todoCount=countClientTodos()`; assign `portalRequestId=opaque(caseId)`. **Drop**
  everything else (strategy, priority, notes, ids).
- **`Task` → `ClientVisibleTodoPayload`:** only if `task.clientAssigned`; copy
  `title→title`, `map(kind)→actionType`, `dueDate→dueDate`; **drop** assignee,
  internal status, workflow event.
- **`Document` → `ClientVisibleDocumentVersionPayload`:** only approved version;
  copy `fileName→displayName`, `versionLabel→versionLabel`; produce
  `downloadActionRef=ref(versionId)`; **drop** `spWebUrl`, `spItemId`, `spPath`,
  annotations, redlines.
- **`Communication` → `ClientVisibleMessagePayload`:** only approved; copy
  approved `body`, `senderDisplayName`, badge; **drop** raw `content`, headers,
  classification, AI draft.
- **`ExternalIntakeItem` → `ClientVisibleConnectorLinkPayload` / request badge:**
  after triage; copy `sourceSystem→sourceBadge`, `externalId→externalDisplayId`;
  **drop** raw payload, adapter logs, credentials.
- **`TimeEntry` → `ClientVisibleReportSnapshotPayload`:** aggregate only — sum to
  `requestCounts`/`categoryBreakdown`/`turnaroundSummary`; **never** copy
  `minutes`, worker, or rate.

These examples imply **no implementation**; field names are demonstrative.

---

## 10. Validator test matrix (future)

**General**
1. Unknown/unexpected field → rejected (allow-list).
2. Forbidden field name at **top level** → rejected.
3. Forbidden field name **nested** (any depth) → rejected.
4. Raw Prisma-model-shaped object → rejected (semantic check).
5. Payload with **other-client** reference → rejected.
6. Raw URL where `actionRef` required → rejected.
7. Connector credential/token fragment → rejected.
8. AI prompt/completion/model metadata → rejected.
9. Time-entry detail → rejected.
10. Review annotation → rejected.

**Family-specific**
- Document payload rejects `storageKey`/`spWebUrl`/`spItemId`/`workspaceText`.
- Message payload rejects `rawEmail`/`emailHeaders`/quoted thread.
- Report payload rejects `billableMinutes`/`hourlyRate`/per-entry arrays.
- Connector payload rejects `rawWebhook`/adapter log.
- Status payload rejects internal status code not in the client vocabulary.
- Request payload rejects internal case note / risk score.
- Timeline payload rejects internal task-reassignment event type.

**Shape/serialization**
- DTO mapper output snapshot equals the allow-list shape exactly (no extra keys).
- Fuzz: inject each deny-list token into a valid payload → each rejected.
- Fail-closed: malformed/ambiguous payload → rejected, not passed through.

---

## 11. Relationship to the approval workflow

- **Only a validated payload may enter approval preview** — the approver never
  sees an unvalidated candidate.
- The **approval preview shows exactly what the client may see** (the validated
  payload → DTO WYSIWYG).
- An approver **cannot approve** a payload that fails the validator (the action is
  disabled/blocked).
- The **publish action revalidates** the payload (defense against tampering between
  approval and publish).
- Revoked/superseded/expired payloads are **not returned** by the DTO mapper (state
  check precedes mapping).

---

## 12. Relationship to future schema split

| Option | Storage | Trade-off |
| --- | --- | --- |
| **A** | Generic JSON payload + validator per `artifactType` | flexible; but free-form JSON is where leaks hide |
| **B** | Typed tables/columns per family | strong DB constraints; more migrations/code |
| **C (recommended MVP)** | **Hybrid** — generic publication metadata + **typed JSON payload with strict server-side validators**; typed tables **later** for high-risk families | strong shared state/grant model + validated payloads now; migrate `DocumentVersion`/`Message`/`ReportSnapshot` toward typed tables later |

**Recommendation:** hybrid for MVP; **high-risk validators
(`DocumentVersion`/`Message`/`ReportSnapshot`) are mandatory from day one**; **no
free-form unvalidated JSON** is ever persisted or served. Do not implement; no
schema edits. These sit in the future CP-PUBLICATION-SCHEMA phases, downstream of
the still-blocked CP-SCHEMA-1.

---

## 13. Security and negative implementation guidance (docs-only)

- **Never** use `{ ...sourceModel }` to build a payload or DTO.
- **Never** return a raw Prisma object.
- **Never rely on TypeScript `Omit` alone** — types are erased at runtime; use an
  explicit runtime **allow-list builder** + validator.
- Validators **fail closed** (reject on unknown/ambiguous).
- Mapping tests **snapshot the allowed DTO shape** (extra keys fail the test).
- **Deny-list tests run server-side** (not just types).
- The **frontend is not a security boundary** — never depend on UI hiding.
- **Logs must not include rejected sensitive payload values** — log the field
  *name*/reason code that failed, never the offending value.

---

## 14. Open questions

1. Is the deny-list **name-based + semantic** enough, or do we also need a
   per-family **schema (allow-list) contract** validator (e.g. a JSON-schema-like
   spec) generated from these docs?
2. Should over-length text **reject** or **transform-truncate** — per field?
3. What is the exact **markdown subset** (if any) for message/report body?
4. `actionRef` design: opaque token table vs signed capability — decide before doc/report download payloads.
5. Do we allow a client-facing **"AI-assisted, lawyer-approved"** disclosure label
   later, or never surface AI provenance?
6. External URL policy: which roles ever see `externalUrlActionRef`, and per which sources?
7. How are **opaque id** mappings stored/resolved (per-artifact vs global id map)?
8. Should the validator emit a **machine-readable rejection reason** for the
   internal approval UI (which forbidden field, which rule)?

---

## 15. Recommended next prompt

> **Adminiculum — Client Portal read-path & grant-resolution query design (docs-only).**
> Define how each `/api/v1/client-portal/me/*` endpoint resolves the authenticated
> `ClientPortalUser` + active `ClientPortalMembership`, applies publication-state +
> grant-scope filters, and maps published artifact payloads to DTOs — including the
> non-enumerating `404` rule, the query-before-map ordering, index/scoping
> considerations (conceptual), and negative tests for cross-tenant/ungranted
> access. Keep it docs-only: no schema edits, no migrations, no routes, no
> runtime/auth change. Do not unblock CP-SCHEMA-1 / CONNECTOR-SCHEMA-1; note their
> baseline/proof prerequisites.

---

*Docs-only. No runtime, schema, migration, DB, auth, or client-portal-enablement
change. CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain blocked.*
