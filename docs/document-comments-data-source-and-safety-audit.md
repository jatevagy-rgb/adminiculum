# Document Comments Data Source and Safety Audit

Package: `DOCUMENT-COMMENTS-BACKEND-AND-EDITOR-1`

## Decision

Selected branch: **Branch A — full document-level comments without delete**.

The existing `Comment` model supports document-level comments through `documentId`, authenticated `userId`, plain `content`, `isResolved`, `createdAt`, and `updatedAt`. It does not support anchored ranges, selected text, `resolvedAt`, `resolvedBy`, edit history, or soft deletion.

| Concept | Current model/route | Actual support | Authorization | Production-compatible? | V1 disposition | Notes |
|---|---|---|---|---|---|---|
| Document relation | `Comment.documentId` | Supported | document owning-case read | Yes | Implemented | Route document id is authoritative. |
| Case relation | `Comment.caseId` | Supported | owning case | Yes | Implemented | Set from document case, not client body. |
| Task relation | none | Not supported | n/a | n/a | Deferred | Comments do not create or mutate tasks. |
| Author | `Comment.userId` → `User` | Supported | auth-derived | Yes | Implemented | No client actor id accepted. |
| Content | `Comment.content` | Plain text | body validation | Yes | Implemented | Max 2000 chars; no HTML/JSON/selected text. |
| Status | `Comment.isResolved` | Open/resolved | author or case manager | Yes | Implemented | Maps to `OPEN`/`RESOLVED`. |
| resolvedAt | no field | Not supported | n/a | n/a | Null in DTO | No fake timestamp. |
| resolvedBy | no field | Not supported | n/a | n/a | Deferred | No fake actor. |
| createdAt | `Comment.createdAt` | Supported | DTO mapped | Yes | Implemented | ISO string. |
| updatedAt | `Comment.updatedAt` | Supported | DTO mapped | Yes | Implemented | ISO string. |
| Deletion | hard delete possible via Prisma, no policy | Not exposed | n/a | No | Disabled | `canDelete=false`; no route. |
| Edit | no route/policy | Not supported | n/a | No | Deferred | Prevents history ambiguity. |
| Resolve | `isResolved=true` | Supported | author/manager | Yes | Implemented | Repeated resolve returns 409. |
| Reopen | `isResolved=false` | Supported | author/manager | Yes | Implemented | Repeated reopen returns 409. |
| Pagination | query limit/offset | Supported | document access first | Yes | Implemented | Limit 1–50. |
| Audit | no comment audit added | Not added | n/a | Yes | Content-minimized | No body in audit. |
| Notification | no comment notification added | Not added | n/a | Yes | Deferred | Avoids body leakage. |
| Anchored range | no model | Not supported | n/a | No | Deferred | Explicitly false. |
| Selection text | no approved field | Not supported | n/a | No | Rejected | `selectedText` rejected. |
| Retention | hard delete unclear | Not proven | n/a | Partial | Documented | Delete disabled until policy exists. |
