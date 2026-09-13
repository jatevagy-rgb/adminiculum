# CLIENT_PORTAL_MARKET_BENCHMARK_2026.md
# Adminiculum Client Portal 2.0 — Market Benchmark Report (2026)

## Executive Summary
This benchmark evaluates publicly observable product structures, information architectures, UX hierarchies, and action patterns across sixteen (16) best-in-class solutions in three core domains:
1. **Digital Transformation / Process Intelligence**: Celonis, SAP Signavio, Nintex, Appian, ServiceNow, ProcessMaker, Kissflow, Microsoft Power Platform.
2. **Compliance / Governance, Risk & Compliance (GRC)**: Vanta, Drata, Hyperproof, AuditBoard, LogicGate, OneTrust.
3. **Legal Client Portals**: Thomson Reuters HighQ, Clio for Clients.

The purpose is not visual replication or proprietary extraction, but adapting proven product patterns into Adminiculum’s existing canonical data model and legal-grade evidence doctrine.

---

## 1. Digital Transformation / Process Intelligence

### Competitor 1: Celonis
- **COMPETITOR**: Celonis (Execution Management System / Process Mining)
- **CATEGORY**: DIGITAL TRANSFORMATION / PROCESS INTELLIGENCE
- **PUBLIC_SOURCE**: Celonis Platform Documentation & Product Overview (Celonis EMS / Process Sphere / Action Engine)
- **PUBLIC_SOURCE_URL**: https://www.celonis.com/solutions/process-mining/
- **SOURCE_TYPE**: Official Product Documentation & Architecture Guides
- **OBSERVED_FACT**: Celonis presents a high-level "Transformation Center" that separates observed process flows (Process Explorer/Process Sphere) from business objectives and concrete automated or human tasks (Action Engine). Metrics are tracked over time with before/after comparison snapshots.
- **ADMINICULUM_INFERENCE**: Business users need to see process steps and bottlenecks without getting overwhelmed by raw process mining graph algorithms. Celonis' separation between the process map, the identified opportunity, and the action item translates directly into Adminiculum's Grow loop.
- **OBSERVED_PATTERN**: "Insight → Opportunity → Action → Value Realization" pipeline with process step visualization, system tags (e.g. SAP, Salesforce), and outcome metric tracking.
- **USER_VALUE**: Leadership understands which process has friction, what the bottleneck is, and the measurable business outcome achieved.
- **ADMINICULUM_EQUIVALENT**: `BusinessProcess` + `BusinessProcessStep` + `BusinessSystem` + `ImprovementOpportunity` + `DevelopmentInitiative` + `OutcomeMeasurement`.
- **ADMINICULUM_STATUS**: PARTIAL
- **REUSABLE_FOUNDATION**: Canonical backend models `BusinessProcess`, `BusinessProcessStep`, `BusinessSystem`, `OutcomeMeasurement` already exist in Prisma.
- **GAP**: Backend models lacked customer-safe portal projections; the portal had zero Grow visibility.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

### Competitor 2: SAP Signavio
- **COMPETITOR**: SAP Signavio (Process Transformation Suite)
- **CATEGORY**: DIGITAL TRANSFORMATION / PROCESS INTELLIGENCE
- **PUBLIC_SOURCE**: SAP Signavio Process Collaboration Hub Documentation
- **PUBLIC_SOURCE_URL**: https://help.sap.com/docs/signavio-process-manager
- **SOURCE_TYPE**: Public User Guide & Product Specification
- **OBSERVED_FACT**: SAP Signavio Process Collaboration Hub allows non-technical business users to view approved business process diagrams, major process milestones, associated IT systems, and organizational units in an interactive horizontal step layout.
- **ADMINICULUM_INFERENCE**: Business customers do not want BPMN 2.0 XML editors; they need a readable sequence of steps (e.g. Beszerzés → Jogi ellenőrzés → Pénzügy → Jóváhagyás) annotated with systems and current bottlenecks.
- **OBSERVED_PATTERN**: Horizontal step sequence flow with system badges, current state annotations, and initiative links.
- **USER_VALUE**: Clear operational visibility into how core workflows operate and where Adminiculum interventions are active.
- **ADMINICULUM_EQUIVALENT**: `BusinessProcess` sequence with `BusinessProcessStep` and `BusinessSystem`.
- **ADMINICULUM_STATUS**: BEHIND (was absent in client portal)
- **REUSABLE_FOUNDATION**: `BusinessProcessStep` table with `position`, `name`, `stepType`, `isApproval`, `systemId`.
- **GAP**: Customer portal did not expose any process map or step view.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

### Competitor 3: Nintex
- **COMPETITOR**: Nintex (Nintex Promapp & Workflow)
- **CATEGORY**: DIGITAL TRANSFORMATION / PROCESS INTELLIGENCE
- **PUBLIC_SOURCE**: Nintex Promapp Public Product Guide
- **PUBLIC_SOURCE_URL**: https://help.nintex.com/en-US/promapp/
- **SOURCE_TYPE**: Public Documentation
- **OBSERVED_FACT**: Promapp displays simple, plain-text process maps organized by departments/business areas with explicit RACI responsibilities and simple feedback/change requests from business users.
- **ADMINICULUM_INFERENCE**: Process clarity comes from simplicity: clear titles, department ownership (without exposing individual employee private records), and plain language descriptions.
- **OBSERVED_PATTERN**: Departmental process breakdown with role-based ownership and visible change suggestions.
- **USER_VALUE**: Allows organizational clients to see process ownership at the organizational unit level without administrative clutter.
- **ADMINICULUM_EQUIVALENT**: `BusinessProcess.organizationGroupId` linked to `ClientOrganizationGroup`.
- **ADMINICULUM_STATUS**: PARTIAL
- **REUSABLE_FOUNDATION**: `ClientOrganizationGroup` workspace scoping in `client-workspace`.
- **GAP**: Portal did not correlate organizational units with known business processes.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P1

---

### Competitor 4: Appian
- **COMPETITOR**: Appian (Process HQ & Case Management)
- **CATEGORY**: DIGITAL TRANSFORMATION / PROCESS INTELLIGENCE
- **PUBLIC_SOURCE**: Appian Process HQ Documentation
- **PUBLIC_SOURCE_URL**: https://docs.appian.com/suite/help/latest/process-hq.html
- **SOURCE_TYPE**: Public Technical Documentation
- **OBSERVED_FACT**: Appian Process HQ unifies process insights with case execution, presenting an executive dashboard that links operational bottlenecks directly to active case investigations and remediation workflows.
- **ADMINICULUM_INFERENCE**: Adminiculum's unique strength is having legal case management and process improvement in the exact same platform. The customer should see which legal matters correspond to operational development initiatives.
- **OBSERVED_PATTERN**: Unified insight-to-case linkage: bottleneck identified → development initiative initiated → related legal matter opened.
- **USER_VALUE**: Seamless tracking of how legal problem-solving resolves operational bottlenecks.
- **ADMINICULUM_EQUIVALENT**: `DevelopmentInitiative.caseId` linked to `Case`.
- **ADMINICULUM_STATUS**: AHEAD (backend model links initiatives directly to cases, unlike point solutions).
- **REUSABLE_FOUNDATION**: `DevelopmentInitiative` model relation to `Case` and `ClientMatterPublication`.
- **GAP**: Linkage was invisible on the customer portal UI.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

### Competitor 5: ServiceNow
- **COMPETITOR**: ServiceNow (Strategic Portfolio Management & Universal Request)
- **CATEGORY**: DIGITAL TRANSFORMATION / PROCESS INTELLIGENCE
- **PUBLIC_SOURCE**: ServiceNow Product Documentation — Employee Center & SPM
- **PUBLIC_SOURCE_URL**: https://docs.servicenow.com/bundle/washingtondc-it-service-management/page/product/universal-request/concept/universal-request.html
- **SOURCE_TYPE**: Enterprise Documentation
- **OBSERVED_FACT**: ServiceNow’s Employee/Customer Portal places "Action Items" at the top of the homepage, followed by status tracking of active requests, initiative milestones, and knowledge bases.
- **ADMINICULUM_INFERENCE**: Attention-first hierarchy is the undisputed enterprise standard. The customer’s primary question on login is "What needs my attention right now?".
- **OBSERVED_PATTERN**: Homepage hierarchy: (1) My Tasks / Action Required, (2) Active Requests / Initiatives, (3) System Status & Knowledge.
- **USER_VALUE**: Immediate clarity on pending obligations without browsing multiple menus.
- **ADMINICULUM_EQUIVALENT**: Top-level "AMI MOST ÖNTŐL KELL" section in `OrgHomeView`.
- **ADMINICULUM_STATUS**: BEHIND (previous home had scattered action cards with weak hierarchy).
- **REUSABLE_FOUNDATION**: `orgHomeService.ts` customer action projection.
- **GAP**: Action requests were displayed below matters and did not aggregate cross-domain customer obligations.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

### Competitor 6: ProcessMaker
- **COMPETITOR**: ProcessMaker
- **CATEGORY**: DIGITAL TRANSFORMATION / PROCESS INTELLIGENCE
- **PUBLIC_SOURCE**: ProcessMaker 4 User Guide
- **PUBLIC_SOURCE_URL**: https://www.processmaker.com/platform/
- **SOURCE_TYPE**: Public Documentation & Demo Guides
- **OBSERVED_FACT**: ProcessMaker distinguishes human approval/input steps from automated steps and shows clear waiting states ("Waiting on Customer" vs "Waiting on Internal Review").
- **ADMINICULUM_INFERENCE**: Customers must never wonder whose turn it is. Explicit responsibility indication ("Felelős oldal: Ügyfél" vs "Felelős oldal: Adminiculum") prevents friction.
- **OBSERVED_PATTERN**: "Responsible side" tagging on every active initiative and step.
- **USER_VALUE**: Absolute transparency on whether the client or the firm holds the ball.
- **ADMINICULUM_EQUIVALENT**: `waitingOn` / `relationshipToCase` / `responsibleSide` metadata.
- **ADMINICULUM_STATUS**: PARITY
- **REUSABLE_FOUNDATION**: `OrgHomeMatterRow.waitingOn` and `ClientActionRequest`.
- **GAP**: Missing from development initiatives and compliance topics.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

### Competitor 7: Kissflow & Microsoft Power Platform
- **COMPETITOR**: Kissflow / Microsoft Power Platform
- **CATEGORY**: DIGITAL TRANSFORMATION / PROCESS INTELLIGENCE
- **PUBLIC_SOURCE**: Power Automate & Kissflow Public Help Portals
- **PUBLIC_SOURCE_URL**: https://learn.microsoft.com/en-us/power-platform/
- **SOURCE_TYPE**: Public Documentation
- **OBSERVED_FACT**: Both platforms emphasize integration visibility: displaying which external systems (ERP, CRM, email) are connected to a business process.
- **ADMINICULUM_INFERENCE**: Showing connected business systems provides the client with a real "digital twin" of their operation rather than just abstract text.
- **OBSERVED_PATTERN**: Business system catalog linked to processes and departments.
- **USER_VALUE**: Client sees their technological landscape mapped to legal and operational processes.
- **ADMINICULUM_EQUIVALENT**: `BusinessSystem` model linked to `BusinessProcessStep`.
- **ADMINICULUM_STATUS**: PARTIAL
- **REUSABLE_FOUNDATION**: `BusinessSystem` in Prisma.
- **GAP**: `BusinessSystem` was not surfaced in the portal.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P1

---

## 2. Compliance / GRC (Governance, Risk & Compliance)

### Competitor 8: Vanta
- **COMPETITOR**: Vanta
- **CATEGORY**: COMPLIANCE / GRC
- **PUBLIC_SOURCE**: Vanta Trust Center & Compliance Dashboard Public Documentation
- **PUBLIC_SOURCE_URL**: https://www.vanta.com/product/trust-center
- **SOURCE_TYPE**: Public Marketing & Technical Guides
- **OBSERVED_FACT**: Vanta uses an attention-first dashboard grouping controls and issues into: "Needs Attention", "In Progress", and "Passing/Complete". However, Vanta frequently displays pseudo-precise completion percentages (e.g. "87% Complete") based on automated integration checks.
- **ADMINICULUM_INFERENCE**: Adopt the attention-first categorization ("Teendőt igényel", "Folyamatban", "Jelenleg nincs Öntől várt teendő"), but REJECT fake percentage scores. Legal compliance is not a percentage game.
- **OBSERVED_PATTERN**: Four-tier status grouping: Action Needed, In Progress, No Action Required, Recent Changes.
- **USER_VALUE**: Client immediately sees where they must upload a document or provide an answer, without being misled by an arbitrary score.
- **ADMINICULUM_EQUIVALENT**: `clientSafeComplianceService.ts` topic state projection.
- **ADMINICULUM_STATUS**: AHEAD on evidence doctrine (truthful absence of fake scores); BEHIND on portal UI exposure.
- **REUSABLE_FOUNDATION**: `safeTopicRegistry.ts` and `clientSafeComplianceService.ts`.
- **GAP**: Compliance read model was completely missing from the client portal frontend navigation and views.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

### Competitor 9: Drata
- **COMPETITOR**: Drata
- **CATEGORY**: COMPLIANCE / GRC
- **PUBLIC_SOURCE**: Drata Compliance Automation Platform Documentation
- **PUBLIC_SOURCE_URL**: https://drata.com/platform
- **SOURCE_TYPE**: Public Platform Overview
- **OBSERVED_FACT**: Drata emphasizes evidence provenance: for every requirement/control, it shows the source of evidence (connected system, uploaded policy, employee acknowledgment) and audit timestamps.
- **ADMINICULUM_INFERENCE**: Adminiculum’s legal doctrine requires "Mi alapján?" explainability for every compliance item. Grounding topics in statutory requirements and verified facts differentiates Adminiculum from superficial checklist tools.
- **OBSERVED_PATTERN**: Evidence provenance card: "Mi alapján?" showing legal citation, company-provided fact, or verified document.
- **USER_VALUE**: Complete transparency on why a compliance topic is flagged and what law or fact triggered it.
- **ADMINICULUM_EQUIVALENT**: `RequirementCitation` + `RequirementApplicabilityFact` + `safeTopicRegistry`.
- **ADMINICULUM_STATUS**: PARITY
- **REUSABLE_FOUNDATION**: `RequirementApplicabilityFact` and `safeTopicRegistry` short explanations.
- **GAP**: Provenance was not rendered in a customer-friendly format in the portal.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

### Competitor 10: Hyperproof & AuditBoard
- **COMPETITOR**: Hyperproof / AuditBoard
- **CATEGORY**: COMPLIANCE / GRC
- **PUBLIC_SOURCE**: Hyperproof Hypersync Documentation & AuditBoard OpsAudit
- **PUBLIC_SOURCE_URL**: https://hyperproof.io/platform/ & https://www.auditboard.com/
- **SOURCE_TYPE**: Public Product Architecture Whitepapers
- **OBSERVED_FACT**: Both products implement a strict issue remediation loop: Issue Identified → Remediation Plan Created → Task Assigned → Validation & Sign-off. Internal auditor workpapers and privileged legal commentary are strictly sequestered from client/auditee view.
- **ADMINICULUM_INFERENCE**: Assessment findings and legal notes must remain internal by default. Only customer-safe remediation actions and safe topic summaries reach the client.
- **OBSERVED_PATTERN**: Internal workpaper sequestration: only published remediation tasks reach external users.
- **USER_VALUE**: Client sees clear, constructive actions rather than confusing internal legal deliberations or risk severity jargon.
- **ADMINICULUM_EQUIVALENT**: `safeTopicRegistry.ts` boundary preventing raw `AssessmentFinding` exposure.
- **ADMINICULUM_STATUS**: PARITY
- **REUSABLE_FOUNDATION**: `safeTopicRegistry` filtering and projection rules.
- **GAP**: Need explicit test verification that raw internal findings are never exposed.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

### Competitor 11: LogicGate & OneTrust
- **COMPETITOR**: LogicGate (Risk Cloud) & OneTrust (Privacy Management)
- **CATEGORY**: COMPLIANCE / GRC
- **PUBLIC_SOURCE**: LogicGate Risk Cloud & OneTrust Privacy Management Guides
- **PUBLIC_SOURCE_URL**: https://www.logicgate.com/ & https://www.onetrust.com/products/privacy-management/
- **SOURCE_TYPE**: Public Platform Guides
- **OBSERVED_FACT**: OneTrust offers self-service questionnaire modules where clients/vendors can answer compliance discovery questions directly through the portal (e.g. data categories, employee thresholds), which automatically updates applicability.
- **ADMINICULUM_INFERENCE**: The Adminiculum portal must allow clients to directly answer missing company profile facts (e.g. employee count, data retention practices) to resolve "Teendőt igényel" compliance topics.
- **OBSERVED_PATTERN**: In-portal answer submission for missing compliance facts.
- **USER_VALUE**: Closes the loop from missing information to resolution without back-and-forth emails.
- **ADMINICULUM_EQUIVALENT**: `companyProfileAnswerService.ts` (`PUT /api/v1/client-portal/org/company-profile/questions/:key`).
- **ADMINICULUM_STATUS**: PARITY
- **REUSABLE_FOUNDATION**: `companyProfileAnswerService` and `companyProfileQuestionRegistry`.
- **GAP**: Front-end compliance view did not link directly to answerable profile questions.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

## 3. Legal Client Portals

### Competitor 12: Thomson Reuters HighQ
- **COMPETITOR**: Thomson Reuters HighQ
- **CATEGORY**: LEGAL CLIENT PORTALS
- **PUBLIC_SOURCE**: Thomson Reuters HighQ Platform Documentation & Product Guides
- **PUBLIC_SOURCE_URL**: https://legal.thomsonreuters.com/en/products/highq
- **SOURCE_TYPE**: Product Capability Guides
- **OBSERVED_FACT**: HighQ portals provide enterprise matter collaboration with milestone progress bars, secure document exchange, activity timelines, and clear role-based permissions separating external client view from law firm internal files.
- **ADMINICULUM_INFERENCE**: Legal clients need immediate answers to four questions: (1) What is active? (2) What happened? (3) What happens next? (4) Do you need anything from me? HighQ answers these with structured matter cards and milestone states.
- **OBSERVED_PATTERN**: Matter timeline with milestone stages (`Eddig → Most → Következő lépés`), document vault, and action requests.
- **USER_VALUE**: Client can check matter progress 24/7 without needing to telephone the attorney.
- **ADMINICULUM_EQUIVALENT**: `OrgHomeCustomerMatter` with `safeMilestones`, `ClientMatterPublication`, and `ClientActionRequest`.
- **ADMINICULUM_STATUS**: PARITY
- **REUSABLE_FOUNDATION**: `ClientMatterPublication`, `publicationService.ts`, and `organizationalCaseService.ts`.
- **GAP**: Previous portal had sparse layout and missed full integration with the rest of the firm's advisory offerings (Grow and Compliance).
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

### Competitor 13: Clio for Clients
- **COMPETITOR**: Clio for Clients
- **CATEGORY**: LEGAL CLIENT PORTALS
- **PUBLIC_SOURCE**: Clio for Clients Help Center & Mobile App Feature Documentation
- **PUBLIC_SOURCE_URL**: https://www.clio.com/features/client-portal/
- **SOURCE_TYPE**: Public Help Center & Feature Summaries
- **OBSERVED_FACT**: Clio for Clients is designed for extreme clarity on mobile and web: clean, non-cluttered typography, dedicated message threads per matter, simple task checklists for clients (e.g. "Upload ID copy", "Sign contract"), and push updates when a matter progresses.
- **ADMINICULUM_INFERENCE**: Adopt Clio’s clean typography, clear action checklists, and friendly mobile layout. Avoid dense tables or multi-column enterprise cockpit sprawl on small screens.
- **OBSERVED_PATTERN**: Mobile-responsive card hierarchy, matter-focused communication, and unambiguous customer task items.
- **USER_VALUE**: Frictionless access for executives on phones or laptops.
- **ADMINICULUM_EQUIVALENT**: Responsive Next.js App Router portal with Tailwind styling and clear action cards.
- **ADMINICULUM_STATUS**: PARITY
- **REUSABLE_FOUNDATION**: Responsive portal shell in Next.js.
- **GAP**: Mobile layout had some wide containers; needs strict card responsive optimization.
- **IMPLEMENT_NOW**: YES
- **PRIORITY**: P0

---

## 4. Benchmark Pattern Summary Matrix

| Competitor | Pattern Observed | Adminiculum Status | Adopt in Adminiculum? | Priority |
| :--- | :--- | :--- | :--- | :--- |
| **Celonis** | Process step map + identified bottlenecks + outcome tracking | PARTIAL | YES — Adopt horizontal step flow and outcome measurement basis | P0 |
| **SAP Signavio** | Business system badges on process steps | BEHIND | YES — Map `BusinessSystem` to `BusinessProcessStep` | P0 |
| **Nintex** | Organizational unit process categorization | PARTIAL | YES — Group processes by `ClientOrganizationGroup` | P1 |
| **Appian** | Direct linkage of operational bottlenecks to case remediation | AHEAD | YES — Highlight related legal cases on initiatives | P0 |
| **ServiceNow** | Attention-first Action Center at top of homepage | BEHIND | YES — Implement unified "AMI MOST ÖNTŐL KELL" | P0 |
| **ProcessMaker** | Explicit "Responsible side" tagging (Customer vs Firm) | PARITY | YES — Show responsible party on all actions | P0 |
| **Vanta** | 4-tier attention hierarchy (Action, Progress, No Action, Changes) | BEHIND in UI | YES — Replicate 4 categories without fake % scores | P0 |
| **Drata** | Evidence provenance ("Mi alapján?") | PARITY | YES — Expose legal requirement citations and verified facts | P0 |
| **Hyperproof** | Strict segregation of internal audit workpapers from external portal | PARITY | YES — Keep `AssessmentFinding` internal by default | P0 |
| **LogicGate** | In-portal missing fact answering | PARITY | YES — Link missing facts directly to profile inputs | P0 |
| **HighQ** | Matter timeline (`Eddig → Most → Következő lépés`) | PARITY | YES — Retain and polish milestone progression | P0 |
| **Clio** | Clean mobile-first typography and unified action checklist | PARITY | YES — Mobile-responsive layout and typography | P0 |

---

## 5. Summary of Implementation Decisions for Client Portal 2.0
1. **Unified Action Center ("Ami most Öntől kell")**: Extend `orgHomeService.ts` to surface all real canonical customer-action records across Legal, Compliance questions, and active Initiatives.
2. **Grow With Us Customer Journey**: Provide `/portal/fejlesztes` showcasing:
   - *Folyomatok és rendszerek* (Process maps with steps & systems)
   - *Min dolgozunk?* (Active initiatives with stage indicators)
   - *Mit értünk el?* (Outcomes with rigorous basis labels: Mért vs Számított)
   - Note: Raw `ImprovementOpportunity` items without customer publication flags remain internal by default.
3. **Compliance Customer View**: Provide `/portal/megfeleles` with truthful, evidence-backed states (`Teendőt igényel`, `Folyamatban`, `Jelenleg nincs Öntől várt teendő`, `Legutóbbi változások`), zero fake scores, and "Mi alapján?" provenance.
4. **Digital Twin / Company View**: Surface known processes, business systems, organization units, and company facts while preserving employee count at 50 and strictly keeping `OrganizationPerson` data unexposed.
