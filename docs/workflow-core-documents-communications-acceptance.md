# Workflow Core Documents / Communications Acceptance

## Acceptance Checklist

- [x] Case activity endpoint exists and is authenticated.
- [x] Activity endpoint returns tasks, document metadata, communication metadata, and timeline metadata.
- [x] Activity endpoint clamps `limit` to `50`.
- [x] Activity endpoint uses explicit scalar selects and avoids broad includes.
- [x] Work-items endpoint includes safe document and communication entries.
- [x] Document source task creation derives `caseId` and `documentId` server-side.
- [x] Communication source task creation derives `caseId` and `sourceCommunicationId` server-side.
- [x] Source task creation rejects arbitrary status/case/description fields.
- [x] Case Detail shows source-linked document and communication actions.
- [x] No schema, migration, DB, Azure, client portal, OpenAPI, CORS, package, or deploy change.

## Privacy Acceptance

- [x] No `documents.workspaceText` in the new activity response.
- [x] No raw communication body in the new activity response.
- [x] No attachment bytes.
- [x] No SharePoint storage URL/path in the new activity response.
- [x] New UI copy states that only safe metadata is shown.

## Follow-Up

Future workflow work can add richer document review/task status only after separate schema/runtime proof. Client Portal use requires a separate external-safe publication mapper.

## Deadline and communication acceptance extension

- [ ] Communication rows may link to tasks/cases, but agenda items are sourced from persisted task/case deadline fields only.
- [ ] Agenda and notification DTOs do not expose raw communication body, raw document text, workspace text, AI prompts, or AI outputs.
- [ ] No fake external email/calendar/provider notification is introduced by the agenda work.
