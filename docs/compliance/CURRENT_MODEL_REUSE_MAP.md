# Current-Model Reuse Map — Grow-with-Us Compliance Engine

> Design analysis only. No Prisma models, no migrations, no APIs, no deployment.

## 1. Scope

This document maps the future compliance engine (Phase 6) onto the **existing**
Adminiculum data model (Phases 1–3) and defines the **deduplication contract**
that the engine MUST respect. It is written from the canonical Prisma schema
(`Backend/prisma/schema.prisma`, 4,372 lines).

## 2. Current Model Inventory (what already exists)

### Phase 1 — Company foundation (`client_*` tables)

| Model | Key fields | Notes |
|---|---|---|
| `ClientOperatingProfile` | clientId, status, summary, lastReviewedAt, nextReviewAt | Per-client operational profile record |
| `ClientFact` | clientId, **type (string)**, value, validFrom, validTo, sourceReference, sourceDocumentVersionId, **verificationStatus** (UNVERIFIED/CLIENT_PROVIDED/DOCUMENT_VERIFIED/LAW_FIRM_VERIFIED), verifiedBy/At | **Time-boxed key/value fact store.** `type` is a validated string code via server registry — extensible without migrations. This is the natural home for compliance applicability facts. |
| `CompanyMilestone` | type, title, milestoneDate, targetDate, status (PLANNED/ACHIEVED/CANCELLED), developmentInitiativeId | Growth triggers / milestone tracking |
| `Assessment` | clientId, type (string), title, status (DRAFT/IN_PROGRESS/COMPLETED/ARCHIVED), methodRef, startedAt/completedAt/reviewAt | Assessment lifecycle |
| `AssessmentItem` | assessmentId, key, label, kind (FACT/QUESTION/CHECK), currentPractice, maturityLevel, statusCode, evidenceSummary, targetState, reviewer, evidenceDocumentVersionId | Question/check catalogue with evidence linkage |
| `AssessmentFinding` | clientId, severity (LOW..CRITICAL), title, description, recommendation, status (OPEN/ACKNOWLEDGED/ACTION_PLANNED/RESOLVED), developmentInitiativeId, **remediationTaskId** | Findings already link to remediation `Task` |
| `DevelopmentInitiative` | title, reason, currentState, targetState, priority, status (BACKLOG..CANCELLED), lawFirmOwner, caseId, milestones, findings, clientOwnerPersonId | Improvement initiative, links findings ↔ milestones |

### Phase 2 — Contract library

| Model | Key fields | Notes |
|---|---|---|
| `ContractRecord` | contractType (string), status (DRAFT..SUPERSEDED), parties, effectiveDate/expiryDate, family (parent/amendments), canonicalDocumentVersionId | **Structured business relationship**, distinct from the physical document |
| `ContractParty` | roleCode (string), displayName, registrationNumber, taxNumber, country | |
| `ClientObligation` | sourceType, sourceContractId, sourceReference, title, triggerType, frequencyCode, nextDueDate, status (OPEN..EXPIRED), relatedTaskId, evidenceDocumentVersionId, ownerPersonId | **Existing obligation engine** — contract-sourced obligations |
| `ContractEntitlement` | type, title, sourceReference, exerciseByDate, status | Existing entitlement engine |

### Phase 3 — Organization / responsibility

| Model | Key fields | Notes |
|---|---|---|
| `ClientOrganizationGroup` | workspaceId, name, status, parentGroupId (hierarchy) | Canonical org-unit model |
| `OrganizationPerson` | name, jobTitle, employmentStatus, start/endDate, responsibilitiesSummary, manager/deputy, portalMembershipId (non-privileged) | Operational responsibility record; distinct from portal identity/user |
| `OrganizationPersonResponsibility` | type (string), label | Responsibility/role taxonomy per person |
| `OrganizationPersonDocumentLink` | documentVersionId, documentRole | Document-role assignments |

### Supporting infrastructure

| Model | Key fields | Reuse relevance |
|---|---|---|
| `Task` | taskType, status, priority, assignedTo, dueDate, workflow fields, attentionCategory | **Reusable action/remediation engine**; `AssessmentFinding.remediationTaskId` already links |
| `Document` | category, workStatus, title, documentRole, responsible/reviewer, securityClassification | Case-scoped document layer |
| `DocumentVersion` | version, size, storageReference, reviewStatus, publicationStatus, uploadSource, versionType, lineage (previousVersion) | **Versioned evidence/artifact store**; used by ClientFact, AssessmentItem, ContractRecord, ClientObligation, OrganizationPersonDocumentLink |
| `TimelineEvent` | eventType (string enum), payload/metadata (Json), caseId, userId, documentId, taskId | Audit timeline; extensible via `CUSTOM` + payload |
| `Case` | type, status, priority, … | Case-centered workflow root |

## 3. Reuse Map (fact → existing model)

| Future compliance need | Reuse (existing) | Do NOT create |
|---|---|---|
| Organization facts / applicability values | `ClientFact` (clientId, type, value, validFrom/validTo, verificationStatus, sourceDocumentVersion) | ✗ new `OrganizationFact` table (unless schema proves structurally impossible — it does not; see §4) |
| Compliance assessments | `Assessment` + `AssessmentItem` + `AssessmentFinding` | ✗ second assessment engine |
| Findings / gaps | `AssessmentFinding` (severity, status, recommendation, remediationTaskId) | ✗ generic parallel `Finding` model |
| Remediation / action items | `Task` (+ `AssessmentFinding.remediationTaskId`) | ✗ second task system |
| Responsibility / ownership | `OrganizationPerson` + `OrganizationPersonResponsibility` (+ `DevelopmentInitiative.clientOwnerPersonId`, `ContractRecord.businessOwnerPersonId`, `ClientObligation.ownerPersonId`) | ✗ separate employee/role directory |
| Evidence / artifacts | `Document` + `DocumentVersion` (+ `evidenceDocumentVersionId` on facts/items/obligations, `OrganizationPersonDocumentLink`) | ✗ separate compliance file storage |
| Audit trail | `TimelineEvent` (+ `CUSTOM` event type + payload JSON) | ✗ parallel audit log |
| Client-facing publication of compliance status | existing client-portal publication / `DocumentVersion.publicationStatus` mechanics | ✗ parallel publication system |

## 4. Critical Deduplication Decisions

The engine MUST NOT create competing models. Decisions, with justification:

1. **OrganizationFactDefinition (NEW registry layer) — YES.** A future
   *definition/registry* layer (fact key, domain, data type, allowed values,
   question prompt, verification rule) is genuinely new and valuable. But it is
   a **catalogue of definitions**, not a store of client values.
2. **Organization values → `ClientFact` — YES, reuse.** `ClientFact` is
   structurally capable: `type` is an extensible string code, it is
   client-scoped, time-boxed (`validFrom/validTo`), verified
   (`verificationStatus`), and evidence-linked (`sourceDocumentVersionId`). No
   new `OrganizationFact` table is justified. A new fact-key registry entry
   (point 1) *defines* the allowed `type` codes; `ClientFact` *stores* the
   values.
3. **Assessment → reuse `Assessment`/`AssessmentItem`/`AssessmentFinding`.**
   The engine may add compliance-specific `type` codes and new relations
   (e.g. finding ↔ requirement), but **not** a parallel
   `ComplianceAssessment` storage path.
4. **Finding → reuse `AssessmentFinding`.** No generic second `Finding` model.
5. **RemediationAction → reuse `Task`.** Findings link to `Task` today via
   `AssessmentFinding.remediationTaskId`. Compliance requirements may add
   dedicated task templates/types, not a new task engine.
6. **Responsibility → reuse `OrganizationPerson` + responsibility/ownership
   links.** No new employee/role directory.
7. **Evidence → reuse `Document` + `DocumentVersion`.** No separate compliance
   file storage.

## 5. Proposed Genuinely New Phase-6 Models (MAP ONLY — do not implement)

| Proposed concept | Classification | Why |
|---|---|---|
| `LegalSource` | **NEW** | Canonical legal instrument identity (citation, jurisdiction, CELEX, title, language). Nothing existing models legal instruments. |
| `LegalSourceVersion` | **NEW** | Checksum-keyed version of a source file (sha256, size, versionDate, effectivePeriod). Paired with LegalSource for change detection. |
| `LegalProvision` | **NEW** | Individual provision/rule within a source (citation anchor, excerpt hash, heading context, line range advisory). Grounds requirements in the source. |
| `ComplianceDomain` | **NEW** (or extend a future registry) | Coarse domain taxonomy (tax, employment, data, chemicals, …). Small, stable; could be an enum or registry. |
| `ComplianceTopic` | **NEW** | Finer topical grouping under a domain (e.g. VAT invoices, OHS training). |
| `Requirement` | **NEW** | A normative statement derived from a LegalProvision (actor, obligation, condition, threshold/deadline, applicability). Core canonical concept. |
| `ApplicabilityRule` | **NEW** | Deterministic rule expression over fact keys (which facts trigger a Requirement). |
| `RequirementApplicability` | **NEW** (or EXTEND via join) | Per-client computed applicability state (requirement × client × facts). |
| `ComplianceDocumentType` | **EXTEND EXISTING** | Extend `DocumentCategory`/registry or `DocumentVersionType` with compliance artifact types (evidence, declaration, policy) — do NOT create parallel storage. |
| `Control` | **NEW** | A defined control/measure the client can implement to satisfy a Requirement (references evidence documents). |
| `EvidenceRequirement` | **NEW** | Definition of what evidence is needed for a Requirement/Control. |
| `GrowthTrigger` | **EXTEND EXISTING (CompanyMilestone)** | Model growth events as `CompanyMilestone` (type = compliance milestone) rather than a parallel table; add compliance-specific milestone types via the string registry. |
| `RegulatoryChange` | **NEW** | A detected metadata-level change (same LegalSource, new checksum) linking old/new LegalSourceVersion. Detection only; no legal diff. |

## 6. Requirement Review Lifecycle (MAP ONLY — do not implement enums now)

Candidate legal content must never flow straight into production. Conceptual
lifecycle:

```
EXTRACTED
  → AI_DRAFT / STRUCTURED_DRAFT      (tool-assisted structuring, non-authoritative)
  → LEGAL_REVIEW_REQUIRED            (every candidate starts here)
  → LEGAL_REVIEWED
  → APPROVED
  → PUBLISHED
```

Where existing patterns are reused:
- **Document/version review:** `DocumentReview`, `DocumentReviewRound`,
  `ReviewPoint`, `ReviewDecision`, `DocumentVersionReviewStatus` already model
  staged review with approvals — a good structural pattern for requirement
  review.
- **Assessment status:** `AssessmentStatus` (DRAFT → IN_PROGRESS → COMPLETED →
  ARCHIVED) shows the established lifecycle pattern with Prisma enums.
- **Timeline:** `TimelineEvent` with `CUSTOM` + JSON payload records who/when
  a lifecycle transition happened.
- Recommendation: implement the lifecycle as a **string status code validated by
  a server registry** (matching the established extensible-taxonomy convention)
  rather than a Prisma enum, so future lifecycle extensions do not need
  migrations. A dedicated review event/journal relation should be added.

## 7. Applicability Input Map

The future fact-definition catalogue is a **design manifest only** (no
hardcoding in controllers, no DB rows). The catalogue is in
`docs/compliance/fact-definition-candidates.json`. It lists 30 candidate fact
keys mapped to likely source coverage in the corpus. `ClientFact.type` will hold
these keys; `OrganizationFactDefinition` will define them.

## 8. Recommendations for Phase 6 Implementation

1. **Reuse first, extend second, create only where the schema is provably
   incapable** — apply §4 mechanically to every new feature.
2. Implement the fact-definition registry layer first (`OrganizationFactDefinition`
   + `ClientFact` reuse) before any requirement engine; it is the cheapest and
   most reusable piece.
3. Make every new taxonomy a **string code validated by a server registry**
   (the established repo convention) so packs (e.g. AI_GOVERNANCE,
   SUPPLIER_READINESS) ship without migrations.
4. Version the corpus via `LegalSource`/`LegalSourceVersion` before writing the
   rule engine; feed candidate `RegulatoryChange` into the review lifecycle —
   never auto-publish.
5. Keep the engine runtime-AI-free: extraction/structuring may use AI tooling
   offline, but the runtime engine evaluates deterministic `ApplicabilityRule`
   expressions over `ClientFact` values only.
6. Add a requirement↔finding link (extend `AssessmentFinding` with an optional
   `requirementId`) rather than a parallel finding store.
7. Confirm the NIS2 national transposition mapping during review: the corpus has
   the EU NIS2 Directive and the HU Cybersecurity Act (2024/LXIX), but the
   explicit transposition mapping must be legally reviewed before reliance.
8. Before productionizing any requirement, resolve the REACH near-duplicate
   (§7 of SOURCE_INVENTORY.md) and mark the canonical version.

## 9. Files Not Touched (per this task)

- `Backend/prisma/schema.prisma` — read-only reference; no changes
- `Backend/prisma/migrations/` — untouched
- `Backend/templates/` — untouched
- `Backend/src/modules/generation-draft/`, `anonymize/` — untouched
- `C:\Users\hubay\Documents\Adminiculum\tvek` — read-only corpus, unmodified