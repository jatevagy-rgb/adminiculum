# Architecture AI and n8n Boundary

## Purpose

This boundary applies to workflow-core features that may later interact with automation or AI tooling. It records what is allowed now and what requires a future security/design ticket.

## Current Rule

Adminiculum backend remains the source of truth for workflow state. n8n, AI providers, calendar systems, email systems, and connector workers must not write directly into production business tables or infer legal workflow state without an approved backend API contract.

`DOCUMENT-EDITOR-REVIEW-COMMENTS-QUALITY-HARDENING-1` complies with this boundary: no AI review/comment/redline generation, no editor-state automation, no n8n persistence, and no direct database automation were introduced.

## Allowed Now

- Backend-owned deterministic logic over persisted fields.
- Internal route handlers that validate auth, permissions, payload shape, and feature gates.
- Content-minimal events/notifications that reference existing internal routes.
- Documentation of future automation boundaries.

## Not Allowed Without Future Approval

- AI extraction of deadlines from free text.
- AI classification of legal significance or urgency.
- n8n direct writes to Prisma/PostgreSQL tables.
- External calendar/Teams/email delivery for deadlines.
- Provider sync claims without implemented provider integration.
- Raw document text, communication bodies, prompts, or AI outputs in generic notification/audit payloads.

## Future Automation Pattern

A future automation must call a hardened backend endpoint, not the database. The endpoint must enforce authentication, authorization, feature flags, tenant/client boundaries where relevant, validation, idempotency, and content minimization.

## WORKFLOW-CORE-RESPONSIBILITY-WORKLOAD-TIME-1 Reference

The responsibility/workload/time pass stays inside the existing AI/n8n boundary: no AI staffing, no n8n automation, no passive tracking, no external calendar/team/email connector, and no automatic assignment or reassignment. It uses authenticated internal case/task/time persistence only.

## Cross-reference: WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1

The litigation/case-lifecycle package (`docs/workflow-core-litigation-case-lifecycle-1.md`)
complies with this boundary: it introduces no AI API/SDK, no AI legal analysis, no
AI-created claims/issues/evidence/deadlines, and no n8n ownership or DB access. The
Node/Express backend remains the source of truth. Static guards in
`Backend/tests/litigationCaseLifecycleStaticGuards.test.ts` assert the litigation/
lifecycle source imports no AI provider and no n8n, and encodes no legal-merits/outcome
scoring. Any future AI assistance must use the separately approved manual AI work-package
model with human review.

## Cross-reference: WORKFLOW-CORE-INTAKE-MATTER-OPENING-1

The intake/matter-opening package (`docs/workflow-core-intake-matter-opening-1.md`) complies
with this boundary: no AI API/SDK, no AI client matching, no AI conflict checking or
clearance, no AI case classification or risk scoring, no AI-created matters/tasks/deadlines
without human confirmation, and no n8n ownership of intake, clients, cases, conflict review,
assignments, or opening state. Conflict review is truthfully UNAVAILABLE (no persistence
exists) and is never decided automatically. Static guards in
`Backend/tests/intakeMatterOpeningStaticGuards.test.ts` assert the intake surface imports no
AI provider, no n8n, no external CRM/identity/screening service, and contains no automatic
merge/clearance/activation logic.

## Cross-reference: DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1

The professional contract editor (`docs/document-editor-pro-contract-workbench-1.md`) complies
with this boundary: no AI API/SDK, no AI clause generation, no AI contract analysis, no AI
automatic document modification or review approval, no AI automatic database writes, and no
n8n document-state ownership, editor persistence, or direct database access. The editor runs
in export-only session mode (no server content persistence at all) and may later become a
*source* for the separately approved manual AI work-package flow — no AI integration exists in
it. Static guards in `Backend/tests/documentEditorProStaticGuards.test.ts` assert the editor
surface imports no AI provider, no n8n, no external conversion SaaS, and no realtime
collaboration service.

## Document editor persistence readiness cross-reference

DOCUMENT-EDITOR-PERSISTENCE-VERSIONING-READINESS-1 preserved Mode C and added no AI/n8n role in editor persistence. Future document persistence remains owned by Adminiculum backend storage/contracts only; n8n must not own editor state, versions, audit, restore, or conflict resolution.

## DOCX interoperability cross-reference

DOCUMENT-EDITOR-DOCX-INTEROPERABILITY-TEMPLATE-BRIDGE-1 keeps DOCX conversion local to the browser and does not introduce AI, n8n, external conversion services, document persistence ownership, or automatic document modification.

## Template Assembly Compliance Reference

`DOCUMENT-EDITOR-TEMPLATE-ASSEMBLY-CLAUSE-CATALOG-1` is compliant with this boundary: no AI API/SDK, AI template selection, AI clause generation, AI variable resolution, n8n workflow, n8n persistence, external conversion service, or automatic database write was added.
