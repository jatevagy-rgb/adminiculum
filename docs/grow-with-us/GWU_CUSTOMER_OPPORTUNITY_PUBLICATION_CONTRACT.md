# Grow With Us customer opportunity publication contract

**Status:** Proposed architecture only
**Scope:** Customer publication of reviewed ImprovementOpportunity records
**Baseline:** e0b8fb6d0dcd829995b9c5c121f86487ace749c8 (origin/master)
**Runtime/schema work in this document:** none

ROADMAP_CAPABILITIES_REMOVED=NONE

The current customer behavior is intentionally fail-closed. getOrganizationalGrow
requires an active organization or case-relay workspace and an active membership,
but returns an empty opportunity list with
GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP. An internal ImprovementOpportunity
is therefore not customer-visible by implication.

This token describes the current absence of a publication capability. It is not
the empty-state reason for a future workspace after publication is implemented.
After PUB-1 and PUB-2 exist, zero published opportunities is a normal empty
state, with no capability-gap token and no internal opportunity count leakage.
Customer copy may say: “Jelenleg nincs ügyféloldalon közzétett fejlesztési
lehetőség.”

The existing customer route is GET /client-portal/org/grow, consumed by
/portal/fejlesztes?tab=lehetosegek. Workforce opportunity routes remain under
/clients/:clientId/grow/opportunities.

## Existing publication inventory

| Area | Existing canonical representation | What it proves | Reusable for Grow |
|---|---|---|---|
| Case/matter publication | ClientMatterPublication + ClientMatterPublicationRevision | explicit draft/approval/publish/revoke/supersede lifecycle; immutable customer-safe revision; workspaceId, clientId, audienceSnapshot and source fingerprint | PARTIAL — strongest pattern, but tied to a Case and case grants |
| Document publication | ClientDocumentPublication + recipients | explicit publication state, workspace or selected-participant visibility, safe title/explanation, approved/published/revoked metadata | PARTIAL — useful audience and DTO patterns, but tied to documents and Cases |
| Safe updates/action requests | ClientSafeUpdate, ClientActionRequest | explicit approved/published customer-safe content and status | PARTIAL — content and lifecycle patterns, but both require a Case |
| Publication audit | ClientPublicationEvent | actor, client, status transition, publication references, safe metadata | PARTIAL — event columns have no opportunity-publication reference |
| Compliance customer documents | clientSafeComplianceService reads only ClientDocumentPublication rows with status=PUBLISHED and revokedAt=null | explicit publication is required before customer readback | REUSABLE PRINCIPLE, not a direct opportunity store |
| Company overview projection | projectCompanyOverviewForCustomer, orgCompanyService | customer-safe projection of profile, milestones and initiatives; organization authorization occurs before sensitive reads | REUSABLE PROJECTOR/BOUNDARY PATTERN |
| Grow workforce data | RecommendationCandidate, DiagnosisCandidate, ResearchEvidence, ImprovementOpportunity, DevelopmentInitiative, OutcomeMeasurement | internal research, evidence gate, human review, execution handoff and measurement lifecycle | SOURCE DOMAIN ONLY; none of these is a customer publication boundary |
| Portal authorization | requireOrganizationWorkspace, active ClientPortalWorkspaceMembership, canViewOrganizationSummary | selected workspace, active membership and organization-mode boundary | REUSABLE |

The schema has no generic publishedAt, publishedBy, visibility,
customerVisible or portalVisible fields on ImprovementOpportunity.
ImprovementOpportunity is client-scoped and has only its internal lifecycle
(OPEN, INITIATIVE_STARTED, OUTCOME_RECORDED, CLOSED). The source
RecommendationCandidate is explicitly PENDING_REVIEW until human review.

Conclusion:

EXISTING_PUBLICATION_MECHANISM=case/document customer publication foundation with immutable safe revisions and workspace-aware audience checks; no generic opportunity publication mechanism

REUSABLE_FOR_GROW=PARTIAL

Reuse the existing status vocabulary, immutable-revision shape, audit/event
conventions, audienceSnapshot, sourceFingerprint, assertNoForbiddenPortalFields,
and workspace/membership checks. Do not attach an opportunity directly to a
Case publication row or treat a Case grant as organization-wide Grow authority.

## Publication semantics

The only valid customer transition is:

    INTERNAL ONLY
      -> explicit workforce preparation
      -> explicit approval
      -> explicit publication
      -> CUSTOMER VISIBLE

A published item may be:

    CUSTOMER VISIBLE
      -> explicit withdrawal/revocation

A replacement publication is a new immutable safe revision and supersedes the
previous revision only through an explicit workforce action.

There is no automatic publication. None of these events may publish an
opportunity:

- RecommendationCandidate creation;
- ImprovementOpportunity creation after an ACCEPT decision;
- a research run;
- diagnosis creation;
- evidence verification;
- initiative creation;
- outcome measurement;
- a customer profile answer;
- a portal read.

RecommendationCandidate review and customer publication are separate decisions.
ACCEPT continues to create only the internal ImprovementOpportunity; a later
authorized workforce action must prepare, approve and publish the customer-safe
copy.

Unpublishing must be explicit, auditable and fail closed. A revoked item is
excluded from customer list and detail reads immediately. The internal
opportunity remains intact.

## Who may publish or unpublish

The existing client publication service defines:

- internal publication administration roles: ADMIN, PARTNER, LAWYER, COLLAB_LAWYER;
- publisher roles: ADMIN, PARTNER, LAWYER.

The smallest existing rule for PUBLISH and UNPUBLISH is the existing
PUBLISHER_ROLES set (ADMIN, PARTNER, LAWYER) in
Backend/src/modules/client-publication/publicationService.ts. Reuse that
allowlist; do not invent a Grow-specific role and do not broaden it to
COLLAB_LAWYER without a separate authorization decision.

The publisher check must be combined with a server-side client/workspace
ownership check. A publisher role alone must never allow publishing another
client's opportunity. Existing MANAGER_ROLES (ADMIN, PARTNER) remain the
authorization for recommendation review; review authority and publication
authority are related but distinct.

Customer portal identities, CLIENT users and any organization membership role
may read published content only through the customer projection. They must
never publish or unpublish.

PUBLISH_AUTHORIZATION_SOURCE=existing client-publication PUBLISHER_ROLES (ADMIN, PARTNER, LAWYER), plus server-derived client/workspace ownership; customer identities have no mutation route

## Customer-safe DTO

The source opportunity fields need a publication-time safe copy. A source row
must never be serialized directly into the portal DTO merely because its status
is OPEN.

### Candidate field classification

| Source candidate | Classification | Contract decision |
|---|---|---|
| id | OMIT | Do not expose the raw ImprovementOpportunity ID as a source reference. Use an opaque publication ID in the customer DTO. |
| title | NEEDS_REDACTION | Copy into an explicitly customer-safe title during preparation/approval. Apply bounded text and forbidden-field checks. |
| problem | NEEDS_REDACTION | Never expose the internal problem statement directly. Copy a customer-safe summary after human review. |
| direction | NEEDS_REDACTION | Never expose the internal direction directly. Copy a customer-safe direction after human review. |
| kind | NEEDS_PRODUCT_DECISION | Do not expose QUICK_FIX/DEVELOPMENT raw. Either map to an approved customer label or omit in V1. |
| evidenceStrength | OMIT | This is an internal evidence signal/scoring summary and must not cross the boundary in V1. |
| publishedAt | SAFE | Read from the publication record, not from the source opportunity. |
| internal recommendation ID/run ID | OMIT | Never expose research linkage. |
| diagnosis, sourceRefs, research evidence, observation IDs/payloads | OMIT / NEEDS_REDACTION | No raw diagnosis, observation or evidence inventory crosses the boundary. |
| review note, reviewer identity, internal ownership/priority | OMIT | Keep workforce-only. |
| Case/task/document IDs and links | OMIT | An opportunity publication is not a hidden Case or task grant. |

The minimal customer list/detail DTO is therefore:

    {
      publicationId: string;       // opaque publication identifier
      title: string;               // approved safe snapshot
      summary: string;             // approved safe snapshot
      direction: string | null;    // approved safe snapshot
      kindLabel: string | null;    // only if a customer label is approved
      publishedAt: string;         // publication timestamp
    }

summary and direction are publication snapshot fields, not aliases for raw
problem and direction. The DTO contains no internal review notes, reviewer
identity, raw Observation payload, diagnosis trace, evidence inventory,
research notes, hidden Case/Task IDs, confidential documents, internal scoring,
or unpublished RecommendationCandidate.

The existing assertClientSafe/assertNoForbiddenPortalFields guards should remain
a defense-in-depth check. They do not replace explicit field selection or
human publication review.

CUSTOMER_SAFE_FIELDS=publicationId, approved safe title, approved safe summary, approved safe direction (nullable), approved customer kindLabel if product-approved, publishedAt

CUSTOMER_FORBIDDEN_FIELDS=raw ImprovementOpportunity id, recommendation/run/diagnosis/sourceRefs, review notes and reviewer identity, evidenceStrength/internal scoring, raw Observation or ResearchEvidence data, Case/Task/document IDs, confidential text, unpublished RecommendationCandidates

## Live versus snapshot publication

Recommendation: B — preserve an approved publication snapshot until explicitly
republished.

The existing Case publication contract already takes this position: mutable
workforce draft content is copied into an immutable customer-safe revision, and
later internal changes do not rewrite what a customer has already seen.

Reasons:

- Auditability: the exact customer copy and audience at publication time can be
  reconstructed.
- Disclosure safety: an internal edit cannot silently add a confidential
  sentence to a previously approved customer surface.
- Staleness is explicit: the workforce can review and republish a new safe
  revision rather than silently changing the contract.
- Withdrawal is clear: revocation hides the publication without deleting the
  internal opportunity.
- Complexity is bounded: the repository already implements immutable
  revisions, status transitions, source fingerprints and audience snapshots.

Automatically reflecting current ImprovementOpportunity fields would reduce
storage work but would make an approved customer copy mutable through internal
edits, weaken auditability and create accidental-disclosure risk. It is not
safe for V1.

LIVE_OR_SNAPSHOT_RECOMMENDATION=SNAPSHOT

## Persistence decision

| Option | CAN_REPRESENT_EXPLICIT_PUBLISH | CAN_REPRESENT_UNPUBLISH | AUDITABLE | SUPPORTS_SNAPSHOT | RISKS | MIGRATION_REQUIRED |
|---|---|---|---|---|---|---|
| A. Add fields to ImprovementOpportunity | Yes (status plus publisher fields) | Yes, with a new publication state | Partial; one row conflates internal lifecycle and publication lifecycle | Weak unless a JSON snapshot or extra revision structure is added | couples internal execution status to customer audience, cannot naturally support multiple workspace audiences/revisions, easy to leak raw fields | YES |
| B. Separate opportunity publication record plus immutable safe revision | Yes | Yes (REVOKED/SUPERSEDED) | Yes: actor, timestamps, state transitions, audience and source fingerprint | Yes | one new relationship and authorization/read path; needs cross-client/workspace constraints and tests | YES |
| C. Reuse an existing generic publication entity | No direct fit | No direct fit | Only by overloading Case/document columns | Only by misrepresenting an opportunity as a Case/document | wrong domain ownership, Case-grant coupling, hidden-ID leakage, ambiguous audit semantics | YES if adapted |

There is no generic publication entity in the current schema. The existing
publication rows are intentionally domain-specific and customer-safe. Reusing
ClientMatterPublication for an opportunity would create a false Case
relationship and violate the current authorization boundary.

NEW_PERSISTENCE_REQUIRED=YES

RECOMMENDED_MINIMAL_V1=separate workspace-scoped opportunity publication record with immutable customer-safe revision snapshots, reusing ClientPublicationStatus and the publication authorization/audience patterns; no changes to ImprovementOpportunity lifecycle

### Smallest proposed persistence shape

This is a design proposal only; no schema or migration is included here.

ClientImprovementOpportunityPublication:

- id
- opportunityId (restricted relation to ImprovementOpportunity)
- clientId (defense-in-depth tenant key)
- workspaceId (active organization workspace target)
- status using the existing ClientPublicationStatus vocabulary
- currentRevisionId
- preparedById, approvedById, publishedById, revokedById,
  approvedAt, publishedAt, revokedAt
- supersededAt, supersededById
- revision, createdAt, updatedAt

ClientImprovementOpportunityPublicationRevision:

- id
- publicationId
- revisionNumber
- clientSafeTitle
- clientSafeSummary
- clientSafeDirection
- optional clientSafeKindLabel only after the product decision
- sourceFingerprint
- audienceSnapshot
- createdById
- createdAt

The publication record must enforce the same clientId on the opportunity and
workspace. A unique active publication per (opportunityId, workspaceId) is
preferred; republishing appends a revision and supersedes the prior active
revision. The event stream needs either a new nullable publication reference
or a dedicated opportunity-publication audit event using the existing redacted
metadata conventions. This proposal does not add that field yet.

## Workspace and tenant boundary

PUBLICATION_SCOPE=WORKSPACE

The current organization Grow path is selected-workspace based:

1. requireOrganizationWorkspace(workspaceId) verifies an active workspace in
   ORGANIZATION or CASE_RELAY mode and returns its clientId.
2. getOrganizationalGrow(identityId, workspaceId) requires an active
   ClientPortalWorkspaceMembership for that exact identity/workspace pair.
3. The portal route then reads through the selected workspace context.
4. The current opportunity source rows are client-scoped, but that does not
   turn client-wide source data into implicit customer visibility.

Therefore V1 publication must target an explicit workspaceId and carry the
matching clientId. Customer list/detail queries must require:

- the publication status is PUBLISHED;
- the requested publication workspaceId equals the selected workspace;
- the publication clientId equals the workspace's derived client;
- the identity has an active, unexpired membership for that workspace;
- the current revision exists and is customer-safe.

No query may discover publications by clientId alone. No organization group,
Case grant, task assignment, portal tab, email, job title or frontend filter
may grant opportunity access. A second workspace for the same Client must see
nothing until a publisher explicitly targets that workspace.

The internal opportunity remains client-scoped for workforce operations. The
publication is workspace-scoped for customer access. This preserves the
existing pattern in which some customer-safe source data is Client-owned while
the authorization decision is made in the selected workspace.

## Implementation slices

### PUB-1 — persistence, authorization, internal publish/unpublish API

FILES/MODULES:

- Backend/prisma/schema.prisma (new publication/revision relation and any
  narrowly scoped event reference)
- one new bounded service under Backend/src/modules/company-growth/ for
  preparation, approval, publication and revocation
- existing Backend/src/modules/client-publication/publicationService.ts
  conventions, not a Case-table overload
- existing internal route family in Backend/src/modules/client-company/routes.ts
  or a dedicated bounded route
- PostgreSQL integration coverage under Backend/tests/

SCHEMA_CHANGE=YES — only the two publication models and the minimum relation or
event reference proven necessary.

BACKEND_CHANGE=YES

FRONTEND_CHANGE=NO

SECURITY_RISK: A publication mutation could leak another client's opportunity,
accept unreviewed text, or let a customer publish. Mitigate with
PUBLISHER_ROLES, derived client/workspace ownership, explicit state transitions,
safe text validation, immutable revisions and redacted audit events.

REGRESSION_INVENTORY:

- ACCEPT still creates only an internal ImprovementOpportunity;
- RecommendationCandidate review states and manager gate unchanged;
- workforce opportunity list/detail remains internal;
- initiative handoff and outcome recording remain unchanged;
- no customer route reads an unpublished/revoked row;
- customer users cannot call publish/unpublish;
- cross-client and cross-workspace publication attempts fail closed;
- publication and revocation are idempotent under expected revision checks.

POSTGRES_TEST: Create a pending recommendation and accepted opportunity; prove
no customer row/read exists before publication; exercise the role matrix;
publish a reviewed safe snapshot; mutate the internal opportunity and prove the
published snapshot is unchanged; revoke and prove customer read is empty;
republish a new revision; prove workspace/client isolation and redacted event
metadata.

### PUB-2 — customer-safe orgGrowService projection

FILES/MODULES:

- Backend/src/modules/client-workspace/orgGrowService.ts
- Backend/src/routes/clientPortal.ts
- bounded customer projection tests beside the existing portal Grow suites
- the existing requireOrganizationWorkspace and active membership policy

SCHEMA_CHANGE=NO after PUB-1.

BACKEND_CHANGE=YES

FRONTEND_CHANGE=NO

SECURITY_RISK: A client-wide query could bypass selected-workspace
authorization or expose internal research fields. Mitigate by filtering
publication rows by derived workspace/client and active membership first, then
projecting only the immutable safe revision.

REGRESSION_INVENTORY:

- the current truthful empty state remains for clients with no PUBLISHED
  opportunity;
- existing processes, initiatives, outcomes, surveys and assessment packs
  retain their current safe DTOs;
- GROW_OPPORTUNITY_CUSTOMER_PUBLICATION_GAP is removed once the real
  publication path exists; zero published rows then return a normal empty state
  (not a capability-gap token), without exposing internal opportunity counts;
- no RecommendationCandidate, diagnosis, raw observation, evidence or
  internal scoring reaches the portal;
- revoked, superseded, wrong-workspace and wrong-client rows remain invisible.

POSTGRES_TEST: Seed two clients, two workspaces and active memberships; publish
one safe revision to only one workspace; assert the matching identity sees
exactly that revision, another workspace/client sees none, mutation of the
source does not change the revision, revocation removes it, and an empty
workspace returns zero opportunities without revealing a count.

### PUB-3 — customer UI opportunity list/detail

FILES/MODULES:

- Frontend/src/components/client-portal/OrgGrowView.tsx
- Frontend/src/app/portal/fejlesztes/page.tsx
- the existing portal Grow API client in Frontend/src/lib/clientPortalApi.ts
- focused frontend contract/component tests

SCHEMA_CHANGE=NO

BACKEND_CHANGE=NO after PUB-2.

FRONTEND_CHANGE=YES

SECURITY_RISK: UI code must not turn a missing publication into a source
opportunity or expose hidden identifiers. Use the existing API DTO only; do
not derive visibility client-side.

REGRESSION_INVENTORY:

- tab=lehetosegek remains an orientation/read-only surface;
- the truthful empty state remains for zero published rows;
- assessment catalogue/runner/result tabs, survey history, initiatives and
  outcomes remain unchanged;
- no customer action, saved-interest, comment, deadline or initiative-
  conversion behavior is added in this slice.

POSTGRES_TEST: None for the frontend-only slice; PUB-2's authoritative
projection tests remain required. Frontend tests assert DTO rendering,
published-only list/detail navigation and absence of internal fields.

## Deferred future features

These are outside the publication contract and remain deferred, not removed:

- saved/interested state;
- customer comments;
- deadlines;
- required-document relations;
- related-opportunity relations;
- application workflow;
- initiative conversion UI;
- customer action requests.

SAVED_INTERESTED_DEFERRED=YES
DEADLINES_DEFERRED=YES
DOCUMENT_RELATIONS_DEFERRED=YES

## Regression inventory

The later implementation must preserve all of the following:

- workforce internal opportunity list/detail and its client authorization;
- RecommendationCandidate PENDING_REVIEW and manager-only review;
- explicit ACCEPT/DECLINE/REQUEST_MORE_INFO behavior;
- ImprovementOpportunity lifecycle and no implicit publication;
- DevelopmentInitiative handoff and existing Task/Case linkage;
- OutcomeMeasurement before/after snapshots, ROI provenance and synthetic-data
  handling;
- ResearchEvidence verification and sufficiency gates;
- the current customer Grow journey, including surveys and assessment packs;
- the current fail-closed opportunity projection;
- clients with no published rows seeing no opportunities and no inferred count;
- customer inability to publish/unpublish;
- active organization workspace membership isolation;
- Case/document publication and their existing grant/recipient boundaries;
- customer-safe compliance/document projections;
- no raw observations, diagnosis traces, research notes, internal evidence
  inventory, confidential documents or hidden IDs in customer DTOs;
- auditability and redaction of every publication transition;
- no changes to mailbox, Communications, billing, legal applicability or
  unrelated Grow behavior.

## Required acceptance contract for a future implementation

The implementation is not complete when a row merely has a PUBLISHED value.
The following must be demonstrable in PostgreSQL and through the existing portal
route:

1. An accepted internal opportunity remains invisible until an authorized human
   publishes a safe snapshot.
2. An unauthorized workforce role, customer identity, wrong client or wrong
   workspace cannot publish, unpublish or read it.
3. Internal edits after publication do not mutate the customer snapshot.
4. Revocation removes list and detail visibility without deleting the internal
   opportunity.
5. A second explicit publication creates a new revision and a redacted audit
   trail.
6. After publication capability exists, a client with no published rows receives
   a normal empty opportunity list and no capability-gap token, without
   learning the number of internal opportunities.
7. The existing portal membership and workspace authorization remains the only
   customer access boundary.
8. Existing assessment, survey, initiative, outcome, compliance, document and
   mailbox regressions remain green.

## Final decisions

EXISTING_PUBLICATION_MECHANISM=case/document customer publication foundation with immutable safe revisions and workspace-aware audience checks; no generic opportunity publication mechanism
REUSABLE_FOR_GROW=PARTIAL
PUBLISH_AUTHORIZATION_SOURCE=existing PUBLISHER_ROLES (ADMIN, PARTNER, LAWYER) plus derived client/workspace ownership; customers cannot publish
CUSTOMER_SAFE_FIELDS=publicationId, approved safe title, summary, direction, optional approved kindLabel, publishedAt
CUSTOMER_FORBIDDEN_FIELDS=raw source IDs, internal review/research/diagnosis/observation/evidence data, evidenceStrength, hidden Case/Task/document IDs, confidential text, unpublished recommendations
PUBLICATION_SCOPE=WORKSPACE
LIVE_OR_SNAPSHOT_RECOMMENDATION=SNAPSHOT
NEW_PERSISTENCE_REQUIRED=YES
RECOMMENDED_MINIMAL_V1=workspace-scoped publication record plus immutable safe revision snapshots, reusing existing ClientPublicationStatus and publication authorization/audience patterns
CUSTOMER_PUBLICATION_DEFAULT_FAIL_CLOSED=YES
AUTOMATIC_PUBLICATION=NO
CUSTOMER_CAN_PUBLISH=NO
TENANT_ISOLATION_PRESERVED=YES
RUNTIME_CHANGED=NO
SCHEMA_CHANGED=NO
MIGRATION_ADDED=NO
PRODUCTION_TOUCHED=NO
ROADMAP_CAPABILITIES_REMOVED=NONE
