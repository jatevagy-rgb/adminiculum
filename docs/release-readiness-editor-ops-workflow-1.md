# Release Readiness: Editor / Ops / Workflow 1

Date: 2026-07-15
Branch: `hotfix/runtime-shape-20260308`
Current HEAD: `6800b13`
Deployment action: none
Readiness classification: `NO_GO_DEPLOYMENT_BASELINE_UNKNOWN`

## Executive summary

This package audits the accumulated editor, operations, workflow, client-portal-stub, and baseline-hardening work currently on `hotfix/runtime-shape-20260308`. It is intentionally documentation-only and does not authorize production deployment.

The release is **NO-GO** for deployment as-is because the exact last deployed frontend/backend baselines cannot be proven from repository deployment records alone, and the candidate range from the highest-confidence deployed baselines contains protected schema/migration/package changes. The current branch is therefore not a clean editor/ops/workflow-only release candidate.

## Baseline evidence

| Component | Last deployed commit | Current commit | Commit range | Number of commits | Confidence | Evidence |
|---|---:|---:|---|---:|---|---|
| Backend | `d950e87` | `6800b13` | `d950e87..6800b13` | 169 | Medium | Repo docs record `outlook_import_service_backend_deployed_gate_off_smoke_passed`; later backend deploy for Graph adapter is not proven in repo docs. |
| Frontend | `71e4293` | `6800b13` | `71e4293..6800b13` | 183 | Medium | Conversation/git history identify Case Review icon ligature deployment; no formal repo deployment ledger was found. |

Do not mark this release GO until the active App Service deployments or an authoritative deployment ledger prove the actual frontend and backend production commits.

## Included workflow/editor commits of primary interest

| Commit | Subject | Runtime area | Release note |
|---|---|---|---|
| `e132923` | feat: add workflow case center | Backend/frontend workflow | Case-centered workflow summary and matter center. |
| `4599b66` | feat: connect task and handoff workflows | Backend/frontend workflow | Task handoff and route linking. |
| `1499ad7` | feat: connect documents and communications workflow | Backend/frontend workflow | Document/communication source-task flow. |
| `2818b0b` | feat: add deadlines agenda and notifications workflow | Backend/frontend workflow | Agenda/deadline surfaces. |
| `d49d410` | feat: connect responsibility workload and time | Backend/frontend workflow | Responsibility, workload, time entry flow. |
| `77381ce` | feat: connect litigation and case lifecycle | Backend/frontend workflow | Litigation dossier and lifecycle context. |
| `a319255` | feat: add intake and matter opening workflow | Backend/frontend workflow | Intake queue and matter opening workflow. |
| `a8aca78` | feat: build professional contract editor | Frontend editor | Mode C export-only editor workbench. |
| `adb0161` | feat: prepare editor persistence and versioning | Backend/editor readiness | Capability/readiness only; no server save. |
| `77a90a7` | feat: add document editor docx interoperability | Frontend editor | Local DOCX import/export subset. |
| `a376a80` | feat: add editor template readiness bridge | Backend/frontend editor | Template capability panel/endpoint. |
| `d722f09` | feat: harden professional editor workflow | Backend/frontend editor | Static guards and quality hardening. |
| `b923f33` | feat: add document comments workflow | Backend/frontend editor | Comments workflow foundation. |
| `5f4e1c8` | feat: overhaul document editor workbench ux | Frontend editor | Viewport-bound workbench and scroll fix. |
| `92d280e` | feat: simplify operational pages ux | Frontend ops pages | Time/deadline/clause operational page cleanup. |
| `6800b13` | test: verify authenticated editor and ops ux | Tests/docs | Authenticated visual QA evidence. |

## Full backend-candidate commit range

Generated with `git log --reverse --oneline d950e87..HEAD`.

```text
2cf1594 feat(backend): add outlook graph adapter skeleton
8ce26c0 docs: close out communication outlook intake phase
25b5230 docs: audit client portal v1 security contract
f55b8d7 docs: plan client portal identity authorization split
8806975 docs: plan client portal schema migration split
38abffe docs: review client portal schema migration draft
c1e207c docs: audit client portal schema drift
44c0707 docs: preflight client portal migration history
6dc4caa docs: decide handoff migration history reconciliation
66e85a3 docs: preflight clean client portal migration target
921f618 docs: record clean client portal migration chain proof
d31f27a docs: define baseline bootstrap strategy
7cbd3bc docs: outline universal connector architecture
58a96e2 docs: define connector security boundaries
5a9fd33 docs: plan connector domain model split
ffb9026 docs: review connector migration draft
462b81c docs: add connector schema implementation preflight
6d65dc3 docs: design local-only baseline bootstrap
075c855 docs: inventory baseline objects for local bootstrap
71d7f07 docs: review historical baseline evidence
445cfb5 docs: plan production-like clone schema snapshot
e4543a2 docs: record blocked clone schema snapshot
f2e4049 docs: add clone connection handoff runbook
d095abc docs: update blocked clone snapshot attempt
3479e2b docs: align client portal tenant isolation
61fff1f docs: define tenant isolated portal API contract
f519347 docs: client portal DTO and publication boundary
1d30d5b docs: client portal publication artifact model split plan
a11d105 docs: client portal publication approval and audit workflow
065fd9e docs: client portal publication payload and validator design
fa16bfe docs: client portal read-path and grant-resolution design
2280473 docs: client portal write-path and submission boundary design
dcfc1d9 docs: client portal submission-to-publication triage workflow
19dc41a docs: client portal v1 security architecture consolidation
a51f9fe docs: cp-schema-1 baseline/proof unblocking preflight
8df1594 docs: record blocked clone snapshot execution (no clone connection)
ab2fd75 docs: record existing clone candidate discovery (read-only, still blocked)
9e3ab4f docs: record manual production-like clone snapshot findings
1b5d28c docs: clean clone snapshot whitespace
2985f6d docs: add CP-SCHEMA-1 implementation preflight
6fc5582 feat(prisma): draft CP-SCHEMA-1 candidate
f5d9fce docs: review CP-SCHEMA-1 migration SQL draft
1f43dab feat(prisma): add CP-SCHEMA-1 migration draft
015f859 docs: record cp schema 1 clone transactional proof
a6e91bb docs: add cp schema clone apply proof gate
0b46fca docs: cp-schema-1 clone apply proof blocked by migration history
9741bd9 docs: cp-schema-1 clone _prisma_migrations reconciliation plan
a00e017 docs: cp-schema-1 clone historical migration object checks (blocked)
bb32d2e docs: record operator-run clone historical migration object checks
b46b4d1 docs: cp-schema-1 clone divergence robust re-check plan and analysis
c8a5b11 docs: cp-schema-1 fresh PITR clone creation and handoff runbook
4b01b7c docs: record cp schema fresh clone no-go
d175816 docs: outline production migration history remediation options
f62d539 docs: classify production migration history divergence
b0fb99d docs: plan production-compatible prisma baseline reset
25e5a45 docs: add production schema snapshot runbook
0d82963 docs: record production schema snapshot comparison
3f70bcc docs: add production schema feature family decision memo
c506fc4 docs: propose production-compatible schema baseline
5543d49 docs: add production baseline decision sheet
ad69b95 docs: quarantine contracts generation family in baseline decisions
b7a9447 docs: quarantine temporary ops routes in baseline decisions
aad67ad docs: quarantine client portal boundary in baseline decisions
7288302 docs: quarantine document ai privacy boundary in baseline decisions
637bf3f docs: quarantine openapi cors exposure boundary
10ecf0f docs: quarantine partial schema drift leftovers
03be653 docs: roll up production baseline human decisions
a9c1a98 harden temporary ops routes
9c13114 harden openapi exposure boundary
0e5c681 harden production cors exposure
b986adf docs: roll up exposure hardening status
7925c0b harden client portal boundary
2310b03 harden contracts generation boundary
c5a9bfc harden document ai privacy boundary
0bcf5e0 docs: roll up privacy side effect hardening status
00cba47 docs: inventory partial schema drift leftovers
4c52841 docs: triage partial schema drift leftovers
29ed3b9 docs: compare production schema metadata read only
41f2ea3 docs: roll production schema compare into drift triage
c2d96c0 docs: audit generation status enum drift
c2069b3 docs: decide generation status enum drift lane
93a8ae1 docs: audit present compatible keep candidates
b5c2674 docs: keep clients color internal baseline
e8fb2d0 docs: audit case collaborators authorization
7177693 harden case collaborators authorization
49f2bdc docs: close out case collaborators hardening
c8b1c9f docs: keep case collaborators internal baseline
32ebbea docs: audit workload records exposure
f6836d7 harden workload records authorization
30f15d2 docs: close out workload records hardening
f7fa894 docs: keep workload records internal baseline
072c953 docs: audit client identity role fields
8a1a0df docs: decide cases client role semantics
e2a943a harden cases client role authorization
05791ef docs: close out cases client role hardening
37231da docs: keep cases client role internal baseline
8cea64c harden client identity fields authorization
ba09991 docs: close out client identity hardening
0b38225 docs: keep client identity internal baseline
cf61011 docs: audit documents workspace text privacy
4110b1f docs: design workspace text privacy model
d3f6bea harden documents workspace text authorization
f4e60aa docs: close out workspace text authorization
c136a34 docs: design workspace text retention
5c9b3ca docs: design workspace text logging guard
52fe3d6 harden workspace text logging guard
cee359f harden workspace text ai gate
7133d2c harden workspace text export boundary
f19c9fe harden workspace text external boundary
e57e5bd docs: close out workspace text blocked posture
582cb42 docs: roll up production compatible baseline
171a252 docs: reconfirm production apply no-go
1c2f8f1 docs: design client portal product boundary
9dd195e docs: inventory client portal current code
5d9899e docs: design client portal v1 data contract
104e7ee docs: design client portal authz model
ac5d014 docs: design client portal v1 ui ia
e4c73ca docs: design client portal schema readiness
b8669f0 docs: design client portal runtime skeleton boundary
bece82b docs: design client portal frontend shell
456ff47 docs: roll up client portal design
0f5d923 frontend: add mock client portal shell
3726567 frontend: polish mock client portal shell
8196f88 frontend: add mock client portal subroutes
2bf8f31 frontend: close out mock client portal routes
28e7c73 backend: harden disabled client portal skeleton
d6654cd docs: close out client portal runtime skeleton hardening
b89f715 types: add client portal dto foundation
99b4da8 frontend: polish mock client portal ux
964bd8f docs: close out mock client portal ux polish
d393d96 docs: checkpoint client portal implementation
f8c63de frontend: improve mock client portal accessibility
51b75ec docs: close out client portal accessibility pass
3bdab60 backend: add disabled client portal dto stubs
e9cc901 docs: close out client portal dto stubs
5d0f14e docs: design client portal schema candidate
f3e1ff9 docs: design client portal service boundary
85d83f8 frontend: review mock client portal demo
2e8656a backend: add disabled client portal service stubs
d6de123 backend: add disabled client portal route matrix
bcfa7e4 docs: checkpoint inert client portal api shell
2c41d54 docs: design client portal authz stubs
09f92d1 backend: add fail-closed client portal authz stubs
30fb1f7 docs: draft client portal cp schema migration plan
523ca1d docs: decide client portal schema model names
c7599cb docs: draft client portal schema field spec
9ef6231 docs: decide client portal schema enums and refs
78c549d docs: draft client portal schema relations and indexes
22558bd docs: checkpoint client portal schema readiness
4b124b4 docs: prepare client portal cp schema approval package
321c7fe docs: resolve client portal schema collision strategy
e958650 test: guard inert client portal shell
849d5f7 test: enforce client portal schema block
e132923 feat: add workflow case center
4599b66 feat: connect task and handoff workflows
1499ad7 feat: connect documents and communications workflow
2818b0b feat: add deadlines agenda and notifications workflow
d49d410 feat: connect responsibility workload and time
77381ce feat: connect litigation and case lifecycle
a319255 feat: add intake and matter opening workflow
a8aca78 feat: build professional contract editor
adb0161 feat: prepare editor persistence and versioning
77a90a7 feat: add document editor docx interoperability
a376a80 feat: add editor template readiness bridge
d722f09 feat: harden professional editor workflow
b923f33 feat: add document comments workflow
5f4e1c8 feat: overhaul document editor workbench ux
92d280e feat: simplify operational pages ux
6800b13 test: verify authenticated editor and ops ux
```

## Full frontend-candidate commit range

Generated with `git log --reverse --oneline 71e4293..HEAD`.

```text
2e6d010 docs: add frontend deploy env guard
5b1bbe9 chore(frontend): add production bundle env guard
0b7daed feat(frontend): link notification context targets
f436798 fix(frontend): align client detail collaborator chip
b70d85f fix(frontend): refine client detail secondary ui
00194a4 feat(frontend): surface communication intake triage
1fdf76a feat(frontend): add communication case assignment intake action
d6c3061 feat(frontend): add communication task intake action
ab5b96d feat(backend): create case from communication atomically
dc0780e feat(frontend): add communication create-case intake action
03d0854 feat(backend): add outlook communication provider fields
ccf992d feat(backend): add outlook import dry-run endpoint
59269eb feat(backend): add outlook mock import endpoint
d950e87 refactor(backend): extract outlook import service
2cf1594 feat(backend): add outlook graph adapter skeleton
8ce26c0 docs: close out communication outlook intake phase
25b5230 docs: audit client portal v1 security contract
f55b8d7 docs: plan client portal identity authorization split
8806975 docs: plan client portal schema migration split
38abffe docs: review client portal schema migration draft
c1e207c docs: audit client portal schema drift
44c0707 docs: preflight client portal migration history
6dc4caa docs: decide handoff migration history reconciliation
66e85a3 docs: preflight clean client portal migration target
921f618 docs: record clean client portal migration chain proof
d31f27a docs: define baseline bootstrap strategy
7cbd3bc docs: outline universal connector architecture
58a96e2 docs: define connector security boundaries
5a9fd33 docs: plan connector domain model split
ffb9026 docs: review connector migration draft
462b81c docs: add connector schema implementation preflight
6d65dc3 docs: design local-only baseline bootstrap
075c855 docs: inventory baseline objects for local bootstrap
71d7f07 docs: review historical baseline evidence
445cfb5 docs: plan production-like clone schema snapshot
e4543a2 docs: record blocked clone schema snapshot
f2e4049 docs: add clone connection handoff runbook
d095abc docs: update blocked clone snapshot attempt
3479e2b docs: align client portal tenant isolation
61fff1f docs: define tenant isolated portal API contract
f519347 docs: client portal DTO and publication boundary
1d30d5b docs: client portal publication artifact model split plan
a11d105 docs: client portal publication approval and audit workflow
065fd9e docs: client portal publication payload and validator design
fa16bfe docs: client portal read-path and grant-resolution design
2280473 docs: client portal write-path and submission boundary design
dcfc1d9 docs: client portal submission-to-publication triage workflow
19dc41a docs: client portal v1 security architecture consolidation
a51f9fe docs: cp-schema-1 baseline/proof unblocking preflight
8df1594 docs: record blocked clone snapshot execution (no clone connection)
ab2fd75 docs: record existing clone candidate discovery (read-only, still blocked)
9e3ab4f docs: record manual production-like clone snapshot findings
1b5d28c docs: clean clone snapshot whitespace
2985f6d docs: add CP-SCHEMA-1 implementation preflight
6fc5582 feat(prisma): draft CP-SCHEMA-1 candidate
f5d9fce docs: review CP-SCHEMA-1 migration SQL draft
1f43dab feat(prisma): add CP-SCHEMA-1 migration draft
015f859 docs: record cp schema 1 clone transactional proof
a6e91bb docs: add cp schema clone apply proof gate
0b46fca docs: cp-schema-1 clone apply proof blocked by migration history
9741bd9 docs: cp-schema-1 clone _prisma_migrations reconciliation plan
a00e017 docs: cp-schema-1 clone historical migration object checks (blocked)
bb32d2e docs: record operator-run clone historical migration object checks
b46b4d1 docs: cp-schema-1 clone divergence robust re-check plan and analysis
c8a5b11 docs: cp-schema-1 fresh PITR clone creation and handoff runbook
4b01b7c docs: record cp schema fresh clone no-go
d175816 docs: outline production migration history remediation options
f62d539 docs: classify production migration history divergence
b0fb99d docs: plan production-compatible prisma baseline reset
25e5a45 docs: add production schema snapshot runbook
0d82963 docs: record production schema snapshot comparison
3f70bcc docs: add production schema feature family decision memo
c506fc4 docs: propose production-compatible schema baseline
5543d49 docs: add production baseline decision sheet
ad69b95 docs: quarantine contracts generation family in baseline decisions
b7a9447 docs: quarantine temporary ops routes in baseline decisions
aad67ad docs: quarantine client portal boundary in baseline decisions
7288302 docs: quarantine document ai privacy boundary in baseline decisions
637bf3f docs: quarantine openapi cors exposure boundary
10ecf0f docs: quarantine partial schema drift leftovers
03be653 docs: roll up production baseline human decisions
a9c1a98 harden temporary ops routes
9c13114 harden openapi exposure boundary
0e5c681 harden production cors exposure
b986adf docs: roll up exposure hardening status
7925c0b harden client portal boundary
2310b03 harden contracts generation boundary
c5a9bfc harden document ai privacy boundary
0bcf5e0 docs: roll up privacy side effect hardening status
00cba47 docs: inventory partial schema drift leftovers
4c52841 docs: triage partial schema drift leftovers
29ed3b9 docs: compare production schema metadata read only
41f2ea3 docs: roll production schema compare into drift triage
c2d96c0 docs: audit generation status enum drift
c2069b3 docs: decide generation status enum drift lane
93a8ae1 docs: audit present compatible keep candidates
b5c2674 docs: keep clients color internal baseline
e8fb2d0 docs: audit case collaborators authorization
7177693 harden case collaborators authorization
49f2bdc docs: close out case collaborators hardening
c8b1c9f docs: keep case collaborators internal baseline
32ebbea docs: audit workload records exposure
f6836d7 harden workload records authorization
30f15d2 docs: close out workload records hardening
f7fa894 docs: keep workload records internal baseline
072c953 docs: audit client identity role fields
8a1a0df docs: decide cases client role semantics
e2a943a harden cases client role authorization
05791ef docs: close out cases client role hardening
37231da docs: keep cases client role internal baseline
8cea64c harden client identity fields authorization
ba09991 docs: close out client identity hardening
0b38225 docs: keep client identity internal baseline
cf61011 docs: audit documents workspace text privacy
4110b1f docs: design workspace text privacy model
d3f6bea harden documents workspace text authorization
f4e60aa docs: close out workspace text authorization
c136a34 docs: design workspace text retention
5c9b3ca docs: design workspace text logging guard
52fe3d6 harden workspace text logging guard
cee359f harden workspace text ai gate
7133d2c harden workspace text export boundary
f19c9fe harden workspace text external boundary
e57e5bd docs: close out workspace text blocked posture
582cb42 docs: roll up production compatible baseline
171a252 docs: reconfirm production apply no-go
1c2f8f1 docs: design client portal product boundary
9dd195e docs: inventory client portal current code
5d9899e docs: design client portal v1 data contract
104e7ee docs: design client portal authz model
ac5d014 docs: design client portal v1 ui ia
e4c73ca docs: design client portal schema readiness
b8669f0 docs: design client portal runtime skeleton boundary
bece82b docs: design client portal frontend shell
456ff47 docs: roll up client portal design
0f5d923 frontend: add mock client portal shell
3726567 frontend: polish mock client portal shell
8196f88 frontend: add mock client portal subroutes
2bf8f31 frontend: close out mock client portal routes
28e7c73 backend: harden disabled client portal skeleton
d6654cd docs: close out client portal runtime skeleton hardening
b89f715 types: add client portal dto foundation
99b4da8 frontend: polish mock client portal ux
964bd8f docs: close out mock client portal ux polish
d393d96 docs: checkpoint client portal implementation
f8c63de frontend: improve mock client portal accessibility
51b75ec docs: close out client portal accessibility pass
3bdab60 backend: add disabled client portal dto stubs
e9cc901 docs: close out client portal dto stubs
5d0f14e docs: design client portal schema candidate
f3e1ff9 docs: design client portal service boundary
85d83f8 frontend: review mock client portal demo
2e8656a backend: add disabled client portal service stubs
d6de123 backend: add disabled client portal route matrix
bcfa7e4 docs: checkpoint inert client portal api shell
2c41d54 docs: design client portal authz stubs
09f92d1 backend: add fail-closed client portal authz stubs
30fb1f7 docs: draft client portal cp schema migration plan
523ca1d docs: decide client portal schema model names
c7599cb docs: draft client portal schema field spec
9ef6231 docs: decide client portal schema enums and refs
78c549d docs: draft client portal schema relations and indexes
22558bd docs: checkpoint client portal schema readiness
4b124b4 docs: prepare client portal cp schema approval package
321c7fe docs: resolve client portal schema collision strategy
e958650 test: guard inert client portal shell
849d5f7 test: enforce client portal schema block
e132923 feat: add workflow case center
4599b66 feat: connect task and handoff workflows
1499ad7 feat: connect documents and communications workflow
2818b0b feat: add deadlines agenda and notifications workflow
d49d410 feat: connect responsibility workload and time
77381ce feat: connect litigation and case lifecycle
a319255 feat: add intake and matter opening workflow
a8aca78 feat: build professional contract editor
adb0161 feat: prepare editor persistence and versioning
77a90a7 feat: add document editor docx interoperability
a376a80 feat: add editor template readiness bridge
d722f09 feat: harden professional editor workflow
b923f33 feat: add document comments workflow
5f4e1c8 feat: overhaul document editor workbench ux
92d280e feat: simplify operational pages ux
6800b13 test: verify authenticated editor and ops ux
```

## Blocking findings

- `Backend/prisma/schema.prisma` changed in the candidate range.
- `Backend/prisma/migrations/20260702140000_add_client_portal_foundation/migration.sql` exists in the candidate range.
- `Frontend/package.json` and `Frontend/package-lock.json` changed in the candidate range.
- Client Portal runtime stubs and mock frontend routes are present in the candidate range, although the portal remains parked/gated.
- OpenAPI/CORS/runtime-admin hardening changes are present.
- Backend audit currently reports advisories including one critical advisory; this package did not remediate dependencies.
- Last deployed baselines are not sufficiently proven for an approved deployment.
- Clean `NEXT_PUBLIC_BACKEND_BASE_URL=https://prod-env-verify.invalid` build passed the API/auth backend target guard, but broader artifact scan still found `http://localhost:3000` MSAL redirect values in 7 `.next` files because `.env.local` remained loaded. A production artifact must inject the full public auth redirect environment, not only the backend base URL.

## Schema and package proof

```text
A	Backend/prisma/migrations/20260702140000_add_client_portal_foundation/migration.sql
M	Backend/prisma/schema.prisma
```

```text
M	Frontend/package-lock.json
M	Frontend/package.json
```

## Data and migration safety

No migration was run, no database was contacted, no seed/backfill was executed, and no production data assumption was validated by this task. The candidate range contains schema and migration files, so deployment must remain blocked until a separate baseline decision either excludes these commits from a release branch or approves/proves their migration path.

## Release decision

Current decision: **NO-GO**.

Reason: deployment baseline unknown plus protected schema/migration/package changes in candidate range.

Next safe action: prove exact active production frontend/backend commits from Azure/App Service deployment records, then create a release branch or cherry-pick set that excludes CP-SCHEMA-1 and other blocked schema/migration work unless separately approved.

Additional build-artifact action: run the frontend production build with the complete production public environment (`NEXT_PUBLIC_BACKEND_BASE_URL`, MSAL client/tenant/scope, redirect URI, and post-logout redirect URI) and repeat both `npm run verify:prod-env` and a broader forbidden-string scan before any deploy approval.
