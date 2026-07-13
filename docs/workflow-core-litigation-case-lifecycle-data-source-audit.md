# Workflow Core Litigation & Case Lifecycle — Data Source Audit

`WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1`

This audit records the **actual** structured support in the repository for each
requested litigation and case-lifecycle concept, and the disposition chosen for
V1. It is the truthful basis for the implementation: where a concept requires a
`schema.prisma` change it is **not** simulated, **not** stored in JSON, **not**
encoded in descriptions, and **not** persisted in the frontend — it is marked
unavailable/deferred with the exact blocker.

## Method

- Inspected `Backend/prisma/schema.prisma` (single source of truth for
  persistable state), the `cases`, `workflow`, `agenda`, `responsibility`,
  `documents`, `tasks`, and `handoff-packages` modules, and existing tests.
- Confirmed persistable enums directly from the schema. Notably, `utils/constants.ts`
  defines `CASE_STATUS.CLOSED`, `TIMELINE_EVENT.CASE_COMPLETED`, and
  `TIMELINE_EVENT.CASE_REOPENED`, **none of which exist in the Prisma enums** —
  they are therefore not persistable and were not written.

## Persistable enums (verified)

- `CaseStatus`: `CLIENT_INPUT, DRAFT, IN_REVIEW, APPROVED, SENT_TO_CLIENT,
  CLIENT_FEEDBACK, FINAL, ON_HOLD, CANCELLED, ARCHIVED` — **no `CLOSED`, no
  `CLOSING`.**
- `DocumentCategory`: includes `EVIDENCE`, `COURT_FILING`, `CORRESPONDENCE`,
  `INTERNAL_MEMO`, `RESEARCH`, `CONTRACT`, … (human-assigned classification).
- `TimelineEventType`: tops out at `CASE_STATUS_CHANGED` / `CUSTOM`; no
  `CASE_COMPLETED` / `CASE_REOPENED`.
- Case timestamps available: `receivedAt`, `deadline`, `completedAt`,
  `createdAt`, `updatedAt`. **No `closedAt`, `archivedAt`, `reopenedAt`,
  `closingState`.**

## Concept table

| Concept | Existing model/route | Structured fields | Read support | Mutation support | Production-compatible? | V1 disposition | Privacy/legal notes |
|---|---|---|---|---|---|---|---|
| Case lifecycle status | `Case.status` (`CaseStatus`) | status enum + `receivedAt/completedAt/updatedAt` | Yes | Yes (`PATCH /status`, lifecycle actions) | Yes | `SUPPORTED_NOW` | Workflow state, not legal truth |
| Case closure | `Case.status`, `completedAt` | `FINAL`/`CANCELLED` + `completedAt` | Yes | Yes (`POST /close`) | Yes | `SUPPORTED_NOW` | Operational close only |
| Case reopening | `Case.status`, `completedAt` | active status + clear `completedAt` | Yes | Yes (`POST /reopen`) | Yes | `SUPPORTED_NOW` | Deterministic re-entry to `IN_REVIEW` |
| Archive state | `Case.status = ARCHIVED` | ARCHIVED enum | Yes | Yes (`POST /archive`) | Yes | `SUPPORTED_NOW` | Archive ≠ delete; no data removed |
| `CLOSING` state | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | `availability.closingState=false` |
| Dedicated `closedAt`/`archivedAt` | — | none (only `completedAt`) | Proxy only | — | No | `SCHEMA_CHANGE_REQUIRED` | availability flags false; `completedAt` surfaced as proxy |
| Litigation matter | `Matter` (`matterType=LITIGATION`), `Case.caseType=LITIGATION` | type/status/dates | Yes | Existing | Yes | `READ_ONLY_ONLY` (for dossier) | — |
| Legal issue / question | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | Not inferred from text |
| Allegation / position / claim | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | Not inferred |
| Defence / response | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | Not inferred |
| Evidence item | `Document.category = EVIDENCE` | human-set category | Yes (metadata) | Category set on upload | Yes (read) | `READ_ONLY_ONLY` | Metadata only; no raw text |
| Evidence→issue relation | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | `availability.issueEvidenceRelations=false` |
| Supporting/contradicting/neutral | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | Relation always `UNCLASSIFIED`; never auto-classified |
| Pleading / submission | `Document.category = COURT_FILING` | human-set category | Yes (metadata) | Category set on upload | Yes (read) | `READ_ONLY_ONLY` | Metadata only |
| Pleading review | Task-backed review (`Task` + review statuses) | task status | Yes | Existing tasks flow | Yes | `SUPPORTED_NOW` (via tasks) | Internal approval, not filing |
| Pleading filing status (`FILED`/`SUPERSEDED`) | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | `canMarkFiled=false`; never automatic |
| Hearing / procedural event | — (only generic deadlines) | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | `availability.hearings=false` (agenda) |
| Procedural deadline | `agenda` engine (`Task.dueDate`, `Case.deadline`) | dates + urgency | Yes | Existing | Yes | `SUPPORTED_NOW` | Type/legal-significance not inferred |
| Party | `Client`, `Case.clientRole` | own-side only | Partial | Existing | Partial | `DEFERRED` | `availability.parties=false` |
| Opposing party | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | — |
| Court / authority reference | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | — |
| Legal significance | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | Never inferred from title/description |
| Burden of proof | — | none | No | No | No | `SCHEMA_CHANGE_REQUIRED` | `availability.burdenOfProof=false` |
| Task relation | `Task.caseId/documentId/matterId` | FKs | Yes | Existing | Yes | `SUPPORTED_NOW` | — |
| Document relation | `Document.caseId/category` | FKs + category | Yes | Existing | Yes | `SUPPORTED_NOW` | Metadata only |
| Activity / timeline | `TimelineEvent` + Case Activity | event rows | Yes | Yes (add rows) | Yes | `SUPPORTED_NOW` | Content-minimized labels |
| Audit | `TimelineEvent` (content-minimized) | metadata | Yes | Yes | Yes | `SUPPORTED_NOW` | No broad payloads |
| Notification | `Notification` | — | Yes | Existing | Yes | `SUPPORTED_NOW` | Content-minimized |

## Classification summary

- `SUPPORTED_NOW`: case lifecycle status, closure, reopening, archive, procedural
  deadlines, task/document relations, activity/audit/notification, pleading review
  (via existing tasks).
- `READ_ONLY_ONLY`: litigation matter context, evidence items (EVIDENCE docs),
  pleadings (COURT_FILING docs).
- `SCHEMA_CHANGE_REQUIRED`: legal issue/claim/allegation/defence, evidence→issue
  relations and relation classification, pleading filing status/supersede,
  hearing/procedural-event typing, opposing party, court/authority reference,
  legal significance, burden of proof, dedicated `CLOSING` state and
  `closedAt`/`archivedAt` columns.
- `DEFERRED`: structured party model.

## Explicit non-goals (documented blockers)

- **No AI legal analysis** and **no automatic legal conclusions** — issue status,
  evidence relation, pleading approval, and closure readiness are workflow/operational
  signals, never legal truth.
- **No schema change** — `schema.prisma` is not edited; no migration, no
  `prisma db push`, no manual DB query.
- **No external filing / court integration.**
- **No Client Portal publication** — no client-visible surface is created or changed.
- **No new deadline implementation** — the canonical agenda/deadline engine is reused.
- **No frontend-only persistence** of issues/evidence/pleadings.

## Conclusion

A truthful, narrower litigation dossier plus a real operational case-lifecycle
contract are fully implementable on existing production-compatible data. The
richer litigation-record concepts (issues, evidence relations, filing status,
hearings, parties) require a future schema change and are surfaced as
unavailable rather than simulated.
