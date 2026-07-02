# Client Portal Publication Approval and Audit Workflow

> Status: **docs-only workflow design**. No implementation, no schema, no
> migration, no routes, no auth change, no runtime change. Client Portal remains
> future-only / gated (`ENABLE_CLIENT_PORTAL` off). This document **does not**
> unblock CP-SCHEMA-1 or CONNECTOR-SCHEMA-1 — both remain blocked by Prisma
> baseline/proof work; their prerequisites are unchanged.
>
> This defines the **internal-side approval workflow** that moves client-visible
> publication artifacts from `draft` → `published`, extending:
> - `docs/client-portal-publication-artifact-model-split-plan.md` (state machine + artifact families)
> - `docs/client-portal-dto-publication-boundary.md` (DTOs + forbidden fields)
> - `docs/client-portal-tenant-isolated-api-contract.md`
> - `docs/client-portal-tenant-isolation-login-ui-alignment.md`
> - `docs/client-portal-v1-security-contract-audit.md`
> - `docs/client-portal-v1-identity-authorization-plan.md`
> - `docs/connector-security-data-boundary-design.md`
> - `docs/universal-connector-compatibility-architecture.md`

---

## 1. Executive summary

No internal object becomes client-visible automatically. Every client-facing byte
passes an **explicit internal approval workflow** that produces an approved,
published **publication artifact** (`ClientVisible*`), which the portal reads via
grant scope. **Approval and publication are separate steps:** `approved` means the
content is legally/client-safely signed off; `published` means it is currently
released to authorized memberships.

Non-negotiables:
1. No AI draft, connector event, internal note, task, review comment, or raw
   communication can **self-publish**.
2. **AI and connector service actors can never approve or publish.**
3. **Client admins never approve the law firm's legal content** — they manage only
   their own client-side users/integrations.
4. Every published artifact preserves a full audit trail: **who proposed, who
   approved, who published, when, from what source, and what changed.**
5. Audit metadata is useful internally but **never leaks secrets, raw payloads,
   legal strategy, AI prompts, document content, or other-client data.**
6. Portal responses consume **only published artifacts granted to the
   authenticated membership**; otherwise a non-enumerating `404`.

UI source (`C:\Users\hubay\Documents\Ügyfélportál`, "Adminiculum Ügyfélportál
v1.1/v1.2" PDFs + design zips) implies an internal **approval-queue + artifact
preview** surface and a client side that shows **only published** artifacts. **No
UI assets are copied**; only approval/audit implications are summarized.

---

## 2. Actors and responsibilities

### Internal (firm-side)

| Actor | Draft/propose | Approve | Publish | Revoke | View audit | Manage grants | Never allowed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Responsible lawyer** | Yes | Yes (own matters) | Yes | Yes | Yes | Yes | approve other clients' matters they don't own |
| **Supervising lawyer** | Yes | Yes (incl. sensitive/high-risk) | Yes | Yes | Yes | Yes | bypass audit |
| **Assistant / paralegal** | Yes (propose) | **No** | **No** (unless low-risk policy explicitly delegates) | No | Limited | Propose grants only | approve/publish legal content |
| **Internal admin** | Yes | Operational only (integration status/audit) | Operational only | Yes | Yes | Yes | approve legal content in place of a lawyer |
| **System / background worker** | Yes (auto-propose low-risk) | **No** | **No** | No (may mark `expired`) | n/a | Suggest grants | approve/publish |
| **AI assistant (helper)** | Yes (suggest draft text) | **Never** | **Never** | Never | No | Never | any approval/publication; self-approval |
| **Connector service actor** | Yes (propose from intake) | **Never** | **Never** | Never | No | Never | approve/publish; outbound send without approval |

### Client-side (portal)

| Actor | Draft/propose | Approve | Publish | Revoke | View audit | Manage grants | Never allowed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Requester** | Portal messages / uploads only | No | No | No | No | No | see other requesters' scope, approve firm content |
| **Team lead** | Portal messages / uploads (team) | No | No | No | No | No | approve firm content, cross-team access |
| **Client manager** | Portal messages | No | No | No | No | No | approve firm content, see other clients |
| **Client admin** | Manage own users/integrations | **No (legal content)** | No | No | Own client's client-side audit (limited) | Own client memberships/integrations | approve/publish firm legal content, see other clients |

**Key:** approval of client-facing **legal** content is exclusively an internal
lawyer act. Client admins are administrators of their own tenant, not approvers of
firm work product.

---

## 3. Publication approval queue concept

**`PublicationApprovalQueue`** (conceptual future model) — an internal queue of
proposed client-visible artifacts awaiting review.

Queue items may originate from:
- case status change; task/client-todo creation; document request;
- document version approval; outgoing lawyer message; email-derived client message;
- monthly report generation; connector intake triage; connector outbound
  status/comment; deadline publication; manual internal proposal.

Per queue item (conceptual fields):
- `sourceObjectType` + `sourceObjectId`;
- `artifactFamily` (`ClientVisibleRequest`/`Status`/`TimelineItem`/`Todo`/`DocumentRequest`/`DocumentVersion`/`Message`/`Deadline`/`ReportSnapshot`/`ConnectorLink`/`IntegrationAuditItem`);
- `proposedContent` (the exact client-safe text/fields, already allow-list-filtered);
- `targetClientId` / `workspaceId` / `teamId?`;
- `proposedGrants[]`;
- `riskLevel` (`low`/`medium`/`high`);
- `requiredApproverRole`;
- `currentState`;
- `due?` / `priority?`.

The queue **stores only the proposed client-safe content**, never a live pointer
that re-derives internal fields — so a reviewer previews exactly what the client
would see.

---

## 4. Approval states and transitions

State machine (from the split plan): `internal_only → draft → pending_approval →
approved → published`, plus `rejected`, `revoked`, `expired`, `superseded`.

| From | To | Actor allowed | Required checks | Audit event | Client visibility effect |
| --- | --- | --- | --- | --- | --- |
| `internal_only` | `draft` | lawyer / assistant / system | source exists; artifact family valid | `publication_artifact_drafted` | none |
| `draft` | `pending_approval` | lawyer / assistant / system (auto-propose low-risk) | proposed content passes allow-list/deny-list filter | `publication_artifact_proposed` | none |
| `draft` | `rejected` | proposer / approver | — | `publication_artifact_rejected` | none |
| `pending_approval` | `approved` | **required approver role** (lawyer for legal content; admin for operational) | content review; forbidden-field check; risk gate (dual approval if high-risk) | `publication_artifact_approved` | none (approved ≠ visible) |
| `pending_approval` | `rejected` | approver | reason recorded | `publication_artifact_rejected` | none |
| `approved` | `published` | publisher (lawyer/admin) | valid grants resolved; scope matches; `validUntil?` set | `publication_artifact_published` (+ `publication_grant_created`) | **visible to granted memberships** |
| `approved` | `revoked` | lawyer / admin | — | `publication_artifact_revoked` | none |
| `published` | `revoked` | lawyer / admin | — | `publication_artifact_revoked` | disappears (generic "no longer available" if linked) |
| `published` | `superseded` | system / internal | newer approved+published artifact exists | `publication_artifact_superseded` | old hidden unless history allowed |
| `published` | `expired` | system | `validUntil` elapsed | `publication_artifact_expired` | disappears |

**Distinction reinforced:** `approved` = content is legally/client-safely
approved; `published` = visible to *granted* client portal users. Publishing
requires access scope + membership + role — a published artifact with no matching
grant is invisible.

---

## 5. Artifact-family approval rules

For each: MVP behavior, later automation possibility, required audit.

### A) `ClientVisibleRequest`
- **Propose:** lawyer / assistant / connector-triage / system. **Approve:** responsible lawyer.
- **Auto-publish after case intake?** **No in MVP** — request summary + status are lawyer-approved. (Later: policy-based auto-propose of a neutral "request received" only.)
- **Grants:** client / team / requester-own. **Audit:** drafted/proposed/approved/published.

### B) `ClientVisibleStatus`
- **Low-risk changes** (e.g. → `Beérkezett`, `Feldolgozás alatt`): may be auto-**proposed**; still require approval in MVP.
- **Lawyer-approval-required:** `Ügyvédi ellenőrzés alatt`, `Válasz elkészült`, `Lezárva`, and any status derived from a hold/cancellation.
- **Policy-based auto-publication:** allowed **later** for a small allow-list of neutral statuses, default-off. **MVP:** approval required. **Audit:** proposed/approved/published; supersede on change.

### C) `ClientVisibleTimelineItem`
- **Auto-proposable:** request received; document requested; document uploaded (client). **Lawyer approval:** review started; clarification requested; answer ready; matter closed.
- **Forbidden entirely:** internal review handoff, AI drafting, task reassignment, risk escalation, strategy, time entry. **Audit:** proposed/approved/published.

### D) `ClientVisibleTodo`
- Upload document / answer clarification / review approved version / confirm instruction / sign document. **Approve client-facing wording:** lawyer (assistant may propose).
- **Deadline sensitivity:** if a todo has a legal deadline, lawyer approval required. **Audit:** proposed/approved/published; hidden on completion.

### E) `ClientVisibleDocumentRequest`
- Document name, client-friendly instruction, due date, accepted file types, status. **Internal strategic reason excluded.** **Approve:** lawyer/assistant (lawyer if the reason is sensitive). **Audit:** proposed/approved/published.

### F) `ClientVisibleDocumentVersion` — **highest risk**
- **Lawyer approval required before publish**, always. Redlines/review annotations **never** visible; only the approved clean version. Download uses a **short-lived, single-use, scope-bound token** and emits `publication_artifact_downloaded`. Supersede on new approved version. **Audit:** proposed/approved/published/downloaded/superseded.

### G) `ClientVisibleMessage` — **highest risk**
- **Outgoing lawyer message:** lawyer approval before publish. **Email-derived message:** approval required before portal publication (raw thread never shown). **Client-originated portal message:** visible as `authorSide:"client"`, but internally **triaged/moderated** (default: echo to same request scope; policy may require light review — see open questions). **Audit:** proposed/approved/published; connector-derived messages also carry source badge only after approval.

### H) `ClientVisibleDeadline`
- Date / client-friendly label / action / related request / status. **Internal deadline reasoning excluded.** **Litigation-sensitive deadlines require lawyer approval.** **Audit:** proposed/approved/published; expire via `validUntil`.

### I) `ClientVisibleReportSnapshot`
- **Aggregate-only** (no per-minute/time-entry rows). **Approval before first release** (manager-facing narrative approved by lawyer/admin). Scope: client manager/admin (team_lead subset if enabled). **Later:** recurring monthly generation may auto-**draft**, but each release still approved (or an explicit standing policy). **Audit:** generated/proposed/approved/published/superseded.

### J) `ClientVisibleConnectorLink` / `ClientVisibleIntegrationAuditItem`
- Source badge / external ID / external URL (policy-gated) / approved sync status / redacted audit action. **Connector outbound status/comment requires approval before external post.** Raw webhook/debug data forbidden. External URL granted to admin/team_lead only. **Audit:** proposed/approved/published; `connector_outbound_publication_sent/failed`.

---

## 6. Approval categories and risk levels

| Risk | Examples | Allowed proposer | Required approver | Dual approval? | Auto-publication? |
| --- | --- | --- | --- | --- | --- |
| **Low** | neutral status update; document upload received; request received | assistant / system / connector-triage | responsible lawyer (single) — assistant may publish only under an explicit low-risk delegation policy | No | **Forbidden in MVP** (policy-gated, default-off later for a neutral allow-list) |
| **Medium** | clarification request; deadline publication; timeline update; connector status back to external system | assistant / lawyer / system | responsible lawyer | No | Forbidden |
| **High** | legal answer; document final version; report narrative; sensitive email-derived message; litigation-related update | lawyer / assistant-propose | responsible lawyer (+ **supervising lawyer** if flagged sensitive/litigation) | **Yes for flagged sensitive** | **Forbidden** |

Rule: risk level determines the **minimum** approver; a lawyer may always require
escalation. Auto-publication is never allowed for medium/high risk.

---

## 7. Audit event model (conceptual)

Conceptual future events (no schema edited):
`publication_artifact_drafted`, `_proposed`, `_approved`, `_rejected`,
`_published`, `_viewed`, `_downloaded`, `_revoked`, `_expired`, `_superseded`,
`publication_grant_created`, `_updated`, `_revoked`,
`connector_outbound_publication_sent`, `_failed`,
`publication_policy_auto_proposed`, `publication_policy_blocked`.

Per-event conceptual fields:
- `eventId`; `clientId`; `workspaceId` / `teamId` (scope);
- `actorType` (internal/client/system/ai/connector); `actorId`; `actorDisplayRole`;
- `artifactType`; `artifactId`; `sourceObjectType`; `sourceObjectId`;
- `previousState`; `newState`; `action`;
- `timestamp`; `correlationId`;
- `metadataRedactedJson` (see §8);
- `reason?` / `comment?` (redacted);
- `ip?` / `userAgent?` (only for client-side view/download);
- `externalSystem?` / `externalObjectId?` (connector-related).

These extend the `ClientPortalAuditEvent` concept from the identity/authorization
plan; **no schema is defined here.**

---

## 8. Audit redaction rules

**Allowed in audit metadata:** IDs; artifact type; source object type; state
transitions; actor type; timestamps; redacted external **system name**;
high-level action; non-sensitive reason **code**.

**Forbidden in audit metadata:** secrets; connection strings; access tokens;
connector credentials; raw webhook payload; raw email body (unless explicitly
approved *and* redacted); legal strategy; AI prompt/completion; internal note
content; document content; raw file URLs; other-client references; personal/client
data beyond the minimum needed for audit.

Principle: **audit records the *fact and shape* of a transition, not its sensitive
content.** A `reason` field stores a code or short redacted note, never a legal
rationale or client PII beyond identifiers.

---

## 9. Internal action → publication mapping

| Internal action | Proposed artifact | Default state | Approval needed? | Suggested approver | Publication scope | Audit events | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| case created / legal request accepted | `ClientVisibleRequest` | `draft` | Yes | responsible lawyer | client/team/requester | drafted→proposed→approved→published | Med |
| case status changed | `ClientVisibleStatus` | `draft` | Yes (MVP) | responsible lawyer | request scope | proposed→approved→published; supersede | Low–Med |
| task assigned to client | `ClientVisibleTodo` | `draft` | Yes (wording) | lawyer (assistant propose) | responsible client user | proposed→approved→published | Med |
| document requested | `ClientVisibleDocumentRequest` | `draft` | Yes | lawyer/assistant | request scope | proposed→approved→published | Med |
| document uploaded by client | upload-received status/timeline | `pending_approval`→(maybe `published`) | Conservative (default-off auto) | lawyer/assistant | request scope | proposed→(published) | Low |
| document reviewed/approved | `ClientVisibleDocumentVersion` | `draft` | **Yes (lawyer)** | responsible lawyer | grant (may be manager-only) | proposed→approved→published→downloaded | **High** |
| outgoing message drafted | `ClientVisibleMessage` | `draft` | **Yes (lawyer)** | responsible lawyer | thread/request | proposed→approved→published | **High** |
| email imported | `ClientVisibleMessage` (email-derived) | `internal_only` | **Yes** | responsible lawyer | thread/request | proposed→approved→published | **High** |
| monthly report generated | `ClientVisibleReportSnapshot` | `draft` | Yes | lawyer/admin | manager/admin | generated→proposed→approved→published | High (narrative) |
| connector intake triaged | `ClientVisibleRequest`/`Message` | `internal_only`→`draft` | Yes | responsible lawyer | scope | proposed→approved→published | Med–High |
| connector outbound comment proposed | outbound status/comment | `pending_approval` | **Yes** | lawyer/admin | external system | proposed→approved→`connector_outbound_publication_sent` | Med–High |
| deadline created/updated | `ClientVisibleDeadline` | `draft` | Yes (lawyer if litigation) | lawyer | request scope | proposed→approved→published; expire | Med |
| matter closed | `ClientVisibleStatus` (`Lezárva`) + timeline | `draft` | Yes | responsible lawyer | request scope | proposed→approved→published | Med |

---

## 10. Internal and client UI implications (docs-only)

**Internal Adminiculum future UI** should include:
- a **publication approval queue** (pending items, risk, required approver);
- an **artifact preview exactly as the client will see it** (WYSIWYG of the DTO);
- **forbidden-field warnings** if the proposed content contains anything on the deny-list;
- a **source-object link** for the internal reviewer (internal-only navigation);
- **target client/workspace/team scope** + **proposed grants**;
- **approve / reject / publish / revoke** actions (role-gated);
- an **audit-trail tab** per artifact.

**Client Portal UI** should show:
- **only published** artifacts;
- **no `pending_approval` state** exposed (unless a client-safe generic status);
- revoked artifact **disappears** or shows a generic "no longer available";
- **source badges only if approved.**

No implementation here — these are design constraints for a future build.

---

## 11. Connector outbound approval relationship

Aligns with `connector-security-data-boundary-design.md` (§11 outbound approval,
§14 client-portal relationship):
- A connector **inbound** event may create a **proposed** artifact only; connector
  intake is **invisible until triaged and published**.
- A connector **outbound** status/comment must **pass approval before** posting to
  the external system.
- An **approved portal publication is not automatically an approved outbound
  connector sync** — outbound is a separate approval unless an explicit policy says
  otherwise (default: separate).
- Outbound connector audit includes **external system / object ID** but **no raw
  payload or secrets** (`connector_outbound_publication_sent/failed`).

---

## 12. Automation policy

**Allowed later (with audit + policy, default-off):**
- auto-**propose** low-risk artifacts; auto-generate a **status draft**;
- auto-generate a **report draft**; auto-**suggest** grants; auto-create audit events.

**Forbidden always:**
- AI auto-approve; connector auto-publish a legal answer;
- automatic publication of **document versions**; automatic publication of **legal
  strategy**; automatic **outbound sync without approval** in MVP.

**MVP recommendation:** **No auto-publication.** The *only* candidate for a
conservative, default-off auto-publish is a neutral **"document upload received"**
status/timeline item — and even that should ship **off** and be enabled per-firm
only after review. Everything client-facing is human-approved in MVP.

---

## 13. Revocation and incident handling

**Wrongly published artifact:**
1. **Revoke** the artifact (`published → revoked`);
2. audit the revocation (`publication_artifact_revoked`);
3. optionally publish a **correction** artifact;
4. **notify the responsible lawyer**; optionally notify the client if appropriate;
5. **preserve internal evidence** (source + audit unchanged);
6. review the grant/policy misconfiguration that allowed it.

**Wrong client/team grant:**
1. **Revoke the grant** (`publication_grant_revoked`);
2. audit;
3. **investigate access/download logs** (who viewed/downloaded before revocation);
4. **rotate download links/tokens** if a document was exposed.

Revocation never mutates internal legal records — only artifact/grant state.

---

## 14. Security and negative test plan (future)

1. Assistant can **propose** but **not approve** a high-risk artifact.
2. **AI** cannot approve/publish.
3. **Connector actor** cannot approve/publish.
4. **Approved but unpublished** artifact is not visible → `404`.
5. **Published but not granted** artifact is not visible → `404`.
6. **Revoked** artifact disappears from all portal responses.
7. **Superseded** artifact hidden unless version history allowed.
8. **Download** creates a `publication_artifact_downloaded` audit event (single-use token).
9. **Forbidden fields cannot appear in audit metadata** (redaction test per event).
10. **Connector outbound cannot send without approval.**
11. **Client admin cannot approve legal content.**
12. **Internal note cannot become a publication artifact** without explicit, copied, allow-listed safe text.
13. **Report excludes time entries and capacity data.**
14. **Dual approval** enforced for flagged sensitive/litigation high-risk artifacts.
15. `publication_policy_blocked` fires when auto-propose hits a forbidden field/family.

---

## 15. Future schema implications (conceptual only)

Do not implement. Conceptual future needs:
- **publication artifact table** (typed payload per family, validated);
- **grant table** (client/workspace/team/request scope);
- **approval queue** view/model over pending artifacts;
- **audit event table** (§7 fields, redacted metadata);
- **artifact payload validators** (deny-list enforced server-side);
- **view/download audit** rows;
- **revocation/supersession** fields (`state`, `validUntil`, `supersededById`);
- **approver/publisher actor references** (internal user ids, roles).

**This does not unblock CP-SCHEMA-1.** All of the above sit in the future
CP-PUBLICATION-SCHEMA phases, downstream of CP-SCHEMA-1, which remains **blocked**
by Prisma baseline/proof work. CONNECTOR-SCHEMA-1 likewise remains blocked.

---

## 16. Open questions

1. Is there a **low-risk delegation policy** letting an assistant publish neutral
   status updates, or is lawyer approval always required in MVP? (Default: always.)
2. Are **client-originated** portal messages echoed immediately, or do they pass a
   light internal moderation before appearing to other client users?
3. Are report snapshots **scheduled monthly** or **on-demand**, and does recurring
   generation need per-release approval or a standing policy?
4. Is **dual approval** (supervising lawyer) mandatory for all high-risk, or only a
   "sensitive/litigation" flagged subset?
5. Should a client be **notified** on revocation of something they already saw?
6. Do we expose an audited **"no longer available"** placeholder for revoked linked
   artifacts, or remove them silently?
7. What is the **download token** design (signed short-lived vs proxied stream)?
8. Where does the approval queue **live** in the internal UI (global queue, per-case
   tab, or connector triage screen)?
9. Retention: how long are audit events kept, and how do they interact with GDPR
   erasure of client data?

---

## 17. Recommended next prompt

> **Adminiculum — Client Portal publication artifact payload & validator design (docs-only).**
> For each `ClientVisible*` family, specify the exact conceptual client-safe
> payload shape and the server-side **validator/deny-list** that guarantees no
> forbidden field can be persisted or serialized (mapping to the DTOs and the
> forbidden-field catalogue). Include the allow-list transform per family and the
> validator test matrix. Keep it docs-only: no schema edits, no migrations, no
> routes, no runtime/auth change. Do not unblock CP-SCHEMA-1 / CONNECTOR-SCHEMA-1;
> note their baseline/proof prerequisites.

---

*Docs-only. No runtime, schema, migration, DB, auth, or client-portal-enablement
change. CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain blocked.*
