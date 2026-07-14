# Document Editor Document Comments Contract

## Current branch

Branch A — document-level comments are implemented without delete or anchors.

## Why unavailable

The existing `Comment` model has `documentId`, `caseId`, `userId`, `content`, and `isResolved`. `DOCUMENT-COMMENTS-BACKEND-AND-EDITOR-1` adds document-comment routes, DTO mapping, route-level document/case authorization, bounded content validation, and resolve/reopen transitions.

## Future minimum contract

- `GET /api/v1/documents/:documentId/comments`
- `POST /api/v1/documents/:documentId/comments`
- `POST /api/v1/documents/:documentId/comments/:commentId/resolve`
- `POST /api/v1/documents/:documentId/comments/:commentId/reopen`

DTOs expose only id, documentId, author display name/id, plain text content, status, timestamps, and backend-derived capabilities.

## Explicit non-support

No inline comments, no text anchors, no selected-text snapshots, no hidden editor persistence, no comment body in audit/notification/activity, and no delete route unless policy is separately approved.
