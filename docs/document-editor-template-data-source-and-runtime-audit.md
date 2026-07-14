# Document Editor Template Data Source and Runtime Audit

This audit supports `DOCUMENT-EDITOR-TEMPLATE-ASSEMBLY-CLAUSE-CATALOG-1`. It is schema-read-only and runtime-read-only: no DB connection, migration, deploy, Azure change, OpenAPI/CORS change, Client Portal change, AI call, n8n call, or external converter was used.

## Summary

The existing contract-generation module is authenticated and default-disabled behind both `ENABLE_CONTRACT_GENERATION` and `ENABLE_CONTRACT_GENERATION_STORAGE_MODEL`. While the code contains template catalog, preview, generation, download, SharePoint upload, edit-draft, comparison, timeline, revision, and bundle functions, the currently approved production posture keeps the family quarantined. The models also contain broad JSON (`ContractTemplate.variables`, `ContractGeneration.templateData`) and filesystem/storage fields (`templatePath`, `filePath`, SharePoint metadata). Therefore the safe branch for the editor is Branch C: approval readiness only.

## Capability Audit

| Capability | Existing model/route/service | Actual behavior | Gate | Production-compatible? | V1 disposition | Safety notes |
|---|---|---|---|---|---|---|
| Template listing | `GET /api/v1/contracts/templates`, `contractsService.getTemplates`, `ContractTemplate` | Returns active templates from DB; service maps raw variables array | `ENABLE_CONTRACT_GENERATION` + `ENABLE_CONTRACT_GENERATION_STORAGE_MODEL` | No, while contracts family remains quarantined | Unavailable in editor | Existing route is safely disabled; no editor catalog call. |
| Template detail | `GET /api/v1/contracts/templates/:id` | Returns template with broad `variables`; model also has `templatePath` | Same contracts gate | No | Unavailable | Needs explicit DTO before frontend use. |
| Variable definitions | `ContractTemplate.variables`, `ADASVETEL_VARIABLES` | Broad JSON or static legacy variable list | Same contracts gate | Partial | Documented only | Needs strict allow-list and shape validation. |
| Variable defaults | `processTemplateData`, generation form code | Backend mutates/derives formatting from submitted data | Same contracts gate | No | Deferred | No preview contract currently isolates safe defaults. |
| Manual variables | `/contracts/generate` accepts `data` object | Arbitrary object accepted by legacy route | Same contracts gate | No | Deferred | Must be replaced with explicit variable array before editor bridge. |
| Case variables | Frontend generation page and case context | Case data can feed generation flows | Same contracts gate | No | Deferred | Need case-access + explicit field allow-list. |
| Client variables | Generation page/profile helpers | Client profile data may be available | Same contracts gate | No | Deferred | Need need-to-know review for identifiers. |
| Responsible lawyer variables | Not a dedicated contract | Some timeline/user resolution exists | Same contracts gate | No | Deferred | Only display name is potentially safe after explicit approval. |
| Template preview | `POST /api/v1/contracts/preview`, `generatePreview` | Creates preview `ContractGeneration` and file | Same contracts gate | No | Unavailable | Preview is not read-only; it persists a preview row/file. |
| Generation | `POST /api/v1/contracts/generate`, `generateWithBundle` | Generates local DOCX files, may upload to SharePoint with case | Same contracts gate | No | Unavailable | Not editor-safe until storage/retention/audit model is approved. |
| Generation status | `ContractGeneration.status` | Enum drift documented; APPROVED/REJECTED differ from production snapshot | Same contracts gate | No | Deferred | Production-compatible baseline remains blocked. |
| Generated DOCX retrieval | `GET /api/v1/contracts/:id/download` | Reads local `filePath` and streams with `res.download` | Same contracts gate | No | Manual authorized route only when enabled outside editor | No automatic editor handoff. |
| Generated file storage | `uploads/generated`, `ContractGeneration.filePath` | Local filesystem path persisted | Same contracts gate | No | Deferred | Requires storage/retention/delete policy. |
| Generated Document relation | Generated contracts listed separately, not editor content | ContractGeneration is not a Document editor version | Same contracts gate | No | Deferred | Editor session remains local. |
| Output path | `filePath`, `templatePath` | Server filesystem paths in model/service | Same contracts gate | No | Never exposed by editor | Must not appear in DTOs. |
| Rollback | Ad hoc service error handling | No single atomic storage rollback for DB+file+SharePoint | Same contracts gate | No | Deferred | Requires transactional side-effect design. |
| Audit | Timeline event creation in generation/revision flows | Content-minimal intent, but generation route logs request/service shape | Same contracts gate | Partial | Deferred | Must avoid variable values and storage paths. |
| Download | `/contracts/:id/download`, bundle download | Binary response from local file | Same contracts gate | Partial | Manual only | Automatic local import not enabled. |
| Editor import | `docxInterop.ts` | Browser-local DOCX security inspection and import | None; editor local UI | Yes | Supported manually | Does not upload or save content. |
| Clause source | `clause-library` module + editor insertion presets | Clause library is persistence-gated; presets are static UI helpers | `ENABLE_CLAUSE_LIBRARY` for backend | Partial | No dynamic catalog in editor | No automatic recommendations or substantive hardcoded library. |
| Custom clause storage | `ClauseLibraryItem`, assembly drafts | DB persistence with recommendations/assembly | `ENABLE_CLAUSE_LIBRARY` | No | Deferred | Requires governance and approval before editor integration. |

## Branch Decision

Selected branch: Branch C — Approval readiness only.

Reason: the existing implementation is feature-gated and includes broad JSON, filesystem path, SharePoint side-effect, enum-drift, and storage/retention/audit concerns. A truthful capability endpoint and disabled editor panel are safe; automatic generation/import is not.
