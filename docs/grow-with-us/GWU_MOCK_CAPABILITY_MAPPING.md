# Grow With Us mock capability mapping

Audit basis: canonical master `aa39229ed22b775da933fb17a52ee8757de7ca95`.
This is a read-only capability audit. It does not treat the approved mock as
runtime truth, and it does not add a model, route, migration, or UI feature.

The classifications below are against the approved mock contract. Every row
now carries an explicit `AUDIENCE`: `WORKFORCE`, `CUSTOMER`, or `BOTH`.
Where an internal/workforce equivalent already exists, it is called out in the
current UI column; that does not make the data customer-publishable.
Opportunity list/detail rows are labelled `CUSTOMER` because the supplied mock
expects a customer surface; their internal existence is documented separately.

## Canonical inventory and boundaries

The current schema already contains the relevant canonical records:

- **Company state:** `ClientFact`, `ClientFactAnswerState`, `FactDefinition`.
- **Evidence and interpretation:** `Observation`, `ResearchEvidence`,
  `EvidenceRecord`, `DiagnosisCandidate`, `RecommendationCandidate` and the
  `SufficiencyDecision` gate.
- **Improvement lifecycle:** `ImprovementOpportunity`,
  `DevelopmentInitiative`, `CompanyMilestone`, `OutcomeMeasurement`.
- **Operating model:** `BusinessProcess`, `BusinessProcessStep`,
  `BusinessSystem`.
- **Source/work context:** `Document`, `DocumentVersion`, `Case`, `Task`,
  `Assessment`, `AssessmentItem`, `AssessmentFinding` and the compliance
  requirement/applicability models.

The internal/workforce API is mounted at `/api/v1/client-company` and exposes
facts, milestones, assessments, findings, initiatives, systems, processes,
Observatory intake, Grow research, opportunities, outcome measurements and
process snapshots. The workforce UI is `/clients/[clientId]/grow`
(`GrowJourney`, `GrowDiagnosticWorkbench`) and
`/clients/[clientId]/vallalati-mukodes` (`ClientCompanyWorkspace`).

The customer API is mounted at `/api/v1/client-portal`. Relevant routes are
`GET /client-portal/org/grow`, `GET/POST /client-portal/org/grow-assessments`,
`GET /client-portal/org/company`, the company-profile routes, compliance and
published-document routes. `/portal/fejlesztes` renders `OrgGrowView`.
`orgGrowService` deliberately returns `opportunities: []` plus
`GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP`: an internal
`RecommendationCandidate` or `ImprovementOpportunity` is not customer content
until a publication contract exists. `clientSafeComplianceService` is a
separate allow-listed compliance projection.

`Observation` is declared/external input with provenance; it is not canonical
company state. `ResearchEvidence` is bounded supporting interpretation; it does
not prove a client condition. `OutcomeMeasurement.basis` keeps `MEASURED`,
`CALCULATED`, `ESTIMATED` and `ASSUMED` distinct. Existing customer projectors
exclude synthetic/assumed outcomes and do not invent percentages or savings.

## Capability mapping

Each row has exactly one classification. `W` means the workforce route/UI;
`C` means the customer portal route/UI.

### A. Grow overview

| MOCK_CAPABILITY | AUDIENCE | CLASSIFICATION | CANONICAL_MODEL | EXISTING_SERVICE_ROUTE | CURRENT_UI | MISSING_PIECE | SMALLEST_SAFE_NEXT_STEP |
|---|---|---|---|---|---|---|
| Hol érdemes körülnézni? | BOTH | READY_NOW | `RecommendationCandidate`, `DevelopmentInitiative`, `OutcomeMeasurement` | W `listGrowHome` → `/clients/:clientId/grow/home` | W home panel already presents the orientation and truthful counts | C does not receive internal opportunity rows | Keep the W panel; for C reuse only after publication/read-model review |
| open opportunities | BOTH | NEEDS_CUSTOMER_PUBLICATION_CONTRACT | `RecommendationCandidate`, `ImprovementOpportunity` | W `listGrowOpportunities`; C `getOrganizationalGrow` intentionally returns none | W list/detail exists; C shows the publication-gap state | No customer-visible approval, audience, or revocation contract | Define an explicit approved customer publication record/projection before exposing any row |
| evidence-supported issues | WORKFORCE | NEEDS_CUSTOMER_PUBLICATION_CONTRACT | `RecommendationCandidate`, `ResearchEvidence`, `EvidenceRecord` | W opportunity/detail DTOs include evidence strength and links | W evidence drawer/detail exists; C assessment evidence is separate | Internal evidence links are not a customer publication decision | Publish a bounded issue DTO only from approved opportunities with verified evidence |
| measured-supported issues | WORKFORCE | NEEDS_READ_MODEL_PROJECTION | `ProcessObservationSnapshot`, `DiagnosisCandidate`, `RecommendationCandidate` | W `runResearchCycle`, diagnostic workbench | W can show measurement-backed signals; C has no issue projection | Customer-safe process/signal summary with provenance | Project only the measured signal, scope and timestamp; never turn it into a score |
| active initiatives | BOTH | READY_NOW | `DevelopmentInitiative` | W initiative list; C `getOrganizationalGrow` | Both W and C show active/planned initiatives with status labels | Customer detail depth is limited | Reuse existing status projection; add detail only in a later approved slice |
| achieved results | BOTH | READY_NOW | `OutcomeMeasurement`, `CompanyMilestone` | W outcomes; C `getOrganizationalGrow` | W results and C results tabs are present | C currently shows bounded summaries rather than full metrics | Keep basis-separated result summaries; expose extra metrics only through a safe projection |
| pain report | BOTH | READY_NOW | `Observation` (`DECLARED_SURVEY`) and `ExternalSourceConnection`/`DiscoveryRun` | W and C survey intake routes | `GrowIntake` and customer quick pain survey are live | None for the bounded intake itself | Preserve idempotent intake and readback; do not infer diagnosis directly from free text |
| process development journey | BOTH | NEEDS_READ_MODEL_PROJECTION | `BusinessProcess`, `BusinessProcessStep`, `DevelopmentInitiative`, `CompanyMilestone`, `OutcomeMeasurement` | W Grow journey/workbench; C `/org/grow` supplies processes, initiatives and outcomes separately | W has screens; C has separate tabs, not one joined journey | A customer-safe joined timeline and provenance contract | Compose a read model from existing rows; do not add a second process or initiative model |

### B. Opportunity list

| MOCK_CAPABILITY | AUDIENCE | CLASSIFICATION | CANONICAL_MODEL | EXISTING_SERVICE_ROUTE | CURRENT_UI | MISSING_PIECE | SMALLEST_SAFE_NEXT_STEP |
|---|---|---|---|---|---|---|
| relevant opportunities | CUSTOMER | NEEDS_CUSTOMER_PUBLICATION_CONTRACT | `RecommendationCandidate`, `ImprovementOpportunity` | W `GET /api/v1/client-company/clients/:clientId/grow/opportunities`; C publication gap | W list is internal and review-gated; C is intentionally empty | Customer audience, status, and withdrawal semantics | Add an explicit customer publication contract and a customer-safe list projector |
| missing data count | CUSTOMER | UNSAFE_OR_FAKE | `ClientFactAnswerState`, assessment unknowns, recommendation sufficiency | Company profile/Data Room expose unknown/unanswered counts; no opportunity-level count | Counts exist for profile/assessment, not for each opportunity | No canonical definition of which missing facts qualify an opportunity | First define the qualifying fact set; until then render no count |
| saved/interested state | CUSTOMER | NEEDS_NEW_PERSISTENCE | — (no saved-state relation) | No customer save endpoint | No truthful save state | Per-customer/workspace actor state and idempotency | Add a scoped save/interest record only after product semantics are approved |
| deadline nearby | CUSTOMER | UNSAFE_OR_FAKE | `DevelopmentInitiative.targetAt`/`CompanyMilestone.targetDate` are not opportunity deadlines | Initiative/milestone APIs only | No opportunity deadline contract | `RecommendationCandidate` and `ImprovementOpportunity` have no deadline | Do not borrow case or initiative dates; define an opportunity deadline first |
| category filters | CUSTOMER | DERIVABLE_WITH_EXISTING_MODELS | `domainKey`, `kind`, `impactTags`, `interventionCodes` | W opportunity DTO already carries these fields | W has taxonomy fields but no complete filter control; C has no list | A bounded filter vocabulary and customer publication source | Add read-only filters over the existing taxonomy after publication is solved |
| relevance explanation | CUSTOMER | DERIVABLE_WITH_EXISTING_MODELS | diagnosis/process, `problemStatement`, `direction`, evidence links | W home/detail DTOs | W explains problem/direction and evidence; C does not | Customer-safe wording and provenance trimming | Reuse bounded problem/direction text in a publication DTO |
| missing information | CUSTOMER | NEEDS_READ_MODEL_PROJECTION | `SufficiencyDecision`, diagnosis source refs, `ClientFactAnswerState` | W detail has sufficiency/reasons; profile has missing answers | No customer opportunity-level missing-information panel | A deterministic mapping from source refs to safe missing items | Define and project only explicit missing inputs; otherwise show “további adat szükséges” |

### C. Opportunity detail

| MOCK_CAPABILITY | AUDIENCE | CLASSIFICATION | CANONICAL_MODEL | EXISTING_SERVICE_ROUTE | CURRENT_UI | MISSING_PIECE | SMALLEST_SAFE_NEXT_STEP |
|---|---|---|---|---|---|---|
| matching criteria | CUSTOMER | NEEDS_READ_MODEL_PROJECTION | `DiagnosisCandidate`, `ProblemDomain`, process snapshots/signals | W `getOpportunityDetail` | W detail exposes diagnosis/process/evidence, not a criteria contract | Customer-safe, bounded criteria language | Project domain/process/signal criteria with provenance labels |
| unknown criteria | CUSTOMER | NEEDS_READ_MODEL_PROJECTION | assessment unknown dimensions, `ClientFactAnswerState` | C assessment result has `unknownAreaCount`; W profile/Data Room has unknown states | No opportunity-specific unknown criteria | Link unknowns to a published opportunity without overclaiming | Return explicit unknown criteria only when the evaluator records them |
| missing data | CUSTOMER | NEEDS_READ_MODEL_PROJECTION | `ClientFactAnswerState`, evidence/signal provenance | Profile/Data Room and W sufficiency paths | No detail-level customer projection | Safe field-level list and semantics | Reuse the same fail-closed missing-input contract as the profile read model |
| required documents | CUSTOMER | NEEDS_NEW_PERSISTENCE | `Document`, `DocumentVersion`, `EvidenceRecord` exist but have no opportunity link | Compliance/document publication routes are separate | No canonical required-document relation for an opportunity | Direct requirement, audience, and publication state | Add a dedicated relation only if the product explicitly requires document requests |
| application stages | CUSTOMER | DEFERRED_PRODUCT_DECISION | `ImprovementOpportunity` lifecycle is not an application pipeline | Review and initiative-handoff routes only | No truthful application-stage UI | “Application” semantics, owner and transitions are undefined | Decide whether this means review, initiative, or a separate product before modeling |
| related opportunities | CUSTOMER | NEEDS_READ_MODEL_PROJECTION | `RecommendationRun`, domain/process links | W run/opportunity routes | No related-items projection | Deterministic relation rule and tenant-safe DTO | Group by run/domain/process only after the relation rule is approved |
| interest/save action | CUSTOMER | NEEDS_NEW_PERSISTENCE | — | No route or field | No action | Customer/workspace actor state | Add an idempotent scoped save record after product decision |
| “Vizsgáljuk meg” action | CUSTOMER | DERIVABLE_WITH_EXISTING_MODELS | `RecommendationCandidate`, `ImprovementOpportunity` | W detail/review and initiative handoff routes | W “Megnézem” reaches detail; C can use a future read-only CTA | Customer authorization/publication gate | Reuse a read-only detail route after publication; never make it an implicit review/accept action |

### D. Initiative list

| MOCK_CAPABILITY | AUDIENCE | CLASSIFICATION | CANONICAL_MODEL | EXISTING_SERVICE_ROUTE | CURRENT_UI | MISSING_PIECE | SMALLEST_SAFE_NEXT_STEP |
|---|---|---|---|---|---|---|
| planning / active / completed | BOTH | READY_NOW | `DevelopmentInitiativeStatus`, `DevelopmentInitiative` | W client-company initiative route; C `/org/grow` | W and C render planned/active/completed labels and filters | None for the basic lifecycle | Reuse the existing status enum and labels |
| categories | BOTH | DEFERRED_PRODUCT_DECISION | — (no initiative category field) | No canonical category route | No truthful category filter | Category taxonomy and ownership are undefined | Decide whether category is domain, kind, or a new controlled vocabulary |
| related process count | BOTH | NEEDS_READ_MODEL_PROJECTION | indirect `ImprovementOpportunity` → recommendation/diagnosis → process; `OutcomeMeasurement.businessProcessId` | W initiative/outcome routes | No authoritative count in C; indirect links are partial | A deterministic relation and duplicate-count rule | Project linked process IDs from existing relations; do not infer from title/text |
| status cards | BOTH | READY_NOW | `DevelopmentInitiativeStatus`, `CompanyMilestone` | W/C Grow services | Existing status cards are truthful | None for status counts | Keep status counts tied to canonical rows |
| current/target state | BOTH | READY_NOW | `DevelopmentInitiative.currentState`, `.targetState` | W client-company service; C `OrgGrowDto` target state | W and C display current/target where available | C currently omits some internal detail | Reuse fields; show “Nincs még adat” when null |
| next step | BOTH | NEEDS_READ_MODEL_PROJECTION | `CompanyMilestone`, `Task`, `Case` | W workspace exposes next milestone; C only has target date/related matter | No single customer next-step DTO | Which milestone/task/case is authoritative | Define precedence and project an existing row; do not invent a step |
| expected outcome | BOTH | NEEDS_READ_MODEL_PROJECTION | `targetState`, `OutcomeMeasurement`, `CompanyMilestone` | W initiative/outcome APIs; C initiative summary | Target state exists; expected impact is not a separate field | Safe expected-outcome wording and basis | Project target state plus measured outcome links; keep expectations separate from results |

### E. Initiative detail

| MOCK_CAPABILITY | AUDIENCE | CLASSIFICATION | CANONICAL_MODEL | EXISTING_SERVICE_ROUTE | CURRENT_UI | MISSING_PIECE | SMALLEST_SAFE_NEXT_STEP |
|---|---|---|---|---|---|---|
| goal | BOTH | DERIVABLE_WITH_EXISTING_MODELS | `DevelopmentInitiative.reason`, `currentState`, `targetState` | W `getInitiative`/list; C Grow projection | W can show reason/current/target; C shows target | Customer-safe goal wording | Reuse `reason`/target only after trimming internal notes |
| current status | BOTH | READY_NOW | `DevelopmentInitiative.status` | W/C initiative reads | Both expose lifecycle status | None | Keep enum-to-label mapping |
| next milestone | BOTH | NEEDS_READ_MODEL_PROJECTION | `CompanyMilestone` | W initiative DTO includes next milestone; C summary does not | W supports it; C does not | Customer-safe milestone selection | Project the earliest active/next milestone from canonical milestones |
| customer action required | BOTH | NEEDS_NEW_PERSISTENCE | `Task`/`Case` may relate operationally but no initiative customer-action field | No customer initiative-action route | No authoritative action state | Explicit actor, action, due date and completion semantics | Add a customer-action record only after authorization/publication design |
| milestones | BOTH | READY_NOW | `CompanyMilestone` | W client-company milestone routes; C company summary includes achieved milestones | Canonical milestones exist and are safely summarizable | C detail depth | Reuse rows with status/date labels |
| related documents | BOTH | NEEDS_NEW_PERSISTENCE | `Document`, `DocumentVersion`, `EvidenceRecord` | Publication/document routes are separate | No direct initiative-document relation | Association, audience and publication semantics | Add a relation only if initiative documents are a committed requirement |
| business problem | BOTH | READY_NOW | `DevelopmentInitiative.reason`, `ImprovementOpportunity.problem` | W initiative/opportunity services | W has problem/reason text | Customer publication trimming | Project only reviewed, customer-safe problem text |
| affected processes | BOTH | NEEDS_READ_MODEL_PROJECTION | `BusinessProcess`; indirect initiative/opportunity/outcome links | W process and Grow routes | Process map exists separately; no initiative-to-process DTO | Deterministic affected-process relation | Project only explicit linked process IDs |
| expected outcomes | BOTH | NEEDS_READ_MODEL_PROJECTION | `OutcomeMeasurement`, `targetState` | W outcome routes; C outcome summaries | Results are available; expected vs achieved is not joined | Separate expectation/result contract | Add a read-only composition with basis/provenance labels |
| progress/timeline | BOTH | NEEDS_READ_MODEL_PROJECTION | `DevelopmentInitiative` timestamps, `CompanyMilestone`, `OutcomeMeasurement` | W initiative/milestone/outcome routes | Pieces exist, no timeline DTO | Ordering and event semantics | Compose a timeline from canonical dates; never infer progress percentage |

### F. Outcome view

| MOCK_CAPABILITY | AUDIENCE | CLASSIFICATION | CANONICAL_MODEL | EXISTING_SERVICE_ROUTE | CURRENT_UI | MISSING_PIECE | SMALLEST_SAFE_NEXT_STEP |
|---|---|---|---|---|---|---|
| measured | BOTH | READY_NOW | `OutcomeMeasurement.basis=MEASURED` | W `listOutcomeMeasurements`; C `getOrganizationalGrow` | W and C separate measured outcomes | None for presence/label | Preserve the measured label and non-synthetic filter |
| calculated | BOTH | READY_NOW | `OutcomeMeasurement.basis=CALCULATED` | Same W/C routes | C and W distinguish calculated output | None for basis | Keep calculated separate from measured |
| estimated | BOTH | READY_NOW | `OutcomeMeasurement.basis=ESTIMATED` | Same W/C routes | C labels calculated/estimated and W shows basis | C could use more detail later | Keep estimated separate and never call it verified |
| achieved impact | BOTH | NEEDS_READ_MODEL_PROJECTION | `OutcomeMeasurement.metricsSummary`, `.roi` | W outcomes include metrics/ROI; C strips raw metrics | C shows outcome presence/link, not impact detail | Customer-safe bounded impact DTO | Project only recorded before/after metrics with basis and comparability |
| measurement methodology | BOTH | NEEDS_READ_MODEL_PROJECTION | ROI provenance, metric version, process snapshots | W “Hogyan számoltuk?”/outcome routes | W has provenance explanation; C does not | Safe methodology text and input disclosure | Reuse recorded provenance; exclude internal IDs and assumptions |
| linked initiative/process | BOTH | READY_NOW | `OutcomeMeasurement.developmentInitiativeId`, `.businessProcessId` | W/C outcome services | Both can display initiative/process names | None for basic links | Preserve links and scope them to the authorized client |

### G. Company OS

| MOCK_CAPABILITY | AUDIENCE | CLASSIFICATION | CANONICAL_MODEL | EXISTING_SERVICE_ROUTE | CURRENT_UI | MISSING_PIECE | SMALLEST_SAFE_NEXT_STEP |
|---|---|---|---|---|---|---|
| facts | BOTH | READY_NOW | `ClientFact`, `ClientFactAnswerState`, `FactDefinition` | W Data Room/company routes; C company-profile routes | Workforce Data Room and customer profile expose facts | Customer publication is question/projection scoped | Reuse the profile/Data Room contracts and preserve UNKNOWN/UNANSWERED |
| data quality | BOTH | READY_NOW | `ClientFactAnswerState`, validity/verification fields | W Data Room `dataQuality`; C company profile/company DTO | Answered, unknown, unanswered and verification distinctions exist | None for current counters | Keep counters derived from answer state, not display heuristics |
| organization | WORKFORCE | READY_NOW | organization groups/persons and workspace membership | W Data Room; C `/org/company` organization projection | W has directory; C exposes safe groups/counts only | Customer people publication remains intentionally restricted | Keep workspace-scoped projection; do not infer hierarchy or access |
| processes | BOTH | READY_NOW | `BusinessProcess`, `BusinessProcessStep` | W Data Room/Grow; C `/org/grow` | Process cards/maps and steps exist | Customer detail may need more safe fields | Reuse canonical process projection |
| systems | BOTH | READY_NOW | `BusinessSystem` and process-step links | W Data Room/Grow; C `/org/grow` | System cards/badges are present | None for bounded name/category/purpose | Reuse existing safe system fields |
| documents | BOTH | READY_NOW | `Document`, `DocumentVersion`, `ClientDocumentPublication`, `EvidenceRecord` | W Data Room/document routes; C published-document routes | W summary and C published documents exist | Publication remains the gate for customer detail | Use publication service; never expose internal documents by existence alone |
| compliance | BOTH | READY_NOW | requirements, applicability, findings, controls and evidence | W compliance/Data Room; C `/org/compliance` and safe compliance service | Both internal and customer-safe summaries exist | Detail depth is intentionally bounded | Reuse `clientSafeComplianceService` and its allow-list |
| development | BOTH | READY_NOW | initiatives, milestones, outcomes, observations | W Data Room/Grow; C `/org/grow` | Development sections exist in both contexts | Joined journey/detail is a projection gap | Compose from existing rows in a later read-model slice |

## Recommended implementation sequence

The first 42 capabilities (ready, derivable, or projection-capable) should be
implemented without a schema change. Publication is a separate safety gate;
persistence comes only after those slices and only for semantics that cannot be
reconstructed from canonical rows.

`FIRST_SCHEMA_FREE_SLICE=` Customer-safe Company OS read model: facts with
`ANSWERED`/`UNKNOWN`/`UNANSWERED`, data-quality counters, organization groups,
processes, systems, published documents, compliance summary and development
summary. Reuse `getOrganizationalCompany`, `getClientSafeComplianceReadModel`,
`getOrganizationalGrow`, the existing publication service and the current Data
Room projections.

`SECOND_SCHEMA_FREE_SLICE=` Customer Grow read model: initiative status/current
state/target state, next milestone where an explicit `CompanyMilestone` exists,
process links, measured/calculated/estimated outcomes and recorded methodology.
Reuse `orgGrowService`, `DevelopmentInitiative`, `CompanyMilestone`,
`OutcomeMeasurement`, process snapshots and the existing assessment result
projector. Do not add progress percentages or cash-savings claims.

`THIRD_SCHEMA_FREE_SLICE=` Customer publication contract for reviewed
`RecommendationCandidate`/`ImprovementOpportunity`: an allow-listed,
customer-safe list/detail projection with bounded evidence and an explicit
fail-closed empty state. This is a contract/read-model slice; do not expose the
internal rows directly.

`FIRST_TRUE_PERSISTENCE_SLICE=` Customer engagement state that cannot be derived
from existing rows: an idempotent workspace-scoped saved/interested record. If
deadlines, customer actions, required documents or direct initiative relations
are also approved, add them as separately scoped fields/relations with
authorization and publication rules; do not bundle speculative semantics into
the first migration.

## Counts and guardrails

Using the table above:

- `READY_NOW_COUNT=22`
- `DERIVABLE_COUNT=4`
- `NEEDS_PROJECTION_COUNT=16`
- `NEEDS_PUBLICATION_COUNT=3`
- `NEEDS_PERSISTENCE_COUNT=5`
- `UNSAFE_FAKE_COUNT=2`
- `DEFERRED_PRODUCT_DECISION_COUNT=2`

`TOP_10_ALREADY_BUILDABLE=` workforce Grow overview; workforce opportunity
list/detail; evidence/sufficiency explanation; initiative status list; current
and target state; milestones; measured/calculated/estimated outcome views;
pain/survey intake; process/step/system map; customer assessment catalogue,
runner, unknown-aware result and curated research evidence.

`TOP_10_REAL_BACKEND_GAPS=` customer opportunity publication contract; saved or
interested state; opportunity deadlines; opportunity missing-data semantics;
matching-criteria projection; opportunity required-document relation; related
opportunity relation; initiative category taxonomy; customer action state;
initiative-document/process relations and customer outcome-methodology detail.

`PERSISTENCE_REQUIRED_FOR_FUTURE_CAPABILITY=YES` for saved/interested state,
required-document associations, customer action state and any approved direct
initiative relations.

`PERSISTENCE_REQUIRED_FOR_NEXT_SLICE=NO` — the first three slices above reuse
existing models, services and customer-safe projections.

`CUSTOMER_PUBLICATION_BOUNDARY_PRESERVED=YES`

`RESEARCH_EVIDENCE_DOCTRINE_PRESERVED=YES`

`OBSERVATION_NOT_CANONICAL_STATE=YES`

`ROADMAP_CAPABILITIES_REMOVED=NONE`


`TOP_CUSTOMER_CAPABILITIES_BUILDABLE_NOW=` customer assessment catalogue,
runner and UNKNOWN-aware results; quick pain survey and history; process and
system read views; initiative status/current-target summaries; measured,
calculated and estimated outcome summaries; Company OS facts/data-quality;
published-document and compliance summaries.

`TOP_WORKFORCE_CAPABILITIES_BUILDABLE_NOW=` Grow overview counts and orientation;
research-backed opportunity list/detail; evidence and sufficiency reasoning;
Grow diagnostic workbench; process/system/step map; initiative lifecycle and
milestones; outcome metrics and ROI provenance; Observatory source/readback;
assessment and finding management.

`CUSTOMER_WORKFORCE_DISTINCTION_EXPLICIT=YES`
`RUNTIME_CHANGED=NO`
`SCHEMA_CHANGED=NO`
`MIGRATION_ADDED=NO`
`PRODUCTION_TOUCHED=NO`
