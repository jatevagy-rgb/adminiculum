# Phase 6 Model Gaps

This is a schema-design classification, not a request to modify Prisma before
Phase 5 acceptance.

## BLOCKER

| Gap | Why it blocks implementation | Required direction |
|---|---|---|
| No immutable legal source/version/provision graph | The current corpus hash anchor cannot be selected, reviewed, superseded or reproduced in product data. | Add `LegalSource`, `LegalSourceVersion`, `LegalProvision`; preserve SHA, capture time, provenance, completeness/review state, supersession and `VERSION_AMBIGUOUS`. |
| No versioned requirement/citation/rule model | A mutable requirement or text rule would rewrite historic decisions. | Add stable `Requirement`, immutable `RequirementVersion`, `RequirementProvision` M:N and `ApplicabilityRuleVersion` owned by requirement version. |
| No typed/scoped fact definition | `ClientFact.type` and `value` are strings and cannot reliably distinguish company, site, event, product, transaction or tax-period facts. | Add `FactDefinition`; extend canonical `ClientFact` with definition, constrained typed value, scope/entity and determination method. |
| No reproducible applicability record | Existing assessments are review sessions and cannot evidence which rule, facts and source version yielded a conclusion. | Add immutable `RequirementApplicability` with snapshot/references, result, reason, unresolved inputs, evaluation time and engine version. |

## SHOULD_FIX_BEFORE_IMPLEMENTATION

| Gap | Required direction |
|---|---|
| Current fact time model only has `validFrom`/`validTo` | Add observed/effective/reference-period fields as relevant by definition and prevent accidental overlapping fact windows for the same definition/scope. |
| Rule language has no product validation contract | Define a closed JSON AST vocabulary and input type checking. Reject unknown operators and never store code, JavaScript or `eval` expressions. |
| Requirement status and source review gate are not modelled | Use a legal lifecycle (`CANDIDATE`, `LEGAL_REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `SUPERSEDED`, `RETIRED`); runtime selects approved content only. |
| Deadline semantics would otherwise be prose | Represent event-offset, fixed-date, periodic, before/on-change and none separately from legal effective dates. |
| Findings need traceability to the decision that exposed a gap | Add an optional later direct `AssessmentFinding` to `RequirementApplicability` link, or an equivalent constrained relation. |
| Client-safe explanation is not separated from internal review notes | Persist/render machine trace, internal legal trace and client-safe explanation as separate disclosure domains. |

## CAN_DEFER

| Capability | Why it can defer |
|---|---|
| Regulatory-change diff and automatic re-evaluation | Source/version lineage makes it possible later; it is not needed to evaluate the initial reviewed set. |
| Control catalogue and controls-to-requirement M:N UI | Phase 6 can establish the requirement/evaluation spine first. |
| Dedicated evidence requirement lifecycle | Initial evidence can reuse `DocumentVersion` and `AssessmentItem`; add a dedicated model with retention/collection state later. |
| Compliance document type, template approval and generation UI | The 11 DOCX templates can be catalogued later while existing `Document`/`DocumentVersion` stores output now. |
| Reminder/calendar and recurring task generation | A structured deadline policy can exist without a scheduler in the first implementation. |
| Customer portal compliance screens | Customer rendering follows the legal/internal explanation boundary; it is not a schema precondition. |

## NOT_NEEDED

| Rejected idea | Reason |
|---|---|
| `OrganizationFact` | `ClientFact` is already the canonical client-owned fact record and should be extended rather than duplicated. |
| `ComplianceTask` | Existing `Task` and its finding remediation relation are canonical. |
| A second document/evidence store | Existing `Document` and immutable `DocumentVersion` already provide client/case scoped evidence and version lineage. |
| Stored executable rules or runtime AI classification | Deterministic validated data is auditable; executable logic and autonomous legal classification are not. |
| A compliance-specific ACL | Existing client/workforce authorization and same-client relation checks remain the security boundary. |
| A generic JSON blob for all domain concepts | It defeats typed facts, scope validation, version lifecycle and queryable audit history. |
