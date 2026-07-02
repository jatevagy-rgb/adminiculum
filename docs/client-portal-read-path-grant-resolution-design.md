# Client Portal Read-Path and Grant-Resolution Query Design

> Status: **docs-only design**. No implementation, no schema, no migration, no
> routes, no auth change, no runtime change. Client Portal remains future-only /
> gated (`ENABLE_CLIENT_PORTAL` off). This document **does not** unblock
> CP-SCHEMA-1 or CONNECTOR-SCHEMA-1 — both remain blocked by Prisma baseline/proof
> work; their prerequisites are unchanged.
>
> Defines how future `/api/v1/client-portal/me/*` endpoints resolve the
> authenticated portal user, active membership, workspace/team scope, publication
> state, and grant scope **before** mapping any client-safe DTO. Extends:
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

Client portal reads must **query and scope before mapping**. The server never
fetches internal models broadly and filters in memory, and never maps an internal
model to a DTO before publication + grant checks.

**Canonical order (every read):**
1. feature-gate check;
2. authenticate portal user (`ClientPortalUser`, from session — not a route param);
3. resolve **active** `ClientPortalMembership` + current workspace/client/team;
4. evaluate role/team scope;
5. query **only published artifacts** in that scope;
6. apply **grant** constraints;
7. validate artifact payload type;
8. map to client-safe DTO and return a **non-enumerating** result.

Core invariants:
- **Publication without grant is invisible; grant without publication is invisible.**
- Grants never override tenant isolation.
- Internal `Case`, `Task`, `Document`, `Communication`, `TimeEntry`,
  `ExternalWorkflowEvent`, `ExternalIntakeItem`, AI/review/internal-note models are
  **never** direct portal response sources.
- Out-of-scope / ungranted / unpublished / revoked all return the **same** 404-style
  response — no enumeration, no existence disclosure.

UI source (`C:\Users\hubay\Documents\Ügyfélportál`, "Adminiculum Ügyfélportál
v1.1/v1.2" PDFs + design zips) implies the `/me/*` read surfaces (summary,
requests, request detail + messages, documents, deadlines, report, team,
integrations). **No UI assets copied** — only read-path/scope implications noted.

---

## 2. Canonical read-path principle

```
request → [feature gate] → [portal auth middleware]
        → resolve ClientPortalUser (session identity)
        → resolve active ClientPortalMembership + current workspace/client/team
        → evaluate role permissions
        → QUERY publication artifacts ONLY
             WHERE state = 'published'
               AND clientId ∈ membership scope
               AND (team/role/membership grant matches)
               AND artifactType = <expected>
        → validate payload type
        → map validated payload → ClientPortal*Dto
        → return (non-enumerating)
```

The publication/grant filter is part of the **query**, not an in-memory
post-filter. Internal models are queried only *inside* the internal publication
pipeline (approval workflow), never as a portal response source.

---

## 3. Membership resolution

Rules:
- User identity comes from the **client portal session**, never a route parameter.
- Membership must be **active** (not suspended/revoked/expired).
- Membership must belong to the **current workspace/client**.
- Suspended/revoked/expired memberships cannot read data.
- One membership → workspace may be auto-selected; multiple → **only the user's own**
  memberships are listed (no global client list, no domain-based access).
- **Email alone does not grant membership** — an explicit `ClientPortalMembership` is required.

Failure behavior:
| Condition | Response |
| --- | --- |
| no auth / invalid session | **401** |
| no active membership | generic "access not configured" (no client details) |
| selected workspace/membership not owned by user | **non-enumerating 404** / generic "invalid workspace" |
| portal feature disabled | gate response per existing convention (**501 `FEATURE_NOT_AVAILABLE`** / 404) |

---

## 4. Grant-resolution model

A publication may be granted at: whole client; workspace/team; role; specific
membership/user; request participant; document requester/uploader; client
manager/admin; integration-admin scope.

**Grant dimensions (conceptual):** `clientId`; `workspaceId`/`teamId`; `role`;
`membershipId`; `artifactId`; `artifactType`; `action` (`read`/`download`/`upload`/
`reply`/`manage`/`view_report`/`view_integration`); `validFrom`/`validUntil`;
`revokedAt`.

Rules:
- **Publication without grant is invisible.**
- **Grant without publication is invisible.**
- **Revoked/expired grant is invisible.**
- **Role-based grant must still be tenant-scoped** — a `role=client_manager` grant
  applies only within the manager's own client.
- **Grants never override tenant isolation** — no grant can widen visibility beyond
  the user's own client/workspace.

Effective visibility = `state=published` **AND** a matching, non-revoked,
in-window grant **AND** tenant scope match **AND** role/action permission.

---

## 5. Endpoint-by-endpoint read path

| Endpoint | Required membership | Required role | Artifact family | Grant action | DTO target | Non-enumeration | Forbidden data |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A** `GET /me` | active | any | — (identity) | — | `ClientPortalMeDto` | 401 if no auth | internal userId, other clients |
| **B** `GET /me/workspaces` | active | any | — | — | `ClientPortalWorkspaceDto[]` | own memberships only | global client list, other users |
| **C** `GET /me/summary` | active | any (scoped) | all granted `ClientVisible*` | `read` | `ClientPortalSummaryDto` | counts only visible | internal models, hidden counts, strategy |
| **D** `GET /me/requests` | active | requester=own / lead=team / mgr-admin=client | `ClientVisibleRequest` | `read` | `ClientPortalRequestListItemDto[]` | list only granted | internal case ids/notes/risk |
| **E** `GET /me/requests/:requestId` | active | scoped | `ClientVisibleRequest` (+children) | `read` | `ClientPortalRequestDetailDto` | same 404 if missing/ungranted/unpublished | strategy, AI drafts, review comments |
| **F** `GET /me/requests/:requestId/messages` | active | scoped to request | `ClientVisibleMessage` | `read` | `ClientPortalMessageDto[]` | only if request visible | raw email thread, internal messages |
| **G** `GET /me/documents` | active | scope follows grant | `ClientVisibleDocumentRequest` / `ClientVisibleDocumentVersion` | `read` | `ClientPortal*DocumentDto[]` | granted only | raw URL, sp metadata, annotations |
| **H** `GET /me/documents/:documentId` | active | scoped | `ClientVisibleDocumentVersion` | `read` (+`download`) | `ClientPortalVisibleDocumentVersionDto` | same 404 | storage key, review internals, internal versions |
| **I** `POST /me/documents/upload-request` | active | upload grant | (creates client upload) | `upload` | ack (pending review) | target must be visible/granted | — (no publish on upload) |
| **J** `GET /me/deadlines` | active | scoped | `ClientVisibleDeadline` | `read` | `ClientPortalDeadlineDto[]` | derived from visible requests | internal deadline reasoning |
| **K** `GET /me/report` | active | manager/admin (lead subset if enabled) | `ClientVisibleReportSnapshot` | `view_report` | `ClientPortalReport*Dto` | role-gated; else 404 | per-minute/timesheet/capacity |
| **L** `GET /me/team` | active | admin (lead read if approved) | membership (own client) | `manage`/`read` | `ClientPortalTeamMemberDto[]` | own client only | Adminiculum users, other clients, global search |
| **M** `GET /me/integrations` | active | admin (read roles if configured) | `ClientVisibleConnectorLink` / audit | `view_integration` | `ClientPortalIntegrationDto[]` | current workspace only | credentials, payloads, debug, other clients |

All detail endpoints: **missing / other-client / ungranted / unpublished → identical
404** (§7).

---

## 6. Query-before-map ordering

**Anti-pattern (forbidden):**
```
fetch Case by id
  → check clientId in application code
  → spread Case into DTO
  → hide fields in frontend
```

**Correct pattern:**
```
query ClientVisibleRequest
  WHERE state = 'published'
    AND clientId ∈ membershipScope
    AND EXISTS(grant for membership/role/team, action='read', not revoked, in window)
    AND portalRequestId = :requestId
  → validate payload type
  → map to ClientPortalRequestDetailDto
```

Illustrative pseudo-queries (not code, conceptual):

- **Request detail:**
  `find one ClientVisibleRequest where portalRequestId=:id and state=published and clientId in scope and grant(read)` → 404 if none.
- **Document download action:**
  `find one ClientVisibleDocumentVersion where visibleDocumentVersionId=:id and state=published and clientId in scope and grant(download)` → then resolve a short-lived `downloadActionRef` server-side (never a stored URL); audit the download.
- **Messages list:**
  `find ClientVisibleMessage where threadId in (visibleThreadsForRequest(:requestId, scope)) and state=published and grant(read)` → map.
- **Monthly report:**
  `find ClientVisibleReportSnapshot where clientId in scope and state=published and grant(view_report) and period=:period` → role gate manager/admin.
- **Integration list:**
  `find ClientVisibleConnectorLink where workspaceId=currentWorkspace and state=published and grant(view_integration)` → badges/summaries only.

The scope + state + grant predicates are **in the query**; nothing internal is
fetched to be filtered later.

---

## 7. Non-enumerating resource behavior

For **detail** endpoints, all of these return the **same** client-safe 404-style
response:
- not found;
- belongs to another client;
- not granted;
- unpublished;
- revoked;
- superseded without version-history permission.

**Never** return:
- "belongs to another client";
- "you do not have grant";
- "exists but not published";
- hidden counts;
- debug details.

The response body and status must be **indistinguishable** across these causes so a
client cannot infer existence or ownership. (Internal audit may record the *real*
reason; the client never sees it.)

---

## 8. Opaque IDs and route-parameter safety

- Portal routes use **opaque portal artifact IDs** (`req_*`, `ver_*`, `msg_*`), not
  raw internal IDs where possible.
- **Even opaque IDs are scoped** by membership/grant — an opaque id is not a
  capability; it still passes the full predicate.
- Raw internal IDs must not become an **enumeration vector** — sequential/guessable
  internal ids are never exposed as route params.
- **External IDs are display-only chips**, never dereferenced by a portal route
  (an `externalObjectId` cannot be used to fetch external data through the portal).
- `requestId`/`documentId`/`messageId` in a portal route **must resolve to a
  published + granted artifact** or return the uniform 404.
- **`clientId` is never a route parameter** in the client portal public API — client
  scope comes only from the session/membership.

---

## 9. Conceptual index/scoping considerations (docs-only)

Future query performance will likely need indexes around: publication `state`;
`artifactType`; `clientId`; `workspaceId`/`teamId`; `publishedAt`; grant
`artifactId`; grant `membershipId`/`role`/`teamId`; `validFrom`/`validUntil`;
`revokedAt`; and the internal `sourceObject` reference (for internal navigation
only, never portal exposure).

**Warning:** indexes must support the **secure query shape** (state+scope+grant in
one predicate), but **index existence does not confer security** — the predicate
and grant check are the security boundary, not the presence of an index. No schema
or indexes are created here.

---

## 10. Read-path audit

Reads/actions that should emit audit events (redacted metadata per the
approval/audit doc):
- **document download** (`publication_artifact_downloaded`) — always;
- **message thread viewed** — optional/coarse (aggregate, not per-message);
- **report viewed/downloaded** — yes;
- **integration settings viewed** by client admin — yes;
- **failed/suspicious access attempts** — rate-limited, redacted;
- **grant-denied** — optional, **internal-only** (never surfaced to the client).

Rules: do not over-log sensitive payload; audit metadata is **redacted** (ids +
action + actor type + timestamp + reason code — never payload values or the real
"why" of a 404).

---

## 11. Role-specific read behavior

| Role | Allowed endpoint groups | Grant action examples | Forbidden access |
| --- | --- | --- | --- |
| **Requester** | own requests, own todos/document requests, messages on own/participant items | `read` (own artifacts), `upload`, `reply` | other requesters' scope, team report, integrations, team management |
| **Team lead** | team-granted requests/documents/messages, team report subset (if enabled) | `read`(team), `view_report`(team subset) | other teams, client-wide billing, other clients |
| **Client manager** | client-wide published/granted overview, report snapshots | `read`(client), `view_report` | internal billing/time entries, other clients, approve firm content |
| **Client admin** | membership/integration management (own client) | `manage`(members/integrations), `view_integration` | **approve firm legal content**, other clients, internal models |

All roles are **tenant-scoped**; no role sees another client or internal firm work
product.

---

## 12. Connector read-path rules

- A **connector-originated event is not readable** by the portal.
- **`ExternalIntakeItem` is not readable** (internal until triaged + published).
- **`ExternalObjectLink`** surfaces **only** through a published
  `ClientVisibleConnectorLink` artifact.
- **Integration audit items** are **redacted and scoped** (`ClientVisibleIntegrationAuditItem`).
- **External URL** access requires **policy + grant** (`externalUrlActionRef`), never
  a raw URL, and only for permitted roles.
- **No connector credentials / log payloads** are ever readable.

Aligns with `connector-security-data-boundary-design.md` §14 (connector intake
becomes portal-visible only after explicit publication).

---

## 13. Upload / write-path boundary note

This doc is read-path focused; write-path is designed separately. Boundary notes:
- upload/reply/new-request endpoints **must still resolve membership first**;
- submitted client content becomes **internal pending review / client-originated
  artifact state** — it is not published by the act of submission;
- **upload does not publish a document automatically**;
- a **client-originated message** is visible as `authorSide:"client"` within scope,
  but may require internal triage for legal workflow.

No full write-path is designed here.

---

## 14. Negative test matrix (future)

1. Unauthenticated → **401**.
2. Disabled feature gate → safe gate response (501/404 per convention).
3. User **cannot list clients** (no global client endpoint).
4. User **cannot see a workspace not in their membership**.
5. Guessed `requestId` from **another client** → same **404**.
6. **Unpublished** artifact → same **404**.
7. **Published but ungranted** artifact → same **404**.
8. **Revoked** artifact → same **404**.
9. **Superseded** artifact hidden unless version-history grant.
10. Request **list count excludes ungranted** artifacts.
11. **Summary counts exclude hidden** artifacts.
12. Message list **excludes raw email / internal** messages.
13. Document detail **excludes raw URL / storage metadata**.
14. Report **excludes time-entry details**.
15. Integration list **excludes other-client + credentials**.
16. **DTO mapper cannot run before grant resolution** (order-enforcement test).
17. **`clientId` route param is ignored/rejected** for portal API.
18. Cross-membership: user with memberships in clients A and B cannot use A's
    session to read B's artifacts (and vice versa) without switching workspace.

---

## 15. Relationship to future schema split

This design informs later phases: `ClientPortalPublication`, `ClientPortalGrant`,
artifact state fields, membership-scope indexes, grant `action` enums, DTO mappers,
and security tests. But:
- **no schema is created now**;
- **CP-SCHEMA-1 remains blocked** by Prisma baseline/proof work;
- the **CP-PUBLICATION-SCHEMA** phases (publication/grant/audit) are downstream of
  CP-SCHEMA-1; **CONNECTOR-SCHEMA-1** likewise remains blocked.

---

## 16. Open questions

1. Workspace switching: is the current workspace stored server-side per session, or
   passed as an opaque header/token on each `/me/*` call?
2. Do we support a **single aggregated feed** across a user's multiple workspaces,
   or strictly one active workspace at a time? (Default: one active workspace.)
3. Search within `/me/requests`: server-side over visible artifacts only — what
   fields are searchable without leaking (title/status only)?
4. Message-view audit granularity: per-thread-open vs per-message-read vs none.
5. Pagination + total counts: expose exact totals of visible artifacts, or bounded
   "N+" to avoid subtle enumeration signals?
6. Opaque-id scheme: per-artifact random id vs deterministic HMAC of internal id —
   decide before route params are finalized.
7. Rate-limiting/lockout policy for repeated 404s (possible enumeration probing).
8. Does `grant-denied` ever notify an internal user (suspicious-access signal), and
   at what threshold?

---

## 17. Recommended next prompt

> **Adminiculum — Client Portal write-path & submission boundary design (docs-only).**
> Define how future `/api/v1/client-portal/me/*` **write** endpoints (new request,
> document upload, message reply) resolve membership first, create
> client-originated / pending-review artifact states, enforce that submission never
> auto-publishes, apply anti-abuse limits, and emit redacted audit — including the
> state transitions into the approval workflow and the negative test matrix. Keep it
> docs-only: no schema edits, no migrations, no routes, no runtime/auth change. Do
> not unblock CP-SCHEMA-1 / CONNECTOR-SCHEMA-1; note their baseline/proof
> prerequisites.

---

*Docs-only. No runtime, schema, migration, DB, auth, or client-portal-enablement
change. CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain blocked.*
