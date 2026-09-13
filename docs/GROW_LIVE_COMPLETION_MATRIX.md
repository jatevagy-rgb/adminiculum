# GROW_LIVE_COMPLETION_MATRIX

Base: master `07aef37ccc021c7461be14c40045773a39032df4`.
Implementation inventory (not a stopping point). Status legend: YES / PARTIAL / NO.

| Capability | BACKEND_EXISTS | WORKFORCE_UI_EXISTS | CUSTOMER_UI_EXISTS | PG_TEST_EXISTS | CI_WIRED | LIVE_REACHABLE | MISSING_LINK |
|---|---|---|---|---|---|---|---|
| BusinessProcess / Step / System | YES | YES (`ClientCompanyWorkspace`, `GrowProcessMap`) | PARTIAL | PARTIAL (`vendorOnboardingProof.integration`) | YES | YES | customer projection |
| ProcessObservationSnapshot + T2A metrics | YES | YES | NO | YES (`growWithUsObservationSnapshot.integration`, `growWithUsProcessMetrics`) | NO | PARTIAL | snapshot PG suite not wired into canonical CI |
| ExternalSourceConnection / DiscoveryRun / Observation | YES | NO | NO | NO | NO | PARTIAL | no PG suite; no workforce/portal UI |
| ObservatoryIngestionService | YES | (internal) | NO | NO | NO | PARTIAL | no dedicated PG suite |
| Structured Grow survey intake | YES (`company-observatory/intake.ts`) | YES (`GrowIntake`) | **NO** | YES (`growResearch.integration` step 2) | **NO → fixed in this PR** | PARTIAL | customer portal intake UI + portal provenance |
| Grow research run (corpus, diagnosis, gate) | YES (`company-growth/research/service.ts`) | YES (`GrowJourney`) | NO | YES (`growResearch.integration`) | **NO → fixed in this PR** | YES (workforce) | `growResearch` was not wired into Backend PostgreSQL Integration |
| ProblemDomain / DiagnosisCandidate / SufficiencyDecision | YES (6/6) | YES | NO | YES | (via growResearch) | YES (workforce) | — |
| Evidence corpus + evidence links | YES (19 verified sources) | YES (evidence drawer) | NO | YES | (via growResearch) | YES (workforce) | — |
| RecommendationCandidate | YES | YES | NO | YES | (via growResearch) | YES (workforce) | customer-safe publication missing |
| Human review ACCEPT/DECLINE/REQUEST_MORE_INFO | YES | YES | n/a (internal) | YES | (via growResearch) | YES | — |
| ImprovementOpportunity | YES | YES | NO | YES | (via growResearch) | YES | — |
| DevelopmentInitiative handoff | YES (canonical `createInitiative`) | YES | PARTIAL | YES | (via demo/vendor suites) | YES | customer projection |
| Task/work execution linkage | YES | YES | n/a | YES | YES | YES | — |
| OutcomeMeasurement | YES | YES | NO | YES | (via growResearch) | PARTIAL | customer-safe projection |
| ROI provenance | YES (6/6) | YES ("Hogyan számoltuk?") | NO | YES (`roiEngine`) | n/a (unit) | YES | customer-safe projection |
| Generic Observation → normalized Grow signal | **NO** | n/a | n/a | **NO** | **NO** | **NO** | smallest typed normalization layer required |
| Customer Grow journey (`/portal/fejlesztes`) | — | n/a | **NO/UNCONFIRMED** | **NO** | **NO** | **NO** | customer-safe projection over canonical Grow |
| Process observation loop (model→snapshot→research→review→initiative→snapshot→outcome) | YES | YES | NO | PARTIAL | NO | YES (workforce) | one golden-path PG test |

## This PR's coherent slice
- **CI wiring (mission §9):** `Backend/tests/growResearch.integration.test.ts` is now registered as a canonical step **"Grow research golden path PG"** (`GROW_TEST_DATABASE_URL`, suite key `grow-research`) so it actually executes; previously it ran nowhere. This turns the research/diagnosis/gate/human-review PGs from unexecuted into CI-authoritative coverage.

## Remaining (exact continuation)
1. Wire `growWithUsObservationSnapshot.integration` and the Observatory ingestion into CI; add Observer→Grow convergence PG.
2. Implement the smallest typed Observation→GROW signal normalization layer (no second engine; no direct recommend/opportunity/initiative/task writes; evidence + human gates remain).
3. Add customer portal survey intake (`/portal/fejlesztes`) reusing canonical categories + `submitSurveyIntake` with portal identity/workspace provenance (no automatic recommendation).
4. Implement customer-safe Grow projections (FELTÁRÁS / MIT LÁTUNK? / HOL ÉRDEMES JAVÍTANI? published-only / MIT CSINÁLUNK? / MIT ÉRTÜNK EL?) + project the observation loop as one golden-path PG test.
5. Live Demo Kft Grow data audit (read-only; never reseed; never touch employee_count).
