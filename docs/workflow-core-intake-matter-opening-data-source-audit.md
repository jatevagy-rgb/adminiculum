# Workflow Core Intake & Matter Opening — Data Source Audit (WORKFLOW-CORE-INTAKE-MATTER-OPENING-1)

Audit date: 2026-07-13 · Branch: `hotfix/runtime-shape-20260308` · Base: `77381ce`

This audit records the **actual structured support** in `Backend/prisma/schema.prisma` and the
existing routes/services for every intake/matter-opening concept requested by
WORKFLOW-CORE-INTAKE-MATTER-OPENING-1. Where a concept requires a schema change it was **not
simulated** — not in descriptions, not in JSON metadata, not in frontend-only persistence. The
`availability` flags of the intake-readiness contract mirror this table.

## Global constraints honored

- **No automated conflict decision** — conflict review has no persistence and is exposed as `UNAVAILABLE`.
- **No client merge** — the lookup returns human-review candidates only; a match signal is never a duplicate confirmation.
- **No AI** — no AI SDK/API import anywhere in the intake surface (static-guarded).
- **No n8n** — no n8n coupling (static-guarded).
- **No schema change** — `schema.prisma` untouched; no migration; no manual DB query.
- **No Client Portal onboarding** — the portal remains parked; intake is internal-only.

## Concept table

| Concept | Existing model/route | Structured fields | Read support | Mutation support | Production-compatible? | V1 disposition | Privacy/legal notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Person client | `Client` (no person/org discriminator) | `name`, `email`, `phone`, `address`, `contactPerson` | Yes (`GET /clients`, `GET /clients/:id`) | Yes (`POST/PATCH /clients`, ADMIN/PARTNER) | Yes | `SUPPORTED_NOW` (as undifferentiated `Client`) | `type` stays `null` in DTOs — never inferred from name |
| Organization client | `Client` | `company`, `taxNumber`, `companyRegistrationNumber`, `vatNumber`, `authorizedRepresentative` | Yes | Yes (same routes) | Yes | `SUPPORTED_NOW` (fields only, no type flag) | Same — no person/org classification exists |
| Prospective-client state | — | none (`Client` has no status/lifecycle field) | No | No | — | `SCHEMA_CHANGE_REQUIRED` | Existence of a `Client` row is the only state; "prospective" not representable |
| Verified identity | — | none (no verification status/date/verifier) | No | No | — | `SCHEMA_CHANGE_REQUIRED` | `identityStatus` is always `null`; checklist item CLIENT_IDENTITY only reflects *presence of contact data* and says so |
| Client contact data | `Client` | `email`, `phone` (+ identifiers above) | Yes | Yes | Yes | `SUPPORTED_NOW` | Readiness DTO exposes `email`/`phone` only; tax/registration numbers are lookup-side match inputs, never echoed in candidates |
| Client role | `Case.clientRole` (string) | yes | Yes | Yes (`PATCH /cases/:id`) | Yes | `SUPPORTED_NOW` | Free-text role label; never inferred from description text |
| Responsible lawyer | `Case.assignedLawyerId` | yes | Yes | Yes (`POST /cases/:id/assign`, case-manage) | Yes | `SUPPORTED_NOW` | Explicit human selection only — no automatic assignment |
| Collaborators | `CaseCollaborator` | `caseId`, `userId`, `role`, `addedAt` | Yes | Yes (existing collaborator routes) | Yes | `SUPPORTED_NOW` | Duplicate add → existing 409 |
| Party | — | none | No | No | — | `SCHEMA_CHANGE_REQUIRED` | `availability.parties = false` |
| Opposing party | — | none (only case-level `clientRole` string) | No | No | — | `SCHEMA_CHANGE_REQUIRED` | `availability.opposingParties = false`; never inferred from text |
| Related party | — | none | No | No | — | `SCHEMA_CHANGE_REQUIRED` | — |
| Matter/case creation | `POST /cases` (`casesService.createCase`) | `caseNumber`, `title`, `clientId`, `matterType`, `description`, `clientRole`, `deadline`, `status` default `CLIENT_INPUT` | Yes | Yes | Yes | `SUPPORTED_NOW` | Backend chooses initial status; SharePoint folder creation is a non-DB side effect → combined client+case creation is **not atomic** (see below) |
| Matter type | `Case.matterType` (string, validated list) + `Matter.matterType` enum | yes | Yes | Yes (at creation) | Yes | `SUPPORTED_NOW` | Invalid values fall back to `OTHER` server-side |
| Conflict review | — | none (no model, no fields) | No | No | — | `SCHEMA_CHANGE_REQUIRED` | `conflictReview.status = "UNAVAILABLE"`, `availability.conflictReviewPersistence = false`, `canRecordConflictReview = false`; **no route added**, nothing persisted in descriptions/JSON/timeline |
| Conflict result | — | none | No | No | — | `SCHEMA_CHANGE_REQUIRED` | Never emitted (`CONFLICT_REVIEW_REQUIRED`/`CONFLICT_BLOCKED` blockers are never produced) |
| Conflict evidence | — | none | No | No | — | `SCHEMA_CHANGE_REQUIRED` | No conflict-search narrative is stored or exposed |
| Conflict reviewer | — | none | No | No | — | `SCHEMA_CHANGE_REQUIRED` | — |
| Engagement acceptance | — | none | No | No | — | `SCHEMA_CHANGE_REQUIRED` | `availability.engagementState = false` |
| Engagement document | `Document` (generic) | category/type fields only | Yes (as ordinary case document) | Yes | Yes | `DEFERRED` | No engagement-specific linkage; not simulated |
| Opening checklist | derived (no persistence needed) | computed from `Case`/`Client`/`Task` fields | Yes (`GET /cases/:id/intake-readiness`) | n/a (derived) | Yes | `SUPPORTED_NOW` (backend-derived, deterministic) | Operational readiness only — not legal/compliance certification |
| Initial task bundle | `Task` + existing `type` string-code convention | `type = INTAKE_OPENING_<CODE>`, `title`, `dueDate`, `assignedToId` | Yes (tasks surfaces) | Yes (`POST /cases/:id/opening-tasks`, case-manage) | Yes | `SUPPORTED_NOW` | Explicit user confirmation required; backend-owned safe titles; dedupe via open task with same case + type code |
| Initial deadline | `Case.deadline` (+ `Task.dueDate` for tasks) | yes | Yes (canonical deadline engine) | Yes (`PATCH /cases/:id`) | Yes | `SUPPORTED_NOW` | The wizard sets **`Case.deadline` only** (explicitly labeled); task due dates are separate, optional, per-task |
| Matter activation | `CaseStatus` enum: `CLIENT_INPUT → DRAFT` (existing valid transition) | `status` | Yes | Yes (`POST /cases/:id/activate`) | Yes | `SUPPORTED_NOW` | Explicit human action; 409 with structured blockers; no `OPEN`/`ACTIVE`/`INTAKE` status invented |
| Matter decline/rejection | `CaseStatus.CANCELLED` (persistable; CLOSED lifecycle category) | `status` | Yes | Yes (`POST /cases/:id/decline-intake`) | Yes | `SUPPORTED_NOW` | No deletion, no client notification, no reason-code persistence (no structured field) |
| Duplicate detection | `GET /clients/lookup` (new, bounded) | exact `email`/`taxNumber`/`companyRegistrationNumber`; name-contains | Yes | n/a | Yes | `SUPPORTED_NOW` (signals for **human review only**) | Every candidate carries `warning: REVIEW_REQUIRED`; name similarity alone never labels a duplicate |
| Client merge | — | none | No | No | — | `DEFERRED` (deliberately not implemented) | Automatic merging prohibited; collision on unique field → 409 |
| Audit | `TimelineEvent` | `eventType`, `description`, `metadata` | Yes | Yes (content-minimized events on activate/decline) | Yes | `SUPPORTED_NOW` | Events carry action + from/to status only — no client identity data |
| Notification | `Notification` | existing types | Yes | Not extended in V1 | Yes | `DEFERRED` | No intake-specific notification added; no external/client communication of any kind |

## Key architectural findings

1. **Intake state = `CLIENT_INPUT`.** The existing case-creation default is the only
   intake-compatible persistable status; the intake queue and readiness engine key off it.
   Activation maps to the pre-existing valid transition `CLIENT_INPUT → DRAFT`; decline maps to
   the persistable `CANCELLED` status (already classified as CLOSED lifecycle category by
   WORKFLOW-CORE-LITIGATION-CASE-LIFECYCLE-1).
2. **Combined client+case creation is not safely atomic.** `casesService.createCase` performs
   SharePoint folder creation (external side effect) after the DB insert. Wrapping client + case +
   collaborators + tasks in one transaction would either exclude that side effect or require
   restructuring a production code path. Per the package rules, the intake wizard therefore calls
   the **existing safe endpoints sequentially** and reports per-step outcomes; the limitation is
   documented in the checkpoint doc.
3. **`Task.type` string codes are the existing dedupe convention** (`DOCUMENT_REVIEW`,
   `COMMUNICATION_FOLLOW_UP`, …). Opening tasks reuse it (`INTAKE_OPENING_<CODE>`), giving
   deterministic duplicate detection through a safe existing field — no JSON metadata, no hidden
   template persistence.
4. **No conflict-review, engagement, party, or identity-verification persistence exists.** These
   are surfaced as truthful unavailable states. Future model recommendation: a dedicated
   `CaseConflictReview` table (`caseId`, `outcome`, `reviewerId`, `reviewedAt`, `safeReasonCode`)
   added via a proper schema change + migration + PR — not via this package.
