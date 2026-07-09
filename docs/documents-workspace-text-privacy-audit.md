# Documents Workspace Text Privacy Audit

## Purpose

This document audits `documents.workspaceText` for runtime exposure, privacy sensitivity, document/AI risk, retention risk, and authorization safety.

This is documentation-only. It makes no runtime change, no schema change, no migration, no DB connection, no production apply, no CP-SCHEMA-1 authorization, no Client Portal enablement, no AI/provider call, no SharePoint call, and no file processing.

## Inputs

Documentation inputs:

- `docs/production-schema-readonly-compare.md`
- `docs/present-compatible-keep-candidates-audit.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `docs/partial-schema-drift-inventory.md`
- `docs/partial-schema-drift-triage.md`

Repository files inspected:

- `Backend/prisma/schema.prisma`
- `Backend/src/index.ts`
- `Backend/src/modules/documents/routes.ts`
- `Backend/src/modules/documents/services.ts`
- `Backend/src/modules/documents/textExtractor.ts`
- `Backend/src/modules/documents/reviewSuggestions.routes.ts`
- `Backend/src/modules/anonymize/routes.ts`
- `Backend/src/modules/anonymize/services.ts`
- `Backend/src/modules/legal-analyses/routes.ts`
- `Backend/src/openapi/publicSpec.ts`
- `Backend/src/routes/clientPortal.ts`
- `Backend/tests/documentAiBoundary.test.ts`
- `Frontend/src/lib/api.ts`
- `Frontend/src/components/documents/AnonymizeModal.tsx`
- `Frontend/src/app/documents/compare/page.tsx`
- `Frontend/src/app/litigation-workspace/page.tsx`

## Confirmed Baseline Facts

- `docs/production-schema-readonly-compare.md` records `documents.workspaceText` as present-compatible in production metadata.
- `docs/present-compatible-keep-candidates-audit.md` classifies `documents.workspaceText` as `SECURITY/PRIVACY BLOCKED`.
- Present-compatible metadata does not automatically promote the field to `KEEP`.
- `Backend/prisma/schema.prisma` defines `Document.workspaceText` as nullable `String?` on the `Document` model, with the comment that it stores workspace editor draft text when `documentType = 'MODIFIED_WORKING_COPY'`.
- Document/AI privacy-sensitive routes are default-disabled unless both their feature flag and `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` are enabled.
- `Backend/tests/documentAiBoundary.test.ts` proves disabled document/AI routes return `501 FEATURE_NOT_AVAILABLE`, do not echo privileged text, and do not reach mocked services, Prisma writes, text extraction, or timeline writes.
- Client Portal remains disabled/quarantined; `Backend/src/routes/clientPortal.ts` runs no Prisma queries while disabled.
- Production apply and CP-SCHEMA-1 remain blocked.

## Field Inventory

| Field | Model / table | Production metadata result | Repo/schema evidence | Expected content | Sensitivity | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `workspaceText` | `Document` / `documents` | Present-compatible | `Document.workspaceText String?`; comment says persistent workspace text for modified working copy documents | User-edited legal document draft text, potentially copied/extracted from source documents | SECURITY/PRIVACY BLOCKED | May contain privileged legal text, personal data, third-party data, contract language, pleadings, or reidentification context. |

## Usage Inventory

| Area | File(s) | Read/write/use | Route/API exposure | Auth/gate evidence | Case/document authorization evidence | AI/export/external exposure risk | Risk level | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Document metadata list | `Backend/src/modules/documents/routes.ts`; `Backend/src/modules/documents/services.ts` | Metadata read only | `GET /api/v1/documents/case/:caseId` | `authenticate` | No route-local case-access check observed; service returns mapped metadata and omits `workspaceText` | No text returned | MEDIUM | Case document list is broad authenticated by route evidence, but the mapped response excludes workspace text. |
| Document detail | `Backend/src/modules/documents/routes.ts`; `Backend/src/modules/documents/services.ts` | Metadata read only | `GET /api/v1/documents/:id` | `authenticate` | No route-local document/case-access check observed; service returns mapped metadata and omits `workspaceText` | No text returned | MEDIUM | Detail route does not expose `workspaceText` through the current service mapper. |
| Document text read | `Backend/src/modules/documents/routes.ts`; `Frontend/src/lib/api.ts`; `Frontend/src/app/documents/compare/page.tsx`; `Frontend/src/app/litigation-workspace/page.tsx` | Reads `workspaceText` when `documentType = 'MODIFIED_WORKING_COPY'`; otherwise may download and extract text | `GET /api/v1/documents/:id/text` | `authenticate` + `requireDocumentProcessingEnabled`; requires `ENABLE_DOCUMENT_PROCESSING` and `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` | No route-local document/case-access check observed before `prisma.document.findUnique` | Can return raw workspace text or extracted document text to frontend | SECURITY/PRIVACY BLOCKED | Default-disabled by privacy gate; if enabled, this is the primary raw text read path. |
| Workspace text write | `Backend/src/modules/documents/routes.ts`; `Frontend/src/lib/api.ts`; `Frontend/src/app/documents/compare/page.tsx` | Creates a new `Document` row with `workspaceText` | `POST /api/v1/documents/:id/save-workspace-version` | `authenticate` + `requireDocumentProcessingEnabled`; requires `ENABLE_DOCUMENT_PROCESSING` and `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` | No route-local document/case-access check observed before reading original document or creating working copy | Persists legal draft text in DB; timeline metadata omits text content | SECURITY/PRIVACY BLOCKED | Default-disabled by privacy gate; if enabled, this creates persistent raw legal text. |
| Upload/version/review/download document operations | `Backend/src/modules/documents/routes.ts`; `Backend/src/modules/documents/services.ts` | File upload/download/version state; not direct `workspaceText` | Multiple `/api/v1/documents/*` routes | `authenticate` + document processing/privacy gate on mutating/download routes | No route-local case/document-access check observed in inspected snippets | SharePoint/file exposure paths for source documents | HIGH / SECURITY-PRIVACY BLOCKED | Relevant because text extraction can derive text from these files; not a direct `workspaceText` route. |
| Anonymization source preview | `Backend/src/modules/anonymize/routes.ts`; `Backend/src/modules/anonymize/services.ts`; `Frontend/src/components/documents/AnonymizeModal.tsx` | Does not read `workspaceText` directly; extracts text from SharePoint or local generated file and returns `sourceText` | `GET /api/v1/documents/:documentId/anonymization-source` | `authenticate` + `ENABLE_AI_ANONYMIZATION` + `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` | No route-local document/case-access check observed | Returns raw source text to frontend workspace if enabled | SECURITY/PRIVACY BLOCKED | Default-disabled; closely related to workspace text because frontend may edit this text and submit it as `sourceText`. |
| Anonymization request | `Backend/src/modules/anonymize/routes.ts`; `Backend/src/modules/anonymize/services.ts`; `Frontend/src/components/documents/AnonymizeModal.tsx` | Uses UI-provided `sourceText` first, otherwise extracts file text | `POST /api/v1/documents/:documentId/anonymize` | `authenticate` + anonymization/privacy gate | No route-local document/case-access check observed | Produces redacted content and AI-ready prompt; no live provider call observed in this service | SECURITY/PRIVACY BLOCKED | Provider call is not made here, but prompt construction contains legal text after redaction and must remain gated. |
| Anonymous document text loading | `Backend/src/modules/anonymize/routes.ts`; `Backend/src/modules/anonymize/services.ts`; `Frontend/src/app/documents/compare/page.tsx` | Returns redacted text for workspace loading | `GET /api/v1/anonymous-documents/by-source/:sourceDocumentId` | `authenticate` + anonymization/privacy gate | No route-local document/case-access check observed | Returns redacted text and redaction metadata, not `workspaceText` | HIGH / SECURITY-PRIVACY BLOCKED | Still sensitive because redacted text may be incomplete or reversible with metadata. |
| Legal analysis persistence | `Backend/src/modules/legal-analyses/routes.ts` | Accepts `analysisText` and `anonymizedInputSnapshot`; does not directly read `workspaceText` | `/api/v1/documents/:documentId/legal-analyses` and `/api/v1/legal-analyses/:id` | `authenticate` + `ENABLE_LEGAL_ANALYSES` + `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` | No route-local document/case-access check observed in inspected snippets | Stores work product / AI output if enabled | SECURITY/PRIVACY BLOCKED | Related risk path for text-derived content, but not a direct `workspaceText` field user. |
| Review suggestions | `Backend/src/modules/documents/reviewSuggestions.routes.ts` | Stores selected text preview/replacement/helper text; not direct `workspaceText` | `/api/v1/documents/:documentId/review-suggestions` | `authenticate` + `ENABLE_DOCUMENT_REVIEW_SUGGESTIONS` + `ENABLE_DOCUMENT_AI_PRIVACY_MODEL` | No route-local document/case-access check observed in inspected snippets | Stores snippets derived from document text if enabled | SECURITY/PRIVACY BLOCKED | Related risk path for text excerpts and lawyer work product. |
| Public OpenAPI metadata | `Backend/src/index.ts`; `Backend/src/openapi/publicSpec.ts` | Metadata only | `/api/v1/openapi.json`, `/openapi.json` | Public endpoint, but sanitizer removes `/api/v1/documents`, `/api/v1/anonymous-documents`, legal-analyses, and related quarantined document/AI paths | N/A | Public metadata exposure mitigated by sanitizer | LOW current / QUARANTINED BOUNDARY | Sanitizer excludes document/AI paths from public metadata. |
| Client Portal | `Backend/src/routes/clientPortal.ts`; CP docs | No direct exposure while disabled | `/api/v1/client-portal/*` | `authenticate` + disabled client portal ownership gate | No Prisma queries while disabled | External exposure blocked | LOW current, HIGH if future mapper reuses text | Client Portal must not expose `workspaceText` without explicit publication artifact/mapper/privacy review. |

## Authorization and Exposure Findings

- Metadata document list/detail routes use general `authenticate` and currently return mapped metadata that omits `workspaceText`.
- The direct `workspaceText` read path is `GET /api/v1/documents/:id/text`; it is default-disabled by `requireDocumentProcessingEnabled`, but if enabled it can return `document.workspaceText` for modified working copy documents.
- The direct `workspaceText` write path is `POST /api/v1/documents/:id/save-workspace-version`; it is default-disabled by `requireDocumentProcessingEnabled`, but if enabled it persists user-submitted text into `documents.workspaceText`.
- In the inspected document text/read/write snippets, no explicit case-level or document-level authorization check was observed before `prisma.document.findUnique` / `prisma.document.create`.
- Document/AI, anonymization, legal-analysis, and review-suggestion routes require the document-AI privacy model flag before reaching services.
- Disabled-route tests prove no service, Prisma write, text extraction, or timeline write occurs while document/AI privacy routes are disabled.
- Public OpenAPI metadata is sanitized to remove document/AI and anonymous-document paths.
- Client Portal is disabled/quarantined and no Client Portal mapper exposing `workspaceText` was identified in this audit.
- No live AI provider call was identified in the inspected `workspaceText` path; however, anonymization can construct `aiReadyPrompt` containing redacted document text if enabled.
- SharePoint download/extraction paths are adjacent high-risk paths because raw file text can be extracted and surfaced through the same frontend workspaces.

## Privacy/Security Findings

- `workspaceText` can contain raw legal document drafting text, contract clauses, pleadings, personal data, third-party data, client secrets, financial/medical facts, or other privileged legal content.
- Persisting the field creates retention, deletion, data minimization, and access-control obligations beyond ordinary metadata.
- Broad authenticated access would not be sufficient for this field; document/case-level need-to-know is required before any enabled internal read/write claim.
- `workspaceText` is not safe for Client Portal or external exposure without a strict publication artifact model, internal/external mapper, field allowlist, approval workflow, and GDPR/privacy review.
- `workspaceText` is not safe for AI/provider use without an approved anonymization/redaction model, provider/data-processing policy, logging redaction, retention model, and audit rules.
- Logging appears to avoid printing text content in the inspected save route and anonymization summary, but error logging around extraction/provider-adjacent paths remains a boundary that should be reviewed before enablement.
- Frontend workspaces can display/use loaded text through `getDocumentText`, anonymization source loading, and local editor state. These are acceptable only while backed by the disabled privacy gates and future case/document authorization.

## Decision Lane

`documents.workspaceText` remains `SECURITY/PRIVACY BLOCKED`.

It should not move to `KEEP`, `KEEP-BUT-HARDEN`, or narrow internal baseline in this audit. The field is present-compatible, but it is legal-content storage, not metadata. The current safe posture depends on document/AI privacy gates remaining disabled/default-off and on public/client-facing surfaces staying quarantined.

## Required Next Packages

Recommended immediate next package:

1. `DOCUMENTS-WORKSPACE-TEXT-PRIVACY-MODEL-DESIGN-1`
   - Define the permitted storage purpose, data minimization rules, retention/delete behavior, logging redaction, audit requirements, AI/provider rules, and internal/external mappers.
   - Documentation/design only.

Follow-up implementation packages only after the privacy model exists:

2. `DOCUMENTS-WORKSPACE-TEXT-AUTHZ-HARDEN-1`
   - Add or prove document/case-level access checks for any route that reads, writes, extracts, or displays document text.
   - Add tests for unauthenticated, wrong-case/wrong-document, authorized collaborator/assigned lawyer, and privileged-role paths.
   - No schema change unless separately justified.

3. `DOCUMENTS-WORKSPACE-TEXT-AI-GATE-REVIEW-1`
   - Verify no AI/provider path can consume raw or redacted document text unless privacy model, anonymization, provider/DPA, and retention requirements are satisfied.

4. `DOCUMENTS-WORKSPACE-TEXT-CLIENT-PORTAL-EXCLUSION-1`
   - Prove `workspaceText` and text-derived internal work product are excluded from Client Portal/public payloads unless a separate approved publication artifact exists.

## Non-Actions

- No schema changed.
- No migration created.
- No DB connection used.
- No DB apply performed.
- No business data read.
- No Azure deployment or app setting changed.
- No runtime behavior changed.
- No route behavior changed.
- No OpenAPI/CORS behavior changed.
- No frontend changed.
- No tests changed.
- No Client Portal enabled.
- No AI/provider call made.
- No file processing performed.
- No SharePoint call made.

## Follow-up

- `DOCUMENTS-WORKSPACE-TEXT-PRIVACY-MODEL-DESIGN-1` created a follow-up privacy model:
  `docs/documents-workspace-text-privacy-model.md` (defines the minimum
  privacy/security prerequisites before any controlled internal use).
- `DOCUMENTS-WORKSPACE-TEXT-AUTHZ-HARDEN-1` added internal authorization/exposure
  hardening: the gated raw-text read (`GET /documents/:id/text`) now requires
  document/case read access and the gated write
  (`POST /documents/:id/save-workspace-version`) now requires case manage access
  (both still auth-first and behind the default-disabled Document/AI gate). Broad
  list/detail/search responses already omit raw text via explicit DTOs.
- Lane remains **`SECURITY/PRIVACY BLOCKED`** (authz-hardened but privacy-blocked; not KEEP).
- `DOCUMENTS-WORKSPACE-TEXT-AUTHZ-CLOSEOUT-1` (`d3f6bea`) documented the completed
  hardening: the raw-text read/write route authorization is now document/case-scoped.
  `workspaceText` **remains `SECURITY/PRIVACY BLOCKED`**; the hardening does **not**
  resolve the retention / logging / AI-provider / export-SharePoint / external
  (Client Portal) blockers.
- `DOCUMENTS-WORKSPACE-TEXT-RETENTION-DESIGN-1` created a follow-up retention design
  (`docs/documents-workspace-text-retention-design.md`); retention is designed only,
  not implemented. Lane remains **`SECURITY/PRIVACY BLOCKED`**.
- `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-DESIGN-1` created a follow-up logging-guard
  design (`docs/documents-workspace-text-logging-guard-design.md`); logging guard is
  designed only, not implemented. Lane remains **`SECURITY/PRIVACY BLOCKED`**.
- `DOCUMENTS-WORKSPACE-TEXT-LOGGING-GUARD-IMPLEMENTATION-1` (`52fe3d6`) implemented the
  logging guard: `safeWorkspaceTextLogContext` (`Backend/src/modules/documents/logging.ts`)
  logs content-free metadata only and the two raw-text route catch blocks no longer
  serialize the raw error object; `documentsWorkspaceTextAuthz` proves no synthetic raw
  text appears in error responses/logs (13/13). Lane remains **`SECURITY/PRIVACY BLOCKED`**.
- `DOCUMENTS-WORKSPACE-TEXT-AI-GATE-REVIEW-1` reviewed/regression-proofed the AI/provider
  gate boundary. **No AI/provider call was made.** Inventory found **no in-code AI
  provider client**; the only prompt-construction path (`anonymizeDocument`'s
  `aiReadyPrompt`) is fed only anonymized/redacted content and is privacy-gated; raw
  `workspaceText` is read in only the two gated document routes and is wired to **no**
  prompt/provider path. Added `Backend/tests/documentsWorkspaceTextAiGate.test.ts`
  proving raw workspace text cannot reach the prompt/provider path (gate-off,
  legacy-flags-only, fully-enabled non-forwarding, and static no-provider-import). Lane
  remains **`SECURITY/PRIVACY BLOCKED`**; no AI/provider use authorized; no KEEP,
  CP-SCHEMA-1, production apply, Document/AI, Client Portal, export/SharePoint, or
  retention implementation authorized.

## Final Classification

`documents_workspace_text_privacy_audited_no_db_change_no_runtime_change`
