# Narrow Release Approved Change Selection

Date: 2026-07-15
Branch: `release/editor-ops-workflow-1`
Deployment action: none

## Selection method summary

Broad cherry-picks were not used because early candidate commits mixed approved runtime changes with docs and older branch context. The release uses `FILE_LEVEL_RECONSTRUCTION` from accepted release target `6800b13`, followed by hunk-level pruning for exclusion gates.

| Commit | Subject | Method | Included surface | Excluded surface |
| --- | --- | --- | --- | --- |
| `e132923` | workflow case center | `FILE_LEVEL_RECONSTRUCTION` | case workflow summary, Case Detail/API additions, tests | broad docs |
| `4599b66` | tasks and handoff workflows | `FILE_LEVEL_RECONSTRUCTION` | task/work-item backend and frontend handoff, tests | broad docs |
| `1499ad7` | documents and communications workflow | `FILE_LEVEL_RECONSTRUCTION` | case activity, source-linked tasks, communication/document workflow hooks, tests | broad docs |
| `2818b0b` | deadlines agenda and notifications | `FILE_LEVEL_RECONSTRUCTION` | agenda module, route mount, deadlines/dashboard UI, tests | OpenAPI/CORS untouched |
| `d49d410` | responsibility workload and time | `FILE_LEVEL_RECONSTRUCTION` | workload module, route mount, workload/time UI, tests | OpenAPI/CORS untouched |
| `77381ce` | litigation and lifecycle | `FILE_LEVEL_RECONSTRUCTION` | lifecycle/dossier services, litigation UI, tests | broad docs |
| `a319255` | intake and matter opening | `FILE_LEVEL_RECONSTRUCTION` | intake module, route mount, client lookup, intake UI, tests | Client Portal unchanged |
| `a8aca78` | professional editor | `FILE_LEVEL_RECONSTRUCTION` | editor UI/lib/package deps/tests | unrelated docs |
| `adb0161` | editor metadata readiness | `HUNK_LEVEL_RECONSTRUCTION` | metadata/capability contract only | editor content persistence |
| `77a90a7` | DOCX interoperability | `FILE_LEVEL_RECONSTRUCTION` | `jszip`, DOCX import/export editor support, tests | no backend persistence |
| `a376a80` | template readiness bridge | `HUNK_LEVEL_RECONSTRUCTION` | editor template capability endpoint and UI | contract generation enablement |
| `d722f09` | editor review safety | `FILE_LEVEL_RECONSTRUCTION` | review quality helper/UI/tests | fake review claims |
| `b923f33` | document comments | `FILE_LEVEL_RECONSTRUCTION` | document-level comments routes/service/UI/tests | anchored comments and editor content persistence |
| `5f4e1c8` | editor workbench UX | `FILE_LEVEL_RECONSTRUCTION` | editor layout/AppShell/globals/UI/tests | unrelated docs |
| `92d280e` | ops pages cleanup | `FILE_LEVEL_RECONSTRUCTION` | `/time-entries`, `/deadlines`, `/clause-library` cleanup and static test | none |
| `6800b13` | visual QA | `EXCLUDE_RUNTIME` | no runtime changes; validation context only | docs-only not copied except release-specific notes |

## Package changes

| Package | Baseline version | Release version | Required by | Security impact | Included? |
| --- | --- | --- | --- | --- | --- |
| `@tiptap/extension-table` | absent | `3.26.0` | professional editor table support | audit required, no force-fix | Yes |
| `jszip` | absent | `3.10.1` | local DOCX import/export | audit required, no force-fix | Yes |
| Next/PostCSS lockfile entries | baseline lock | release lock from approved editor target | dependency resolution | audit required | Yes, only via frontend lockfile from approved target |

## Blocked content deliberately excluded

- Prisma schema changes after backend baseline.
- Migration files after backend baseline.
- Client Portal runtime/frontend expansion.
- OpenAPI/CORS hardening changes.
- Azure/deployment config changes.
- Outlook enablement or live Graph access.
- AI API/n8n logic.
- New workspaceText exposure beyond accepted baseline.
- Contract generation enablement.
- Editor server content persistence.
