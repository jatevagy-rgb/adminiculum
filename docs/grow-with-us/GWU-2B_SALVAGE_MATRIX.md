# GWU-2B Salvage Matrix

This document preserves the independent comparison audit between the merged canonical Company OS foundation (PR #245) and the superseded alternative (PR #249). It is documentation only; it does not authorize runtime, schema, migration, merge, or deployment work.

`ROADMAP_CAPABILITIES_REMOVED=NONE`

## Canonical branch decision

- `CANONICAL_FOUNDATION`: merged PR #245 (`906caba189ed6223be078d126f4f820240ce9776`, merged to master as `042e1c59a0078670e097b3decade1d6434d7826f`).
- `SUPERSEDED_REFERENCE`: PR #249 (`30200619055a1de77784fad3da6cffad713d32d4`), retained only as an auditable comparison until explicitly closed.
- Both candidates use the existing `/api/v1/company-workspace/clients/:clientId/data-room` route family and existing canonical models. Neither adds schema or migration files.

## SALVAGE

### Adaptive relevant-data coverage

PR #249 adds a relevant-definition denominator based on active Company Profile 2.0 definitions, baseline/discovery-baseline questions, and the existing adaptive visibility resolver. Salvage this capability in a future bounded read model, but define `known` as answered values only. `UNKNOWN` remains its own state and must not inflate a known-value count. Hidden and undetermined adaptive questions need an explicit projection policy so the facts list and denominator cannot contradict each other.

### Deterministic Company Profile derivations

PR #249 reuses `applyDeterministicDerivations` and the existing canonical adaptive state map. Preserve this as a read-only derivation layer; it must never write a ClientFact or replace an explicit answer.

### Bounded measured process state

PR #249 adds the latest `ProcessObservationSnapshot` per process and allowlists process metric codes. Preserve measured metrics as a separate field from estimated active/waiting minutes. Snapshot provenance and raw payload remain internal.

### Richer workforce context

PR #249 adds safe organization descriptions and group names to the existing group/person projection. Preserve client scoping and avoid inferring RACI, reporting lines, FTE counts, or customer publication.

### Initiative and milestone detail

PR #249 adds bounded `DevelopmentInitiative` and `CompanyMilestone` fields: status, priority, target state/date, milestone count, and milestone dates. These are workforce-only context fields and do not mean an initiative is approved, customer-published, or completed.

### Workforce opportunity status summary

PR #249 adds `ImprovementOpportunity` status counts. Preserve this as an internal summary only; recommendation candidates and internal research reasoning remain outside the Company OS DTO.

### Non-synthetic outcome detail

PR #245 already establishes the safer `synthetic=false` outcome boundary and basis grouping. Preserve basis counts for `MEASURED`, `CALCULATED`, `ESTIMATED`, and `ASSUMED`, while keeping synthetic rows excluded or separately labeled. No basis implies a realized business result.

### Explicit data-quality gaps

PR #249 explicitly reports `STALE=CONTRACT_GAP` and `CONFLICTING=CONTRACT_GAP`. Preserve the honesty of these markers until a canonical temporal/conflict policy exists. Do not invent an age threshold or infer conflict from multiple historical facts.

## DEFER

- Rich `ContractRecord` projection until source-case and restricted-contract authorization is explicitly defined.
- Customer Company OS projection and any customer route.
- Customer publication or `isCustomerVisible` semantics.
- Persisted stale/conflict state and provenance workflows.
- Controlled editing, review, freshness, conflict resolution, evidence reuse, and feedback workflows (GWU-3+).

## REJECT_UNSAFE

- PR #249 document metadata queried by `clientId` without case authorization.
- PR #249 document counts queried by `clientId` without case and `HR_CONFIDENTIAL` filtering.
- Document-linked evidence counts that do not use exactly the same document authorization scope.
- Any `knownCount` that treats `UNKNOWN` as a known value.
- Any outcome total that allows synthetic or assumed data to read as an achieved result.
- Archived process/system rows in a current operational Company OS projection.

PR #245's latest head adds `internalCaseScope` and `hrConfidentialReadAllowed` to document counts, versions, and document-linked evidence counts. That authorization repair is part of the merged canonical foundation.

## DUPLICATE

The following capabilities are already safely represented by merged PR #245 and should not be reimplemented from PR #249:

- Existing company-workspace route family and workforce authorization.
- Client identity and operating-profile projection.
- Typed fact projection with UNKNOWN masking and current temporal semantics.
- Organization, process, and system base projection.
- Case/HR-scoped document summary counts.
- Contract aggregate counts by status.
- Compliance summary from `getComplianceWorkspace`, including current-only/evaluation context.
- Evidence status/source aggregates.
- Initiative/milestone aggregate counts.
- Non-synthetic outcome basis counts.
- Read-only and no-customer-publication boundaries.

## Internal GWU-2 sub-slices

These are internal slices; the top-level roadmap is unchanged:

- `GWU-2B.1`: merged canonical bounded backend foundation (PR #245).
- `GWU-2B.2`: safe enrichment: adaptive coverage, measured process state, richer workforce context, and non-synthetic outcome detail.
- `GWU-2B.3`: workforce Company OS frontend.
- `GWU-2B.4`: explicit customer-safe Company OS projection.

`GWU-3` remains controlled editing plus provenance, freshness, and conflict handling.

## Security and semantic decision record

- Client-level workforce authorization is not a substitute for case/document authorization.
- `Document.securityClassification=HR_CONFIDENTIAL` is an additional privileged-role boundary.
- `BusinessProcess`, `BusinessProcessStep`, and `BusinessSystem` are client-owned operational data; archived rows remain available for audit but are excluded from the current operational projection.
- `ResearchEvidence` is research grounding only and never canonical company fact.
