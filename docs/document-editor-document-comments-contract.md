# Document Editor Document Comments Contract

## Current branch

Branch C — comments remain unavailable.

## Why unavailable

The existing `Comment` model has `documentId`, `caseId`, `userId`, `content`, and `isResolved`, but the professional editor has no approved document-comment routes or DTO mapper. Without route-level document/case authorization and bounded content validation, enabling comments would risk mixing generic comments with real document-review comments.

## Future minimum contract

- `GET /api/v1/documents/:documentId/comments`
- `POST /api/v1/documents/:documentId/comments`
- `POST /api/v1/documents/:documentId/comments/:commentId/resolve`
- `POST /api/v1/documents/:documentId/comments/:commentId/reopen`

Future DTOs must expose only id, documentId, author display name/id, plain text content, status, timestamps, and backend-derived capabilities.

## Explicit non-support

No inline comments, no text anchors, no selected-text snapshots, no hidden editor persistence, no comment body in audit/notification/activity, and no delete route unless policy is separately approved.
