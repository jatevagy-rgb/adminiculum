# 15 — Recovered Product Architecture

> The smallest coherent Adminiculum assembled primarily from EXISTING foundations (master roadmap + canonical + historical working components + draft components + recoverable connections). Derived, not brainstormed.

## The coherent professional workflow

```
EMAIL ARRIVES
  → CLIENT RECOGNIZED
  → CASE CREATED/ASSIGNED
  → COMMUNICATION ATTACHED
  → DOCUMENT ATTACHED
  → CASE TYPE SELECTED
  → WORK PACKAGE CREATED
  → TASKS CREATED
  → LAWYER/JUNIOR WORK
  → REVIEW
  → CLIENT COMMUNICATION
  → TIME TRACKED
  → PORTAL UPDATED
  → CASE CLOSED
```

| Step | CURRENT component | OLD component | DRAFT component | MISSING piece | RECOMMENDED source |
|---|---|---|---|---|---|
| EMAIL ARRIVES | `outlookGraphLive.ts` fetchRecentInbound + `syncOutlookMailbox` (gated) | dry-run/import (normalize-only) | — | enable + credentials; delta/subscription (later) | `04`, `11` |
| CLIENT RECOGNIZED | `Communication.clientId` + `POST /:id/link-client`; client-wide read model branch | — | `clientSummary.service.ts` (fail-closed) | merge branch; client resolution UX | `04`, `11` |
| CASE CREATED/ASSIGNED | `createCaseIntake` (assigned lawyer, typed deadlines, thread links) | legacy `createCase` | — | adopt intake as the base; assign lawyer on comm path | `05` |
| COMMUNICATION ATTACHED | `POST /:id/link-case` (atomic), thread-link at intake | — | — | (none) | `04` |
| DOCUMENT ATTACHED | doc created post-hoc (upload/generate) | — | — | creation-time attach + attachment→document | `05`, `06` |
| CASE TYPE SELECTED | `caseType`/`matterType`/`CaseTypeDefinition` | — | — | consistent caseType across all paths | `09` MR-002 |
| WORK PACKAGE CREATED | `createCaseWorkPackageSnapshot` (legacy only) | — | work-package branches (wp4/wp5) | call snapshot on intake/comm/portal | `05`, `09` MR-003 |
| TASKS CREATED | DAG `instantiateCaseWorkflow` + opening tasks + initial tasks | — | — | portal path has no task generation | `05`, `03` E3/E5b |
| LAWYER/JUNIOR WORK | Task start/block/reschedule/resubmit + attention | — | — | (none) | `03` E6 |
| REVIEW | DocumentReview lifecycle + TaskReviewDecision | — | — | (none) | `03` E6/E7a |
| CLIENT COMMUNICATION | `Communication` + inbox + extract-task/deadline | — | case-first/client-overview context | merge branch; a real thread/unread/send is greenfield | `04`, `11` |
| TIME TRACKED | `TimeEntry` + timesheet report | — | — | (none) | `09` MR-071/72 |
| PORTAL UPDATED | `client-publication` + grant (CP1 path only) | — | — | internal-intake → portal grant | `05`, `09` MR-013 |
| CASE CLOSED | lifecycle close/reopen/archive (cancels tasks) | — | — | (none) | `03` E5a |

## Minimum product to assemble (in priority order)

1. **Enable + credential the real Outlook sync** (already built) → email actually lands as `Communication`.
2. **Merge the `peterfi` communication stack** (client-wide read model + case-first context + composition contract) → email→client→case is comprehensible end-to-end.
3. **Reconnect case→workpackage → workflow → tasks** on the modern intake path → a new matter gets a real workable scope + DAG tasks.
4. **Add case-level reviewer + responsible** at creation (the only true greenfield in the spine).
5. **Re-surface document version-history + wire DOCX/PDF text-diff** (backends exist) → document value is no longer trapped.
6. **Add internal-intake → portal grant** (schema/permission) → matters become client-visible.

## Explicitly NOT in scope (greenfield, deferred)

Persisted thread/unread/reply, outgoing mail, billing engine, delta/subscription sync, and a browser Word editor clone (forbidden by the Word-primary rule).

## Do NOT resurrect (evidence-based)

V2 `cases/workflow.ts` (dead), mock portal generation (synthetic), browser-editor autosave/track-changes (design rule), the legacy `app/documents/compare` as the primary compare surface (superseded by `ComparisonWorkspace`).
