# Task Lifecycle Schema Options

Date: 2026-07-18
Status: design comparison only

## Decision Summary

Option A, a new `TaskSubmission` aggregate, is recommended. Option B, extending `LawyerHandoffPackage`, appears superficially smaller but becomes more invasive once task ownership, typed relations, immutable revisions, review history, time links, idempotency, and conservative retention are added.

## Option A — `TaskSubmission` And `TaskReviewDecision`

### Shape

```text
Task 1 ── * TaskSubmission
TaskSubmission 1 ── * TaskSubmissionDocument * ── 1 Document
TaskSubmission 1 ── 0..1 TaskReviewDecision
TaskSubmission 1 ── * TaskSubmissionTimeEntry * ── 1 TimeEntry
TaskSubmission 0..1 ── 0..1 TaskSubmission (supersedes)
```

### Advantages

- Task ownership is explicit and cannot be guessed from case ownership.
- Every Leadás revision has its own immutable content and final review decision.
- Existing case-level handoff rows remain untouched and readable.
- Typed document/version FKs replace unverified string IDs.
- Reviewer assignment, submitter, attention, zero-time confirmation, idempotency, and external completion have explicit fields.
- Review queue queries have clear indexes and do not infer review state from task priority.
- Application rollback can ignore the new tables without corrupting old runtime behavior.
- No destructive backfill is needed.

### Costs

- Four new tables, five small enums, and nullable additions to `Task`, `TimeEntry`, and `TimelineEvent`.
- New runtime services and DTOs are required before UI activation.
- Legacy `LawyerHandoffPackage` and new submissions coexist until a later human decision.
- Cross-case and cross-matter invariants need transactional service checks.

## Option B — Extend `LawyerHandoffPackage`

### Required Changes To Become Safe

The existing model would need at least:

- nullable `taskId` with a real FK;
- `revisionNumber` and self-relation;
- typed document-link table and version relation;
- separate prepared/submitted/reviewer actor FKs;
- immutable review-decision table;
- requested attention, remaining issues, text-only outcome, zero-time declaration, idempotency, and external-action fields;
- time-entry relation or join table;
- conservative delete behavior replacing current case cascade for new legal history;
- separate APIs that distinguish legacy case handoff from task Leadás.

### Risks

- Existing records have no reliable task owner, so `taskId` cannot be safely backfilled.
- The model name and current routes describe a case-level lawyer handoff, not assigned-task completion.
- Current document and user IDs are scalar strings without FKs.
- Current review fields are mutable latest-state fields; preserving them while adding history creates two competing sources of truth.
- Current `Case -> LawyerHandoffPackage` uses `onDelete: Cascade`, contrary to the required retention posture.
- Existing `ENABLE_HANDOFF_PACKAGES` behavior would unintentionally become the gate for a different product capability.
- Runtime and frontend code would need branching for legacy and task-owned rows inside the same table.

### Migration Complexity

Option B does not eliminate new tables: document links, immutable review decisions, and time links are still required. It also introduces nullable semantic modes (`taskId IS NULL` legacy versus `taskId IS NOT NULL` task workflow) throughout every query and authorization path.

## Comparative Matrix

| Criterion | Option A: new aggregate | Option B: extend handoff |
| --- | --- | --- |
| Domain clarity | Strong: one revision belongs to one task | Mixed case/task semantics |
| Legacy safety | Legacy table untouched | Every query must distinguish legacy rows |
| Revision history | Native | Retrofitted beside mutable latest fields |
| Typed document/version links | Native join | Requires new join anyway |
| Authorization | Task/case scoped | Mixed case handoff and task policies |
| Review queue | Direct indexed query | Conditional task/null filtering |
| Migration | Additive, no backfill | Additive but semantically ambiguous |
| Rollback | Old runtime ignores new tables | Old runtime may see modified handoff rows |
| Delete/retention | Conservative from creation | Existing case cascade remains problematic |
| Feature gating | New internal workflow path | Coupled to existing handoff foundation |
| Long-term maintenance | Explicit bounded context | Permanent dual semantics |

## Rejected Alternatives

### Generic JSON On Task

Rejected because it cannot enforce revision uniqueness, typed relations, reviewer identity, immutable decisions, idempotency, or indexed reviewer queues.

### Comments As Review History

Rejected because comments are case/document scoped, mutable collaboration content, and do not encode authorized transition decisions.

### Timeline Events As Primary State

Rejected because timeline rows are audit evidence, not a transactional aggregate. Reconstructing current state from events would be fragile and would overload generic metadata.

### Single Mutable `Task.review` Row

Rejected because return/resubmit cycles overwrite prior legal review evidence.

## Recommended Choice

Choose Option A with sequential revisions and one final decision per revision. Keep `LawyerHandoffPackage` permanently separate by default unless a later, evidence-based legacy retirement plan is approved.

The choice is ready for human approval, not schema implementation or migration apply.

Classification: `TASK_LIFECYCLE_SCHEMA_DESIGN_READY_FOR_HUMAN_APPROVAL`
