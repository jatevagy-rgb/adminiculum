# Narrow Release Approved Change Selection

Date: 2026-07-15
Source branch audited: `hotfix/runtime-shape-20260308`
Current source HEAD: `cab8a5c`
Release branch creation: blocked

## Executive Summary

This document records the commit-selection posture for the planned editor/ops/workflow narrow release. The selection process was intentionally stopped before branch/worktree creation because the authoritative deployment baseline audit could not prove exact active frontend/backend git commits.

The approved product areas remain clear, but no commit should be cherry-picked or reconstructed until a proven baseline commit exists.

## Gate Status

| Gate | Status | Reason |
|---|---|---|
| Active frontend artifact proven | PASS | Azure/Kudu proves active OneDeploy artifact `d21de1cb-46a1-4994-8bcd-45749c42d14e`. |
| Active frontend exact git commit proven | BLOCKED | No git SHA marker; source hash tuple was non-unique. |
| Active backend artifact proven | PASS | Azure/Kudu proves active OneDeploy artifact `f3129580-9574-429a-a1b3-f078b1319cd7`. |
| Active backend exact git commit proven | BLOCKED | No git SHA marker; source hash tuple was non-unique. |
| Release worktree allowed | BLOCKED | Task requires proven exact or reconstructed artifact commit. |

## Approved Release Content

Approved content may be selected later only after baseline proof:

- Case Center.
- Tasks and handoff.
- Documents and communications workflow.
- Deadlines and agenda.
- Responsibility, workload, and time.
- Litigation dossier and case lifecycle.
- Intake and matter opening.
- Professional Tiptap editor.
- Mode C export-only behavior.
- Local DOCX import/export.
- Document comments.
- Editor review safety.
- Editor layout/workbench.
- Operational-page cleanup for `/time-entries`, `/deadlines`, and `/clause-library` truthful unavailable state.
- Tests directly supporting selected runtime changes.
- Concise supporting documentation.

## Excluded Release Content

The narrow release must exclude:

- `Backend/prisma/schema.prisma` changes not already deployed.
- Migration files not already deployed.
- CP-SCHEMA-1.
- Client Portal schema/runtime/stub changes beyond proven deployed baseline.
- Client Portal frontend mock shell/routes.
- OpenAPI/CORS changes.
- Azure/deployment configuration changes.
- Outlook/Graph enablement.
- Contract-generation runtime enablement.
- Clause-library runtime enablement unless separately approved and already deployed.
- Editor server persistence.
- `workspaceText`.
- AI/privacy-gated document-processing content routes.
- AI API integrations.
- n8n.
- Unrelated package changes.
- Broad dependency upgrades.
- Generated deployment artifacts.
- Local ops files.
- Environment files.

## Candidate Commit Selection Table

Because the deployed baseline is not exact, this table is a planning record only. It does not authorize cherry-picking.

| Commit | Subject | Relevant approved content | Unrelated/blocked content | Whole cherry-pick safe? | Selected method | Notes |
|---|---|---|---|---|---|---|
| `e132923` | feat: add workflow case center | Case center workflow | Must inspect for schema/client-portal/OpenAPI drift before selection | Unknown | PENDING_BASELINE_PROOF | Candidate approved area. |
| `4599b66` | feat: connect task and handoff workflows | Tasks/handoff workflow | Must inspect mixed file changes | Unknown | PENDING_BASELINE_PROOF | Candidate approved area. |
| `1499ad7` | feat: connect documents and communications workflow | Documents/communications workflow | Must verify no persistence/schema drift | Unknown | PENDING_BASELINE_PROOF | Candidate approved area. |
| `2818b0b` | feat: add deadlines agenda and notifications workflow | Deadlines/agenda | Backend route additions likely; must inspect for package/schema bleed | Unknown | PENDING_BASELINE_PROOF | Candidate approved area. |
| `d49d410` | feat: connect responsibility workload and time | Responsibility/workload/time | Backend/frontend workflow surface | Unknown | PENDING_BASELINE_PROOF | Candidate approved area. |
| `77381ce` | feat: connect litigation and case lifecycle | Litigation dossier/case lifecycle | Must verify no excluded OpenAPI/CORS/schema changes | Unknown | PENDING_BASELINE_PROOF | Candidate approved area. |
| `a319255` | feat: add intake and matter opening workflow | Intake and matter opening | `Backend/src/index.ts` route mount changes may conflict with current deployed baseline | Unknown | PENDING_BASELINE_PROOF | Candidate approved area. |
| `a8aca78` | feat: build professional contract editor | Professional editor Mode C | Frontend package dependency changes begin in editor work; must isolate allowed dependencies | No until inspected | PENDING_BASELINE_PROOF | Candidate approved area with dependency scrutiny. |
| `adb0161` | feat: prepare editor persistence and versioning | Capability/readiness only | Must not include server persistence or schema | Unknown | PENDING_BASELINE_PROOF | Candidate only if Mode C remains truthful. |
| `77a90a7` | feat: add document editor docx interoperability | Local DOCX import/export | Includes `jszip` dependency; dependency/security review required | No until inspected | PENDING_BASELINE_PROOF | Candidate approved area with package scrutiny. |
| `a376a80` | feat: add editor template readiness bridge | Template capability/readiness | Must not enable contract generation runtime | Unknown | PENDING_BASELINE_PROOF | Candidate only if contract generation remains gated. |
| `d722f09` | feat: harden professional editor workflow | Review/editor safety | Must inspect for unrelated backend changes | Unknown | PENDING_BASELINE_PROOF | Candidate approved area. |
| `b923f33` | feat: add document comments workflow | Document comments | Backend routes/services; must verify no schema migration dependency | Unknown | PENDING_BASELINE_PROOF | Candidate approved area if schema-independent. |
| `5f4e1c8` | feat: overhaul document editor workbench ux | Editor workbench layout/scroll | Frontend runtime only likely, but must inspect | Unknown | PENDING_BASELINE_PROOF | Candidate approved area. |
| `92d280e` | feat: simplify operational pages ux | `/time-entries`, `/deadlines`, `/clause-library` cleanup | Must verify no feature enablement | Unknown | PENDING_BASELINE_PROOF | Candidate approved area. |
| `6800b13` | test: verify authenticated editor and ops ux | Visual QA evidence/tests/docs | No runtime intended | Unknown | PENDING_BASELINE_PROOF | Candidate verification record. |

## Commits Known To Be Excluded From A Narrow Release

The following families appeared in the accumulated source branch and must not be included unless separately approved:

| Family | Reason |
|---|---|
| CP-SCHEMA-1 schema and migration commits | Production apply remains blocked. |
| Client Portal runtime/service/authz stubs and mock frontend routes | Portal remains parked; not part of editor/ops/workflow release. |
| OpenAPI/CORS hardening commits | Explicitly excluded by this release prompt. |
| Outlook Graph adapter skeleton / Outlook enablement | No live Graph or import enablement in this release. |
| Production-compatible baseline/drift docs and schema decisions | Documentation not runtime release content. |
| Contract/document AI/privacy boundary hardening outside selected editor Mode C | Quarantined or separate approval path. |

## Required Selection Method After Baseline Proof

After exact active deployed commits are proven:

1. Create the worktree from the proven common baseline or reconstruct separate frontend/backend baseline strategy.
2. Apply candidate commits one at a time.
3. For each mixed commit:
   - use `CHERRY_PICK_NO_COMMIT_AND_FILTER`, `FILE_LEVEL_RECONSTRUCTION`, or `HUNK_LEVEL_RECONSTRUCTION`;
   - remove excluded schema/migration/portal/OpenAPI/CORS/package changes unless specifically approved;
   - document every selected file/hunk.
4. Validate after each feature family or tightly grouped set.
5. Rebuild frontend with complete production public auth environment, not only `NEXT_PUBLIC_BACKEND_BASE_URL`.
6. Repeat dependency audit and artifact forbidden-string scan.

## Worktree Decision

No worktree was created.

Reason: exact deployed baseline commit is not proven.

## Forensic Update — 2026-07-15

`ACTIVE-ARTIFACT-GIT-BASELINE-FORENSICS-1` narrowed the active artifact mapping:

| Component | Current reconstructed baseline evidence | Release-branch implication |
|---|---|---|
| Frontend | Unique deployment-window source tuple match: `dc0780e`; no embedded git SHA. | Candidate baseline is high-confidence but still not exact. |
| Backend | Runtime-equivalent range including `2cf1594` and `8ce26c0`; active deployment timestamp falls after both and before later feature commits. | Candidate baseline range is narrowed but not unique. |

No release branch or worktree was created by the forensic task. If a human explicitly accepts the reconstructed baseline evidence, the next release-planning task may choose a baseline strategy using frontend candidate `dc0780e` and backend range `2cf1594` / `8ce26c0`. Without that approval or stronger provenance, branch creation remains blocked.

Future narrow-release planning should also add deploy-time provenance, such as an embedded build-info file containing `GIT_SHA`, source branch, build timestamp, package-lock hash, and artifact hash.

## Safety Confirmation

- `hotfix/runtime-shape-20260308` was not rewritten.
- No release branch was created.
- No worktree was created.
- No deployment was performed.
- No Azure configuration was changed.
- No database was queried or modified.
- No Prisma schema or migration file was edited by this task.
- No environment file was created or committed.
