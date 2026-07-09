# Documents Workspace Text Privacy Model

## Purpose

This document defines the **minimum privacy/security model** that must be satisfied
before `documents.workspaceText` could ever be considered for controlled **internal**
use. It is:

- **documentation-only** — a design/prerequisite specification, not an enablement;
- **not** a decision to enable `documents.workspaceText`;
- **not** a decision to move it to KEEP;
- **no runtime change**;
- **no schema change**;
- **no migration**;
- **no DB connection**;
- **no production apply**;
- **no CP-SCHEMA-1 authorization**;
- **no Client Portal enablement**;
- **no AI/provider call**;
- **no file processing**.

Core question it answers: *Under what conditions, if any, may Adminiculum store,
read, display, process, export, or send `documents.workspaceText`?*

Conservative default posture: **`documents.workspaceText` is `SECURITY/PRIVACY
BLOCKED`**; a production field existing does not prove privacy safety; authentication
alone does not prove legal-document privacy safety.

## Inputs

- `docs/documents-workspace-text-privacy-audit.md`
- `docs/production-schema-readonly-compare.md`
- `docs/present-compatible-keep-candidates-audit.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/partial-schema-drift-inventory.md`
- `docs/partial-schema-drift-triage.md`

Prior results referenced: `29ed3b9` (present-compatible), `c5a9bfc`
(document/AI routes auth-first / default-disabled), `cf61011` (privacy audit;
`SECURITY/PRIVACY BLOCKED`).

## Current status

- **Production metadata:** `documents.workspaceText` is **present-compatible**.
- **Current lane:** **`SECURITY/PRIVACY BLOCKED`**.
- **Document/AI privacy routes:** **default-disabled** (auth-first; legacy flags alone
  do not enable them; disabled routes do not reach services, Prisma writes, text
  extraction, file decode/download, prompt construction, redacted/rehydrated
  persistence, timeline writes, or AI/provider calls).
- **Client Portal:** disabled/quarantined.
- **Production apply and CP-SCHEMA-1:** blocked.
- **`documents.workspaceText` is not KEEP.**

## Data classification

`documents.workspaceText` must be classified at the **highest internal sensitivity**:

- **Raw legal document text** — verbatim working-copy content of legal documents,
  not a derived summary or metadata.
- **Likely personal data (GDPR)** — legal documents routinely contain names,
  addresses, identifiers of clients and third parties.
- **Possibly special-category / sensitive data** — may include health, financial,
  biometric, criminal, or other special-category data depending on the matter.
- **Attorney–client / legal-privilege sensitive** — disclosure risks waiver of
  privilege; must be treated as privileged by default.
- **Third-party data risk** — may contain data about non-clients (counterparties,
  witnesses) with no direct relationship to the accessing user.
- **High confidentiality** — firm-confidential work product.
- **Never safe as ordinary metadata** — it must **never** be treated like a benign
  scalar (e.g. `clients.color`); it is content, not a label.

**Consequence:** every rule below defaults to *deny*; access/processing is an
explicit, authorized, gated exception.

## Allowed and forbidden purposes

**Allowed internal purposes (only, and only once the prerequisites below are met):**
- internal legal document **workspace display** to an authorized user;
- internal **review/editing** support for an authorized user on an accessible case;
- internal **anonymization/redaction** workflow (as a first step *before* any
  further processing);
- internal **comparison/review** workflow (e.g. document compare) for authorized
  users.

**Forbidden purposes unless separately approved (each needs its own design + gate):**
- Client Portal display or any external-facing surface;
- public / unauthenticated API exposure;
- AI/provider processing (LLM prompts, embeddings, classification);
- external export or download outside the firm boundary;
- unrestricted / cross-case search indexing of raw text;
- analytics, metrics, or model training on raw text;
- logging, debug dumps, error payloads, or telemetry containing raw text;
- broad dashboard / list / case-list / search-result response inclusion.

## Authorization model

Minimum access model (all conditions, in order):

1. **Authentication first** — no anonymous access, ever.
2. **Document-level access required** — the user must be authorized for the specific
   document.
3. **Related case-level access required** — the document must belong to a **case the
   user can access**; case access is the primary need-to-know boundary.
4. **Belonging check** — the document must actually belong to the accessible case
   (no cross-case document/documentId reassociation).
5. **Manage/write access for mutation** — write/update/delete/clear require
   **manage** permission on the related case/document, not mere read access.
6. **No admin/partner blanket bypass** — an admin/partner role must **not** bypass
   need-to-know unless a separate, explicitly-designed and audited override exists;
   role ≠ automatic content access.
7. **No enumeration** — an ordinary authenticated user must not obtain arbitrary
   document text by guessing `documentId`/`caseId`; out-of-scope requests return a
   non-enumerating not-found.

Expected checks by operation:

| Operation | Required check |
| --- | --- |
| **read** raw text | authn + user can access the related case/document |
| **write/update** | authn + user can **manage** the related case/document |
| **delete/clear** | authn + user can **manage** the related case/document |
| **AI / process / export** | authn + manage/authorization **plus** a separate explicit privacy gate (and, for AI, approved anonymization/redaction first) |

## Mapper and response model

- **No broad list response** may include `workspaceText` (case lists, document lists,
  dashboards, search results, notifications, summaries).
- **No dashboard / search / case-list** response may include raw text.
- **Only an explicit internal document detail / workspace endpoint** may return
  `workspaceText`, and only to an authorized user (per the authorization model).
- **External / client-facing mappers must omit it** unconditionally (allow-list
  mapping; never spread the Prisma `document` row into an external DTO).
- **OpenAPI / public metadata** must **not** advertise raw-text endpoints unless the
  endpoint has been explicitly privacy-reviewed and gated.
- Default rule: `workspaceText` is **omitted** from every response unless a specific,
  reviewed, authorized endpoint deliberately includes it.

## Retention model

Required policy decisions **before** enablement (currently **unresolved** — must be
answered by a follow-up retention design):

- **Storage purpose** — why raw text is stored at all (working-copy editing) vs.
  whether a non-persistent/transient approach suffices.
- **Temporary vs durable** — is `workspaceText` a short-lived working buffer or a
  durable record? (Prefer the least-durable option that meets the purpose.)
- **Creation** — when it is written (which workflow), and whether creation is gated.
- **Clearing** — when it is cleared (workflow completion, explicit user action).
- **Overwrite** — whether it may be overwritten, and whether prior content is
  retained anywhere (it should not be).
- **Deleted document** — deleting/archiving a document **must** clear its
  `workspaceText` (no orphaned raw legal text).
- **Retention period** — a defined maximum retention, after which it is cleared.
- **Legal hold exception** — how legal hold overrides normal clearing (and how that
  is recorded without storing extra content).
- **Content-free audit trail** — retention/clearing events audited **without**
  storing the content itself.
- **GDPR / data-subject deletion** — how erasure requests propagate to
  `workspaceText` (it must be reachable and deletable for subject-rights and matter
  closure).

Until these are decided, raw text should not be durably relied upon.

## Logging and audit model

- **Never log raw `workspaceText`** — not in application logs, not at any level.
- **Never place raw text in error responses / stack traces / error payloads.**
- **Never include raw text in audit-log payloads** — audit records the *fact* of an
  action, never its content.
- **Never include raw text in test snapshots / fixtures.**
- **Never include raw text in telemetry / metrics / traces.**
- **Log only content-free metadata**: `documentId`, `caseId`, `userId`, `action`,
  `result`, `timestamp` — no content, no previews, no fragments.
- Redaction must be enforced server-side (not by convention); truncated "previews"
  of legal text are **not** an acceptable logging compromise.

## AI/provider model

- **No raw `workspaceText` may be sent to any AI/provider by default.**
- AI processing requires a **separate explicit feature gate** (distinct from the
  document workspace gate) that is **default-disabled**.
- **Anonymization/redaction must be applied and approved before** any provider call;
  raw legal text must not leave the firm boundary unredacted.
- **Provider / DPA / region / retention rules required** — data-processing agreement,
  data residency, provider retention/no-training guarantees must be reviewed and
  documented before enablement.
- **Prompt construction must avoid raw legal text** unless the above approvals and
  the explicit gate are satisfied.
- **Tests must prove** the disabled gate blocks all provider calls (no network call,
  no prompt built, no persistence) — consistent with the DOCUMENT-AI-HARDEN-1 posture.

## Export/download/SharePoint model

- **Raw workspace text must not be exported or uploaded by accident** — no implicit
  inclusion in exports, generated documents, or uploads.
- **Download/export routes** require an **explicit user action** *and* document
  authorization (per the authorization model), and must be individually reviewed.
- **SharePoint upload** requires a **separate integration authorization and privacy
  model** (external storage boundary, retention, access) before any raw text leaves
  the DB boundary.
- **Generated documents/contracts must not silently include** `workspaceText`;
  inclusion, if ever needed, must be explicit and reviewed.

## Client Portal/external visibility model

- **`workspaceText` is internal-only by default.**
- It must **never** be Client Portal–visible without a **separate external mapper +
  privacy review** (and it is expected to remain excluded).
- Any external-facing summary must be **separately generated and sanitized** — never
  the raw workspace text.
- Client-facing documents must be **explicit, approved documents**, not raw internal
  workspace text.
- This aligns with the Client Portal publication/DTO boundary: raw internal content
  is never published; only approved, allow-listed artifacts are.

## Feature gate model

- The existing **Document/AI privacy gate remains default-disabled**; this model does
  not change it.
- **Legacy flags alone must not enable** raw-text read/write paths (per c5a9bfc).
- Future enablement of internal workspace-text use requires an **explicit privacy-model
  feature flag**, default-off, separate from legacy flags.
- **AI/provider, export, and SharePoint each need their own separate gate/sub-gate** —
  enabling workspace display must not implicitly enable processing or export.
- **Non-bypass rule:** no combination of legacy flags, roles, or existing gates may
  reach raw text without the explicit privacy-model gate.
- **Tests must prove** disabled gates prevent service calls **and** DB writes.

## Future test requirements

Before any runtime enablement, the following test categories must exist and pass:

- unauthenticated request → rejected (401);
- wrong-case / wrong-document (out-of-scope) → rejected (non-enumerating not-found);
- authorized read allowed **only** through the explicit document-workspace endpoint;
- broad lists / dashboards / search / case-lists **omit** `workspaceText`;
- external / Client Portal mappers **omit** `workspaceText`;
- disabled feature gate prevents read/write/service calls (no service reached, no DB
  write);
- **no AI/provider call** when the AI gate is disabled (no network, no prompt, no
  persistence);
- **no raw text in logs/errors** (redaction verified);
- delete/clear + retention behavior tested (deleting a document clears its text);
- mutation requires **manage** permission (read-only user cannot write/clear).

## Required next packages

**Recommended immediate next package: `DOCUMENTS-WORKSPACE-TEXT-AUTHZ-HARDEN-1`.**

Rationale: the privacy audit (`cf61011`) found direct text read/write paths that,
while default-disabled behind the Document/AI privacy gate, are **present and
potentially reachable if enabled**, and there is a real risk of raw text leaking into
broad list/detail responses. Hardening **document/case-level read/write authorization**
and **ensuring broad lists omit `workspaceText`** — with tests for authz and
no-broad-leakage — is valuable **defense-in-depth to complete first**, independent of
any enablement decision. This is preferred over the retention design because the
primary near-term exposure surface is *reachable-if-enabled routes + broad-response
inclusion*, not solely retention modeling.

**Later packages, in safe order:**
1. `DOCUMENTS-WORKSPACE-TEXT-AUTHZ-HARDEN-1` — runtime hardening for document/case-level
   read/write access; ensure broad lists omit `workspaceText`; authz + no-leak tests.
2. `DOCUMENTS-WORKSPACE-TEXT-RETENTION-DESIGN-1` — clearing/retention/legal-hold design
   (docs-first).
3. `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-1` — ensure raw text never logged, returned
   in errors, or captured in snapshots.
4. `DOCUMENTS-WORKSPACE-TEXT-AI-GATE-REVIEW-1` — verify AI/provider path cannot consume
   raw text unless a future explicit privacy gate + anonymization rules are satisfied.
5. Only after all the above: possible `DOCUMENTS-WORKSPACE-TEXT-INTERNAL-CANDIDATE-REVIEW-1`
   — **still not KEEP**; a review of whether controlled internal use may be considered.

`documents.workspaceText` remains **`SECURITY/PRIVACY BLOCKED`** throughout; none of
these packages authorizes enablement, KEEP status, production apply, CP-SCHEMA-1, or
Client Portal.

## Non-actions

- no schema changed;
- no migration created;
- no DB connection;
- no DB apply;
- no business data read;
- no Azure deployment / app-setting change;
- no runtime behavior changed;
- no route behavior changed;
- no OpenAPI / CORS behavior changed;
- no frontend changed;
- no tests changed;
- no Client Portal enabled;
- no AI/provider call;
- no file processing;
- no SharePoint call.

---

## Implementation progress

- `DOCUMENTS-WORKSPACE-TEXT-AUTHZ-HARDEN-1` implemented the authorization/exposure
  hardening portion of this model: the gated raw-text read
  (`GET /documents/:id/text`) now requires **document/case read access**; the gated
  write (`POST /documents/:id/save-workspace-version`) now requires **case manage
  access** (reusing the existing case authorization rules); both remain auth-first and
  behind the default-disabled Document/AI gate; broad list/detail/search responses
  already omit raw text via explicit DTOs (verified by tests). Retention, logging,
  AI/provider, export/SharePoint, and Client Portal/external blockers remain
  **unresolved** and are still `SECURITY/PRIVACY BLOCKED`.

## Authorization hardening closeout — DOCUMENTS-WORKSPACE-TEXT-AUTHZ-HARDEN-1

- **Commit:** `d3f6bea`.
- **Runtime change:** narrow backend authorization/exposure hardening only.
- **Schema / migration / DB / Azure / Client Portal / Document-AI flag / AI-provider /
  SharePoint / file-processing changes:** none.
- **Raw-text code paths confirmed** (the only two in the codebase):
  - `GET /documents/:id/text`
  - `POST /documents/:id/save-workspace-version`
- **Broad DTOs confirmed to omit `workspaceText`:**
  - `getCaseDocuments`
  - `searchDocuments`
  - `getDocumentById`
  - case-detail
- **Read route (`GET /:id/text`):** remains auth-first; remains behind the
  default-disabled Document/AI gate; **now requires document/case read access**
  (assigned lawyer / creator / privileged role / collaborator on the owning case).
- **Write route (`POST /:id/save-workspace-version`):** remains auth-first; remains
  behind the default-disabled Document/AI gate; **now requires case manage access**.
- **Non-enumeration:** missing / out-of-scope documents return **404**; ordinary
  authenticated users cannot read/write arbitrary document text by id; no raw text
  appears in responses, errors, or logs.
- **Route order:** `401 unauth` → `501 gate off` → `404 missing` → `403 no access` →
  handler.
- **Tests:** `documentsWorkspaceTextAuthz` — **11/11 passed**.
- **Full backend:** **17 suites / 183 tests passed**.

### Decision posture (unchanged blocked lane)

- Current lane remains **`SECURITY/PRIVACY BLOCKED`** — **authz-hardened but still
  privacy-blocked**.
- **Not** KEEP. **Not** Client Portal. **Not** external visibility. **Not**
  AI/provider approved. **Not** export/SharePoint approved. **Not** retention-approved.
  **Not** CP-SCHEMA-1. **Not** production apply.

### Remaining blockers (before any internal-candidate review)

- retention policy **not implemented**;
- logging guard **not separately proven**;
- AI/provider gate review **not complete**;
- export/download/SharePoint model **not implemented**;
- Client Portal / external mapper **not designed**;
- **no human decision** for internal candidate review.

### Next package

- `DOCUMENTS-WORKSPACE-TEXT-RETENTION-DESIGN-1` (clearing / retention / legal-hold
  design), then logging guard, AI-gate review, export/SharePoint review, and only
  after all of those a **not-KEEP** internal-candidate review.

## Retention design follow-up — DOCUMENTS-WORKSPACE-TEXT-RETENTION-DESIGN-1

- `DOCUMENTS-WORKSPACE-TEXT-RETENTION-DESIGN-1` created
  `docs/documents-workspace-text-retention-design.md`.
- **Retention is designed only; not implemented.** Conservative default: raw
  `workspaceText` stays blocked; future default should be **ephemeral/short-lived
  (Option D/A), not durable**, unless a separate explicit human decision selects
  durable storage.
- Lane remains **`SECURITY/PRIVACY BLOCKED`**. **No KEEP / enablement authorized.**
- Recommended immediate next package: `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-DESIGN-1`.

## Logging guard follow-up — DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-DESIGN-1

- `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-DESIGN-1` created
  `docs/documents-workspace-text-logging-guard-design.md`: metadata-only logging,
  content-free error responses, content-free audit events, telemetry/no-payload
  rules, synthetic-only test model, and AI/export/external logging boundaries.
- **Logging guard is designed only; not implemented.** Lane remains
  **`SECURITY/PRIVACY BLOCKED`**; **no KEEP / enablement authorized**.
- Recommended immediate next package: `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-IMPLEMENTATION-1`.

- **Update:** `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-IMPLEMENTATION-1` implemented the
  guard: `safeWorkspaceTextLogContext` (`Backend/src/modules/documents/logging.ts`)
  now logs content-free metadata only, and the two raw-text routes' catch blocks no
  longer log the raw error object; tests prove no synthetic raw text appears in error
  responses or `console.error` output (`documentsWorkspaceTextAuthz` 13/13). Lane
  remains **`SECURITY/PRIVACY BLOCKED`**; **not KEEP**; retention/AI/export/external
  blockers unchanged.

## AI/provider gate review — DOCUMENTS-WORKSPACE-TEXT-AI-GATE-REVIEW-1

- `DOCUMENTS-WORKSPACE-TEXT-AI-GATE-REVIEW-1` reviewed and regression-proofed the
  AI/provider/prompt gate boundary. **No AI/provider call was made; no provider
  credential added; no feature flag enabled in production code.**
- **Inventory result:** the backend contains **no in-code AI provider client**
  (no OpenAI/Anthropic SDK call). The single prompt-construction path is
  `anonymizeDocument`'s `aiReadyPrompt` (`Backend/src/modules/anonymize/services.ts`),
  which is built **only from anonymized/redacted content** and is gated by
  `ENABLE_AI_ANONYMIZATION && ENABLE_DOCUMENT_AI_PRIVACY_MODEL`. Raw
  `documents.workspaceText` is read in **exactly two** routes
  (`GET /documents/:id/text`, `POST /documents/:id/save-workspace-version`), both
  gated by `ENABLE_DOCUMENT_PROCESSING && ENABLE_DOCUMENT_AI_PRIVACY_MODEL`,
  auth-first then authz.
- **No path wires raw `workspaceText` into prompt construction or a provider
  call.** The documents router imports no anonymize/prompt/provider module; the
  workspace routes forward text to neither the prompt builder nor any AI service.
  No hardening was required beyond regression proof (narrowest safe change).
- **Regression proof:** `Backend/tests/documentsWorkspaceTextAiGate.test.ts`
  (synthetic marker only) asserts: gate-off → the workspace read/write routes and
  the anonymize/prompt route return content-free 501 and the prompt/provider path
  is never invoked; legacy flags alone do not open the workspace→prompt path; even
  fully enabled (test-only) the workspace save path never invokes the AI/prompt
  path with raw text and never echoes/logs the marker; and the documents router
  statically imports no provider/anonymize/prompt module.
- Lane remains **`SECURITY/PRIVACY BLOCKED`**. **No AI/provider use is
  authorized.** This does **not** authorize KEEP, CP-SCHEMA-1, production apply,
  Document/AI enablement, Client Portal, export/SharePoint, or retention
  implementation. Any future AI use requires an explicit human privacy decision,
  anonymization/redaction rule, a provider DPA/region/retention model, and tests.

---

*Documentation-only privacy/security design. `documents.workspaceText` remains
`SECURITY/PRIVACY BLOCKED`. This model defines prerequisites only; it does not
authorize enablement, KEEP, production apply, CP-SCHEMA-1, or Client Portal.*
