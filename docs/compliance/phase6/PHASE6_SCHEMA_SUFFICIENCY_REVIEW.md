# Phase 6 Schema Sufficiency Review

## Scope and decision

This is a design preflight only. It inspects the canonical Prisma schema and
the client-company services at `bf105e36f8e2c7a7862576fcb869a212e7c0d89b`; it
does not change Prisma, create a migration, or implement a compliance engine.

The reviewed candidate corpus contains 46 requirements, 46 applicability rules,
61 facts and 11 DOCX review templates. Its source anchors already provide the
right ingestion identity: `sourceKey + sourceSha256 + provisionReference +
excerptSha256`. A line range remains capture-time evidence, not identity.

**Decision: the Phase 6 design requires schema changes before implementation.**
The existing customer lifecycle models are valuable reuse points, but they do
not yet represent immutable legal source/version/provision records, typed scoped
facts, or reproducible applicability evaluations. The implementation gate also
remains blocked until the Phase 5 product-acceptance sequence is complete.

## Current reuse surface

| Existing model | Reuse decision | Current useful behaviour | Boundary |
|---|---|---|---|
| `Client` | Reuse | Canonical customer identity and existing authorization boundary. | Compliance rows must remain client-scoped through this identity. |
| `ClientFact` | Reuse and extend | Client owner, source `DocumentVersion`, verification status, verifier and `validFrom`/`validTo`. | Its `type`/`value` are untyped strings and it has no fact definition, legal scope, reference period, determination method or non-overlap rule. |
| `ClientOperatingProfile` | Reuse | Narrative operating context and review dates. | It is not a substitute for evaluated facts. |
| `Assessment`, `AssessmentItem`, `AssessmentFinding` | Reuse | Session lifecycle, evidence document link and remediation finding/task relation. | An assessment is orchestration/presentation; an applicable requirement is not automatically a finding. |
| `Task` | Reuse | Existing status, ownership, due date and `AssessmentFinding.remediationTaskId`. | Later add a direct compliant relationship or use the finding relation; do not create `ComplianceTask`. |
| `Document`, `DocumentVersion` | Reuse | Logical document, immutable version lineage, review/publication state and client/case relation. | Do not create a second evidence/document store or use filename as legal classification. |

## Concept-by-concept decision

| Concept | Needed? | Reuse existing model? | New model? | Lifecycle/version requirement | Reason | Representative current candidates |
|---|---|---|---|---|---|---|
| LegalSource | Yes | No | Yes | Stable canonical identity; jurisdiction and instrument kind. | A legal instrument must survive later captures. | GDPR, AI Act, REACH/CLP, VAT Act |
| LegalSourceVersion | Yes | No | Yes | Immutable SHA, capture/import time, provenance, completeness, review status and supersession. | Legal applicability cannot depend on a mutable file. | EU Regulation versions, Hungarian statutes |
| LegalProvision | Yes | No | Yes | Bound to one source version; reference, excerpt hash and advisory range. | Requirements must cite a precise, reproducible provision. | GDPR Art. 30; AI Act Art. 4 |
| Requirement | Yes | No | Yes | Stable product/legal identity; bounded requirement type. | Keeps the identity while policy content changes. | Record of processing; whistleblowing channel |
| RequirementVersion | Yes | No | Yes | Immutable approved lifecycle and legal-effective window; selected source-version references. | Separates law/policy changes from historic evaluations. | VAT invoice content; consumer withdrawal |
| RequirementProvision | Yes | No | Yes | Explicit M:N with support role and ordered citation. | A requirement can rely on several provisions. | REACH classification and labelling anchors |
| ApplicabilityRule | Yes, logical concept | No | No separate stable row in v1 | Requirement version owns its rule versions. | A global rule identity creates no useful lifecycle in v1. | Employee threshold; webshop sale |
| ApplicabilityRuleVersion | Yes | No | Yes | Immutable, validated JSON AST, rule version and review status. | Prevents mutable or executable decision logic. | AI role, cyber scope, customs transaction |
| FactDefinition | Yes | No | Yes | Stable key, value type, permitted scope, determination method and question metadata. | A fact label is insufficient for reusable evaluation. | employee count, webshop, high-risk AI use |
| ClientFact | Yes | Yes, extended later | No second fact table | Typed value payload, scope/entity, observed/effective/reference periods and non-overlap validation. | Reuses canonical customer evidence while making it safe for rules. | site risk assessment, accident event, VAT transaction |
| RequirementApplicability | Yes | No | Yes | Immutable evaluation snapshot: client, requirement version, rule, fact references/snapshot, engine version, time and status. | Produces auditable conclusions rather than a boolean. | `APPLIES`, `INSUFFICIENT_FACTS`, `LEGAL_REVIEW_REQUIRED` |
| Control | Yes, but not minimum Phase 6 persistence | No | Later | Versioned M:N relation to requirement versions. | Controls are operational responses, distinct from law. | training, procedure, register |
| EvidenceRequirement | Yes, but can start on requirement version metadata | No | Later dedicated model | Versioned evidence type/retention and collection status. | Evidence obligations should not become free text on findings. | ROPA, training record, accident report |
| ComplianceDocumentType | Yes, defer implementation | No | Later | Stable type with client-safe presentation attributes. | Classifies generated compliance outputs without replacing documents. | privacy notice, withdrawal form, accounting policy |
| Template version | Yes, defer implementation | `DocumentVersion` for rendered output only | Later template version model | Approved template lineage, then rendered `Document`/`DocumentVersion`. | Template approval differs from a client document version. | 11 DOCX review templates |
| Assessment | Yes | Yes | No | Existing DRAFT/IN_PROGRESS/COMPLETED/ARCHIVED session lifecycle. | Presents a review run; keep it separate from the legal decision record. | annual workplace review |
| AssessmentItem | Yes | Yes | No | Snapshot/read-only presentation of selected evaluation/evidence. | Lets reviewers work without mutating applicability history. | missing policy evidence question |
| AssessmentFinding | Yes | Yes | No | Open only for an actual gap, with later applicability reference. | “Applies” alone is not a defect. | missing complaint procedure |
| Task | Yes | Yes | No | Existing task lifecycle; client/case authorization remains canonical. | Remediation work stays in the shared task system. | prepare withdrawal form |

## Minimum implementable Phase 6 design

The following is the minimum coherent set to approve before Phase 6 implementation:

1. `LegalSource`, immutable `LegalSourceVersion`, and version-bound
   `LegalProvision`, including `VERSION_AMBIGUOUS` as a source-review outcome.
2. Stable `Requirement`, immutable approved `RequirementVersion`, and explicit
   `RequirementProvision` M:N citations. Runtime evaluation may select only an
   approved, non-superseded version.
3. `ApplicabilityRuleVersion` owned by `RequirementVersion`, storing a
   schema-validated deterministic JSON AST only. No JavaScript, `eval`, stored
   expression, or runtime AI classification is permitted.
4. `FactDefinition`, plus a deliberately extended canonical `ClientFact`:
   typed value, canonical jurisdiction identifier, permitted scope and optional
   entity reference, `observedAt`, `effectiveAt`, `referencePeriodStart`,
   `referencePeriodEnd`, and an explicit determination method. Validity windows
   for the same fact/scope must not overlap unless the fact semantics allow it.
5. `RequirementApplicability` as the append-only evaluation record with a
   deterministic result, input snapshot/references, reason traces, unresolved
   facts, gate, evaluation time and engine version.
6. Use existing `Assessment`/`AssessmentItem` as review-session material,
   `AssessmentFinding` only for a genuine gap, existing `Task` for remediation,
   and existing `Document`/`DocumentVersion` for evidence/rendered output.

Recommended bounded value domains are:

- Fact value types: `BOOLEAN`, `ENUM`, `NUMBER`, `MONEY`, `DATE`, `DATETIME`,
  `STRING`, `JURISDICTION`, `ENTITY_REFERENCE`, `MULTI_ENUM`, `PERIOD`.
- Fact scopes: `COMPANY`, `WORKPLACE_SITE`, `EMPLOYEE`, `EVENT`,
  `SALES_CHANNEL`, `PRODUCT_SERVICE`, `CONTRACT`, `TAX_PERIOD`, `TRANSACTION`,
  `REPORTING_EVENT`.
- Determination methods: `USER_PROVIDED`, `DERIVED`,
  `LEGAL_CLASSIFICATION_REQUIRED`, `TECHNICAL_CLASSIFICATION_REQUIRED`.
- Evaluation results: `APPLIES`, `DOES_NOT_APPLY`, `INSUFFICIENT_FACTS`,
  `LEGAL_REVIEW_REQUIRED`, `TECHNICAL_REVIEW_REQUIRED`,
  `SOURCE_SUPPORT_INSUFFICIENT`, `NOT_YET_EFFECTIVE`, `EXPIRED`.

Deadlines belong to a structured requirement-version policy (event offset,
fixed date, periodic, before/on change, or none). Legal effective dates and
customer-performance due dates are different fields.

## Lifecycle, provenance and customer safety

Legal and policy content uses a lifecycle such as `CANDIDATE`,
`LEGAL_REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `SUPERSEDED`, `RETIRED`.
Only approved content may participate in runtime evaluation. Source coverage,
capture completeness and reviewer notes remain ingestion-side/internal metadata;
client views receive a curated explanation, never raw legal-review notes.

Each evaluation must preserve three separate traces: machine-readable rule and
fact snapshot, internal legal reasoning, and client-safe explanation. Source
version ambiguity or incomplete support yields an explicit non-conclusive
status, never an invented answer.

No new compliance ACL is required. Every client fact, evaluation, assessment,
finding, task and document link reuses the existing client/workforce
authorization and validates same-client document/entity relations.

## Deferred work

The following is intentionally not a prerequisite for the minimum Phase 6
schema: regulatory-change diff workflow, control catalogue UI, dedicated
evidence-collection lifecycle, approved template library UI, generated-document
workflow, reminders/calendar scheduling and customer-facing compliance pages.
They may use the Phase 6 identities and histories later, without reinterpreting
past evaluations.

The design is therefore sufficiently specified to plan a focused schema phase,
but **Phase 6 implementation remains blocked by the Phase 5 product-acceptance
gate** and by approval of the required schema changes above.
