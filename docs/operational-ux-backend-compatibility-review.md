# Operational UX Backend Compatibility Review

## Scope

This review covers only the three backend runtime files changed between `e447168` and `01949dc`:

- `Backend/src/modules/agenda/service.ts`
- `Backend/src/modules/cases/workflowSummary.ts`
- `Backend/src/modules/documents/routes.ts`

No schema, migration, package, auth, OpenAPI, CORS, Azure, or feature-flag change is present.

## Agenda Case-Status Filter

### Prior Failure

The case filter used values that belong to task/workflow concepts rather than the current `CaseStatus` enum:

- `COMPLETED`
- `DONE`
- `APPROVED`
- `ARCHIVED`
- `CANCELLED`

`APPROVED`, `ARCHIVED`, and `CANCELLED` are current case statuses, but the previous mixed set was not a valid persisted-case-status model and caused production-compatible query failure.

### Current Case Statuses

- `CLIENT_INPUT`
- `DRAFT`
- `IN_REVIEW`
- `APPROVED`
- `SENT_TO_CLIENT`
- `CLIENT_FEEDBACK`
- `FINAL`
- `ON_HOLD`
- `CANCELLED`
- `ARCHIVED`

### Corrected Semantics

Closed case statuses:

- `FINAL`
- `CANCELLED`
- `ARCHIVED`

Open agenda:

- work item `completedAt` is null;
- related case is not closed.

Completed agenda:

- work item has `completedAt`; or
- related case is closed.

Ordering and pagination remain unchanged. The change is read-only.

### Authorization

Case-scoped agenda resolves the case through the accessible-case query and returns `404` for inaccessible cases. This avoids distinguishing inaccessible from missing cases through that endpoint.

## Workflow Summary Communication Projection

### Prior Failure

The query selected `Communication.direction`, which is not available in the deployed production-compatible communication baseline.

### Corrected Projection

The database select is limited to:

```text
id
subject
summary
createdAt
```

The DTO keeps:

```text
direction: null
```

This preserves the response contract without reading an absent column.

### Data Boundary

The query does not add:

- message body;
- raw content;
- attachments;
- recipients;
- relation includes.

Errors are not converted into a successful empty workflow summary.

## Document Text Projection

### Prior Failure

A broad document scalar selection included `documents.currentVersionInt`, which is absent from the production-compatible physical schema.

### Corrected Projection

```text
id
documentType
workspaceText
updatedAt
spItemId
mimeType
fileName
name
```

This supports:

- modified working-copy text;
- SharePoint-backed download/extraction;
- filename and MIME handling;
- updated timestamp metadata.

No relation include is present.

### Privacy And Authorization

The route preserves existing raw workspace-text behavior. It does not add new content fields or logging.

Pre-existing risk: the route is authenticated, but the reviewed file does not apply document-scoped authorization middleware before returning/extracting text. This was not introduced by the operational UX branch and remains a separate release risk.

## Contract Capability Preflight

The frontend capability call:

- is authenticated;
- is read-only;
- is not cached across users;
- requests no contract list when generation is truthfully disabled;
- now propagates unexpected capability errors rather than treating every error as a disabled empty state.

Known disabled behavior remains a truthful `501 FEATURE_NOT_AVAILABLE` boundary.

## Test Evidence

Focused tests were run during review, including:

- workflow deadline/agenda;
- case workflow summary;
- document editor metadata;
- editor template capability;
- static operational UX safety.

Full result:

- 42/42 backend suites passed;
- 422/422 tests passed;
- backend TypeScript build passed;
- Prisma validation passed without a database connection.

## Compatibility Decision

No backend compatibility blocker was found in the reviewed changes.

The backend artifact may proceed to human release approval, subject to acceptance or separate remediation of the pre-existing document-scoped authorization gap.
