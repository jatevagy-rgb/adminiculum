# GROW_LIVE_COMPLETION_MATRIX

Base: master `e00e9bff96d34f81cabed92269924aeeeab756fc` (PR #227 merged).
Implementation inventory (not a stopping point). Status legend: YES / PARTIAL / NO.

| Capability | BACKEND_EXISTS | WORKFORCE_UI_EXISTS | CUSTOMER_UI_EXISTS | PG_TEST_EXISTS | CI_WIRED | LIVE_REACHABLE | MISSING_LINK |
|---|---|---|---|---|---|---|---|
| BusinessProcess / Step / System | YES | YES (`ClientCompanyWorkspace`, `GrowProcessMap`) | PARTIAL | PARTIAL (`vendorOnboardingProof.integration`) | YES | YES | customer projection |
| ProcessObservationSnapshot + T2A metrics | YES | YES | NO | YES (`growWithUsObservationSnapshot`, `growWithUsProcessMetrics`) | NO | PARTIAL | snapshot PG suite not wired into canonical CI (suite has a pre-existing test-isolation failure) |
| ExternalSourceConnection / DiscoveryRun / Observation | YES | PARTIAL (`/observatory/sources`) | NO | YES (`obs1Ingestion.integration`) | YES | PARTIAL | workforce health projection is minimal/read-only (type/status/last-run/count) |
| ObservatoryIngestionService | YES | (internal) | NO | YES (`obs1Ingestion.integration`) | YES | PARTIAL | — |
| Structured Grow survey intake | YES (`company-observatory/intake.ts`) | YES (`GrowIntake`) | YES (portal `grow-survey` runtime) | YES (`growResearch.integration`, `portalGrowSurvey.integration`) | YES | YES | — |
| Grow research run (corpus, diagnosis, gate) | YES (`company-growth/research/service.ts`) | YES (`GrowJourney`) | NO | YES (`growResearch.integration`) | YES | YES (workforce) | — |
| ProblemDomain / DiagnosisCandidate / SufficiencyDecision | YES (6/6) | YES | NO | YES (`growResearch`, `observatoryGrowConvergence`) | YES | YES (workforce) | — |
| Evidence corpus + evidence links | YES (verified sources incl. supplied pack) | YES (evidence drawer) | NO | YES | YES | YES (workforce) | — |
| RecommendationCandidate | YES | YES | NO | YES (`growResearch`, `observatoryGrowConvergence`) | YES | YES (workforce) | customer-safe publication missing |
| Human review ACCEPT/DECLINE/REQUEST_MORE_INFO | YES | YES | n/a (internal) | YES | YES | YES | — |
| ImprovementOpportunity | YES | YES | NO | YES | YES | YES | — |
| DevelopmentInitiative handoff | YES (canonical `createInitiative`) | YES | PARTIAL | YES | YES | YES | customer projection |
| Task/work execution linkage | YES | YES | n/a | YES | YES | YES | — |
| OutcomeMeasurement | YES | YES | NO | YES | YES | PARTIAL | customer-safe projection |
| ROI provenance | YES (6/6) | YES ("Hogyan számoltuk?") | NO | YES (`roiEngine`) | n/a (unit) | YES | customer-safe projection |
| Generic Observation → normalized Grow signal | YES (`company-growth/research/observationSignals.ts`, fail-closed) | n/a | n/a | YES (`growObservationSignals`, `observatoryGrowConvergence`) | YES | YES | — |
| Customer Grow journey (`/portal/fejlesztes`) | YES (portal grow projection + survey) | n/a | PARTIAL | PARTIAL (`portalGrowSurvey.integration`) | YES | PARTIAL | fuller customer-safe Grow projection over canonical research |
| Process observation loop (model→snapshot→research→review→initiative→snapshot→outcome) | YES | YES | NO | YES (`observatoryGrowConvergence.integration`, demo/vendor suites) | YES | YES (workforce) | — |

## This PR's coherent slice (Observatory → Grow convergence)
- **Fail-closed normalization boundary (mission §6–§9):** new pure module `Backend/src/modules/company-growth/research/observationSignals.ts` owns the single canonical survey-category → problem-domain map and projects canonical `DECLARED_SURVEY` observations into bounded `GrowSignal`s. No new table, no schema change, no persistence.
- **Research consumes the boundary (mission §8):** `research/service.ts` no longer parses source-specific survey payloads or owns the category map; it re-exports the map for compatibility. Measured `ProcessObservationSnapshot` provenance and declared observation provenance still converge downstream without being collapsed.
- **Fail-closed rules:** non-`DECLARED_SURVEY` types, malformed payloads, unknown categories and payloads missing the canonical `GROW_PAIN_INTAKE` marker produce **no** signal (no silent `GENERAL_FLOW` fallback, no raw-payload guessing).
- **Security repair (mission §14):** the canonical survey persistence boundary now validates the optional `processId` against the same client's ACTIVE processes for every caller (previously only the portal path did), and research independently refuses to attach a declared signal to a process outside the client's process set. A forged cross-client `processId` cannot attach.
- **Authoritative PG coverage (mission §10, §12, §13):** `obs1Ingestion.integration.test.ts` is repaired to use real canonical actors and is now CI-wired (`obs1-ingestion`); new `observatoryGrowConvergence.integration.test.ts` proves the golden path, zero automatic downstream creation, the gate/human-review/initiative handoff, idempotency convergence and cross-client isolation (`observatory-grow-convergence`).
- **Workforce visibility (mission §15):** the existing read-only `/clients/:clientId/observatory/sources` route now additively exposes last-run timestamp/status and observation count (no raw payloads, tokens or secrets).

## Remaining (exact continuation)
1. Wire `growWithUsObservationSnapshot.integration` into CI after repairing its pre-existing cross-test timestamp isolation flaw.
2. Repair the stale `demoKftJourney.integration.test.ts` UNMEASURED_COST expectation (pre-existing failure on pristine master) and decide whether it becomes CI-authoritative.
3. Implement the fuller customer-safe Grow projection (`/portal/fejlesztes`: FELTÁRÁS / MIT LÁTUNK? / HOL ÉRDEMES JAVÍTANI? published-only / MIT CSINÁLUNK? / MIT ÉRTÜNK EL?).
4. Live Demo Kft Grow data audit (read-only; never reseed; never touch employee_count).

## Next recommended slice
Compliance typed/adaptive company profile questionnaire.
