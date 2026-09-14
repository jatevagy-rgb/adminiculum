# GWU-2B Company Data Room / Company OS Audit

**Status:** Design/audit only
**Repository baseline:** `ab980019a4809f545ef7d8bf3f3a813ba9e9dedf`
**Scope:** Repository-grounded read-model and UX architecture
**Runtime changes:** None
**Schema/migration changes:** None
**Frontend changes:** None

## Executive decision

GWU-2B should be a coherent Company OS read model over existing
client-centered data. It is not a `CompanyOS`, `DataRoom`, second facts table,
second process model, or second evidence store.

The repository already has the canonical foundations:

```text
Client
  → facts / profile / organization
  → processes / systems / documents / contracts
  → compliance / controls / evidence
  → observations / snapshots
  → diagnosis / recommendations
  → initiatives / milestones / tasks
  → outcomes
```

The safe implementation order is:

1. internal read model;
2. workforce Company OS UI;
3. customer-safe Vállalat projection;
4. Vállalat cockpit summaries and deep links;
5. provenance/editing/conflict workflows.

The first four slices can remain read-only or reuse existing write workflows.
No new persistence is justified for the read model itself.

## 1. Canonical inventory

The table distinguishes canonical storage from currently available read
surfaces. “Missing projection” means a composition or safe DTO is absent; it
does not mean the canonical data should be duplicated.

| Domain | Canonical model/service | Current internal read | Current customer read | Missing projection | New persistence required |
|---|---|---|---|---|---|
| Client identity | `Client` | Client workspace, client-company routes | Workspace identity and safe company name | Company OS identity summary | NO |
| Operating profile | `ClientOperatingProfile` | `getOperatingProfile`, company workspace | `projectCompanyOverviewForCustomer`, profile headline | Safe profile freshness/coverage summary | NO |
| Fact definitions | `FactDefinition`, company profile catalog/registry | Typed fact and profile services | Company profile discovery/questions | Registry-driven coverage counts | NO |
| Client facts | `ClientFact` | `listFacts`, typed mutation, diagnostic workbench | Profile answers through safe question projection | Bounded fact cards with provenance | NO |
| Answer state | `ClientFactAnswerState` | Adaptive visibility and typed fact flows | Unknown answer controls in profile | Explicit answered/unknown/unanswered coverage | NO |
| Fact subjects | `FactSubject` | Typed fact service and compliance evaluation | Not directly exposed | Subject-aware fact grouping | NO |
| Organization groups | `ClientOrganizationGroup` | Organization/workspace services | Group names in `getOrganizationalCompany` | Group hierarchy and safe summary | NO |
| Organization people | `OrganizationPerson`, responsibilities | Internal company/process ownership flows | Intentionally not exposed as a directory | Publication-policy projection | NO for read-only; policy dependency |
| Processes | `BusinessProcess`, `BusinessProcessStep` | Client-company CRUD, diagnostic workbench | Basic process and step summaries in company/Grow | Detail view with measured/evidence context | NO |
| Systems | `BusinessSystem` | Client-company CRUD, diagnostic workbench | Basic systems in company/Grow | System detail and process links | NO |
| Documents | `Document`, `DocumentVersion` | Document workspace, authorization, comparison | `/portal/dokumentumok` published document surface | Company summary/deep links only | NO |
| Contracts | `ContractRecord`, obligations/entitlements | Contract and client workspace services | `/portal/szerzodesek` | Contract status summary/deep links | NO |
| Requirement applicability | `RequirementApplicability` | Compliance evaluation/workspace | Safe compliance projection | Compliance status summary/deep link | NO |
| Assessments | `Assessment`, `AssessmentItem` | Client-company assessment routes | Profile/assessment intake where explicitly safe | Coverage and open-assessment summary | NO |
| Assessment findings | `AssessmentFinding` | Client-company findings and status transitions | No raw internal findings | Safe published status only | NO |
| Controls | `ClientControl` | Compliance workspace and control routes | Safe compliance/profile evidence surfaces | Control coverage summary | NO |
| Evidence records | `EvidenceRecord`, control/evidence services | Evidence routes, diagnostic workbench | Bounded profile evidence journey | Evidence freshness/conflict summary | NO |
| Observatory sources | `ExternalSourceConnection`, `DiscoveryRun` | Source health, runs, observations | Not exposed directly | Safe source health only if approved | NO |
| Observations | `Observation`, intake/ingestion services | Observatory routes, diagnostic workbench | Declared survey readback only | Observation timeline by supported class | NO |
| Process snapshots | `ProcessObservationSnapshot`, metric services | Process observation routes, diagnostic workbench | Grow outcome context only | Latest/history summary | NO |
| Research corpus | `ResearchEvidence`, research service | Grow research/evidence routes | Not exposed as raw corpus | Bounded contextual evidence labels | NO |
| Diagnoses | `ProblemDomain`, `DiagnosisCandidate` | Diagnostic workbench/research routes | Not exposed | Internal diagnostic summary | NO |
| Recommendations | `RecommendationCandidate`, review service | Grow opportunities/review routes | Not exposed until publication contract exists | Internal review status summary | NO |
| Opportunities | `ImprovementOpportunity` | Grow review/initiative handoff | Explicitly empty/deferred in customer Grow | Customer-safe publication boundary | Later, if existing publication cannot be reused |
| Initiatives | `DevelopmentInitiative` | Client-company and Grow routes | Customer-safe Grow projection | Development summary/deep link | NO |
| Milestones | `CompanyMilestone` | Client-company routes | Company overview and Grow summaries | Milestone status summary/deep link | NO |
| Tasks | Existing `Task`/case task engine | Case/task workspace | Only approved customer-safe outputs | No duplicate task store; count/status only | NO |
| Outcomes | `OutcomeMeasurement` | Grow outcomes and diagnostic workbench | Measured/calculated/estimated safe projection | Measurement summary with basis labels | NO |
| Communications | Canonical `Communication` | Communications/mailbox routes | Messages where separately authorized | Optional derived signal, never second store | NO |

## 2. Existing surfaces

### Internal workforce surfaces

The authenticated client-company router already exposes:

- operating profile and facts;
- milestones, assessments, findings, and initiatives;
- systems and processes with step CRUD;
- Observatory survey intake, source health, runs, and observations;
- Grow home, evidence, research runs, opportunity review, initiative handoff,
  outcomes, and process observations;
- the read-only diagnostic workbench at
  `/client-company/clients/:clientId/grow/diagnostic-workbench`.

`assertClientReadAccess` is the canonical internal client authorization
primitive. The diagnostic workbench additionally scopes every query by
`clientId` and returns bounded projections rather than raw JSON, payloads, or
source configuration.

The existing internal client workspace includes `ClientCompanyFoundation`,
`ClientCompanyWorkspace`, and `GrowJourney`. These are useful composition
surfaces, but they are not yet one coherent Company OS read model.

### Customer surfaces

The organization portal already has:

- `/portal/vallalat`: organization company overview and company-profile flow;
- `/portal/fejlesztes`: customer-safe Grow processes, initiatives, outcomes,
  and survey readback;
- `/portal/megfeleles`: customer-safe compliance view;
- `/portal/dokumentumok`: published document surface;
- `/portal/szerzodesek`: contract surface;
- organization matters, requests, messages, and tasks where separately
  authorized.

`getOrganizationalCompany` composes a safe company name/profile headline,
employee count, workspace-scoped groups, visible matter counts, milestones,
initiatives, systems, and processes. It deliberately does not expose the
person directory or internal findings.

`getOrganizationalGrow` composes safe process steps and linked systems,
initiatives, non-synthetic outcomes with basis labels, and declared survey
readback. Improvement opportunities are truthfully empty because there is no
customer publication state for them.

Inside `/portal/vallalat`, Documents, Risks, and Development must remain
summary/context/deep-link cards. They must not duplicate the full canonical
surfaces at `/portal/dokumentumok`, `/portal/megfeleles`, and
`/portal/fejlesztes`.

## 3. Company OS read-model contract

The read model should be composed from the following groups. Every field must
have a source mapping; an unavailable field remains an explicit contract gap.

| Read-model group | Proposed field | Source | Contract gap |
|---|---|---|---|
| `companyIdentity` | `clientId` | `Client.id` | None |
| `companyIdentity` | `name` | `Client.name` | None |
| `companyIdentity` | registry/tax identifiers | typed `ClientFact` definitions and/or `Client` legacy fields | Definition coverage and safe display policy |
| `operatingProfile` | `summary` | `ClientOperatingProfile.summary` | None |
| `operatingProfile` | review dates | `lastReviewedAt`, `nextReviewAt` | No universal freshness label |
| `facts` | current fact cards | `ClientFact` + `FactDefinition` + answer state | Safe typed value formatter per value type |
| `factCoverage` | answered/unknown | `ClientFactAnswerState.status` | None for existing answer rows |
| `factCoverage` | unanswered | catalog/adaptive visibility derivation | Must define denominator and scope |
| `factCoverage` | stale | `validTo`, `supersededAt`, source/evidence validity | No universal stale status |
| `factCoverage` | conflicting | overlap policy, evidence/research sufficiency | No universal cross-source conflict status |
| `organization` | groups | `ClientOrganizationGroup` in active workspace | Customer scope and hierarchy policy |
| `organization` | people/roles | `OrganizationPerson`, responsibilities | Explicit publication policy required |
| `processes` | process cards | `BusinessProcess` | None |
| `processes` | steps | `BusinessProcessStep` ordered by `position` | None |
| `processes` | owner/department | process owner/group relations | Safe display and missing-owner state |
| `processes` | measured timing | latest `ProcessObservationSnapshot.metrics` | Select snapshot and metric allowlist |
| `processes` | evidence/diagnoses | `EvidenceRecord`, diagnosis links | Direct process evidence joins vary by model |
| `processes` | legal questions | applicability/evidence references | No general process-to-requirement relation |
| `systems` | system cards | `BusinessSystem` | None |
| `systems` | related processes | `BusinessProcessStep.systemId` | Reverse projection required |
| `systems` | owner | organization/person relations where present | Customer person policy |
| `documents` | counts/latest published items | `Document`, `DocumentVersion`, publication services | Must reuse document publication authorization |
| `contracts` | contract status/counts | `ContractRecord`, obligations/entitlements | Customer-safe contract summary mapping |
| `complianceSummary` | safe status | `getClientSafeComplianceReadModel` | Reuse safe compliance vocabulary |
| `evidenceSummary` | record counts/status | `EvidenceRecord`, controls, evidence service | Freshness/conflict aggregation contract |
| `developmentSummary` | initiatives/milestones | `DevelopmentInitiative`, `CompanyMilestone` | Deep-link routing and safe status labels |
| `measurementSummary` | measured/calculated/estimated | `OutcomeMeasurement.basis`, snapshots | No synthetic/assumed result exposure |
| `dataQuality` | source coverage | existing fact/observation/evidence metadata | No universal quality score; use transparent counts |

### Coverage is not maturity

Company completeness must mean how much relevant canonical data is known. It
must not be called maturity, quality, performance, legal compliance, or
business health.

The transparent mechanism should be category-based:

```text
for each in-scope canonical fact definition and subject:
  ANSWERED    = current answer state with a current fact
  UNKNOWN     = current answer state explicitly UNKNOWN
  UNANSWERED  = visible/required catalog item with no answer state
  STALE       = bounded validity/review rule says the value is no longer current
  CONFLICTING = existing overlap/evidence/sufficiency logic says sources disagree
```

The implementation must publish counts and item references, not a fabricated
0–100 score. `UNANSWERED`, `STALE`, and `CONFLICTING` require an explicit
denominator and source rule before they are displayed.

## 4. Provenance, freshness, and conflict preparation

### Existing support

- `ClientFact.verificationStatus`, `sourceReference`,
  `sourceDocumentVersionId`, `observedAt`, `effectiveAt`, validity interval,
  and `supersededAt`;
- `ClientFactAnswerState` with `ANSWERED` and `UNKNOWN`;
- `EvidenceRecord` source type, review status, reviewer, validity interval,
  and links to facts, observations, and document versions;
- `Observation` source connection, discovery run, idempotency key, digest,
  `observedAt`, source record ID, and observation type;
- `ProcessObservationSnapshot` observed time, input/snapshot digests,
  metric version, and bounded provenance projection;
- `ResearchEvidence` origin, bounded claim, verification status, strength,
  applicability notes, and supported interventions/outcomes;
- `DocumentVersion` and publication revisions for document provenance and
  customer-safe immutability;
- compliance/legal source and rule version dates, supersession, review, and
  canonical digests.

### Gaps

There is no universal cross-domain provenance taxonomy or single freshness and
conflict state. Existing states are domain-specific:

- fact verification is not the same as observation provenance;
- `UNKNOWN` is not `UNANSWERED`;
- evidence validity is not a global stale flag;
- disputed research evidence is not the same as conflicting client facts;
- legal insufficiency is not a business-data quality score.

GWU-2B should therefore project domain-native states with their provenance
class and source summary. GWU-3 may define a shared service-level vocabulary
for `USER_DECLARED`, `DOCUMENT_EXTRACTED`, `EXTERNAL_AUTHORITY`,
`SYSTEM_MEASURED`, `DERIVED`, and `LAWYER_VERIFIED`, but should not add schema
until a concrete edit/conflict workflow proves that current fields cannot
represent it.

## 5. Documents, contracts, and evidence

Documents remain SharePoint-backed canonical `Document` and `DocumentVersion`
records. A Company Data Room must link to existing document workspace and
publication surfaces; it must not copy binaries, versions, or metadata into a
new data-room table.

Contracts remain `ContractRecord` plus existing obligations and entitlements.
The Company OS view may show bounded counts, status, upcoming dates, and
deep-links to `/portal/szerzodesek` where customer authorization permits.

Evidence remains split:

- `EvidenceRecord` is client-scoped evidence metadata linked to facts,
  observations, or document versions;
- `ResearchEvidence` is contextual research/scientific evidence;
- `ClientControl` and `EvidenceControlLink` provide compliance/control context.

The customer read model must not expose internal evidence notes, raw
observation payloads, research notes, reviewer identities, or legal reasoning.

## 6. Organization, processes, and systems

### Organization

Groups are available through `ClientOrganizationGroup` and workspace-scoped
customer queries. `OrganizationPerson` supports internal ownership and
responsibility references, but the customer person directory is intentionally
not published. A future workforce/customer directory requires an explicit
publication policy, not a direct relation dump.

### Process detail

| Desired process field | Current status | Actual basis |
|---|---|---|
| Name/category/criticality/frequency | EXISTS | `BusinessProcess` |
| Owner/department | EXISTS/DERIVABLE | process owner and `organizationGroupId` |
| Ordered steps | EXISTS | `BusinessProcessStep.position` |
| Actor | EXISTS internally | responsible person relation; customer-safe name policy remains |
| System | EXISTS | step `systemId` → `BusinessSystem` |
| Approval/handoff/data-entry | EXISTS/DERIVABLE | step type/approval plus snapshot metrics |
| Estimated active/waiting time | EXISTS | step estimates |
| Measured active/waiting/cycle time | EXISTS | `ProcessObservationSnapshot` metrics |
| Volume | MISSING | no canonical measurement identified |
| Repeated entry | DERIVABLE | data-entry/system-switch metrics are proxies |
| Rework/error | MISSING | no canonical event/rate identified |
| Trigger/input/output/channel | MISSING | no structured process fields identified |
| Documents/evidence | DERIVABLE | existing document/evidence links, no universal step relation |
| Legal relevance | DERIVABLE | compliance/applicability graph, no universal process relation |
| Success metric | EXISTS | metric registry and `OutcomeMeasurement` |

Process detail UX can therefore be useful now, but must label absent
dimensions as unavailable rather than infer them. A later operational-profile
slice may add only the highest-value structured fields after real usage proves
the need.

### System detail

| Desired system field | Current status | Actual basis |
|---|---|---|
| Name/category/purpose | EXISTS | `BusinessSystem` |
| Related processes | DERIVABLE | process-step `systemId` reverse projection |
| Owner | DERIVABLE | organization/person relations where populated |
| Evidence | DERIVABLE | `EvidenceRecord` and document/control links |
| Compliance context | DERIVABLE | controls, requirements, and applicability |
| Usage/health metric | MISSING | no canonical system telemetry model identified |

## 7. Security and authorization boundaries

### Workforce

Internal client-company and diagnostic routes require workforce
authentication and use `assertClientReadAccess`. Every query must be
client-scoped. Cross-client process, document, evidence, fact, case, and task
references must fail closed.

### Customer portal

Organization Company OS reads require:

1. an active organization workspace;
2. active workspace membership;
3. the organization summary scope for organization-wide company content.

Customer-safe projectors must preserve the current boundaries:

- no raw `Observation.rawPayload`;
- no source connection config, tokens, secrets, or credentials;
- no internal notes, lawyer ownership, hidden tasks, HR-confidential documents,
  reviewer notes, raw research corpus, or legal reasoning;
- no `RecommendationCandidate` exposure;
- no person-directory publication without explicit policy;
- only non-synthetic, basis-labelled outcome results;
- only documents/contracts already allowed by their publication surfaces.

### Publication

Existing matter and document publication models provide explicit approval,
publication, revocation, supersession, audience snapshots, and immutable
revisions. The Grow opportunity boundary does not yet have an equivalent
publication state. That is a GWU-3 design dependency, not permission to expose
internal opportunity rows.

## 8. Implementation sequence

Every approved roadmap capability remains classified; none is removed.

### GWU-2B.1 — Internal Company OS read model

**Classification:** `DEFERRED_TO=GWU-2B.1`
**Canonical reuse:** `Client`, profile/facts/answer state, groups/people,
processes/steps/systems, documents/contracts, compliance, evidence,
observations/snapshots, diagnostic workbench, initiatives/milestones/outcomes.
**Tenant boundary:** internal `assertClientReadAccess`, explicit `clientId`
filters, same-client relation checks.
**Customer-safe boundary:** none; workforce-only.
**Regression inventory:** Company Profile typed/legacy facts and `UNKNOWN`;
Observatory idempotency/raw-payload privacy; process metrics; compliance
read-only behavior; Grow research/review; document authorization; mailbox and
Communication behavior.
**PostgreSQL test:** fixture two clients and verify same-client rows only,
bounded DTO fields, truthful empty states, and zero writes.
**Live acceptance:** workforce reviewer confirms the read model answers what is
known, observed, diagnosed, proposed, and missing without creating objects.

### GWU-2B.2 — Workforce Company OS UI

**Classification:** `DEFERRED_TO=GWU-2B.2`
**Canonical reuse:** the GWU-2B.1 DTO and existing client-company/Grow UI
components.
**Tenant boundary:** same internal authorization.
**Customer-safe boundary:** no customer routes.
**Regression inventory:** existing client workspace, GrowJourney, document
workspace, compliance, and case-centered navigation.
**PostgreSQL test:** backend contract tests plus authorization matrix.
**Live acceptance:** reviewer navigates identity, facts, organization,
processes, systems, evidence, diagnostics, and development without duplicate
stores or fake scores.

### GWU-2B.3 — Customer-safe Vállalat projection

**Classification:** `DEFERRED_TO=GWU-2B.3`
**Canonical reuse:** `getOrganizationalCompany`, safe compliance/document/
Grow projectors, publication and workspace authorization.
**Tenant boundary:** active organization workspace, membership, summary scope.
**Customer-safe boundary:** summary/context/deep-link only for documents,
risks, and development; no raw internal records.
**Regression inventory:** portal membership, workspace mode, summary scope,
document publication, compliance safe read, Grow safe read, person privacy.
**PostgreSQL test:** cross-workspace/client isolation and forbidden internal
fields.
**Live acceptance:** customer reviewer confirms no internal notes, hidden work,
HR data, research/legal internals, or unpublished opportunities leak.

### GWU-2B.4 — Portal Vállalat cockpit

**Classification:** `DEFERRED_TO=GWU-2B.4`
**Canonical reuse:** `/portal/vallalat` shell and existing deep-link surfaces.
**Tenant boundary:** existing customer portal authorization.
**Customer-safe boundary:** no duplicate full Documents/Compliance/Grow
surfaces.
**Regression inventory:** portal navigation, honest empty states, mobile
layout, document/compliance/Grow links, customer publication policy.
**PostgreSQL test:** API contract and publication authorization coverage.
**Live acceptance:** customer user verifies the cockpit is a useful summary,
not a second product surface.

### GWU-3 — Provenance, editing, conflict, and publication

**Classification:** `BLOCKED_BY=approved cross-domain edit/conflict and
customer opportunity publication contract`
**Canonical reuse:** existing typed fact mutation, evidence review,
publication revisions, legal review, and outcome measurement.
**Tenant boundary:** same-client and workspace authorization plus explicit
publisher/approver gates.
**Customer-safe boundary:** immutable safe revisions; no direct internal
recommendation exposure.
**Regression inventory:** all fact, evidence, legal, document, Grow, portal,
case, billing, and Communication workflows.
**PostgreSQL test:** stale/conflict/revoke/supersede and cross-client rejection
matrix.
**Live acceptance:** product owner and authorized workforce/customer reviewers
approve the edit and publication semantics separately.

## 9. Anti-goals and preserved roadmap

The following are explicitly not implementation targets for GWU-2B:

- `CompanyOS` or `DataRoom` tables;
- second facts, process, evidence, communication, or organization stores;
- `ActionPlan` persistence;
- broad frontend rewrite;
- fake maturity/quality/health scores;
- tax engine or unsupported legal-certainty claims;
- customer leakage of internal recommendations, tasks, people, evidence, or
  reasoning.

These anti-goals do not remove roadmap capabilities. They define the current
slice boundary.

| Roadmap capability | Current classification |
|---|---|
| Company Data Room / company digital twin | `DEFERRED_TO=GWU-2B.1..2B.4` |
| Structured facts and organization | `IMPLEMENTED_NOW` foundation; `DEFERRED_TO=GWU-2B` composition/editing |
| Processes and systems | `IMPLEMENTED_NOW` foundation; `DEFERRED_TO=GWU-2B` composition/detail |
| Documents/contracts | `IMPLEMENTED_NOW` canonical surfaces; `DEFERRED_TO=GWU-2B.3/2B.4` summaries |
| Provenance/freshness/conflict | `IMPLEMENTED_NOW` domain-native pieces; `DEFERRED_TO=GWU-3` unified contract |
| Observatory declared/measured observations | `IMPLEMENTED_NOW` |
| External/system/authority observations | `DEFERRED_TO=GWU-3` |
| Research/scientific evidence corpus | `IMPLEMENTED_NOW` |
| Operational diagnostics | `IMPLEMENTED_NOW` GWU-2A; `DEFERRED_TO=GWU-2B` composition |
| Order-to-Cash / Procure-to-Pay / Hire-to-Retire | `DEFERRED_TO=operational process packs` |
| Contract Lifecycle | `IMPLEMENTED_NOW` contract foundation; `DEFERRED_TO=process pack` |
| Incident/Complaint/Request Handling | `DEFERRED_TO=dedicated lifecycle after workflow proof` |
| Management Reporting / Approval | `DEFERRED_TO=reporting/approval slice` |
| Business diagnosis and legal/compliance inference | `IMPLEMENTED_NOW` governed foundations |
| Human review | `IMPLEMENTED_NOW` |
| Customer-safe publication and decision UX | `DEFERRED_TO=GWU-2B.3/2B.4 and GWU-3` |
| ImprovementOpportunity / initiatives / tasks / milestones / outcomes | `IMPLEMENTED_NOW` canonical chain |
| External verified company facts | `DEFERRED_TO=approved authority integrations` |
| Customer and workforce Company OS UX | `DEFERRED_TO=GWU-2B.2/2B.4` |
| Document-driven intake/extraction | `DEFERRED_TO=approved extraction workflow` |
| Future integrations | `DEFERRED_TO=integration-specific slices` |

`ROADMAP_CAPABILITIES_REMOVED=NONE`.

## 10. Design conclusion

GWU-2B is a projection/composition problem, not a persistence problem. The
repository has enough canonical data to start with an internal read model and
to prepare a customer-safe summary boundary. The honest gaps are:

1. a transparent, denominator-defined coverage contract;
2. a unified but initially service-level provenance/freshness/conflict
   vocabulary;
3. structured process dimensions for trigger/input/output/volume/rework/error;
4. a customer-safe publication boundary for accepted opportunities;
5. an explicit policy for publishing organization people and ownership.

None of these gaps justify a parallel Company OS database in GWU-2B.
