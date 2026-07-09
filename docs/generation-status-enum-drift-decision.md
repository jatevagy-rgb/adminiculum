# GenerationStatus Enum Drift Decision

## Purpose

This document records a human/product decision checkpoint for confirmed `GenerationStatus` enum drift.

It is documentation-only. It makes no runtime change, no schema change, no migration, no DB connection, no production apply, and no CP-SCHEMA-1 authorization.

## Inputs

- `docs/generation-status-enum-drift-audit.md`
- `docs/production-schema-readonly-compare.md`
- `docs/partial-schema-drift-triage.md`
- `docs/partial-schema-drift-inventory.md`
- `docs/production-compatible-baseline-human-decisions.md`
- `Backend/prisma/schema.prisma`
- `Backend/src/modules/contracts/services.ts`
- `Backend/src/modules/contracts/routes.ts`
- `Backend/tests/contractsBoundary.test.ts`

Repository files were inspected only to confirm documented evidence. No runtime, schema, migration, route, test, OpenAPI, CORS, frontend, Azure, or DB behavior was changed.

## Confirmed facts

- Production physical `GenerationStatus` lacks `APPROVED` and `REJECTED`.
- Repository Prisma `GenerationStatus` includes `APPROVED` and `REJECTED`.
- `Backend/src/modules/contracts/services.ts` uses `GENERATED`, `UPLOADED`, and `PREVIEW` for normal generation/preview paths.
- `finalizeContract` writes `status: 'APPROVED'`.
- No `GenerationStatus.REJECTED` write path was found in the prior audit; rejection/undo approval writes status back to `GENERATED` and records `CONTRACT_REJECTED` as a timeline/event concept.
- Contracts routes are auth-first and default-disabled by the contracts hardening gate.
- `ENABLE_CONTRACT_GENERATION=true` alone does not enable contracts because `ENABLE_CONTRACT_GENERATION_STORAGE_MODEL` is also required.
- Disabled contracts routes do not reach services, Prisma writes, multer upload, local file operations, SharePoint upload, cleanup/delete, or timeline writes.
- `GenerationStatus` drift remains a CP-SCHEMA-1 blocker.
- Contracts remain `QUARANTINE`.

## Product meaning from repo evidence

| Status | Evidence-based meaning | Confidence |
| --- | --- | --- |
| `GENERATED` | A generated contract artifact exists and can be revised, sent back to review, or restored after rejected approval. | High |
| `UPLOADED` | Generated contract upload to SharePoint succeeded. | High |
| `PREVIEW` | Temporary preview generation record, not final production lifecycle state. | High |
| `APPROVED` | Appears tied to `finalizeContract`, where it marks a generation as final with `isFinalRevision` and `finalizedAt`. | Medium |
| `REJECTED` | Present in Prisma enum but no direct `contractGeneration.status = 'REJECTED'` write path was found; rejection is represented by status returning to `GENERATED` plus a `CONTRACT_REJECTED` timeline event. | Low |

The repository provides some evidence for an approval/finalization lifecycle through `APPROVED`, but not enough evidence that `REJECTED` is a required persisted `GenerationStatus` value.

## Compatibility risk

If production code writes `contract_generations.status = 'APPROVED'` today, PostgreSQL can reject the value because the production enum does not contain `APPROVED`. The same would be true for `REJECTED` if a future write path were added before remediation.

The risk is currently controlled because the contracts family is quarantined and default-disabled. It becomes dangerous if contracts, finalization, or any new generated-contract status write path is enabled before resolving the enum mismatch.

## Decision options

| Option | Meaning | Pros | Cons / blockers | Future implementation package | CP-SCHEMA-1 impact |
| --- | --- | --- | --- | --- | --- |
| Option A — Align repo enum back to production | Treat `APPROVED` / `REJECTED` as future or ghost enum values not approved for the current production-compatible baseline. Future work would stop using or remove those values from schema/code/docs/contracts. | Avoids production enum migration for these values; aligns repository with current production; likely best compatibility-first path if approval/rejection lifecycle is not product-confirmed. | Requires later schema/code cleanup; `finalizeContract` needs redesign so it does not write `APPROVED`; tests/docs/OpenAPI/frontend references need targeted review if they imply generated-contract lifecycle states. | `GENERATION-STATUS-ENUM-ALIGN-DESIGN-1` | Still blocked until the design and later implementation resolve the drift. |
| Option B — Bring production enum forward later | Treat `APPROVED` / `REJECTED` as desired generated-contract lifecycle states. Future work would add enum values to production through a proper migration. | Preserves the current latent `finalizeContract` intent; supports explicit approval/finalization status if product wants that lifecycle. | Requires product approval, PostgreSQL enum migration design, rollback/abandon strategy, clone proof, tests, and contracts storage/retention/permission decisions; must not be bundled into CP-SCHEMA-1. | `GENERATION-STATUS-ENUM-MIGRATION-DESIGN-1` | Still blocked until a separate migration is designed, proven, and applied safely. |
| Option C — Keep quarantined / defer | Do not decide yet. Keep drift documented, contracts disabled/quarantined, and CP-SCHEMA-1 blocked. | Safest immediate posture; avoids guessing product intent; no implementation or DB risk. | Leaves blocker unresolved; prevents CP-SCHEMA-1 readiness; future teams must not enable contracts/finalization before deciding. | `GENERATION-STATUS-ENUM-PRODUCT-DECISION-1` | Remains blocked. |

## Recommended lane

Recommended immediate posture: **Option C — Keep quarantined / defer**.

Reason: repository evidence shows `APPROVED` has a latent finalization write path, but product intent for a persisted approval/rejection generated-contract lifecycle is not confirmed. `REJECTED` appears especially weak as a persisted enum state because no write path was found. Since production lacks both values and contracts remain quarantined, the conservative decision is to defer implementation while keeping the blocker explicit.

Likely compatibility-first implementation candidate if product does not require persisted approval/rejection lifecycle states: **Option A — Align repo enum back to production**.

Option B should be chosen only after an explicit human/product decision that generated contracts need persisted `APPROVED` / `REJECTED` lifecycle states, followed by a separate migration design and clone proof.

## Human decision record

- Selected lane: Deferred
- Selected by: Human decision pending
- Prompt reference date: 2026-07-08
- Execution date: 2026-07-09
- Reason: product intent for approval/rejection generated-contract lifecycle is not yet confirmed from repository evidence.
- Implementation authorized: no
- Production apply authorized: no
- CP-SCHEMA-1 authorized: no

## Required next package

Because the selected lane is Deferred, the next recommended package is:

`GENERATION-STATUS-ENUM-PRODUCT-DECISION-1`

That package should:

- ask for a human product answer whether generated contracts need persisted `APPROVED` / `REJECTED` lifecycle states;
- decide whether `APPROVED` is a finalization status or whether `isFinalRevision` / `finalizedAt` is sufficient;
- decide whether `REJECTED` should exist as a persisted generated-contract status or remain only a timeline/event concept;
- remain docs-only;
- make no code, schema, migration, DB, Azure, route, OpenAPI, CORS, frontend, package, or test behavior change.

If the human answer chooses Option A later, use:

`GENERATION-STATUS-ENUM-ALIGN-DESIGN-1`

If the human answer chooses Option B later, use:

`GENERATION-STATUS-ENUM-MIGRATION-DESIGN-1`

## Non-actions

This decision package did not:

- change any enum;
- change `schema.prisma`;
- create, edit, apply, resolve, move, or delete any migration;
- connect to any database;
- apply any DB change;
- read business data;
- touch Azure, Kudu, app settings, or deployment;
- change runtime behavior;
- change route behavior;
- change OpenAPI or CORS behavior;
- change frontend behavior;
- change tests;
- enable contracts;
- enable Client Portal;
- authorize CP-SCHEMA-1;
- move contracts out of `QUARANTINE`.

## Final classification

`generation_status_enum_drift_decision_documented_no_db_change_no_runtime_change`
