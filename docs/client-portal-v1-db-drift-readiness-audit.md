# Client Portal v1 DB Drift Readiness Audit

Classification target: `client_portal_v1_db_drift_readiness_audited_no_runtime_change_no_db_change`

Audit date: 2026-07-01

This is a read-only migration-readiness audit for the future inert Client Portal CP-SCHEMA-1 foundation. It does not edit `Backend/prisma/schema.prisma`, create a Prisma migration, run a mutating Prisma command, add API routes, add frontend UI, modify auth, enable the client portal, deploy, or change runtime behavior.

## 1. Executive summary

CP-SCHEMA-1 remains technically feasible as an additive, inert migration if it is kept to new Client Portal identity, membership, invitation, feature-settings, and audit tables.

Recommended future CP-SCHEMA-1 scope:

- `ClientPortalUser`
- `ClientPortalTeam`
- `ClientPortalMembership`
- `ClientPortalInvitation`
- `ClientPortalFeatureSettings`
- `ClientPortalAuditEvent`

Current readiness conclusion:

- `Client` is still the correct canonical ownership anchor.
- No existing Prisma schema model or committed migration defines the intended Client Portal CP-SCHEMA-1 tables.
- Local non-production DB introspection found no `client_portal_*` tables and no Client Portal enum types.
- The future migration should be additive-only and default-off; no existing case, document, communication, time entry, or task becomes client-visible by default.
- One migration-history hygiene issue is blocking for any future generated/applied migration workflow: a local/repo migration directory named `20260515190000_add_lawyer_handoff_package` exists without `migration.sql`, causing `prisma migrate status` to fail with `P3015`.
- Local DB drift exists: the local `localhost/adminiculum` database is behind the latest committed migrations and does not include the newest communication/outlook provider columns from the current Prisma schema.

Blocking before CP-SCHEMA-1 implementation:

- Resolve or deliberately document the missing `migration.sql` for `20260515190000_add_lawyer_handoff_package` before creating a real migration candidate.
- Re-run read-only drift checks against the intended clone/staging target before applying any migration.

## 2. Scope and safety rules

Allowed in this audit:

- inspect source files and docs;
- inspect `Backend/prisma/schema.prisma`;
- inspect existing migration folders;
- run read-only Prisma validation/typecheck/test commands;
- run read-only SQL against a clearly local/non-production database;
- produce this docs report.

Not done:

- no schema edit;
- no migration creation;
- no migration apply;
- no `prisma migrate dev`;
- no `prisma migrate deploy`;
- no `prisma db push`;
- no database writes;
- no API route changes;
- no frontend changes;
- no auth changes;
- no Azure setting changes;
- no deploy.

## 3. Migration history inventory

Committed migration chain observed under `Backend/prisma/migrations`:

1. `20260211153100_baseline`
2. `20260212180000_add_workload_tracking`
3. `20260330120000_add_generation_drafts`
4. `20260331090100_add_anonymous_documents`
5. `20260331100000_add_rehydration_fields`
6. `20260402131500_add_client_identity_fields`
7. `20260405183100_add_case_client_role`
8. `20260406120000_add_client_color`
9. `20260408140000_add_case_collaborators`
10. `20260416175000_add_comparison_snapshot_foundation`
11. `20260417100000_add_timesheet_report_instances`
12. `20260417113000_add_timesheet_report_artifacts`
13. `20260417123000_add_timesheet_presets`
14. `20260514201500_add_legal_analyses`
15. `20260515190000_add_lawyer_handoff_package`
16. `20260517175500_add_client_house_style_profile`
17. `20260517191600_add_client_house_style_header_fields`
18. `20260518120000_add_workspace_text`
19. `20260622150000_add_lawyer_handoff_packages_foundation`
20. `20260628190000_add_communication_baseline`
21. `20260701120000_add_outlook_communication_provider_fields`

Latest committed migration: `20260701120000_add_outlook_communication_provider_fields`.

Package scripts:

- `prisma:migrate`: `prisma migrate dev` — mutating; not used.
- `db:status`: `prisma migrate status` — read-only, but currently fails because of a missing migration file.
- `db:deploy`: `prisma migrate deploy` — mutating; not used.
- `db:bootstrap`: `prisma db push` — mutating; not used.

Migration hygiene finding:

- The directory `Backend/prisma/migrations/20260515190000_add_lawyer_handoff_package` exists locally but has no `migration.sql`.
- `git ls-files Backend/prisma/migrations` does not list a SQL file for that migration.
- `npx prisma migrate status` fails with `P3015` because Prisma cannot find `prisma/migrations/20260515190000_add_lawyer_handoff_package/migration.sql`.
- The local `_prisma_migrations` table reports `20260515190000_add_lawyer_handoff_package` as applied.

Impact:

- This does not require changing runtime code.
- It is a migration-readiness blocker because Prisma migration status/generation workflows expect every migration folder to contain its SQL file.
- Before CP-SCHEMA-1, decide whether the missing historical file must be restored, removed from local filesystem if it is only an empty local artifact, or reconciled through an explicit migration-history hygiene task.

## 4. Current schema anchor review

Canonical client/account anchor: `Client`.

Observed `Client` shape:

- model name: `Client`
- table mapping: `@@map("clients")`
- primary key: `id String @id @default(uuid())`
- timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- direct relations: `cases`, `documents`, `departments`, `matters`, `workgroups`, `redactorProfile`, `houseStyleProfile`

Ownership paths:

- `Case.clientId -> Client.id`
- `Document.caseId -> Case.id`
- `Document.clientId -> Client.id`
- `Task.caseId -> Case.id`
- `Task.matterId -> Matter.id` when present
- `Communication.caseId` and `Communication.clientId` exist as nullable scalar links; current schema does not define explicit `Client`/`Case` relations for them.

Related models and conventions:

- `User` maps to `users`; `id` is string UUID; `email` is unique.
- `ClientWorkgroup` maps to `client_workgroups`; `clientId` cascades on delete and is unique by `[clientId, name]`.
- `Department` maps to `departments`; `clientId` cascades on delete and is unique by `[clientId, name]`.
- `Matter` maps to `matters`; links to `Client` and optionally `Department`.
- `Case` maps to `cases`; links to `Client`, optional `Matter`, creator `User`, and optional assigned lawyer `User`.
- `Document` maps to `documents`; links to `Case` and `Client`.
- `Task` maps to `tasks`; links to `Case`, optional `Matter`, optional assigned users, and optional source communication.
- `Communication` maps to `communications`; provider fields exist in Prisma schema, and `caseId`, `clientId`, and `documentId` are nullable scalars.

Safety conclusion:

- `Client` is safe as the CP-SCHEMA-1 membership/settings anchor.
- `clientId` alone must not grant access to cases/documents/communications.
- Later visibility must use explicit grants/publications and client-safe DTOs.

Recommended future relation names:

- `Client.portalTeams`
- `Client.portalMemberships`
- `Client.portalInvitations`
- `Client.portalFeatureSettings`
- `Client.portalAuditEvents`
- `User.clientPortalInvitationsSent`
- `User.clientPortalMembershipInvites`
- `User.clientPortalMembershipApprovals`
- `User.clientPortalFeatureSettingsUpdates`
- `User.clientPortalAuditEvents`

## 5. Naming and collision check

Schema and repository search found no existing implementation of:

- `ClientPortalUser`
- `ClientPortalTeam`
- `ClientPortalMembership`
- `ClientPortalInvitation`
- `ClientPortalFeatureSettings`
- `ClientPortalAuditEvent`
- `ClientPortalRole`
- `ClientPortalLevel`
- `ClientPortalUserStatus`
- `ClientPortalMembershipStatus`
- `ClientPortalInvitationStatus`
- `ClientPortalActorType`
- `ClientPortalAuditAction`
- `ClientPortalResourceType`

Local DB read-only introspection found none of the future mapped tables:

- `client_portal_users`
- `client_portal_teams`
- `client_portal_memberships`
- `client_portal_invitations`
- `client_portal_feature_settings`
- `client_portal_audit_events`

Near-collisions:

- `ClientWorkgroup` / `client_workgroups`: existing internal workload grouping. Do not reuse as a portal security boundary unless product semantics are explicitly confirmed.
- `Department` / `departments`: internal client department model, not a portal security boundary.
- `UserRole.CLIENT`: existing internal user role value. Do not use internal `User` as the external portal identity model.
- Generic names like `Invitation`, `AuditEvent`, and `FeatureSettings` should remain portal-prefixed to avoid ambiguity.

Naming recommendation:

- Keep Prisma model names `ClientPortal*`.
- Map tables to explicit snake-case names `client_portal_*`.
- Keep indexes and constraints explicitly named to avoid collision and improve operational introspection.

## 6. Read-only DB drift check

DB connection used:

- source: `Backend/.env`
- target observed: host `localhost`, database `adminiculum`
- classification: local/non-production based on host

No production DB connection was used.

Read-only commands used:

- `npx prisma migrate status`
- Node + Prisma raw SQL metadata queries against `information_schema`, `pg_type`, `pg_enum`, `pg_indexes`, `pg_constraint`, and `_prisma_migrations`

No business data rows were queried.

Read-only local DB findings:

- Existing anchor tables found: `clients`, `users`, `cases`, `documents`, `communications`, `tasks`.
- Future Client Portal tables were absent.
- Future Client Portal enum types were absent.
- `UserRole` exists with `ADMIN`, `PARTNER`, `LAWYER`, `TRAINEE`, `LEGAL_ASSISTANT`, `CLIENT`, `EXTERNAL_REVIEWER`, `COLLAB_LAWYER`.
- `CommunicationType` exists with `EMAIL`, `PHONE`, `MEETING`, `LETTER`, `NOTE`.
- Local `clients.id`, `users.id`, `cases.clientId`, `documents.clientId`, and `documents.caseId` match expected text/string UUID-style assumptions.
- Local `tasks.sourceCommunicationId` exists and is nullable.

Local DB drift findings:

- `_prisma_migrations` latest applied migration is `20260518120000_add_workspace_text`.
- The repo latest migration is `20260701120000_add_outlook_communication_provider_fields`.
- Local DB is therefore behind the repo migration chain.
- Local `communications` lacks the newest provider columns present in `schema.prisma`, such as `externalMessageId`, `providerConversationId`, `mailboxAddress`, `direction`, `source`, `syncStatus`, `importedAt`, `metadata`, and `recipients`.
- Local `communications` has baseline indexes for `caseId/createdAt` and `clientId/createdAt`, but not the latest provider-conversation index from the current Prisma schema.
- `npx prisma migrate status` cannot complete because the historical `20260515190000_add_lawyer_handoff_package` folder has no SQL file.

Applied migration anomalies in local DB:

- `20260330120000_add_generation_drafts` appears once rolled back and once finished.
- Several early migrations have `has_logs=true`.
- This may be historical local reconciliation noise; it is not a CP-SCHEMA-1 blocker by itself, but it reinforces that local DB state should not be treated as production truth.

DB-level conclusion:

- Local DB confirms no client-portal object collision.
- Local DB is not aligned enough to be a final migration-apply proof target.
- Future CP-SCHEMA-1 should be tested against a clean local/clone DB after migration-history hygiene is resolved.

## 7. CP-SCHEMA-1 migration readiness

The future CP-SCHEMA-1 migration can remain safe if it is restricted to:

- creating new enums selected for stable security-critical states;
- creating new `client_portal_*` tables;
- adding indexes and FKs on those new tables;
- using `Client.id` and internal `User.id` references only where explicitly needed;
- leaving all existing populated tables unchanged.

It should not:

- add required fields to `clients`, `cases`, `documents`, `communications`, `tasks`, `users`, or `matters`;
- add visibility booleans to existing resources;
- backfill access grants;
- expose documents, communications, time entries, reviews, AI outputs, or SharePoint metadata;
- enable client portal runtime routes;
- depend on `UserRole.CLIENT` for external identity;
- query new tables from runtime code before feature gates and DTO policies exist.

Deployment risk is low only after:

- the missing historical migration file issue is resolved;
- a clone/staging DB read-only status check confirms the target has the expected migration state;
- the generated SQL is reviewed before apply;
- feature gates remain off.

## 8. FK and relation strategy

Recommended FK targets:

- `ClientPortalUser`: no FK to internal `User`; external identity is separate.
- `ClientPortalTeam.clientId -> Client.id`.
- `ClientPortalMembership.clientPortalUserId -> ClientPortalUser.id`.
- `ClientPortalMembership.clientId -> Client.id`.
- `ClientPortalMembership.teamId -> ClientPortalTeam.id` optional.
- `ClientPortalMembership.invitedByInternalUserId -> User.id` optional.
- `ClientPortalMembership.approvedByInternalUserId -> User.id` optional.
- `ClientPortalInvitation.clientId -> Client.id`.
- `ClientPortalInvitation.proposedTeamId -> ClientPortalTeam.id` optional.
- `ClientPortalInvitation.invitedByInternalUserId -> User.id`.
- `ClientPortalInvitation.acceptedByClientPortalUserId -> ClientPortalUser.id` optional.
- `ClientPortalFeatureSettings.clientId -> Client.id`.
- `ClientPortalFeatureSettings.updatedByInternalUserId -> User.id` optional.
- `ClientPortalAuditEvent.clientId -> Client.id` optional.
- `ClientPortalAuditEvent.actorClientPortalUserId -> ClientPortalUser.id` optional.
- `ClientPortalAuditEvent.actorInternalUserId -> User.id` optional.

Recommended `onDelete` posture:

- Do not cascade audit events.
- Prefer soft-state revocation for memberships and portal users.
- Preserve invitation history.
- Use `SetNull` for optional internal user references where history should survive user deletion.
- Use `Restrict` for required `Client` references unless product decides client deletion should explicitly purge inert portal configuration.
- Use `SetNull` for optional team references so team archival/deletion does not destroy membership/invitation history.

## 9. Enum readiness

Stable enough for Prisma enums:

- `ClientPortalUserStatus`
- `ClientPortalTeamStatus`
- `ClientPortalMembershipStatus`
- `ClientPortalRole`
- `ClientPortalInvitationStatus`
- `ClientPortalLevel`
- `ClientPortalDefaultCaseVisibilityPolicy`
- `ClientPortalActorType`

Consider string + validation instead of enum:

- `ClientPortalAuditAction`
- `ClientPortalResourceType`

Reason:

- security-critical role/status values benefit from typed Prisma enums;
- audit action/resource values may churn as later phases add requests, reports, publications, connectors, and uploads.

Enum risk:

- PostgreSQL enum value changes are operationally heavier than string expansion.
- Do not over-enumerate future resource kinds in CP-SCHEMA-1.

## 10. Backfill/default-off recommendation

Options:

- A: no backfill; create `ClientPortalFeatureSettings` only for pilot clients.
- B: backfill `ClientPortalFeatureSettings` with `portalLevel=OFF` for all existing clients.
- C: lazy-create feature settings when an internal admin opens portal settings for a client.

Recommendation for CP-SCHEMA-1:

- Prefer C, lazy-create settings, for the first implementation.

Rationale:

- avoids writing rows for every existing client during foundation migration;
- preserves default-off behavior;
- avoids implying portal enablement;
- keeps the inert migration purely structural;
- lets pilot/client rollout happen through explicit admin action later.

Invariant:

- no existing `Client` becomes portal-enabled;
- no existing `Case` becomes visible;
- no existing `Document` becomes visible;
- no existing `Communication` becomes visible;
- no existing `TimeEntry` or report becomes visible.

## 11. Future migration candidate checklist

Before creating CP-SCHEMA-1:

- [ ] Canonical `Client` anchor confirmed for the target DB.
- [ ] Missing `20260515190000_add_lawyer_handoff_package/migration.sql` issue resolved or explicitly reconciled.
- [ ] Target clone/staging DB migration status checked read-only.
- [ ] Naming conflicts checked for `client_portal_*` tables and `ClientPortal*` enums.
- [ ] Enum strategy selected.
- [ ] `ClientPortalTeam` inclusion confirmed or deliberately deferred.
- [ ] `ClientPortalUser.email` uniqueness strategy selected.
- [ ] Provider identity uniqueness strategy selected.
- [ ] Membership uniqueness/history strategy selected.
- [ ] FK `onDelete` strategy selected.
- [ ] Backfill/lazy settings strategy selected.
- [ ] Migration generated locally only.
- [ ] SQL reviewed before apply.
- [ ] `prisma validate` passes.
- [ ] Backend typecheck and tests pass.
- [ ] Local/clone migration apply tested if available.
- [ ] Feature gates remain off.
- [ ] No runtime route reads new tables yet.
- [ ] No frontend route exposes portal data yet.
- [ ] No deploy until reviewed.

## 12. Risk register

| Risk | Severity | Evidence found | Mitigation | Blocking before CP-SCHEMA-1 |
| --- | --- | --- | --- | --- |
| Missing historical migration SQL | High | `prisma migrate status` fails with `P3015` for `20260515190000_add_lawyer_handoff_package` | Restore/reconcile/remove local artifact through a dedicated hygiene task before migration generation/apply | Yes |
| Local DB behind repo schema | Medium | Local latest applied migration is `20260518120000_add_workspace_text`; repo latest is `20260701120000_add_outlook_communication_provider_fields` | Do not treat local DB as final target; use clean local/clone after migration hygiene | Yes for apply proof |
| Production/clone DB manual drift | High | Not checked in this audit; only local DB was queried | Run read-only introspection against intended clone/staging before apply | Yes |
| Wrong identity anchor | Critical | `UserRole.CLIENT` exists and could be confused with portal identity | Keep separate `ClientPortalUser` and portal middleware | Yes |
| `ClientWorkgroup` reused as portal team | Medium | Existing `ClientWorkgroup` is internal workload grouping | Use `ClientPortalTeam` unless product confirms reuse semantics | No, if separate table retained |
| Enum churn after migration | Medium | Portal workflow values may evolve | Use enums only for stable security states; strings for audit action/resource | No |
| Too-strict unique constraints | Medium | Email/provider/membership uniqueness still has open product questions | Decide uniqueness before SQL generation; avoid constraints that block reinvite/history | Yes |
| FK cascade deletes audit/history | High | Existing internal child tables sometimes cascade | Use `Restrict`/`SetNull`; do not cascade audit events | Yes |
| Feature settings imply enablement | High | Backfill could be misread as portal rollout | Use `portalLevel=OFF`; prefer lazy settings creation | Yes |
| Runtime accidentally queries inert tables | Medium | Future code could depend on tables before rollout policy | Keep CP-SCHEMA-1 schema-only; runtime ticket separate and gated | No for schema-only |
| Future grants assume missing fields | Medium | Grants/publications intentionally excluded | Keep CP-SCHEMA-2+ separate and explicit | No |

## 13. Blocking issues

Blocking before future CP-SCHEMA-1 implementation:

1. Resolve the missing `migration.sql` for `20260515190000_add_lawyer_handoff_package` or otherwise reconcile migration history before using Prisma migration workflows.
2. Run read-only clone/staging introspection against the actual future migration target.
3. Decide the still-open product/schema details:
   - `ClientPortalUser.email` uniqueness;
   - provider identity uniqueness;
   - whether `ClientPortalTeam` is included in CP-SCHEMA-1;
   - membership uniqueness/history behavior;
   - audit action/resource enum vs string.

Not blocking for docs-only planning:

- no existing Client Portal table collision was found;
- `Client` remains the correct anchor;
- additive inert table creation remains the safe direction.

## 14. Recommended next prompt

Recommended next prompt:

`Adminiculum — CLIENTPORTAL1E migration history hygiene preflight for client portal schema`

Suggested scope:

- no schema edit;
- no migration creation;
- no migration apply;
- inspect and reconcile the missing `20260515190000_add_lawyer_handoff_package/migration.sql` situation;
- confirm whether it is only an empty local folder artifact or a committed-history gap;
- re-run `prisma migrate status` only after the migration-history issue is resolved;
- then return to CP-SCHEMA-1 migration drafting.

Final classification:

`client_portal_v1_db_drift_readiness_audited_no_runtime_change_no_db_change`
