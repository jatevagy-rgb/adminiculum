# Document Editor Persistence Storage Audit

## Result

Selected mode: **Mode C — export-only working session remains mandatory**.

The repository has SharePoint-backed document upload/download/version metadata and a separate `documents.workspaceText` working-copy route, but it does **not** prove a schema-free durable Tiptap source format with load/save/version-content retrieval/restore/concurrency/retention. The professional editor therefore must not claim server save, autosave, saved editor versions, or restore.

## Capability audit

| Capability | Current module/model | Actual behavior | Feature gate | Production-compatible? | Mode impact | Safety notes |
|---|---|---|---|---|---|---|
| editor-content loading | none | No dedicated Tiptap content source exists. | n/a | no | Blocks Mode A/B | `/documents/:id/editor` returns metadata only. |
| editor-content saving | none | No save endpoint added. | n/a | no | Blocks Mode A/B | Save remains unavailable. |
| new file creation | `documents.routes`, `documentsService.createDocument`, SharePoint drive service | Uploads user file bytes to SharePoint and persists metadata. | `ENABLE_DOCUMENT_PROCESSING` + privacy model | partial | Not editor persistence | File upload is not Tiptap source persistence. |
| file replacement | `uploadNewVersion` | Uploads a binary replacement to the same SharePoint item. | document processing gates | partial | Blocks Mode B | No Tiptap format contract or stale-write token. |
| file version creation | SharePoint version upload plus `Document.version` metadata | SharePoint may create file versions; local `DocumentVersion` is not a proven content-version ledger for editor JSON. | document processing gates | partial | Blocks Mode B | Metadata version is not a stored editor source version. |
| version listing | `driveService.getDocumentVersions` | Lists SharePoint versions by drive item. | adapter only | partial | Blocks Mode B | No route/DTO for editor versions and no content validation. |
| version-content retrieval | not proven | No safe endpoint proven for one stored editor JSON version. | n/a | no | Blocks Mode B | Full content retrieval is required for real editor versioning. |
| restore | not proven | No safe editor-content restore flow. | n/a | no | Blocks Mode B | No stale restore semantics. |
| ETag | SharePoint may return operational metadata | No backend editor concurrency token contract. | n/a | no | Blocks Mode B | No silent overwrite allowed. |
| storage version | `Document.version`, SharePoint version label | Metadata-only; not a stable Tiptap content identity. | n/a | no | Blocks Mode B | Cannot become fake version token. |
| checksum | `Document.checksum` exists | Not wired to professional editor content. | n/a | no | Blocks Mode B | Do not reuse without approved source contract. |
| Document association | `Document.caseId`, `Document.clientId` | Metadata is strongly associated to one case/client. | n/a | yes for metadata | Supports metadata endpoint | No content stored. |
| DocumentVersion association | `DocumentVersion.documentId` | Exists but no proven editor JSON payload or content retrieval. | n/a | partial | Blocks Mode B | Do not create metadata-only editor versions. |
| content type | upload MIME | Binary/document MIME exists; no `TIPTAP_JSON` marker. | n/a | no | Blocks Mode B | Canonical future format documented only. |
| MIME behavior | upload/download routes | Handles file MIME; not editor JSON source. | document processing gates | partial | Blocks Mode B | Validator added for future `TIPTAP_JSON`. |
| SharePoint identifiers | `spItemId`, `spPath`, `spWebUrl` | Operational identifiers persist on `Document`. | n/a | internal only | Metadata DTO excludes them | No storage path leakage. |
| retention | docs/schema only | No explicit editor-source retention/deletion policy. | n/a | unknown | Blocks Mode B | Human decision required. |
| deletion | `driveService.deleteDocument` | Adapter can delete drive item; editor retention not modeled. | n/a | unknown | Blocks Mode B | Not integrated. |
| archival | case/document lifecycle docs | No proven content archive rule for editor JSON. | n/a | unknown | Blocks Mode B | Human decision required. |
| authorization | `requireDocumentReadAccess`, `userCanManageCase` | Metadata endpoint authenticates and authorizes by owning case. | auth | yes for metadata | Supports Mode C | Inaccessible documents return safe 404/403. |
| audit | timeline/workspace logging | Content-minimal logging exists for workspaceText; editor content audit not implemented. | n/a | partial | Blocks Mode B | Do not log editor JSON. |
| logging | route logs vary | Existing editor readiness routes do not accept content. | n/a | yes for Mode C | Supports Mode C | Rejected content tests do not log content. |
| rollback | not applicable | No persistence mutation added. | n/a | n/a | Supports Mode C | No DB/storage writes. |
| recovery | not proven | No stored editor source to recover. | n/a | no | Blocks Mode B | User exports manually. |
| content limits | frontend validator and new backend validator | Backend validator now enforces strict envelope/doc limits for future persistence. | n/a | readiness only | Supports Mode C readiness | Pure function; no storage. |

## Decision

Mode A is unavailable because no dedicated editor-content model/service exists. Mode B is blocked by missing stored source format, version content retrieval, restore, stale-write token, retention, and recovery proof. Mode C remains the only truthful behavior.
