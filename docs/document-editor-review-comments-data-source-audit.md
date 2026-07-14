# Document Editor Review and Comments Data Source Audit

Package: `DOCUMENT-EDITOR-REVIEW-COMMENTS-QUALITY-HARDENING-1`

## Decision

Selected comments branch: **Branch C — comments remain unavailable**.

`Comment.documentId` exists in Prisma, but there is no approved document-comment route/service, no DTO mapper, no route-level document authorization contract for comments, and no resolve/reopen API. Real document-level comments therefore remain blocked without a schema change, DB query, or fake frontend state.

| Concept | Current model/route/component | Actual support | Authorization | Production-compatible? | V1 disposition | Notes |
|---|---|---|---|---|---|---|
| Document comments | `Comment.documentId`; editor metadata `canComment=false` | Model relation only | Not route-proven | No | Unavailable | No fake panel or memory comments in the professional editor. |
| Comment author | `Comment.userId` | Schema only | Not route-proven | No | Unavailable | Author must be derived from auth in future. |
| Comment resolve | `Comment.isResolved` | Schema only | Not route-proven | No | Unavailable | Needs idempotent resolve/reopen routes. |
| Comment reopen | `Comment.isResolved=false` | Schema only | Not route-proven | No | Unavailable | Needs transition contract. |
| Comment delete | No editor route | None | Not route-proven | No | Unavailable | Prefer resolve over delete. |
| Anchored comment | No structured range model | None | n/a | No | Unavailable | No selected text or fake anchors. |
| Selection range | No schema field | None | n/a | No | Unavailable | Selection snapshots are not stored. |
| Review task | `POST /documents/:id/tasks`; work items | Supported | Server-derived capabilities | Yes | Keep | Task-backed review remains the live path. |
| Reviewer identity | Work item assignee | Supported when task has assignee | Backend DTO | Yes | Keep | No separate reviewer state machine added. |
| Submit for review | `POST /tasks/:id/submit` | Supported by capabilities | Backend | Yes | Hardened | Dirty Mode C sessions require confirmation. |
| Approve | `POST /tasks/:id/complete` approved | Supported by capabilities | Backend | Yes | Keep | Internal workflow approval only. |
| Return | `POST /tasks/:id/complete` rejected | Supported by capabilities | Backend | Yes | Keep | No legal validity claim. |
| Compare | `/documents/compare?caseId=&documentId=` | Saved-source workflow | Existing route auth | Yes | Wording hardened | Label is saved-source comparison, not track changes. |
| Saved version comparison | Compare route | Metadata/workspace dependent | Existing gates | Conditional | Honest link | No current browser content included. |
| Unsaved local comparison | Professional editor content | Not supported | n/a | No | Unavailable | No upload/export side effect. |
| Dirty state | React memory + beforeunload | Supported | n/a | Yes | Hardened | Review submit/create warns while dirty. |
| Navigation warning | `beforeunload`; back confirmation | Supported | n/a | Yes | Keep | Browser-session only. |
| Keyboard shortcuts | Tiptap + editor search | Supported subset | n/a | Yes | Documented | Help panel lists shortcuts. |
| Outline focus | `DocumentOutline` + selection move | Supported | n/a | Yes | Keep | No persistence side effect. |
| Table keyboard behavior | Tiptap table controls | Supported subset | n/a | Conditional | Bounded | Table limits enforced by validator. |
| Large DOCX | `DOCX_LIMITS` | Supported bounded local import | n/a | Yes | Documented | No server upload. |
| Conversion cancellation | Confirm before replacement | Supported | n/a | Yes | Keep | Current content preserved on cancel/failure. |
| Editor error recovery | Bounded notices + safe metadata error | Partial | n/a | Yes | Hardened/docs | No raw exception text or content in errors. |
