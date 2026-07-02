# Client Portal v1 Security Architecture — Consolidation

> Status: **docs-only consolidation**. No implementation, no schema, no migration,
> no routes, no auth change, no runtime change. Client Portal remains future-only /
> gated (`ENABLE_CLIENT_PORTAL` off). This document **does not** unblock CP-SCHEMA-1
> or CONNECTOR-SCHEMA-1 — both remain blocked by Prisma baseline/proof work.
>
> This is the **authoritative single reference** synthesizing the Client Portal v1
> security series. It introduces **no new concept chain** — it consolidates:
> - `client-portal-tenant-isolation-login-ui-alignment.md`
> - `client-portal-tenant-isolated-api-contract.md`
> - `client-portal-dto-publication-boundary.md`
> - `client-portal-publication-artifact-model-split-plan.md`
> - `client-portal-publication-approval-audit-workflow.md`
> - `client-portal-publication-payload-validator-design.md`
> - `client-portal-read-path-grant-resolution-design.md`
> - `client-portal-write-path-submission-boundary-design.md`
> - `client-portal-submission-to-publication-triage-workflow.md`
> - `client-portal-v1-security-contract-audit.md`
> - `client-portal-v1-identity-authorization-plan.md`
> - `client-portal-v1-schema-migration-split-plan.md`
> - `client-portal-v1-schema-migration-draft-review.md`
> - `connector-security-data-boundary-design.md`
> - `universal-connector-compatibility-architecture.md`
>
> UI source (`C:\Users\hubay\Documents\Ügyfélportál`, "Adminiculum Ügyfélportál
> v1.1/v1.2" PDFs + design zips) informs surface/state implications. **No UI assets
> copied.**

---

## 1. Executive summary

The Client Portal exposes a **narrow, published, granted, tenant-isolated** subset
of firm work to external client users, and accepts **client submissions that only
ever become pending-review inputs** to internal workflow. Fifteen invariants govern
everything:

1. A portal user never sees other law-firm clients.
2. No global client list, no public client selector.
3. Visibility = authenticated `ClientPortalUser` + active `ClientPortalMembership`.
4. Email/domain alone never grants access.
5. The client portal API is **`/me`-scoped**.
6. Internal models are never returned directly.
7. `clientId` match alone is not enough.
8. **Publication and grant are both required.**
9. **Approved ≠ published.**
10. **Published ≠ visible** unless granted.
11. Client submissions never auto-become legal advice, cases, accepted documents, or approved lawyer messages.
12. **AI and connector actors can never approve or publish.**
13. Connector inbound is automatic only into **internal intake**; outbound is **approval-gated**.
14. Notifications carry only **client-safe status/confirmation**, never internal content.
15. All errors **avoid cross-tenant enumeration**.

---

## 2. Final security architecture model

**Read:**
```
authenticated ClientPortalUser
  → active ClientPortalMembership
  → workspace / team / role scope
  → /me API
  → published artifact (state = published)
  → grant (scope match)
  → validated payload
  → client-safe DTO
  → UI
```

**Write:**
```
authenticated ClientPortalUser
  → active ClientPortalMembership
  → validated submission (allow-list + deny-list)
  → pending internal triage
  → internal object / action (Case / Task / Communication / Document review / …)
  → proposed publication artifact (validator)
  → approval (lawyer/admin)
  → publication (state = published)
  → grant (scope)
  → DTO / notification
```

Neither path lets an internal model reach the client, and neither lets a client
input reach other users, without passing every stage.

---

## 3. Tenant isolation and login

- **Email/password login** (portal identity distinct from internal MSAL/Entra auth).
- **No client selector before auth**; **no visible client list**.
- **Membership-based workspace resolution** — one membership auto-selects; multiple
  show only the **user's own** memberships.
- **No domain-based auto-join**; **invitation-only** is the preferred model — email
  alone never grants access.
- **Non-enumerating** login / forgot-password / invite errors (uniform "if an
  account exists…" responses; no account existence disclosure).

---

## 4. Tenant-isolated `/me` API

Future endpoint families (all under `/api/v1/client-portal/me`):
`me`, `me/workspaces`, `me/summary`, `me/requests`, `me/documents`, `me/messages`,
`me/deadlines`, `me/report`, `me/team`, `me/integrations`.

Rules:
- **No public global `/clients`**; **no `clientId` path param** in the portal public API.
- Route IDs are **opaque / portal-safe and always scoped** — an id is not a capability.
- Unauthorized / missing / unpublished / ungranted → **same non-enumerating 404**.
- External IDs are **display-only chips**, never dereferenced by a portal route.

---

## 5. Read-path architecture

**Query-and-scope-before-map** — never fetch internal models broadly and filter in
memory; never map before publication + grant checks. Counts/summaries derive only
from **visible** artifacts.

Canonical order:
1. feature gate; 2. authenticate; 3. resolve membership/workspace; 4. role/action
check; 5. **query published artifacts in scope**; 6. apply grants; 7. validate
payload type; 8. map to DTO; 9. return (non-enumerating).

The publication/grant/scope predicates live **in the query**, not in post-filtering.

---

## 6. Write-path architecture

- **Membership-first**; client input **never sets** `clientId`, `role`, or any
  publication/approval/visibility state.
- **New requests → submissions / pending triage**; **uploads → pending review**;
  **messages → client-originated submissions/communications**.
- **Invitations** scoped to the current tenant; **integration setup** starts as
  **draft / pending verification**.
- **No auto-publication, no auto-approval, no automatic connector outbound sync.**
- Anti-abuse: rate limits per membership/client/IP/action; **idempotency keys
  scoped per membership/client/action with no cross-client leakage**; uniform
  generic errors; no stack/debug detail.

---

## 7. Submission-to-publication chain

```
submission → triage queue → internal object → proposed ClientVisible* → approval → published+granted → DTO
```

- **`ClientPortalSubmissionTriageQueue`** is internal-only; submissions are pending
  until a **human** triages them.
- Submission states (`received`…`converted_to_*`/`duplicate`/`ignored_not_legal`/
  `rejected`) translate to **client-safe states only** (`Beérkezett`,
  `Feldolgozás alatt`, `Ellenőrzés alatt`, …).
- **Triage actors:** lawyers triage/approve; assistants propose; **AI and connector
  actors suggest only**; **clients cannot triage**.
- **Duplicate/merge handling must never reveal hidden matters, hidden requests, or
  other client/team content** — no hidden ids, no "already exists", generic
  confirmation only. A client-visible result appears only if the target is
  published **and** granted.

---

## 8. DTO and payload boundary

- **No raw Prisma/internal models** in responses; **`{...sourceModel}` is forbidden**.
- Layering: **allow-list transformer → payload validator (fail closed) → approval →
  published artifact → grant check → DTO mapper (last layer)**.
- **Forbidden field catalogue** (rejected at any nesting depth): internal notes; AI
  drafts/prompts/completions/model metadata; legal strategy; risk scoring; review
  comments/redlines/reviewer chain; raw email/webhook payloads; storage/SharePoint
  metadata (`spItemId`/`spWebUrl`/`workspaceText`/storage keys); billing/time-entry
  internals; other-client references; connector credentials/debug logs; raw URLs.
- **Highest-risk payloads (validators mandatory day one):** `ClientVisibleDocumentVersion`,
  `ClientVisibleMessage`, `ClientVisibleReportSnapshot`, `ClientVisibleConnectorLink`/
  `IntegrationAuditItem`.

---

## 9. Publication and grant model

- **Internal source object ≠ publication artifact** — approval **copies** allow-listed
  fields into a `ClientVisible*` artifact; the portal reads artifacts, never sources.
- **Publication** = content safe to expose; **Grant** = this user/team/role/workspace
  may access it. **Both required.**
- **State machine:** `internal_only → draft → pending_approval → approved →
  published`, plus `revoked`, `expired`, `superseded`, `rejected`.
- Rules: **publication without grant invisible; grant without publication invisible;
  revoked/expired invisible; superseded hidden unless version-history permission
  exists.** Revocation/supersession changes **artifact visibility, not internal legal
  history**. **`approved` never auto-`published`.**

---

## 10. Approval and audit workflow

- **`PublicationApprovalQueue`** holds proposed client-safe artifacts; the queue
  stores validated content only (approver previews exactly what the client will see).
- **Proposer / approver / publisher** are distinct; **risk levels** (low/medium/high)
  set the minimum approver, with **dual approval** for sensitive/litigation.
- **High-risk families (`DocumentVersion`, `Message`, `ReportSnapshot`) require
  lawyer approval.** **AI and connector actors cannot approve/publish.** **Client
  admins never approve firm legal content.**
- **Audit** records the *fact and shape* of every transition (drafted/proposed/
  approved/published/downloaded/revoked/…), with **redacted metadata** (ids, types,
  states, actor type, timestamps, reason codes — never secrets, payloads, strategy,
  PII, or the real cause of a 404).
- **Incident/revocation:** revoke artifact/grant, audit, optionally publish a
  correction, investigate access/download logs, rotate tokens — never mutate the
  internal source.

---

## 11. Notification and confirmation boundary

**Channels:** in-app notification; **optional** email; optional future external
workflow status **only through connector approval**.

**A notification may contain:** a generic receipt confirmation; a client-friendly
**status**; "new document request" / "clarification requested" / "approved document
available" / "message available in portal" / "monthly report available" notices;
invitation status; integration-setup status.

**A notification must not contain:** legal advice body (unless explicitly approved);
document contents; raw file links; internal notes; AI draft; risk/strategy; raw
email thread; raw webhook payload; other-client references; sensitive attachment
content; connector credentials/debug logs.

**Rules:**
- Notification target is **membership-scoped**.
- **Email should link to the portal**, not carry sensitive content (defense against
  mis-delivery/forwarding).
- A notification **must not reveal a hidden resource** and **must not be sent for an
  ungranted artifact**.
- A **revoked/superseded** artifact must not leave a **stale actionable link** (the
  link resolves through the read-path, returning the uniform 404 if no longer
  visible).
- Delivery/audit metadata is **redacted**; a notification about an artifact the user
  can't (any longer) access degrades to nothing rather than leaking.

---

## 12. Connector relationship

- The connector service actor is **neither an internal user nor a client user**.
- An external workflow event enters `ExternalWorkflowEvent`/`ExternalIntakeItem`
  (internal intake); **connector intake is invisible until triaged and published**.
- `ExternalObjectLink` is **correlation, not publication**.
- **Outbound** connector status/comment requires **approval** before external post;
  an approved portal publication is **not** automatically an approved outbound sync.
- The portal may show a **source badge / external ID / external URL** only if
  **published + granted + policy-allowed**; **raw webhook/credential/debug never
  visible**.

---

## 13. Role visibility matrix (conceptual)

Legend: Y = allowed, — = no, (s) = scoped, P = propose only.

| Capability | requester | team lead | client mgr | client admin | int. lawyer | int. assistant | int. admin | connector actor | AI helper |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| read own requests | Y | Y | Y | Y | (internal) | (internal) | (internal) | — | — |
| read team requests | — | Y(s) | Y | Y | n/a | n/a | n/a | — | — |
| read client-wide report | — | (s) | Y | Y | n/a | n/a | n/a | — | — |
| submit request | Y | Y | Y | Y | — | — | — | — | — |
| upload document | Y | Y | Y | Y | — | — | — | — | — |
| send message | Y | Y | Y | Y | (via publish) | — | — | — | — |
| invite/manage users | — | — | — | Y(own client) | — | — | — | — | — |
| setup integration | — | — | — | Y(own client) | — | — | (operational) | — | — |
| propose publication | — | — | — | — | Y | P | (operational) | — | P(text only) |
| approve publication | — | — | — | — | Y | — | (operational) | **never** | **never** |
| publish | — | — | — | — | Y | — | (operational) | **never** | **never** |
| revoke | — | — | — | — | Y | — | Y | — | — |
| view internal audit | — | — | — | (own client, limited) | Y | (limited) | Y | — | — |

All client roles are **tenant-scoped**; no role sees another client or internal firm
work product; client admins administer only their own tenant.

---

## 14. Security test master list

**A) Tenant isolation** — no global client list; user of client A cannot read/guess client B; `clientId` route param rejected/ignored; cross-membership session cannot cross tenants.
**B) Authentication/membership** — unauth → 401; inactive/suspended/expired membership → no data; email alone ≠ access; workspace not in membership → invalid.
**C) Read-path** — query-before-map enforced; internal model never a portal source; summary counts exclude hidden; opaque-id still scoped.
**D) Write-path** — client cannot set `clientId`/`role`/`published`/`approved`; `workspaceId` mismatch rejected; no auto-publish; idempotency dedup + cross-client isolation; rate limits.
**E) Publication/grant** — approved-not-published → 404; published-not-granted → 404; revoked → 404; superseded hidden unless history grant; `approved` never auto-published.
**F) DTO/payload validators** — unknown/forbidden field (top & nested) rejected; Prisma-shape rejected; deny-list tokens rejected; mapper output snapshot = allow-list only; fail-closed on malformed.
**G) Documents/downloads** — no raw URL/storage key/sp metadata; download requires grant + emits audit; client cannot mark accepted/final; short-lived single-use token.
**H) Messages/communications** — raw email body/thread excluded; internal classification excluded; AI draft excluded; attachment refs must be approved.
**I) Reports** — aggregate-only; no `billableMinutes`/`hourlyRate`/per-entry rows; role-gated; team breakdown only if allowed.
**J) Connector** — intake invisible until triaged+published; outbound requires approval; external URL policy/grant-gated; raw payload/credential never visible.
**K) Notifications** — none sent for ungranted artifact; no sensitive content; no hidden-resource reveal; revoked → no stale actionable link; membership-scoped.
**L) Audit/redaction** — audit records fact/shape + reason code; no secrets/payloads/PII/strategy; 404 cause never leaked to client.
**M) AI boundaries** — AI cannot triage/approve/publish/mark-accepted; AI output passes validator before any proposal; human review required.

---

## 15. Future schema phase implications (conceptual only)

Likely future phases (downstream, **not implemented**):
- **CP-SCHEMA-1** — identity/membership foundation (`ClientPortalUser`, `ClientPortalMembership`, `ClientPortalTeam`, `ClientPortalRole`, `ClientPortalInvitation`, `ClientPortalAuditEvent`).
- **CP-VISIBILITY/PUBLICATION** — `ClientPortalPublication` / `ClientPortalGrant` + `ClientVisible*` artifact payloads (hybrid: generic metadata + typed validated payloads).
- **CP-DTO/read-path support** — mappers, scope indexes, grant-action enums.
- **CP-WRITE-PATH** — `ClientPortalSubmission` + triage-state models, idempotency, rate-limit counters.
- **CP-DOCUMENT** — upload intent/`actionRef`, pending-review, download audit.
- **CP-MESSAGES**, **CP-REPORTS**, **CP-INTEGRATIONS** (connector bridge).

**Blockers:** actual schema is **blocked by Prisma baseline/proof** — **no migration
should be created until the clone/baseline proof is resolved**. This consolidation is
**implementation guidance only**. **CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain
blocked.**

---

## 16. Open questions

1. Exact publication/grant schema shape (generic JSON vs typed tables vs **hybrid** — hybrid recommended).
2. Notification email content policy (link-only vs limited status text).
3. Document version-history visibility to clients (latest-only default).
4. Multiple-workspace UX (one active workspace vs aggregated feed).
5. Client-originated message visibility timing (immediate self-echo vs light moderation).
6. Which low-risk statuses (if any) may ever auto-publish (default: none in MVP).
7. Whether external URLs are ever visible to requesters (vs admin/team-lead only).
8. Rate limits + storage quotas per client/membership.
9. **Production-like clone/baseline proof path** to unblock CP-SCHEMA-1 (the gating dependency).
10. Opaque-id scheme (random vs HMAC) and enumeration-probe lockout policy.

---

## 17. Recommended next prompt

> **Adminiculum — Client Portal v1 CP-SCHEMA-1 baseline/proof unblocking preflight (docs-only).**
> Define exactly what Prisma baseline/clone proof is required to safely unblock
> CP-SCHEMA-1: the production-like clone strategy, migration-history reconciliation
> approach (given the foundation-reconciliation `_prisma_migrations` model), the
> additive-only identity/membership migration shape, a drift-readiness checklist,
> and the go/no-go criteria — without editing schema, creating migrations, or
> touching the database. Docs-only; no schema/migration/route/runtime/auth change;
> do not enable client portal.

---

*Docs-only. No runtime, schema, migration, DB, auth, or client-portal-enablement
change. CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain blocked.*
