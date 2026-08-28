# 05 — Case Intake / Creation Archaeology

> Every historical way a case could be created, at canonical `50945ecd`. Confidence `PROVEN`/`STRONGLY_INDICATED`/`UNPROVEN`. Full creation-path matrix + the connection-chain gaps.

## Entry points (canonical)

| Endpoint | Service fn | Origin SHA | Notes |
|---|---|---|---|
| `POST /api/v1/cases` | `createCase` (`cases/services.ts:439`, route `routes.ts:644`) | `35687fd` | legacy simple create |
| `POST /api/v1/cases/intake` | `createCaseIntake` (`cases/intakeCreate.service.ts:243`, route `routes.ts:904`) | `02e02d8` | transactional, **modern default** (frontend `useCaseIntakeForm.ts` posts here; `CasesList.tsx:434` mounts `CaseIntakeDialog`) |
| `POST /api/v1/communications/:id/create-case` | inline (`communications/routes.ts:779`) | `ab5b96d`+`dc0780e` | communication-originated |
| Portal intake → case | `createCaseFromPortalIntakeInTransaction` (`intakeCreate.service.ts:493`, caller `client-workspace/intakeConversionService.ts:126`) | CP1 wave | only path with portal visibility |
| Post-create transitions | `createOpeningTasks`/`activateMatter`/`declineIntake` (`intakeService.ts`) | `a319255`/`e321feb` | readiness/activation bundle |
| Intake queue | `getIntakeQueue` (`intake/routes.ts:15`) | `a319255` | `/api/v1/intake` |
| Work-package snapshot** | `createCaseWorkPackageSnapshot` (`cases/caseWorkPackage.service.ts:25`) | `9eec7bf` | also a variant-adder in createCase |
| Compliance proposal | **does NOT create** — `bindProposalToCase(proposalId, caseId)` binds an existing Case (`complianceProposalService.ts:203`) | phase7b | no `case.create` |

## Per-path input/relation matrix

| Dimension | Legacy `POST /cases` | Transactional `POST /cases/intake` | Comm `create-case` | Portal CP1 conversion |
|---|---|---|---|---|
| CLIENT | existing `clientId` required (free-text rejected) | existing `clientId` required | `clientId \|\| communication.clientId`, existing | `intake.clientId` (must match) |
| COMMUNICATION link | none | **yes** (`communication.caseId` set + `isPrimaryForCase`, 409/403/400 guards) | **yes** (atomic `$transaction`) | none |
| DOCUMENT link | none | none | none (carries `communication.documentId` only) | none |
| ASSIGNED LAWYER | **not set at creation** (null, only fallback for workflow steps) | **set** (`:329`) | **NONE** | **set** (`:524`) |
| REVIEWER | none | none | none | none |
| DEADLINE | single `Case.deadline` | 0–10 typed `caseIntakeDeadline` (does **not** also set `Case.deadline`) | single `Case.deadline` | single `Case.deadline` |
| CASE TYPE | hardcoded `'OTHER'` (only `caseTypeDefinitionId` via work-package) | `caseType = matterType` | hardcoded `'OTHER'` | fixed set, default OTHER |
| WORKFLOW (DAG) | yes (`instantiateCaseWorkflow`) | optional DAG | **NONE** | **NONE** |
| TASK generation | workflow steps only | initialTasks + workflow steps | ≤1 initial (sourceCommunicationId set) | **NONE** |
| MATTER | none | none | none | none |
| PORTAL visibility | none | none | none | **yes** — `clientPortalGrant` (requester) + `clientMatterPublication` initial snapshot + requester notification + org access policy |

> Note: `createCaseIntake` declares `internalReference` but it is **never read/persisted** (PROVEN).

## Connection-chain gaps (what existed vs. now missing)

Chain: **email→client→case→type→workpackage→tasks→documents→deadlines→responsible→portal→time**

| Link | State | Evidence |
|---|---|---|
| email→communication→client→case | **intact** on all paths | clientId required; comm + portal carry client | PROVEN |
| case→type | PARTIAL — legacy sets a real `caseTypeDefinitionId`; intake sets `matterType` as caseType; others hardcode OTHER | read create fns | PROVEN |
| case→workpackage | **exists ONLY on legacy `createCase`** (`services.ts:525`) → missing on intake, communication, portal | read create fns | PROVEN |
| case→tasks | legacy=workflow steps; intake=initial+workflow; communication=≤1; **portal=NONE** | read create fns | PROVEN |
| case→documents | **no creation path creates/links a Document at intake** — documents appear only later (upload/generate) | read create fns | PROVEN |
| case→deadlines | legacy/comm/portal=single `Case.deadline`; **intake=typed `caseIntakeDeadline` but not `Case.deadline`** → readiness `agenda/service.ts` reads `Case.deadline`, so intake-typed deadlines may be invisible | read create fns; agenda consumer | STRONGLY_INDICATED |
| case→responsible | set by intake & portal; **NOT set by legacy or communication** → communication-originated matter has no responsible lawyer | read create fns | PROVEN |
| case→reviewer | **no creation path assigns a reviewer** (only downstream DocumentReview) | read create fns | PROVEN |
| case→portal | internal paths create zero portal artifacts; **only CP1 conversion** yields grant+publication → internally-intaken matter can never become portal-visible from creation | read create fns | PROVEN |

## The single biggest intake risk

The master-roadmap target chain is email→client→case→type→**work package**→tasks→documents→deadlines→responsible/reviewer→portal→time. Today **only the legacy `createCase`** connects case→workpackage, and **only the CP1 portal path** connects case→portal. So the two "modern" default paths (transactional intake and communication create-case) both **skip work-package** and **never produce portal visibility**; and the **communication create-case path sets no responsible lawyer**. These are the exact connection losses the master roadmap treats as if they were greenfield.

## Reusable / rebuild recommendation (summary)

- **Reuse:** `createCaseIntake` (transactional, typed deadlines, thread-links, assigned lawyer) is the strongest base entry point; extend it rather than duplicating a 5th creation path.
- **Reconnect:** call `createCaseWorkPackageSnapshot(tx,…)` from `createCaseIntake` + communication + portal paths (currently legacy-only).
- **Reconnect:** assign `assignedLawyerId` on communication `create-case` (currently null).
- **Rebuild (greenfield):** case-level reviewer assignment at creation; a creation-time `Communication→Document` attach; and a mechanism to grant portal visibility to internally-created matters (schema/permission work — **out of audit scope**).
