# Client Portal Write-Path and Submission Boundary Design

> Status: **docs-only design**. No implementation, no schema, no migration, no
> routes, no auth change, no runtime change. Client Portal remains future-only /
> gated (`ENABLE_CLIENT_PORTAL` off). This document **does not** unblock
> CP-SCHEMA-1 or CONNECTOR-SCHEMA-1 — both remain blocked by Prisma baseline/proof
> work; their prerequisites are unchanged.
>
> Defines how future `/api/v1/client-portal/me/*` **write** endpoints handle
> client-originated submissions safely. Extends:
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

Every client portal write must resolve the authenticated `ClientPortalUser` +
**active** `ClientPortalMembership` **first**. Client-originated content may enter
Adminiculum as a **submission / pending-review** item, but it must **never
automatically** become: legal advice; an approved lawyer message; a published
artifact for other users; an accepted document version; an internal task visible
externally; an outbound connector status/comment; a client-wide report item; or a
final legal position.

**Canonical write order:**
1. feature gate; 2. authenticate portal user; 3. resolve active
membership/workspace/team; 4. role/action permission; 5. resolve target artifact /
submission scope; 6. validate input payload (allow-list + deny-list); 7. enforce
size/rate/abuse limits; 8. create **client-originated submission / pending-review**
state; 9. emit redacted audit; 10. notify internal workflow/triage; 11. **never
auto-publish / auto-approve** — unless a later, explicit, **default-off** policy
permits a narrowly-defined low-risk event.

Write endpoints must **not trust** anything the client supplies about identity or
state: `clientId`, `workspaceId` (unless matched to session), claimed role,
`externalObjectId`, file metadata, or `sourceBadge`.

UI source (`C:\Users\hubay\Documents\Ügyfélportál`, "Adminiculum Ügyfélportál
v1.1/v1.2" PDFs + design zips) implies submission surfaces (new request, upload,
message composer, clarification, team/invitations, integration setup). **No UI
assets copied** — only write-path/state implications summarized.

---

## 2. Canonical write-path principle

```
client write → [feature gate] → [portal auth middleware]
   → resolve ClientPortalUser (session identity)
   → resolve active ClientPortalMembership + workspace/client/team
   → evaluate role/action permission
   → resolve/validate target artifact (published+granted) if any
   → validate submitted payload (allow-list + recursive deny-list)
   → enforce size / rate / abuse limits + idempotency
   → create client-originated submission (state: received / pending_review / submitted / uploaded)
   → emit redacted audit
   → create internal notification / triage item
   → DO NOT publish automatically; DO NOT expose beyond granting scope
```

**Never trust from the request body:** `clientId`; `workspaceId` (unless it
matches a session membership); frontend-claimed `role`; user-supplied
`externalObjectId`; user-supplied file metadata; user-supplied `sourceBadge`.
Scope and identity come from the **session/membership only**.

---

## 3. Submission concepts (conceptual, no schema)

- `ClientPortalSubmission` — generic client-originated input awaiting processing.
- `ClientOriginatedRequestSubmission`
- `ClientOriginatedDocumentUpload`
- `ClientOriginatedMessage`
- `ClientOriginatedClarificationResponse`
- `ClientOriginatedTeamInvitationRequest`
- `ClientOriginatedIntegrationSetupRequest`

A **submission** is client-originated input awaiting internal processing/review.
It is **not** automatically: a published artifact; legal work product; nor visible
to all users in the client tenant. It carries a state (`received` /
`pending_review` / `submitted` / `uploaded`) and feeds the internal triage/approval
workflow — it does **not** create a `published` `ClientVisible*` artifact by itself.

---

## 4. Endpoint-by-endpoint write path

| Endpoint | Membership | Role | Target scope | Created state | Internal triage | Audit event | Non-enum failure | Forbidden auto-effects |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A** `POST /me/requests` | active | requester/lead/manager/admin (per policy) | own client/workspace | `submitted`/`received`/`pending_triage` | intake item → triage decides Case/Task | `client_request_submitted` | 404/invalid on scope fail | not auto-published as a matter to others; category/priority are **hints** |
| **B** `POST /me/requests/:requestId/messages` | active | scoped to request | request **published+granted** | client-originated message | communication item to triage | `client_message_submitted` | same 404 if request not visible | no AI auto-reply; no connector outbound; not lawyer-approved |
| **C** `POST /me/messages` | active | scoped | prefer request-linked | intake/triage item | intake | `client_message_submitted` | same 404 | not auto legal advice/case |
| **D** `POST /me/documents/upload-request` | active | upload grant | document request **visible+granted** | `pending_review` (uploaded) | pending document review | `client_document_upload_intent_created` / `client_document_uploaded` | same 404 if target ungranted | not accepted/final; not auto-visible to all; scan placeholder |
| **E** `POST /me/clarifications` | active | scoped | clarification/todo **visible+granted** | `pending_review` | internal review item | `client_clarification_submitted` | same 404 | completes client-todo view only; does not close internal task |
| **F** `POST /me/invitations` | active | **client admin only** | own client/workspace/team | pending invitation | onboarding | `client_invitation_created` | generic (avoid email enumeration) | no global invite; email domain ≠ access; no data until active |
| **G** `PATCH /me/team/:membershipId` | active | **client admin / team manager** | membership **in own client** | updated membership | — | `client_membership_updated`/`_revoked` | same 404 if not own client | no role escalation; no internal user creation; no other-client |
| **H** `POST /me/integrations/setup-request` | active | **client admin only** | own workspace | setup request / draft connection | connector setup review | `client_integration_setup_requested` | generic | no secrets via public body; no activation without approval; no global connector list |

All target-resolution failures use the uniform non-enumerating response (§15).

---

## 5. Input validation and payload rules

**Global validation:** explicit **allow-list** fields per endpoint; reject unknown
fields (fail closed); **recursively reject** forbidden field names/patterns; text
length limits; file count/size/type limits; rate limits; HTML/script
sanitization; **no raw `clientId` override**; no internal status; no internal role;
no external source/system spoofing; no raw storage URL from client; no
credential/token fields in normal submissions; no hidden metadata.

**Forbidden input fields/patterns (reject at any depth):**
`clientId`, `internalCaseId`, `internalTaskId`, `internalDocumentId`,
`internalUserId`, `roleOverride`, `clientVisible`, `published`, `approved`,
`publicationState`, `riskScore`, `strategy`, `aiDraft`, `rawEmail`, `rawWebhook`,
`credential`, `token`, `secret`, `storageKey`, `spItemId`, `spWebUrl`, `billing`,
`timeEntry`, `otherClient`.

The client can never set publication/approval/visibility/scope state — those are
internal-only, workflow-driven fields. A submission that carries any such field is
rejected (`client_write_rejected_validation`), and the offending **field name**
(not value) is logged.

---

## 6. File upload boundary

- **Only authenticated membership**; **target must be visible/granted** (a document request in scope).
- Use a **server-generated upload intent / `actionRef`** — the client never receives or supplies a raw storage URL/key.
- **File-type allow-list**; **max file size**; **max files per request**; optional checksum/hash.
- **Malware scan** placeholder / future requirement before acceptance.
- Uploaded file stored as **`pending_review`** — **client cannot mark a document accepted/final**.
- **No storage key** in the response; **no persistent raw signed URL**. Later download/view requires grant + audit (short-lived, single-use ref).

**Audit:** upload intent created; upload completed; upload rejected; file moved to
pending review; file accepted/rejected later by an internal user.

---

## 7. Message / reply boundary

- A client-originated message may be shown as the **sender's own submitted message**
  in the same granted thread (`authorSide:"client"`), scoped to that thread.
- It is **not** a lawyer-approved message and does **not** become a connector
  outbound comment automatically.
- It **may** be imported into an internal `Communication` for the workflow; an
  internal **response requires the publication workflow**.
- Message body must be **sanitized/validated** (length, no HTML/script, no raw
  thread markers); attachments require **approved attachment refs** (client cannot
  attach an arbitrary approved ref).

---

## 8. New request boundary

- A request submission creates an **intake item**; `category`/`priority`/`deadline`
  from the client are **hints**, not legal classification.
- Internal **triage** decides legal category, `Case` linkage, and task creation.
- **No automatic case publication** to other client users.
- **Duplicate detection** may *internally* suggest an existing matter, but must
  **not reveal hidden matters** to the client.
- The **confirmation response is generic and safe** ("received / under review"),
  never implying a legal matter has been opened.

---

## 9. Team / admin write boundary

- Client admin manages **only own-tenant** members; **no global user search**; **no
  other-client visibility**.
- **Invitations are scoped** to the current client/workspace/team; email domain
  alone does not grant access.
- Role changes are limited to **client-side roles** — cannot create an internal
  lawyer/admin role, cannot approve firm legal publication.
- **Audit every** invitation / role change / revocation.

---

## 10. Integration setup write boundary

- Connector setup is **client-scoped**; client admin may request/setup a connection
  only for the **current tenant**.
- **External credentials require a separate secure credential flow** — **no raw
  token in the normal form body** where avoidable.
- Connector stays **disabled/draft** until verified/approved; the selected **queue
  must be scoped**.
- Setup does **not expose external data** until the connection is enabled and intake
  policies configured; **outbound sync remains approval-gated**.

---

## 11. Anti-abuse and operational controls

- **Rate limits** per membership / client / IP / action.
- Max request/message length; max files/size.
- Spam/flood detection; **duplicate submission idempotency key** (§12).
- CSRF/session protection as applicable.
- Audit + **alert thresholds**; temporary **lockouts** for abuse.
- **Safe generic error messages** — no stack/debug details ever returned.

---

## 12. Idempotency and duplicate handling

- Client submissions support an **idempotency key** for safe retries.
- Duplicate **request** submission with the same key → does not create multiple
  intake items.
- Duplicate **upload completion** with the same key → safe (no duplicate row).
- Duplicate **message** submit with the same key → detected/deduped.
- Idempotency keys are **scoped to membership/client/action** — **no cross-client
  idempotency leakage** (a key from client A cannot collide with or reveal client
  B's state).

---

## 13. Write audit model (conceptual)

Events: `client_request_submitted`, `client_message_submitted`,
`client_document_upload_intent_created`, `client_document_uploaded`,
`client_document_upload_rejected`, `client_clarification_submitted`,
`client_invitation_created`, `client_membership_updated`,
`client_membership_revoked`, `client_integration_setup_requested`,
`client_write_rejected_validation`, `client_write_rejected_rate_limit`,
`client_write_rejected_scope`.

**Fields:** `eventId`; `clientId`; `workspaceId`/`teamId`; `membershipId`;
`actorType`; `actorId`; `action`; `targetType`; `targetId`; `submissionId`;
`timestamp`; `result`; `reasonCode`; `metadataRedacted`.

**Forbidden audit metadata:** raw file content; document content; full message body
if sensitive; passwords/tokens; raw connector credentials; raw storage URLs;
other-client data; secrets. (Audit records the *fact and shape* of the write and a
**reason code**, never sensitive payload values.)

---

## 14. Transition into internal workflow

| Submission | Internal effect |
| --- | --- |
| New request | portal intake / communication / triage item |
| Message | communication item linked to request/thread |
| Document upload | pending document-review item |
| Clarification | client-todo state update + internal review item |
| Invitation | pending invitation / membership state |
| Integration setup | internal connector setup review item |

**Important:** creating an internal workflow item does **not** mean client-visible
publication beyond the **submitting user's own safe confirmation**. Anything others
see must still pass the publication + approval + grant pipeline.

---

## 15. Non-enumerating write failures

- Writing to **another client's** request/document/message → same generic **not found**.
- Writing to an **unpublished/ungranted** target → same generic **not found**.
- Invalid membership/workspace → generic **invalid access**.
- **Invitation** to an existing/non-existing email → response avoids **account
  enumeration** (uniform "invitation sent if eligible").
- Upload target not found/ungranted → same **404**.
- Rate limit → generic safe message (no counts/timers that aid probing).

All failure causes are **indistinguishable** to the client; the real reason lives
only in internal audit.

---

## 16. UI implications (docs-only)

**Client Portal UI:**
- submit buttons show **received / pending-review** states;
- upload shows **"Beérkezett / ellenőrzés alatt"**, never "elfogadva";
- the message composer distinguishes a **client message** from a **lawyer response**;
- new-request confirmation **does not imply a legal matter is opened** until triage;
- team-invitation UI is **scoped**; integration setup shows **draft / pending-verification** states.

**Internal Adminiculum UI:**
- new-submissions queue; document-upload review queue; message/reply triage;
  connector-setup review; handoff to the **publication approval queue**.

No implementation — design constraints only.

---

## 17. Negative test matrix (future)

1. Unauthenticated write → rejected (**401**).
2. Inactive membership write → rejected.
3. User cannot submit a request for another `clientId` in the body (ignored/rejected).
4. Guessed `requestId` upload → non-enumerating **404**.
5. Upload cannot mark a document **accepted/final**.
6. Message cannot set `approved`/`published` fields.
7. New request cannot set internal priority/status.
8. Client admin cannot invite a user to another client.
9. Client admin cannot assign an internal lawyer role.
10. Integration setup cannot activate a connector without approval.
11. Raw `token` field rejected from a normal submission.
12. Duplicate idempotency key does not duplicate a message/request.
13. Rate limit works per client/membership/action.
14. Audit redacts sensitive content.
15. Write does **not** create a published artifact (unless an explicit later policy).
16. `workspaceId` in body not matching session membership → rejected.
17. Cross-client idempotency key isolation holds.

---

## 18. Relationship to future schema split

This design later informs: `ClientPortalSubmission` / portal intake models; upload
intent/`actionRef` models; client-originated message models; audit event models;
idempotency keys; rate-limit counters; and publication-workflow integration. But:
- **no schema is created now**;
- **CP-SCHEMA-1 remains blocked** by Prisma baseline/proof work;
- write-path implementation is **downstream** (a future CP-WRITE-PATH phase, after
  CP-SCHEMA-1 and the CP-PUBLICATION-SCHEMA phases); **CONNECTOR-SCHEMA-1** likewise
  remains blocked.

---

## 19. Open questions

1. Which client roles may **create a new request** in MVP — requester only, or all
   client roles?
2. Is a **standalone message** (no request link) allowed in MVP, or must every
   message attach to a visible request?
3. Idempotency key: client-supplied header vs server-issued submission token?
4. Upload: single-step (intent+upload) vs two-step (intent → PUT)? Malware-scan
   provider/placeholder decision.
5. Invitation flow: does the firm approve client-admin invitations, or is
   client-admin authority sufficient within the tenant?
6. What is the **rate-limit budget** per action, and where are counters stored
   (in-memory vs durable)?
7. Do client-originated messages need light **internal moderation** before appearing
   to *other* client users (vs immediate self-echo)?
8. Should a **generic confirmation** include a submission reference id (for support)
   without leaking internal state?

---

## 20. Recommended next prompt

> **Adminiculum — Client Portal submission-to-publication triage workflow design (docs-only).**
> Define how internal users triage client-originated submissions (new requests,
> messages, uploads, clarifications, invitations, integration setup) into internal
> objects and then into the publication approval queue — including triage states,
> who acts, duplicate/merge handling that never reveals hidden matters, the mapping
> from submission → internal object → proposed `ClientVisible*` artifact, and the
> negative test matrix. Keep it docs-only: no schema edits, no migrations, no
> routes, no runtime/auth change. Do not unblock CP-SCHEMA-1 / CONNECTOR-SCHEMA-1;
> note their baseline/proof prerequisites.

---

*Docs-only. No runtime, schema, migration, DB, auth, or client-portal-enablement
change. CP-SCHEMA-1 and CONNECTOR-SCHEMA-1 remain blocked.*
