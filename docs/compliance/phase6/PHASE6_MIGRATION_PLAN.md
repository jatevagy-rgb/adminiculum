# Phase 6 Additive Migration Plan

No slice below is implemented by this documentation task. Each slice is a
separate reviewed migration and is independently rollback-safe by disabling its
feature gate and preserving prior rows.

| Slice | Prisma/data change | Risk and backfill | Tests | Gate and rollback |
|---|---|---|---|---|
| A: legal catalogue | Add `LegalSource`, `LegalSourceVersion`, `LegalSourceCapture`, `LegalProvision` plus indexes. | Global additive tables only; import no production content automatically. REACH captures remain distinct/ambiguous. | Migration apply/rollback rehearsal; source SHA, provision-anchor and uniqueness tests. | Runtime flag remains off. Rollback disables writers; no destructive drop in the release. |
| B: requirement policy | Add `Requirement`, `RequirementVersion`, `RequirementVersionProvision`, `ApplicabilityRuleVersion`. | Additive global tables. Candidate import produces only `CANDIDATE`/`LEGAL_REVIEW_REQUIRED`. | Lifecycle transition, citation cardinality, AST schema validation, no-overlapping-approved-version tests. | Flag off; no approved content is runtime-visible until named approval. |
| C: facts | Add `FactDefinition`, `FactSubject`, nullable Phase 6 columns/indexes on `ClientFact`. | Highest compatibility risk: existing `type`/`value` stay intact. Deterministic typed backfill only; ambiguous values remain legacy. | Existing company workspace regression; create/update/verify fact regression; same-client subject validation; typed-column validation; dual-read tests. | Keep Phase 1 paths authoritative. Rollback stops typed writes and retains legacy rows. |
| D: evaluator history | Add `RequirementApplicability` and `RequirementApplicabilityFact`. | Additive client-specific history. No bulk evaluation or customer output in first migration. | Deterministic AST examples, effective-version selection, snapshot digest/idempotency, mutable-fact reproducibility, client isolation. | `ENABLE_COMPLIANCE_ENGINE=false` default. Rollback disables evaluator; histories remain audit records. |
| E: review bridge | Add nullable `AssessmentFinding.requirementApplicabilityId` plus index. | Existing findings stay null; no backfill required. | Finding only on applicable gap; cross-client relation rejection; assessment lifecycle regression. | Gate UI/workflow consumers separately; rollback leaves nullable relation unused. |

## Existing ClientFact backfill classifications

| Current fixture/registry type | Proposed treatment |
|---|---|
| `EMPLOYEE_COUNT` with a numeric string | Deterministic only after an approved definition declares the count method/reference period. Parse to `numberValue`; otherwise remain legacy. |
| `REVENUE_BAND` with an allowed historic code such as `BAND_A` | Deterministic once an approved enum definition owns that exact vocabulary. |
| `MAIN_ACTIVITY` | Leave legacy until controlled taxonomy/scope is approved; free text cannot be silently recast as a legal activity classifier. |
| `SENSITIVE_DATA_USAGE` | Requires human/legal mapping. It must not be assumed equivalent to a GDPR special-category classification. |
| Unknown, malformed or expired legacy values | Leave legacy and report for review; do not coerce, delete or evaluate. |

## Deployment/operational sequence

1. Apply schema-only slice in an environment with the feature flag off.
2. Run existing company workspace and client authorization tests before and
   after each slice.
3. Import candidate source/requirement data only as non-runtime review records.
4. Test a deliberately small approved fixture set in isolated acceptance data.
5. Enable evaluation only after Phase 5 acceptance, explicit legal approval,
   migration verification and product smoke testing.

No direct production SQL, schema deletion, automatic candidate approval or
automatic customer exposure belongs to this plan.
