# Phase 6 Evaluation Snapshot Contract

## RequirementApplicability

`RequirementApplicability` is an immutable, client-specific evaluation record.
It is not an `Assessment` and is never edited in place. A re-evaluation creates
a new record; an earlier row may be marked superseded by relation only.

```text
RequirementApplicability
  id                               UUID
  clientId                         UUID -> Client
  requirementVersionId             UUID -> RequirementVersion
  applicabilityRuleVersionId       UUID -> ApplicabilityRuleVersion
  result                           RequirementApplicabilityResult
  evaluatedAt                      DateTime
  evaluationEffectiveAt            DateTime
  engineVersion                    String
  reasonCode                       String?
  unresolvedFactDefinitionKeys     Json?       // small ordered string array
  gateKind                         SpecialistGateKind?
  machineTrace                     Json?       // compact AST/result trace; bounded
  inputSnapshot                    Json        // canonical immutable values
  clientSafeExplanation            String?     // approved disclosure text
  internalExplanation               String?     // workforce/legal only
  supersededById                    UUID?
  createdAt

  index(clientId, evaluatedAt desc)
  index(clientId, requirementVersionId, evaluationEffectiveAt desc)
  index(requirementVersionId, result)
  unique(clientId, requirementVersionId, applicabilityRuleVersionId,
         evaluationEffectiveAt, engineVersion, inputSnapshotDigest)
```

`inputSnapshotDigest` is a SHA-256 of canonical snapshot serialization. It
supports idempotent reruns without pretending that a live fact pointer is an
audit record. `machineTrace`, unresolved keys and explanations are bounded by
service validation; large raw source text and reviewer notes do not belong here.

## Snapshot strategy

Use **both** explicit immutable input links and a canonical value snapshot:

```text
RequirementApplicabilityFact
  applicabilityId       UUID -> RequirementApplicability
  clientFactId          UUID -> ClientFact
  factDefinitionId      UUID -> FactDefinition
  role                  INPUT | SPECIALIST_CLASSIFICATION | CONTEXT
  factSnapshot          Json       // canonical value/temporal/provenance subset
  unique(applicabilityId, clientFactId, role)
  index(clientFactId)
```

The join rows make impact analysis and correction workflows queryable. The
snapshot makes a decision reproducible even though current `ClientFact` rows
are updated in place. Both record fact ID and evaluated typed value, scope,
validity/reference dates, verification state and source document version ID. A
live pointer by itself is expressly insufficient.

Phase 6 does not require append-only or versioned `ClientFact`: the existing
company workspace updates facts in place and resets verification on material
change. Requiring a global fact-history rewrite would raise migration risk with
no added value beyond this snapshot in v1. Later fact versioning may be added
behind the same snapshot contract.

## Frozen result enum

```text
APPLIES
DOES_NOT_APPLY
INSUFFICIENT_FACTS
LEGAL_REVIEW_REQUIRED
TECHNICAL_REVIEW_REQUIRED
SOURCE_SUPPORT_INSUFFICIENT
```

`NOT_YET_EFFECTIVE` and `EXPIRED` are not evaluation results. They belong to
deterministic requirement-version selection before a rule is chosen. This keeps
result rows about the client/rule conclusion rather than policy catalogue state.

## Effective-version selection

At an `evaluationEffectiveAt`, the engine performs these checks in order:

1. Select `RequirementVersion` rows whose lifecycle is `APPROVED` and whose
   `[effectiveFrom, effectiveTo]` contains the date.
2. Require exactly one selected version. Zero produces no applicability row and
   returns a catalogue-selection failure; more than one is a data-integrity
   error and evaluation stops.
3. Require selected source support to be reviewed and usable. A
   `VERSION_AMBIGUOUS`, incomplete or unsupported source produces
   `SOURCE_SUPPORT_INSUFFICIENT` only when a selected approved policy explicitly
   identifies this bounded support issue; otherwise it cannot be approved.
4. Select its single approved rule AST, validate schema version, resolve facts
   using client, scope and temporal policies, then write immutable results.

The schema must prevent overlapping approved effective windows for the same
requirement. Since a partial temporal exclusion constraint is not represented by
Prisma, approval service uses a transaction/advisory lock and overlap query; a
later custom PostgreSQL exclusion constraint is optional hardening.

## Deadline policy

`RequirementVersion.deadlinePolicy` is a typed, schema-validated JSON object in
v1, with `deadlineSchemaVersion = "1"`. It is one policy per version, sparse,
and avoids a premature relation for a structure that Phase 11 will consume.

Allowed forms are `NONE`, `EVENT_OFFSET`, `FIXED_DATE`, `PERIODIC`,
`ON_MATERIAL_CHANGE`, `BEFORE_EVENT`.

```json
{ "kind": "EVENT_OFFSET", "eventFact": "EMPLOYMENT_RELATIONSHIP_STARTED", "offset": { "unit": "DAY", "value": 7 } }
```

```json
{ "kind": "BEFORE_EVENT", "eventFact": "CONTRACT_CONCLUSION", "offset": { "unit": "DAY", "value": 0 } }
```

```json
{ "kind": "PERIODIC", "interval": { "unit": "YEAR", "value": 5 }, "anchor": "LAST_COMPLETED" }
```

This represents seven days from employment start, effective-date notifications,
fourteen-day withdrawal refunds, five-year recurrence, material-change triggers
and pre-contract duties without building scheduling. `RequirementVersion`
effective dates remain legal-policy selection fields, never customer deadlines.

## Assessment/finding and disclosure boundary

`AssessmentFinding.requirementApplicabilityId?` is the minimal future optional
foreign key. It is null for existing/non-compliance findings. A finding is
created only when an `APPLIES` evaluation has a demonstrated gap; applicability
alone is never a finding. Existing `Assessment`, `AssessmentItem`, `Task` and
`DocumentVersion` remain the orchestration, presentation, remediation and
evidence models.

Every applicability row has a client ID and services validate any joined fact,
finding, task and document belongs to that client. Legal catalogue/source data
is global/internal. Client-safe explanation is the only customer disclosure
candidate; internal explanation and source-review material are never exposed.
