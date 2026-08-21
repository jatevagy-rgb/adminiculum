# Phase 6 Fact Model Contract

## Decision

`ClientFact` remains the one client-owned fact-value table. Phase 6 adds a
global `FactDefinition` registry and additive typed columns to `ClientFact`.
It does not create `OrganizationFact`, does not replace Phase 1 facts, and does
not use a generic JSON value as the primary representation.

## FactDefinition

`FactDefinition` is a global, internal catalogue. Its immutable business
identity is an uppercase `key`, for example
`EMPLOYEE_COUNT_ACCOUNTING_AVERAGE`; database `id` is only the surrogate key.

```text
FactDefinition
  id                    UUID
  key                   String, globally unique, immutable
  domainCode            String
  valueType             FactValueType
  allowedEnumValues     Json?       // only ENUM or MULTI_ENUM; closed list
  allowedScopeTypes     FactScopeType[]
  determinationMethod   FactDeterminationMethod
  overlapPolicy         FactOverlapPolicy
  temporalPolicy        FactTemporalPolicy
  questionKey           String?     // stable collection/UI key, not customer text
  status                FactDefinitionStatus
  createdAt, retiredAt
```

The key is global rather than jurisdiction-qualified. A single business concept
must not acquire different meanings from a jurisdiction suffix. Jurisdictional
meaning belongs in the requirement/rule and, if needed, in the fact value. A
definition's semantic fields are immutable after any `ClientFact` references
it. Corrections require a new key and retirement of the old definition; labels,
translation and non-semantic help text may change under normal audit.

`FactDefinition` itself has no v1 version table. That is deliberate: immutable
referenced semantics plus a replacement key is simpler and safer than a
definition-version graph. A future version model is warranted only if a real
need arises to preserve mutable question text or collection workflows.

## Typed storage

The selected design is nullable typed columns on the existing `ClientFact`.

```text
ClientFact additive fields
  factDefinitionId      UUID?       -> FactDefinition
  factSubjectId         UUID?       -> FactSubject; null only for COMPANY scope
  scopeType             FactScopeType? // denormalized/validated with subject
  booleanValue          Boolean?
  numberValue           Decimal?
  stringValue           String?
  dateValue             DateTime?
  datetimeValue         DateTime?
  moneyAmount           Decimal?
  moneyCurrency         String?     // ISO 4217 only when moneyAmount is present
  enumValue             String?
  jsonValue             Json?       // PERIOD and narrow approved composites only
  observedAt            DateTime?
  effectiveAt           DateTime?
  referencePeriodStart  DateTime?
  referencePeriodEnd    DateTime?
  determinationMethod   FactDeterminationMethod?
  supersededAt          DateTime?
```

`FactValueType` is `BOOLEAN`, `NUMBER`, `STRING`, `DATE`, `DATETIME`, `MONEY`,
`ENUM`, `MULTI_ENUM`, `JURISDICTION`, `ENTITY_REFERENCE`, or `PERIOD`.
`JURISDICTION` is stored in `enumValue` as a canonical ISO/jurisdiction code;
`ENTITY_REFERENCE` is a `FactSubject` reference, not an arbitrary string.
`MULTI_ENUM` is a JSON string array only after server validation against the
definition's closed values. `PERIOD` is a JSON object with exactly `start` and
`end`. `jsonValue` is rejected for every other type.

This beats a single JSON value: Prisma and PostgreSQL can query and index the
typed columns, type validation is obvious, money currency is explicit, and the
old string contract remains intact during migration. Service validation enforces
exactly one applicable typed representation (two for `MONEY`) based on
`FactDefinition.valueType`; an optional later custom SQL `CHECK` may duplicate
that rule. Prisma schema syntax alone cannot express this cross-column/type-row
constraint.

## Scope and referential integrity

Use a **hybrid dedicated `FactSubject`**. Do not add a generic
`scopeEntityId` string and do not add a dozen nullable foreign keys to models
that do not exist yet.

```text
FactSubject
  id                    UUID
  clientId              UUID        -> Client
  scopeType             FactScopeType
  subjectKey            String      // stable, client-scoped business key
  displayLabel          String?
  contractRecordId      UUID?       -> ContractRecord (only CONTRACT when known)
  organizationPersonId  UUID?       -> OrganizationPerson (only EMPLOYEE when known)
  startsAt, endsAt      DateTime?
  createdAt, archivedAt

  unique(clientId, scopeType, subjectKey)
  unique(contractRecordId) where non-null (custom SQL if used)
  unique(organizationPersonId) where non-null (custom SQL if used)
```

`ClientFact.factSubjectId` is a real foreign key. Services verify that the
subject belongs to the same client and its type is allowed by the definition.
`COMPANY` facts have no subject. Existing `ContractRecord` and
`OrganizationPerson` can be canonically linked. `WORKPLACE_SITE`, `EVENT`,
`SALES_CHANNEL`, `PRODUCT_SERVICE`, `TAX_PERIOD`, `TRANSACTION` and
`REPORTING_EVENT` become first-class, client-bound subjects with controlled
keys; they are not opaque foreign IDs. This covers the five stress cases:

| Case | Scope and subject |
|---|---|
| Workplace risk assessment | `WORKPLACE_SITE` subject (site key) |
| Accident event | `EVENT` subject (incident key) |
| Consumer withdrawal | `EVENT` subject; optional related `CONTRACT` subject is an additional fact, not an overloaded ID |
| Contract-specific fact | `CONTRACT` subject linked to `ContractRecord` when available |
| Tax-period revenue | `TAX_PERIOD` subject with canonical period key such as `2026-Q1` |

## Temporal semantics

The existing `validFrom`/`validTo` remain the asserted validity interval and
are required for every `ClientFact`. Add no duplicate validity field.

| Field | Exact meaning | Typical use |
|---|---|---|
| `observedAt` | When a person/system observed or recorded the fact. It says nothing about legal validity. | evidence observation, received notice |
| `effectiveAt` | Instant at which a state/event becomes legally or operationally effective. | VAT registration status change, withdrawal notice received |
| `validFrom` / `validTo` | Inclusive asserted period for which a state-like fact is true; `validTo` null means open-ended. | VAT status, company activity, employee-count result validity |
| `referencePeriodStart` / `referencePeriodEnd` | Period measured or aggregated by the value; not a truth interval. | accounting-average employee count, quarterly revenue |

The definition's `temporalPolicy` declares which fields are required, allowed
or forbidden. An accident has `effectiveAt` and may have `observedAt`; it does
not need a reference period. A VAT status needs a validity interval. Employee
count average needs a reference period and validity interval. A document
observation may need only `observedAt` plus standard validity.

## Non-overlap

Overlap is definition policy, not a universal database invariant. For a
state-like fact whose `overlapPolicy` is `DISALLOW`, service code must take a
transaction-scoped PostgreSQL advisory lock derived from client, definition and
subject, query for an intersecting `[validFrom, validTo]` interval, and reject
the write unless it is an explicit supersession workflow.

This is the v1 enforcement mechanism. A PostgreSQL exclusion constraint is
valuable for a fixed table shape but cannot conditionally consult the
definition's policy and is not expressed by Prisma. A later handcrafted SQL
constraint may protect a fixed subset after operational proof; it is not a
reason to invent unsupported Prisma syntax now. `EVENT` and evidence-observation
definitions use `ALLOW`; periodic metrics may use `ALLOW` only when their
reference periods distinguish the records.

## Backward-compatible migration contract

The actual Phase 1 model has non-null `type` and `value` strings, writable
in-place through `createFact`/`updateFact`, registry-validated against such
types as `EMPLOYEE_COUNT`, `REVENUE_BAND`, `MAIN_ACTIVITY` and
`SENSITIVE_DATA_USAGE`. Existing UI/API DTOs return those same fields.

Therefore Slice C is additive:

1. Retain `type` and `value` unchanged and non-null. Add all Phase 6 columns
   nullable, plus `FactDefinition` and `FactSubject`.
2. Seed only approved definition rows that map deterministically from existing
   registry types. `EMPLOYEE_COUNT` maps only after its count method/reference
   period is approved; `REVENUE_BAND` maps only after its exact enum vocabulary
   is approved. `MAIN_ACTIVITY` stays legacy; `SENSITIVE_DATA_USAGE` requires
   legal mapping and is not assumed equal to special-category processing.
3. Read path is dual-read during transition: Phase 1 workspace keeps reading
   `type`/`value`; Phase 6 evaluator reads typed fields only for a fully mapped
   definition. It never parses arbitrary legacy strings at evaluation time.
4. Deterministic backfill writes typed columns only where legacy type and value
   validate unambiguously. Ambiguous values remain legacy and are review work.
   No first-slice destructive update or `value` retirement occurs.
5. New compliance facts write both the legacy compatibility projection and
   typed value during the transition. Once all consumers have moved and a
   measured migration is complete, `value` can be deprecated later.

This preserves current verification/evidence behavior. Phase 6 snapshots, not
immutable `ClientFact` rows, protect historic evaluation reproducibility.
