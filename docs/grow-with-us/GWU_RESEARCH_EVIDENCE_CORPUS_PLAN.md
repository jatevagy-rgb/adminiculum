# Grow With Us — Research and Data Science Evidence Corpus Integration Plan

**Status:** research/evidence architecture plan; documentation only
**Reviewed master:** `ab980019a4809f545ef7d8bf3f3a813ba9e9dedf`
**Scope:** Grow With Us research corpus, evidence provenance, diagnostic use, and future data-science readiness
**Out of scope:** runtime implementation, schema migration, customer data changes, automatic recommendations, legal advice, and a replacement of the existing Grow journey

## 1. Purpose and permanent product contract

Grow With Us is a research-backed decision-support capability. Its permanent value is the disciplined chain from an organization’s known state, through declared or measured evidence, to a bounded diagnosis, a human-reviewed recommendation, and a measured outcome. Research is a permanent approved capability of the product. This plan makes that capability auditable and extensible without turning a benchmark into a fact, a survey answer into a measurement, or a recommendation into an automatic action.

The governing rule is **evidence before assertion**:

1. A client fact is an authoritative, client-scoped state with a source and verification lifecycle.
2. A declared observation is what a person or organization reported; it is useful evidence but is not silently promoted to measured truth.
3. A measured snapshot is a reproducible calculation from canonical process data, with metric version, input digest, snapshot digest, and provenance.
4. An EvidenceRecord is a client-scoped supporting artifact or reference that can be reviewed and accepted or rejected.
5. ResearchEvidence is an external or internal research-library item with a bounded claim, provenance, verification state, strength, domain coverage, limitations, and intervention/outcome mappings.
6. Diagnosis and recommendation are derived artifacts. They must retain their supporting evidence and sufficiency decision.
7. Outcomes are recorded separately from expectations. A calculated or estimated ROI is not a measured result.

No roadmap capability is removed by this plan. `ROADMAP_CAPABILITIES_REMOVED=NONE`. The plan strengthens the existing research path and records where future work remains explicitly gated.

## 2. Current repository inventory

### 2.1 Canonical read model and routes

The current master contains the GWU-2A diagnostic workbench at `Backend/src/modules/company-growth/diagnostic/workbenchService.ts`. Its bounded DTO separates the following provenance classes:

| Workbench section | Provenance class | Meaning |
|---|---|---|
| `client`, operating profile | `CANONICAL_STATE` | persisted client and profile state |
| `known.facts`, processes, systems | `CANONICAL_STATE` | current structured operating facts |
| `observed.observations` | `DECLARED_OBSERVATION` | declared survey or source observations |
| `observed.processSnapshots` | `MEASURED_SNAPSHOT` | versioned process metrics |
| `problems.domains`, diagnoses | `DERIVED_DIAGNOSIS` | research-derived problem framing |
| `proposed.recommendations` | `RECOMMENDATION` | bounded, human-reviewable candidates |
| `evidence.records` | `EVIDENCE_RECORD` | client evidence artifacts |
| `evidence.research` | `RESEARCH_EVIDENCE` | curated research-library evidence |
| `missing` | safety state | unknown facts, conflicts, insufficient recommendations, unresolved items |

The workforce route is `GET /clients/:clientId/grow/diagnostic-workbench`. Existing adjacent routes remain canonical for their own responsibilities: `/grow/home`, `/grow/evidence`, `/grow/research-runs`, `/grow/opportunities`, opportunity review, initiative handoff, and outcome measurement. Observatory intake and observation routes remain the source boundary for external-source runs and declared observations. Customer routes expose the customer-safe survey, assessment, and compliance projections; they do not expose raw research payloads or unapproved recommendations.

### 2.2 Existing data models

The existing Prisma schema is sufficient for the current corpus and evidence lifecycle:

* **`ResearchEvidence`** is the global or client-scoped research library. It carries `corpusKey`, kind, title, authors, venue, year, DOI, locator, origin, bounded claim, evidence type, verification status, strength, domain keys, supported interventions, supported outcomes, applicability notes, and limitations. A `clientId` of `NULL` denotes global research evidence.
* **`EvidenceRecord`** is client-scoped evidence with source type (`DOCUMENT_VERSION`, `CLIENT_FACT`, `OBSERVATION`, or `EXTERNAL_REFERENCE`), review status, validity dates, and optional links to the canonical fact, document version, or observation.
* **`DiagnosisEvidenceLink`** and **`RecommendationEvidenceLink`** preserve the evidence chain for derived artifacts.
* **`ProblemDomain`**, **`DiagnosisCandidate`**, and **`RecommendationCandidate`** hold bounded problem framing and proposed directions. Diagnosis and recommendation status are explicit; no row is an implicit task.
* **`SufficiencyDecision`** records whether a recommendation is supported, needs more data, insufficient, conflicting, out of scope, or requires human domain review.
* **`RecommendationRun`** provides idempotent research-cycle execution.
* **`ProcessObservationSnapshot`** stores metric version, observed time, input digest, snapshot digest, metrics, and provenance.
* **`OutcomeMeasurement`** records before/after snapshots, metrics summary, ROI, measurement basis, and synthetic flag. The basis ladder is `MEASURED`, `CALCULATED`, `ESTIMATED`, and `ASSUMED`.

The schema does not currently persist a first-class methodology, study population, geography, freshness date, or supersession relation on `ResearchEvidence`. Those are real metadata gaps for a larger library, but they are not a reason to add a migration in this documentation-only slice. The first implementation should keep them in a versioned registry or manifest and only add queryable columns when a product contract requires filtering or enforcement at runtime.

### 2.3 Existing services and boundaries

* `research/corpus.ts` owns the typed seeded corpus, idempotent seeding, DTO projection, internal evidence registration, and domain lookup.
* `research/service.ts` consumes observations and snapshots, registers internal evidence, derives diagnoses and recommendations, applies sufficiency, and keeps the research run idempotent. Only `SUPPORTED` recommendations are actionable; `NEEDS_MORE_DATA` remains a prompt for evidence collection.
* `research/observationSignals.ts` is the fail-closed normalization boundary. It accepts only canonical `DECLARED_SURVEY` observations and known Grow schemas/categories. Unknown payloads and categories produce no signal.
* `research/interventions.ts` is the backend-owned intervention taxonomy and safety gate. Every intervention requires human review; contraindications can substitute a redesign recommendation for blind automation.
* `research/roiEngine.ts` produces reproducible low/base/high ranges and keeps time saved separate from cash saved. It records formula version, inputs, computation time, basis, and provenance type.
* `assessments/registry.ts` owns the four first-party assessment packs and their explicit answer-to-finding rules. It has no percentage score or fabricated maturity index; `UNKNOWN` and `NOT_APPLICABLE` never trigger a negative finding.
* `observation/processObservationService.ts` and `metrics/*` own process snapshots and metric calculations.
* `company-observatory/ingestion/*` owns source connections, discovery runs, and observation intake.
* Compliance services continue to own legal applicability and canonical fact evaluation. Grow evidence can inform a diagnostic conversation, but it cannot create a legal conclusion.

## 3. Corpus inventory and normalization

### 3.1 Documents found and content availability

No repository `research/`, `data/`, or `fixtures/` directory containing paper text or PDFs exists on current master. Research material is encoded in the canonical registry and assessment pack references. The product and UX benchmark documents under `docs/` are contextual product documents, not automatically admissible ResearchEvidence: they lack a source-specific evidence record and bounded study claims. They must not be promoted into the corpus merely because they mention a market or competitor.

`RESEARCH_DOCUMENTS_CONTENT_AVAILABLE=NO` for standalone source full text. The registry has bibliographic metadata and bounded claims for the entries marked verified; a later evidence-ingestion project may attach locators or source extracts. Until then, no stronger claim or effect size may be inferred from a title alone.

### 3.2 Seeded corpus count and quality classes

The current `SEEDED_CORPUS` contains **25** entries. They normalize into these operational classes:

| Class | Count / examples | Use |
|---|---:|---|
| Verified external evidence | 18 | eligible to support a `SUPPORTED` recommendation when an internal client signal also exists |
| Unverified user-library or general reasoning | 7 | context, hypothesis generation, or evidence-gap prompts; never sufficient alone |
| Internal client evidence | runtime-created | registered from observations and measurements with `CLIENT_INTERNAL` origin |

The 25 registry entries are:

**Core verified papers and reviews**

* `paper:bps-standardization-goel-bandara-gable-2023` — Goel, Bandara & Gable, 2023, business-process standardization review; DOI `10.1007/s41471-023-00158-y`.
* `paper:process-owner-role-davenport-1990` — Davenport & Short, 1990, process ownership and IT-supported redesign.
* `paper:reengineering-work-hammer-1990` — Hammer, 1990, remove waste and redesign before automating.

**Unverified context entries**

* `benchmark:unverified-sme-admin-share` and `benchmark:unverified-approval-cycle-time` — user-library industry claims without a verifiable bibliography.
* `pack:EV-ECON-TCE-001` — general transaction/coordination-cost reasoning.
* `pack:EV-ECON-OPPCOST-001` — capacity and opportunity-cost reasoning.
* `pack:EV-STD-CASE-2019-001` — an unverified manufacturing standardization case.
* `pack:EV-APPROVAL-DELPHI-2026-001` — an unverified approval bottleneck Delphi claim.
* `pack:EV-INTAKE-GENERAL-001` — an unverified structured-intake design heuristic.

**Verified pack evidence**

* `pack:EV-DMM-2024-001` — multidimensional SME digital maturity review.
* `pack:EV-SME-DT-2024-001` — SME digital-transformation success systematic review.
* `pack:EV-KOUMAS-2021-001` — progressive SME transformation framework.
* `pack:EV-IP-BPM-2022-001` — process maturity in IP/legal professional services.
* `pack:EV-HU-OECD-2026-001` — OECD Hungary SME digitalisation/training context.
* `pack:EV-DT-ROI-2024-001` — outcome and ROI measurement review.
* `pack:EV-DMM-CRITIQUE-2023-001` — critique of digital maturity models.
* `pack:EV-PROJECT-TAXONOMY-2024-001` — taxonomy of supported SME digital projects.
* `pack:EV-TECH-TRANSFORM-2023-001` — technology assimilation versus realized value review.
* `pack:EV-PHASED-CBA-2026-001` — phased digital investment case study.
* `pack:EV-DECISION-RIGHTS-2019-001` — decision-rights delegation case study.
* `pack:EV-BPM-RPA-SLR-2026-001` — BPM/RPA suitability review.
* `pack:EV-DT-REDESIGN-2024-001` — digital process redesign synthesis.
* `pack:EV-APP-LANDSCAPE-2011-001` — application-landscape complexity case study.
* `pack:EV-DATA-TRANSFER-2025-001` — application-assisted electronic data transfer case study.

The registry currently contains some entries whose origin is `USER_LIBRARY` but whose verification status is `VERIFIED`. That combination means the source was supplied through the library and then verified; it is not a license to copy source text. Every item still needs an accessible locator and a review record before it is treated as production-grade in a future corpus UI.

### 3.3 Normalized research item contract

Every future normalized item should have:

* stable `corpusKey` and version;
* kind, title, authors, venue, year, DOI or locator where available;
* origin and verification status;
* one bounded claim written so it cannot be mistaken for a client-specific finding;
* evidence type and strength;
* explicit domain keys, intervention codes, and outcome metrics;
* population, sector, geography, methodology, sample/setting, freshness, and limitations in the registry manifest;
* a supersession/retraction pointer when a source is replaced;
* a license/access note for any excerpt or derived summary.

The canonical runtime `ResearchEvidence` remains the published, bounded projection. Full documents, extracted passages, and licensed artifacts belong in a controlled research repository, not in tenant rows or unbounded API JSON.

## 4. Evidence quality framework

### 4.1 Four independent axes

Quality is not one score. Each item is judged on four independent axes:

1. **Source verification:** `VERIFIED`, `UNVERIFIED`, or `DISPUTED`.
2. **Evidence strength:** `STRONG`, `MODERATE`, or `WEAK`.
3. **Applicability:** how well the setting, sector, process, and decision context fit the client.
4. **Freshness and status:** current, superseded, retracted, or pending review.

`VERIFIED` means the citation/locator and bounded claim have been checked. `STRONG` describes the weight of the source for the bounded claim; it does not mean the intervention is guaranteed. A verified paper in another sector can still have low applicability.

### 4.2 Recommendation gate

The existing sufficiency states are the runtime contract:

| Decision | Required state | Product consequence |
|---|---|---|
| `SUPPORTED` | verified external evidence plus an internal client signal | recommendation candidate may enter human review |
| `NEEDS_MORE_DATA` | internal signal but no verified external backing | show what evidence is missing; do not present as supported |
| `INSUFFICIENT_EVIDENCE` | no internal signal and no verified backing | retain a diagnosis/evidence gap only |
| `CONFLICTING_EVIDENCE` | verified and disputed evidence conflict | require resolution or domain review |
| `OUT_OF_SCOPE` | domain is outside Grow taxonomy | do not coerce into `GENERAL_FLOW` |
| `HUMAN_DOMAIN_REVIEW` | disputed evidence only | human review before any direction |

The gate is deliberately conservative. A research benchmark never creates a client fact, and a client declaration never proves a causal effect.

### 4.3 Reproducibility and audit

Research runs must remain idempotent by client and idempotency key. Derived artifacts retain evidence links, run identity, and status transitions. Metric snapshots retain input and output digests. ROI retains formula version and explicit provenance. Any future corpus refresh must preserve old versions and record the supersession relationship instead of rewriting historical decisions.

## 5. Domain evidence map

The current canonical domain vocabulary is intentionally small:

| Domain key | Operational question | Strongest current evidence | Typical internal signal |
|---|---|---|---|
| `MANUAL_ADMIN_LOAD` | Where is avoidable hands-on work consuming capacity? | standardization and redesign reviews; RPA suitability review | active minutes, manual/repetitive steps |
| `APPROVAL_DELAY` | Where is approval or escalation creating waiting time? | reengineering and decision-rights research | approval step count, waiting share |
| `DUPLICATE_DATA_ENTRY` | Is the same information captured repeatedly? | standardization and data-transfer studies | data-entry step count, repeated-entry declaration |
| `SYSTEM_SWITCHING` | How much work crosses systems or application boundaries? | process-owner, application-landscape, data-transfer and transformation reviews | system count, switch count |
| `UNCLEAR_OWNERSHIP` | Are responsibilities and escalation paths explicit? | process-owner and decision-rights research; legal-services survey | unassigned steps, absent owner |
| `REWORK` | Is work repeated because the process or input is unstable? | standardization, redesign, and BPM/RPA reviews | rework declaration, rework indicator |
| `UNMEASURED_COST` | Is there no baseline for cost, time, or capacity? | ROI/maturity and phased-investment reviews | missing baseline or measured snapshot |
| `GENERAL_FLOW` | Is the process concern broader than one narrow domain? | cross-cutting transformation and process reviews | bounded general concern, never an unknown fallback |

Future domains such as data quality, security/control burden, customer experience, and workforce change should be added only with a domain definition, signal source, evidence mapping, intervention guardrails, and metric contract. They must not be smuggled in under `GENERAL_FLOW`.

## 6. Order-to-cash evidence matrix

Order-to-cash (O2C) is a useful cross-domain example, not a new product module. The matrix below shows how the existing taxonomy can describe O2C without pretending that a benchmark proves a client result.

| O2C stage | Evidence question | Internal evidence to collect | Candidate domain | Research-backed direction | Outcome to measure |
|---|---|---|---|---|---|
| order intake | Is required order data captured once and validated? | intake fields, duplicate entry count, exception count | `DUPLICATE_DATA_ENTRY`, `MANUAL_ADMIN_LOAD` | digitize intake only when the intake signal is explicit | data-entry count, error rate, active minutes |
| credit/terms approval | Where is the order waiting for a decision? | approval timestamps, approval count, escalation path | `APPROVAL_DELAY`, `UNCLEAR_OWNERSHIP` | review decision rights and routing; do not remove required controls | waiting minutes, cycle minutes, owner coverage |
| order entry | Is information retyped across systems? | system switches, handoff steps, source/destination fields | `DUPLICATE_DATA_ENTRY`, `SYSTEM_SWITCHING` | integrate or standardize after process suitability review | switch count, handoff count, errors |
| fulfillment coordination | Is ownership clear across sales, operations, and finance? | responsible person per step, reassignment history | `UNCLEAR_OWNERSHIP` | clarify process ownership | unassigned steps, owner-present boolean |
| delivery and acceptance | Are exceptions and rework visible? | rework events, returned documents, exception reason | `REWORK`, `GENERAL_FLOW` | standardize and redesign before automating | rework rate, active minutes |
| invoicing | Does approved delivery information flow once into billing? | duplicate fields, invoice correction count, source system | `DUPLICATE_DATA_ENTRY`, `SYSTEM_SWITCHING` | integrate systems where the source is authoritative | error rate, labor hours, cycle time |
| collections | Are reminders and escalation rules explicit? | reminder steps, approval waits, ownership | `APPROVAL_DELAY`, `UNCLEAR_OWNERSHIP` | redesign routing only with measured approval signal | waiting share, cycle time |
| cash application | Are payments matched through stable rules? | match exceptions, manual entries, system switches | `MANUAL_ADMIN_LOAD`, `REWORK` | standardize exception handling; automation follows stability proof | exception count, active minutes |

O2C conclusions require client-specific evidence. The matrix is a discovery and measurement plan, not a generic diagnosis.

## 7. Assessment-pack evidence matrices

### 7.1 Digital maturity (`DIGITAL_MATURITY`)

The pack uses `EV-DMM-2024-001`, `EV-DMM-CRITIQUE-2023-001`, and `EV-DT-ROI-2024-001`. It covers strategy alignment, outcome measurement, leadership review, digital skills, process support, data access, ownership, prioritization, and customer feedback. Findings map to `ALIGN_IT_WITH_BUSINESS_GOALS`, `IMPLEMENT_PROCESS_MEASUREMENT`, and `TRAIN_DIGITAL_SKILLS`. Strategy, leadership, culture, and customer dimensions remain assessment-level unless a canonical process signal exists; they are never forced into a process diagnosis.

### 7.2 Transformation readiness (`TRANSFORMATION_READINESS`)

The pack uses `EV-SME-DT-2024-001`, `EV-KOUMAS-2021-001`, `EV-PROJECT-TAXONOMY-2024-001`, and `EV-PHASED-CBA-2026-001`. It tests goal clarity, sponsorship, capacity, involvement, training, baseline, phasing, and review. Findings map to alignment, phased investment, training, and measurement. A missing baseline is an evidence gap, not proof that an investment failed.

### 7.3 Process automation readiness (`PROCESS_AUTOMATION_READINESS`)

The pack uses the standardization, redesign, RPA suitability, data-transfer, reengineering, and process-owner entries. It asks whether a process is owned, documented, stable, repetitive, rework-prone, approval-heavy, measured, and suitable for automation. Its key safety rule is preserved: process variability, rework, or unclear ownership defers `AUTOMATE_REPETITIVE_STEP` in favor of `REDESIGN_BEFORE_AUTOMATING`.

### 7.4 Systems and data flow (`SYSTEMS_DATA_FLOW`)

The pack covers system inventory, ownership, handoffs, duplication, data access, and integration readiness. It uses the application-landscape, data-transfer, digital transformation, and process-owner evidence. `CONSOLIDATE_SYSTEMS` requires a high-switch signal; application count alone is not sufficient. A system recommendation remains a human-reviewed direction, not a procurement decision.

## 8. Intervention and outcome mapping

### 8.1 Existing intervention codes

The canonical registry contains 13 codes:

`STANDARDIZE_PROCESS`, `REDESIGN_APPROVAL_ROUTING`, `DIGITIZE_INTAKE`, `CONSOLIDATE_SYSTEMS`, `INTEGRATE_SYSTEMS`, `AUTOMATE_REPETITIVE_STEP`, `CLARIFY_PROCESS_OWNERSHIP`, `TRAIN_DIGITAL_SKILLS`, `ALIGN_IT_WITH_BUSINESS_GOALS`, `IMPLEMENT_PROCESS_MEASUREMENT`, `PHASE_DIGITAL_INVESTMENT`, `REMOVE_NON_VALUE_ADDING_STEP`, and `REDESIGN_BEFORE_AUTOMATING`.

Each code declares allowed domains, required signals, contraindications, supported outcome metrics, and `humanReviewRequired=true`. The registry deliberately blocks unsafe leaps: long cycle time alone does not imply approval redesign; a multi-system process alone does not imply consolidation; a single-person dependency alone does not prove ownership ambiguity; manual entry alone does not prove intake digitization.

### 8.2 Existing outcome metrics

Current process metrics include `TOTAL_ACTIVE_MINUTES`, `TOTAL_WAITING_MINUTES`, `TOTAL_CYCLE_MINUTES`, `WAITING_SHARE`, `APPROVAL_STEP_COUNT`, `DATA_ENTRY_STEP_COUNT`, `HANDOFF_STEP_COUNT`, `RESPONSIBLE_PERSON_CHANGE_COUNT`, `SYSTEM_COUNT`, `SYSTEM_SWITCH_COUNT`, `UNASSIGNED_STEP_COUNT`, and `PROCESS_OWNER_PRESENT`. The corpus also maps to `REWORK_INDICATOR`, `REWORK_RATE`, `ERROR_RATE`, `LABOR_HOURS`, `COST`, `QUALITY`, `DIGITAL_SKILL_COVERAGE`, `CUSTOMER_TIME_TO_VALUE`, and other outcome labels. The mapping is a measurement vocabulary, not a promise that every metric is available for every client.

The ROI engine's six provenance types are `MEASURED`, `CALCULATED`, `CLIENT_ESTIMATE`, `CONSULTANT_ESTIMATE`, `RESEARCH_BENCHMARK`, and `GENERAL_ASSUMPTION`. Time saved is explicitly different from cash saved. A future outcome dashboard must preserve that distinction and show the basis beside every number.

### 8.3 Gaps

The current metric registry lacks dedicated first-class measures for data quality, control burden, customer experience, adoption, and change sustainability. Those are `METRIC_GAPS`, not reasons to infer them from existing minutes. Any addition should specify unit, collection source, before/after semantics, missingness, privacy, and whether it is measured or estimated.

## 9. Legal and factual boundary

Grow research is not a legal advice engine. A legal conclusion requires the canonical client facts, an authoritative legal source, an approved applicability rule, and human review wherever the legal workflow requires it. ResearchEvidence can explain why a process intervention is worth investigating; it cannot establish a regulatory duty or substitute for a compliance applicability decision.

External company facts such as NAV, KOMA, e-beszámoló, VIES, public registries, or paid provider results are a separate source family. They must enter the canonical `ClientFact` lifecycle only after source-specific verification, with observed/effective validity and conflict handling. They are not silently inserted into `ResearchEvidence`, and a research benchmark is never treated as a client fact.

The customer-safe projection must expose bounded claims, source status, limitations, and missing evidence. It must not expose raw observation payloads, tenant-to-tenant data, full licensed text, or unapproved recommendation candidates.

## 10. Future cross-client data science boundary

Cross-tenant analytics is not used by the current product path (`CROSS_TENANT_DATA_USED=NO`). A future data-science program may use only aggregated, privacy-safe, sufficiently sized cohorts with explicit purpose limitation, tenant isolation, retention, access control, and disclosure review. It must not train on or expose raw client payloads, identifiable process text, legal documents, secrets, or a client's ResearchEvidence links to another client. Cohort-derived benchmarks must carry population, geography, period, and sampling limitations and must remain clearly distinct from client facts.

## 11. Missing corpus and research acquisition plan

The next corpus work should fill evidence gaps without inflating claims:

1. **Professional-services and legal operations:** verifiable studies on matter intake, document handoffs, approval controls, and client communication, with clear sector limits.
2. **Hungarian SME evidence:** primary or institutional sources with locators, date, population, and geography; never copy an unverified percentage from a presentation.
3. **Data quality and control cost:** evidence for correction loops, auditability, and controlled automation.
4. **Customer experience and adoption:** validated measures that can be collected without exposing client communications.
5. **Sustainability:** longitudinal evidence for training, adoption, and post-implementation review.

Each acquisition follows the same path: source discovery, license/access check, bibliographic verification, bounded-claim drafting, applicability review, domain/intervention/outcome mapping, limitations, registry version, and test fixture. Items without a reliable locator remain `UNVERIFIED` and cannot satisfy the recommendation gate.

## 12. Implementation sequence (documentation-first, no current runtime change)

### Phase A — registry and governance

Create a versioned corpus manifest beside the existing registry. Add methodology, population, geography, freshness, supersession, license/access, and reviewer fields in the manifest first. Add CI checks for stable keys, no duplicate DOI, bounded-claim length, valid domain/intervention/outcome references, and no unverified item marked as sufficient.

### Phase B — evidence operations

Add an internal review workflow for verification, dispute, supersession, and retraction. Preserve old versions and link decisions to the version used. Keep the existing `ensureCorpusSeeded` idempotence and never rewrite client historical evidence links.

### Phase C — workbench and customer-safe projections

Use the existing diagnostic workbench as the workforce read model. Extend only through additive, bounded DTO fields after a product decision. Keep customer projections separate: expose assessment explanations and approved, customer-safe artifacts; do not publish raw research records or unreviewed recommendations.

### Phase D — measurement and outcome learning

Add missing metrics only with collection and privacy contracts. Require before snapshots for outcome claims, retain the ROI basis, and distinguish capacity value from cash realization. Use outcomes to review intervention usefulness, never to retroactively rewrite the source evidence.

### Phase E — privacy-safe analytics

Only after sufficient cohort size, governance approval, and tenant isolation should aggregate benchmarks be considered. A cohort benchmark receives its own ResearchEvidence item with methodology and limitations; it does not become a fact for any individual client.

## 13. Acceptance and regression inventory

This plan preserves the following already-working capabilities:

* four customer assessment packs and their explicit answer-to-finding rules;
* fail-closed observation normalization and cross-client process-reference protection;
* global and client-scoped ResearchEvidence with verification and strength;
* canonical facts, processes, systems, observations, and process snapshots;
* sufficiency states and human review before opportunities or initiatives;
* idempotent research runs and evidence links;
* intervention contraindications and redesign-before-automation safety;
* ROI provenance, low/base/high ranges, and time-versus-cash separation;
* diagnostic workbench provenance classes and missing-evidence projection;
* compliance legal boundary and customer-safe projection;
* historical outcome records and Grow journey continuity.

The authoritative checks for a later implementation are the existing Grow research, observation convergence, assessment, outcome, compliance, and customer-portal PostgreSQL suites, plus backend typecheck/build and the repository's migration gate. This document itself changes none of those systems.

## 14. Decision summary

The current ResearchEvidence schema and services are sufficient for the present corpus, assessment packs, and GWU-2A read model. The immediate need is corpus governance and metadata discipline, not a migration. Research documents with unavailable full content remain bounded registry references; no citation or result is fabricated. The next product slice should publish only human-approved customer-safe recommendations, while preserving the existing survey and assessment journey.

**Roadmap status:**

* `ROADMAP_CAPABILITIES_REMOVED=NONE`
* `ROADMAP_CAPABILITIES_DEFERRED=corpus metadata manifest; missing professional-services/Hungarian SME/control/adoption evidence; customer-safe publication of approved recommendations; privacy-safe cohort analytics`
* `ROADMAP_CAPABILITIES_BLOCKED=none at schema level; implementation remains gated by source verification, human review, privacy controls, and product acceptance`
