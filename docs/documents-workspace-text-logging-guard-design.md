# Documents Workspace Text Logging Guard Design

## Purpose

This document defines the **logging, error-response, audit-payload, telemetry, and
test-snapshot guard model** required before `documents.workspaceText` could ever be
considered for controlled **internal** use. It is:

- **documentation-only** — a design/prerequisite specification, not implementation;
- **not** a decision to enable `documents.workspaceText`; **not** a KEEP decision;
- **no runtime change**; **no schema change**; **no migration**; **no DB connection**;
- **no production apply**; **no CP-SCHEMA-1 authorization**; **no Client Portal
  enablement**; **no AI/provider call**; **no file processing**.

Core principle: **raw legal document text must never be logged, returned in errors,
stored in audit payloads, emitted as telemetry, or committed in tests/snapshots.**

## Inputs

- `docs/documents-workspace-text-privacy-audit.md`
- `docs/documents-workspace-text-privacy-model.md`
- `docs/documents-workspace-text-retention-design.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/present-compatible-keep-candidates-audit.md`

## Current status

- **Current lane:** **`SECURITY/PRIVACY BLOCKED`**.
- **Authz-hardened** (`d3f6bea`): raw-text read requires document/case read access;
  write requires case manage access; both auth-first and behind the default-disabled
  Document/AI gate.
- **Retention-designed** (`c136a34`): retention/deletion/legal-hold designed, **not
  implemented**; conservative default is ephemeral/short-lived, not durable.
- **Logging guard:** designed here, **not implemented**.
- **Not KEEP**; production apply and CP-SCHEMA-1 blocked; Client Portal disabled.

## Logging classification

`documents.workspaceText` is **forbidden log content**:
- **raw legal text** — verbatim working-copy content;
- **likely personal data (GDPR)** — possibly special-category;
- **privileged / confidential** — attorney–client privileged, firm-confidential;
- **never loggable, even in debug mode** — no environment or log level ever permits
  raw text in logs.

## Server logging rules

- **Never log raw `workspaceText`.**
- **Never log snippets / previews / diffs** of it.
- **Never log request bodies** that may contain it (the write route body carries raw
  text).
- **Never log Prisma payloads** (query args / results) containing it.
- **Never log caught errors with embedded raw content** (log the error *code/type*,
  not an object that may serialize the text).
- Logs may include **only content-free metadata**:
  `action`, `result`, `documentId`, `caseId`, `actorId`, `timestamp`, `gate status`,
  `error code`.

Implementation guidance (for a future package): the current write route uses
`console.error('Save workspace version error:', error)` — the `error` object does not
contain `workspaceText` today, but a future logging-guard implementation should ensure
error logging never serializes the request body or the document row, and should prefer
`{ code, documentId, caseId }` over raw error/object dumps.

## Error response rules

- **No raw text in error messages.**
- **No document snippets in validation errors.**
- **No stack traces in API responses.**
- **Non-enumerating 404** is allowed (already used for missing/out-of-scope documents).
- **403 / 501 must be content-free** (feature-unavailable and access-forbidden bodies
  carry codes/messages, never content).
- Validation should say e.g. **"invalid workspace text payload"**, never echo the
  submitted content (the existing write route already returns a generic
  `VALIDATION_ERROR` message without echoing the text).

## Audit event model

Content-free audit events (conceptual; not implemented here):
- `workspace_text_read_attempted`
- `workspace_text_read_allowed`
- `workspace_text_read_denied`
- `workspace_text_update_attempted`
- `workspace_text_update_allowed`
- `workspace_text_update_denied`
- `workspace_text_cleared`
- `workspace_text_retention_expired`
- `workspace_text_legal_hold_placed`
- `workspace_text_legal_hold_released`

Allowed audit event fields:
`actorId`, `documentId`, `caseId`, `action`, `result`, `reasonCode`, `timestamp`,
`gate state`, `retention/hold state`.

## Forbidden audit / log fields

Never present in any log, error, or audit payload:
- raw text; snippets; diffs; prompt content; extracted content; file content;
- generated summaries (unless separately approved as a distinct, sanitized artifact).

## Telemetry and monitoring model

- Metrics may **count events and record durations only**.
- **No raw text in traces/spans.**
- **No raw text in exception attributes.**
- **No payload capture** for raw-text routes.
- **No request-body capture** for the read/write raw-text routes (`GET
  /documents/:id/text`, `POST /documents/:id/save-workspace-version`).

## Test and snapshot model

- **Only synthetic placeholder text** is allowed — e.g.
  `SYNTHETIC_WORKSPACE_TEXT_DO_NOT_LOG` (already the convention in
  `Backend/tests/documentsWorkspaceTextAuthz.test.ts`).
- **No real legal text**; **no copied client documents**.
- **No snapshots containing raw text.**
- Tests should **assert omission / redaction** (e.g. response/log does not contain the
  synthetic marker), **not** compare a full raw body.

## AI/provider logging relation

- **AI use remains unauthorized.**
- **Prompt logging must be disabled/controlled** before any AI use.
- **Provider logs / training / prompt cache** require a **separate DPA / region /
  retention** review.
- **Internal prompt-construction logs must not include raw text.**

## Export/SharePoint logging relation

- **Export / SharePoint logs must not include raw workspace text.**
- Upload/download logs may include **IDs and status only**.
- **Generated-document logs must not include content.**

## Client Portal/external logging relation

- **Client Portal remains disabled.**
- **No external error/audit/log payload** may include raw text.
- The external mapper (if ever built) must **omit** raw text; external surfaces get a
  separately-generated, sanitized artifact only.

## Future implementation requirements

A future logging-guard implementation package should:
- **search all logging / error / audit paths** touching `workspaceText`;
- **replace any content logging** with metadata-only logs;
- **add tests** proving no raw text appears in errors / log mocks (where practical);
- add a **lint/helper rule** if feasible (e.g. forbid logging document rows / request
  bodies on raw-text routes);
- add an **explicit safe audit-event mapper** (content-free by construction);
- add **negative tests** for raw text not appearing in broad responses and errors
  (extending the existing `documentsWorkspaceTextAuthz` no-raw-text assertions).

## Remaining blockers

After this logging-guard **design**, the following remain **unresolved**:
- **logging-guard implementation / proof**;
- **retention implementation** (only if durable storage is ever allowed);
- **AI/provider gate review**;
- **export/SharePoint review**;
- **external / Client Portal mapper exclusion**;
- **explicit human privacy decision**;
- `documents.workspaceText` is **still not KEEP**.

## Required next packages

**Recommended immediate next package: `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-IMPLEMENTATION-1`.**

Rationale: unlike retention (whose conservative default is ephemeral/short-lived, so
there is little durable state to build cleanup for while the field stays blocked), the
logging-guard is a **low-risk, runtime-verifiable** safety net that applies to the
**already-present** raw-text routes **regardless** of enablement — a stray log/error
serialization could leak raw legal text even under the current default-disabled state
if the gate were ever toggled. Implementing metadata-only logging + negative tests
(no raw text in logs/errors) is a concrete, self-contained hardening that strengthens
the existing authz work without enabling anything.

If the team prefers to defer runtime work and continue design-only, the alternative
next package is `DOCUMENTS-WORKSPACE-TEXT-AI-GATE-REVIEW-1` (design-only review of the
AI/provider path). Conservative recommendation: do the **logging-guard implementation**
next, because it closes a real accidental-leak surface with a small, testable change.

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
- no Document/AI flag enabled;
- no AI/provider call;
- no file processing;
- no SharePoint call.

---

## Implementation — DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-IMPLEMENTATION-1

- `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-IMPLEMENTATION-1` implemented the runtime/test
  proof for content-free logging/error behavior on the two raw-text routes.
- Added `Backend/src/modules/documents/logging.ts` (`safeWorkspaceTextLogContext`) which
  logs only content-free metadata (`action`, `result`, `documentId`, `caseId?`,
  `actorId?`, error **name** and, for known Prisma errors, error **code**) — never the
  raw error object, `error.message`, `error.meta`, stack, request body, or Prisma
  payload.
- Rewired the catch blocks of `GET /documents/:id/text` and
  `POST /documents/:id/save-workspace-version` to log via that helper instead of the
  raw `error` object. Error responses remain content-free (generic messages, no
  echoed content, no stack traces).
- Tests (`documentsWorkspaceTextAuthz`, now **13/13**): a forced write failure — with a
  plain `Error` and with a `PrismaClientKnownRequestError` whose message/params contain
  the synthetic marker — asserts the synthetic raw text appears in **neither the 500
  response body nor any `console.error` argument**, while content-free metadata
  (`workspace_text_update`, `P2002`) is still logged. Prior authz/no-leak tests
  preserved.
- Lane remains **`SECURITY/PRIVACY BLOCKED`**. This does **not** authorize KEEP,
  CP-SCHEMA-1, production apply, Document/AI enablement, Client Portal, AI/provider use,
  export, SharePoint, or retention implementation.

---

*Documentation-only logging/audit guard design. `documents.workspaceText` remains
`SECURITY/PRIVACY BLOCKED`. The logging guard runtime/test proof is now implemented
(metadata-only logging on the raw-text routes); retention/AI/export/external blockers
remain. This does not authorize enablement, KEEP, production apply, CP-SCHEMA-1, or
Client Portal.*
