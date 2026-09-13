# CLIENT_PORTAL_UX_BENCHMARK_2026.md
# Adminiculum Client Portal 2.0 — UI/UX Benchmark Report (2026)

This report analyzes user interface patterns, layout density, interaction hierarchies, and empty-state mechanics across 11 key market benchmarks, defining what Adminiculum must adopt and what it must reject.

---

## 1. Celonis
- **NAVIGATION_PATTERN**: Top-level macro switcher (Data Integration, Process Sphere, Action Engine, Transformation Center) with left-hand sub-navigation.
- **HOME_PATTERN**: Metric-heavy executive dashboard displaying high-level process throughput, active transformation programs, and monetary impact cards.
- **ACTION_PATTERN**: "Action Engine" inbox listing rule-triggered tasks assigned to users or bots.
- **DRILLDOWN_PATTERN**: High-level KPI card $\to$ Process Step Breakdown $\to$ Case Variant Inspector.
- **STATUS_PATTERN**: Variant frequency heatmaps (dark blue to yellow) and status badges (On Track, At Risk, Off Track).
- **EMPTY_STATE_PATTERN**: Generic graph placeholder with "No data ingested for this process model yet" and setup wizard CTA.
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: Sequential step breakdown showing bottlenecks, and clear outcome classification (Mért vs Számított).
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Dense spaghetti process mining graph visualization; multi-million dollar ROI calculation claims without proven evidence.
- **WHY**: Corporate clients want clarity on what needs fixing and what Adminiculum is doing, not an engineer's graph debugger.

---

## 2. SAP Signavio
- **NAVIGATION_PATTERN**: Clean horizontal navigation bar (Home, Process Collaboration Hub, Dictionary, Analytics).
- **HOME_PATTERN**: Departmental entry cards leading into specific process hierarchies.
- **ACTION_PATTERN**: Process change requests and collaborative comments sidebar.
- **DRILLDOWN_PATTERN**: Organization unit $\to$ Process family $\to$ Step-by-step process view $\to$ RACI & IT System details.
- **STATUS_PATTERN**: Standardized BPMN status badges (Draft, In Review, Approved, Deprecated).
- **EMPTY_STATE_PATTERN**: Clean, bounded card indicating "No approved process version published for this organization group."
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: System badges linked to specific process steps, and grouping processes by organization unit.
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Formal BPMN 2.0 diagramming complexity that requires training to decipher.
- **WHY**: Simpler horizontal step chains (Beszerzés $\to$ Jogi ellenőrzés $\to$ Jóváhagyás) communicate far better to executive clients.

---

## 3. Nintex (Promapp)
- **NAVIGATION_PATTERN**: Simple top search bar with process category tree on the left.
- **HOME_PATTERN**: "My Processes" and "Recently Viewed" with immediate role-based ownership.
- **ACTION_PATTERN**: Feedback and review tasks in a dedicated notification drawer.
- **DRILLDOWN_PATTERN**: Plain-text step summary with accordion drawers for work instructions and documents.
- **STATUS_PATTERN**: Under Review, Published, Scheduled for Review.
- **EMPTY_STATE_PATTERN**: Compact text banner with an invite to suggest or document a process.
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: Plain-language process step descriptions and compact accordion-style drilldowns.
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Walls of unformatted text without visual step flow.
- **WHY**: Adminiculum needs visual rhythm (chips, milestones, borders) to balance professional elegance with scannability.

---

## 4. Appian
- **NAVIGATION_PATTERN**: Unified enterprise navigation bar linking Portals, Cases, and Tasks.
- **HOME_PATTERN**: Card-based executive cockpit linking active operational cases to underlying process health.
- **ACTION_PATTERN**: "Task Inbox" presenting human-in-the-loop decisions with direct form inputs.
- **DRILLDOWN_PATTERN**: Executive Metric $\to$ Case List $\to$ Case Workspace with audit timeline.
- **STATUS_PATTERN**: Progress stages with semantic colors (Green = Active, Amber = Pending Customer, Gray = Closed).
- **EMPTY_STATE_PATTERN**: Centered card with icon, single-sentence explanation, and route back to overview.
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: Tight integration between development initiatives and active legal cases; clear "waiting on" indicators.
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Heavy enterprise gray-on-gray forms and multi-nested modal dialogs.
- **WHY**: Adminiculum's branding relies on high typography contrast (dark green, serif headings, warm stone/ivory).

---

## 5. ServiceNow
- **NAVIGATION_PATTERN**: Mega-menu / Unified header with Global Search, Notifications, and Profile.
- **HOME_PATTERN**: "Attention-First": (1) Urgent Action Required, (2) My Active Requests, (3) Services & Knowledge.
- **ACTION_PATTERN**: High-priority task cards with distinct borders and direct action buttons.
- **DRILLDOWN_PATTERN**: Request Summary $\to$ Interaction Timeline $\to$ Attached Records.
- **STATUS_PATTERN**: Pill badges (Awaiting User Info, In Progress, Resolved, Closed).
- **EMPTY_STATE_PATTERN**: Compact banner stating "You have no open tasks requiring action" with subtle checkmark icon.
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: Strict "Attention-First" homepage hierarchy where populated action items dominate the top of the screen.
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Visual clutter with 40+ widgets, search bars, and ITSM jargon.
- **WHY**: The organizational portal must feel like a bespoke legal-consulting cockpit, not an IT helpdesk.

---

## 6. Vanta
- **NAVIGATION_PATTERN**: Left sidebar (Dashboard, Frameworks, Controls, Tests, Documents, Trust Center).
- **HOME_PATTERN**: Compliance posture overview with segmented priority cards (Requires Attention, In Progress, Passing).
- **ACTION_PATTERN**: "Action Items" grouped by category (Employee tasks, System configurations, Document uploads).
- **DRILLDOWN_PATTERN**: Framework / Topic $\to$ Specific Control $\to$ Automated Test Results & Missing Evidence.
- **STATUS_PATTERN**: Colored badges with count chips; percentage readiness bars.
- **EMPTY_STATE_PATTERN**: Clean card indicating "0 items requiring attention" with clear confirmation text.
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: Grouping compliance topics into `Teendőt igényel`, `Folyamatban`, `Jelenleg nincs Öntől várt teendő`, and `Legutóbbi változások`.
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Fake completion percentage bars (e.g. "87% Compliant") and automatic "Pass" checks that mislead on legal certainty.
- **WHY**: Legal and regulatory compliance cannot be reduced to a mechanical percentage without severe professional liability.

---

## 7. Drata
- **NAVIGATION_PATTERN**: Left-hand navigation with clean collapse and expandable sub-categories.
- **HOME_PATTERN**: Executive security posture and audit readiness cards with countdowns to audit dates.
- **ACTION_PATTERN**: "Remediation Queue" sorted by due date and severity.
- **DRILLDOWN_PATTERN**: Control $\to$ Evidence Drawer $\to$ Verification Provenance and Timestamp.
- **STATUS_PATTERN**: Verified, Needs Attention, Excluded.
- **EMPTY_STATE_PATTERN**: Minimalist text box with soft background and reassurance copy.
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: "Mi alapján?" provenance drawer/modal showing legal citations, confirmed facts, and document sources.
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Aggressive gamification (e.g. badges, confetti) inappropriate for legal counsel.
- **WHY**: Corporate legal interactions require understated, authoritative, evidence-based gravitas.

---

## 8. Hyperproof
- **NAVIGATION_PATTERN**: Multi-tab workspace separating Programs, Controls, Proof (Evidence), and Tasks.
- **HOME_PATTERN**: Audit-readiness health bars across active regulatory frameworks.
- **ACTION_PATTERN**: Task assignment cards detailing exactly what evidence must be uploaded.
- **DRILLDOWN_PATTERN**: Control $\to$ Linked Proof Vault $\to$ Historical Version Diff.
- **STATUS_PATTERN**: Fresh, Stale, Missing Proof.
- **EMPTY_STATE_PATTERN**: Bounded section with explicit guidance on what happens when work begins.
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: Explicit distinction between missing company information and active remediation work.
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Overly granular audit-program configuration exposed to non-auditor clients.
- **WHY**: Clients want to know what to do, not configure audit methodologies.

---

## 9. AuditBoard
- **NAVIGATION_PATTERN**: Module switcher (OpsAudit, SOX, Risk, Compliance) with top global navigation.
- **HOME_PATTERN**: Issue tracking dashboard with severity breakdowns and upcoming milestones.
- **ACTION_PATTERN**: Remediation action plan sign-off workflow with explicit responsible parties.
- **DRILLDOWN_PATTERN**: Issue $\to$ Root Cause Analysis $\to$ Remediation Plan $\to$ Validation State.
- **STATUS_PATTERN**: Draft, Open, In Remediation, Validated, Closed.
- **EMPTY_STATE_PATTERN**: Professional clean slate indicating "No active remediation actions required."
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: Clean remediation status tracking and strict role segregation between internal notes and external view.
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Complex spreadsheet-like multi-column tables with 30 columns.
- **WHY**: Mobile and executive users struggle with spreadsheet-style web UIs; card-based flows are superior.

---

## 10. Thomson Reuters HighQ
- **NAVIGATION_PATTERN**: Global matter switcher and top navigation bar (Overview, Matters, Files, Tasks, Activity).
- **HOME_PATTERN**: Matter spotlight card with current status, next milestone, and key lawyer contact details.
- **ACTION_PATTERN**: "Customer Tasks" list with deadline dates and document upload targets.
- **DRILLDOWN_PATTERN**: Matter Spotlight $\to$ Matter Detail $\to$ Document Vault & Milestone History.
- **STATUS_PATTERN**: Milestone progress tracker (`Completed`, `In Progress`, `Upcoming`).
- **EMPTY_STATE_PATTERN**: "No matters currently published to this workspace. Contact your legal team."
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: Matter journey (`Eddig → Most → Következő lépés`) and clear lawyer contact attribution.
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Outdated, boxy enterprise portal aesthetic from early 2010s.
- **WHY**: HighQ's information architecture is strong, but its visual design is dated. Adminiculum combines that architecture with contemporary modern web elegance.

---

## 11. Clio for Clients
- **NAVIGATION_PATTERN**: Clean bottom bar on mobile / top bar on web (Home, Messages, Documents, Tasks).
- **HOME_PATTERN**: Personalized welcome, active matter headline, and prominent pending task checklist.
- **ACTION_PATTERN**: Simple, friendly checklist with direct upload and sign actions.
- **DRILLDOWN_PATTERN**: Matter $\to$ Message Thread $\to$ Shared Documents.
- **STATUS_PATTERN**: Plain-language status badges (Waiting on you, Under review, Completed).
- **EMPTY_STATE_PATTERN**: Warm, reassuring empty states ("You're all caught up! No tasks need your attention right now.")
- **WHAT_ADMINICULUM_SHOULD_ADOPT**: Friendly, unambiguous customer-action checklist and superb mobile typography.
- **WHAT_ADMINICULUM_SHOULD_NOT_ADOPT**: Consumer-oriented oversimplification (omitting company digital twin and corporate governance context).
- **WHY**: Adminiculum serves corporate organizational clients who need enterprise depth (processes, systems, compliance) alongside clean usability.

---

## 12. Summary: Core Design Rules for Adminiculum Client Portal 2.0
1. **Homepage Hierarchy**:
   - Level 1: `Ami most Öntől kell` (Dominates when populated; compact when empty).
   - Level 2: `Jogi ügyek` (Active matter spotlight with `Eddig → Most → Következő lépés`).
   - Level 3: `Fejlesztés` (Grow summary: processes and initiatives).
   - Level 4: `Megfelelés` (Governance status and missing facts).
   - Level 5: `Frissítések` (Latest published documents and filings).
   - Level 6: `Üzenetek` (Structured matter communication).
   - Level 7: `Vállalat` (Digital twin summary).
2. **Visual Hierarchy & Brand**:
   - Off-white/ivory background (`#fffaf0` / `#faf8f5`), rich dark green / charcoal text (`#1a2e22` / `#1c1917`), warm gold/terracotta accents (`#b99b45` / `#7a5f18`).
   - Serif display headings for section anchors; crisp sans-serif for UI labels, tables, and chips.
3. **Empty States**:
   - Never collapse into invisibility.
   - Never occupy giant blank cards.
   - Use compact bordered banners with clear route links into the respective section.
