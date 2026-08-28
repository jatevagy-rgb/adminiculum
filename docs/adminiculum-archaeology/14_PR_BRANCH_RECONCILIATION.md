# 14 — PR / Branch Reconciliation

> Audit of relevant historical branches/PRs. Merge status computed via `git rev-list --count <branch>..<canonical>` (behind) and `<canonical>..<branch>` (ahead); `ahead=0` ⇒ ancestor of canonical. Canonical = `50945ecd309c4c609fc48d07218fe42917ab8e82`. Confidence **PROVEN** (ahead/behind counts are objective).

## Categories

### MERGE_CURRENT (ahead=0 — already in canonical; keep, do not re-open)

The overwhelming majority (40+): all `codex/client-portal-*`, `codex/client-publication-*`, `codex/organization-*`, `codex/company-*`, `codex/phase*`, `codex/task-*`, `codex/work-package-wp1/wp2`(+`recovery/wp3`), `devin/*` (except one), `opencode/phase5a-canonical-final`, `opencode/*security*`, `claude/*security*`, `antigravity/*`, `jatevagy/*`, `release/*`, `hotfix/demo-*`, `kilo/post-topology-stabilization`. These are **already merged** — no action.

### DRAFT_BRANCH_REPLAY_CANDIDATE (ahead>0, real value, close deltas)

| Branch | ahead | Content | Action |
|---|---|---|---|
| `peterfi/client-communication-summary-read-model` | 4 | `clientSummary.service.ts` — client-wide read model (fail-closed dual-link auth, no N+1, effective-timestamp contract); this workspace's work | **MERGE_INTO_CANONICAL** (revalue with case-auth repair + independent-review addendum) |
| `peterfi/case-first-communication-context` | 2 | `/clients/[clientId]/communications` client communication history + `communicationContext.ts` + client Overview linkage | **MERGE_INTO_CANONICAL** |
| `peterfi/case-overview-communication-snapshot` | 1 | case-overview comm snapshot hardening tests (de-dupe: block already existed) | **MERGE_INTO_CANONICAL** (tests only) |
| `peterfi/client-overview-communication-snapshot` | 1 | client-overview truthful contextual entry (blocked read model → nav only) | **MERGE_INTO_CANONICAL** |
| `peterfi/communication-workspace-canonical` | 3 | `communicationWorkspace.ts` composition/safety contract | **MERGE_INTO_CANONICAL** (revalue) |
| `opencode/phase5*` (3–5) | 3–5 | org-portal read-model refinements | **PARTIALLY_REPLAY / KEEP_FOR_REFERENCE** |
| `codex/grant-admin-observability` | 4 | grant observability (related `-release`/`-runtime-observability-fix` already merged) | **SEMANTIC_REPLAY** |
| `opencode/person-access-readonly-projection` (2), `org-workspace-readonly-map` (3), `portal-mode-hardening` (2), `client-portal-readonly-alpha-test-debt` (1) | small | org/person projections | **KEEP_FOR_REFERENCE** |
| `codex/work-package-wp3/wp5a/wp5b` (6), `work-package-wp4` (3), `recovery/wp4/wp5a` (5/13/19) | >0 | work-package case-creation/workspace (contents largely landed via `recovery/wp3` merged) | **PARTIALLY_REPLAY / KEEP_FOR_REFERENCE** |
| `codex/compliance-legal-review-templates` | 13 | compliance corpus hardening | **PARTIALLY_REPLAY** |

### SUPERSEDED / STALE_ARCHITECTURE (do NOT merge; contradictory to the CP identity model)

| Branch | ahead | Why not merge |
|---|---|---|
| `claude/next-development` | 178 | mock portal generation (`mockPortalData`, `portal/uploads`, `portal/documents`, `portal/matters/[matterId]`) — synthetic data, contradicts CP identity model + product-truthfulness | 
| `codex/ops-pages-ux-cleanup-1` | 172 | same stale mock portal | 
| `hotfix/runtime-shape-20260308` | 177 | experimental runtime-shape | 

### UNKNOWN_REQUIRES_REVIEW

| Branch | ahead | Note |
|---|---|---|
| `claude/task-attention-migration-audit-1` | 8 | task-attention audit; may be redundant post-`task-lifecycle` merges |
| `shared-attention-category-*` | 1 | attention-category infra partially merged; runtime wiring uncertain |
| `codex/kudu-publish-response-contract` | 1 | tiny response-contract; KEEP_FOR_REFERENCE |
| `codex/compliance-legal-review-templates` | 13 | compliance corpus; PARTIALLY_REPLAY |

## Global rules (do not violate)

- **Do NOT blind-merge** any ahead-branch into canonical without diffing against the CP identity/workspace model — several (portal/org) predate the `35ca0e6` assignment model and would regress the membership gate.
- **Do NOT** replay `next-development` / `ops-pages-ux-cleanup-1` / `runtime-shape-20260308` — they carry the stale mock portal.
- The **communication workspace stack** (`peterfi/…`) is the highest-value replay: it is small, aligned with the current communication architecture, and its client-wide read model is fail-closed and no-N+1. Merge carefully with its case-auth repair + review addendum intact.

## Note on this audit's own branches

The audit is being produced on the sibling branch `peterfi/client-communication-summary-read-model` (ahead=4). Its read-model + repair + addendum commits are the same `peterfi` deltas listed above; they are the strongest `MERGE_INTO_CANONICAL` candidate in the whole repository. This audit does NOT merge/push/propose those changes — it only records their state.
