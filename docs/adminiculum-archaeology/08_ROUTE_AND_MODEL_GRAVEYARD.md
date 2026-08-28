# 08 — Route & Model Graveyard

> Historical route/page + backend-route-family + model/domain inventory. Canonical `50945ecd`. Confidence `PROVEN`/`STRONGLY_INDICATED`/`UNPROVEN`. Important correction up front: **several "deleted" pages actually still exist at canonical.**

## Frontend route / page inventory (canonical `809d602` box → `50945ecd`)

Enumerated `git ls-tree -r 50945ecd -- Frontend/src/app | grep page.tsx`. All routes below are **live** — none were deleted at canonical while their feature remained valuable.

| Route | Status at canonical | Capability | Notes |
|---|---|---|---|
| `/` | LIVE | dashboard (two UI modes) | operational-case, workload cards, resilience |
| `/cases` | LIVE | case list + 6-step new-case (`CaseIntakeDialog`) | post-intake default path |
| `/cases/[caseId]` | LIVE | case overview cockpit + tabs | — |
| `/cases/[caseId]/documents` | LIVE | document ledger + review/compare/annotations | `DocumentReviewWorkflowPanel`, `ComparisonWorkspace` wired |
| `/cases/[caseId]/communications` | LIVE | per-case communication ledger | case-first context (this workspace) |
| `/cases/[caseId]/generate` + `/generate/assembly` | LIVE (redirect/partial) | template generation + clause assembly | legacy generator redirected to workspace |
| `/cases/[caseId]/review/[documentId]` + `/edit` | LIVE | per-document review lifecycle | — |
| `/documents/compare` | LIVE (legacy parallel surface) | editor workspace; calls gated `getDocumentText`/`saveWorkspaceDocumentVersion` | duplicates `ComparisonWorkspace` (see `06`) |
| `/communications` | LIVE | global triage inbox (`CommunicationsOverview`) | "Outlook frissítése" sync button |
| `/notifications` | LIVE | "Kommunikációs munkatér" (`CommunicationWorkspace`) | richer inbox, no sync button |
| `/clients` | LIVE | client list + new-client modal | — |
| `/clients/[clientId]` | LIVE | client dossier | "Összes kommunikáció →" |
| `/clients/[clientId]/communications` | **branch-only** (`peterfi/case-first-communication-context`) | client communication history | not canonical |
| `/clients/[clientId]/workgroups` | LIVE | workgroups / workload | — |
| `/tasks` | LIVE | task submission + review workspace | `TaskSubmissionWorkspace` |
| `/reviews` | LIVE | task review queue | `TaskReviewWorkspace`, `listTaskReviewQueue` |
| `/deadlines` | LIVE | workflow agenda + task deadlines | `getWorkflowAgenda` |
| `/time-entries` | LIVE | time entries (case-aware, matter prefill) + timesheet report | — |
| `/workload` | LIVE | workload cards | — |
| `/intake` | LIVE | matter intake queue | `modules/intake` |
| `/clause-library` | LIVE | clause library CRUD | `getClauseLibraryClauses` |
| `/settings` | LIVE (narrowed) | workflows + work-packages admin; UI pack | no general settings/theme page |
| `/search` | LIVE | search | — |
| `/matters` | LIVE but **demoted** → `redirect('/cases')` | matter capability folded under `/cases` | dead route target |
| `/portal/register`, `/portal/login`, `/portal/onboarding`, `/portal/...` | LIVE | client portal identity/onboarding | CASE_RELAY/ORG via `OrganizationPortalViews` |
| `/portal/megkeresesek/*` | LIVE | customer case intake (distinct from membership) | `[intakeId]`, `uj` |
| `/stitch` | LIVE (legacy) | alternative layout | inactive/legacy |
| `/editor-lab`, `/litigation-workspace` | LIVE | editor / litigation workspace | — |

> **PROVEN statement:** no page route that held unique value was deleted at canonical. `/tasks` and `/reviews` were iteratively re-shaped into the task-lifecycle subviews but their routes survived.

## Backend route families (canonical `Backend/src/modules` + `index.ts` mounts)

Present & mounted: `auth`, `users`, `cases` (CRUD + lifecycle + intake + work-items + workflow-graph/history + workflow-summary + workflow-templates), `tasks` (CRUD + submission + review + review-queue + auto-generate + attention), `clients`, `documents` (document + review + annotations + comparison + version + text/save-workspace-version + work-context), `contracts` (template generation + comparison + revision + finalize), `communications` (list/detail + link-case/link-client/create-case/extract-task/extract-deadline/link-task/add-attachment + outlook sync/import-dry-run/import), `anonymize`, `legal-analyses`, `clause-library`, `review-notes`, `handoff-packages`, `timesheet-reports`, `news-feed`, `workgroups`, `agenda`, `sharepoint`, `upload-security`, `comparison`, `generation-draft`, `documentEditor`, `intake`, `responsibility`, `work-package-admin`, `client-identity`, `client-workspace`, `client-organization`, `client-interaction`, `client-publication`, `client-company`, `client-contracts`, `company-workspace`, `compliance`/`compliance-foundation`, `notifications`.

**No legacy backend module was dropped** — the box moved `src/modules/*` → `Backend/src/modules/*` and *added* the client-domain suites. `src/routes/{clientPortal,matters,timeEntries}.ts` are legacy root route files that still mount alongside `modules/`.

## Model / domain graveyard (canonical = 126 models)

| Model | Classification | Evidence |
|---|---|---|
| `ClientPortalGrant.clientUserId` | **RENAMED→MIGRATED** (nullable String?, `clientPortalIdentityId` added; both coexist) | schema @ canonical |
| `ClientPortalAccountType` | **MIGRATED** (INDIVIDUAL/ORGANIZATION_MEMBER → INDIVIDUAL, identity-derived) | origin `9809c4c` |
| `ClientMatterPublication` | **MIGRATED** (pub foundation) | origin `2975942` |
| `ClientSubmission` / `ClientQuestionThread` / `ClientOperatingProfile` | **MIGRATED** | origins `6fc5582`/`b225752`/`1ae6b9b` |
| `OrganizationPerson` | **RENAMED** (org-units → person-centric) | origin `0b2a7d6` |
| `WorkItem` / `WorkPackage` / `WorkflowTask` / `Deadline` (unqualified) | **NEVER-NAMED / DUPLICATED** — never existed as model names; functionality lives as `Task`, `WorkflowTemplate`, `CaseWorkPackage*`, `CaseIntakeDeadline` | schema search |
| `Communication` thread/unread entities | **SEMANTICS_LOST / SHOULD_NOT_RETURN for now** (no thread/unread model; honest empty states; needs schema for a real thread model — `THREAD_PERSISTENCE_FOLLOWUP=YES`) | schema @ canonical |
| `WorkflowInstance` / `workItem` / `Workflow` (single engine) | **DOES NOT EXIST** — DAG stamped on `Task` columns | schema @ canonical |
| `DocumentVersion`-editor working-copy semantics | **REMOVED BY DESIGN** (guards strip autosave/track-changes/workspaceText) — do NOT return a browser clone | `documentEditorProStaticGuards.test.ts` |
| Mock portal uploads/documents (synthetic) | **SHOULD_NOT_RETURN** — `mockPortalData`, violates product-truthfulness; superseded by CP identity model | `codex/ops-pages-ux-cleanup-1`, `claude/next-development` (never merged) |

## Honest graveyard conclusions

- **Correctly removed:** the mock portal generation (synthetic data), the non-portal UX panel duplicates (`Ügyállapot`/`Adatforrások` decorative boxes in legacy `CaseDetail`), the browser-Word-clone save semantics.
- **Renamed/migrated, not lost:** clientUserId→identity, account type, organization-persons, matters→`/cases`.
- **Duplicated, not removed:** `app/documents/compare` vs `ComparisonWorkspace`; two communication inboxes (`/communications` + `/notifications`).
- **Recovery candidates (no backend change):** DOCX/PDF text-diff (extractor exists), version-history presentation, review-lifecycle wiring from the documents page.
