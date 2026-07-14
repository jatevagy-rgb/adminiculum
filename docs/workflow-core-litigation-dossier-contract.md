# Workflow Core — Litigation Dossier Contract

`WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1`

Endpoint: `GET /api/v1/cases/:caseId/litigation-dossier`
Auth: authenticated + existing case read-access boundary (`requireCaseReadAccess`).
Implementation: `Backend/src/modules/cases/litigationDossier.ts`.

The dossier is a **read-only aggregation** over production-compatible structured
data. It exposes metadata only and uses explicit Prisma `select` projections and
bounded queries (`take ≤ 100`). It never returns raw document text,
`workspaceText`, extracted/OCR text, communication content, storage/SharePoint
paths, raw Prisma rows, broad JSON, or any Client Portal field.

## Response shape

```
LitigationDossierDto {
  caseId, generatedAt
  summary {
    activeIssues, unresolvedIssues,           // always 0 (no issue model)
    evidenceItems,                            // count of EVIDENCE documents
    pleadingsInDraft, pleadingsInReview,      // always 0 (no filing status)
    filedPleadings,                           // always 0 (no filing status)
    upcomingProceduralDates                   // open procedural dates
  }
  issues[]          // always [] — no structured issue model
  evidence[]        // from Document.category = EVIDENCE
  pleadings[]       // from Document.category = COURT_FILING
  proceduralDates[] // from canonical agenda/deadline engine
  availability { ... }
}
```

### `summary`

Counts derived from the aggregated documents and procedural dates. Pleading
by-status counts are `0` because filing status is not persisted (see
`availability.filingStatus`).

### `issues`

Always empty. There is no legal-issue/claim/allegation model in the schema
(`availability.issues = false`). Issues are **not** simulated, **not** stored in
JSON, and **not** rendered as frontend-only cards.

### `evidence[]`

One entry per document explicitly categorized `EVIDENCE` (a human classification,
not text inference):

- `id`, `displayName`, `type`, `status` (`null`), `relation` (**always
  `UNCLASSIFIED`** — no relation model), `issueIds` (`[]`), `document` link.
- `capabilities`: `canOpen`, `canCompare`, `canCreateTask` (manager);
  `canLinkToIssue`/`canUnlinkFromIssue` **false** (no relation model).

### `pleadings[]`

One entry per document categorized `COURT_FILING`:

- `id`, `displayName`, `type`, `status` (`null`), `filedAt` (`null`),
  `updatedAt`, `relatedDocumentId`, `relatedTaskIds` (tasks linked by
  `documentId`).
- `capabilities`: `canOpen`, `canCompare`, `canCreateReviewTask` (manager;
  routed through the existing task-backed review flow); `canMarkFiled`,
  `canSupersede`, `canSubmitForReview`, `canApprove`, `canReturnForCorrection`
  **false** (no filing/supersede persistence; submit/approve/return happen on the
  Tasks surface).

### `proceduralDates[]`

Sourced from the canonical deadline/agenda engine (`getCaseDeadlines`) — task
due dates and case deadlines. Event type and legal significance are **not**
inferred from titles/descriptions. Degrades to `[]` if the agenda scope guard
rejects the viewer.

### `availability`

| Flag | Value | Reason |
|---|---|---|
| `issues` | `false` | no issue model |
| `evidence` | `true` | `DocumentCategory.EVIDENCE` |
| `issueEvidenceRelations` | `false` | no relation model |
| `pleadings` | `true` | `DocumentCategory.COURT_FILING` |
| `filingStatus` | `false` | no filing-status column |
| `proceduralDates` | `true` | canonical deadline engine |
| `parties` | `false` | no structured party model |
| `burdenOfProof` | `false` | not represented, never inferred |

## Excluded fields (never returned)

`workspaceText`, raw/extracted/OCR document text, communication body/content,
raw evidence substance, private legal analysis, AI prompts/outputs, storage or
SharePoint paths, broad audit payloads, arbitrary JSON, Client Portal fields,
external-publication fields, raw Prisma rows.

## Error behavior

- `401` unauthenticated.
- `403` no case access (via `requireCaseReadAccess`).
- `404` unknown/inaccessible case.
- `500` unexpected error (generic body, no internals).

## Query bounds

- Documents: single `findMany` filtered to `category ∈ {EVIDENCE, COURT_FILING}`,
  explicit `select`, `take = 100`.
- Linked tasks: single bounded `findMany` by `documentId ∈ set`.
- Procedural dates: canonical engine (bounded internally).

## Update — DOCUMENT-EDITOR-PRO-CONTRACT-WORKBENCH-1 (2026-07-14)

Pleading review remains task-backed; drafts can be worked on in the professional editor
(`/documents/[documentId]/edit`, export-only session mode) and compared through the
existing `/documents/compare` redline workflow. No pleading contract fields changed.
