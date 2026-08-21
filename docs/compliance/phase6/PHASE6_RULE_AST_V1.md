# Phase 6 Rule AST v1 Contract

## Envelope and ownership

Each `RequirementVersion` owns exactly one active `ApplicabilityRuleVersion`
root AST in v1. There is no reusable rule graph and no ordered fragment list.
A policy revision creates a new immutable requirement version and rule version.
The rule has `astSchemaVersion = "1"`, `validationStatus`, `lifecycleStatus`,
`createdAt` and reviewer/approval audit fields. Separate rule effective dates
are forbidden: the parent `RequirementVersion.effectiveFrom/effectiveTo` is the
only policy-effective window.

The stored JSON must match this closed schema. It is data, never code; no
JavaScript, SQL, template expression, callback name, `eval`, arbitrary operator
or free-text condition is accepted.

## Closed vocabulary

| Operator | Shape | Meaning |
|---|---|---|
| `ALL` | `{ "ALL": [node, ...] }` | Every child applies. |
| `ANY` | `{ "ANY": [node, ...] }` | At least one child applies. |
| `NOT` | `{ "NOT": node }` | Negates a conclusive child only. |
| `FACT_EXISTS` | `{ "FACT_EXISTS": { "fact": key } }` | A usable, in-scope fact value exists. |
| `FACT_EQUALS` | `{ "FACT_EQUALS": { "fact": key, "value": scalar } }` | Typed equality against BOOLEAN, ENUM, JURISDICTION or STRING. |
| `FACT_IN` | `{ "FACT_IN": { "fact": key, "values": [scalar, ...] } }` | Typed membership. |
| `NUMBER_COMPARE` | `{ "NUMBER_COMPARE": { "fact": key, "op": "GT|GTE|LT|LTE|EQ", "value": decimal } }` | Numeric comparison. |
| `DATE_COMPARE` | `{ "DATE_COMPARE": { "fact": key, "op": "ON_OR_AFTER|AFTER|ON_OR_BEFORE|BEFORE", "value": "YYYY-MM-DD" } }` | Date/datetime comparison. |
| `JURISDICTION_MATCH` | `{ "JURISDICTION_MATCH": { "fact": key, "codes": ["HU", ...] } }` | Canonical jurisdiction-code membership. |
| `SPECIALIST_GATE` | `{ "SPECIALIST_GATE": { "fact": key, "kind": "LEGAL|TECHNICAL" } }` | Requires a specialist-determined fact before the branch is conclusive. |

Every referenced key must resolve to an approved `FactDefinition`; every value
must type-check against it. `ALL` and `ANY` need at least one child. AST depth,
node count and value-array size have conservative server limits. Unknown facts,
operators or schema versions are validation failures, never runtime fallbacks.

## Specialist gate semantics

Specialist decisions have distinct roles:

- `FactDefinition.determinationMethod` declares how a fact is ordinarily
  obtained (`USER_PROVIDED`, `DERIVED`, `LEGAL_CLASSIFICATION_REQUIRED`,
  `TECHNICAL_CLASSIFICATION_REQUIRED`).
- `SPECIALIST_GATE` makes that need explicit at a particular branch of a rule.
- `LEGAL_REVIEW_REQUIRED` and `TECHNICAL_REVIEW_REQUIRED` are evaluation
  results when a required specialist fact has no conclusive approved value.

They are not three alternative ways to express the same state. A completed,
verified classification fact lets the rule evaluate normally; an absent or
`UNKNOWN` classification yields the relevant gate result.

## Examples

Employee information after employment start:

```json
{
  "FACT_EQUALS": { "fact": "EMPLOYMENT_RELATIONSHIP_STARTED", "value": true }
}
```

Consumer distance sale:

```json
{
  "ALL": [
    { "FACT_EQUALS": { "fact": "DISTANCE_CONSUMER_CONTRACT", "value": true } },
    { "FACT_EQUALS": { "fact": "CUSTOMER_TYPE", "value": "CONSUMER" } }
  ]
}
```

DORA out-of-scope conclusion only after legal classification:

```json
{
  "ALL": [
    { "SPECIALIST_GATE": { "fact": "DORA_FINANCIAL_ENTITY_SCOPE", "kind": "LEGAL" } },
    { "FACT_EQUALS": { "fact": "DORA_FINANCIAL_ENTITY_SCOPE", "value": "OUT_OF_SCOPE" } }
  ]
}
```

Serious accident notification:

```json
{
  "ALL": [
    { "FACT_EQUALS": { "fact": "WORK_ACCIDENT_OCCURRED", "value": true } },
    { "SPECIALIST_GATE": { "fact": "SERIOUS_WORK_ACCIDENT_CLASSIFICATION", "kind": "TECHNICAL" } },
    { "FACT_EQUALS": { "fact": "SERIOUS_WORK_ACCIDENT_CLASSIFICATION", "value": "SERIOUS" } }
  ]
}
```

AI staged effective date:

```json
{
  "ALL": [
    { "FACT_EQUALS": { "fact": "AI_HIGH_RISK_CLASSIFICATION", "value": "HIGH_RISK" } },
    { "ANY": [
      { "ALL": [
        { "FACT_EQUALS": { "fact": "AI_HIGH_RISK_LEGAL_BASIS", "value": "OTHER_HIGH_RISK" } },
        { "DATE_COMPARE": { "fact": "ASSESSMENT_DATE", "op": "ON_OR_AFTER", "value": "2026-08-02" } }
      ] },
      { "ALL": [
        { "FACT_EQUALS": { "fact": "AI_HIGH_RISK_LEGAL_BASIS", "value": "ARTICLE_6_1" } },
        { "DATE_COMPARE": { "fact": "ASSESSMENT_DATE", "op": "ON_OR_AFTER", "value": "2027-08-02" } }
      ] }
    ] }
  ]
}
```

The AST is evaluated with three-valued branch semantics: true, false or
non-conclusive-with-reason. The engine maps the final non-conclusive reason to a
frozen evaluation result; it does not silently treat it as false.
