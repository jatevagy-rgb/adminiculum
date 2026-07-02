# Client Portal Submission-to-Publication Triage Workflow

> Status: **docs-only design**. No implementation, no schema, no migration, no
> routes, no auth change, no runtime change. Client Portal remains future-only /
> gated (`ENABLE_CLIENT_PORTAL` off). This document **does not** unblock
> CP-SCHEMA-1 or CONNECTOR-SCHEMA-1 — both remain blocked by Prisma baseline/proof
> work; their prerequisites are unchanged.
>
> Defines how client-originated submissions move through **internal triage** into
> internal Adminiculum objects and, only after internal review, into
> proposed/published client-visible artifacts. Extends:
> - `docs/client-portal-write-path-submission-boundary-design.md`
> - `docs/client-portal-read-path-grant-resolution-design.md`
> - `docs/client-portal-publication-payload-validator-design.md`
> - `docs/client-portal-publication-approval-audit-workflow.md`
> - `docs/client-portal-publication-artifact-model-split-plan.md`
> - `docs/client-portal-dto-publication-boundary.md`
> - `docs/client-portal-tenant-isolated-api-contract.md`
> - `docs/client-portal-tenant-isolation-login-ui-alignment.md`
> - `docs/client-portal-v1-security-contract-audit.md`
> - `docs/client-portal-v1-identity-authorization-plan.md`
> - `docs/connector-security-data-boundary-design.md`
> - `docs/universal-connector-compatibility-architecture.md`

---

## 1. Executive summary

Client-originated submissions never move themselves. The only chain is:

```
Client-originated submission
  → internal triage queue           (human internal review)
  → internal object / action         (Case / Task / Communication / Document review / …)
  → proposed ClientVisible* artifact (allow-list transform + validator)
  → approval workflow                (lawyer/admin approve)
  → published + granted artifact     (state + grant scope)
  → client portal DTO                (allow-list mapper, read-path scoped)
```

Invariants:
1. A client submission is **not** automatically legal advice.
2. A client submission is **not** automatically a `Case`.
3. A client submission is **not** automatically visible to all users in the tenant.
4. A client upload is **not** automatically an accepted/final document.
5. A client message is **not** an approved lawyer response.
6. **Internal triage** decides whether a submission becomes a case, task, document
   review, communication, clarification, invitation, or integration setup.
7. **Duplicate/merge handling never reveals hidden matters** to the client.
8. Publication artifacts are created **only** after explicit triage/publication decisions.
9. AI and connector actors can **suggest** but never triage/approve/publish.

UI source (`C:\Users\hubay\Documents\Ügyfélportál`, "Adminiculum Ügyfélportál
v1.1/v1.2" PDFs + design zips) implies an internal triage/queue surface and a
client side showing only **safe received/pending** states. **No UI assets copied**
— only triage/state implications summarized.

---

## 2. Submission triage concept

**`ClientPortalSubmissionTriageQueue`** (conceptual future model) — an internal
queue where client-originated submissions are reviewed **before** they affect legal
workflow or publication.

Sources: new legal request; request message/reply; general message; document
upload; clarification response; team invitation; membership/team change request;
integration setup request; connector-linked client action.

A submission is **internal / pending until triaged** — it produces no client-visible
publication artifact and no legal effect on its own.

---

## 3. Submission states

| State | Meaning | Who sets | Client sees anything? | Internal object exists? | Publication proposed? | Audit event |
| --- | --- | --- | --- | --- | --- | --- |
| `received` | intake accepted by server | system | generic "Beérkezett" | no | no | `client_submission_received` |
| `pending_validation` | payload being validated | system | "Feldolgozás alatt" | no | no | `client_submission_validated` |
| `pending_triage` | awaiting internal reviewer | system | "Feldolgozás alatt" | no | no | `client_submission_triage_started` |
| `needs_clarification` | reviewer needs more info | lawyer/assistant | "További adat szükséges" | maybe | no | `client_submission_clarification_requested` |
| `accepted` | valid, will be processed | lawyer/assistant | generic pending | maybe | maybe | (triage action) |
| `linked_to_existing` | linked to an existing matter | lawyer/assistant | generic (no hidden id) | yes (existing) | maybe | `client_submission_linked_to_case` |
| `converted_to_case` | new Case created | lawyer | generic pending | yes | maybe | `client_submission_converted_to_case` |
| `converted_to_task` | Task created | lawyer/assistant | generic | yes | maybe | `client_submission_converted_to_task` |
| `converted_to_communication` | Communication created | lawyer/assistant | generic | yes | maybe | `client_submission_converted_to_communication` |
| `document_review_started` | upload entered review | lawyer/assistant | "Ellenőrzés alatt" | yes | not yet | `client_submission_document_review_started` |
| `invitation_pending` | invite awaiting processing | admin/lawyer | "Függőben" | pending invite | n/a | (invitation audit) |
| `integration_setup_pending` | connector setup review | admin | "Ellenőrzés alatt" | draft connection | n/a | (integration audit) |
| `duplicate` | same as an existing item | lawyer/assistant | generic (no hidden id) | link only | no | `client_submission_marked_duplicate` |
| `ignored_not_legal` | not a legal matter | lawyer | generic ack | no | no | `client_submission_ignored` |
| `rejected` | rejected | lawyer/admin | generic | no | no | `client_submission_rejected` |
| `error` | processing error | system | generic retry | no | no | `submission_triage_error` |

**Client-visible feedback stays generic and safe** (`Beérkezett`, `Feldolgozás
alatt`, `További adat szükséges`) — never raw internal triage detail.

---

## 4. Triage actors and responsibilities

### Internal

| Actor | Submit | Triage | Link to existing | Create internal object | Propose publication | Approve publication | Reject/ignore | See triage state |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Lawyer** | — | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Supervising lawyer** | — | Yes | Yes | Yes | Yes | Yes (sensitive) | Yes | Yes |
| **Assistant / paralegal** | — | Yes (operational) | Yes | Propose/create per policy | Propose | **No** | Propose | Yes |
| **Internal admin** | — | Operational | Operational | Operational | Operational | Operational only | Yes | Yes |
| **System / background worker** | Ingest | Auto-validate/route only | No (suggest) | No | No | No | No | n/a |
| **AI helper** | — | **Suggest only** | Suggest | No | No (may draft text) | **Never** | **Never** | No |
| **Connector service actor** | Ingest intake | **No decision** | No | No | No | **Never** | No | No |

### Client

| Actor | Submit | Triage | See triage state |
| --- | --- | --- | --- |
| Requester / team lead / client manager / client admin | Yes (per write-path roles) | **No** | Only safe client-visible states |

**Client users cannot triage legal work. AI cannot decide/approve. Connector cannot
triage/publish.**

---

## 5. Triage actions by submission type

### A) New legal request submission
Actions: accept as new `ClientVisibleRequest` proposal; create new `Case`; link to
existing `Case`; create `Task`; create `Communication`; request clarification; mark
duplicate; reject/ignore as not legal.
Rules: client `category`/`priority`/`deadline` are **hints only**; internal legal
category decided by a **human**; **duplicate handling must not reveal a hidden case**.

### B) Request message / reply
Actions: link to existing `Communication` thread; create internal `Communication`;
propose `ClientVisibleMessage` if safe; request clarification; mark internal-only;
escalate to lawyer.
Rules: the client message may appear as **client-originated** in the granted thread;
a **lawyer response still requires the publication workflow**.

### C) General message
Actions: create intake item; link to existing request/case; create new request;
request clarification; ignore/not legal.

### D) Document upload
Actions: attach to a document request; start document review; accept as received;
reject upload; request replacement; propose `ClientVisibleDocumentVersion` **only
after review/approval**.
Rules: **upload is pending review by default** — not final/accepted automatically.

### E) Clarification response
Actions: mark client-todo answered; create internal review task; propose a status
update; request further clarification.

### F) Invitation / team change
Actions: approve invitation; reject invitation; adjust role/team scope; request
internal review.
Rules: **client-admin scope only**; cannot create an internal Adminiculum user;
cannot grant other-client access.

### G) Integration setup request
Actions: create a connector setup review item; request the secure credential flow;
mark draft connection pending verification; reject/hold.
Rules: **connector not activated automatically**; **no secrets through the normal
submission body**.

---

## 6. Duplicate and merge handling

Internal duplicate detection **may** compare: requester; title; external source;
related visible request; uploaded file hash; existing internal case/task/comm.

Rules:
- If the duplicate target is **hidden/unpublished, the client must not learn it
  exists**.
- Client confirmation stays **generic**.
- Internal users can merge/link freely.
- A client-visible result appears **only if the target request is published and
  granted** to that membership.
- The **duplicate state must not expose hidden request IDs**.

Client-facing safe examples:
- "A beadványát rögzítettük."
- "A kérés feldolgozás alatt van."
- "A témában már van folyamatban lévő egyeztetés; a részleteket a portálon csak jogosultság esetén látja."

**Avoid** (leaks hidden matters):
- "Ez a másik ügyhöz lett kapcsolva: CASE-123"
- "Már létezik egy rejtett ügy"
- "Másik kollégája már beadta"

---

## 7. Submission → internal object mapping

| Submission type | Possible internal object | Default internal state | Publication proposal? | Approval needed? | Client-visible confirmation | Main risk |
| --- | --- | --- | --- | --- | --- | --- |
| new request | `Case` / `Communication` / `Task` / intake item | `pending_triage` | maybe (after accept) | Yes | "Beérkezett / Feldolgozás alatt" | auto-creating a matter; revealing duplicates |
| message | `Communication` | internal, unpublished | maybe (`ClientVisibleMessage`) | Yes (lawyer for firm reply) | "Elküldve / Feldolgozás alatt" | raw thread exposure; auto lawyer-approved |
| document upload | `Document` / document review | `pending_review` | after review only | **Yes (lawyer)** | "Feltöltve / Ellenőrzés alatt" | auto-accept/final; storage leak |
| clarification | `Task`/`Communication` update | internal | maybe (status/timeline) | Yes | "Beérkezett" | auto-closing internal task |
| invitation | `ClientPortalInvitation`/`Membership` (future concept) | `invitation_pending` | n/a | admin action | "Meghívó elküldve / Függőben" | cross-tenant invite; enumeration |
| integration setup | `ExternalConnection` draft (future concept) | `integration_setup_pending` | n/a | admin+verify | "Beállítás folyamatban" | secret leakage; auto-activation |
| connector-linked client action | `ExternalIntakeItem` / `ExternalObjectLink` (future concept) | internal | after triage | Yes | generic | untriaged external data exposure |

---

## 8. Internal object → publication artifact mapping (post-triage)

| Internal object / event | May propose | Still requires |
| --- | --- | --- |
| `Case` / intake accepted | `ClientVisibleRequest` | validator + approval + publication + grant |
| internal status update | `ClientVisibleStatus` | validator + approval + grant |
| internal document request | `ClientVisibleDocumentRequest` | validator + approval + grant |
| uploaded document reviewed | `ClientVisibleDocumentVersion` | **lawyer approval** + validator + grant |
| internal/lawyer message | `ClientVisibleMessage` | **lawyer approval** + validator + grant |
| client todo created | `ClientVisibleTodo` | validator + approval + grant |
| report generated | `ClientVisibleReportSnapshot` | approval + grant |
| connector linkage approved | `ClientVisibleConnectorLink` | outbound/publication approval + grant |

**Rule:** creating an internal object never auto-publishes. Every proposal still
passes the validator (§payload doc), the approval workflow (§approval doc), and the
grant/read-path (§read-path doc).

---

## 9. Client-visible feedback during triage

Client-safe states (never raw internal triage states):

| Flow | Client-safe states |
| --- | --- |
| New request | `Beérkezett`, `Feldolgozás alatt`, `További adat szükséges` |
| Document upload | `Feltöltve`, `Ellenőrzés alatt`, `Kiegészítés szükséges`, `Elfogadva` |
| Message | `Elküldve`, `Feldolgozás alatt`, `Válasz elkészült` |
| Invitation | `Meghívó elküldve`, `Függőben`, `Aktiválva`, `Lejárt / visszavonva` |
| Integration setup | `Beállítás folyamatban`, `Ellenőrzés alatt`, `Aktív`, `Sikertelen / további adat szükséges` |

These map from internal triage states via an allow-list translation — the client
never sees `linked_to_existing`, `duplicate`, `ignored_not_legal`, reviewer names,
or internal object ids.

---

## 10. Triage audit model (conceptual)

Events: `client_submission_received`, `_validated`, `_triage_started`,
`_linked_to_case`, `_converted_to_case`, `_converted_to_task`,
`_converted_to_communication`, `_document_review_started`, `_marked_duplicate`,
`_ignored`, `_rejected`, `_clarification_requested`,
`publication_artifact_proposed_from_submission`, `submission_triage_error`.

**Fields:** `eventId`; `clientId`; `workspaceId`/`teamId`; `membershipId`;
`actorType`; `actorId`; `submissionId`; `submissionType`; `action`;
`targetInternalObjectType`; `targetInternalObjectId`; `proposedArtifactType?`;
`timestamp`; `result`; `reasonCode`; `metadataRedacted`; `correlationId`.

**Forbidden audit metadata:** full message body (if sensitive); file content; raw
storage URL; secrets/tokens; raw connector payload; legal strategy; AI
prompt/completion; other-client data. (Audit records the *fact and shape* of the
triage transition + a reason code — never sensitive content.)

---

## 11. Triage queue UI implications (docs-only)

**Internal Adminiculum future UI:**
- submission queue with **source, client, requester, type, age, risk**;
- a **safe preview** of the client-submitted content;
- **link / create / convert** actions;
- an **internal-only duplicate-candidate view**;
- a **proposed publication preview** (WYSIWYG of the future DTO);
- an **audit-trail** tab; an **escalation indicator**;
- **no automatic publish button** — publication always routes through the approval workflow.

**Client Portal UI:**
- only safe **received/pending** states;
- **no internal triage labels**; no internal duplicate candidates; no internal
  assignee notes; **no hidden matter references**.

---

## 12. Connector relationship

- **Connector-originated item:** `ExternalWorkflowEvent → ExternalIntakeItem →
  internal triage`; **not visible to the portal until triaged and published**.
- **Client-originated portal submission linked to a connector:** may **later**
  create an approved outbound connector comment/status; the portal submission does
  **not auto-sync outward**; outbound connector sync is a **separate approval**.

Examples:
- A Jira task creates an `ExternalIntakeItem` → lawyer triages → `ClientVisibleRequest` published.
- A portal message on a Jira-originated request → internal `Communication` → an **optional approved Jira comment only after outbound approval**.

Aligns with `connector-security-data-boundary-design.md` §11 (outbound approval) and
§14 (portal-visible only after publication).

---

## 13. AI assistance boundary

- AI **may suggest**: category, summary, duplicate candidate, draft status/message.
- AI suggestions are **internal-only**.
- AI **cannot** mark accepted/duplicate/rejected/approved/published.
- AI output must pass the **allow-list transform + validator** before any artifact
  **proposal** (never a direct proposal).
- A **human must review** — AI is a non-decision assistant.

---

## 14. Negative test matrix (future)

1. A client submission does **not** create a published artifact automatically.
2. A client upload does **not** create an accepted document version automatically.
3. A client message does **not** create a lawyer-approved message.
4. A duplicate **hidden** internal case is **not revealed** to the client.
5. A submission with `clientId` in the body **cannot escape** its tenant.
6. Assistant can **propose** but not **approve** a high-risk publication.
7. **AI cannot** triage/publish.
8. **Connector cannot** triage/publish.
9. A rejected/ignored submission does **not leak the internal reason** to the client.
10. Internal merge/link does **not reveal a hidden request ID**.
11. Triage audit **redacts** sensitive fields.
12. A publication proposal from a submission still requires **validator + approval + grant**.
13. Client-visible state is a **translated safe state**, never a raw triage state.
14. `publication_artifact_proposed_from_submission` never sets `published` directly.

---

## 15. Relationship to future schema split

This design may later inform: `ClientPortalSubmission`;
`ClientPortalSubmissionAudit`; submission triage-state enums; internal queue views;
mapping to `Case`/`Task`/`Communication`/`Document`; publication-artifact proposal
records; idempotency and duplicate tracking. But:
- **no schema is created now**;
- **CP-SCHEMA-1 remains blocked** by Prisma baseline/proof work;
- the **CP-WRITE-PATH** and **CP-PUBLICATION-SCHEMA** phases are **downstream**;
  **CONNECTOR-SCHEMA-1** likewise remains blocked.

---

## 16. Open questions

1. Is the triage queue a **single global internal queue**, per-lawyer, or per-client?
2. Can an **assistant auto-route** low-risk submissions (e.g. document upload →
   attach to the obvious document request), or does every submission wait for a human?
3. Duplicate detection: heuristic only, or human-confirmed always? Which signals
   (file hash, title similarity) are safe to use without false cross-tenant matches?
4. Do we expose a **client-facing submission reference id** for support without
   leaking internal state?
5. SLA/aging: do stale submissions escalate automatically, and to whom?
6. Does a rejected/not-legal submission still send the client a **generic
   acknowledgement**, or nothing?
7. How are **connector-linked** portal submissions correlated to the originating
   external object without exposing it pre-publication?
8. Where does the **clarification loop** live (a todo round-trip vs a message thread)?

---

## 17. Recommended next prompt

> **Adminiculum — Client Portal notification & confirmation boundary design (docs-only).**
> Define how the portal notifies clients (in-app + optional email) about submission
> receipt, status changes, published artifacts, clarifications, and invitations —
> what a notification may contain (client-safe status only, no artifact content, no
> internal detail), delivery/opt-in rules, redaction, per-membership scoping,
> non-enumeration, and a negative test matrix. Keep it docs-only: no schema edits,
> no migrations, no routes, no runtime/auth change. Do not unblock CP-SCHEMA-1 /
> CONNECTOR-SCHEMA-1; note their baseline/proof prerequisites.

---

*Docs-only. No runtime, schema, migration, DB, auth, or client-portal-enablement
change. CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain blocked.*
