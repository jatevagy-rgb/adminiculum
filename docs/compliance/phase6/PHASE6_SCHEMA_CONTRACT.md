# Phase 6 Minimum Schema Contract

## Boundary

This is the implementation contract for Phase 6 after the Phase 5 acceptance
gate. It specifies additive Prisma work only; it is not a Prisma change, a
migration, a seed, runtime code or an authorization change.

Existing canonical models stay reused: `Client`, `ClientFact`,
`ClientOperatingProfile`, `Assessment`, `AssessmentItem`, `AssessmentFinding`,
`Task`, `Document` and `DocumentVersion`. Phase 6 must not create
`OrganizationFact`, `ComplianceTask`, a duplicate document/evidence store, a
compliance ACL, executable database rules or runtime AI applicability.

## Global legal catalogue

```text
LegalSource
  id, sourceKey (global unique immutable), jurisdictionCode, instrumentType,
  canonicalCitation, title, issuer, status, createdAt, updatedAt

LegalSourceVersion
  id, legalSourceId, legalVersionKey, versionLabel, consolidationDate,
  effectiveFrom, effectiveTo, status, reviewStatus, supersededById,
  createdAt, approvedAt, approvedById
  unique(legalSourceId, legalVersionKey)
  index(legalSourceId, effectiveFrom)

LegalSourceCapture
  id, legalSourceVersionId, sourceSha256, capturedAt,
  provenance, completeness, captureStatus, ambiguityStatus, sourceUri,
  importedById, selectedForReviewAt
  unique(legalSourceVersionId, sourceSha256)
  index(sourceSha256)
  index(legalSourceVersionId, captureStatus)

LegalProvision
  id, legalSourceCaptureId, normalizedReference, displayReference,
  excerpt, excerptSha256, lineStart?, lineEnd?, headingContext?, createdAt
  unique(legalSourceCaptureId, normalizedReference, excerptSha256)
  index(legalSourceCaptureId, normalizedReference)
```

`sourceKey` is globally unique and immutable: it identifies the legal
instrument, not a file. `LegalSourceVersion` represents the asserted legal or
consolidated version. `LegalSourceCapture` represents a particular byte capture
and carries SHA/provenance/completeness/review/ambiguity. This extra distinction
is required by the real REACH pair: two hashes may describe the same apparent
consolidated version while differing in capture head and bytes. Treating them as
two legal versions would invent a legal change; storing one hash on a version
would lose provenance. A version can have several captures, none or one of
which is selected for a reviewed use. `VERSION_AMBIGUOUS` is a capture/source
review status, never silently resolved by file order.

`LegalProvision` is capture-bound so an excerpt hash has its exact physical
anchor. It stores only the cited excerpt and context needed for review, not a
copied full legal text. Its line range is advisory. A requirement version cites
provisions from the capture explicitly accepted in review.

## Requirement catalogue

```text
Requirement
  id, key (global unique immutable), domainCode, requirementType,
  createdAt, retiredAt

RequirementVersion
  id, requirementId, versionNumber, title, legalSummary, operationalAction,
  effectiveFrom, effectiveTo, lifecycle, documentClassification,
  deadlineSchemaVersion?, deadlinePolicy?, reviewRequestedAt, reviewedAt,
  approvedAt, approvedById, supersededById, createdAt
  unique(requirementId, versionNumber)
  index(requirementId, effectiveFrom)
  index(lifecycle, effectiveFrom)

RequirementVersionProvision
  id, requirementVersionId, legalProvisionId, supportRole, displayOrder,
  unique(requirementVersionId, legalProvisionId, supportRole)
  index(legalProvisionId)

ApplicabilityRuleVersion
  id, requirementVersionId (unique), astSchemaVersion, ast, validationStatus,
  lifecycle, createdAt, approvedAt, approvedById
  index(lifecycle)
```

`Requirement` contains only stable identity, domain and bounded type.
Requirement-version rows contain human legal/operational content, effective
window, lifecycle, document classification, deadline policy and review/approval
audit. Citations belong to `RequirementVersion`, therefore the correct join name
is `RequirementVersionProvision`, not `RequirementProvision`: legal sources,
implementation decrees and multiple bases can change without rewriting historic
versions.

The lifecycle is `CANDIDATE`, `LEGAL_REVIEW_REQUIRED`, `APPROVED`, `REJECTED`,
`SUPERSEDED`, `RETIRED`. Only `APPROVED` versions and their one `APPROVED` AST
may be runtime selected. Every status transition is service-owned and audited.

`documentClassification` lives directly on `RequirementVersion` with the enum
`EXPLICIT_DOCUMENT_REQUIRED`, `DOCUMENTED_EVIDENCE_REQUIRED`,
`POLICY_USEFUL_IMPLEMENTATION_CONTROL`, `NO_DOCUMENT_NEEDED`, `UNCERTAIN`.
Controls, evidence requirements and compliance document types stay deferred;
they are not necessary to normalize one bounded version attribute.

## Client data and evaluation

The exact `FactDefinition`/`ClientFact`/`FactSubject` contract is
[`PHASE6_FACT_MODEL.md`](PHASE6_FACT_MODEL.md). The exact evaluator and
snapshot contract is [`PHASE6_EVALUATION_SNAPSHOT.md`](PHASE6_EVALUATION_SNAPSHOT.md).

```text
RequirementApplicability
  clientId -> Client
  requirementVersionId -> RequirementVersion
  applicabilityRuleVersionId -> ApplicabilityRuleVersion
  ... immutable result, snapshot and disclosure fields

RequirementApplicabilityFact
  applicabilityId -> RequirementApplicability
  clientFactId -> ClientFact
  factDefinitionId -> FactDefinition
  ... immutable fact snapshot
```

All client-specific rows reference `Client` directly or through a validated
client-owned relation. Source, provision, requirement and definition catalogues
are internal/global. No new ACL is introduced.

## Ingestion and runtime gate

Candidate JSON follows this controlled path:

```text
candidate JSON -> schema/anchor validation -> CANDIDATE or LEGAL_REVIEW_REQUIRED
-> named legal approval -> APPROVED version/rule -> runtime eligible
```

Candidate ingestion may create reviewable rows but cannot create approved runtime
content automatically. The later runtime gate is `ENABLE_COMPLIANCE_ENGINE`,
default `OFF`, and evaluation additionally requires approved selected content.
With the flag off, no portal/API output, task, finding or generated document is
created from compliance candidates.

## Frozen unresolved items

There are no schema-architecture blockers remaining. Before code starts, the
Phase 5 acceptance gate must be satisfied and legal reviewers must approve the
first concrete value dictionaries, source captures and requirement content. The
real REACH current-capture ambiguity remains a content-review blocker for any
requirement that depends on it; it is intentionally representable rather than
silently solved by the schema.
