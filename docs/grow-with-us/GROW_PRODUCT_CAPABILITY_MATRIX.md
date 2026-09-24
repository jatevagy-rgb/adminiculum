# Grow With Us — Product + Backend + UI Capability Matrix

Audit basis: `origin/master` `b7b62b4e50122dc8de7487f6614047d7730bd6c2` (master has not moved since the audit anchor).
Reconciliation scope: workforce Grow (`/clients/[clientId]/grow`) and customer Grow (`/portal/fejlesztes`).
This matrix maps the canonical model, its backend owner, read/write API, workforce/customer visibility, and the current vs target UI surface. No semantics are fabricated; `MISSING_BACKEND` / `SCHEMA_REQUIRED` are `NO` unless proven.

## Canonical product chain

```
ClientOperatingProfile / ClientFact
  → Observation / ProcessObservationSnapshot
  → BusinessProcess / BusinessProcessStep
  → DiagnosisCandidate
  → ResearchEvidence / EvidenceRecord
  → RecommendationCandidate
  → HUMAN REVIEW
  → ImprovementOpportunity
  → DevelopmentInitiative
  → CompanyMilestone
  → OutcomeMeasurement
```

Questionnaires, assessments and pain intake are input channels into this chain — they are not the product.

## Capability matrix

| MODEL | CANONICAL_OWNER | READ_API | WRITE_API | WORKFORCE_VISIBLE | CUSTOMER_SAFE_PROJECTION | CURRENT_UI_SURFACE | TARGET_UI_SURFACE | MISSING_BACKEND | SCHEMA_REQUIRED |
|---|---|---|---|---|---|---|---|---|---|
| ClientOperatingProfile | `client-company` + `client-workspace/orgCompanyService` | `GET /client-company/clients/:id/operating-profile` | `PUT .../operating-profile` | YES (GrowJourney header) | NO | GrowJourney "Vállalati alapállapot" card | Áttekintés header (profile state + last review) | NO | NO |
| ClientFact | `client-company` + `client-workspace` | `GET .../facts` | `POST .../facts`, `PATCH /facts/:id`, `POST /facts/:id/verify` | YES (workbench known.facts) | NO (hidden facts never projected) | CompanyStateCard / CanonicalStatePanel | Adatforrások (provenance home) | NO | NO |
| FactDefinition | `client-workspace/companyProfileFactCatalog` | via fact DTO (`factDefinition.{key,labelHu}`) | registry (not client-write) | YES (label resolution) | NO | companyFactLabel | Adatforrások label layer | NO | NO |
| FactSubject | `client-workspace` | via fact DTO scope | registry | YES (scope metadata) | NO | workbench facts | Adatforrások | NO | NO |
| ClientFactAnswerState | `client-workspace/companyProfileAnswerService` | via adaptive visibility | via fact mutation | YES (UNKNOWN state) | NO | hasUnknownFacts | Áttekintés unknown-fact notice | NO | NO |
| BusinessProcess | `client-company` | `GET .../processes`, `GET /processes/:id` | `POST .../processes`, `PATCH/DELETE /processes/:id` | YES | YES (safe: id/name/category/steps, no persons) | GrowProcessMap / workbench | Diagnosztika + Adatforrások + Kezdeményezések link | NO | NO |
| BusinessProcessStep | `client-company` | via process DTO | `POST /processes/:id/steps`, `PATCH/DELETE /steps/:id`, `POST /processes/:id/reorder-steps` | YES | YES (name/position/type/system only) | GrowProcessMap | Diagnosztika process map | NO | NO |
| BusinessSystem | `client-company` | `GET .../systems` | `POST/PATCH/DELETE .../systems` | YES | YES (name/category only) | workbench known.systems | Adatforrások | NO | NO |
| Observation | `company-observatory` (ingestion) | `GET .../observatory/survey-intake`, `GET .../observatory/runs/:id/observations` | `POST .../observatory/survey-intake` (idempotent) | YES (workbench observed) | NO raw payload; bounded readback only | ObservationPanel | Adatforrások (provenance) | NO | NO |
| DiscoveryRun | `company-observatory` | via observations (run status) | ingestion only | YES (workbench discoveryRun) | NO | ObservationPanel | Adatforrások | NO | NO |
| ExternalSourceConnection | `company-observatory` | `GET .../observatory/sources` | ingestion only | YES (read-only type/status/last-run/count) | NO | listSources | Adatforrások | NO | NO |
| ProcessObservationSnapshot | `company-growth/observation` | `GET .../processes/:id/observations(/latest)` | `POST .../processes/:id/observations` | YES (measured) | NO (outcome basis only) | ObservationPanel / BeforeAfterTable | Adatforrások + Eredmények basis | NO | NO |
| DiagnosisCandidate | `company-growth/research` | `GET .../grow/diagnostic-workbench` (aggregated) | research run only (no direct write) | YES | NO | DiagnosisPanel | Diagnosztika (first-class worklist) | NO | NO |
| ProblemDomain | `company-growth/research` | via workbench domains | research run | YES | NO | DiagnosisPanel | Diagnosztika | NO | NO |
| ResearchEvidence | `company-growth/research` | `GET .../grow/evidence` | corpus/registry | YES (bounded claim, strength, limits) | NO internals; only curated corpus backing on assessment result | EvidenceSufficiencyPanel | Bizonyítékok worklist + drawer | NO | NO |
| EvidenceRecord | compliance/`client-workspace` | via workbench evidence.records | compliance evidence paths | YES | NO | EvidenceSufficiencyPanel | Bizonyítékok (client-specific) | NO | NO |
| RecommendationCandidate | `company-growth/research` | `GET .../grow/opportunities`, `GET .../grow/opportunities/:id` | `POST .../grow/research-runs`; review `POST .../grow/opportunities/:id/review` | YES (PENDING_REVIEW queue + detail) | NO (never projected) | GrowJourney feed/detail | Döntések (SYSTEM PROPOSES vs HUMAN DECIDES) | NO | NO |
| ImprovementOpportunity | `company-growth` | via opportunity detail + `GET .../grow/opportunities?status=ACCEPTED` | ACCEPT creates it; `POST .../grow/opportunities/:id/start-initiative`; `POST .../grow/opportunities/:id/outcomes` | YES | Only via immutable publication snapshot (`clientImprovementOpportunityPublication`) | GrowJourney accepted-opportunities | Kezdeményezések (linked opportunity) | NO | NO |
| DevelopmentInitiative | `client-company` | `GET .../initiatives`, `GET /initiatives/:id` | `POST .../initiatives`, `PATCH /initiatives/:id` | YES | YES (title/status/targetAt/milestones; no owner persons) | GrowJourney progress | Kezdeményezések (owner/status/target/milestones) | NO | NO |
| CompanyMilestone | `client-company` | `GET .../milestones` | `POST .../milestones`, `PATCH /milestones/:id` | YES | YES (id/title/status/date only) | GrowJourney progress | Kezdeményezések + Eredmények | NO | NO |
| OutcomeMeasurement | `company-growth` | `GET .../grow/outcomes` | `POST .../grow/opportunities/:id/outcomes` | YES (basis + before/after) | YES (MEASURED/CALCULATED/ESTIMATED; ASSUMED filtered) | GrowJourney results | Eredmények (basis-separated) | NO | NO |

## Audit boundaries preserved (verified against current master)

- milestone → Task: no canonical direct relation proven (CompanyMilestone has no task relation). ✅
- milestone → Deadline: no canonical direct relation proven. ✅
- explicit blocker entity: not proven. ✅
- initiative activity timeline: not proven (no timeline table). ✅
- scheduled measurement due dates: not proven. ✅
- synthetic maturity score: forbidden; not present. ✅
- synthetic ROI: forbidden; ROI is provenance-gated (`roiEngine`, `timeSavedIsNotCashSaved`). ✅
- AI confidence score: forbidden; not present. ✅
- automatic human decision: forbidden; RecommendationCandidate is `PENDING_REVIEW` by default and ACCEPT is explicit. ✅

## Publication / authorization boundary (regression-critical)

- `orgGrowService` projects only customer-safe fields; raw `Observation.rawPayload`, `OrganizationPerson` names, `RecommendationCandidate`, `ResearchEvidence` internals, reviewer notes, and unaccepted opportunities are never returned to `/portal/fejlesztes`.
- Customer opportunities come exclusively from `clientImprovementOpportunityPublication` with `status: PUBLISHED`, `revokedAt: null`, and an immutable `clientSafe*` revision.
- Internal diagnostic workbench (`GET .../grow/diagnostic-workbench`) is workforce-only and 403-gated.

## Schema conclusion

`SCHEMA_CHANGE_REQUIRED = NO`. Every canonical model, read path, and write path already exists. The convergence is a UI information-architecture change plus optional read-model projections (no duplicate persistence tables).

## Open PR collision (Phase 0)

- `#363 fix/portal-fejlesztes-ia-refinement` (OPEN) — owns customer Grow IA in `OrgGrowView.tsx`. This branch coordinates with, and does not overwrite, that work.
- `#364`, `#365` — unrelated (copy terminology, document workspace).
