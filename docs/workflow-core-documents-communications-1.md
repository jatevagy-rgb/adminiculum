# WORKFLOW-CORE-DOCUMENTS-COMMUNICATIONS-1

## Implemented Scope

This pass connects document and communication work into the internal lawyer workflow loop:

- Adds canonical safe case activity route.
- Extends existing case work-items with document and communication metadata entries.
- Adds constrained source-linked task creation for document and communication sources.
- Adds Case Detail activity/workbench UI affordances.

## Backend Contracts

- `GET /api/v1/cases/:caseId/activity`
- `POST /api/v1/documents/:id/tasks`
- `POST /api/v1/communications/:id/tasks`
- Extended `GET /api/v1/cases/:caseId/work-items`

## Frontend Integration

Case Detail now shows:

- Case Workbench items from tasks, handoffs, document metadata, and communication metadata.
- Quiet document/communication source actions:
  - `Review feladat`
  - `Utánkövetés`
- Case activity panel with safe metadata and explicit privacy flags.

## Source-Linked Task Rules

Accepted payloads are intentionally narrow:

- document task kind: `REVIEW` or `FOLLOW_UP`
- communication task kind: `FOLLOW_UP` or `REVIEW_ATTACHMENT`
- optional: `title`, `assigneeId`, `dueAt`

Rejected caller-controlled fields include direct `status`, `caseId`, creator fields, `description`, `priority`, raw content, and workspace text. Case/source linkage is derived server-side.

## Non-Goals

- No schema or migration change.
- No client portal exposure.
- No raw document text or raw email body exposure.
- No Outlook or provider import enablement.
- No SharePoint path/file-byte exposure.
- No deployment in this pass.

## Deadline and communication boundary extension

The deadline agenda extension intentionally keeps communications separate from case notes and does not infer deadlines from communication body text. Communication-linked task extraction may create structured task due dates through existing explicit flows; the agenda then reads the persisted `Task.dueDate` only.

No raw communication body, document workspace text, AI output, or timeline payload is included in agenda or notification DTOs.

## Responsibility / Workload / Time Follow-up

Document and communication task extraction can feed the task workload view, but time entries remain matter-based until a future persisted task/document/communication time-link model exists.
