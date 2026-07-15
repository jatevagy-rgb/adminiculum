# Document Editor Template Assembly and Clause Catalog 1

## Purpose

Define and implement the safe first bridge between contract templates and the professional editor without weakening Mode C editor persistence.

## Repository findings

- `ContractTemplate` stores `variables` as JSON and `templatePath` as a server file path.
- `ContractGeneration` stores `templateData` as JSON, `filePath`, optional SharePoint metadata, generation status, and revision metadata.
- Contract routes are auth-first and gated by `ENABLE_CONTRACT_GENERATION` plus `ENABLE_CONTRACT_GENERATION_STORAGE_MODEL`.
- Existing preview creates a preview generation/file; it is not a pure read-only preview.
- Existing generation can create files, DB rows, timeline events, and SharePoint upload side effects.
- Generated downloads are route-based and authorized when the contracts gate is enabled, but no safe automatic editor import bridge is currently approved.
- Clause-library persistence exists but is gated by `ENABLE_CLAUSE_LIBRARY` and includes recommendation/assembly behavior that is not safe to wire as automatic legal advice.

## Selected implementation branch

Selected branch: Branch C — approval readiness only.

Reason: the current template implementation is feature-gated and not safe for automatic editor integration because it includes broad JSON, server file paths, local filesystem storage, SharePoint side effects, enum-drift concerns, and missing approved storage/retention/audit model.

Runtime integration: authenticated capability endpoint plus truthful editor unavailable state.

Feature-gate status: contract generation remains disabled unless both contract gates are explicitly enabled.

Variable behavior: no generation variables are accepted from the editor; future variables must use an explicit allow-list.

Generated-file behavior: no generated DOCX is created by this package; manual authorized download plus local DOCX import remains the only safe bridge.

Remaining blocker: approve a dedicated template DTO, variable allow-list, storage/retention/delete policy, permission model, audit minimization, enum/schema remediation, and route tests for enabled behavior.

Review/comments quality follow-up: template assembly remains separate from review comments. No template runtime integration, editor persistence, fake review visibility, or automatic generated-file import is introduced by the quality hardening pass.

## Template capability contract

Added `GET /api/v1/contracts/editor-template-capabilities` before the contracts feature gate. It requires authentication and returns explicit booleans only. It does not query Prisma, list templates, read files, expose environment values, expose storage paths, or call generation services.

## Template catalog

No active editor template catalog was enabled. The existing `/contracts/templates` route remains behind the contracts gate and is not used by the editor because the DTO can include broad JSON and template path fields.

## Variable schema

No runtime variable submission was added. Future work must define explicit variable definitions and submitted values with fixed keys, labels, types, source domains, max lengths, and no arbitrary object paths.

## Variable resolution and preview

No generation preview was added. Existing preview persists preview output, so it is not suitable as a variable-only preview for the editor. Future preview must be read-only and must not return template binary, DOCX XML, broad case/client objects, or storage paths.

## Generation boundary

No generation call was added to the editor. Existing generation remains guarded and quarantined.

## Generated DOCX delivery

No generated DOCX delivery was added. Existing generated-contract download remains a separate authorized backend route when the contracts feature is enabled outside this editor bridge.

## Local editor import bridge

The professional editor keeps the local DOCX import/export path from the previous DOCX interoperability package. The new template panel directs users to use authorized manual download followed by local DOCX import.

## Editor UI

The editor now shows a compact `Sablonból munkapéldány` readiness panel. It explains that the catalog/generation workflow is not active and keeps only `Helyi DOCX import` as an enabled action.

## Clause catalog findings

A clause-library backend exists, but it is persistence-gated, includes recommendation and assembly semantics, and is not wired as a safe editor clause catalog. Static editor insertion presets remain local structured helpers and are not a legal advice catalog.

## Clause insertion

No dynamic clause insertion was added. No automatic clause selection, recommendation, or hardcoded substantive legal clause library was introduced.

## Case and document workflow integration

The editor review side panel now explicitly warns that review tasks relate to the stored document, while the current editing session content is not saved to the Adminiculum server.

## Mode C compliance

Mode C remains unchanged: no server editor-content save, no autosave, no server versions, no restore, no comments, no `workspaceText`, no localStorage/sessionStorage persistence, and no fake saved state.

## Privacy and authorization

The capability endpoint is auth-first and content-free. It returns no template content, variable values, generated content, storage paths, SharePoint paths, secrets, raw environment variables, broad `templateData`, or case/client data.

## Dependency vulnerability audit

`npm audit --json` initially reported 4 vulnerabilities: 3 moderate and 1 critical. Safe compatible remediation updated `next` to `15.5.20`, `eslint-config-next` to `15.5.20`, and `postcss` to `8.5.10`. The critical Next advisory set was remediated. Four moderate advisories remain: transitive lint-only `brace-expansion`, transitive/direct ESLint `js-yaml`, and npm's remaining Next/PostCSS advisory through Next's embedded PostCSS. No `npm audit fix --force` was used.

## AI and n8n compliance

No AI API, AI SDK, AI variable resolution, AI template selection, AI clause generation, n8n workflow, n8n persistence, or n8n database access was added.

## Unsupported or deferred functionality

- Automatic template selection.
- Automatic generation from the editor.
- Automatic generated DOCX import.
- Variable preview that resolves case/client fields.
- Dynamic clause catalog insertion.
- Clause recommendation.
- Server editor persistence.
- Generated-document upload or Client Portal publication.

## Validation

Validation must include backend tests, frontend typecheck/build, production-env bundle guard, `npm audit --json`, and route smoke. See `docs/document-editor-template-assembly-acceptance.md`.

## Remaining template work

A future Branch A/B package may proceed only after the contracts family is approved, the production schema baseline is reconciled, DTOs are narrowed, variable allow-lists are implemented, enabled-route tests are added, and storage/retention/audit/privacy decisions are complete.

## DOCUMENT-EDITOR-WORKBENCH-UX-LAYOUT-OVERHAUL-1 update

The editor became a viewport-bound workbench: the editor route now uses the
`fullViewport` application-shell mode (h-dvh, non-scrolling `<main>`), so the
header, formatting toolbar and status bar stay visible while only the document
viewport scrolls; the outline and side panel scroll independently and are
collapsible with responsive defaults. DOCX import/export moved into the header
"Export / Import" menu (also available on the side panel Export tab), the
template-readiness banner moved into the side panel "Sablon" tab, and zoom
moved to the status bar. All persistence semantics are unchanged: Mode C,
"Munkamenet — nincs szerverre mentve", no autosave, no browser storage, no
anchored comments, no track changes. See
`docs/document-editor-workbench-ux-layout-overhaul-1.md` and
`docs/document-editor-workbench-layout-contract.md`.
