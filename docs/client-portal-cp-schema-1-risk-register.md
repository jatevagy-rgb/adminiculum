# Client Portal CP-SCHEMA-1 Risk Register

## Purpose

This is a **documentation-only** risk register for the future CP-SCHEMA-1 work and
the surrounding Client Portal surface. It makes no schema change, no migration, no
DB connection, no production apply, and no Client Portal enablement. **It does not
authorize implementation.**

## Risk table

| Risk | Severity | Likelihood | Area | Mitigation | Status |
| --- | --- | --- | --- | --- | --- |
| Accidental `workspaceText` exposure | Critical | Low | Privacy/schema/DTO | Absolute forbidden-field rule; allow-list DTOs/mappers; no-`workspaceText` tests already in place; no such column in the draft | Mitigated by design; enforce in every gate |
| Internal FK treated as visibility | Critical | Medium | Authz/schema | Frozen invariant (FK ≠ visibility); grant-check-before-service order; future grant-scoping tests | Frozen rule; tests pending implementation |
| Matter grant treated as document share | Critical | Medium | Authz | Separate `ClientPortalDocumentShare` model; frozen invariant; future share-required tests | Frozen rule |
| Internal user treated as portal principal | Critical | Low | Authz/identity | Separate `ClientPortalUser`; fail-closed `resolvePortalPrincipal`; frozen semantic rule | Frozen rule; stubs fail closed |
| Email match treated as authorization | High | Medium | Identity | Frozen rule (email ≠ access); grant required for every surface | Frozen rule |
| Over-broad Prisma `include` | High | Medium | Services | Explicit-`select`-only rule; future no-broad-include tests; mapper allow-lists | Rule frozen; tests pending |
| Raw Prisma row returned | High | Medium | Services/DTO | Mappers with explicit-field returns (no spread) already tested; services must return DTOs only | Partially mitigated (mapper tests exist) |
| Cascade deletes portal audit/history | High | Low | Schema | Draft avoids cascades; audit retention independent of subject deletion; explicit `onDelete` review gate | Draft avoids; review pending |
| Enum migration rollback difficulty | Medium | Medium | Schema/migration | Additive-first enums; legacy enum reconciliation reviewed; clone rehearsal | Open — legacy drift exists |
| Partial index unsupported or mis-modeled | Medium | High | Schema/Prisma | Documented Prisma limitation; raw SQL in migration or app-level enforcement; no plain `@@unique` on active grants | Documented; unresolved |
| External-safe ref collision | Medium | Low | Ref generator | Sufficient entropy + unique constraint + collision retry; generator design gate | Unresolved (generator not designed) |
| Predictable refs / enumeration | High | Low | Ref generator | Opaque non-sequential refs; non-enumeration policy; 404/403 strategy decision | Frozen principle; policy pending |
| Upload storage without virus scanning | Critical | Medium | Uploads | No live upload until storage + scanning design approved; `UNDER_REVIEW` status; no file input anywhere | Blocked by design (no upload exists) |
| Uploaded file auto-treated as internal Document | High | Medium | Uploads/documents | Draft has **no** `Document` relation on uploaded files; intake/review bridge is a separate future design | Mitigated in draft |
| Audit logs storing content | Critical | Low | Audit | Content-free-by-construction audit model (no content/Json columns in draft); bounded `reasonCode` | Mitigated in draft |
| SharePoint/storage path leakage | High | Medium | DTO/schema | `storageRef` internal-only; no path fields client-facing; forbidden-field tests | Frozen rule; mapper tests exist |
| Client-facing status leaking internal workflow | High | Medium | Publication | Publication layer with manually-sanitized fields; internal status never auto-published | Frozen rule |
| Production apply without clone rehearsal | Critical | Low | Migration/ops | Gate plan requires clone rehearsal before production; production apply NO-GO stands | Gated |
| Feature flags enabling too much | High | Low | Runtime gates | Triple runtime-ready gate; flag-insufficiency tests (`routeFeatureGuards`, matrix tests) already pass | Mitigated + tested |
| Frontend accidentally wired to internal API | High | Low | Frontend | No `fetch`/`@/lib/api` in portal tree; Static/SSG build proof; repeated safety scans | Mitigated + scanned each task |
| CORS/OpenAPI exposure before readiness | High | Low | API surface | No OpenAPI/CORS change allowed in portal tasks; explicit prohibition in every package | Mitigated by process |
| Legacy candidate block name collision (`ClientPortalUser`/`ClientPortalAuditEvent`) | Medium | High | Schema | Explicit replace/migrate/rename decision required before any patch; flagged in draft + approval packet | Open — needs human decision |

## Highest priority mitigations

1. Keep the **absolute no-`workspaceText` / no-raw-text rule** enforced by tests at
   every layer (already in place for mappers/services/authz/routes).
2. Enforce **grant-before-service order** — no data access without an explicit
   active grant check (authz stubs already fail closed).
3. Keep **document shares separate from matter grants** in schema, authz, and tests.
4. Resolve the **legacy candidate block collision** with an explicit human decision
   before any `schema.prisma` patch.
5. Decide the **partial-index strategy** for active-grant uniqueness (raw SQL vs
   app-level) before migration generation.
6. Design the **external-safe ref generator** (entropy, prefix, collision retry)
   before any schema patch.
7. Require **clone rehearsal + manual migration review** before anything touches a
   real database (production remains NO-GO regardless).
8. Keep **audit content-free by construction** — no content or unconstrained JSON
   columns, bounded `reasonCode` only.
9. Block **live upload** until storage + virus-scanning + retention design is
   approved (no file input exists anywhere today).
10. Keep the **triple feature gate and flag-insufficiency tests** green so no flag
    combination short of full readiness enables anything.

## Residual NO-GO items

- CP-SCHEMA-1 human approval missing;
- final schema patch not generated/reviewed;
- migration not generated/reviewed;
- clone rehearsal not done;
- rollback plan not accepted;
- retention / legal-hold policy unresolved;
- external auth provider unresolved;
- upload storage / virus scanning unresolved;
- message privilege/retention unresolved;
- external visibility review not done;
- **production apply NO-GO remains active**.

## Final statement

**This risk register does not authorize implementation.** CP-SCHEMA-1 remains
blocked; production apply remains NO-GO; Client Portal remains inert.
