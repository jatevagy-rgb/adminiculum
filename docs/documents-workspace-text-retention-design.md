# Documents Workspace Text Retention Design

## Purpose

This document defines the **retention / deletion model** required before
`documents.workspaceText` could ever be considered for controlled **internal** use.
It is:

- **documentation-only** — a design/prerequisite specification, not implementation;
- **not** a decision to enable `documents.workspaceText`;
- **not** a decision to move it to KEEP;
- **no runtime change**; **no schema change**; **no migration**; **no DB connection**;
- **no production apply**; **no CP-SCHEMA-1 authorization**; **no Client Portal
  enablement**; **no AI/provider call**; **no file processing**.

Core question it answers: *If Adminiculum stores raw legal document text in
`documents.workspaceText`, under what retention, deletion, clearing, audit,
legal-hold, and GDPR rules may it exist?*

Conservative default posture: **`documents.workspaceText` remains
`SECURITY/PRIVACY BLOCKED`**; raw legal text should be **minimized** and should
**not** be retained indefinitely by default.

## Inputs

- `docs/documents-workspace-text-privacy-audit.md`
- `docs/documents-workspace-text-privacy-model.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/present-compatible-keep-candidates-audit.md`

## Current status

- **Production metadata:** present-compatible.
- **Current lane:** **`SECURITY/PRIVACY BLOCKED`**.
- **Raw-text routes authz-hardened** by `d3f6bea` (read requires document/case read
  access; write requires case manage access; both auth-first and behind the
  default-disabled Document/AI gate).
- **Document/AI privacy routes:** default-disabled.
- **Client Portal:** disabled/quarantined.
- **Production apply and CP-SCHEMA-1:** blocked.

## Retention classification

`documents.workspaceText` carries the **highest retention risk**:

- **raw legal text** — verbatim working-copy content, not derived metadata;
- **personal data likely (GDPR)** — names/addresses/identifiers of clients and
  third parties; possibly special-category data;
- **privileged / confidential** — attorney–client privileged and firm-confidential;
- **high retention risk** — durable storage of raw legal text expands breach,
  discovery, subject-rights, and privilege-waiver exposure;
- **should be minimized** — store the least content for the shortest time that meets
  a defined purpose;
- **should not be retained indefinitely by default** — indefinite durable retention
  is not an acceptable default.

## Storage purpose

**Allowed storage purposes (only, and only once all prerequisites are met):**
- **temporary** internal workspace text for document **review/editing** by an
  authorized user;
- **temporary** extracted/derived text for internal review;
- internal **comparison/review** workflows, only if authorized;
- **never** ordinary searchable metadata.

**Prohibited storage purposes unless separately approved (each needs its own design):**
- analytics / model training;
- unrestricted / cross-case search index;
- Client Portal content;
- AI prompt cache;
- debug payload;
- a permanent backup substitute;
- an external export source.

## Creation rules

`documents.workspaceText` may be created **only**:
- by an **explicit internal route/workflow** (currently `POST /documents/:id/save-workspace-version`);
- **behind the Document/AI privacy gate** (default-disabled);
- with **document/case authorization**;
- when the **source document belongs to an accessible case**;
- when the user has **manage permission** for the write;
- **no automatic population from upload** unless separately designed and approved.

(These creation preconditions are already enforced at the authz/gate layer by
`d3f6bea`; retention adds the lifecycle-after-creation rules below.)

## Retention options considered

- **Option A — session/short-lived only:** cleared after a small N (hours/days) or on
  workflow completion. Low retention risk; simple lifecycle.
- **Option B — case-workspace temporary:** cleared on case closure or N days after
  last edit. Moderate risk; needs closure/expiry mechanics.
- **Option C — durable internal annotation/workspace:** persists as a durable record.
  **Requires a stronger legal basis + retention policy + strong controls**; highest
  risk.
- **Option D — do not store raw text in DB; ephemeral processing only:** text is held
  only transiently in memory during a request/workflow, never persisted. Lowest
  retention risk.

**Selected conservative default:**
- Because **no human decision exists**, raw `documents.workspaceText` **remains
  blocked**.
- The **future default should be ephemeral/short-lived (Option D, or Option A if
  persistence is unavoidable)** — **not** durable (Option C).
- Durable storage (Option C) may be considered **only** after an explicit human legal
  decision, a documented retention policy, and the full downstream controls (logging
  guard, AI gate, export/SharePoint, external exclusion). Until then, treat any stored
  `workspaceText` as **transient and clearable**, never a system of record.

## Clearing and deletion triggers

Required clearing/deletion triggers (for a future implementation):
- **explicit user clear action**;
- **document deletion** → clears its `workspaceText` (no orphaned raw legal text);
- **document replacement / new version** when the raw text is no longer needed;
- **case closure** after the defined retention period;
- **retention expiry** (time-based);
- **GDPR erasure request** where applicable and legally allowed (subject to legal
  hold);
- **client / matter deletion or archive** workflow;
- **failed extraction/anonymization cleanup** (no residual raw text left behind);
- **aborted upload / workspace processing cleanup**.

Clearing must remove the content from the **live system** and record a content-free
audit event (below); see the backup caveat for backup windows.

## Legal hold model

- A **legal hold may suspend deletion** of `workspaceText` for the held document/case.
- Legal hold must be **explicit and auditable** (not implicit).
- The **legal-hold audit must not include raw content** — only reason (code/short
  redacted note), actor id, timestamp, and `caseId`/`documentId`.
- Placing a hold records: reason, actor, timestamp, case/document ids.
- **Releasing** a legal hold **resumes the retention timer** (and any pending
  deletion may then proceed).

## Audit model

Retention/deletion events are audited **content-free**:
- events: workspace text **created / updated / cleared / deleted / hold-placed /
  hold-released / retention-expired**;
- fields: `actorId`, `documentId`, `caseId`, `timestamp`, `action`, `result`,
  `retention/hold status`;
- **must not store**: raw text, snippets, diffs, prompt content, extracted content,
  or any preview of legal text.

## Backup / PITR caveat

- Production **backups / PITR may retain deleted raw text temporarily** (the DB
  restore point predates the deletion).
- The retention policy must **document the backup/PITR window**.
- **User-facing deletion means live-system deletion** unless backup erasure is
  technically feasible; backups age out per the platform's backup-retention window.
- Internal legal/privacy documentation must **disclose this backup limitation**
  (deletion is not instantaneous in backups).

## Logging / telemetry relation

- This retention design **requires a logging guard** (separate package).
- **Raw text must not enter logs / errors / telemetry**, ever.
- **Clearing/deletion must not log content** (only content-free metadata).
- Future implementation should add tests proving **no raw text in logs/errors**.

## AI/provider relation

- **This retention design does not authorize AI/provider use.**
- If AI ever consumes the text, **provider retention must be separately governed**
  (provider log retention, no-training opt-out, prompt-cache handling).
- Raw text sent externally requires a **separate DPA / region / retention** model.

## Export/SharePoint relation

- **Clearing `workspaceText` does not necessarily delete exported files** — exports
  are separate artifacts.
- **Export / SharePoint must have their own retention rules.**
- Raw workspace text **must not silently become exported content**.

## Client Portal / external relation

- `workspaceText` is **internal-only**.
- **No Client Portal retention rule** exists because **no Client Portal exposure is
  authorized**.
- Any external display requires a **separately generated, sanitized artifact** with
  its **own** retention lifecycle — never the raw workspace text.

## Future implementation requirements

Before enablement, a future implementation would need:
- retention fields **or** a policy source (only if durable storage is ever allowed);
- a clear endpoint or service behavior for explicit clearing (if needed);
- a scheduled cleanup job (only if durable storage is allowed);
- tests for **deletion triggers**;
- tests for **legal hold** (suspend/resume);
- tests that **document deletion clears `workspaceText`**;
- tests for **retention expiry**;
- tests for **content-free audit events**;
- tests for **no raw text in logs/errors**.

## Remaining blockers

After this retention design, the following remain **unresolved**:
- **logging guard** implementation;
- **retention implementation** (only if durable storage is ever allowed);
- **AI/provider gate review**;
- **export/SharePoint review**;
- **external / Client Portal mapper exclusion**;
- **explicit human privacy decision**;
- `documents.workspaceText` is **still not KEEP**.

## Required next packages

**Recommended immediate next package: `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-DESIGN-1`.**

Rationale: the conservative default here is **ephemeral/short-lived (Option D/A), not
durable** storage, so a heavyweight retention *implementation* is **not** the next
step — there is little durable state to schedule cleanup for while the field stays
blocked. The nearest remaining exposure risk is **raw text leaking into logs / errors
/ telemetry**, which applies regardless of retention duration. Therefore the logging
guard design should come first.

If a human decision later selects **durable storage (Option C)**, then instead
sequence `DOCUMENTS-WORKSPACE-TEXT-RETENTION-IMPLEMENTATION-DESIGN-1` (retention
fields, clear service, scheduled cleanup, hold mechanics, and the associated tests)
before the logging guard implementation.

Later packages, in safe order: logging guard → AI-gate review → export/SharePoint
review → external/Client-Portal exclusion → a **not-KEEP** internal-candidate review.

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

*Documentation-only retention/deletion design. `documents.workspaceText` remains
`SECURITY/PRIVACY BLOCKED`. Retention is designed only, not implemented. This does not
authorize enablement, KEEP, production apply, CP-SCHEMA-1, or Client Portal.*
