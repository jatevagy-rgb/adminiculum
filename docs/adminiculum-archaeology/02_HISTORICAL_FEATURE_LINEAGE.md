# 02 — Historical Feature Lineage

Assigns to every MR capability ALL applicable historical-state labels. Labels defined by the audit brief. Confidence noted where a label is STRONGLY_INDICATED vs PROVEN. Evidence lives in the domain files (`03`–`08`) and register (`01`).

**Label legend:** `CC=KEEP_CANDIDATES` CURRENT_CANONICAL_KEEP_CANDIDATES (recommended primary action KEEP; **does NOT** imply end-to-end production-wired — see `17` count reconciliation) · `CC_UNREACH` CURRENT_CANONICAL_BUT_UNREACHABLE · `CC_BE` CURRENT_CANONICAL_BACKEND_ONLY · `CC_UI` CURRENT_CANONICAL_UI_ONLY · `CC_PARTIAL` CURRENT_CANONICAL_PARTIAL · `OLD_WORK` OLD_VERSION_WORKING · `OLD_MORE` OLD_VERSION_MORE_COMPLETE_THAN_CURRENT · `OLD_PARTIAL` OLD_VERSION_PARTIAL · `OLD_CORRECT` OLD_VERSION_SUPERSEDED_CORRECTLY · `OLD_LOST` OLD_VERSION_SUPERSEDED_WITH_LOST_SEMANTICS · `DRAFT_MORE` DRAFT_BRANCH_MORE_COMPLETE · `DRAFT_PARTIAL` DRAFT_BRANCH_PARTIAL · `DRAFT_STALE` DRAFT_BRANCH_STALE_ARCHITECTURE · `DRAFT_REPLAY` DRAFT_BRANCH_SEMANTIC_REPLAY_CANDIDATE · `REMOVED_BE` REMOVED_FROM_UI_BUT_BACKEND_EXISTS · `REMOVED_UI` REMOVED_FROM_BACKEND_BUT_UI_REMAINS · `RENAMED` RENAMED_NOT_REMOVED · `DUP` DUPLICATED_IMPLEMENTATION · `PARALLEL` PARALLEL_ENGINE · `DEAD_END` DEAD_END_IMPLEMENTATION · `PLANNED` PLANNED_ONLY · `GREENFIELD` TRUE_GREENFIELD · `UNKNOWN`.

## Case domain

| MR | Lineage labels |
|----|----------------|
| MR-001 | CC_WORKING (cockpit is the single case overview); OLD_CORRECT (legacy `CaseDetail` card "Ügyállapot/adatforrások" decorative boxes removed) |
| MR-002 | CC_WORKING; CC_PARTIAL (case type set inconsistently across creation paths) |
| MR-003 | CC_WORKING; DRAFT_PARTIAL (wp4/wp5a/wp5b branches ahead); PARALLEL with work-package vs intake initial-tasks |
| MR-004 | CC_WORKING (DAG engine); PARALLEL (V1 `workflow/` + V2 `cases/workflow.ts` engines coexist, both partially dead); DEAD_END (V2 `cases/workflow.ts` has zero importers) |
| MR-005 | CC_WORKING |
| MR-006 | CC_WORKING |
| MR-007 | CC_WORKING |
| MR-008 | CC_WORKING; CC_PARTIAL (intake typed `caseIntakeDeadline` not mirrored to `Case.deadline`; agenda reads `Case.deadline`) |
| MR-009 | CC_WORKING |
| MR-010 | CC_WORKING; PARALLEL (intake transactional path vs legacy createCase) |
| MR-011 | CC_WORKING (≥4 paths); PARALLEL; CC_PARTIAL (work-package snapshot only on legacy path) |
| MR-012 | CC_BE (document review only) — no case-creation reviewer assignment; GREENFIELD for case-level reviewer |
| MR-013 | CC_BE; CC_UNREACH (internal intake paths create no portal artifact) |

## Client / portal / org domain

| MR | Lineage labels |
|----|----------------|
| MR-014 | CC_WORKING; CC_PARTIAL (client comm history only visible once linked; N+1 overview aggregate pre-existing) |
| MR-015 | CC_WORKING |
| MR-016 | CC_WORKING |
| MR-017 | CC_WORKING; CC_PARTIAL |
| MR-018 | CC_WORKING (self-service onboarding PROVEN ancestor); OLD_CORRECT (Gen-1 read-only grant→browse UX replaced by gated membership flow) |
| MR-019 | CC_WORKING |
| MR-020 | CC_WORKING |
| MR-021 | CC_WORKING |
| MR-022 | CC_WORKING |
| MR-023 | CC_WORKING |
| MR-024 | CC_WORKING |
| MR-025 | CC_WORKING; CC_PARTIAL (CASE_RELAY is admin-assigned only, `CONFIGURATION_REQUIRED`) |
| MR-026 | CC_WORKING |
| MR-027 | CC_WORKING |
| MR-028 | CC_WORKING |
| MR-029 | CC_WORKING |
| MR-030 | CC_WORKING |

## Communication domain

| MR | Lineage labels |
|----|----------------|
| MR-031 | CC_WORKING |
| MR-032 | CC_WORKING (live inbound Graph, gated OFF-by-default); PARALLEL (the still-present dry-run/normalize-only endpoints); REMOVED_BE (no send) |
| MR-033 | CC_WORKING; PARALLEL with MR-032 live path; DEAD_END (normalize-only facade, never a provider fetch) |
| MR-034 | CC_WORKING (two overlapping surfaces: `/communications` triage + `/notifications` workspace); DUP (two inboxes) |
| MR-035 | CC_WORKING |
| MR-036 | CC_WORKING |
| MR-037 | CC_WORKING (metadata-only, deliberate) |
| MR-038 | CC_BE (provider-derived thread key on **Outlook Communication**; no persisted comm thread); OLD_MORE/PLANNED for a real comm thread model (needs schema). Note: customer-portal `ClientQuestionThread` + read-state exist separately, NOT part of Outlook Communication |
| MR-039 | PLANNED / NEVER_REAL (honest empty states) |
| MR-040 | GREENFIELD (no outgoing mail anywhere) |
| MR-041 | CC_WORKING |
| MR-042 | CC_WORKING |
| MR-043 | DRAFT_REPLAY (branch-only read model, not canonical); DRAFT_MORE vs current single-scope client query |
| MR-044 | DRAFT_REPLAY (case-first/case-overview/client-overview context snapshots, not canonical); CC_BE for client-scoped query semantics |

## Document domain

| MR | Lineage labels |
|----|----------------|
| MR-045 | CC_WORKING |
| MR-046 | CC_KEEP (immutable `DocumentVersion` lifecycle survives: load/upload/download/promote-current/render history on the case document UI); OLD_LOST (legacy editor working-copy autosave/track-changes semantics removed — intentional, Word-primary rule) |
| MR-047 | CC_BE (extraction engine present, used by anonymize only) |
| MR-048 | CC_WORKING (structured diff + ComparisonWorkspace); DUP (legacy `app/documents/compare` still routed+referenced) |
| MR-049 | CC_PARTIAL/REMOVED_BE (DOCX/PDF gated as non-text despite extractor present) — largest recoverable gap |
| MR-050 | CC_WORKING |
| MR-051 | CC_WORKING |
| MR-052 | CC_WORKING |
| MR-053 | CC_WORKING |
| MR-054 | CC_WORKING (Word-primary export-only, correct by design); OLD_LOST (browser editor save/autosave semantics removed — does NOT return) |
| MR-055 | CC_WORKING |
| MR-056 | CC_WORKING |
| MR-057 | CC_WORKING; CC_PARTIAL (no standalone page polish) |
| MR-058 | CC_UI (prompt catalog is component-only, copy-to-clipboard); CC_BE for analysis intake |
| MR-059 | CC_WORKING |
| MR-060 | CC_WORKING |
| MR-061 | CC_WORKING |
| MR-062 | CC_WORKING |
| MR-063 | CC_WORKING |
| MR-064 | CC_WORKING |
| MR-065 | CC_WORKING |
| MR-066 | CC_PARTIAL |
| MR-067 | CC_WORKING |
| MR-068 | CC_WORKING |
| MR-069 | CC_WORKING |
| MR-070 | CC_BE (change report backend, no UI); with MR-049 (text pipeline) |

## Work / billing domain

| MR | Lineage labels |
|----|----------------|
| MR-071 | CC_WORKING |
| MR-072 | CC_WORKING |
| MR-073 | CC_WORKING; RENAMED (matters folded under `/cases`; `/matters` redirect) |
| MR-074 | CC_WORKING; CC_PARTIAL |
| MR-075 | CC_PARTIAL/PLANNED (placeholder only) |

## Cross-cutting domain

| MR | Lineage labels |
|----|----------------|
| MR-076 | CC_WORKING |
| MR-077 | CC_WORKING |
| MR-078 | CC_WORKING; CC_PARTIAL (global attention inbox not fully wired); DRAFT (attention-category branches ahead) |
| MR-079 | CC_WORKING; CC_UNREACH (some legacy routes reachable but superseded) |
| MR-080 | CC_WORKING (workflow/work-package admin); CC_PARTIAL (no general settings/theme page) |
| MR-081 | CC_WORKING (SharePoint drive service); CC_PARTIAL (uploads only to generated contracts; no generalized SP upload) |
| MR-082 | CC_WORKING (SEC-2 upload validation + upload-security) |
| MR-083 | CC_WORKING (canonical single auth source-of-truth in client-interaction/base) |
| MR-084 | CC_WORKING |
| MR-085 | CC_BE (search/classify API, no UI) |
| MR-086 | CC_WORKING (flag-gated) |
| MR-087 | CC_WORKING |
| MR-088 | CC_WORKING |
| MR-089 | CC_WORKING; CC_PARTIAL (no standalone page/export) |
| MR-090 | CC_WORKING (responsibility module + workgroups) |

## Confidence note

Labels above are **PROVEN** where the referenced file/route/model was read at canonical or a branch SHA was confirmed as ancestor/predecessor (see `03`–`08`). Labels marked `DRAFT_REPLAY`/`DRAFT_MORE`/`DRAFT_PARTIAL` on branch-only MRs are **PROVEN** as branch-only (via `git rev-list ... --count` ahead-of-canonical), but the *runtime behavior* of those branches is UNPROVEN (no node to run them). `UNKNOWN` is intentionally avoided — where a capability could not be verified it is marked CC_PARTIAL with a note, never guessed upward.
