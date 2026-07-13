# Workflow Core Documents / Communications Data Source Audit

## Summary

WORKFLOW-CORE-DOCUMENTS-COMMUNICATIONS-1 uses only already-existing internal backend sources:

- `documents` metadata by `caseId`
- `communications` metadata by `caseId`
- `communication_attachments` metadata counts by `communicationId`
- `tasks` by `caseId`, `documentId`, and `sourceCommunicationId`
- `timeline_events` by `caseId`

No schema change, migration, DB repair, Azure change, client portal enablement, Outlook enablement, or deployment is part of this pass.

## Safe Fields

- Documents: `id`, `name`, `fileName`, `documentType`, `category`, timestamps, `caseId`
- Communications: `id`, `subject`, `summary`, `type`, `documentId`, timestamps, `caseId`
- Attachments: count-only by `communicationId`
- Tasks: `id`, `title`, bounded `description`, status/type/due metadata, source ids
- Timeline: event type, bounded description, linked ids, timestamp

## Explicitly Excluded

- `documents.workspaceText`
- raw document text / extraction output
- raw communication body/content
- attachment bytes
- SharePoint storage paths/URLs
- broad relation includes or raw Prisma rows
- arbitrary JSON payloads from timeline metadata
- client portal fields or public visibility

## Routes Audited

- `GET /api/v1/cases/:caseId/work-items`
- `GET /api/v1/cases/:caseId/activity`
- `POST /api/v1/documents/:documentId/tasks`
- `POST /api/v1/communications/:communicationId/tasks`
- existing communication list/detail/intake routes remain unchanged except for the new constrained task route.

## Safety Classification

The implemented sources are suitable for internal lawyer workflow surfaces only. They are not client-portal-public contracts and must not be reused externally without a separate mapper and authorization review.
