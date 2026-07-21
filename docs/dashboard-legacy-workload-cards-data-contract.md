# Dashboard Legacy Workload Cards — Data Contract

Date: 2026-07-21

## Principle

The restored cards use the **same authoritative data concepts** as the historical
implementation (`DashboardFocused @ a948839`). No values are manufactured, no
counts are hardcoded, and no minute/effort estimate is computed (the historical
feature never did). Each value is availability-gated so a failed source renders
`null → "Most nem elérhető"`, never a fake `0`.

## Field-by-field audit

| Card | Historical source (a948839) | Current equivalent | Status | Auth-safe | Restoration impact |
|---|---|---|---|---|---|
| Nyitott ügyek | `cases.filter(!closedCaseStatuses).length` when `availability.cases` | same — `cases` list + `availability.cases` | unchanged | yes (per-user case list) | `summaryOpenCaseCount`; operational header's own `caseCount` left untouched |
| Mai teendők | `agenda.summary.today` when `availability.agenda` | same — `agenda.summary.today` | unchanged | yes | `summaryTodayTaskCount` |
| Közeli határidők | `deadlines.length` when `availability.agenda` | same — `deadlines` (from agenda) | unchanged | yes | `summaryDeadlineCount` |
| Review tételek | `stats.stats.inReview` else `reviewTasks.length` | same — `stats` / `reviewTasks` | unchanged | yes | `summaryReviewCount` |
| Külső kommunikáció | `communications.filter(external).length` when `availability.communications` | **already present** in current component, identical logic | unchanged | yes | reused `externalCommunicationCount` |
| Belső kommunikáció | `communications.filter(internal).length` when `availability.communications` | **already present** in current component, identical logic | unchanged | yes | reused `internalCommunicationCount` |

`closedCaseStatuses = ["CLOSED","COMPLETED","ARCHIVED","CANCELLED"]` restored
verbatim from `a948839`.

## No new backend/schema contract

All six values derive from endpoints already consumed by the current Dashboard
(`getCases`, `getWorkflowAgenda`, `getDashboardStats`, `getMyTasks`,
`getCommunications`) and the existing `DashboardAvailability`. **No new API route,
no Prisma/schema change, no backend runtime change** is required. Therefore this
is not a `DASHBOARD_LEGACY_WORKLOAD_CARDS_CONTRACT_BLOCKER`.

## Partial-load compliance

The historical cards were already availability-aware, so they conform to the
validated partial-load contract without modification:

- source **fails** → value `null` → caption `"Most nem elérhető"` (never a fake 0);
- source **succeeds empty** → value `0` → the card's empty label (e.g. "Nincs ügy");
- source **succeeds populated** → count + `"Aktív tétel"`.

`dashboardLoadState.ts` remains the single source of the availability map; the
cards consume it. No global Dashboard error is introduced by a single card's
source failing (verified in the browser QA).
