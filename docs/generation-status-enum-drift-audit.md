# GenerationStatus Enum Drift Audit

Final classification target: `generation_status_enum_drift_audited_no_db_change_no_runtime_change`

This document records a documentation-only audit of the confirmed `GenerationStatus` enum drift between the current Prisma schema and the production physical database. It does not authorize a schema change, migration, DB apply, runtime enablement, or Client Portal work.

## 1. Purpose

The production schema comparison confirmed that the repository Prisma enum includes `APPROVED` and `REJECTED`, while the production PostgreSQL enum does not. This audit answers the narrow follow-up question: which repository paths reference those values, and can any current runtime write path attempt to persist them against production?

## 2. Confirmed drift

| Source | Observed values |
| --- | --- |
| `Backend/prisma/schema.prisma` `GenerationStatus` | `PENDING`, `PREVIEW`, `GENERATED`, `UPLOADED`, `APPROVED`, `REJECTED`, `FAILED`, `EXPIRED` |
| Production physical enum, from prior read-only metadata comparison | `PENDING`, `PREVIEW`, `GENERATED`, `UPLOADED`, `FAILED`, `EXPIRED` |
| Drift | Production lacks Prisma-declared `APPROVED` and `REJECTED` |

This means any production write to `contract_generations.status = 'APPROVED'` or `contract_generations.status = 'REJECTED'` can fail unless production is additively remediated or the repository/runtime is changed to stop using those values.

## 3. Reference inventory

| Area | Files inspected | Reference classification | Finding | Risk |
| --- | --- | --- | --- | --- |
| Prisma schema | `Backend/prisma/schema.prisma` | Schema/API type source | `GenerationStatus` declares `APPROVED` and `REJECTED`, which are absent in production. | High as a drift blocker; no DB mutation occurred in this audit. |
| Contract routes | `Backend/src/modules/contracts/routes.ts` | Runtime route surface | Contract routes are auth-first and globally guarded by `requireContractsEnabled`, which requires both `ENABLE_CONTRACT_GENERATION` and `ENABLE_CONTRACT_GENERATION_STORAGE_MODEL`. | Current production reachability is low while disabled; latent risk remains if enabled without enum remediation. |
| Contract generation service | `Backend/src/modules/contracts/services.ts` | Runtime write/read path | Normal generation/preview/revision paths write production-present statuses such as `GENERATED`, `UPLOADED`, and `PREVIEW`. `finalizeContract` writes `status: 'APPROVED'`. `rejectApproval` writes status back to `GENERATED` and records `CONTRACT_REJECTED` only as a timeline event type. | `APPROVED` is a confirmed latent write-risk if contracts are enabled before enum drift is resolved. No `GenerationStatus.REJECTED` write was found in this service. |
| Contract boundary tests | `Backend/tests/contractsBoundary.test.ts` | Test/guard proof | Tests assert disabled contract routes do not reach `contractGeneration` Prisma operations. | Supports current gate-off safety; does not resolve schema drift. |
| Legal analyses | `Backend/src/modules/legal-analyses/service.ts` | Runtime write/read path, different enum | Uses `APPROVED` in legal-analysis status logic and reads `contractGeneration` as a source object, but this is not a `GenerationStatus` write. Legal-analysis runtime remains covered by document/AI hardening. | Low for `GenerationStatus`; separate privacy/schema family remains quarantined. |
| Documents / anonymize / review notes / handoff / tasks / cases / workflow | `Backend/src/modules/documents`, `Backend/src/modules/anonymize`, `Backend/src/modules/review-notes`, `Backend/src/modules/handoff-packages`, `Backend/src/modules/tasks`, `Backend/src/modules/cases`, `Backend/src/modules/workflow`, `Backend/src/utils` | Runtime read/write/display paths, mostly unrelated statuses | Many `APPROVED` / `REJECTED` strings are case, task, document, handoff, workflow, review-suggestion, or timeline statuses. Some modules read `contractGeneration`, but no additional `GenerationStatus.APPROVED` / `GenerationStatus.REJECTED` write was identified outside contracts finalization. | Low for this enum; still relevant to broader quarantined privacy/side-effect families. |
| OpenAPI metadata | `Backend/src/docs/api/openapi.yaml` and served OpenAPI hardening context | Validation/API contract path | `APPROVED` / `REJECTED` appear for other document/review-style status contracts, not as a proven public `GenerationStatus` contract. Served public metadata has already been hardened to reduce quarantined exposure. | Low for this enum; OpenAPI/CORS boundary remains quarantined until final exposure decisions. |
| Frontend | `Frontend/src` | Display/UI mapping | Frontend references `APPROVED` / `REJECTED` for case/task/document/review/handoff display and workflow filtering. No frontend write path directly setting `GenerationStatus.APPROVED` / `GenerationStatus.REJECTED` was identified in this audit. | Low for direct enum writes; UI may still display backend-provided contract status if contract features are later enabled. |
| Docs | `docs/*.md` | Docs-only | Prior docs correctly record enum drift and keep production apply / CP-SCHEMA-1 blocked. | No runtime risk. |

## 4. Runtime write risk assessment

Current production risk is controlled but not resolved:

- Contracts are currently a quarantined family and have been hardened/default-disabled by `CONTRACTS-HARDEN-1`.
- `Backend/src/modules/contracts/routes.ts` applies `router.use(authenticate)` and then `router.use(requireContractsEnabled)` before route declarations.
- `requireContractsEnabled` requires both `ENABLE_CONTRACT_GENERATION` and `ENABLE_CONTRACT_GENERATION_STORAGE_MODEL`; `ENABLE_CONTRACT_GENERATION=true` alone is intentionally insufficient.
- Disabled contract routes should return feature-unavailable before reaching generation services, Prisma writes, multer/file operations, SharePoint upload, cleanup/delete, or timeline writes.
- If the contracts family were enabled before enum reconciliation, `finalizeContract` would be the primary confirmed risk because it writes `contract_generations.status = 'APPROVED'`.
- No current `contractGeneration` write to `status = 'REJECTED'` was found. Rejection/undo approval writes the status back to `GENERATED` and emits a `CONTRACT_REJECTED` timeline event type.

## 5. API, validation, and display risk assessment

The schema drift remains a production-compatible baseline blocker even though the highest-risk runtime route family is disabled. Prisma schema/type generation currently allows `APPROVED` and `REJECTED`; production cannot store those enum values. This mismatch is risky for future development because a new or re-enabled route could compile locally and fail only at production write time.

Observed `APPROVED` / `REJECTED` references in non-contract areas mostly belong to separate status domains: case status, task status, document folder/status, document review suggestions, legal-analysis status, handoff package status, workflow state, or timeline event type. Those should not be treated as `GenerationStatus` unless a future targeted audit proves otherwise.

## 6. Safe options

### Option A: add production enum values later

Add `APPROVED` and `REJECTED` to the production `GenerationStatus` enum through a dedicated additive migration after product approval and clone proof.

- Pros: aligns production to current Prisma schema and the latent contracts finalization flow.
- Cons: keeps the status semantics and requires a real migration with clone proof.
- Required before action: human decision that contract finalization status should persist as `APPROVED` / `REJECTED`-capable enum values.

### Option B: remove repo enum values later

Remove `APPROVED` and `REJECTED` from the Prisma enum and replace finalization semantics with existing fields such as `isFinalRevision` / `finalizedAt`, plus production-present statuses such as `GENERATED` or `UPLOADED`.

- Pros: aligns repository to production and reduces enum surface.
- Cons: requires schema and runtime changes; might discard intended finalization semantics.
- Required before action: product decision that `APPROVED` / `REJECTED` are not part of generated-contract lifecycle.

### Option C: keep quarantine and defer remediation

Keep contracts/generation drift quarantined and leave both production apply and CP-SCHEMA-1 blocked until a human decision chooses Option A or B.

- Pros: safest immediate posture; no DB or runtime change.
- Cons: does not unblock production-compatible baseline implementation or CP-SCHEMA-1.

## 7. Recommended next safe package

Recommended next prompt:

`Adminiculum — GENERATION-STATUS-ENUM-DRIFT-DECISION-1`

That task should remain docs/design-only and ask for an explicit human/product decision between:

1. bring production forward by additively adding `APPROVED` / `REJECTED` later, or
2. bring the repository/runtime back to production values by removing those enum states from generated-contract lifecycle, or
3. keep contracts quarantined and defer.

No migration should be generated until that decision is recorded and a fresh clone proof plan exists.

## 8. Non-actions

This audit did not:

- connect to any database;
- use production, clone, Kudu, or Azure access;
- run `prisma migrate deploy`, `prisma migrate dev`, `prisma migrate resolve`, or `prisma db push`;
- edit `schema.prisma`;
- edit migration files;
- change backend, frontend, OpenAPI, CORS, auth, route, package, or test behavior;
- enable contracts, document/AI, Client Portal, or CP-SCHEMA-1;
- make existing data client-visible.

## 9. Final classification

`generation_status_enum_drift_audited_no_db_change_no_runtime_change`
