# Client Portal v1 Schema Migration Draft Review

Classification target: `client_portal_v1_schema_migration_draft_review_documented_no_runtime_change`

This document is a docs-only review of the first future inert Client Portal schema migration. It does not edit `Backend/prisma/schema.prisma`, create a Prisma migration, run `prisma migrate`, add API routes, add frontend UI, modify auth, enable the client portal, add seed data, deploy, or change runtime behavior.

## 1. Executive summary

The first future Client Portal schema migration should be CP-SCHEMA-1 only: inert, additive foundation tables for external portal identity, client/team membership, invitations, per-client feature settings, and audit events.

Recommended CP-SCHEMA-1 scope:

- `ClientPortalUser`
- `ClientPortalTeam`
- `ClientPortalMembership`
- `ClientPortalInvitation`
- `ClientPortalFeatureSettings`
- `ClientPortalAuditEvent`
- stable security-critical enums only

Do not include in CP-SCHEMA-1:

- case grants;
- document publication;
- communication publication;
- client portal request objects;
- report snapshots;
- external workflow connector tables;
- existing-model visibility fields;
- API endpoints;
- frontend routes.

Safety conclusion: CP-SCHEMA-1 can be made additive and inert because it creates new tables only, uses default-off settings, has no runtime users yet, and does not add required fields to populated existing tables. It must not make any existing case, document, communication, task, time entry, review note, AI output, or SharePoint metadata client-visible.

## 2. Current schema anchor review

### Canonical client/account anchor

Selected anchor: `Client`.

Rationale:

- `Client` is the current client/company/customer equivalent.
- Primary key type is `String @id @default(uuid())`.
- Table mapping is `@@map("clients")`.
- It already owns `Case[]`, `Document[]`, `Department[]`, `Matter[]`, and `ClientWorkgroup[]`.
- It is the natural root for portal membership and per-client feature settings.

Ownership paths:

- Client to case: `Client.cases -> Case.clientId -> Case.client`.
- Client to document: `Client.documents -> Document.clientId -> Document.client`.
- Client to communication: `Communication.clientId` exists but is nullable and has no explicit relation in the current schema; ownership is usable only when populated.
- Case to document: `Case.documents -> Document.caseId`.
- Case to communication: `Communication.caseId` exists but is nullable and has no explicit relation in the current schema.
- Case to task: `Case.tasks -> Task.caseId`.
- Matter/time path: `Client.matters -> Matter.timeEntries`; this remains internal-only for portal v1.

Safety as portal ownership root:

- Safe enough for CP-SCHEMA-1 membership/settings because `Client` is the canonical account record.
- Not sufficient by itself for resource access. Later phases still need grants/publications and client-safe DTOs.

Ambiguities and risks:

- `ClientWorkgroup` and `Department` are existing client-related grouping models, but they were not designed as portal security boundaries.
- `Communication.clientId` is nullable, so communications cannot be portal-visible by client ownership alone.
- Existing `Client.notes`, redaction profile, house-style settings, workload, matter, and time data are internal unless explicitly projected later.

### Existing ID and naming conventions

Observed conventions:

- Most models use `String @id @default(uuid())`.
- `CaseCollaborator` uses `@db.Uuid` and DB-generated UUID, but this is not the dominant convention.
- Most models use `createdAt DateTime @default(now())`.
- Mutable models often use `updatedAt DateTime @updatedAt`.
- Tables are mapped with `@@map("snake_case_plural")`.
- Common indexes use `@@index([...])`, sometimes with explicit `map`.
- Some relations use `onDelete: Cascade` for child records; audit/sensitive historical records should not cascade.

CP-SCHEMA-1 should follow the dominant string UUID and snake-case table mapping style.

## 3. CP-SCHEMA-1 scope

Included:

- external portal identity;
- portal team grouping;
- membership/access gate to `Client`;
- invitation lifecycle;
- per-client feature settings with all features off;
- audit events capable of recording future portal actions.

Excluded:

- no access grants to `Case`;
- no `Document` publication;
- no `Communication` publication;
- no `ClientPortalRequest`;
- no `ClientPortalReportSnapshot`;
- no connector/integration models;
- no changes to internal `User`, `Case`, `Document`, `Communication`, `Task`, `TimeEntry`, `LegalAnalysis`, review, AI, or SharePoint-related models.

## 4. Proposed future Prisma draft

The following draft is intentionally not applied. Relation backfields on existing models are noted separately and should be reviewed before a real schema edit.

```prisma
model ClientPortalUser {
  id              String                 @id @default(uuid())
  email           String
  displayName     String
  status          ClientPortalUserStatus @default(INVITED)
  authProvider    String?
  externalSubject String?
  lastLoginAt     DateTime?
  revokedAt       DateTime?
  metadata        Json?
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt

  memberships     ClientPortalMembership[]
  invitations     ClientPortalInvitation[] @relation("AcceptedClientPortalInvitation")

  @@index([email])
  @@index([status])
  @@unique([authProvider, externalSubject], map: "client_portal_users_provider_subject_key")
  @@map("client_portal_users")
}
```

Review notes:

- Do not rely on this table alone for access.
- `email` should be normalized lower-case by runtime code later.
- A global `email @unique` is tempting but may be too strict if external IdP/provider identity matters later.
- `@@unique([authProvider, externalSubject])` with nullable fields needs SQL review in PostgreSQL; multiple null combinations may be allowed. If provider subject is not used in v1, keep a normal index instead and revisit uniqueness.

```prisma
model ClientPortalTeam {
  id          String                 @id @default(uuid())
  clientId    String
  client      Client                 @relation(fields: [clientId], references: [id], onDelete: Restrict)
  name        String
  code        String?
  status      ClientPortalTeamStatus @default(ACTIVE)
  archivedAt  DateTime?
  createdAt   DateTime               @default(now())
  updatedAt   DateTime               @updatedAt

  memberships ClientPortalMembership[]
  invitations ClientPortalInvitation[]

  @@unique([clientId, name], map: "client_portal_teams_client_name_key")
  @@unique([clientId, code], map: "client_portal_teams_client_code_key")
  @@index([clientId])
  @@index([status])
  @@map("client_portal_teams")
}
```

Review notes:

- `code` nullable plus unique may allow multiple nulls in PostgreSQL; acceptable if code is optional.
- `onDelete: Restrict` is safer than cascade because team deletion should not destroy membership/invite history.
- Consider using existing `ClientWorkgroup` instead only if product confirms the semantics match external teams.

```prisma
model ClientPortalMembership {
  id                         String                       @id @default(uuid())
  clientPortalUserId         String
  clientPortalUser           ClientPortalUser             @relation(fields: [clientPortalUserId], references: [id], onDelete: Restrict)
  clientId                   String
  client                     Client                       @relation(fields: [clientId], references: [id], onDelete: Restrict)
  teamId                     String?
  team                       ClientPortalTeam?            @relation(fields: [teamId], references: [id], onDelete: SetNull)
  role                       ClientPortalRole
  status                     ClientPortalMembershipStatus @default(ACTIVE)
  invitedByInternalUserId    String?
  approvedByInternalUserId   String?
  invitedByInternalUser      User?                        @relation("ClientPortalMembershipInvitedBy", fields: [invitedByInternalUserId], references: [id], onDelete: SetNull)
  approvedByInternalUser     User?                        @relation("ClientPortalMembershipApprovedBy", fields: [approvedByInternalUserId], references: [id], onDelete: SetNull)
  revokedAt                  DateTime?
  metadata                   Json?
  createdAt                  DateTime                     @default(now())
  updatedAt                  DateTime                     @updatedAt

  @@index([clientPortalUserId])
  @@index([clientId])
  @@index([teamId])
  @@index([status])
  @@index([clientPortalUserId, clientId, status], map: "client_portal_memberships_user_client_status_idx")
  @@unique([clientPortalUserId, clientId, teamId, role], map: "client_portal_memberships_user_client_team_role_key")
  @@map("client_portal_memberships")
}
```

Review notes:

- This is the main portal access gate.
- The unique strategy is safe only if one active/revoked historical row per user/client/team/role is acceptable. If repeated revoke/reinvite history is needed, use no Prisma `@@unique` and create a partial unique SQL index only for active memberships later.
- Internal user references should be optional and `SetNull` to preserve membership records if an internal user is deleted.
- Client/user deletion should be restricted; revocation is safer than deletion.

```prisma
model ClientPortalInvitation {
  id                           String                       @id @default(uuid())
  email                        String
  clientId                     String
  client                       Client                       @relation(fields: [clientId], references: [id], onDelete: Restrict)
  proposedRole                 ClientPortalRole
  proposedTeamId               String?
  proposedTeam                 ClientPortalTeam?            @relation(fields: [proposedTeamId], references: [id], onDelete: SetNull)
  tokenHash                    String
  status                       ClientPortalInvitationStatus @default(PENDING)
  invitedByInternalUserId      String
  invitedByInternalUser        User                         @relation("ClientPortalInvitationInvitedBy", fields: [invitedByInternalUserId], references: [id], onDelete: Restrict)
  acceptedByClientPortalUserId String?
  acceptedByClientPortalUser   ClientPortalUser?            @relation("AcceptedClientPortalInvitation", fields: [acceptedByClientPortalUserId], references: [id], onDelete: SetNull)
  expiresAt                    DateTime
  acceptedAt                   DateTime?
  revokedAt                    DateTime?
  createdAt                    DateTime                     @default(now())
  updatedAt                    DateTime                     @updatedAt

  @@unique([tokenHash], map: "client_portal_invitations_token_hash_key")
  @@index([email, clientId])
  @@index([status])
  @@index([expiresAt])
  @@map("client_portal_invitations")
}
```

Review notes:

- Store only hashed token/code; never raw invite token.
- `invitedByInternalUserId` is required in draft. If migration/application needs system invitations later, make it nullable plus actor audit.
- No domain-only auto-access.

```prisma
model ClientPortalFeatureSettings {
  id                          String                                  @id @default(uuid())
  clientId                    String                                  @unique
  client                      Client                                  @relation(fields: [clientId], references: [id], onDelete: Restrict)
  portalLevel                 ClientPortalLevel                       @default(OFF)
  uploadsEnabled              Boolean                                 @default(false)
  messagesEnabled             Boolean                                 @default(false)
  reportsEnabled              Boolean                                 @default(false)
  integrationsEnabled         Boolean                                 @default(false)
  monthlyReportEnabled        Boolean                                 @default(false)
  teamAccessEnabled           Boolean                                 @default(false)
  clientAdminEnabled          Boolean                                 @default(false)
  defaultCaseVisibilityPolicy ClientPortalDefaultCaseVisibilityPolicy @default(EXPLICIT_GRANT_ONLY)
  updatedByInternalUserId     String?
  updatedByInternalUser       User?                                   @relation("ClientPortalFeatureSettingsUpdatedBy", fields: [updatedByInternalUserId], references: [id], onDelete: SetNull)
  createdAt                   DateTime                                @default(now())
  updatedAt                   DateTime                                @updatedAt

  @@index([portalLevel])
  @@map("client_portal_feature_settings")
}
```

Review notes:

- Default `portalLevel=OFF` and all booleans false.
- Unique client settings row is appropriate.
- This table alone must not enable runtime behavior; env gates remain primary.

```prisma
model ClientPortalAuditEvent {
  id                       String                  @id @default(uuid())
  clientId                 String?
  client                   Client?                 @relation(fields: [clientId], references: [id], onDelete: SetNull)
  actorType                ClientPortalActorType
  actorClientPortalUserId  String?
  actorClientPortalUser    ClientPortalUser?       @relation(fields: [actorClientPortalUserId], references: [id], onDelete: SetNull)
  actorInternalUserId      String?
  actorInternalUser        User?                   @relation("ClientPortalAuditInternalActor", fields: [actorInternalUserId], references: [id], onDelete: SetNull)
  actorConnectorId         String?
  action                   String
  resourceType             String
  resourceId               String?
  caseId                   String?
  documentId               String?
  communicationId          String?
  requestId                String?
  metadata                 Json?
  ipAddress                String?
  userAgent                String?
  createdAt                DateTime                @default(now())

  @@index([clientId, createdAt])
  @@index([actorType, actorClientPortalUserId])
  @@index([actorType, actorInternalUserId])
  @@index([resourceType, resourceId])
  @@index([action])
  @@index([caseId])
  @@index([documentId])
  @@index([communicationId])
  @@map("client_portal_audit_events")
}
```

Review notes:

- Audit `clientId` can be nullable for failed login/invitation/system events before a client is resolved, but resource events should populate it.
- `action` and `resourceType` are strings in this draft to avoid enum churn.
- Do not cascade delete audit events.
- `caseId`, `documentId`, and `communicationId` are scalar IDs only in CP-SCHEMA-1; avoid relations until publication/access tables are introduced.

### Existing model backrelations

A real Prisma schema edit may require adding backrelation fields to `Client`, `User`, and `ClientPortalUser`. Keep names explicit and low-noise. Example future relation names:

- `Client.portalTeams`
- `Client.portalMemberships`
- `Client.portalInvitations`
- `Client.portalFeatureSettings`
- `Client.portalAuditEvents`
- `User.clientPortalInvitationsSent`
- `User.clientPortalMembershipsInvited`
- `User.clientPortalMembershipsApproved`
- `User.clientPortalFeatureSettingsUpdates`
- `User.clientPortalAuditEvents`

Backrelation naming should be reviewed during implementation to avoid relation-name conflicts with existing `User` relations.

## 5. Proposed enum draft

### Stable enough for Prisma enums in CP-SCHEMA-1

`ClientPortalUserStatus`

- `INVITED`: created or reserved through invitation but not active.
- `ACTIVE`: can authenticate if membership permits.
- `SUSPENDED`: temporarily blocked.
- `REVOKED`: permanently or administratively removed.

Churn risk: low.

`ClientPortalTeamStatus`

- `ACTIVE`: can be used for memberships/invitations.
- `ARCHIVED`: no new access; historical membership retained.

Churn risk: low.

`ClientPortalMembershipStatus`

- `ACTIVE`: usable membership.
- `SUSPENDED`: temporarily blocked.
- `REVOKED`: access removed.
- `EXPIRED`: time-limited membership ended.

Churn risk: low.

`ClientPortalRole`

- `CLIENT_REQUESTER`
- `CLIENT_TEAM_LEAD`
- `CLIENT_MANAGER`
- `CLIENT_ADMIN`

Churn risk: medium. Security-critical enough to type as enum, but future custom roles may require a role table later.

`ClientPortalInvitationStatus`

- `PENDING`
- `ACCEPTED`
- `EXPIRED`
- `REVOKED`

Churn risk: low.

`ClientPortalLevel`

- `OFF`
- `BASIC`
- `WORKSPACE`
- `CONNECTED`

Churn risk: medium. Suitable if product levels are stable; otherwise use string for first implementation.

`ClientPortalDefaultCaseVisibilityPolicy`

- `EXPLICIT_GRANT_ONLY`
- `CLIENT_WIDE_AFTER_APPROVAL`
- `TEAM_GRANT_AFTER_APPROVAL`

Churn risk: medium. Security-sensitive; enum is acceptable if values are reviewed.

`ClientPortalActorType`

- `CLIENT_USER`
- `INTERNAL_USER`
- `CONNECTOR`
- `SYSTEM`

Churn risk: low.

### Prefer string initially

`ClientPortalAuditAction`

- Candidate values: `LOGIN`, `VIEW_CASE`, `UPLOAD_DOCUMENT`, `DOWNLOAD_DOCUMENT`, `SEND_MESSAGE`, `MEMBERSHIP_INVITED`, `MEMBERSHIP_REVOKED`, `FEATURE_SETTINGS_UPDATED`.
- Recommendation: use string in CP-SCHEMA-1 to avoid migration churn while audit taxonomy matures.

`ClientPortalResourceType`

- Candidate values: `CLIENT`, `MEMBERSHIP`, `INVITATION`, `FEATURE_SETTINGS`, `CASE`, `DOCUMENT`, `COMMUNICATION`, `REQUEST`, `REPORT`.
- Recommendation: use string in CP-SCHEMA-1 because later resource types are not yet implemented.

## 6. Relation and onDelete review

| Model | Relation | Required? | Proposed onDelete | Review |
| --- | --- | --- | --- | --- |
| `ClientPortalTeam.client` | `Client` | Yes | `Restrict` | Do not delete client if portal team history exists. |
| `ClientPortalMembership.clientPortalUser` | `ClientPortalUser` | Yes | `Restrict` | Revoke user instead of deleting. |
| `ClientPortalMembership.client` | `Client` | Yes | `Restrict` | Client deletion should be deliberate. |
| `ClientPortalMembership.team` | `ClientPortalTeam` | No | `SetNull` | Team archival/deletion should not destroy membership history. |
| `ClientPortalMembership.invitedByInternalUser` | `User` | No | `SetNull` | Preserve membership if internal inviter is removed. |
| `ClientPortalMembership.approvedByInternalUser` | `User` | No | `SetNull` | Preserve membership if approver is removed. |
| `ClientPortalInvitation.client` | `Client` | Yes | `Restrict` | Invitation history tied to client. |
| `ClientPortalInvitation.proposedTeam` | `ClientPortalTeam` | No | `SetNull` | Team may archive while invite history remains. |
| `ClientPortalInvitation.invitedByInternalUser` | `User` | Yes in draft | `Restrict` | Consider nullable if system invites are needed. |
| `ClientPortalInvitation.acceptedByClientPortalUser` | `ClientPortalUser` | No | `SetNull` | Preserve invite history. |
| `ClientPortalFeatureSettings.client` | `Client` | Yes | `Restrict` | Settings should not be orphaned silently. |
| `ClientPortalFeatureSettings.updatedByInternalUser` | `User` | No | `SetNull` | Preserve settings if updater removed. |
| `ClientPortalAuditEvent.client` | `Client` | No | `SetNull` | Do not delete audit events. |
| `ClientPortalAuditEvent.actorClientPortalUser` | `ClientPortalUser` | No | `SetNull` | Do not delete audit events. |
| `ClientPortalAuditEvent.actorInternalUser` | `User` | No | `SetNull` | Do not delete audit events. |

Principles:

- No cascade delete for audit events.
- Revoked users/memberships remain auditable.
- Feature settings are one row per client.
- Existing clients remain portal-off unless later settings/backfill explicitly creates an off row.

## 7. Index and constraint review

| Model | Index/constraint | Purpose | Risk | Required in CP-SCHEMA-1? |
| --- | --- | --- | --- | --- |
| `ClientPortalUser` | `@@index([email])` | login/invite lookup | Email normalization required | Yes |
| `ClientPortalUser` | `@@index([status])` | active/revoked lookup | Low | Yes |
| `ClientPortalUser` | provider/subject unique | external IdP uniqueness | Nullable uniqueness semantics; may be premature | Optional |
| `ClientPortalTeam` | `@@unique([clientId, name])` | prevent duplicate team names per client | Rename/history edge cases | Yes |
| `ClientPortalTeam` | `@@unique([clientId, code])` | stable external code | Nullable code uniqueness semantics | Optional |
| `ClientPortalTeam` | `@@index([clientId])` | team listing by client | Low | Yes |
| `ClientPortalMembership` | `@@index([clientPortalUserId])` | load memberships | Low | Yes |
| `ClientPortalMembership` | `@@index([clientId])` | client membership admin | Low | Yes |
| `ClientPortalMembership` | `@@index([teamId])` | team scope | Low | Yes if teams included |
| `ClientPortalMembership` | `@@index([status])` | active/revoked filters | Low | Yes |
| `ClientPortalMembership` | user/client/status composite | fast active membership check | Low | Yes |
| `ClientPortalMembership` | user/client/team/role unique | duplicate prevention | Too strict if revoke/reinvite history needed | Review before implementation |
| `ClientPortalInvitation` | `@@unique([tokenHash])` | secure invite acceptance | Hash collisions extremely unlikely | Yes |
| `ClientPortalInvitation` | `@@index([email, clientId])` | pending invite lookup | Email normalization required | Yes |
| `ClientPortalInvitation` | `@@index([status])` | invite admin queues | Low | Yes |
| `ClientPortalInvitation` | `@@index([expiresAt])` | expiration cleanup | Low | Yes |
| `ClientPortalFeatureSettings` | `clientId @unique` | one settings row per client | Low | Yes |
| `ClientPortalFeatureSettings` | `@@index([portalLevel])` | pilot/client rollout filtering | Low | Yes |
| `ClientPortalAuditEvent` | `@@index([clientId, createdAt])` | client audit timeline | Low | Yes |
| `ClientPortalAuditEvent` | actor indexes | actor audit lookup | Nullable actor refs; multiple actor types | Yes |
| `ClientPortalAuditEvent` | resource index | resource audit lookup | String resource type may need normalization | Yes |
| `ClientPortalAuditEvent` | action index | action filtering | String churn | Optional but useful |

## 8. Migration safety review

Why CP-SCHEMA-1 is additive and inert:

- It creates new tables only.
- It does not add required columns to existing populated tables.
- It does not alter existing route queries.
- It does not create case/document/communication visibility fields.
- It does not backfill grants or publications.
- Feature settings default to `OFF` and booleans default false.
- Existing `ENABLE_CLIENT_PORTAL` gate remains off until a separate implementation.
- No runtime code reads the new tables yet.

Must not be included in CP-SCHEMA-1:

- `Case.clientVisible` or similar fields;
- document visibility/client upload fields;
- communication publication fields;
- case grants;
- document grants;
- portal message/request/report tables;
- connector/integration tables;
- seed data;
- feature flag changes.

Apply/deploy safety:

- Future migration should be tested on an empty DB and clone/staging DB.
- Production apply should require explicit approval.
- No backend/frontend deploy is required just to add inert tables, unless generated client/runtime is intentionally deployed later.

## 9. Backfill/default-off strategy

Options for `ClientPortalFeatureSettings`:

### Option A — no backfill

- Create settings only for pilot clients.
- Lowest data-change footprint.
- Missing settings means portal off.
- Requires runtime to treat missing settings as off.

### Option B — backfill `portalLevel=OFF` for all clients

- Makes settings explicit for every client.
- More rows/data changes in first migration.
- Still safe if values are off/false.
- Slightly larger operational footprint.

### Option C — lazy-create settings

- Create settings when internal admin opens future portal settings page.
- Similar safety to no backfill.
- Requires runtime idempotent creation later.

Recommendation:

- For CP-SCHEMA-1, prefer Option A or C. Do not backfill all clients unless operations wants explicit rows for audit/control.
- Regardless of option, no client, case, document, or communication becomes visible.

Invitation/user/team seed strategy:

- No seed data in CP-SCHEMA-1.
- Pilot users and teams should be created later through explicit admin workflow or controlled script after route/policy implementation exists.

## 10. Future compatibility

CP-SCHEMA-1 supports later phases by providing:

- portal identities for future auth;
- memberships for client/account/team scoping;
- feature settings for per-client rollout under global gates;
- invitation lifecycle for controlled onboarding;
- audit events for future visibility/publication/download/upload/message/preview actions.

Future layers:

- case grants/publications can reference `Client`, `ClientPortalUser`, `ClientPortalTeam`, and `ClientPortalRole`;
- document grants/publications can use the same membership/team/role scope concepts;
- client requests can link to `ClientPortalUser`, `ClientPortalTeam`, and later `Case`;
- monthly report snapshots can use `clientId`, publication status, and audit events;
- external workflow connectors can use `ClientPortalActorType.CONNECTOR` and later connector IDs without being forced into human user tables;
- internal preview can audit internal user actor plus client/resource context.

## 11. Risk register

| Risk | Severity | Mitigation | Status before implementation |
| --- | --- | --- | --- |
| Wrong client/account anchor chosen | Critical | Use `Client`; verify schema/production DB before migration | Resolved by current schema review, still confirm with drift audit |
| Unique constraints too strict | High | Avoid global email unique initially; review membership unique vs history needs | Must resolve before schema edit |
| Enum churn | Medium | Use enums for stable statuses/roles; strings for audit action/resource | Acceptable for v1 draft |
| Nullable actor refs weaken audit | Medium | Require at least one actor identity at runtime; DB may allow null for system/failure events | Runtime validation required later |
| Cascade delete losing audit | Critical | Use `SetNull`/`Restrict`; no cascade on audit | Resolved in draft |
| Email uniqueness problems | Medium | Normalize email; index email; provider subject unique optional | Must resolve with auth provider choice |
| Memberships allowing access without grants | High | Membership only identifies scope; no case/document access until later grants/publications | Resolved by scope separation |
| Feature settings accidentally enabling portal | Critical | Defaults `OFF`/false; env gate still required | Resolved in draft |
| Migration naming conventions mismatch | Medium | Use `@@map("client_portal_*")`, string UUID, `createdAt`/`updatedAt` | Resolved by convention review |
| Connector actors forced into human model | High | Use audit `actorConnectorId` string placeholder; connector tables later | Acceptable for CP-SCHEMA-1 |
| Backfill creates perceived enablement | Medium | Prefer no backfill/lazy settings; missing means off | Recommendation set |
| Internal user deletion blocked by `Restrict` invite relation | Medium | Consider nullable inviter or `SetNull` if operations deletes users | Open question |

## 12. Required future tests

When CP-SCHEMA-1 is actually implemented, add/run:

Migration tests:

- Prisma validate passes.
- Prisma generate/typecheck passes.
- Migration applies cleanly to an empty DB.
- Migration applies cleanly to an existing DB clone.
- Post-apply introspection proves all six tables, enums, indexes, unique constraints, and FKs.

Safety/default tests:

- no existing API response shape changes;
- existing backend test suite still passes;
- client portal feature-off routes still return `501 CLIENT_PORTAL_NOT_ENABLED`;
- creating no settings rows means portal remains off;
- settings row defaults `portalLevel=OFF` and all feature booleans false.

Query examples/tests:

- membership lookup by portal user/client/status is possible;
- invite lookup by token hash is unique;
- invitation email/client lookup works;
- feature settings lookup by client is unique;
- audit event can be created for client user actor;
- audit event can be created for internal user actor;
- audit event can be created for system/connector placeholder actor.

No-visibility tests:

- no case grants exist;
- no document grants exist;
- no communication publications exist;
- no existing case/document/communication becomes visible by migration alone.

## 13. Implementation readiness checklist

Before creating the real migration:

- Confirm branch and clean working tree.
- Run read-only DB drift audit for `clients`, `users`, and existing enum/table naming.
- Decide whether `ClientPortalUser.email` should be unique or indexed only.
- Decide whether provider/external subject uniqueness belongs in CP-SCHEMA-1.
- Decide membership uniqueness strategy: normal `@@unique` vs SQL partial unique active index vs no unique.
- Decide whether `ClientPortalTeam` is needed in CP-SCHEMA-1 or deferred.
- Decide whether `invitedByInternalUserId` should be required or nullable.
- Decide enum vs string for `ClientPortalLevel`.
- Review Prisma relation backfield names for `Client` and `User`.
- Draft migration SQL and review indexes/FKs before applying anywhere.
- Apply to clone/staging first only.
- Confirm feature gate remains off.

## 14. Open questions

- Should `ClientPortalUser.email` be globally unique in v1, or only indexed with provider identity as true uniqueness?
- Should `authProvider` and `externalSubject` be required only after the auth provider is selected?
- Should `ClientPortalTeam` be separate from `ClientWorkgroup`, or deferred until team semantics are confirmed?
- Should membership allow multiple active roles for one user/client/team?
- Should membership history allow repeated revoke/reinvite rows for the same user/client/team/role?
- Should `ClientPortalInvitation.invitedByInternalUserId` be required, or should system invites be allowed later?
- Should audit `action` and `resourceType` remain strings or become enums once taxonomy stabilizes?
- Should CP-SCHEMA-1 include no backfill, pilot-only settings rows, or all-client `OFF` settings rows?
- Should feature settings be required for every client before runtime work begins?

## 15. Recommended next prompt

Recommended next step:

`Adminiculum — CLIENTPORTAL1D read-only DB drift audit for client portal schema foundation`

Purpose of the next step:

- read-only compare deployed/local DB shape for `clients`, `users`, existing enum/table naming, and migration history before creating any real CP-SCHEMA-1 migration file.

Do not create the migration until the drift audit and open questions above are resolved.

Final classification: `client_portal_v1_schema_migration_draft_review_documented_no_runtime_change`
