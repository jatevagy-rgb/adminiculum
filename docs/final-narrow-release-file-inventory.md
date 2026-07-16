# Final Narrow Release File Inventory

Date: 2026-07-16
Release branch: `release/editor-ops-workflow-1`
Artifact source commit: `7392a6c`

## Frontend Diff Inventory vs `dc0780e`

```text
M	Frontend/package-lock.json
M	Frontend/package.json
M	Frontend/src/app/cases/[caseId]/documents/page.tsx
M	Frontend/src/app/clause-library/page.tsx
M	Frontend/src/app/deadlines/page.tsx
A	Frontend/src/app/documents/[documentId]/edit/page.tsx
M	Frontend/src/app/editor-lab/page.tsx
M	Frontend/src/app/globals.css
A	Frontend/src/app/intake/page.tsx
M	Frontend/src/app/litigation-workspace/page.tsx
M	Frontend/src/app/tasks/page.tsx
M	Frontend/src/app/time-entries/page.tsx
A	Frontend/src/app/workload/page.tsx
M	Frontend/src/components/AppShell.tsx
M	Frontend/src/components/AuthenticatedApp.tsx
M	Frontend/src/components/CaseDetail.tsx
M	Frontend/src/components/Dashboard.tsx
A	Frontend/src/components/editor/DocumentEditorSidePanel.tsx
A	Frontend/src/components/editor/DocumentEditorToolbar.tsx
A	Frontend/src/components/editor/DocumentEditorWorkbench.tsx
A	Frontend/src/components/editor/DocumentOutline.tsx
A	Frontend/src/components/editor/editorSetup.ts
A	Frontend/src/components/editor/extensions.ts
A	Frontend/src/components/intake/CaseIntakeReadinessPanel.tsx
A	Frontend/src/components/litigation/CaseMatterDossierPanel.tsx
M	Frontend/src/lib/api.ts
A	Frontend/src/lib/editor/clauseNumbering.ts
A	Frontend/src/lib/editor/docxInterop.ts
A	Frontend/src/lib/editor/editorModel.ts
A	Frontend/src/lib/editor/editorSchemaValidator.ts
A	Frontend/src/lib/editor/fieldTokens.ts
A	Frontend/src/lib/editor/htmlExport.ts
A	Frontend/src/lib/editor/insertionPresets.ts
A	Frontend/src/lib/editor/pasteSanitizer.ts
A	Frontend/src/lib/editor/plainTextExport.ts
A	Frontend/src/lib/editor/reviewQuality.ts
A	Frontend/src/lib/editor/workbenchLayout.ts
```

## Backend Diff Inventory vs `8ce26c0`

```text
M	Backend/src/index.ts
A	Backend/src/modules/agenda/deadlineEngine.ts
A	Backend/src/modules/agenda/routes.ts
A	Backend/src/modules/agenda/service.ts
A	Backend/src/modules/cases/activity.ts
A	Backend/src/modules/cases/authorization.ts
A	Backend/src/modules/cases/intakeReadiness.ts
A	Backend/src/modules/cases/intakeService.ts
A	Backend/src/modules/cases/lifecycle.ts
A	Backend/src/modules/cases/lifecycleService.ts
A	Backend/src/modules/cases/litigationDossier.ts
M	Backend/src/modules/cases/routes.ts
M	Backend/src/modules/cases/services.ts
A	Backend/src/modules/cases/workItems.ts
A	Backend/src/modules/cases/workflowSummary.ts
M	Backend/src/modules/clients/routes.ts
M	Backend/src/modules/communications/routes.ts
M	Backend/src/modules/contracts/PACK_MANIFEST.md
M	Backend/src/modules/contracts/README.md
M	Backend/src/modules/contracts/routes.ts
A	Backend/src/modules/contracts/templateCapabilities.ts
A	Backend/src/modules/documentEditor/contentSchema.ts
A	Backend/src/modules/documentEditor/service.ts
A	Backend/src/modules/documents/authorization.ts
A	Backend/src/modules/documents/documentComments.service.ts
M	Backend/src/modules/documents/routes.ts
M	Backend/src/modules/documents/services.ts
A	Backend/src/modules/intake/routes.ts
M	Backend/src/modules/notifications/services.ts
A	Backend/src/modules/responsibility/capabilities.ts
A	Backend/src/modules/responsibility/routes.ts
A	Backend/src/modules/responsibility/service.ts
M	Backend/src/modules/tasks/routes.ts
M	Backend/src/modules/tasks/services.ts
M	Backend/src/routes/timeEntries.ts
A	Backend/tests/caseLifecycle.test.ts
A	Backend/tests/caseWorkItems.test.ts
A	Backend/tests/caseWorkflowSummary.test.ts
A	Backend/tests/clientLookup.test.ts
A	Backend/tests/contractsBoundary.test.ts
A	Backend/tests/documentComments.route.test.ts
A	Backend/tests/documentCommentsStaticSafety.test.ts
A	Backend/tests/documentDelete.route.test.ts
A	Backend/tests/documentDelete.service.test.ts
A	Backend/tests/documentDeleteStaticSafety.test.ts
A	Backend/tests/documentEditorContentSchema.test.ts
A	Backend/tests/documentEditorDocxInterop.test.ts
A	Backend/tests/documentEditorMetadata.route.test.ts
A	Backend/tests/documentEditorProStaticGuards.test.ts
A	Backend/tests/documentEditorReviewQuality.test.ts
A	Backend/tests/documentEditorTemplateAssembly.test.ts
A	Backend/tests/documentEditorWorkbenchLayoutGuards.test.ts
A	Backend/tests/editorClauseNumbering.test.ts
A	Backend/tests/editorFieldTokensAndExport.test.ts
A	Backend/tests/editorPasteSanitizer.test.ts
A	Backend/tests/editorSchemaValidation.test.ts
A	Backend/tests/editorWorkbenchLayoutState.test.ts
A	Backend/tests/intakeMatterOpeningStaticGuards.test.ts
A	Backend/tests/intakeQueue.test.ts
A	Backend/tests/intakeReadiness.test.ts
A	Backend/tests/litigationCaseLifecycleStaticGuards.test.ts
A	Backend/tests/litigationDossier.test.ts
A	Backend/tests/openingTasks.test.ts
A	Backend/tests/opsPagesUxCleanupStatic.test.ts
A	Backend/tests/sourceLinkedTasks.test.ts
A	Backend/tests/taskWorkflowTransitions.test.ts
A	Backend/tests/workflowDeadlineAgenda.test.ts
A	Backend/tests/workflowResponsibilityWorkloadTime.test.ts
```

## Release Diff Inventory vs `27ab674`

```text
M	Backend/src/index.ts
A	Backend/src/modules/agenda/deadlineEngine.ts
A	Backend/src/modules/agenda/routes.ts
A	Backend/src/modules/agenda/service.ts
A	Backend/src/modules/cases/activity.ts
A	Backend/src/modules/cases/authorization.ts
A	Backend/src/modules/cases/intakeReadiness.ts
A	Backend/src/modules/cases/intakeService.ts
A	Backend/src/modules/cases/lifecycle.ts
A	Backend/src/modules/cases/lifecycleService.ts
A	Backend/src/modules/cases/litigationDossier.ts
M	Backend/src/modules/cases/routes.ts
M	Backend/src/modules/cases/services.ts
A	Backend/src/modules/cases/workItems.ts
A	Backend/src/modules/cases/workflowSummary.ts
M	Backend/src/modules/clients/routes.ts
M	Backend/src/modules/communications/routes.ts
M	Backend/src/modules/contracts/PACK_MANIFEST.md
M	Backend/src/modules/contracts/README.md
M	Backend/src/modules/contracts/routes.ts
A	Backend/src/modules/contracts/templateCapabilities.ts
A	Backend/src/modules/documentEditor/contentSchema.ts
A	Backend/src/modules/documentEditor/service.ts
A	Backend/src/modules/documents/authorization.ts
A	Backend/src/modules/documents/documentComments.service.ts
M	Backend/src/modules/documents/routes.ts
M	Backend/src/modules/documents/services.ts
A	Backend/src/modules/intake/routes.ts
M	Backend/src/modules/notifications/services.ts
A	Backend/src/modules/responsibility/capabilities.ts
A	Backend/src/modules/responsibility/routes.ts
A	Backend/src/modules/responsibility/service.ts
M	Backend/src/modules/tasks/routes.ts
M	Backend/src/modules/tasks/services.ts
M	Backend/src/routes/timeEntries.ts
A	Backend/tests/caseLifecycle.test.ts
A	Backend/tests/caseWorkItems.test.ts
A	Backend/tests/caseWorkflowSummary.test.ts
A	Backend/tests/clientLookup.test.ts
A	Backend/tests/contractsBoundary.test.ts
A	Backend/tests/documentComments.route.test.ts
A	Backend/tests/documentCommentsStaticSafety.test.ts
A	Backend/tests/documentDelete.route.test.ts
A	Backend/tests/documentDelete.service.test.ts
A	Backend/tests/documentDeleteStaticSafety.test.ts
A	Backend/tests/documentEditorContentSchema.test.ts
A	Backend/tests/documentEditorDocxInterop.test.ts
A	Backend/tests/documentEditorMetadata.route.test.ts
A	Backend/tests/documentEditorProStaticGuards.test.ts
A	Backend/tests/documentEditorReviewQuality.test.ts
A	Backend/tests/documentEditorTemplateAssembly.test.ts
A	Backend/tests/documentEditorWorkbenchLayoutGuards.test.ts
A	Backend/tests/editorClauseNumbering.test.ts
A	Backend/tests/editorFieldTokensAndExport.test.ts
A	Backend/tests/editorPasteSanitizer.test.ts
A	Backend/tests/editorSchemaValidation.test.ts
A	Backend/tests/editorWorkbenchLayoutState.test.ts
A	Backend/tests/intakeMatterOpeningStaticGuards.test.ts
A	Backend/tests/intakeQueue.test.ts
A	Backend/tests/intakeReadiness.test.ts
A	Backend/tests/litigationCaseLifecycleStaticGuards.test.ts
A	Backend/tests/litigationDossier.test.ts
A	Backend/tests/openingTasks.test.ts
A	Backend/tests/opsPagesUxCleanupStatic.test.ts
A	Backend/tests/sourceLinkedTasks.test.ts
A	Backend/tests/taskWorkflowTransitions.test.ts
A	Backend/tests/workflowDeadlineAgenda.test.ts
A	Backend/tests/workflowResponsibilityWorkloadTime.test.ts
M	Frontend/package-lock.json
M	Frontend/package.json
M	Frontend/src/app/cases/[caseId]/documents/page.tsx
M	Frontend/src/app/clause-library/page.tsx
M	Frontend/src/app/deadlines/page.tsx
A	Frontend/src/app/documents/[documentId]/edit/page.tsx
M	Frontend/src/app/editor-lab/page.tsx
M	Frontend/src/app/globals.css
A	Frontend/src/app/intake/page.tsx
M	Frontend/src/app/litigation-workspace/page.tsx
M	Frontend/src/app/tasks/page.tsx
M	Frontend/src/app/time-entries/page.tsx
A	Frontend/src/app/workload/page.tsx
M	Frontend/src/components/AppShell.tsx
M	Frontend/src/components/AuthenticatedApp.tsx
M	Frontend/src/components/CaseDetail.tsx
M	Frontend/src/components/Dashboard.tsx
A	Frontend/src/components/editor/DocumentEditorSidePanel.tsx
A	Frontend/src/components/editor/DocumentEditorToolbar.tsx
A	Frontend/src/components/editor/DocumentEditorWorkbench.tsx
A	Frontend/src/components/editor/DocumentOutline.tsx
A	Frontend/src/components/editor/editorSetup.ts
A	Frontend/src/components/editor/extensions.ts
A	Frontend/src/components/intake/CaseIntakeReadinessPanel.tsx
A	Frontend/src/components/litigation/CaseMatterDossierPanel.tsx
M	Frontend/src/lib/api.ts
A	Frontend/src/lib/editor/clauseNumbering.ts
A	Frontend/src/lib/editor/docxInterop.ts
A	Frontend/src/lib/editor/editorModel.ts
A	Frontend/src/lib/editor/editorSchemaValidator.ts
A	Frontend/src/lib/editor/fieldTokens.ts
A	Frontend/src/lib/editor/htmlExport.ts
A	Frontend/src/lib/editor/insertionPresets.ts
A	Frontend/src/lib/editor/pasteSanitizer.ts
A	Frontend/src/lib/editor/plainTextExport.ts
A	Frontend/src/lib/editor/reviewQuality.ts
A	Frontend/src/lib/editor/workbenchLayout.ts
A	docs/document-delete-safety-and-ux-1.md
A	docs/frontend-dependency-vulnerability-audit-2026-07.md
A	docs/narrow-release-approved-change-selection.md
A	docs/narrow-release-authenticated-predeploy-smoke-1.md
A	docs/narrow-release-component-baseline-assembly.md
A	docs/narrow-release-editor-ops-workflow-1.md
A	docs/narrow-release-go-no-go.md
A	docs/narrow-release-rollback-plan.md
A	docs/narrow-release-runtime-compatibility-matrix.md
```

## Classification Summary

| Class | Files | Notes |
| --- | ---: | --- |
| workflow core | 24 | Agenda, cases, tasks, workload/responsibility/time/intake/litigation. |
| editor | 18 | Editor workbench, DOCX, model/schema/export/sanitize helpers. |
| comments/review | 6 | Document comments, editor metadata, review-quality tests/helpers. |
| DOCX | 4 | Frontend `jszip` dependency and local DOCX interop helpers/tests. |
| operational pages | 9 | Deadlines, workload, time entries, intake, tasks, litigation UI. |
| document deletion | 9 | Delete route/service/API/frontend/tests/docs. |
| compatibility fix | 6 | Projection/enum/task/agenda/case compatibility adjustments. |
| test/support | 35 | Backend focused and static guard tests. |
| unexpected | 0 | No unexpected runtime files identified. |
