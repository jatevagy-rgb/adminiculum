# Operational UX Release File Inventory

## Comparison

Base: `e447168`

Reviewed head: `01949dc`

Total: 38 files, 6 added, 32 modified, 0 deleted.

## Backend Runtime

| Status | File | Classification |
| --- | --- | --- |
| Modified | `Backend/src/modules/agenda/service.ts` | backend compatibility |
| Modified | `Backend/src/modules/cases/workflowSummary.ts` | backend compatibility |
| Modified | `Backend/src/modules/documents/routes.ts` | backend compatibility |

## Backend Tests

| Status | File |
| --- | --- |
| Modified | `Backend/tests/caseWorkflowSummary.test.ts` |
| Modified | `Backend/tests/documentCommentsStaticSafety.test.ts` |
| Modified | `Backend/tests/documentDeleteStaticSafety.test.ts` |
| Modified | `Backend/tests/documentEditorMetadata.route.test.ts` |
| Modified | `Backend/tests/documentEditorProStaticGuards.test.ts` |
| Modified | `Backend/tests/documentEditorTemplateAssembly.test.ts` |
| Modified | `Backend/tests/documentEditorWorkbenchLayoutGuards.test.ts` |
| Modified | `Backend/tests/opsPagesUxCleanupStatic.test.ts` |
| Modified | `Backend/tests/workflowDeadlineAgenda.test.ts` |

## Frontend Runtime

| Status | File | Classification |
| --- | --- | --- |
| Modified | `Frontend/src/app/cases/[caseId]/communications/CommunicationsPageContent.tsx` | communications |
| Modified | `Frontend/src/app/cases/[caseId]/documents/page.tsx` | case documents |
| Modified | `Frontend/src/app/cases/[caseId]/handoff/page.tsx` | handoff |
| Modified | `Frontend/src/app/clause-library/page.tsx` | clause library |
| Modified | `Frontend/src/app/deadlines/page.tsx` | deadlines |
| Modified | `Frontend/src/app/documents/compare/page.tsx` | documents/editor |
| Modified | `Frontend/src/app/intake/page.tsx` | shared workflow |
| Modified | `Frontend/src/app/litigation-workspace/page.tsx` | litigation |
| Modified | `Frontend/src/app/tasks/page.tsx` | tasks |
| Modified | `Frontend/src/app/time-entries/page.tsx` | time entries |
| Modified | `Frontend/src/components/AppShell.tsx` | shared UI |
| Modified | `Frontend/src/components/CaseDetail.tsx` | Case Center |
| Modified | `Frontend/src/components/CasesList.tsx` | cases list |
| Added | `Frontend/src/components/DashboardFocused.tsx` | dashboard |
| Added | `Frontend/src/components/adminiculum/OperationalPrimitives.tsx` | shared UI |
| Added | `Frontend/src/components/cases/CaseCenterOverview.tsx` | Case Center |
| Modified | `Frontend/src/components/cases/CaseWorkspaceNav.tsx` | Case Center/shared navigation |
| Modified | `Frontend/src/components/clients/ClientHouseStylePanel.tsx` | documents/shared display |
| Modified | `Frontend/src/components/editor/DocumentEditorSidePanel.tsx` | editor |
| Modified | `Frontend/src/components/editor/DocumentEditorWorkbench.tsx` | editor |
| Modified | `Frontend/src/components/handoff/HandoffPackagePanel.tsx` | handoff |
| Modified | `Frontend/src/components/litigation/CaseMatterDossierPanel.tsx` | litigation |
| Modified | `Frontend/src/lib/api.ts` | frontend compatibility |
| Added | `Frontend/src/lib/caseLabels.ts` | shared display mapping |

## Documentation At Reviewed Head

| Status | File |
| --- | --- |
| Added | `docs/operational-ux-simplification-1.md` |
| Added | `docs/operational-ux-visual-qa-1.md` |

## Unexpected Files

None.

## Deleted Files

None.

## Protected-Area Diff

All counts are relative to `e447168`.

| Area | Changed files |
| --- | ---: |
| Prisma schema | 0 |
| Prisma migrations | 0 |
| Packages/lockfiles | 0 |
| OpenAPI/Swagger | 0 |
| CORS/app entry | 0 |
| Azure/deploy | 0 |
| Auth config | 0 |
| Client Portal | 0 |
| Outlook/Graph | 0 |
| AI/n8n | 0 |
| Feature flags | 0 |
| Environment files | 0 |

## Artifact Inventories

Machine-readable artifact file hashes are stored outside the repository:

`C:\Users\hubay\AppData\Local\Temp\adminiculum-operational-ux-release\artifact-file-inventory.json`

- Frontend ZIP content: 117 files.
- Backend ZIP content: 143 files.
