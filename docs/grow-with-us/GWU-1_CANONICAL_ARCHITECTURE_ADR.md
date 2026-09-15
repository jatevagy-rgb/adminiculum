# GWU-1 Canonical Architecture ADR

**Status:** Proposed
**Scope:** Backend/domain architecture inventory and implementation boundary
**Repository baseline:** `ab980019a4809f545ef7d8bf3f3a813ba9e9dedf`
**Decision date:** 2026-09-14

## Decision summary

Adminiculum should extend its existing case-centered domain rather than create a
second Company OS platform. The canonical architecture is:

```text
canonical company state
  + canonical legal/compliance applicability
  + time-stamped observations
  + reconstructible Grow signals
  + evidence/sufficiency gates
  + human-reviewed recommendations
  + explicit execution handoff
  + measured outcomes
```

The governing boundary is:

> Canonical state is what Adminiculum currently accepts as true about a
> company. An observation is what a person, system, document, or authority
> observed at a point in time.

No new `ActionPlan`, `GrowSignal`, or second communication store is required
for GWU-1. The repository now contains the bounded GWU-2A read-only internal
diagnostic workbench over the existing observation, process metric, evidence,
diagnosis, and recommendation services. It preserves explicit human review
before any opportunity or execution object is created. The next roadmap slice
must build on that contract rather than replace it.

This ADR is documentation-only. It does not redesign the frontend, add
schema, or change production behavior.

## Roadmap Scope Lock

An approved capability that is outside the current implementation slice is
not removed from the Grow With Us / Company OS roadmap. Every implementation
slice must classify approved capabilities as exactly one of:

- `IMPLEMENTED_NOW`
- `DEFERRED_TO=<slice>`
- `BLOCKED_BY=<dependency>`

No approved product capability may be silently removed, downgraded, or
declared unnecessary merely because it is not in the current PR.

The approved roadmap includes, at minimum:

- Company Data Room / company digital twin;
- structured company facts, organization, processes, and systems;
- documents/contracts, provenance, freshness, conflict handling, controlled
  editing, and evidence reuse;
- Observatory declared observations, measured snapshots, and future
  external/system/authority observations;
- research/scientific evidence corpus;
- operational diagnostics;
- Order-to-Cash, Procure-to-Pay, Hire-to-Retire, Contract Lifecycle,
  Incident/Complaint/Request Handling, and Management Reporting / Approval;
- business diagnosis, legal/compliance inference, human review, and
  customer-safe publication;
- customer decision UX;
- `ImprovementOpportunity`, `DevelopmentInitiative`, tasks, milestones, and
  `OutcomeMeasurement`;
- external verified company facts, customer Company OS UX, workforce Company OS
  UX, document-driven intake/extraction, and future integrations.

`ROADMAP_CAPABILITIES_REMOVED=NONE` unless removal is explicitly approved by
the product owner.

## 1. Current canonical model map

| Capability | Canonical models/services | Current posture | GWU decision |
|---|---|---|---|
| Company identity and workspace | `Client`, `ClientOperatingProfile`, organization workspaces, `orgCompanyService` | Current and used | Reuse |
| Company facts | `FactDefinition`, `ClientFact`, `ClientFactAnswerState`, `FactSubject`, company-profile registry/catalog | Current; typed and legacy paths coexist | Reuse; extend only at the provenance boundary |
| Organization | `ClientOrganizationGroup`, `OrganizationPerson`, responsibility and document links | Current and tenant-scoped | Reuse; do not create a second hierarchy |
| Processes and systems | `BusinessProcess`, `BusinessProcessStep`, `BusinessSystem` | Current foundation; process metrics are implemented | Reuse; add fields only for proven diagnostic gaps |
| Documents and contracts | `Document`, `DocumentVersion`, `ContractRecord`, existing document publication | Current and case/client-centered | Reuse; link evidence, never copy document stores |
| Legal applicability | `Requirement`, `RequirementVersion`, `LegalSource*`, `ApplicabilityRuleVersion`, `RequirementApplicability` | Current and fail-closed | Reuse; legal inference remains separate from business diagnosis |
| Compliance controls/evidence | `ClientControl`, `EvidenceRecord`, `EvidenceControlLink`, control/evidence services | Current with freshness and review status | Reuse |
| External observation intake | `ExternalSourceConnection`, `DiscoveryRun`, `Observation`, Observatory ingestion | Current, idempotent, tenant-scoped | Reuse |
| Process measurements | `ProcessObservationSnapshot`, metric registry/calculator | Current, deterministic and versioned | Reuse |
| Assessment intake | `Assessment`, `AssessmentItem`, assessment registry, Observatory assessment intake | Current; raw submission creates observations only | Reuse |
| Grow normalization | `observationSignals`, in-memory `GrowSignal` | Current and deliberately non-persistent | Reuse; no `GrowSignal` table |
| Diagnosis | `ProblemDomain`, `RecommendationRun`, `DiagnosisCandidate`, evidence links | Current research pipeline | Reuse |
| Sufficiency | `SufficiencyDecision`, research evidence verification | Current fail-closed gate | Reuse |
| Recommendations | `RecommendationCandidate`, `RecommendationRun`, review service | Current; pending review by default | Reuse |
| Improvement | `ImprovementOpportunity` | Current; created only after ACCEPT | Reuse |
| Execution | `DevelopmentInitiative`, `CompanyMilestone`, existing `Task`, optional `Case` | Current and reusable | Reuse; no `ActionPlan` |
| Outcomes | `OutcomeMeasurement`, before/after process snapshots | Current and provenance-bearing | Reuse |
| Customer publication | client publication foundation, company and Grow safe projectors | Current for several domains; opportunity publication intentionally absent | Extend boundary, not internal models |
| Communications | canonical `Communication` and mailbox connection model | Current universal mailbox integration | Reuse; do not create another mailbox or observation store |

## 2. What already exists

### 2.1 Company profile, facts, and adaptive visibility

`ClientOperatingProfile` provides company-level operating state. `FactDefinition`
provides a registry-driven definition with value type, scope, determination
method, temporal policy, overlap policy, question key, and lifecycle. `ClientFact`
supports both the legacy `type`/`value` representation and additive typed
columns. `ClientFactAnswerState` supplies the current answer pointer and the
`ANSWERED`/`UNKNOWN` state. `FactSubject` supports company, workplace,
employee, event, channel, product/service, contract, tax-period, transaction,
and reporting-event scope.

The Company Profile registry/catalog and adaptive visibility services already
resolve questions from fact state. The answer service validates typed values,
enforces approved enum/catalog values, verifies same-client source documents,
and routes typed mutations through compliance reevaluation. `UNKNOWN` is
explicitly handled and is not treated as a negative answer.

### 2.2 Typed facts and compliance reconciliation

`typedFactMutationService` validates the `FactDefinition`, scope and
`FactSubject`, temporal values, source document ownership, overlap policy, and
typed value serialization. It persists the fact and synchronously reevaluates
dependent approved applicability rules for enrolled clients. The separate
`complianceReconcileService` covers initial/backfill and re-check paths without
rewriting facts or inventing findings.

This is the canonical state-to-legal-applicability bridge. Grow diagnostics must
consume its outputs or approved facts; they must not reimplement legal
classification.

### 2.3 Observatory and observation persistence

`ExternalSourceConnection` and `DiscoveryRun` establish source/run provenance.
`Observation` stores client scope, source connection, discovery run,
idempotency key, input digest, observation type, raw payload, observed time,
and source record identifier. The ingestion service:

- authorizes the client boundary;
- rejects secret-like connection configuration;
- verifies run/connection ownership;
- deduplicates by client, connection, and idempotency key;
- detects idempotency conflicts.

Structured survey and portal assessment intake both use this foundation.
They create `DECLARED_SURVEY` observations and never create findings,
recommendations, tasks, or initiatives directly.

### 2.4 Process observation

`BusinessProcess` owns ordered `BusinessProcessStep` rows and may reference
same-client organization groups, people, and systems. Steps currently carry:
`stepType`, responsible person, system, estimated active minutes, estimated
waiting minutes, and approval flag.

`ProcessObservationSnapshot` captures a deterministic, versioned metric result
with input digest, snapshot digest, observed time, metrics, and provenance.
The metric calculator currently derives active time, waiting time, cycle time,
waiting share, approval count, data-entry count, handoff count, responsible
person changes, system count, system switches, unassigned steps, and process
owner presence.

### 2.5 Grow research and human review

`observationSignals.ts` is a pure, fail-closed normalizer. It accepts only
explicitly supported declared survey payloads, maps canonical categories to
problem domains, and returns an in-memory `GrowSignal`. It does not persist a
signal and does not guess from arbitrary JSON. Process measurements arrive
through `ProcessObservationSnapshot`, remaining distinct from declared
observations.

The research service creates an idempotent `RecommendationRun`, derives
`ProblemDomain` and `DiagnosisCandidate` rows, evaluates evidence sufficiency,
and creates `RecommendationCandidate` rows in `PENDING_REVIEW`. Manager review
is required. ACCEPT creates only an `ImprovementOpportunity`; initiative
handoff is a separate explicit action.

### 2.6 Evidence and legal sources

`EvidenceRecord` can reference a `DocumentVersion`, `ClientFact`, `Observation`,
or external reference. It carries review status, reviewer, validity interval,
and client scope. `EvidenceControlLink` connects evidence to controls.

Research evidence has explicit verification states (`VERIFIED`, `UNVERIFIED`,
`DISPUTED`), strength, bounded claim, applicability, and supported
interventions/outcomes. Sufficiency distinguishes supported, more-data,
insufficient, conflicting, out-of-scope, and human-domain-review states.

Legal sources and requirement versions already model citation, effective dates,
supersession, capture digest, ambiguity, review, approved rule versions,
canonical rule digests, applicability snapshots, and source-support outcomes.

### 2.7 Execution and outcome

`ImprovementOpportunity` is the reviewed intervention object. It carries the
problem, direction, kind, impact tags, evidence strength, status, and optional
initiative link. `DevelopmentInitiative` carries owner, target state, priority,
status, target date, optional case, milestones, and client owner. `Task` remains
the canonical work unit. `CompanyMilestone` is the milestone projection.
`OutcomeMeasurement` links an opportunity and optional initiative/process to
before/after process snapshots and records measurement basis, metrics, ROI
payload, provenance note, and synthetic-data protection.

This covers the requested execution lifecycle without a parallel action model.

## 3. Observatory boundary

The canonical flow is:

```text
user/system/document/authority input
  → Observation or typed canonical fact
  → explicit normalization
  → GrowSignal (reconstructible, not persisted)
  → ProblemDomain / DiagnosisCandidate
  → evidence and sufficiency gate
  → RecommendationCandidate
  → manager/lawyer review
  → ImprovementOpportunity
  → explicit DevelopmentInitiative handoff
  → Task / CompanyMilestone
  → OutcomeMeasurement
```

Not every input is an `Observation`. A reviewed, accepted company fact belongs
in `ClientFact`; the source or supporting record may also be represented by an
`EvidenceRecord`. A raw or time-specific external result belongs in
`Observation`. A measured process result belongs in
`ProcessObservationSnapshot`. These records may be linked, but they do not
become interchangeable.

The boundary prevents:

- survey payloads from becoming authoritative company state automatically;
- arbitrary JSON from becoming a business diagnosis;
- measured and declared signals from being silently conflated;
- internal recommendation objects from becoming customer-visible by default;
- legal conclusions from being inferred from unsupported business signals.

## 4. Company state versus observation

| Question | Canonical state | Observation |
|---|---|---|
| Meaning | What Adminiculum accepts as true now | What was observed at a time |
| Primary storage | `ClientFact`, `ClientOperatingProfile`, first-class entities | `Observation`, `ProcessObservationSnapshot`, `EvidenceRecord` |
| Temporal meaning | Valid/effective interval and supersession | `observedAt`, run/source provenance, snapshot time |
| Authority | Accepted through typed mutation, review, or explicit domain workflow | Input to review/normalization; not authoritative by itself |
| Conflict behavior | Overlap policy, answer state, verification, supersession | Multiple observations may coexist; conflict is surfaced |
| Customer exposure | Only safe projected fields | Raw payload is internal unless a dedicated safe projection exists |
| Legal use | May feed approved rules | May support evidence, never silently establish applicability |

The existing model set already supports most of this distinction. The main
remaining design work is a consistent provenance and conflict contract for
facts originating from observations.

### Research and scientific evidence corpus

`ResearchEvidence` is a distinct research/scientific evidence layer. It is
not canonical company state and is not a substitute for client-specific facts
or measurements. It supports diagnosis grounding, evidence sufficiency,
intervention selection, benchmark and context interpretation, expected
outcome selection, and measurement design.

The bounded doctrine is:

```text
client fact or client measurement
  + relevant research evidence
  → bounded diagnosis/recommendation
```

Never derive a fabricated client fact from a research benchmark. Research
evidence may inform a reviewed recommendation, but it cannot establish what
is true about a specific client without client-specific evidence and the
existing review gates.

## 5. Fact/entity decision matrix

| Company OS domain | Classification | Existing canonical representation | Recommendation |
|---|---|---|---|
| Identity / registry | A + B | `Client`; registry facts in `FactDefinition`/`ClientFact` | Reuse |
| Tax identifiers / status | B | Typed facts with jurisdiction and temporal policies | Reuse; add definitions, not a tax model |
| Financial facts | B | Typed `ClientFact` with money/period scopes | Reuse; add definitions and evidence |
| Ownership / group | A + B | `ClientOrganizationGroup`, `FactSubject`, ownership facts | Reuse |
| Locations | B | Workplace-scoped facts and client operating profile | Reuse; only add a location entity if a stable aggregate is proven |
| Activities | B | Registered activity facts and TEÁOR catalog path | Reuse; preserve legacy free-text activity |
| Organization | A | Groups, people, responsibilities, hierarchy | Reuse |
| Workforce | A + B | `OrganizationPerson` plus employee-scoped facts | Reuse; do not create HRIS storage |
| Customer channels | B | Fact definitions and process/system references | Reuse; add definitions first |
| Products/services | B | Product/service fact scope and registry definitions | Reuse; no speculative product table |
| Vendors | B + C | Vendor observation type and fact scope exist; no canonical vendor aggregate was established | Start with facts/observations; extend only after a real workflow |
| Systems | A | `BusinessSystem` | Reuse |
| Data / AI | B + C | Facts, documents, systems, controls, and evidence can represent current needs | Add definitions/control mappings before a new entity |
| Processes | A | `BusinessProcess`, `BusinessProcessStep`, snapshots | Reuse; extend step metadata narrowly |
| Documents / contracts | A | `Document`, `DocumentVersion`, `ContractRecord` | Reuse |
| Legal / compliance | A | requirements, legal sources, applicability, controls, evidence | Reuse |
| Incidents | C | Existing case/task/compliance patterns may host incidents, but no dedicated canonical incident model was verified | Defer; justify only with a concrete incident lifecycle |
| Initiatives / outcomes | A | opportunities, initiatives, tasks, milestones, outcomes | Reuse |

**Genuinely missing canonical entities for GWU-1:** none. Incidents and a
vendor aggregate may eventually justify first-class entities, but the current
audit does not establish that need.

## 6. Provenance, evidence, freshness, and conflict gap

### Existing coverage

- `ClientFact.verificationStatus`: `UNVERIFIED`, `CLIENT_PROVIDED`,
  `DOCUMENT_VERIFIED`, `LAW_FIRM_VERIFIED`.
- `ClientFact.sourceReference` and `sourceDocumentVersionId`.
- `ClientFact.observedAt`, `effectiveAt`, reference period, validity interval,
  and `supersededAt`.
- `ClientFactAnswerState`: current fact pointer plus `ANSWERED`/`UNKNOWN`.
- `EvidenceRecord`: source type, review status, reviewer, validity interval,
  and links to document/fact/observation.
- `Observation`: source connection, run, input digest, observed time,
  idempotency, and raw payload.
- `ProcessObservationSnapshot`: metric/input/snapshot digests, observed time,
  and provenance JSON.
- research evidence: verified/unverified/disputed and bounded claims.
- legal source/rule versions: effective dates, supersession, review, digest,
  ambiguity, and source-support state.

### Smallest future extension

Do not add a parallel provenance system. Additive work should first define a
service-level mapping:

| Desired provenance | Existing representation | Smallest action |
|---|---|---|
| `USER_DECLARED` | `CLIENT_PROVIDED`; survey `Observation` provenance | Document and normalize mapping |
| `DOCUMENT_EXTRACTED` | `EvidenceRecord` + document version; no dedicated fact status | Add a controlled mapping at the mutation/evidence boundary; schema only if the current enum cannot be extended safely |
| `EXTERNAL_AUTHORITY` | observation connection + external reference evidence | Use source type and evidence; require approved source metadata |
| `SYSTEM_MEASURED` | process snapshot provenance and measured research signal | Use existing snapshot path |
| `DERIVED` | `FactDeterminationMethod.DERIVED`; derived research objects | Use existing determination method and derivation metadata |
| `LAWYER_VERIFIED` | `LAW_FIRM_VERIFIED`; evidence reviewer | Use existing status and reviewer fields |

The current status vocabulary does not directly represent `STALE`,
`CONFLICTING`, or `UNANSWERED` on every fact. `UNANSWERED` exists in adaptive
visibility as a derived state, while stale and conflict are represented in
other bounded domains (`EvidenceRecord` validity, answer state, overlap
conflict, legal support, and research sufficiency).

Recommended smallest extension, only when a concrete fact workflow requires
persisted cross-source conflict: add a fact-review projection or controlled
fact status extension that records conflict and stale reasons without replacing
legacy fields. Do not introduce this schema change in GWU-1. First prove the
workflow with service-level DTOs and tests.

## 7. Process data gap matrix

Current `BusinessProcess` and `BusinessProcessStep` support the following:

| Desired dimension | Status | Current basis / gap |
|---|---|---|
| Trigger | MISSING | No explicit trigger field |
| Input | MISSING | No input artifact/data reference |
| Channel | MISSING | Not represented on process or step |
| Actor | DERIVABLE | Responsible `OrganizationPerson` and process owner |
| Department | DERIVABLE | `organizationGroupId` on process; group relation |
| System | EXISTS | `BusinessSystem` and step `systemId` |
| Action | DERIVABLE | Step name/type, but not a structured action code |
| Decision | DERIVABLE | `stepType` and `isApproval`; no decision payload |
| Approval | EXISTS | `isApproval` and approval metric |
| Handoff | EXISTS | `stepType` and handoff metric |
| Waiting time | EXISTS | `estimatedWaitingMinutes` and metric snapshot |
| Active time | EXISTS | `estimatedActiveMinutes` and metric snapshot |
| Volume | MISSING | No frequency/volume measurement beyond coarse process frequency |
| Repeated entry | DERIVABLE | Data-entry and system-switch metrics are proxies, not proof |
| Rework | MISSING | No explicit rework count/rate |
| Error | MISSING | No error event or rate |
| Document | DERIVABLE | Document/evidence systems exist, but no step document relation |
| Output | MISSING | No structured output |
| Legal relevance | DERIVABLE | Requirement/applicability/evidence can be linked outside the process step |
| Evidence | DERIVABLE | Evidence can reference observations/facts/documents, but no direct step link |
| Success metric | DERIVABLE | `OutcomeMeasurement` and metric registry provide the measurement layer |

Recommended future process extension is a narrow, versioned operational
profile for trigger/input/output/volume/rework/error and explicit evidence
links. It should not be a generic JSON dump. The first diagnostic slice can
operate on existing fields and derived metrics, making the missing dimensions
honest in the UI and review workflow.

## 8. Legal inference boundary

Business diagnosis asks whether a process or operating pattern appears
inefficient, risky, or worth investigation. Legal inference asks whether an
approved legal requirement applies and what evidence supports that result.

The legal path must remain:

```text
canonical facts
  → approved applicability rule/version
  → legal source/citation support
  → evidence and specialist requirements
  → RequirementApplicability
  → finding/proposal
```

`RequirementApplicabilityOutcome` already includes
`LEGAL_REVIEW_REQUIRED`, `TECHNICAL_REVIEW_REQUIRED`, insufficient facts, and
insufficient source support. These states are the fail-closed answer for
unknown or ambiguous classification.

Grow diagnosis may reference legal relevance as a problem dimension or
evidence need, but it must not assert legal applicability. AI-authored text may
remain a draft explanation; it cannot create an approved requirement,
applicability snapshot, finding, or customer-facing legal conclusion without
the existing human/rule gates.

## 9. Action and execution model reuse

A new `ActionPlan` persistence model is not necessary for GWU-1.

| Lifecycle need | Existing model |
|---|---|
| Problem | `ProblemDomain`, `DiagnosisCandidate`, `RecommendationCandidate.problemStatement` |
| Evidence | `EvidenceRecord`, `ResearchEvidence`, evidence links, process snapshots |
| Business impact | impact tags, process metrics, ROI/outcome payloads |
| Legal relevance | requirement applicability, findings, controls, evidence |
| Recommended intervention | `RecommendationCandidate.direction` and intervention codes |
| Responsible owner | initiative law-firm owner/client owner, organization people, task assignment |
| Target date | initiative `targetAt`, milestone target date, task dates |
| Status | recommendation, opportunity, initiative, milestone, and task lifecycles |
| Success metric | metric registry and `OutcomeMeasurement` |
| Customer publication state | existing publication architecture plus a missing Grow-specific boundary |

The explicit handoffs are the architectural control:

```text
RecommendationCandidate ACCEPT
  → ImprovementOpportunity
  → explicit DevelopmentInitiative creation/link
  → existing Task / Milestone work
  → OutcomeMeasurement
```

Do not collapse these states into a single action row.

## 10. Customer publication gap

Existing customer-safe projectors expose company-safe initiatives, milestones,
processes, selected outcomes, and survey readback. `orgGrowService` explicitly
returns no opportunities because `ImprovementOpportunity` has no publication
state and internal recommendation rows must not be exposed.

The exact missing boundary is:

```text
human-approved ImprovementOpportunity
  → customer-safe publication decision and immutable safe projection
  → /portal/fejlesztes
```

The correct future solution is not a direct
`RecommendationCandidate` endpoint. The smallest safe design is a dedicated
publication boundary for an accepted opportunity, likely reusing the existing
publication principles:

- explicit internal publisher/approver;
- client/workspace ownership check;
- immutable safe snapshot or revision;
- safe title/problem/direction/target/status fields only;
- no internal diagnosis source refs, research notes, reviewer note, legal
  reasoning, raw observations, or hidden owner data;
- explicit revoke/supersede behavior;
- audit event and customer-safe projector.

Whether this requires a new publication table or can reuse an existing
publication family must be decided in a focused schema review. It is the only
material GWU-1 persistence candidate identified by this audit, and it should
not be added until the publication contract and live acceptance flow are
approved.

## 11. Security and tenancy rules

The following rules are mandatory:

1. Every canonical company, observation, evidence, diagnosis,
   recommendation, opportunity, initiative, process, system, and outcome query
   remains scoped by `clientId`.
2. Composite foreign keys and service checks must reject cross-client process,
   person, document, fact, evidence, case, and initiative references.
3. Organization portal access requires an active organization workspace and
   active membership; summary access requires the explicit organization
   summary scope.
4. `OrganizationPerson` is a responsibility directory, not an authorization
   principal. Customer projectors must not expose person names or hidden
   responsibility data unless a separately approved safe projection exists.
5. Hidden/internal facts, verification status, provenance internals, reviewer
   notes, raw research evidence, internal priorities, and legal reasoning must
   never be returned by customer-safe projectors.
6. Raw `Observation.rawPayload` is internal Observatory data. Portal routes may
   return only bounded, validated readbacks designed for the customer.
7. Evidence and document references must be same-client and respect document
   publication/authorization boundaries.
8. A process reference supplied by a portal must be resolved against the same
   client and active status; invalid cross-client references fail closed.
9. Communications remain canonical `Communication` records. They may become
   observations through an explicit ingestion/normalization path, but no second
   mailbox or communication store may be introduced.
10. Legal internal reasoning is never a customer-safe field. Customer output
    must describe approved, safe business progress rather than expose the
    analysis chain.

## 12. Exact recommended GWU implementation slices

### Slice 1 — Internal diagnostic read model, no schema — `IMPLEMENTED_NOW`

The GWU-2A implementation provides an internal-only service/route that reads:

- active `BusinessProcess` and steps;
- latest `ProcessObservationSnapshot`;
- declared survey/assessment observations through the existing normalizer;
- `EvidenceRecord` and research sufficiency;
- existing diagnosis/recommendation candidates.

It returns explicit `MISSING_DATA`, `NEEDS_MORE_DATA`, and
`HUMAN_REVIEW` states. It must not create findings, opportunities, initiatives,
tasks, or customer publications.

### Slice 2 — Evidence/provenance contract — `DEFERRED_TO=GWU-2B/GWU-3`

Standardize DTO-level provenance and safe source summaries across facts,
observations, snapshots, and evidence. Add tests for source mapping,
freshness, supersession, and conflict presentation. Avoid schema until the
DTO contract demonstrates a real persistence gap.

### Slice 3 — Operational diagnostic input profile

Extend process capture only for the highest-value missing dimensions:
trigger, input/output, volume, rework, and error. Prefer a versioned,
validated process profile or step metadata over unbounded JSON. Link evidence
and legal relevance through existing evidence/applicability models.

### Slice 4 — Reviewed opportunity publication

Design and implement the explicit internal-to-customer publication boundary
for accepted opportunities. Keep publication separate from recommendation
creation and preserve immutable safe revisions.

### Slice 5 — Outcome closure

Connect published opportunity/initiative milestones to measured before/after
snapshots and display only truthful measured/calculated/estimated outcomes.
Do not expose assumed or synthetic outcomes as real customer results.

## 13. Schema changes actually necessary

For the audit and Slice 1: **none**.

Potentially necessary later, subject to focused design and live acceptance:

1. A safe publication representation for accepted
   `ImprovementOpportunity` rows, if the existing publication families cannot
   provide the required immutable customer-safe revision.
2. Narrow structured process metadata for the confirmed operational gaps:
   trigger, input/output, volume, rework, and error.
3. A persisted fact conflict/staleness projection only if a real workflow
   requires cross-source conflict resolution beyond current validity,
   verification, answer-state, overlap, and evidence mechanisms.

No item above is authorized by this ADR for implementation.

## 14. Schema changes rejected as unnecessary

- `ActionPlan`: execution lifecycle is already covered.
- `GrowSignal`: signals are deterministic, reconstructible projections.
- Second `Company` or `CompanyProfile` aggregate: `Client` and
  `ClientOperatingProfile` are canonical.
- Second organization hierarchy: groups and people already provide it.
- Second communication store: canonical `Communication` remains authoritative.
- Generic `ObservationSignal` table: would duplicate a pure normalizer.
- Generic `CompanyOSFact` table: `FactDefinition`/`ClientFact` already provide
  scoped, typed, temporal facts.
- Generic `LegalConclusion` table: applicability, findings, proposals, legal
  sources, and review states already provide the governed legal path.
- HRIS/vendor/incident aggregates before a concrete lifecycle proves the need.
- Direct customer access to `RecommendationCandidate`.

## 15. Regression inventory

Any future GWU implementation must preserve:

- existing `Client` and case-centered authorization;
- legacy and typed Company Profile facts;
- adaptive question visibility and `UNKNOWN` handling;
- TEÁOR'25 fail-closed catalog behavior;
- typed fact overlap and temporal rules;
- synchronous compliance reevaluation and explicit reconcile;
- legal source/rule versioning, citation, and review gates;
- document-version and evidence authorization;
- Observatory idempotency, digests, run lifecycle, and raw-payload privacy;
- survey and assessment submissions creating observations only;
- no automatic downstream action creation from raw intake;
- process metric determinism, versioning, and snapshot idempotency;
- research evidence verification and sufficiency decisions;
- human review before opportunity creation;
- explicit initiative handoff;
- existing Task, Case, milestone, and outcome behavior;
- customer-safe company/Grow projections and honest empty states;
- person-directory privacy and cross-client process rejection;
- canonical `Communication` and mailbox privacy/context behavior;
- legacy Outlook and existing legal-service workflows;
- no automatic billable time from communications or diagnostics.

## 16. Test matrix

| Area | Required regression |
|---|---|
| Facts | typed/legacy writes, temporal validity, overlap conflicts, unknown/unanswered visibility |
| Provenance | each source mapping, document/fact/observation evidence, same-client rejection |
| Observatory | source/run ownership, idempotent replay, digest conflict, secret-like config rejection |
| Assessment | registry/version validation, unknown answers, no downstream action creation |
| Signals | fail-closed unknown payload/category, declared/measured separation, deterministic mapping |
| Process metrics | all 12 metrics, ordering, null behavior, snapshot idempotency |
| Compliance | mutation reevaluation, reconciliation no-op/dedup, legal-review outcomes |
| Research | sufficiency states, verified/disputed evidence, manager review, accept/decline/more-data |
| Execution | opportunity-only accept, explicit initiative handoff, task/milestone links |
| Outcomes | before/after same-client snapshots, basis labels, synthetic/assumed filtering |
| Publication | no recommendation leakage, explicit publish/revoke, immutable safe revisions |
| Tenancy | cross-client IDs for every reference type, workspace/membership boundaries |
| Portal privacy | hidden facts, person names, raw observations, research/legal internals absent |
| Mailbox regression | canonical Communication, privacy, context inheritance, no second inbox/time billing |

## 17. Live acceptance plan

Live acceptance must be performed by an authorized reviewer after the
documentation and any later implementation are merged. This ADR does not
authorize deployment or migration execution.

1. Confirm the current master and migration preflight are green.
2. Use a non-production tenant with representative Client, facts, process,
   document, evidence, observation, and portal membership data.
3. Submit a declared survey and a portal assessment with an idempotency key;
   verify exactly one observation is stored and no action objects are created.
4. Capture a process snapshot; verify deterministic metrics and replay behavior.
5. Run research; verify diagnosis/recommendation candidates remain internal and
   pending review.
6. Exercise insufficient, conflicting, and human-review evidence paths.
7. Accept a recommendation; verify only an opportunity is created.
8. Explicitly hand off to an initiative; verify tasks/milestones remain on the
   existing execution path.
9. Verify customer output contains only approved safe projections and does not
   expose raw observation payloads, person-directory data, research notes, or
   legal reasoning.
10. Verify cross-client references, revoked membership, unpublished records,
    stale evidence, and synthetic/assumed outcomes fail closed.
11. Re-run mailbox, case, document, compliance, and billing regressions.
12. Record live user acceptance separately from automated test results.

## Final architectural position

The repository already contains the canonical foundation for Company OS and
Grow With Us. The next implementation should clarify and compose existing
boundaries, not create a parallel platform. The highest-value unresolved
boundary is customer-safe publication of a human-approved improvement
opportunity. Until that contract is approved, the truthful customer behavior is
an empty opportunity projection with an explicit deferred state—not direct
exposure of internal recommendation data.
