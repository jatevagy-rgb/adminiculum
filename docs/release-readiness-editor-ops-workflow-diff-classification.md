# Release Readiness Diff Classification

Date: 2026-07-15
Base used for conservative backend comparison: `d950e87`
Base used for conservative frontend comparison: `71e4293`
Current HEAD: `6800b13`

## Summary

The current branch is a broad accumulated branch, not a narrowly isolated editor/ops/workflow deploy branch. The diff contains frontend runtime, backend runtime, tests, docs, packages, Prisma schema, and migration files.

| Area | Changed files | Runtime impact | Deploy component | Risk | Validation | Rollback notes |
|---|---|---|---|---|---|---|
| Frontend runtime | Dashboard, CaseDetail, editor, tasks, deadlines, workload, time entries, intake, litigation, portal mock shell, API client | Yes | Frontend | Medium/high due broad surface | Frontend tsc/build/prod-env guard | Roll back frontend independently only if backend APIs remain compatible. |
| Backend runtime | cases, tasks, agenda, intake, responsibility, documents, client portal stubs, CORS/OpenAPI/admin hardening, time entries | Yes | Backend | High due broad API surface | Backend prisma validate/tsc/tests/build | Roll back backend independently only if frontend is compatible. |
| Tests | Many backend Jest suites and static guards | No production runtime | None | Low | Full backend Jest | Keep with code branch. |
| Docs | Large baseline/client-portal/editor/ops readiness corpus | No runtime | None | Low | diff check | Safe to roll forward/back separately. |
| Package/dependency | `Frontend/package.json`, `Frontend/package-lock.json` | Yes, build/runtime dependencies | Frontend | Medium | npm audit/build | Rollback requires previous lockfile/artifact. |
| Environment/config | Env var references and feature flags audited; no Azure files changed by this task | Potential | Backend/frontend | Medium | env matrix | Do not configure during readiness. |
| Schema | `Backend/prisma/schema.prisma` | Potential DB contract change | Backend/DB | Blocking | prisma validate only | Exclude or separately approve/prove. |
| Migrations | `Backend/prisma/migrations/20260702140000_add_client_portal_foundation/migration.sql` | DB mutation if applied | DB | Blocking | No apply | Do not deploy/apply without separate migration proof. |
| Deployment scripts | No `.github` deployment file changes detected in candidate check | None | None | Low | diff check | N/A. |
| Feature flags | Client portal, editor/doc processing, contracts, clause library, communications, Outlook, runtime-admin flags | Behavior gated | Backend/frontend | Medium | route tests/smoke | Flags are kill switches, not deployment approval. |
| Generated/untracked artifacts | Root untracked operational folders/files remain present | None if not staged | None | Medium if accidentally staged | explicit git add only | Leave untouched. |

## Explicit confirmations

- `Backend/prisma/schema.prisma` changed: **yes**.
- Migration files added: **yes** (`20260702140000_add_client_portal_foundation`).
- Package files changed: **yes** (`Frontend/package.json`, `Frontend/package-lock.json`).
- Azure/deployment files changed: **not detected in candidate diff**.
- OpenAPI/CORS changed: **yes** (`Backend/src/openapi/publicSpec.ts`, `Backend/src/http/corsPolicy.ts`, `Backend/src/index.ts`).
- Client Portal changed: **yes**, stubs/mock shell/routes/types/tests/docs; still parked.
- Outlook/Graph changed: **yes**, Graph adapter skeleton appears in candidate range; no live Graph connector.
- AI/n8n code added: **no n8n detected in core runtime audit; AI/privacy boundaries are gated/quarantined**.

## Candidate diff sample

```text
A	Backend/prisma/migrations/20260702140000_add_client_portal_foundation/migration.sql
M	Backend/prisma/schema.prisma
A	Backend/src/http/corsPolicy.ts
M	Backend/src/index.ts
A	Backend/src/modules/agenda/deadlineEngine.ts
A	Backend/src/modules/agenda/routes.ts
A	Backend/src/modules/agenda/service.ts
M	Backend/src/modules/anonymize/routes.ts
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
A	Backend/src/modules/client-portal/authorization.ts
A	Backend/src/modules/client-portal/featureGate.ts
A	Backend/src/modules/client-portal/mappers.ts
A	Backend/src/modules/client-portal/routes.ts
A	Backend/src/modules/client-portal/services.ts
A	Backend/src/modules/client-portal/types.ts
M	Backend/src/modules/clients/routes.ts
A	Backend/src/modules/communications/outlookGraph.adapter.ts
M	Backend/src/modules/communications/routes.ts
M	Backend/src/modules/contracts/PACK_MANIFEST.md
M	Backend/src/modules/contracts/README.md
M	Backend/src/modules/contracts/routes.ts
A	Backend/src/modules/contracts/templateCapabilities.ts
A	Backend/src/modules/documentEditor/contentSchema.ts
A	Backend/src/modules/documentEditor/service.ts
A	Backend/src/modules/documents/authorization.ts
A	Backend/src/modules/documents/documentComments.service.ts
A	Backend/src/modules/documents/logging.ts
M	Backend/src/modules/documents/reviewSuggestions.routes.ts
M	Backend/src/modules/documents/routes.ts
A	Backend/src/modules/intake/routes.ts
M	Backend/src/modules/legal-analyses/routes.ts
M	Backend/src/modules/notifications/services.ts
A	Backend/src/modules/responsibility/capabilities.ts
A	Backend/src/modules/responsibility/routes.ts
A	Backend/src/modules/responsibility/service.ts
M	Backend/src/modules/tasks/routes.ts
M	Backend/src/modules/tasks/services.ts
A	Backend/src/modules/workgroups/authorization.ts
M	Backend/src/modules/workgroups/routes.ts
A	Backend/src/openapi/publicSpec.ts
M	Backend/src/routes/clientPortal.ts
M	Backend/src/routes/dbcheck.ts
M	Backend/src/routes/migrate.ts
M	Backend/src/routes/timeEntries.ts
A	Backend/tests/caseCollaboratorsAuthz.test.ts
A	Backend/tests/caseLifecycle.test.ts
A	Backend/tests/caseWorkItems.test.ts
A	Backend/tests/caseWorkflowSummary.test.ts
A	Backend/tests/casesClientRoleAuthz.test.ts
A	Backend/tests/clientIdentityFieldsAuthz.test.ts
A	Backend/tests/clientLookup.test.ts
A	Backend/tests/clientPortalAuthorizationStubs.test.ts
A	Backend/tests/clientPortalCpSchemaBlockGuards.test.ts
A	Backend/tests/clientPortalDisabledRouteMatrix.test.ts
A	Backend/tests/clientPortalDtoMappers.test.ts
A	Backend/tests/clientPortalInertShellStaticGuards.test.ts
A	Backend/tests/clientPortalServiceStubs.test.ts
A	Backend/tests/contractsBoundary.test.ts
A	Backend/tests/corsExposure.test.ts
A	Backend/tests/documentAiBoundary.test.ts
A	Backend/tests/documentComments.route.test.ts
A	Backend/tests/documentCommentsStaticSafety.test.ts
A	Backend/tests/documentEditorContentSchema.test.ts
A	Backend/tests/documentEditorDocxInterop.test.ts
A	Backend/tests/documentEditorMetadata.route.test.ts
A	Backend/tests/documentEditorProStaticGuards.test.ts
A	Backend/tests/documentEditorReviewQuality.test.ts
A	Backend/tests/documentEditorTemplateAssembly.test.ts
A	Backend/tests/documentEditorWorkbenchLayoutGuards.test.ts
A	Backend/tests/documentsWorkspaceTextAiGate.test.ts
A	Backend/tests/documentsWorkspaceTextAuthz.test.ts
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
A	Backend/tests/openapiExposure.test.ts
A	Backend/tests/openingTasks.test.ts
A	Backend/tests/opsPagesUxCleanupStatic.test.ts
A	Backend/tests/outlookGraph.adapter.test.ts
M	Backend/tests/routeFeatureGuards.test.ts
A	Backend/tests/sourceLinkedTasks.test.ts
A	Backend/tests/taskWorkflowTransitions.test.ts
A	Backend/tests/workflowDeadlineAgenda.test.ts
A	Backend/tests/workflowResponsibilityWorkloadTime.test.ts
A	Backend/tests/workloadRecordsAuthz.test.ts
M	Frontend/package-lock.json
M	Frontend/package.json
M	Frontend/src/app/clause-library/page.tsx
M	Frontend/src/app/deadlines/page.tsx
A	Frontend/src/app/documents/[documentId]/edit/page.tsx
M	Frontend/src/app/editor-lab/page.tsx
M	Frontend/src/app/globals.css
A	Frontend/src/app/intake/page.tsx
M	Frontend/src/app/litigation-workspace/page.tsx
A	Frontend/src/app/portal/PortalMockShell.tsx
A	Frontend/src/app/portal/documents/page.tsx
A	Frontend/src/app/portal/matters/[matterId]/page.tsx
A	Frontend/src/app/portal/matters/page.tsx
A	Frontend/src/app/portal/mockPortalData.ts
A	Frontend/src/app/portal/page.tsx
A	Frontend/src/app/portal/uploads/page.tsx
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
M	docs/PATCH_DOCUMENT_EDITING_UI_PLAN.md
M	docs/adminiculum-backend-capability-matrix.md
M	docs/adminiculum-product-readiness-roadmap.md
A	docs/architecture-ai-n8n-boundary.md
A	docs/authenticated-visual-qa-and-editor-scroll-fix-1.md
A	docs/baseline-bootstrap-strategy-clean-prisma-proof.md
A	docs/baseline-object-inventory-local-bootstrap.md
A	docs/case-collaborators-authz-audit.md
A	docs/cases-client-role-semantics-decision.md
A	docs/client-identity-role-fields-audit.md
A	docs/client-portal-authz-model-design.md
A	docs/client-portal-authz-stub-design-2.md
A	docs/client-portal-backend-service-stubs-design.md
A	docs/client-portal-cp-schema-1-approval-readiness-summary.md
A	docs/client-portal-cp-schema-1-collision-resolution-and-patch-strategy.md
A	docs/client-portal-cp-schema-1-enum-and-ref-decision.md
A	docs/client-portal-cp-schema-1-field-spec-draft.md
A	docs/client-portal-cp-schema-1-human-approval-packet.md
A	docs/client-portal-cp-schema-1-legacy-candidate-block-inventory.md
A	docs/client-portal-cp-schema-1-migration-plan-draft.md
A	docs/client-portal-cp-schema-1-model-naming-decision.md
A	docs/client-portal-cp-schema-1-next-gates.md
A	docs/client-portal-cp-schema-1-operator-verification-checklist.md
A	docs/client-portal-cp-schema-1-prisma-draft-nonapplied.md
A	docs/client-portal-cp-schema-1-readiness-checkpoint-2.md
A	docs/client-portal-cp-schema-1-relation-and-index-spec-draft.md
A	docs/client-portal-cp-schema-1-risk-register.md
A	docs/client-portal-cp-schema-1-schema-patch-review-checklist.md
A	docs/client-portal-current-code-inventory.md
A	docs/client-portal-design-rollup.md
A	docs/client-portal-dto-publication-boundary.md
A	docs/client-portal-frontend-shell-design.md
A	docs/client-portal-implementation-checkpoint.md
A	docs/client-portal-inert-api-shell-checkpoint.md
A	docs/client-portal-product-boundary-design.md
A	docs/client-portal-publication-approval-audit-workflow.md
A	docs/client-portal-publication-artifact-model-split-plan.md
A	docs/client-portal-publication-payload-validator-design.md
A	docs/client-portal-read-path-grant-resolution-design.md
A	docs/client-portal-runtime-skeleton-harden-design.md
A	docs/client-portal-schema-candidate-design-2.md
A	docs/client-portal-schema-readiness-design.md
A	docs/client-portal-submission-to-publication-triage-workflow.md
A	docs/client-portal-tenant-isolated-api-contract.md
A	docs/client-portal-tenant-isolation-login-ui-alignment.md
A	docs/client-portal-v1-clean-local-migration-chain-proof.md
A	docs/client-portal-v1-clean-local-migration-target-preflight.md
A	docs/client-portal-v1-cp-schema1-baseline-proof-unblocking-preflight.md
A	docs/client-portal-v1-data-contract-design.md
A	docs/client-portal-v1-db-drift-readiness-audit.md
A	docs/client-portal-v1-identity-authorization-plan.md
A	docs/client-portal-v1-migration-history-hygiene-preflight.md
A	docs/client-portal-v1-schema-migration-draft-review.md
A	docs/client-portal-v1-schema-migration-split-plan.md
A	docs/client-portal-v1-security-architecture-consolidation.md
A	docs/client-portal-v1-security-contract-audit.md
A	docs/client-portal-v1-ui-ia-design.md
A	docs/client-portal-write-path-submission-boundary-design.md
A	docs/communication-outlook-intake-closeout.md
A	docs/connector-domain-model-split-plan.md
A	docs/connector-migration-draft-review.md
A	docs/connector-schema-implementation-preflight.md
A	docs/connector-security-data-boundary-design.md
A	docs/cp-schema-1-clone-apply-proof-blocked-migration-history.md
A	docs/cp-schema-1-clone-apply-proof-gate.md
A	docs/cp-schema-1-clone-divergence-robust-recheck.md
A	docs/cp-schema-1-clone-historical-migration-object-checks.md
A	docs/cp-schema-1-clone-migration-history-reconciliation-plan.md
A	docs/cp-schema-1-clone-transactional-proof.md
A	docs/cp-schema-1-fresh-clone-verification-no-go.md
A	docs/cp-schema-1-fresh-pitr-clone-handoff-runbook.md
A	docs/cp-schema-1-implementation-preflight.md
A	docs/cp-schema-1-migration-sql-draft-review.md
A	docs/document-comments-acceptance.md
A	docs/document-comments-api-contract.md
A	docs/document-comments-backend-and-editor-1.md
```
