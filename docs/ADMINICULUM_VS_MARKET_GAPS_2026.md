# ADMINICULUM_VS_MARKET_GAPS_2026.md
# Adminiculum vs. Market Gap Analysis Matrix (2026)

This document provides a capability-by-capability evaluation comparing Adminiculum against best-in-class enterprise systems across 28 functional domains.

---

## 1. Capability Gap Analysis Matrix

### 1. CUSTOMER HOME
- **BEST_REFERENCE**: ServiceNow Employee Center / Vanta Trust Center
- **ADMINICULUM_CURRENT_STATE**: Previously focused predominantly on legal matters with sparse cards and a disjointed overview.
- **STATUS**: BEHIND (moving to PARITY in this PR)
- **USER_IMPACT**: Leadership was unable to grasp the full breadth of the firm's engagement across Legal, Grow, and Compliance in under 10 seconds.
- **BUSINESS_IMPACT**: Undervalued client perception; portal appeared as an incomplete legal ticket tracker.
- **TECHNICAL_CAUSE**: `OrgHomeView.tsx` only projected legal matters and general activity; lacked cross-pillar summaries.
- **EXISTING_BUILDING_BLOCK**: `orgHomeService.ts`, `publicationService.ts`, `clientSafeComplianceService.ts`.
- **IMPLEMENT_THIS_PR**: YES (Integrated 7-part homepage hierarchy: Action Center, Legal, Grow, Compliance, Updates, Messages, Company).
- **REMAINING_GAP**: Customizable executive widgets / drag-and-drop dashboard personalization (P2).

---

### 2. ACTION CENTER
- **BEST_REFERENCE**: ServiceNow Universal Request / Vanta Action Items
- **ADMINICULUM_CURRENT_STATE**: `ClientActionRequest` was rendered only inside a secondary matter view or lower down the homepage; lacked unified cross-pillar aggregation.
- **STATUS**: BEHIND (moving to PARITY in this PR)
- **USER_IMPACT**: Clients had to click through individual matters or views to find out what was waiting on them.
- **BUSINESS_IMPACT**: Slower client response times and delayed project/case milestones.
- **TECHNICAL_CAUSE**: Action center did not aggregate canonical customer-action items at the top of the portal.
- **EXISTING_BUILDING_BLOCK**: `ClientActionRequest` model, `orgHomeService.actions`, and portal-answerable compliance questions.
- **IMPLEMENT_THIS_PR**: YES (Unified "AMI MOST ÖNTŐL KELL" at top of home).
- **REMAINING_GAP**: Automated SMS / push notifications for urgent customer deadlines (P2).

---

### 3. LEGAL MATTER VISIBILITY
- **BEST_REFERENCE**: Thomson Reuters HighQ / Clio for Clients
- **ADMINICULUM_CURRENT_STATE**: Solid canonical milestone model (`safeMilestones`, `Eddig → Most → Következő lépés`) and published updates.
- **STATUS**: PARITY
- **USER_IMPACT**: Clients can see case stages, next steps, and published filings without calling the firm.
- **BUSINESS_IMPACT**: High transparency and trust in active legal proceedings.
- **TECHNICAL_CAUSE**: Full canonical integration via `ClientMatterPublication` and `CaseCollaborator`.
- **EXISTING_BUILDING_BLOCK**: `ClientMatterPublication`, `organizationalCaseService.ts`.
- **IMPLEMENT_THIS_PR**: YES (Clean `/portal/ugyek` view and streamlined matter cards).
- **REMAINING_GAP**: Interactive visual Gantt chart view for complex litigation (P2).

---

### 4. PROCESS VISIBILITY
- **BEST_REFERENCE**: Celonis Process Explorer / SAP Signavio Process Manager
- **ADMINICULUM_CURRENT_STATE**: `BusinessProcess` records existed in the database, but were completely absent from the client portal.
- **STATUS**: BEHIND (moving to PARITY in this PR)
- **USER_IMPACT**: Client executives could not see which operational business processes were cataloged or under review.
- **BUSINESS_IMPACT**: Failure to demonstrate the "Grow With Us" digitalization advisory value.
- **TECHNICAL_CAUSE**: Missing customer-safe portal projection for `BusinessProcess`.
- **EXISTING_BUILDING_BLOCK**: `BusinessProcess` and `BusinessProcessStep` models in Prisma.
- **IMPLEMENT_THIS_PR**: YES (Surfacing processes in Grow portal `/portal/fejlesztes`).
- **REMAINING_GAP**: Live process mining event-stream visualization (P2).

---

### 5. PROCESS MAP
- **BEST_REFERENCE**: SAP Signavio / Nintex Promapp
- **ADMINICULUM_CURRENT_STATE**: Absent from customer portal.
- **STATUS**: BEHIND (moving to PARITY in this PR)
- **USER_IMPACT**: Clients could not visualize the sequential stages of their core business processes.
- **BUSINESS_IMPACT**: Reliance on verbal presentations or offline PDFs instead of an interactive digital cockpit.
- **TECHNICAL_CAUSE**: Frontend had no step-sequence component.
- **EXISTING_BUILDING_BLOCK**: `BusinessProcessStep` ordered by `position`.
- **IMPLEMENT_THIS_PR**: YES (Horizontal process step sequence with approval flags and system badges).
- **REMAINING_GAP**: Complex branching / BPMN 2.0 gateway rendering (not relevant for high-level business executives).

---

### 6. PROCESS BOTTLENECKS
- **BEST_REFERENCE**: Celonis / Appian Process HQ
- **ADMINICULUM_CURRENT_STATE**: Captured internally in diagnosis candidates and findings, but not visible on the portal.
- **STATUS**: BEHIND (moving to PARTIAL in this PR)
- **USER_IMPACT**: Clients could not see which specific process steps suffered from delay or friction.
- **BUSINESS_IMPACT**: Lower appreciation of why a development initiative is necessary.
- **TECHNICAL_CAUSE**: Step waiting times and current status annotations were not projected to the portal.
- **EXISTING_BUILDING_BLOCK**: `BusinessProcessStep.estimatedWaitingMinutes` and active initiative links.
- **IMPLEMENT_THIS_PR**: YES (Indicating active problem areas on the process step map).
- **REMAINING_GAP**: Automated root-cause statistical clustering (P2).

---

### 7. DEVELOPMENT OPPORTUNITIES
- **BEST_REFERENCE**: Celonis Transformation Center
- **ADMINICULUM_CURRENT_STATE**: `ImprovementOpportunity` model exists in database, but lacks an explicit customer-safe publication flag.
- **STATUS**: PARTIAL
- **USER_IMPACT**: Internal opportunities cannot be exposed en masse without risking client confusion over unapproved suggestions.
- **BUSINESS_IMPACT**: Legal/operational doctrine requires human attorney approval before recommending actions to a client.
- **TECHNICAL_CAUSE**: `ImprovementOpportunity` lacks a `publishedToClient` boolean field in the current schema.
- **EXISTING_BUILDING_BLOCK**: `ImprovementOpportunity`, `RecommendationCandidate`.
- **IMPLEMENT_THIS_PR**: NO (Honoring Correction 2: `GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP=YES`; preserving internal boundary without speculative schema change).
- **REMAINING_GAP**: Add explicit `publicationStatus` to `ImprovementOpportunity` in future schema revision (P1).

---

### 8. DEVELOPMENT INITIATIVES
- **BEST_REFERENCE**: Appian / ServiceNow SPM
- **ADMINICULUM_CURRENT_STATE**: `DevelopmentInitiative` model exists and is projected safely via `projectCompanyOverviewForCustomer`.
- **STATUS**: PARITY
- **USER_IMPACT**: Clients can see agreed development initiatives, target dates, and progress stages.
- **BUSINESS_IMPACT**: Proves ongoing partnership and business transformation progress.
- **TECHNICAL_CAUSE**: Existing projector in `src/modules/client-company/projector.ts`.
- **EXISTING_BUILDING_BLOCK**: `DevelopmentInitiative`, `CompanyMilestone`.
- **IMPLEMENT_THIS_PR**: YES (Surfaced prominently in `/portal/fejlesztes`).
- **REMAINING_GAP**: Resource capacity and sprint burn-down tracking (P2).

---

### 9. INTERVENTION TRACKING
- **BEST_REFERENCE**: ProcessMaker / Nintex Workflow
- **ADMINICULUM_CURRENT_STATE**: Initiatives are linked to Cases and Milestones, showing responsible sides.
- **STATUS**: PARITY
- **USER_IMPACT**: Transparency on whether an intervention is in planning, execution, or completion.
- **BUSINESS_IMPACT**: Seamless accountability between client and firm.
- **TECHNICAL_CAUSE**: Canonical status enum (`PLANNED`, `ACTIVE`, `COMPLETED`, `HOLD`).
- **EXISTING_BUILDING_BLOCK**: `DevelopmentInitiative.status`.
- **IMPLEMENT_THIS_PR**: YES.
- **REMAINING_GAP**: Live webhook notifications on intervention status changes (P2).

---

### 10. OUTCOME MEASUREMENT
- **BEST_REFERENCE**: Celonis Value Realization / Power BI
- **ADMINICULUM_CURRENT_STATE**: `OutcomeMeasurement` model exists with strict basis enums (`MEASURED`, `CALCULATED`, `ESTIMATED`, `ASSUMED`).
- **STATUS**: AHEAD on evidence doctrine; BEHIND on UI exposure.
- **USER_IMPACT**: Truthful demonstration of tangible improvements without fabricated ROI figures.
- **BUSINESS_IMPACT**: Builds immense trust by refusing to convert rough time savings into deceptive cash ROI.
- **TECHNICAL_CAUSE**: Absence of customer portal projection for `OutcomeMeasurement`.
- **EXISTING_BUILDING_BLOCK**: `OutcomeMeasurement` model in Prisma.
- **IMPLEMENT_THIS_PR**: YES (Truthful "Mit értünk el?" section distinguishing Mért vs Számított; hiding ASSUMED).
- **REMAINING_GAP**: Automated chart generation for time-series before/after benchmarks (P1).

---

### 11. COMPANY DIGITAL TWIN
- **BEST_REFERENCE**: Celonis Digital Twin / ServiceNow CMDB
- **ADMINICULUM_CURRENT_STATE**: Very narrow: only employee count, headline, and basic groups.
- **STATUS**: BEHIND (moving to PARITY in this PR)
- **USER_IMPACT**: Client saw an empty "Vállalat" tab that felt like an incomplete form.
- **BUSINESS_IMPACT**: Undermined perception of Adminiculum's comprehensive organizational knowledge.
- **TECHNICAL_CAUSE**: `getOrganizationalCompany` only queried groups and initiatives; omitted processes, systems, and facts.
- **EXISTING_BUILDING_BLOCK**: `ClientOrganizationGroup`, `BusinessProcess`, `BusinessSystem`, `ClientFact`.
- **IMPLEMENT_THIS_PR**: YES (Enriched `/portal/vallalat` with organization units, known systems, known processes, and company facts).
- **REMAINING_GAP**: Visual interactive org-chart hierarchy diagram (P2).

---

### 12. ORGANIZATION STRUCTURE
- **BEST_REFERENCE**: Nintex Promapp / Workday
- **ADMINICULUM_CURRENT_STATE**: `ClientOrganizationGroup` maps units and parent/child groups.
- **STATUS**: PARITY
- **USER_IMPACT**: Clear categorization of legal matters and processes by company department.
- **BUSINESS_IMPACT**: Clean department-level accountability.
- **TECHNICAL_CAUSE**: `ClientOrganizationGroup` with workspace scoping.
- **EXISTING_BUILDING_BLOCK**: `orgCompanyService.ts`.
- **IMPLEMENT_THIS_PR**: YES (Surfaced on Company tab).
- **REMAINING_GAP**: Departmental budget tracking (P2).

---

### 13. SYSTEM LANDSCAPE
- **BEST_REFERENCE**: ServiceNow / LeanIX
- **ADMINICULUM_CURRENT_STATE**: `BusinessSystem` persisted in PostgreSQL, but never exposed to client.
- **STATUS**: BEHIND (moving to PARITY in this PR)
- **USER_IMPACT**: Clients could not see which enterprise software systems were mapped to their processes.
- **BUSINESS_IMPACT**: Weak technological credibility.
- **TECHNICAL_CAUSE**: No customer-safe projection.
- **EXISTING_BUILDING_BLOCK**: `BusinessSystem` model.
- **IMPLEMENT_THIS_PR**: YES (Surfaced in both Grow process maps and Company view).
- **REMAINING_GAP**: Automated IT asset discovery sync (P2).

---

### 14. COMPLIANCE OVERVIEW
- **BEST_REFERENCE**: Vanta / Drata
- **ADMINICULUM_CURRENT_STATE**: Backend read model existed (`clientSafeComplianceService.ts`), but was completely absent from frontend navigation and pages.
- **STATUS**: BEHIND in UI (moving to PARITY in this PR)
- **USER_IMPACT**: Clients could not see their compliance status across statutory domains (GDPR, Munkavédelem, Pénzmosás, etc.).
- **BUSINESS_IMPACT**: Clients felt compliance was an opaque black-box handled offline.
- **TECHNICAL_CAUSE**: Frontend lacked routes and views for `/portal/megfeleles`.
- **EXISTING_BUILDING_BLOCK**: `clientSafeComplianceService.ts`, `safeTopicRegistry.ts`.
- **IMPLEMENT_THIS_PR**: YES (Complete `/portal/megfeleles` portal view with truthful status categories).
- **REMAINING_GAP**: Automated recurring audit scheduling (P2).

---

### 15. COMPLIANCE ACTIONS & REMEDIATION
- **BEST_REFERENCE**: Hyperproof / LogicGate
- **ADMINICULUM_CURRENT_STATE**: Handled via internal proposals and tasks; client can answer discovery questions.
- **STATUS**: PARITY
- **USER_IMPACT**: Client can directly answer missing compliance facts to close regulatory gaps.
- **BUSINESS_IMPACT**: Accelerates compliance gap closure.
- **TECHNICAL_CAUSE**: `companyProfileAnswerService.ts`.
- **EXISTING_BUILDING_BLOCK**: `companyProfileQuestionRegistry.ts`.
- **IMPLEMENT_THIS_PR**: YES (Direct "Hiányzó adat megadása" buttons on compliance cards).
- **REMAINING_GAP**: Bulk multi-question questionnaire wizard (P2).

---

### 16. EVIDENCE / PROVENANCE
- **BEST_REFERENCE**: Drata / Hyperproof
- **ADMINICULUM_CURRENT_STATE**: Strong legal provenance ("Mi alapján?": statutory citations, client facts, verified documents).
- **STATUS**: AHEAD (grounded in Hungarian and EU legal codices, not synthetic checklists).
- **USER_IMPACT**: Client understands exact legal authority and reason for every requirement.
- **BUSINESS_IMPACT**: High legal credibility; withstands regulatory inspection.
- **TECHNICAL_CAUSE**: `RequirementCitation` and `RequirementApplicabilityFact`.
- **EXISTING_BUILDING_BLOCK**: `RequirementCitation`, `RequirementApplicabilityFact`.
- **IMPLEMENT_THIS_PR**: YES (Surfaced on compliance cards).
- **REMAINING_GAP**: Direct deep-linking to official national legislation gazettes (Nemzeti Jogszabálytár) (P1).

---

### 17. REGULATORY CHANGE
- **BEST_REFERENCE**: OneTrust Regulatory Research / Thomson Reuters Regulatory Intelligence
- **ADMINICULUM_CURRENT_STATE**: Requirement versions track legal changes internally; not yet projected as a public change feed.
- **STATUS**: PARTIAL
- **USER_IMPACT**: Clients rely on firm updates rather than an automated legislative tracker.
- **BUSINESS_IMPACT**: Legal service remains personal and relationship-driven.
- **TECHNICAL_CAUSE**: No public regulatory change feed service.
- **EXISTING_BUILDING_BLOCK**: `RequirementVersion.effectiveFrom`.
- **IMPLEMENT_THIS_PR**: PARTIAL (Projected in "Legutóbbi változások" section).
- **REMAINING_GAP**: Real-time legal change alerts / parliamentary monitor integration (P2).

---

### 18. MESSAGES & COMMUNICATION
- **BEST_REFERENCE**: Clio for Clients / HighQ
- **ADMINICULUM_CURRENT_STATE**: Structured question threads per matter (`listCustomerThreads`) and active mailbox integration in PR #219.
- **STATUS**: PARITY
- **USER_IMPACT**: Secure, matter-correlated communication without loose emails.
- **BUSINESS_IMPACT**: High confidentiality and auditability.
- **TECHNICAL_CAUSE**: `client-interaction` and `communications` modules.
- **EXISTING_BUILDING_BLOCK**: `questionService.ts`, `ClientQuestionThread`.
- **IMPLEMENT_THIS_PR**: YES (Preserved cleanly; parallel ownership respected).
- **REMAINING_GAP**: Mobile push notifications (P2).

---

### 19. DOCUMENTS
- **BEST_REFERENCE**: HighQ Document Vault / NetDocuments
- **ADMINICULUM_CURRENT_STATE**: Robust SharePoint-backed publication system (`listPortalDocuments`, `authorizePortalDocumentDownload`).
- **STATUS**: PARITY
- **USER_IMPACT**: Client can securely download published contracts, filings, and analysis documents.
- **BUSINESS_IMPACT**: Secure document delivery without email attachments.
- **TECHNICAL_CAUSE**: `publicationService.ts` and `documents/services.ts`.
- **EXISTING_BUILDING_BLOCK**: `ClientDocumentPublication`, `DocumentVersion`.
- **IMPLEMENT_THIS_PR**: YES (Preserved and integrated into overview).
- **REMAINING_GAP**: In-browser PDF redaction and signing integration (P2).

---

### 20. CLIENT SELF SERVICE
- **BEST_REFERENCE**: Clio for Clients / HighQ
- **ADMINICULUM_CURRENT_STATE**: Intake creation, document uploads, and company fact answering.
- **STATUS**: PARITY
- **USER_IMPACT**: Clients can initiate requests, submit files, and update corporate information anytime.
- **BUSINESS_IMPACT**: Lower administrative burden on law firm paralegals.
- **TECHNICAL_CAUSE**: `intakeService.ts` and `companyProfileAnswerService.ts`.
- **EXISTING_BUILDING_BLOCK**: `intakeService.ts`.
- **IMPLEMENT_THIS_PR**: YES (Preserved).
- **REMAINING_GAP**: Self-service contract generation wizard for clients (P2).

---

### 21. WORKFLOW & AUTOMATION VISIBILITY
- **BEST_REFERENCE**: Appian / Nintex
- **ADMINICULUM_CURRENT_STATE**: Milestone publication shows high-level workflow steps; internal BPMN engine hidden.
- **STATUS**: PARITY (appropriate for client portal; clients should not see internal task assignments).
- **USER_IMPACT**: Safe, understandable workflow progress without internal noise.
- **BUSINESS_IMPACT**: Client feels informed without micromanaging internal legal staff.
- **TECHNICAL_CAUSE**: Explicit publication gating.
- **EXISTING_BUILDING_BLOCK**: `safeMilestones`.
- **IMPLEMENT_THIS_PR**: YES.
- **REMAINING_GAP**: Interactive client approval on milestone gates (P1).

---

### 22. INTEGRATIONS
- **BEST_REFERENCE**: Celonis / Vanta
- **ADMINICULUM_CURRENT_STATE**: External data source connections exist (`ExternalSourceConnection`, `DiscoveryRun`), but internal only.
- **STATUS**: PARTIAL
- **USER_IMPACT**: Clients see which systems are mapped, but cannot self-configure connectors.
- **BUSINESS_IMPACT**: Firm provides managed integration setup rather than self-service SaaS.
- **TECHNICAL_CAUSE**: Integrations are configured by Adminiculum engineers/lawyers.
- **EXISTING_BUILDING_BLOCK**: `ExternalSourceConnection`.
- **IMPLEMENT_THIS_PR**: PARTIAL (System presence surfaced in Digital Twin).
- **REMAINING_GAP**: Self-service OAuth app marketplace for clients (P3).

---

### 23. AI ASSISTANCE
- **BEST_REFERENCE**: Harvey AI / CoCounsel / Vanta AI
- **ADMINICULUM_CURRENT_STATE**: Internal AI prompt handoff pipelines; strictly human-in-the-loop before client exposure.
- **STATUS**: AHEAD on safety and legal liability; BEHIND on client-facing chatbot gimmicks.
- **USER_IMPACT**: No hallucinated legal advice given directly to clients. Every recommendation is attorney-approved.
- **BUSINESS_IMPACT**: Zero professional negligence exposure.
- **TECHNICAL_CAUSE**: Strict human review gate (`RecommendationCandidate` $\to$ human review).
- **EXISTING_BUILDING_BLOCK**: Evidence doctrine.
- **IMPLEMENT_THIS_PR**: PRESERVED (Strict adherence to human approval).
- **REMAINING_GAP**: Controlled client-facing natural language search over published client documents (P2).

---

### 24. AUDITABILITY & EXTERNAL COLLABORATION
- **BEST_REFERENCE**: HighQ / AuditBoard
- **ADMINICULUM_CURRENT_STATE**: Strict workspace scoping, immutable audit trail, grant validity windows.
- **STATUS**: PARITY
- **USER_IMPACT**: Strict isolation between client tenants and within corporate departments.
- **BUSINESS_IMPACT**: Full GDPR, bar association, and ISO 27001 compliance.
- **TECHNICAL_CAUSE**: `ClientPortalWorkspaceMembership`, `ClientPortalGrant`.
- **EXISTING_BUILDING_BLOCK**: `workspaceService.ts`, `leadershipSummaryService.ts`.
- **IMPLEMENT_THIS_PR**: YES (Enforced and proven with PostgreSQL isolation tests).
- **REMAINING_GAP**: Client-accessible audit log export (P2).

---

### 25. RESPONSIVE / MOBILE UX
- **BEST_REFERENCE**: Clio for Clients
- **ADMINICULUM_CURRENT_STATE**: Mobile-responsive Next.js shell with responsive navigation and grid layouts.
- **STATUS**: PARITY
- **USER_IMPACT**: Flawless experience on executive smartphones and tablets.
- **BUSINESS_IMPACT**: 24/7 engagement from corporate decision-makers.
- **TECHNICAL_CAUSE**: Tailwind CSS responsive utility classes (`sm:`, `md:`, `lg:`).
- **EXISTING_BUILDING_BLOCK**: `ClientPortalShell.tsx`.
- **IMPLEMENT_THIS_PR**: YES (Refined navigation bar and mobile cards).
- **REMAINING_GAP**: Native iOS/Android apps with biometric face ID login (P2).

---

## 2. ADMINICULUM_STRUCTURAL_ADVANTAGES

Adminiculum possesses four decisive structural advantages over pure SaaS point solutions:

1. **The Unified Triad (Legal + Digital Transformation + Compliance in One Cockpit)**:
   - Competitors are siloed: Clio handles legal matters; Celonis handles process mining; Vanta handles compliance controls.
   - Adminiculum unites all three within a single client relationship. When a compliance review identifies an outdated supplier data agreement, Adminiculum's Grow engine tracks the process friction, and Adminiculum's Legal team drafts and executes the amendment. This creates unmatched operational velocity.

2. **Grounded Legal Evidence Doctrine vs. Synthetic SaaS Scoring**:
   - GRC platforms routinely display arbitrary "87% Compliant" scores based on superficial webhook tests, creating dangerous false confidence.
   - Adminiculum rejects fake percentages. Every compliance topic is grounded in verified Hungarian/EU statutes, confirmed client facts, and human legal review. If information is missing, the portal states truthfully: "További információ szükséges."

3. **Integrated Observer Pipeline (`Observation → Pattern → Finding → Opportunity → Initiative → Task → Outcome`)**:
   - Adminiculum possesses an end-to-end telemetry and improvement ontology where real system observations translate into human-approved development initiatives and measurable outcomes.

4. **Human-in-the-Loop Liability Shield**:
   - In enterprise legal and regulatory domains, unvalidated AI output is toxic. Adminiculum ensures that every customer-visible recommendation, finding, and legal document is verified by licensed practitioners, protecting the client from regulatory penalties.
