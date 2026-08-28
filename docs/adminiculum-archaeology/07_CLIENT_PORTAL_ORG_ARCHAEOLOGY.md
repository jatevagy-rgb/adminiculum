# 07 — Client / Portal / Organization Archaeology

> All generations of client dossier, admin, onboarding, membership, invitation, portal user, portal workspace, grants, individual/organization/integrated portal, organization persons/hierarchy/authority/access. Canonical `50945ecd`. Confidence `PROVEN`/`STRONGLY_INDICATED`/`UNPROVEN`.

## Verdict on the core question

**Membership requests DO work end-to-end at canonical — PROVEN.** There is a live, fully-wired self-service onboarding surface + a transactional admin approval path. The generation that made membership requests *actually work* is the identity generation (2026-07-28 → 08-06) and it is a **strict ancestor of canonical**. DO NOT treat "model exists" as "UX works" — here the UX genuinely works.

## Generations (oldest → canonical)

| Gen | State | SHA | PROVEN? |
|---|---|---|---|
| Gen 0 | legacy pre-boxing backend at root `src/modules/*`; only `src/routes/clientPortal.ts` stub (filter by `role==='CLIENT'`, nominal `x-user-id` header) | initial → `3eb04bd^` | **never a real onboarding flow** |
| Gen 1 | read-only portal alpha — `ClientPortalShell` + real API (`getPortalHome/Matter/Document`, MSAL); routes `portal/`, `portal/matters/[publicationId]`, `portal/documents/[publicationId]`, `portal/action-requests/[requestId]`; grants keyed by `clientUserId` | `836d256` | ancestor of canonical |
| Gen 2 | publication foundation — grant requires `clientUserId` anchored to `User` | `2975942` | ancestor |
| Gen 3 | MSAL separation + JIT identity — `ClientPortalIdentity` upserted JIT (`clientPortalAuth.ts`) | `692f6d7` | ancestor |
| Gen 4 | **identity membership foundation** — `ClientPortalIdentity`, `ClientOrganizationMembershipRequest`, `ClientOrganizationMembership`, `ClientPortalInvitation`, `ClientPortalAccountType`, `MembershipRequest`; `portal/register`, `portal/onboarding*`, verify-email, login, forgot/reset | `9809c4c` | ancestor — membership gate born |
| Gen 5 | workspace authorization — `ClientPortalWorkspace`, `ClientPortalWorkspaceMembership`, `ClientPortalWorkspaceEvent`, `ClientPortalWorkspaceMode`, `MembershipRole`; grants become identity-keyed | `908b464` + `7aafff6`,`22dd880` | ancestor |
| Gen 6 | onboarding UI + admin assignment — `PortalOnboarding.tsx`, `ClientIdentityFlowShell`, admin workspace assignment | `0d7879d`,`f7d2d85`,`4a3352a` | ancestor |
| Gen 7 | membership approval assignment model — existing-vs-new client, org units, `MODE_LABELS` | `35ca0e6` | ancestor |

## The real membership-request UX at canonical (PROVEN)

```
Entra External ID signup (OTP-verified by issuer)       [portal/register]
  → JIT identity upsert, status=REGISTERED              [clientPortalAuth.ts:resolveIdentity]
  → /portal/login → shell resolver                      [ClientPortalShell.tsx getPortalIdentityContext]
  → state=ONBOARDING_REQUIRED → PortalOnboarding        [PortalOnboarding.tsx OnboardingForm]
      mode: INDIVIDUAL | ORGANIZATION (CASE_RELAY is admin-assigned only)
      fields: displayName, orgName, unit, jobTitle, corporateEmail
      POST /api/v1/client-identity/me/membership-requests [client-identity/routes.ts:34]
  → status=PENDING_REVIEW (identity → MEMBERSHIP_PENDING) [identityService.ts:submitMembershipRequest]
  → admin queue: GET /admin/membership-requests            [client-identity/routes.ts:62]
  → approveMembershipRequest (single $transaction)         [identityService.ts:approveMembershipRequest]
      resolve/select/create Client + ClientPortalWorkspace (EXISTING/NEW_CLIENT, actualMode wins)
      → clientOrganizationMembership (ACTIVE) + clientPortalWorkspaceMembership (ACTIVE)
      → identity status → ACTIVE
  → customer re-login → resolver state=READY → workspace
  → case access = SEPARATE explicit grant   GET /admin/grants (createGrantForApprovedMembership)
      permissions: MATTER_READ, DOCUMENT_READ, DOCUMENT_DOWNLOAD, ACTION_REQUEST_READ, UPDATE_READ
```

Three customer-facing resolver states so the portal never dead-ends (`workspaceService.ts:resolveOnboardingState`): `REQUEST_PENDING`, `REQUEST_REJECTED` (resubmit), `INVITATION_PENDING` (accept). **PROVEN.**

## What was LOST / changed during portal refactoring

1. **Direct grant→browse UX became gated behind membership approval.** In Gen 1–2 an admin granted a portal user and they immediately saw published cases. Now there are **three separate decisions** before content: identity → workspace-membership approval → case grant. `approveMembershipRequest` explicitly documents *"Approval grants ONLY workspace membership: no case grant, document, communication, summary, or billing access is created here."* → a **capability-contraction** of *ease* (not feature removal) — the security posture is intentional.
2. **`portal/action-requests` present in canonical** — not lost.
3. **Mock `portal/uploads` + `portal/matters/[matterId]` generation was NEVER merged** — it lives only in divergent branches (`codex/ops-pages-ux-cleanup-1`, `claude/next-development`) as `mockPortalData` and contradicts the CP identity model + product-truthfulness rules → **SHOULD_NOT_RETURN**.

## Organization / hierarchy / authority / CASE_RELAY (PROVEN at canonical)

- **Hierarchy:** `ClientOrganizationGroup` (self-relation `parentGroup/childGroups`), `OrganizationPerson` with `managerPersonId`, `deputyPersonId`, `directReports`, `isDeputyFor`; `OrganizationPersonResponsibility`; `OrganizationPersonDocumentLink`. `OrganizationPerson` first appeared `0b2a7d6` (2026-08-19, Phase 3).
- **Access policy:** `organizationAdminService.ts` + `organizationalAccessPolicy.ts` (workspace-linked units); `ClientPortalSummaryScope` scopes summaries per membership/group.
- **CASE_RELAY** — a `ClientPortalWorkspaceMode`. On creation `connectedSystemState:'CONFIGURATION_REQUIRED'`, `communicationMode:PORTAL_PRIMARY`. UI routes CASE_RELAY and ORGANIZATION through `OrganizationPortalViews` (mode-based nav in `ClientPortalShell.tsx`). Not independently user-requestable (`PUBLIC_REQUEST_MODES = ['INDIVIDUAL','ORGANIZATION']`). **PROVEN.**
- **Integrated client:** `client-company`, `client-contracts`, `client-interaction`, `client-publication`, `company-workspace` all reuse `assertClientReadAccess`/`assertInternalCaseAccess`/`internalCaseScope` from `client-interaction/base.ts` — canonical single source of truth. **PROVEN.**
- **Grants authorization gate:** `resolveActiveCustomerGrant` (`client-interaction/base.ts`) is the single gate for every customer interaction route; requires ACTIVE identity + ACTIVE workspace membership + ACTIVE unexpired grant. **PROVEN.**

## Client dossier (canonical, plus this-workspace work)

- `app/clients/[clientId]/page.tsx` — cases, collaborators, house style, "Kapcsolt kommunikációk" panel, "Összes kommunikáció →".
- **Phase-4 snapshot (branch `peterfi/client-overview-communication-snapshot`, not canonical):** made the client Overview communication entry always-available ("Kommunikáció megnyitása →") — conclusion was that no safe client-wide read model existed at the time, so no N+1 snapshot was added (the client-wide read model is Phase 5, see `04`).
- **Phase-2 case-first context (branch `peterfi/case-first-communication-context`):** added `/clients/[clientId]/communications` client communication history surface. Branch-only.

## Models that are NOT user-facing UX (distinguish model vs flow)

`ClientPortalGrant.clientUserId` → `RENAMED→MIGRATED` (now nullable `String?`, `clientPortalIdentityId` added; both coexist). `ClientPortalAccountType` → `MIGRATED` (INDIVIDUAL/ORGANIZATION_MEMBER → INDIVIDUAL, derived). `ClientMatterPublication` → `MIGRATED` (ancestor). `ClientSubmission`/`ClientQuestionThread`/`ClientOperatingProfile` → `MIGRATED`. `OrganizationPerson` → `RENAMED` (org-units → person-centric).
