# Client Portal Publication Artifact Model — Split Plan

> Status: **docs-only conceptual split plan**. No implementation, no schema, no
> migration, no routes, no auth change, no runtime change. Client Portal remains
> future-only / gated (`ENABLE_CLIENT_PORTAL` off). This plan **does not** unblock
> CP-SCHEMA-1 or CONNECTOR-SCHEMA-1 — both remain blocked by Prisma baseline/proof
> work and their prerequisites are unchanged.
>
> This document defines the **publication artifact layer** that sits between
> internal Adminiculum models and the client-safe DTOs specified in
> `docs/client-portal-dto-publication-boundary.md`. It stays conceptual — it does
> **not** propose final Prisma models.
>
> Aligns with:
> - `docs/client-portal-dto-publication-boundary.md`
> - `docs/client-portal-tenant-isolated-api-contract.md`
> - `docs/client-portal-tenant-isolation-login-ui-alignment.md`
> - `docs/client-portal-v1-security-contract-audit.md`
> - `docs/client-portal-v1-identity-authorization-plan.md`
> - `docs/client-portal-v1-schema-migration-split-plan.md`
> - `docs/client-portal-v1-schema-migration-draft-review.md`
> - `docs/connector-security-data-boundary-design.md`
> - `docs/universal-connector-compatibility-architecture.md`

---

## 1. Executive summary

Client portal visibility must **not** be implemented by exposing internal `Case`,
`Task`, `Document`, `Communication`, `TimeEntry`, AI, review, or connector models —
not even filtered by `clientId`. Instead, internal objects **produce explicitly
approved, client-safe publication artifacts**, and the portal reads only those.

The layering:

```
Internal source objects  ──(propose)──►  Publication artifact  ──(approve+publish+grant)──►  Client-safe DTO
(Case, Task, Document,                   (ClientVisible*),                                    (ClientPortal*Dto)
 Communication, TimeEntry,               state + approver + scope                            allow-list mapper
 AI draft, Review, Connector)            (never the internal source)
```

Two orthogonal checks govern every byte: **Publication** (the *content* is safe to
expose) and **Grant** (this *user/team/role/workspace* may access it). Both must
pass. `approved ≠ visible`; `published` still requires an in-scope grant.

Key invariants:
1. Internal object existence does **not** imply client visibility.
2. `clientId` match alone is **not** enough.
3. Publication is a **separate artifact/state**, not a flag sprinkled across internal models.
4. Client portal DTOs are built **only** from publication artifacts + grants.
5. Revocation/supersession is possible **without mutating internal legal history**.
6. **Approver identity + publication audit** are preserved.
7. Connector-originated items become visible **only after triage and publication**.
8. AI/internal drafts **never** become visible directly — only approved human-facing artifacts may be published.

UI source (`C:\Users\hubay\Documents\Ügyfélportál`, PDFs
"Adminiculum Ügyfélportál v1.1/v1.2" + design zips) implies the artifact families
below (request list/detail, status, timeline, todos, document requests/versions,
messages, deadlines, monthly report, integrations). **No UI assets are copied**;
only their publication/field implications are summarized.

---

## 2. Publication artifact concept

A **publication artifact** is a *curated, client-safe representation* of one or
more internal source objects. It is **not** the internal source object, and it
does not hold a live reference that leaks internal fields — approval **copies**
allow-listed, transformed fields into the artifact.

| Internal source object (default `internal_only`) | Publication artifact (client-safe) |
| --- | --- |
| `Case` | `ClientVisibleRequest` |
| internal `CaseStatus` / workflow | `ClientVisibleStatus` |
| timeline / workflow events | `ClientVisibleTimelineItem` |
| `Task` (client-facing action only) | `ClientVisibleTodo` |
| document need | `ClientVisibleDocumentRequest` |
| `Document` / `DocumentVersion` | `ClientVisibleDocumentVersion` |
| `Communication` | `ClientVisibleMessage` |
| deadline state | `ClientVisibleDeadline` |
| `TimeEntry` / `Matter` aggregates | `ClientVisibleReportSnapshot` |
| `ExternalObjectLink` / connector | `ClientVisibleConnectorLink` |
| connector audit event | `ClientVisibleIntegrationAuditItem` |
| `DocumentReviewSession`, AI draft/summary, internal note, internal deadline/workload | *(no direct artifact — may only inspire an approved artifact of another family)* |

An artifact may aggregate several sources (e.g. a `ClientVisibleRequest` derived
from a `Case` plus an `ExternalIntakeItem`), but always presents a single
client-safe surface.

---

## 3. Publication state machine

```
                 propose            approve            publish
  internal_only ─────► draft ─────► pending_approval ─────► approved ─────► published
        ▲                 │                │                    │                │
        │                 │ reject         │ reject             │ revoke         │ revoke / expire / supersede
        │                 ▼                ▼                    ▼                ▼
        └──────────────  rejected        rejected            revoked       revoked / expired / superseded
```

| State | Meaning | Who creates | Who approves | Portal sees? | In audit? | Transitions |
| --- | --- | --- | --- | --- | --- | --- |
| `internal_only` | never intended for client | system/internal | n/a | No | yes | → `draft` |
| `draft` | proposed artifact being prepared | responsible lawyer / assistant (propose) / system | n/a | No | yes | → `pending_approval`, → `rejected` |
| `pending_approval` | awaiting internal approval | assistant/system/lawyer | responsible/supervising lawyer or internal admin | No | yes | → `approved`, → `rejected` |
| `approved` | content approved (not yet released) | — | (record of approver) | **No** | yes | → `published`, → `revoked` |
| `published` | currently visible to *authorized* client users | publisher (internal) | — | **Yes (if granted)** | yes | → `revoked`, → `expired`, → `superseded` |
| `revoked` | withdrawn after publication | internal | — | No | yes | terminal (audit only) |
| `expired` | `validUntil` elapsed | system | — | No | yes | terminal (audit only) |
| `superseded` | replaced by newer artifact | system/internal | — | No (unless history allowed) | yes | terminal (audit only) |
| `rejected` | rejected during review | approver | — | No | yes | terminal (internal only) |

**Critical distinction:**
- `approved` = a lawyer/admin approved the artifact **content**.
- `published` = the artifact is **currently releasable** to authorized portal users.
- Therefore **`approved` does not mean visible**; `published` additionally
  requires **access scope + membership + role** (the grant, §4). A published
  artifact with no matching grant is invisible.

---

## 4. Publication vs grant

Two independent concerns:

- **Publication** — *is the content safe to expose?* (state ∈ {`published`}).
- **Grant** — *may this user/team/role/workspace access it?* (scope match).

Both are required. Examples:
- A `ClientVisibleDocumentVersion` may be published but **granted** only to the
  client manager, not every requester.
- A team-level `ClientVisibleReportSnapshot` is granted to the team lead.
- A `ClientVisibleTimelineItem` is granted only to users linked to that request.
- A `ClientVisibleConnectorLink` external URL is granted only to client admin / team lead.

Conceptual future entities (**docs-only; not a Prisma proposal**):
- `ClientPortalPublication` — publication metadata (source ref, artifact type, state, approver, publisher, timestamps, `validUntil?`).
- `ClientPortalGrant` — scope grant (client / workspace / team / membership / request) governing who may access.
- `ClientVisibleArtifact` — the typed/curated client-safe payload.
- `ClientVisibleArtifactGrant` — join of artifact ↔ grant/scope.

These build on the identity models already proposed in
`client-portal-v1-identity-authorization-plan.md` (`ClientPortalUser`,
`ClientPortalMembership`, `ClientPortalTeam`, `ClientPortalRole`,
`ClientPortalCaseAccess`, `ClientPortalDocumentGrant`,
`ClientPortalMessageVisibility`, `ClientPortalAuditEvent`).

---

## 5. Artifact families

For each: source object(s), allowed fields, forbidden fields, required approval,
grant/scope, role visibility, revocation/supersession behavior, MVP/later.

### A) `ClientVisibleRequest`
- **Source:** `Case`, `Communication`, `ExternalIntakeItem`, or manual portal request.
- **Allowed:** title; client-friendly category; client-friendly status; requester display name; team; deadline; next step; todo count; source badge; external ID chip (if allowed).
- **Forbidden:** internal case strategy; internal priority reasoning; internal assignee notes; legal risk score; internal status code (if too detailed).
- **Approval:** responsible lawyer (status/summary content).
- **Grant:** client / team / requester-own scope.
- **Roles:** requester=own, team_lead=team, manager/admin=client.
- **Revocation:** revoke hides the request; supersede on re-scoping; internal `Case` untouched.
- **Tier:** MVP.

### B) `ClientVisibleStatus`
- **Source:** internal `CaseStatus` / workflow.
- **Purpose:** client-friendly status translation.
- **Allowed values:** `Beérkezett`, `Feldolgozás alatt`, `Dokumentumra várunk`, `Ügyvédi ellenőrzés alatt`, `Válasz elkészült`, `Lezárva`.
- **Rules:** internal status → *proposed* client status; proposed status may require approval; **connector status never auto-publishes**.
- **Forbidden:** internal status codes, hold/cancellation reasons, strategy.
- **Approval:** lawyer/admin (status publication).
- **Grant:** same scope as parent request.
- **Revocation:** superseded by newer status; old hidden.
- **Tier:** MVP.

### C) `ClientVisibleTimelineItem`
- **Source:** internal timeline/workflow events (mapped).
- **Allowed kinds:** request received; document requested; document uploaded; review started; clarification requested; answer ready; matter closed.
- **Forbidden:** internal review handoff; AI drafting; internal task reassignment; risk escalation; legal strategy; time entry.
- **Approval:** lawyer/admin (implicit via the action's publication).
- **Grant:** users linked to the request.
- **Revocation:** revoke removes item; supersede rare.
- **Tier:** MVP.

### D) `ClientVisibleTodo`
- **Source:** `Task` (client-facing only) or document request.
- **Allowed:** upload document; answer clarification; review approved version; confirm instruction; sign document.
- **Forbidden:** internal tasks assigned to lawyers; internal admin checklist; review subtasks; AI task.
- **Approval:** lawyer/assistant proposes; lawyer approves if sensitive.
- **Grant:** the client user(s) responsible.
- **Revocation:** completed/withdrawn → hidden; audit preserves.
- **Tier:** MVP.

### E) `ClientVisibleDocumentRequest`
- **Source:** internal document need.
- **Allowed:** requested document name; client-friendly reason/instruction; due date; accepted file types; status.
- **Forbidden:** internal reason (if strategic); internal reviewer note; internal storage metadata.
- **Approval:** lawyer/assistant.
- **Grant:** request scope.
- **Revocation:** revoke if no longer needed.
- **Tier:** MVP.

### F) `ClientVisibleDocumentVersion`
- **Source:** `Document` / `DocumentVersion`.
- **Allowed:** approved file display name; version label; document status; uploaded/finalized timestamp; safe download action (short-lived token).
- **Forbidden:** raw signed URL persisted in DTO; internal path; SharePoint metadata (`spItemId`/`spWebUrl`/`workspaceText`); review annotations; unapproved redline; AI draft.
- **Approval:** **lawyer approval required** (legal output).
- **Grant:** may differ from request (e.g. manager-only).
- **Revocation:** supersede on new approved version → old hidden unless history allowed; revoke removes access.
- **Tier:** MVP.

### G) `ClientVisibleMessage`
- **Source:** `Communication` (incl. Outlook-imported `source=OUTLOOK`), portal message.
- **Allowed:** approved lawyer message; client-originated portal message; approved email-derived message; source badge; safe attachments.
- **Forbidden:** raw email thread/body; internal communication classification; AI draft; internal reply draft; unapproved connector comment.
- **Approval:** lawyer approval for firm/email-derived messages; client-originated messages follow policy (see open questions).
- **Grant:** thread/request scope.
- **Revocation:** revoke hides a message; supersede rare.
- **Tier:** MVP.

### H) `ClientVisibleDeadline`
- **Source:** internal deadline state / visible requests.
- **Allowed:** date; client-friendly label; related request; action required; status.
- **Forbidden:** internal deadline calculation; strategic urgency note; internal litigation planning.
- **Approval:** lawyer/admin (deadline publication).
- **Grant:** request scope.
- **Revocation:** revoke/expire (`validUntil`).
- **Tier:** MVP.

### I) `ClientVisibleReportSnapshot`
- **Source:** `TimeEntry` / `Matter` / `Case` aggregates.
- **Allowed:** aggregate counts; category breakdown; team breakdown (if role allows); average turnaround (if approved); approved narrative summary.
- **Forbidden:** time-entry internals; per-minute timesheet; internal workload/capacity; lawyer productivity; other-client benchmark.
- **Approval:** manager-facing report approval (lawyer/admin).
- **Grant:** manager/admin; team_lead subset if enabled.
- **Revocation:** superseded by next period; `expired` for time-boxed snapshots.
- **Tier:** MVP (summary) / Later (team/trend).

### J) `ClientVisibleConnectorLink` / `ClientVisibleIntegrationAuditItem`
- **Source:** `ExternalObjectLink`, connector sync/audit.
- **Allowed:** source system; external ID; external URL (if policy allows); approved sync status; redacted audit action.
- **Forbidden:** raw webhook payload; connector credentials; adapter logs; sync error payload; other-client integration settings.
- **Approval:** admin + outbound approval (`pending_approval → approved → published`, per connector boundary design §11/§14).
- **Grant:** current workspace; external URL to admin/team_lead only.
- **Revocation:** revoke on disconnect; supersede on status change.
- **Tier:** Later.

---

## 6. Source-to-artifact mapping

| Internal source | Possible artifact | Default visibility | Approval needed? | Grant needed? | Client DTO derived | Main risk |
| --- | --- | --- | --- | --- | --- | --- |
| `Case` | `ClientVisibleRequest` (+ `ClientVisibleStatus`) | `internal_only` | Yes | Yes | `ClientPortalRequest*Dto` | leaking strategy/risk/internal ids |
| `Task` | `ClientVisibleTodo` (client-facing only) | `internal_only` | Yes (if sensitive) | Yes | `ClientPortalClientTodoDto` | exposing internal lawyer tasks |
| `Document` / `DocumentVersion` | `ClientVisibleDocumentVersion` / `ClientVisibleDocumentRequest` | `internal_only` | **Yes (lawyer)** | Yes | `ClientPortalVisibleDocumentVersionDto` | raw URL / sp metadata / redlines |
| `Communication` | `ClientVisibleMessage` | `internal_only` | Yes | Yes | `ClientPortalMessageDto` | raw email body / AI draft / classification |
| `DocumentReviewSession` | *(none direct)* | `internal_only` | n/a | n/a | *(only an approved "answer ready" item)* | review comments / reviewer chain |
| `TimeEntry` | `ClientVisibleReportSnapshot` (aggregate) | `internal_only` | Yes | Yes | `ClientPortalReport*Dto` | per-minute/cost/capacity leakage |
| AI draft / AI summary | *(none direct — may inspire an approved artifact)* | `internal_only` | Yes (human artifact) | Yes | *(via approved message/doc/status)* | AI text reaching client unreviewed |
| `ExternalWorkflowEvent` | *(none direct)* | `internal_only` — **never directly visible** | Yes | Yes | *(via approved status/timeline)* | auto-surfacing external state |
| `ExternalIntakeItem` | `ClientVisibleRequest`/`Message` after triage | `internal_only` — **not visible until triaged + published** | Yes | Yes | `ClientPortalRequest*/MessageDto` | untriaged/unapproved payload leak |
| `ExternalObjectLink` | `ClientVisibleConnectorLink` | `internal_only` | Yes | Yes | `ClientPortalExternalObjectLinkDto` | external URL/id to wrong role |
| `Client` | (own workspace display only) | own-workspace | n/a | membership | `ClientPortalMeDto.currentWorkspace` | other-client inference |
| `User` (internal) | display name on approved artifacts only | `internal_only` | via approval | n/a | `authorDisplayName` | internal identity/assignments leak |

**Important defaults:** every internal source defaults to `internal_only`;
`ExternalWorkflowEvent` never directly visible; `ExternalIntakeItem` not visible
until triaged+published; `TimeEntry` only via aggregate report artifact; AI draft
never directly visible (may only inspire an approved human artifact).

---

## 7. Approval roles

**Internal (firm-side) roles:**
- **Responsible lawyer** — approves legal content (status, messages, document versions, deadlines, report narrative).
- **Supervising lawyer** — approves **sensitive** outputs (legal answers, high-risk documents).
- **Internal admin** — may approve operational publications (integration status/audit) and manage publication config; not a substitute for legal approval on legal content.
- **Assistant** — may **propose** (`draft → pending_approval`) only; cannot self-approve legal content.

**Client (portal-side) roles:**
- **Client admin** — manages membership/integrations on the client side; **does not approve** law-firm legal content for publication.
- **Client manager** — may *see* approved report artifacts depending on grant.
- **Requester / team lead** — scope depends on membership; do not approve firm content.

**Approval categories:** status publication; message publication; document version
publication; deadline publication; report snapshot publication; connector outbound
status/comment publication.

**Rules:**
- **AI-generated content cannot self-approve** — a human artifact must be created and approved.
- **Connector inbound cannot self-publish** — triage + explicit publication required.
- Assistant-proposed artifacts require lawyer approval where content is client-facing legal work.
- Sensitive document / legal answer requires **lawyer** (and, if policy dictates, supervising-lawyer) approval.

---

## 8. Audit hooks

Every publication lifecycle transition emits a `ClientPortalAuditEvent`.

| Audit event | Trigger |
| --- | --- |
| artifact drafted | `internal_only → draft` |
| artifact proposed | `draft → pending_approval` |
| artifact approved | `pending_approval → approved` |
| artifact rejected | `* → rejected` |
| artifact published | `approved → published` |
| artifact viewed/downloaded | portal read (where applicable) |
| artifact revoked | `published → revoked` |
| artifact superseded | `published → superseded` |
| artifact expired | `published → expired` |
| grant created / changed / revoked | grant lifecycle |
| publication failed | error during publish |
| connector outbound publication sent | outbound approved+sent |
| document version downloaded | token redemption |
| report snapshot generated | snapshot compute |

**Per audit event fields:** actor type (internal/client/system/connector);
actor ID; client ID; source object ID + type; artifact type; artifact ID;
previous state; new state; timestamp; **metadata redaction rule** (no raw
payloads, no credentials, no internal notes stored in the audit metadata — only
redacted, allow-listed context).

---

## 9. Revocation and supersession

- **Revoked** — no longer visible; preserved in audit; a linked reference may show
  a generic "no longer available" without leaking why.
- **Superseded** — replaced by a newer artifact; older hidden unless version
  history is explicitly allowed; audit preserves the old state.
- **Expired** — automatically invisible after `validUntil`; used for temporary
  download links and time-limited report snapshots.
- **Rejected** — never visible; preserved internally only.

**Non-mutation guarantee:** none of these states mutate the internal source
(`Case`/`Document`/`Communication`/legal history). Revocation/supersession changes
only the **artifact** state — internal legal records are immutable from the portal
layer's perspective.

---

## 10. Relationship to the `/me` API contract

Endpoints consume artifacts (never internal models), always filtering by
publication state **and** grant scope before mapping to a DTO:

| Endpoint | Reads artifacts | Notes |
| --- | --- | --- |
| `GET /me/summary` | published+granted artifacts, aggregated | counters over granted `ClientVisible*` |
| `GET /me/requests` | `ClientVisibleRequest[]` | scoped to membership |
| `GET /me/requests/:id` | one `ClientVisibleRequest` + children | only if published+granted |
| `GET /me/documents` | `ClientVisibleDocumentRequest` / `ClientVisibleDocumentVersion` | grant may be manager-only |
| `GET /me/messages` | `ClientVisibleMessage[]` | thread/request scope |
| `GET /me/report` | `ClientVisibleReportSnapshot` | manager/admin (team_lead subset if enabled) |
| `GET /me/integrations` | `ClientVisibleConnectorLink` / `ClientVisibleIntegrationAuditItem` | current workspace only |

**Rule:** APIs query publication/grant scope **before** mapping to DTO. If an
artifact is not found or not granted → **non-enumerating `404`** (never `403`,
never a body that confirms existence).

---

## 11. Relationship to future schema split

Conceptual future phases (**do not implement; no schema here**):

- **CP-PUBLICATION-SCHEMA-1** — generic publication/grant foundation: artifact
  type, source object reference, state, approver/publisher, client/workspace/team
  scope, timestamps, `validUntil?`.
- **CP-PUBLICATION-SCHEMA-2** — document/message/status/timeline/report specific
  artifact tables **or** a typed-payload strategy.
- **CP-PUBLICATION-SCHEMA-3** — audit / read / download tracking.

**Prerequisite:** these depend on CP-SCHEMA-1 (identity/membership foundation),
which is **blocked** on Prisma baseline/proof work — so none of these phases start
until that is unblocked. This plan does not change that.

### Design options

| Option | Approach | Pros | Cons |
| --- | --- | --- | --- |
| **A** | Generic artifact table + typed JSON payload | flexible; fewer tables; faster MVP | weaker type safety; harder validation; deny-list must be enforced in code |
| **B** | Separate typed artifact tables per family | strong constraints; clear DTO mapping; DB-level field boundaries | more migrations; more code; slower to evolve |
| **C** | Hybrid — generic publication/grant metadata + typed artifact tables (or validated payloads) | strong scope/state model shared once; type safety where it matters | moderate complexity |

**Recommendation:**
- **MVP → Option C (hybrid).** A single generic `ClientPortalPublication` +
  `ClientPortalGrant` carries state, scope, approver, and audit uniformly (write
  the state machine + grant logic **once**), while the **highest-risk families**
  (`ClientVisibleDocumentVersion`, `ClientVisibleMessage`, `ClientVisibleReportSnapshot`)
  use **typed artifact payloads with server-side validators** so forbidden fields
  cannot be smuggled through free-form JSON. Lower-risk families
  (status/timeline/todo/deadline) may start as validated typed payloads on the
  generic table.
- **Later → migrate hot/typed families toward Option B tables** if constraints or
  query patterns demand it.
- **Avoid pure Option A** for document/message/report: free-form JSON + client
  exposure is exactly where an accidental internal-field leak would occur.

---

## 12. Security test plan (future)

1. Source object visible internally but **no artifact** → portal `404`.
2. **Approved but not published** artifact → portal `404`.
3. **Published but not granted** artifact → portal `404`.
4. **Revoked** artifact disappears from all portal responses (audit retained).
5. **Superseded** artifact hidden unless version history explicitly allowed.
6. **Requester** cannot see team-level report snapshot.
7. **Team lead** cannot see another team's artifact.
8. **Client admin** cannot see other clients (no enumeration/inference).
9. AI draft **never** produces a portal DTO directly.
10. Connector event **never** visible without triage + publication.
11. Document internal annotations excluded from any DTO.
12. Time entries excluded from report DTO (no `minutes`/per-entry rows).
13. **Serializer cannot spread an internal model** (`{...prismaModel}` forbidden; allow-list mapper enforced).
14. **Publication mapper deny-list test** — each artifact family's mapper rejects/omits every forbidden field from §5 and the DTO boundary catalogue.
15. `approved ≠ published` and `published ≠ granted` both enforced independently.
16. Expired artifact (`validUntil` passed) → `404`; download token single-use + scope-bound.

---

## 13. Open questions

1. Generic artifact table vs typed artifact tables (Option A/B/C) — confirm the hybrid boundary per family.
2. Is publication approval **always** required, or may some status changes **auto-publish** under an explicit, audited policy?
3. Are **client-originated** messages immediately visible back to the client (self-echo), or do they also pass a lightweight publication?
4. Are report snapshots generated **monthly** (scheduled) or **on demand**?
5. Is **document version history** visible to clients, or latest-published only?
6. Should connector **external URLs** be visible to requesters, or only client admin / team lead?
7. Should publication artifacts support **expiry by default** (`validUntil`), or opt-in per family?
8. How to handle a user with **multiple client workspaces** — per-workspace publication/grant resolution and switching (ties to `/me/workspaces`).
9. Where does the **internal approval/publish UI** live (Case detail, a dedicated publication review queue, connector triage screen)?
10. Retention/erasure interplay: how do revoked/expired artifacts interact with GDPR data-subject requests?

---

## 14. Recommended next prompt

> **Adminiculum — Client Portal publication approval & audit workflow design (docs-only).**
> Define the internal-side approval workflow that drives the publication state
> machine in this plan: proposer/approver/publisher responsibilities per artifact
> family, the review-queue concept, `ClientPortalAuditEvent` field schema
> (conceptual), redaction rules for audit metadata, and the mapping from internal
> actions (case status change, document approval, message send, report generation,
> connector triage) to `draft → pending_approval → approved → published`
> transitions. Keep it docs-only: no schema edits, no migrations, no routes, no
> runtime/auth change. Do not unblock CP-SCHEMA-1 / CONNECTOR-SCHEMA-1; note their
> baseline/proof prerequisites.

---

*Docs-only. No runtime, schema, migration, DB, auth, or client-portal-enablement
change. CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain blocked.*
