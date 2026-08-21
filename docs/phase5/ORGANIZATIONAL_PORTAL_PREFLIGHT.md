# Phase 5 — Organizational Customer Portal / "Growth With Us" — Implementation Preflight

Status: **PREFLIGHT ONLY — no product implementation.**

Author lane: `jatevagy` (opencode)
Canonical release inspected: `cacfbe5714d9da67c278eff3ec9d0a8004981d13`

> **Replay note (Phase 5 test-foundation replay onto canonical)**
>
> This preflight's original analysis was made against the canonical release SHA
> `cacfbe5714d9da67c278eff3ec9d0a8004981d13`.
>
> It was replayed (via `opencode/phase5-test-foundation-canonical-replay`) onto
> the current canonical release tip `397925be5e9a56f6149439065267862b5a2a478e`
> (subsequently advanced to `fde1e18187d87aeca410be0630373cb90f32aca2` by an
> unrelated frontend deploy fix) — see the associated test-foundation work.
>
> The replay re-verified the fixture against the CURRENT canonical Prisma
> client and confirmed the relevant portal authorization/model assumptions in
> this preflight remain valid:
>   - `resolveActiveCustomerGrant` remains the single customer authorization gate.
>   - `resolveParticipantAccess` / `decidePermissions` remain the typed decision layer.
>   - The immutable `ClientMatterPublicationRevision` publication model is unchanged.
>   - The dormant customer projectors (`projectOrganizationForCustomer`,
>     `projectContractLibraryForCustomer`, `projectCompanyOverviewForCustomer`)
>     remain unwired to any route.
> No statement in this preflight required correction after replay.

---

## 0. Scope & Ground Rules

This document maps how Phase 5 should be implemented safely. It does **not**
implement anything.

- No Prisma model/field changes are proposed (analysis only).
- No product code is modified.
- No deployment is triggered.
- No canonical release is modified.
- Phase 5 only starts after Phase 4 is deployed and production-accepted.

Phase 5 target customer shell (Hungarian IA):

```
Főoldal · Ügyek · Szerződések · Teendők · Vállalat · Dokumentumok · Kapcsolat
```

Primary customer narrative: `Eddig → Most → Következőként`.

The portal must reuse existing canonical data and publication systems and must
NOT expose internal live operational state by accident.

---

## 1. Canonical Release Inspected

- Expected: `cacfbe5714d9da67c278eff3ec9d0a8004981d13`
- Verified present in the local object database (`git cat-file -t` → `commit`).
- It is the tip of branch `codex/company-workspace-phase4-final`.
- Analyzed from a **clean detached worktree** of exactly that commit
  (`C:\Users\hubay\AppData\Local\Temp\opencode\p5-canonical`) so the analysis
  reflects the true canonical tree, not the local working branch.

The current working branch (`opencode/company-workspace-phase4`) carries 3
Phase-4 commits on top of canonical (`6b9626f`, `09c79e7`, `5f6d3eb`). They are
Phase-4 review fixes / CI only and do not alter the portal authorization surface
analyzed here. All findings below are based on the canonical tree.

---

## 2. Current Customer Portal Architecture (file/function map)

### 2.1 Backend route mount points (`Backend/src/index.ts`)

| Mount | Module | Auth | Audience |
|---|---|---|---|
| `/api/v1/client-portal` | `routes/clientPortal.ts` | customer | portal reads + CP1 org surfaces |
| `/api/v1/client-identity` | `modules/client-identity/routes.ts` | customer (some) / internal | membership onboarding, grants |
| `/api/v1/client-interaction` | `modules/client-interaction/customerRoutes.ts` | customer | requests, submissions, questions |
| `/api/v1/internal/client-interaction` | `modules/client-interaction/internalRoutes.ts` | workforce | request/question/submission review |
| `/api/v1/client-publications` | `modules/client-publication/publication.routes.ts` | workforce | publication admin (matters, documents, action requests, safe updates, grants) |
| `/api/v1/client-company` | `modules/client-company/routes.ts` | workforce | Phase 1 company foundation |
| `/api/v1/client-contracts` | `modules/client-contracts/routes.ts` | workforce | Phase 2 contract library |
| `/api/v1/client-organization` | `modules/client-organization/routes.ts` | workforce | Phase 3 organization |
| `/api/v1/company-workspace` | `modules/company-workspace/routes.ts` | workforce | Phase 4 unified workspace |

### 2.2 Backend modules (key files)

- **client-identity**: `identityService.ts`, `routes.ts`
  - `ClientPortalIdentity`, membership request/approval, identity-based case grant.
- **client-workspace**: `workspaceService.ts`, `organizationalCaseService.ts`,
  `organizationalAccessPolicy.ts`, `organizationUnitService.ts`,
  `leadershipSummaryService.ts`, `organizationAdminService.ts`, `intakeService.ts`,
  `intakeAttachmentService.ts`, `intakeConversionService.ts`, `intakePolicy.ts`,
  `intakeTriageService.ts`.
- **client-organization**: `service.ts`, `registry.ts`, `routes.ts`
  - `projectOrganizationForCustomer` (dormant projector).
- **client-company**: `service.ts`, `projector.ts`, `registry.ts`, `routes.ts`
  - `projectCompanyOverviewForCustomer` (dormant projector).
- **client-contracts**: `service.ts`, `projector.ts`, `registry.ts`, `routes.ts`
  - `projectContractLibraryForCustomer` (dormant projector).
- **client-publication**: `publicationService.ts`, `publication.routes.ts`
  - Matter/document/action-request/safe-update publication; milestone publication.
- **client-interaction**: `base.ts` (canonical helpers), `customerRoutes.ts`,
  `internalRoutes.ts`, `requestService.ts`, `submissionService.ts`,
  `questionService.ts`, `gates.ts`, `fileValidation.ts`, `scannerAdapter.ts`,
  `quarantineAdapter.ts`, `notificationService.ts`.
- **company-workspace**: `service.ts`, `routes.ts` (Phase 4 workforce projection).

### 2.3 Frontend portal (`Frontend/src/app/portal/*`)

Routes:
- `/portal` (home)
- `/portal/ugyeim` (Ügyeim), `/portal/matters/[publicationId]`
- `/portal/teendoim` (Teendőim)
- `/portal/dokumentumok`, `/portal/documents/[publicationId]`
- `/portal/uzenetek` (Üzenetek)
- `/portal/action-requests/[requestId]`
- `/portal/szervezeti-attekintes` (Vezetői áttekintés / Együttműködési áttekintés)
- `/portal/megkeresesek`, `/portal/megkeresesek/uj`, `/portal/megkeresesek/[intakeId]`
- `/portal/login|register|onboarding|onboarding/pending|verify-email|forgot-password|reset-password`

Components:
- `components/client-portal/ClientPortalShell.tsx` — shell, nav, state machine.
- `components/client-portal/OrganizationPortalViews.tsx` — ORG / CASE_RELAY surfaces.
- `components/client-portal/PortalEntryLanding.tsx`, `PortalOnboarding.tsx`,
  `PortalWorkspaceSelector.tsx`, `MatterWorkspace.tsx`,
  `CustomerInteractionCard.tsx`, `ClientRequestComposer.tsx`, `IntakeTriage.tsx`,
  `OrganizationAdminControlPlane.tsx`, `PortalOnboarding.tsx`.
- API client: `lib/clientPortalApi.ts`, `lib/clientInteractionApi.ts`,
  `lib/clientPortalAdminApi.ts`.

### 2.4 Current navigation (ClientPortalShell.tsx nav memo, lines 355-371)

Built from workspace capabilities:
- Főoldal (home)
- Ügyeim (matters)
- Új megkeresés / Megkereséseim (ORG + intakes)
- Teendőim (tasks; ORG hides)
- Dokumentumok (documents)
- Üzenetek / Kommunikáció (messages)
- Vezetői áttekintés / Együttműködési áttekintés (ORG/CASE_RELAY + leadership)

There is **no** Szerződések, Vállalat, or Kapcsolat top-level menu yet; those
are the Phase 5 additions.

---

## 3. Authorization Model (customer → DTO)

### 3.1 Flow (single canonical path)

```
HTTP request
  └─ authenticateClientPortal (middleware/clientPortalAuth.ts)
       • verify Entra/External ID JWT (JWKS, issuer, audience, scope access_as_client)
       • resolveIdentity → ClientPortalSession
  └─ requireActiveClientPortalSession / requireRegisteredClientPortalSession
  └─ resolvePortalWorkspace(session, x-client-portal-workspace)
       → ResolvedPortalWorkspace {id, publicReference, clientId, mode, membershipId, ...}
       (client-workspace/workspaceService.ts)
  └─ resolveActiveCustomerGrant(identityId, caseId, workspaceId)
       → CustomerContext {clientPortalIdentityId, caseId, clientId, grantId,
                          workspaceId, membershipId, permissions, participantRole, isRequester}
       (client-interaction/base.ts)  ← THE single gate
  └─ resolveParticipantAccess(...) → typed CasePermissionDecision
       (client-workspace/organizationalAccessPolicy.ts)
  └─ service maps to explicit allowlist DTO + assertClientSafe()
```

### 3.2 Invariants enforced (canonical helpers)

- **`resolveActiveCustomerGrant`** (`base.ts:168`) is the single authorization
  gate for every customer route. Requires:
  1. identity ACTIVE
  2. ACTIVE + unexpired `ClientPortalWorkspaceMembership` for the workspace
  3. ACTIVE + unexpired `ClientPortalGrant` bound to (identity, workspace, case)
  4. grant.clientId == workspace.clientId (workspace/client derived server-side)
- **`assertClientSafe`** / **`forbidden`** (`base.ts:37-44`) scan every customer
  DTO for forbidden internal-field patterns (workInstruction, internalOwner,
  reviewer, taskNotes/taskStatus, annotation, storage/SharePoint refs, audit,
  AI prompt/response, scanProvider, ...). Fails closed with
  `PORTAL_DTO_FORBIDDEN_FIELD`.
- **`assertClientReadAccess`** (`base.ts:118`) — workforce read gate for the
  internal company/contracts/organization/company-workspace modules. Not a new
  ACL; ADMIN/PARTNER read any client, others only clients they have Case access
  in. It never implies Case/Document/HR access.
- **`requireInternal` / `requireOrganizationWorkspace` / `resolveParticipantAccess` /
  `requirePermission`** — layered typed enforcement.

### 3.3 Proven invariants (from code + tests)

- workspace membership **!=** Case access (membership alone never grants a case;
  `organizationalAccessPolicy.ts` requires both membership AND grant).
- Case access **!=** Document access (permission `DOCUMENT_READ` /
  `DOCUMENT_DOWNLOAD` gated separately; grant permissions allowlist).
- Case access **!=** Communication access (`MESSAGE_READ`/`MESSAGE_SEND` gated
  separately; `canViewMessages`/`canSendMessages`).
- Zero-grant access denied: `clientPortalOrganizationZeroGrant.integration.test.ts`.
- No second customer ACL is designed — all routes reuse the helpers above.

---

## 4. Organizational Client Model (Phase 3)

### 4.1 Canonical models

- `ClientOrganizationGroup` — canonical org unit (with optional `workspaceId`
  binding for ORGANIZATION workspaces, `parentGroupId` hierarchy). **Stays canonical.**
- `OrganizationPerson` — operational responsibility record, distinct from
  `ClientPortalIdentity` / membership / internal `User`. Optional
  `portalMembershipId` is a PLAIN reference, explicitly NOT an authorization
  principal (`client-organization/service.ts:96-118`).
- `OrganizationPersonResponsibility`, `OrganizationPersonDocumentLink` (HR-confidential gated).
- `ClientOrganizationMembership` / `ClientOrganizationMembershipRequest` — portal
  person↔org linking.

### 4.2 Dormant customer projector

`projectOrganizationForCustomer(clientId)` (`client-organization/service.ts:514`)
already projects, for the client:
- groups: id, name, parentGroupId (ACTIVE groups only)
- persons: id, name, jobTitle, organizationGroupId, managerName, deputyName,
  responsibilities (ACTIVE / ON_LEAVE persons only)
- calls `assertClientSafe`.

**Not wired to any route** (confirmed — no route references it). Phase 5 must
expose it behind a company-scoped authorization gate.

### 4.3 Safe vs internal

| Data | Safe to project | Internal |
|---|---|---|
| group name/id | ✔ | — |
| person name, jobTitle, group | ✔ | — |
| responsibilities summary/labels | ✔ (labels) | — |
| manager/deputy names | ✔ (names only) | manager/deputy IDs |
| employment status | ✔ (ACTIVE/ON_LEAVE only projected) | INACTIVE/ENDED/history |
| documentLinks (HR) | ✘ | gated to privileged roles |
| portalMembershipId | ✘ | internal reference |
| cross-client persons | ✘ | rejected (`CROSS_CLIENT_*`) |

No `OrganizationUnit` model is introduced; `ClientOrganizationGroup` remains canonical.

---

## 5. Contract Library Projector (Phase 2)

### 5.1 Canonical source

`ContractRecord` (clientId, title, contractType, status, businessOwnerLabel,
lawFirmOwnerUserId, sourceCaseId, canonicalDocumentVersionId, signatureDate,
effectiveDate, expiryDate, termType, noticePeriodDays, autoRenewal,
nextCriticalDate, securityClassification, internalNote, parent/family).
`ContractParty`, `ClientObligation`, `ContractEntitlement`.

### 5.2 Dormant customer projector

`projectContractLibraryForCustomer(clientId, publishedDocumentVersionIds)`
(`client-contracts/projector.ts:26`) — already enforces the safe publication
rule: a `ContractRecord` may appear ONLY when its canonical `DocumentVersion` is
explicitly customer-published via `ClientDocumentPublication` to the current
workspace/audience, AND status ∈ `{SIGNED_NOT_EFFECTIVE, ACTIVE, TERMINATING}`.

Projected: id, title, contractType, status, partners (displayName, roleCode),
effectiveDate, expiryDate, nextCriticalDate, documentAvailable, obligations
(OPEN/IN_PROGRESS), entitlements.

Strips: internal notes, raw User/DocumentVersion/Case/Task IDs, law-firm-only
classification detail, internal reasoning.

**Not wired to any route.** Phase 5 must add a company-level publication scope
and a customer contract route; Case access must NOT imply contract access.

### 5.3 Distinction required by the task

- `ContractRecord` internal source data — never exposed directly.
- Safe customer summary — the projector above.
- Explicit customer document publication — `ClientDocumentPublication` (exact version).
- Obligations / milestones — safe obligation summary only (no internal owner/task).
- Internal law-firm owner (`lawFirmOwnerUserId`) — never.
- Client-side responsible person (`businessOwnerPerson`/`OrganizationPerson`) —
  may be projected as display name only, not as an authorization signal.

---

## 6. Company Workspace / Phase 4 Reuse (Vállalat)

### 6.1 Phase 4 module (`company-workspace/service.ts`)

`getWorkspaceOverview` is a **workforce-only** projection over Phase 1-3 data:
operating profile + grouped facts, assessments + findings, contracts +
obligations with linked `OrganizationPerson` owners, organization summary +
responsibility gaps, development plan, deterministic attention summary.

It is deliberately **distinct** from `client-workspace` (CP1 customer workspace)
and exposes **no customer route** (`company-workspace/service.ts:1-21`).

### 6.2 What can be conceptually reused for the customer `Vállalat` page

The dormant `projectCompanyOverviewForCustomer(clientId)`
(`client-company/projector.ts:21`) already projects:
- profileHeadline (summary only)
- achieved milestones (safe summary)
- development initiatives (PLANNED/ACTIVE, safe fields)

### 6.3 Fields that must NEVER cross (task requirement)

- internal findings (`AssessmentFinding`) — unless explicitly published
- internal assessments unless explicitly published
- law-firm work instructions
- internal owner/reviewer (`lawFirmOwner`, reviewer IDs)
- internal attention signals (`attention` codes) — workforce-only
- Case-only details

Do NOT reuse the workforce `getWorkspaceOverview` DTO directly for customers.
A separate customer-safe projection (company-level) must be added and explicitly
gated.

---

## 7. Home Page — Eddig / Most / Következőként

### 7.1 Canonical publication model that already supports this

`ClientMatterPublication` + immutable `ClientMatterPublicationRevision`
(`client-publication/publicationService.ts`, schema `schema.prisma`):

- `clientSafeTitle`, `clientSafeStatus`, `clientSafeNextStep`,
  `clientSafeCurrentPosition`, `clientSafeWaitingOn`, `publicTargetDate`,
  `responsibleLawyerDisplay`
- `publishedDeadlinesSnapshot`, `safeUpdatesSnapshot`, `actionRequestsSnapshot`
- `milestonesSnapshot` (immutable) + `progressPercentage` (from weights only)
- `sourceFingerprint`, `audienceSnapshot`

### 7.2 Mapping

| Narrative | Canonical source |
|---|---|
| **Eddig** (immutable customer-published progress/history) | `milestonesSnapshot` + `progressPercentage` + `safeUpdatesSnapshot` (published only; never live task state) |
| **Most** (current customer-visible case/progress state) | current published revision: `clientSafeCurrentPosition`, `clientSafeStatus`, `clientSafeWaitingOn` |
| **Következőként** (explicit next step) | `clientSafeNextStep` + `publicTargetDate` (published only) |

### 7.3 Rules

- Do NOT calculate legal progress mathematically from live tasks.
- Do NOT expose live internal `Task` state.
- Customer progress is an **explicit publication/snapshot**:
  `ClientMatterPublicationRevision.milestonesSnapshot` +
  `progressPercentage`, computed only from published milestone weights
  (`computeMilestoneProgress`, `publicationService.ts:348`).

The portal already reads this via `portalHomeSnapshot`, `getPortalMatter`,
`listPortalMatters` in `routes/clientPortal.ts`.

---

## 8. ÜGYEK (Cases)

### 8.1 What `/portal` currently exposes

- `listOrganizationalCases` / `getOrganizationalCaseDetail`
  (`client-workspace/organizationalCaseService.ts`) — every row derived from an
  ACTIVE workspace-scoped participant grant + ACTIVE published matter snapshot.
- Row fields: `publicReference`, `matterPublicationId`, `publicTitle`,
  `organizationUnitName`, `relationshipToCase` (OWN/SHARED), `publicStatus`,
  `waitingOn`, `nextStep`, `publicTargetDate`, `customerActionRequired`,
  `lastPublishedUpdateAt`, plus detail: `currentStatusText`, `safeMilestones`,
  capability flags.
- `listPortalMatters` / `getPortalMatter` (publicationService) for the workspace.

### 8.2 Required future behavior / mapping

| Surface | Safe source |
|---|---|
| Safe title/number | `caseNumber` (publicReference) + `clientSafeTitle` |
| Customer-visible state | `clientSafeStatus` / `clientSafeCurrentPosition` |
| Published milestones/progress | `milestonesSnapshot` + `progressPercentage` |
| Documents | `ClientDocumentPublication` (exact version) |
| Messages/questions | `ClientQuestionThread` (participant-scoped) |
| Customer actions | `ClientActionRequest` (PUBLISHED) + `ClientRequest` (PUBLISHED) |

### 8.3 Never surface

- work instructions, task queues, internal review, internal comments, lawyer notes.

---

## 9. TEENDŐK (Tasks)

**This is NOT the internal `Task` table.**

Customer-facing concepts that power Teendők:

| Concept | Canonical model | Notes |
|---|---|---|
| Action requests | `ClientActionRequest` (PUBLISHED) | `clientSafeTitle`, `clientSafeInstructions`, `dueAt`, status |
| Document requests | `ClientRequest` type `DOCUMENT_UPLOAD` / `MISSING_DOCUMENT_REQUEST` / `CORRECTION_REQUEST` | PUBLISHED only |
| Correction requests | `ClientSubmission` status `CORRECTION_REQUESTED` + `ClientRequest` | explicit workflow |
| Customer questions requiring response | `ClientQuestionThread` status OPEN / `ClientSafeUpdate` | message domain |
| Published next steps | `ClientMatterPublicationRevision.clientSafeNextStep` | explicit snapshot |

The portal already builds a customer-safe cross-matter projection
(`portalWorkspace` in `routes/clientPortal.ts`), grouping action requests into
`now / upcoming / completed` buckets. The workforce `ClientRequest`/`Task`
workflow is operated only internally.

Customer cannot operate the lawyer `Task` workflow — no customer route touches
the internal `Task` table.

---

## 10. DOKUMENTUMOK (Documents)

### 10.1 Customer-safe publication

`ClientDocumentPublication` (`publicationService.ts`) + exact-version rules:
- Only explicitly published exact versions (`documentVersionId`).
- Immutable publication snapshot/reference via `sourceFingerprint` (hash of
  documentId, versionId, version, size, storageReference, spItemId, createdAt)
  and `audienceSnapshot`.
- No draft/internal versions (`status` must be PUBLISHED; DRAFT never readable).
- `visibility`: `WORKSPACE` (whole workspace) or `SELECTED_PARTICIPANTS`
  (explicit recipient list `ClientDocumentPublicationRecipient`).
- Eligibility gates at publish (`assertDocumentEligibility`): controlled file
  reference present, fingerprint unchanged, approved review evidence required,
  no open BLOCKING review points.

### 10.2 Customer upload path

`client-interaction/submissionService.ts`:
```
validate → quarantine (quarantineAdapter) → scan (scannerAdapter)
  → CLEAN only → workforce review → acceptFileIntoMatter (internal only)
```
- `addFile` never trusts declared MIME; stores to quarantine; scans.
- `acceptFileIntoMatter` server-side blocked unless `isAcceptableFileStatus`
  (CLEAN) — **no scanner = no CLEAN = no `DocumentVersion`**.
- Rejected/unsupported files persist truthful records (no bytes).
- Customer never creates a `DocumentVersion`.

---

## 11. KAPCSOLAT (Contact / Messaging)

Reuse the canonical `ClientQuestionThread` / `ClientQuestionMessage`
(`questionService.ts`). No parallel customer messaging model.

- **Read**: `getCustomerThread` / `listCustomerThreads` — participant-scoped
  (`ClientQuestionThreadParticipant` with `canRead`/`canWrite`, `removedAt`).
- **Customer send**: `createCustomerQuestion` / `sendCustomerMessage` —
  requires `MESSAGE_SEND`, participant `canWrite`, communication mode != EXTERNAL_ONLY.
- **Workforce response**: `draftAnswer` (DRAFT visibility) → `sendAnswer`
  (visibility SENT) — draft never customer-visible; only SENT messages shown.
- **Case association**: thread has `caseId`, `workspaceId`, `clientPortalIdentityId`.
- **Permissions**: `requirePermission(access, 'canViewMessages'/'canSendMessages')`.
- Read-state: `ClientQuestionThreadReadState` per membership.
- Attachments: only `CLEAN` submission files (`assertCleanSubmissionFiles`).

**Outlook boundary**: the workforce `communications` module
(`modules/communications/routes.ts`) is a separate internal inbox that does NOT
automatically become customer communication. Portal threads and Outlook inbox
remain distinct; only explicit portal messages surface to the customer.

---

## 12. Navigation / IA

### 12.1 Current nav (ClientPortalShell.tsx)

`Főoldal · Ügyeim · [Új megkeresés] · [Megkereséseim] · [Teendőim] ·
Dokumentumok · [Üzenetek/Kommunikáció] · [Vezetői áttekintés]`

### 12.2 Target IA (smallest coherent)

| Target | Backing |
|---|---|
| Főoldal | `/portal` (home) |
| Ügyek | `/portal/ugyeim` (+ org case list/detail) |
| Szerződések | NEW customer contract projector route |
| Teendők | `/portal/teendoim` (action/request projection) |
| Vállalat | NEW company projector route |
| Dokumentumok | `/portal/dokumentumok` |
| Kapcsolat | `/portal/uzenetek` (messaging) |

Avoid: duplicate menu items, implementation jargon, deep nesting, ERP feel.

### 12.3 Old → target route map (do NOT delete legacy routes yet)

| Legacy route | Target |
|---|---|
| `/portal/ugyeim` | Ügyek |
| `/portal/teendoim` | Teendők |
| `/portal/dokumentumok`, `/portal/documents/[id]` | Dokumentumok |
| `/portal/uzenetek`, `/portal/matters/[id]` | Kapcsolat |
| `/portal/szervezeti-attekintes` | (kept; Vállalat supersedes for ORG) |
| `/portal/megkeresesek*` | (kept for ORG intake) |
| (none) | NEW: Szerződések, Vállalat |

---

## 13. Peterfi Fixture

- **Peterfi is a production fixture** (a specific organizational customer
  workspace; the identity `peterfijanos53` is referenced only in a git commit
  message, not in source/seed files).
- There is **no** Peterfi fixture in the canonical tree seeds
  (`prisma/seed.ts`, `scripts/seed.ts`, etc. — verified no match).
- The canonical repo builds acceptance fixtures **per-test** in
  `Backend/tests/*.integration.test.ts` (e.g. `companyWorkspace.integration.test.ts`,
  `clientPortalOrganizationalAccess.integration.test.ts`) using UUID-suffixed,
  ephemeral rows.

### 13.1 Acceptance-testable with existing data

- Customer authorization (membership + grant + workspace client match).
- Cross-client isolation.
- Case list/detail safe projection.
- Document exact-version publication.
- Contract safe projection.
- Messaging permissions.
- Company workspace workforce projection.

### 13.2 Genuinely missing fixture data (do not create it)

- An `ORGANIZATION` workspace with a published contract library + published
  company profile + published milestones for the **same** customer identity
  (i.e. an end-to-end Phase-5 customer journey) is not present as a canonical
  fixture. Building it is implementation-phase work, not preflight.

### 13.3 Rules

- Never mutate production.
- Never expose personal login details/secrets.

---

## 14. Schema Gap Analysis

Strong preference: **NO new parallel persistence.**

Reusable existing models:

| Phase 5 need | Reused model |
|---|---|
| workspace / membership / grant | `ClientPortalWorkspace`, `ClientPortalWorkspaceMembership`, `ClientPortalGrant` |
| org unit | `ClientOrganizationGroup` (+ `OrganizationPerson`) |
| contract library | `ContractRecord` (+ obligations/entitlements) |
| customer publication | `ClientDocumentPublication`, `ClientMatterPublication(Revision)` |
| milestones / progress publication | `ClientMatterPublicationRevision.milestonesSnapshot` + `progressPercentage` |
| messaging | `ClientQuestionThread` / `ClientQuestionMessage` |
| document publication | `ClientDocumentPublication` |
| action / document requests | `ClientActionRequest`, `ClientRequest` |

If any schema change appears necessary, the exact reason must be documented
here. **Currently none is required** for the mapped surfaces; all customer-safe
projections can reuse existing columns/relations. (Company contract/company
customer publication scope is a **routing/gating** concern, not a schema one.)

---

## 15. Security Threat Map

| # | Threat | Existing mitigation | Missing control (Phase 5) |
|---|---|---|---|
| 1 | Same-client Case fallback | `resolveActiveCustomerGrant` requires exact grant; org case list filters by grant + client match | Verify every new route reuses the single resolver (no ad-hoc fallback) |
| 2 | Org membership granting unintended Case access | membership alone never grants case; both required; zero-grant test | Ensure any company-scope route does NOT derive case access from membership |
| 3 | Document leakage | exact-version publication + fingerprint + recipient list + approved review + no draft | Company contract projector must require published DocumentVersion before exposing |
| 4 | Internal assessment/finding leakage | company projector strips findings; `assertClientSafe`; no customer route | Company customer projector must remain distinct from workforce DTO |
| 5 | Internal Task leakage | no customer route touches `Task`; milestone publication is snapshot-based | Do not add any customer route reading live `Task` |
| 6 | Internal communication leakage | draft messages SENT-only; Outlook inbox separate; participant-scoped | Confirm no portal surface auto-publishes Outlook content |
| 7 | Organization person overexposure | org projector filters ACTIVE/ON_LEAVE, no IDs/HR links | Company customer projector must not expose manager IDs, HR docs, cross-client persons |
| 8 | Customer publication race | optimistic concurrency (revision), transactional publish, sourceFingerprint | Re-check on company/contract publication reads |
| 9 | Guessed IDs | grant-based authorization; workspace client match; publicReference used for cases | Use non-enumerable public references; never trust raw internal IDs in customer input |
| 10 | Stale workspace membership | membership status/expiry checked at resolve time | Re-verify on every request (stateless), and consider revocation propagation |
| 11 | Cross-client relations | `CROSS_CLIENT_*` guards everywhere | Extend same-client guards to any new company/contract customer relation |

---

## 16. Implementation Slices (recommended order)

Derived from actual repo dependencies (auth first, then case/publication, then
company/contract projectors that depend on publication scope, then messaging,
then hardening):

1. **A. Portal shell + navigation** — add the 7-item IA; keep legacy routes.
2. **B. Safe home projector** — wire `Eddig/Most/Következőként` from published
   matter revision; no live task.
3. **C. Ügyek (Cases)** — expose `listOrganizationalCases`/detail behind grant;
   ensure only authorized cases.
4. **D. Szerződések (Contracts)** — activate `projectContractLibraryForCustomer`
   behind a company-level publication scope (exact published DocumentVersion).
5. **E. Vállalat (Company)** — activate `projectCompanyOverviewForCustomer`
   behind a company-scope gate; separate from workforce DTO.
6. **F. Teendők** — reuse action/request/submission projections (already in
   `portalWorkspace`).
7. **G. Dokumentumok** — exact-version publication list + upload path.
8. **H. Kapcsolat** — participant-scoped `ClientQuestionThread` messaging.
9. **I. Acceptance / hardening** — security threat tests, cross-client
   isolation, empty states, responsive nav.

Order note: company/contract projectors (D, E) depend on the publication-scope
decision and on the auth gate from A/C, so they come after C.

---

## 17. Test Plan

Reuse existing integration harnesses (`Backend/tests/*.integration.test.ts`,
PostgreSQL-backed, `CLIENT_INTERACTION_TEST_DATABASE_URL`).

Required tests before implementation:

| Area | Test |
|---|---|
| Membership/grant authorization | identity+membership+grant required; any missing → 403 |
| Cross-client isolation | client B data never in client A portal |
| Customer route isolation | company/contract routes only via customer grant; no internal route for customer |
| No internal field leakage | `assertClientSafe` + forbidden-field scan on every new DTO |
| Contract safe projection | only published-DocumentVersion records, safe fields only |
| Organization safe projection | ACTIVE/ON_LEAVE persons only, no HR/internal IDs |
| Document exact-version publication | fingerprint + recipient + approved review |
| Customer action requests | PUBLISHED only, buckets, no internal statuses |
| Message permissions | read/send gating, draft invisible |
| Responsive navigation | frontend static test (nav renders, no duplicates) |
| Empty states | honest "no data" messages |
| Peterfi acceptance | end-to-end ORG customer journey on a workspace fixture |

Reusable harnesses: `companyWorkspace.integration.test.ts`,
`clientPortalOrganizationalAccess.integration.test.ts`,
`clientContractLibrary.integration.test.ts`,
`clientPublicationFoundation.integration.test.ts`,
`clientMatterMilestonePublication.integration.test.ts`,
`clientPortalWorkspace.integration.test.ts`,
`clientInteraction.integration.test.ts`, `organizationalAccessPolicy.test.ts`,
`clientPortalReadOnlyAlpha.static.test.ts`.

---

## 18. Blocking Unknowns

1. Whether the customer company/contract publication scope requires a new
   "company-level audience" concept (routing/gating) vs reusing the workspace
   grant — decision needed before slices D/E.
2. Whether `projectCompanyOverviewForCustomer` should read from published matter
   revisions or from a new explicit company publication — no such model exists
   today (only dormant projector).
3. Contract customer projector has no test yet (dormant) — behavior of the
   published-DocumentVersion-required rule is untested at the route level.
4. Peterfi production fixture is not reproducible from canonical seeds; a real
   end-to-end fixture is implementation-phase work.

---

## 19. Product-Code Changes

**ZERO.** No product code was modified. Only this preflight document is added
under `docs/phase5/`.

---

## 20. Phase-5 Implementation Ready to Start After Phase-4 Acceptance

**YES** — the canonical repository already contains dormant, correct,
customer-safe projectors (`projectOrganizationForCustomer`,
`projectContractLibraryForCustomer`, `projectCompanyOverviewForCustomer`) plus a
mature authorization core (`resolveActiveCustomerGrant`,
`resolveParticipantAccess`, `assertClientSafe`) and an immutable publication
model (`ClientMatterPublicationRevision`, `ClientDocumentPublication`,
`ClientQuestionThread`). Phase 5 can be built by activating these behind
company-scope gates with no schema change, once Phase 4 is production-accepted.

`PHASE5_ORGANIZATIONAL_PORTAL_PREFLIGHT_READY`
