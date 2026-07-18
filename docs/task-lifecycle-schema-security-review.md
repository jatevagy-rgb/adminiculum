# Task Lifecycle Schema Security Review

Date: 2026-07-18
Status: schema-only review complete; runtime authorization deferred

## Stored Data

The aggregate stores workflow metadata and potentially sensitive legal prose in `workSummary`, `remainingIssues`, `reviewerNote`, review `note`, and `requestedCorrections`. These fields require strict future DTO mapping and authorization.

The schema stores no:

- document or email body;
- `workspaceText`;
- extracted legal text;
- raw provider payload;
- local or SharePoint storage path;
- authentication token or secret;
- AI prompt or result;
- external-provider synchronization state.

Documents and versions are referenced by typed foreign keys only.

## Actor Integrity

- Creator, submitter, assigned reviewer, zero-time confirmer, external-completion actor, document-link creator, and actual decision reviewer are explicit user relations.
- Actor deletion is restricted so legal-history identity is not silently removed.
- The migration prevents submitter and assigned reviewer equality on submitted rows.
- Future review transactions must also compare the immutable decision reviewer with the submission submitter before insert.

## Future Authorization Requirements

Every future read or write must be auth-first and:

- task scoped;
- case/matter scoped;
- assigned-reviewer scoped for review actions;
- submitter/assignee scoped for draft and submission actions;
- protected against self-review, cross-case document links, and cross-matter time links.

Admin may access internal tasks but may not review their own submission. No `UserRole.CLIENT`, Client Portal identity, connector actor, or public client identifier may grant access.

## Exposure Boundary

This slice adds no routes, DTOs, OpenAPI paths, frontend imports, Client Portal exposure, feature flags, notifications, provider calls, or audit payloads. Existing APIs cannot serialize the new models accidentally because no runtime query references them.

## Dependency Audit

`npm audit --json` reports 19 existing findings: 1 critical, 7 high, 9 moderate, and 2 low. The exact same counts occur on the unchanged design base, and package/lock files did not change. No dependency repair was attempted in this schema slice.

## Security Result

No schema-level blocker was found for later internal runtime implementation. Runtime authorization and privacy-safe DTO tests remain mandatory before any API exposure.

Classification: `TASK_LIFECYCLE_SCHEMA_CANDIDATE_READY_FOR_RUNTIME_IMPLEMENTATION`
